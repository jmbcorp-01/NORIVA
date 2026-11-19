import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isApproved, type Stage } from "./pipeline";
import { LOCALES, PublishError, toPublishedPanels } from "./publish";
import { latestArtifacts, StudioError } from "./studio";

const { episodes, episodeAssets, series, decisionLedger, artifacts } = schema;

/** 회차를 공개해요: 검수 합격(승인)한 회차의 말풍선 결과를 한국어·영어 공개본으로 굳혀요. */
export async function publishEpisode(episodeId: string, actor: string, publishAt?: Date) {
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!ep) throw new StudioError("회차를 찾을 수 없어요");
  const latest = await latestArtifacts(ep.seriesId, ep.id);
  const as = (st: Stage) => (latest[st] ? { id: latest[st]!.id, stage: st, status: latest[st]!.status } : undefined);
  if (!isApproved(as("review"))) throw new StudioError("검수 단계를 승인해야 공개할 수 있어요");
  const lettering = latest.lettering;
  if (!lettering || !isApproved(as("lettering"))) throw new StudioError("승인된 말풍선 결과가 없어요");

  let rows;
  try {
    rows = LOCALES.map((locale) => ({ locale, panels: toPublishedPanels(lettering.body, locale) }));
  } catch (e) {
    if (e instanceof PublishError) throw new StudioError(e.message);
    throw e;
  }

  const when = publishAt ?? new Date();
  const scheduled = when.getTime() > Date.now() + 60_000;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(episodeAssets)
        .values({ episodeId, locale: r.locale, panels: r.panels, sourceArtifactId: lettering.id })
        .onConflictDoUpdate({
          target: [episodeAssets.episodeId, episodeAssets.locale],
          set: { panels: r.panels, sourceArtifactId: lettering.id, updatedAt: new Date() },
        });
    }
    await tx
      .update(episodes)
      .set({ status: scheduled ? "scheduled" : "published", publishAt: when, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId));
    await tx
      .update(series)
      .set({ status: "serializing", updatedAt: new Date() })
      .where(and(eq(series.id, ep.seriesId), inArray(series.status, ["planning", "production"])));
    await tx.insert(decisionLedger).values({
      artifactId: lettering.id,
      seriesId: ep.seriesId,
      actor,
      action: "publish",
      note: `${ep.number}화 ${scheduled ? `예약 공개 ${when.toISOString()}` : "공개"}`,
    });
  });
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
  for (const { body } of rows) {
    const b = body as { panels?: { image?: string }[]; characters?: { sheet?: string }[] };
    for (const p of b.panels ?? []) if (p.image) keys.add(p.image);
    for (const c of b.characters ?? []) if (c.sheet) keys.add(c.sheet);
  }
  return [...keys].slice(0, 24);
}
