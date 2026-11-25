import "server-only";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Locale } from "./publish";
import type { Credit } from "./credits";

const { series, episodes, episodeAssets, episodeTexts, seriesSources, sources, viewEvents, bookmarks, seriesCredits } = schema;

/** 독자에게 보이는 회차: 공개됐거나 예약 시각이 지난 회차 */
const visibleEpisode = and(inArray(episodes.status, ["published", "scheduled"]), lte(episodes.publishAt, sql`now()`));

export type ReaderSeries = {
  id: string;
  slug: string;
  title: string;
  genre: string;
  logline: string;
  rootNote: string;
  cover: string;
  days: string[];
  status: string;
  episodeCount: number;
  latestAt: Date | null;
  roots: { name: string; category: string }[];
  /** 검색용 다른 언어 제목 */
  altTitle: string;
  paid: boolean;
  waitFree: boolean;
  isDummy: boolean;
  latestNumber: number;
  format: "webtoon" | "novel";
};

function pick(ko: string, en: string, locale: Locale) {
  return locale === "en" ? en || ko : ko;
}

export async function listSeries(locale: Locale): Promise<ReaderSeries[]> {
  const rows = await db
    .select({
      s: series,
      count: sql<number>`count(${episodes.id})::int`,
      latestAt: sql<Date | null>`max(${episodes.publishAt})`,
      latestNumber: sql<number>`max(${episodes.number})::int`,
    })
    .from(series)
    .innerJoin(episodes, and(eq(episodes.seriesId, series.id), visibleEpisode))
    .groupBy(series.id)
    .orderBy(desc(sql`max(${episodes.publishAt})`));
  if (rows.length === 0) return [];
  const roots = await db
    .select({ seriesId: seriesSources.seriesId, name: sources.name, category: sources.category })
    .from(seriesSources)
    .innerJoin(sources, eq(sources.id, seriesSources.sourceId))
    .where(inArray(seriesSources.seriesId, rows.map((r) => r.s.id)));
  return rows.map(({ s, count, latestAt, latestNumber }) => ({
    id: s.id,
    slug: s.slug,
    title: pick(s.title, s.titleEn, locale),
    genre: s.genre,
    logline: pick(s.logline, s.loglineEn, locale),
    rootNote: pick(s.rootNote, s.rootNoteEn, locale),
    cover: s.coverUrl,
    days: s.scheduleDays,
    status: s.status,
    episodeCount: count,
    latestAt: latestAt ? new Date(latestAt) : null,
    roots: roots.filter((r) => r.seriesId === s.id).map((r) => ({ name: r.name, category: r.category })),
    altTitle: locale === "en" ? s.title : s.titleEn,
    paid: s.paid,
    waitFree: s.waitFree,
    isDummy: s.isDummy,
    latestNumber,
    format: s.format,
  }));
}

/** 이번 주(7일) 많이 본 작품. 조회 기록이 아직 적으면 관심 수, 그다음 최신순으로 채워요. */
export async function weeklyRanking(all: ReaderSeries[], limit = 10): Promise<ReaderSeries[]> {
  if (all.length === 0) return [];
  const [views, saves] = await Promise.all([
    db
      .select({ id: viewEvents.seriesId, n: sql<number>`count(*)::int` })
      .from(viewEvents)
      .where(sql`${viewEvents.createdAt} > now() - interval '7 days'`)
      .groupBy(viewEvents.seriesId),
    db.select({ id: bookmarks.seriesId, n: sql<number>`count(*)::int` }).from(bookmarks).groupBy(bookmarks.seriesId),
  ]);
  const v = new Map(views.map((r) => [r.id, r.n]));
  const b = new Map(saves.map((r) => [r.id, r.n]));
  const at = (s: ReaderSeries) => s.latestAt?.getTime() ?? 0;
  return [...all].sort((x, y) => (v.get(y.id) ?? 0) - (v.get(x.id) ?? 0) || (b.get(y.id) ?? 0) - (b.get(x.id) ?? 0) || at(y) - at(x)).slice(0, limit);
}

/** 회차 조회 한 번 (순위 계산용). 실패해도 화면은 계속 보여줘요. */
export async function recordView(seriesId: string, episodeId: string, readerId: string | null) {
  await db.insert(viewEvents).values({ seriesId, episodeId, readerId }).catch(() => {});
}

/** 제목·한 줄 소개·뿌리 이름으로 찾아요. 작품 수가 적어서 화면 서버에서 걸러요. */
export function searchSeries(all: ReaderSeries[], q: string): ReaderSeries[] {
  const needle = q.trim().toLowerCase().normalize("NFC");
  if (!needle) return [];
  return all.filter((s) =>
    [s.title, s.altTitle, s.logline, s.genre, ...s.roots.map((r) => r.name)].some((f) => f.toLowerCase().normalize("NFC").includes(needle)),
  );
}

export async function getSeries(slug: string, locale: Locale) {
  const [s] = await db.select().from(series).where(eq(series.slug, slug));
  if (!s) return null;
  const [eps, roots] = await Promise.all([
    db
      .select({
        id: episodes.id,
        number: episodes.number,
        title: episodes.title,
        titleEn: episodes.titleEn,
        publishAt: episodes.publishAt,
        priceCoins: episodes.priceCoins,
        earlyAccess: episodes.earlyAccess,
      })
      .from(episodes)
      .where(and(eq(episodes.seriesId, s.id), visibleEpisode))
      .orderBy(asc(episodes.number)),
    db
      .select({ name: sources.name, category: sources.category })
      .from(seriesSources)
      .innerJoin(sources, eq(sources.id, seriesSources.sourceId))
      .where(eq(seriesSources.seriesId, s.id)),
  ]);
  if (eps.length === 0) return null; // 공개된 회차가 없으면 독자에게 보이지 않아요
  // 웹소설: 회차마다 읽는 시간 (한국어 공개본 기준)
  const minutes =
    s.format === "novel"
      ? new Map(
          (
            await db
              .select({ id: episodeTexts.episodeId, m: episodeTexts.readMinutes })
              .from(episodeTexts)
              .where(and(inArray(episodeTexts.episodeId, eps.map((e) => e.id)), eq(episodeTexts.locale, "ko")))
          ).map((r) => [r.id, r.m]),
        )
      : new Map<string, number>();
  return {
    id: s.id,
    slug: s.slug,
    title: pick(s.title, s.titleEn, locale),
    altTitle: locale === "en" ? s.title : s.titleEn,
    genre: s.genre,
    ageRating: s.brief.ageRating,
    logline: pick(s.logline, s.loglineEn, locale),
    rootNote: pick(s.rootNote, s.rootNoteEn, locale),
    cover: s.coverUrl,
    days: s.scheduleDays,
    status: s.status,
    roots,
    format: s.format,
    sale: { id: s.id, paid: s.paid, freeEpisodes: s.freeEpisodes, waitFree: s.waitFree, isDummy: s.isDummy, waitFreeExclude: s.waitFreeExclude, earlyPrice: s.earlyPrice },
    episodes: eps.map((e) => ({
      id: e.id,
      number: e.number,
      title: pick(e.title, e.titleEn, locale),
      publishAt: e.publishAt,
      priceCoins: e.priceCoins,
      earlyAccess: e.earlyAccess,
      readMinutes: minutes.get(e.id) ?? 0,
    })),
  };
}

export async function getEpisode(slug: string, number: number, locale: Locale) {
  const s = await getSeries(slug, locale);
  if (!s) return null;
  const idx = s.episodes.findIndex((e) => e.number === number);
  if (idx < 0) return null;
  const nav = { series: s, episode: s.episodes[idx], prev: s.episodes[idx - 1]?.number ?? null, next: s.episodes[idx + 1]?.number ?? null };
  if (s.format === "novel") {
    // 웹소설은 한국어부터 공개해요. 고른 언어 공개본이 없으면 한국어로 보여주고 알려요.
    const rows = await db
      .select({ locale: episodeTexts.locale, paragraphs: episodeTexts.paragraphs, readMinutes: episodeTexts.readMinutes })
      .from(episodeTexts)
      .where(and(eq(episodeTexts.episodeId, s.episodes[idx].id), inArray(episodeTexts.locale, [locale, "ko"])));
    const row = rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "ko");
    if (!row) return null;
    return { ...nav, kind: "novel" as const, paragraphs: row.paragraphs, readMinutes: row.readMinutes, textLocale: row.locale as Locale, panels: [] };
  }
  const [row] = await db
    .select({ panels: episodeAssets.panels, locale: episodeAssets.locale })
    .from(episodeAssets)
    .innerJoin(episodes, eq(episodes.id, episodeAssets.episodeId))
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(series.slug, slug), eq(episodes.number, number), eq(episodeAssets.locale, locale)));
  if (!row) return null;
  return { ...nav, kind: "webtoon" as const, panels: row.panels };
}

/** 독자에게 보이는 크레딧 (숨김 표시한 것은 빼요). 기본값을 새로 넣지 않고 읽기만 해요. */
export async function readerCredits(seriesId: string): Promise<Credit[]> {
  const rows = await db
    .select()
    .from(seriesCredits)
    .where(and(eq(seriesCredits.seriesId, seriesId), eq(seriesCredits.visible, true)))
    .orderBy(asc(seriesCredits.sort));
  return rows.map((r) => ({ ...r, label: r.label ?? "", aiTool: r.aiTool ?? "", basis: r.basis ?? "", note: "" }));
}

/** 회차 목록 작은 그림: 공개본 첫 컷 */
export async function episodeThumbs(seriesId: string, locale: Locale): Promise<Map<number, string>> {
  const rows = await db
    .select({ number: episodes.number, image: sql<string | null>`${episodeAssets.panels}->0->>'image'` })
    .from(episodeAssets)
    .innerJoin(episodes, eq(episodes.id, episodeAssets.episodeId))
    .where(and(eq(episodes.seriesId, seriesId), eq(episodeAssets.locale, locale)));
  return new Map(rows.filter((r) => r.image).map((r) => [r.number, r.image!]));
}

export async function bookmarkCount(seriesId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(bookmarks).where(eq(bookmarks.seriesId, seriesId));
  return r?.n ?? 0;
}

/** 회차 반응 수와 내 반응 */
export async function reactions(episodeId: string, readerId: string | null) {
  const { episodeReactions } = schema;
  const rows = await db
    .select({ kind: episodeReactions.kind, n: sql<number>`count(*)::int` })
    .from(episodeReactions)
    .where(eq(episodeReactions.episodeId, episodeId))
    .groupBy(episodeReactions.kind);
  const mine = readerId
    ? (await db.select({ kind: episodeReactions.kind }).from(episodeReactions).where(and(eq(episodeReactions.episodeId, episodeId), eq(episodeReactions.readerId, readerId))))[0]?.kind ?? null
    : null;
  const by = new Map(rows.map((r) => [r.kind, r.n]));
  return { fun: by.get("fun") ?? 0, meh: by.get("meh") ?? 0, mine };
}

/** 24시간 안에 올라온 회차가 있는지 (UP 표시) */
export function isFresh(at: Date | null | undefined): boolean {
  return Boolean(at && Date.now() - at.getTime() < 24 * 3600 * 1000);
}
