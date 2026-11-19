import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Notice, PageHeader } from "@/components/ui";
import { latestArtifacts } from "@/lib/studio";
import { EPISODE_STAGES, SERIES_STAGES, stageStates, STAGE_INFO, type LatestArtifact, type Stage } from "@/lib/pipeline";
import { StageBadge } from "@/components/stage-badge";
import { StageBoard } from "../../../stage-board";

export default async function EpisodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; number: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, number } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d+$/.test(number)) notFound();
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, id));
  const [ep] = await db
    .select()
    .from(schema.episodes)
    .where(and(eq(schema.episodes.seriesId, id), eq(schema.episodes.number, Number(number))));
  if (!s || !ep) notFound();
  const latest = await latestArtifacts(id, ep.id);
  const l: Partial<Record<Stage, LatestArtifact>> = {};
  for (const [k, v] of Object.entries(latest)) if (v) l[k as Stage] = { id: v.id, stage: k as Stage, status: v.status };
  const seriesStates = stageStates(SERIES_STAGES, l);
  const back = `/studio/series/${id}/episodes/${ep.number}`;

  return (
    <>
      <PageHeader
        title={`${ep.number}화${ep.title ? ` · ${ep.title}` : ""}`}
        sub={
          <>
            <Link href={`/studio/series/${id}`} className="text-indigo underline-offset-4 hover:underline">
              {s.title}
            </Link>
            {ep.logline ? <span> · {ep.logline}</span> : null}
          </>
        }
      />
      <Notice>{error}</Notice>
      <div className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-ink-soft">
        <span className="font-medium text-ink">작품 단계</span>
        {SERIES_STAGES.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            {STAGE_INFO[st].label} <StageBadge state={seriesStates[st]} />
          </span>
        ))}
      </div>
      <StageBoard stages={EPISODE_STAGES} latest={latest} seriesId={id} episodeId={ep.id} back={back} />
    </>
  );
}
