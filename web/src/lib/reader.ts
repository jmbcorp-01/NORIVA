import "server-only";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Locale } from "./publish";

const { series, episodes, episodeAssets, seriesSources, sources } = schema;

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
  return rows.map(({ s, count, latestAt }) => ({
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
  }));
}

export async function getSeries(slug: string, locale: Locale) {
  const [s] = await db.select().from(series).where(eq(series.slug, slug));
  if (!s) return null;
  const [eps, roots] = await Promise.all([
    db
      .select({ number: episodes.number, title: episodes.title, titleEn: episodes.titleEn, publishAt: episodes.publishAt })
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
    episodes: eps.map((e) => ({ number: e.number, title: pick(e.title, e.titleEn, locale), publishAt: e.publishAt })),
  };
}

export async function getEpisode(slug: string, number: number, locale: Locale) {
  const s = await getSeries(slug, locale);
  if (!s) return null;
  const idx = s.episodes.findIndex((e) => e.number === number);
  if (idx < 0) return null;
  const [row] = await db
    .select({ panels: episodeAssets.panels, locale: episodeAssets.locale })
    .from(episodeAssets)
    .innerJoin(episodes, eq(episodes.id, episodeAssets.episodeId))
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(series.slug, slug), eq(episodes.number, number), eq(episodeAssets.locale, locale)));
  if (!row) return null;
  return {
    series: s,
    episode: s.episodes[idx],
    panels: row.panels,
    prev: s.episodes[idx - 1]?.number ?? null,
    next: s.episodes[idx + 1]?.number ?? null,
  };
}
