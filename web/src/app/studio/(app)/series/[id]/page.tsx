import { ErrorNotice } from "@/components/error-notice";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Empty, Input, Label, Notice, PageHeader, Textarea } from "@/components/ui";
import { coverCandidates } from "@/lib/studio-publish";
import { mediaUrl } from "@/lib/media";
import { latestArtifacts } from "@/lib/studio";
import { isApproved, SERIES_STAGES, type Stage } from "@/lib/pipeline";
import { AGE_RATING, SERIES_STATUS, SOURCE_CATEGORY } from "@/lib/labels";
import { createEpisode, fillSeriesMeta, saveSeriesPublic } from "../../../actions";

const DAYS = [
  ["mon", "월"],
  ["tue", "화"],
  ["wed", "수"],
  ["thu", "목"],
  ["fri", "금"],
  ["sat", "토"],
  ["sun", "일"],
] as const;
import { StageBoard } from "../stage-board";

const EP_STATUS: Record<string, string> = { draft: "제작 중", review: "검수", approved: "승인", scheduled: "예약", published: "공개" };

export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; metaFilling?: string }>;
}) {
  const { id } = await params;
  const { error, saved, metaFilling } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, id));
  if (!s) notFound();
  const [latest, roots, episodes, covers] = await Promise.all([
    latestArtifacts(id, null),
    db
      .select({ id: schema.sources.id, name: schema.sources.name, category: schema.sources.category })
      .from(schema.seriesSources)
      .innerJoin(schema.sources, eq(schema.sources.id, schema.seriesSources.sourceId))
      .where(eq(schema.seriesSources.seriesId, id)),
    db.select().from(schema.episodes).where(eq(schema.episodes.seriesId, id)).orderBy(asc(schema.episodes.number)),
    coverCandidates(id),
  ]);
  const epIds = episodes.map((e) => e.id);
  const costs = epIds.length
    ? await db
        .select({ ep: schema.costLedger.episodeId, total: sql<string>`sum(${schema.costLedger.costUsd})` })
        .from(schema.costLedger)
        .where(inArray(schema.costLedger.episodeId, epIds))
        .groupBy(schema.costLedger.episodeId)
    : [];
  const reviews = epIds.length
    ? await db
        .selectDistinctOn([schema.artifacts.episodeId], { ep: schema.artifacts.episodeId, body: schema.artifacts.body })
        .from(schema.artifacts)
        .where(and(inArray(schema.artifacts.episodeId, epIds), eq(schema.artifacts.stage, "review")))
        .orderBy(schema.artifacts.episodeId, desc(schema.artifacts.createdAt))
    : [];
  const costOf = new Map(costs.map((c) => [c.ep, Number(c.total)]));
  const scoreOf = new Map(
    reviews.map((r) => [r.ep, r.body as { total?: number; passed?: boolean }]),
  );
  const [metaJob] = await db
    .select({ status: schema.jobs.status, error: schema.jobs.error })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.type, "series_meta"), eq(schema.jobs.seriesId, id)))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  const metaBusy = metaJob && (metaJob.status === "queued" || metaJob.status === "running");
  const toL = (st: Stage) => (latest[st] ? { id: latest[st]!.id, stage: st, status: latest[st]!.status } : undefined);
  const readyForEpisodes = isApproved(toL("story")) && isApproved(toL("characters"));
  const back = `/studio/series/${id}`;

  return (
    <>
      <PageHeader
        title={s.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {s.titleEn ? <span className="mr-1">{s.titleEn}</span> : null}
            <Badge>{s.genre}</Badge>
            <Badge>{AGE_RATING[s.brief.ageRating]}</Badge>
            <Badge tone="indigo">{SERIES_STATUS[s.status]}</Badge>
          </span>
        }
      />
      <ErrorNotice>{error}</ErrorNotice>
      {s.title === "제목 미정" ? (
        <Notice tone="ochre">
          아직 제목이 없어요. 오른쪽 아래 <a href="#settings" className="underline underline-offset-4">연재 설정</a>에서 직접 적거나 &ldquo;승인한 내용으로 AI가 채우기&rdquo;를 눌러 주세요. ③ 인물을 승인하면 AI가 자동으로 한 번 채워요.
        </Notice>
      ) : null}

      <div className="mb-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
        <span className="font-medium text-ink">뿌리</span>
        {roots.map((r) => (
          <Link key={r.id} href={`/studio/sources/${r.id}`} className="rounded-full border border-line-strong px-2.5 py-0.5 hover:bg-paper-sunk">
            {r.name} <span className="text-ink-faint">· {SOURCE_CATEGORY[r.category]}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="mb-3 text-[14px] font-semibold">작품 단계</h2>
          <StageBoard stages={SERIES_STAGES} latest={latest} seriesId={id} episodeId={null} back={back} />
        </section>

        <section>
          <h2 className="mb-3 text-[14px] font-semibold">회차</h2>
          {episodes.length === 0 ? (
            <Empty>스토리와 인물이 승인되면 회차를 만들 수 있어요.</Empty>
          ) : (
            <Card className="mb-4">
              <ul className="divide-y divide-line">
                {episodes.map((e) => (
                  <li key={e.id}>
                    <Link href={`${back}/episodes/${e.number}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk">
                      <span className="w-9 font-serif text-[15px] font-semibold tabular-nums">{e.number}화</span>
                      <span className="truncate text-[13px]">{e.title || e.logline || "제목 미정"}</span>
                      <span className="ml-auto flex items-center gap-3 text-[12px] text-ink-soft tabular-nums">
                        {typeof scoreOf.get(e.id)?.total === "number" ? (
                          <span className={scoreOf.get(e.id)?.passed ? "text-pine" : "text-plum"}>검수 {scoreOf.get(e.id)?.total}점</span>
                        ) : null}
                        {costOf.get(e.id) ? <span>${costOf.get(e.id)!.toFixed(2)}</span> : null}
                        <Badge tone={e.status === "published" ? "pine" : "neutral"}>{EP_STATUS[e.status]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {readyForEpisodes ? (
            <form action={createEpisode} className="mt-4 space-y-2">
              <input type="hidden" name="seriesId" value={id} />
              <label className="block">
                <Label hint="비워 두면 승인된 스토리에서 제목과 함께 자동으로 가져와요">다음 회차 한 줄 요약</Label>
                <Input name="logline" />
              </label>
              <Button type="submit" variant="primary" className="w-full">
                {episodes.length + 1}화 만들기
              </Button>
            </form>
          ) : null}

          <h2 id="settings" className="mb-3 mt-10 text-[14px] font-semibold">연재 설정</h2>
          {saved ? <p className="mb-2 text-[12px] text-pine">저장했어요. 독자 화면에 바로 반영돼요.</p> : null}
          {isApproved(toL("concept")) ? (
            <form action={fillSeriesMeta} className="mb-3">
              <input type="hidden" name="seriesId" value={id} />
              <Button type="submit" className="w-full" disabled={!!metaBusy}>
                {metaBusy ? "AI가 쓰는 중… (1~2분 뒤 새로고침)" : "승인한 내용으로 AI가 채우기"}
              </Button>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                승인한 기획안·스토리·인물을 읽고 제목, 한 줄 소개, 뿌리 노트를 한국어·영어로 써요. 비어 있는 칸만 채우니, 다시 쓰게 하려면 그 칸을 비우고 저장한 뒤 누르세요. 약 $0.1
              </p>
              {metaFilling && metaJob?.status === "done" ? <p className="mt-1 text-[12px] text-pine">채웠어요. 내용을 확인하고 고친 뒤 저장해 주세요.</p> : null}
              {metaJob?.status === "failed" ? <p className="mt-1 text-[12px] text-plum">채우기 실패: {metaJob.error}</p> : null}
            </form>
          ) : null}
          <form action={saveSeriesPublic} className="space-y-3">
            <input type="hidden" name="seriesId" value={id} />
            <label className="block">
              <Label hint="기획안에서 고른 제목을 적어요">제목</Label>
              <Input name="title" defaultValue={s.title === "제목 미정" ? "" : s.title} placeholder="예: 소금과 향" />
            </label>
            <label className="block">
              <Label>영어 제목</Label>
              <Input name="titleEn" defaultValue={s.titleEn} />
            </label>
            <label className="block">
              <Label hint="독자 화면 소개">한 줄 소개</Label>
              <Textarea name="logline" rows={2} defaultValue={s.logline} />
            </label>
            <label className="block">
              <Label>한 줄 소개 (영어)</Label>
              <Textarea name="loglineEn" rows={2} defaultValue={s.loglineEn} />
            </label>
            <label className="block">
              <Label hint="원전 이야기를 두세 문장으로">뿌리 노트</Label>
              <Textarea name="rootNote" rows={3} defaultValue={s.rootNote} />
            </label>
            <label className="block">
              <Label>뿌리 노트 (영어)</Label>
              <Textarea name="rootNoteEn" rows={3} defaultValue={s.rootNoteEn} />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-[12px] font-medium text-ink-soft">연재 요일</legend>
              <div className="flex flex-wrap gap-1">
                {DAYS.map(([v, label]) => (
                  <label key={v} className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-paper-sunk">
                    <input type="checkbox" name="scheduleDays" value={v} defaultChecked={s.scheduleDays.includes(v)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[12px] font-medium text-ink-soft">표지 {covers.length === 0 ? <span className="font-normal text-ink-faint">· 작화가 끝나면 그림 중에서 고를 수 있어요</span> : null}</legend>
              <div className="grid grid-cols-4 gap-1.5">
                {covers.map((k) => (
                  <label key={k} className="cursor-pointer">
                    <input type="radio" name="coverUrl" value={k} defaultChecked={s.coverUrl === k} className="peer sr-only" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(k)} alt="" className="aspect-[3/4] w-full rounded-[4px] border-2 border-transparent object-cover peer-checked:border-ink" loading="lazy" />
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="w-full">
              연재 설정 저장
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
