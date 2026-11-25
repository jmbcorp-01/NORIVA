import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isApproved, type Stage } from "./pipeline";
import { LOCALES, PublishError, toPublishedPanels } from "./publish";
import { latestArtifacts, StudioError } from "./studio";
import { protectSeriesPanels } from "./panel-media";
import { creditBlockers } from "./credits";
import { seriesCreditsOf } from "./credits-store";
import { novelChars, readMinutes, toNovelParagraphs } from "./novel-text";

const { episodes, episodeAssets, episodeTexts, series, decisionLedger, artifacts } = schema;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 회차를 공개해요.
 * - 웹툰: 검수 합격(승인)한 회차의 말풍선 결과를 한국어·영어 공개본(컷 목록)으로 굳혀요.
 * - 웹소설: 승인된 ⑦ 퇴고본을 한국어 공개본(문단 목록)으로 굳혀요 (07번 2단계).
 */
export async function publishEpisode(episodeId: string, actor: string, publishAt?: Date) {
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!ep) throw new StudioError("회차를 찾을 수 없어요");
  const [sr0] = await db.select({ format: series.format }).from(series).where(eq(series.id, ep.seriesId));
  const format = sr0?.format === "novel" ? "novel" : "webtoon";
  // 크레딧 관문 (07번 4절): 필수 항목이 비었거나 원작의 이용 근거가 없으면 공개하지 않아요
  const blockers = creditBlockers(await seriesCreditsOf(ep.seriesId, actor), format);
  if (blockers.length) throw new StudioError(`${blockers.join(". ")}. 작품 화면의 '크레딧'에서 고쳐 주세요`);
  const latest = await latestArtifacts(ep.seriesId, ep.id);
  const as = (st: Stage) => (latest[st] ? { id: latest[st]!.id, stage: st, status: latest[st]!.status } : undefined);

  let source: string;
  let write: (tx: Tx) => Promise<void>;
  if (format === "novel") {
    const copyedit = latest.copyedit;
    if (!copyedit || !isApproved(as("copyedit"))) throw new StudioError("⑦ 퇴고·교정을 승인해야 공개할 수 있어요");
    const md = (copyedit.body as { markdown?: unknown }).markdown;
    const paragraphs = typeof md === "string" ? toNovelParagraphs(md) : [];
    if (paragraphs.length < 3) throw new StudioError("퇴고본에 본문이 없어요. ⑦ 퇴고·교정 결과를 확인해 주세요");
    const chars = novelChars(paragraphs);
    source = copyedit.id;
    write = async (tx) => {
      const v = { paragraphs, chars, readMinutes: readMinutes(chars), sourceArtifactId: copyedit.id };
      await tx
        .insert(episodeTexts)
        .values({ episodeId, locale: "ko", ...v })
        .onConflictDoUpdate({ target: [episodeTexts.episodeId, episodeTexts.locale], set: { ...v, updatedAt: new Date() } });
    };
  } else {
    if (!isApproved(as("review"))) throw new StudioError("검수 단계를 승인해야 공개할 수 있어요");
    const lettering = latest.lettering;
    if (!lettering || !isApproved(as("lettering"))) throw new StudioError("승인된 말풍선 결과가 없어요");
    let rows: { locale: (typeof LOCALES)[number]; panels: ReturnType<typeof toPublishedPanels> }[];
    try {
      rows = LOCALES.map((locale) => ({ locale, panels: toPublishedPanels(lettering.body, locale) }));
    } catch (e) {
      if (e instanceof PublishError) throw new StudioError(e.message);
      throw e;
    }
    source = lettering.id;
    write = async (tx) => {
      for (const r of rows) {
        await tx
          .insert(episodeAssets)
          .values({ episodeId, locale: r.locale, panels: r.panels, sourceArtifactId: lettering.id })
          .onConflictDoUpdate({
            target: [episodeAssets.episodeId, episodeAssets.locale],
            set: { panels: r.panels, sourceArtifactId: lettering.id, updatedAt: new Date() },
          });
      }
    };
  }

  const when = publishAt ?? new Date();
  const scheduled = when.getTime() > Date.now() + 60_000;
  await db.transaction(async (tx) => {
    await write(tx);
    await tx
      .update(episodes)
      .set({ status: scheduled ? "scheduled" : "published", publishAt: when, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId));
    await tx
      .update(series)
      .set({ status: "serializing", updatedAt: new Date() })
      .where(and(eq(series.id, ep.seriesId), inArray(series.status, ["planning", "production"])));
    // 관심 작품에 담은 독자에게 새 회차 알림 (예약 공개면 공개 시각부터 보여요). 같은 회차 알림은 한 번만.
    const [sr] = await tx.select({ slug: series.slug, title: series.title }).from(series).where(eq(series.id, ep.seriesId));
    if (sr) {
      const href = `/series/${sr.slug}/${ep.number}`;
      await tx.execute(sql`
        insert into notifications (reader_id, kind, title, body, href, created_at)
        select b.reader_id, 'new_episode', ${`${sr.title} ${ep.number}화가 올라왔어요`}, ${ep.title ?? ""}, ${href}, ${when}
        from bookmarks b
        where b.series_id = ${ep.seriesId}
          and coalesce((select np.new_episode from notification_prefs np where np.reader_id = b.reader_id), true)
          and not exists (select 1 from notifications n where n.reader_id = b.reader_id and n.href = ${href})`);
    }
    await tx.insert(decisionLedger).values({
      artifactId: source,
      seriesId: ep.seriesId,
      actor,
      action: "publish",
      note: `${ep.number}화 ${scheduled ? `예약 공개 ${when.toISOString()}` : "공개"}`,
    });
  });
  // 유료 웹툰이면 공개본 그림을 비공개 저장소로 옮겨요 (독자에게는 서명 주소로만 보여줘요)
  const [s] = await db.select({ paid: series.paid }).from(series).where(eq(series.id, ep.seriesId));
  if (s?.paid && format === "webtoon") await protectSeriesPanels(ep.seriesId);
}

export async function unpublishEpisode(episodeId: string, actor: string) {
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!ep) throw new StudioError("회차를 찾을 수 없어요");
  await db.update(episodes).set({ status: "approved", updatedAt: new Date() }).where(eq(episodes.id, episodeId));
  await db.insert(decisionLedger).values({ seriesId: ep.seriesId, actor, action: "unpublish", note: `${ep.number}화 비공개` });
}

/** 표지로 고를 수 있는 그림: 이 작품의 작화 결과에 있는 컷 그림과 인물 시트 */
export async function coverCandidates(seriesId: string): Promise<string[]> {
  const rows = await db
    .select({ body: artifacts.body })
    .from(artifacts)
    .where(and(eq(artifacts.seriesId, seriesId), eq(artifacts.stage, "art"), inArray(artifacts.status, ["approved", "edited", "pending_review"])))
    .orderBy(desc(artifacts.createdAt))
    .limit(5);
  const keys = new Set<string>();
  // 지금 표지(올린 표지 포함)는 늘 맨 앞에 둬요. 빠지면 연재 설정을 저장할 때 표지가 지워져요
  const [cur] = await db.select({ cover: series.coverUrl }).from(series).where(eq(series.id, seriesId));
  if (cur?.cover) keys.add(cur.cover);
  for (const { body } of rows) {
    const b = body as { panels?: { image?: string }[]; characters?: { sheet?: string }[] };
    for (const p of b.panels ?? []) if (p.image) keys.add(p.image);
    for (const c of b.characters ?? []) if (c.sheet) keys.add(c.sheet);
  }
  return [...keys].slice(0, 24);
}
