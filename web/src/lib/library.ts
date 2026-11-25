import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Locale } from "./publish";
import { listSeries, type ReaderSeries } from "./reader";
import { sortFreshFirst } from "./reader-picks";

const { bookmarks, readingProgress, episodes, series } = schema;

export async function isBookmarked(readerId: string, seriesId: string) {
  const [r] = await db
    .select({ x: sql`1` })
    .from(bookmarks)
    .where(and(eq(bookmarks.readerId, readerId), eq(bookmarks.seriesId, seriesId)));
  return Boolean(r);
}

export async function bookmarkedSeries(readerId: string, locale: Locale): Promise<ReaderSeries[]> {
  const rows = await db.select({ id: bookmarks.seriesId }).from(bookmarks).where(eq(bookmarks.readerId, readerId)).orderBy(desc(bookmarks.createdAt));
  if (rows.length === 0) return [];
  const all = await listSeries(locale);
  const byId = new Map(all.map((s) => [s.id, s]));
  const list = rows.map((r) => byId.get(r.id)).filter((s): s is ReaderSeries => Boolean(s));
  return sortFreshFirst(list);
}

export type ContinueItem = { series: ReaderSeries; lastEpisode: number; nextEpisode: number | null; finishedLast: boolean };

/** 작품마다 가장 최근에 읽은 회차. 끝까지 봤으면 다음 화를, 아니면 그 화를 이어보기로 줘요. */
export async function continueReading(readerId: string, locale: Locale, limit = 10): Promise<ContinueItem[]> {
  const rows = await db.execute<{ series_id: string; number: number; max_panel: number; panel_count: number }>(sql`
    select distinct on (p.series_id) p.series_id, e.number, p.max_panel, p.panel_count
    from ${readingProgress} p join ${episodes} e on e.id = p.episode_id
    where p.reader_id = ${readerId}
    order by p.series_id, p.updated_at desc
  `);
  if (rows.rows.length === 0) return [];
  const all = await listSeries(locale);
  const byId = new Map(all.map((s) => [s.id, s]));
  const latestNumber = await db
    .select({ id: series.id, max: sql<number>`max(${episodes.number})::int` })
    .from(series)
    .innerJoin(episodes, and(eq(episodes.seriesId, series.id), sql`${episodes.status} in ('published','scheduled') and ${episodes.publishAt} <= now()`))
    .groupBy(series.id);
  const maxBy = new Map(latestNumber.map((r) => [r.id, r.max]));
  const order = await db
    .select({ seriesId: readingProgress.seriesId, at: sql<Date>`max(${readingProgress.updatedAt})` })
    .from(readingProgress)
    .where(eq(readingProgress.readerId, readerId))
    .groupBy(readingProgress.seriesId)
    .orderBy(desc(sql`max(${readingProgress.updatedAt})`));
  const rowBy = new Map(rows.rows.map((r) => [r.series_id, r]));
  const out: ContinueItem[] = [];
  for (const { seriesId } of order) {
    const s = byId.get(seriesId);
    const r = rowBy.get(seriesId);
    if (!s || !r) continue;
    const finished = r.panel_count > 0 && r.max_panel >= r.panel_count;
    const max = maxBy.get(seriesId) ?? r.number;
    out.push({ series: s, lastEpisode: r.number, nextEpisode: finished ? (r.number < max ? r.number + 1 : null) : r.number, finishedLast: finished });
    if (out.length >= limit) break;
  }
  return out;
}

/** 읽은 위치 기록: 더 멀리 읽었을 때만 올려요 */
export async function recordProgress(readerId: string, slug: string, number: number, maxPanel: number, panelCount: number) {
  const [ep] = await db
    .select({ id: episodes.id, seriesId: episodes.seriesId })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(series.slug, slug), eq(episodes.number, number), sql`${episodes.status} in ('published','scheduled') and ${episodes.publishAt} <= now()`));
  if (!ep) return false;
  const mp = Math.max(0, Math.min(maxPanel, panelCount, 10000));
  await db
    .insert(readingProgress)
    .values({ readerId, episodeId: ep.id, seriesId: ep.seriesId, maxPanel: mp, panelCount })
    .onConflictDoUpdate({
      target: [readingProgress.readerId, readingProgress.episodeId],
      set: { maxPanel: sql`greatest(${readingProgress.maxPanel}, ${mp})`, panelCount, updatedAt: new Date() },
    });
  return true;
}

/** 이 작품에서 마지막으로 읽은 회차 번호 */
export async function lastReadIn(readerId: string, seriesId: string): Promise<{ number: number; finished: boolean } | null> {
  const [r] = await db
    .select({ number: episodes.number, max: readingProgress.maxPanel, count: readingProgress.panelCount })
    .from(readingProgress)
    .innerJoin(episodes, eq(episodes.id, readingProgress.episodeId))
    .where(and(eq(readingProgress.readerId, readerId), eq(readingProgress.seriesId, seriesId)))
    .orderBy(desc(readingProgress.updatedAt))
    .limit(1);
  return r ? { number: r.number, finished: r.count > 0 && r.max >= r.count } : null;
}

/** 이 작품에서 읽은 회차 번호들 (끝까지 본 회차) */
export async function readNumbers(readerId: string, seriesId: string): Promise<Set<number>> {
  const rows = await db
    .select({ number: episodes.number })
    .from(readingProgress)
    .innerJoin(episodes, eq(episodes.id, readingProgress.episodeId))
    .where(and(eq(readingProgress.readerId, readerId), eq(readingProgress.seriesId, seriesId), sql`${readingProgress.maxPanel} >= ${readingProgress.panelCount}`));
  return new Set(rows.map((r) => r.number));
}
