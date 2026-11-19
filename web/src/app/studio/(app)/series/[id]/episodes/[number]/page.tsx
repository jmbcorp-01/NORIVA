import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Input, Notice, PageHeader } from "@/components/ui";
import { fillEpisodeMeta, publishEpisodeAction, saveEpisodeInfo } from "../../../../../actions";
import { latestArtifacts } from "@/lib/studio";
import { EPISODE_STAGES, isApproved, SERIES_STAGES, stageStates, STAGE_INFO, type LatestArtifact, type Stage } from "@/lib/pipeline";
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
  const [metaJob] = await db
    .select({ status: schema.jobs.status, error: schema.jobs.error })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.type, "episode_meta"), eq(schema.jobs.episodeId, ep.id)))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);

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
      <PublishCard
        title={ep.title}
        titleEn={ep.titleEn}
        episodeId={ep.id}
        status={ep.status}
        publishAt={ep.publishAt}
        ready={isApproved(l.review) && isApproved(l.lettering)}
        back={back}
        seriesId={id}
        metaStatus={metaJob?.status}
        metaError={metaJob?.error ?? null}
      />
      <StageBoard stages={EPISODE_STAGES} latest={latest} seriesId={id} episodeId={ep.id} back={back} />
    </>
  );
}

function PublishCard({
  title,
  titleEn,
  episodeId,
  status,
  publishAt,
  ready,
  back,
  seriesId,
  metaStatus,
  metaError,
}: {
  title: string;
  titleEn: string;
  episodeId: string;
  status: string;
  publishAt: Date | null;
  ready: boolean;
  back: string;
  seriesId: string;
  metaStatus?: string;
  metaError: string | null;
}) {
  const metaBusy = metaStatus === "queued" || metaStatus === "running";
  const live = status === "published" || status === "scheduled";
  const when = publishAt ? publishAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <Card className="mb-6 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-serif text-[15px] font-semibold">⑩ 연재</span>
        {live ? (
          <Badge tone="pine">{status === "scheduled" ? `예약 · ${when}` : `공개 중 · ${when}`}</Badge>
        ) : ready ? (
          <Badge tone="indigo">공개할 수 있어요</Badge>
        ) : (
          <span className="text-[12px] text-ink-faint">말풍선과 검수가 승인되면 공개할 수 있어요</span>
        )}
        {ready ? (
          <form action={publishEpisodeAction} className="ml-auto flex flex-wrap items-center gap-2">
            <input type="hidden" name="episodeId" value={episodeId} />
            <input type="hidden" name="back" value={back} />
            <label className="text-[12px] text-ink-soft">
              <span className="sr-only">공개 시각 (한국 시간, 비우면 지금)</span>
              <Input type="datetime-local" name="publishAt" className="w-[200px]" aria-describedby="publish-hint" />
            </label>
            <Button type="submit" variant={live ? "quiet" : "primary"}>
              {live ? "공개본 다시 만들기" : "공개하기"}
            </Button>
          </form>
        ) : null}
        {live ? (
          <form action={publishEpisodeAction}>
            <input type="hidden" name="episodeId" value={episodeId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="decision" value="unpublish" />
            <Button type="submit" variant="danger">
              비공개
            </Button>
          </form>
        ) : null}
      </div>
      {ready ? (
        <p id="publish-hint" className="mt-2 text-[12px] text-ink-faint">
          시각을 비우면 지금 공개해요. 한국어와 영어가 같은 시각에 공개돼요.
        </p>
      ) : null}
      <form action={saveEpisodeInfo} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input type="hidden" name="episodeId" value={episodeId} />
        <input type="hidden" name="back" value={back} />
        <Input name="title" defaultValue={title} placeholder="회차 제목" aria-label="회차 제목" className="min-w-[160px] flex-1" />
        <Input name="titleEn" defaultValue={titleEn} placeholder="Episode title (English)" aria-label="회차 영어 제목" className="min-w-[160px] flex-1" />
        <Button type="submit">제목 저장</Button>
      </form>
      <form action={fillEpisodeMeta} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="episodeId" value={episodeId} />
        <input type="hidden" name="seriesId" value={seriesId} />
        <input type="hidden" name="back" value={back} />
        <Button type="submit" disabled={metaBusy}>
          {metaBusy ? "스토리에서 가져오는 중… (1분 뒤 새로고침)" : "스토리에서 제목·요약 가져오기"}
        </Button>
        <span className="text-[12px] text-ink-faint">
          회차를 만들면 승인된 스토리의 회차 요약에서 자동으로 가져와요. 비어 있는 칸만 채우니, 다시 가져오려면 칸을 비우고 저장한 뒤 누르세요.
        </span>
        {metaStatus === "failed" ? <span className="w-full text-[12px] text-plum">가져오기 실패: {metaError}</span> : null}
      </form>
    </Card>
  );
}
