import { Button, Card, formatDate, Input, Textarea } from "@/components/ui";
import { StageBadge } from "@/components/stage-badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgressBar } from "@/components/job-progress";
import { activeJobs, type JobView, typicalSeconds } from "@/lib/progress";
import { canStart, type JobType, STAGE_HELP, STAGE_INFO, stageStates, type LatestArtifact, type Stage } from "@/lib/pipeline";
import type { Artifact } from "@/lib/studio";
import { fieldGroups } from "@/lib/artifact-fields";
import { decideArtifact, resumeJob, runStage } from "../../actions";
import { mediaUrl } from "./panel-views";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ArtView, isArtBody, isLetteredBody, LetteredView } from "./panel-views";
import { ImageModelPicker, isStyleBody, StyleRefs, StyleScout, StyleView } from "./style-view";
import { HistoryRefs, isSheetsBody, SheetsView } from "./sheets-view";
import { isResearchBody, ResearchView } from "./research-view";
import { CopyeditView, isCopyeditBody, isManuscriptBody, StatsLine } from "./novel-view";

type Props = {
  stages: Stage[];
  latest: Partial<Record<Stage, Artifact>>;
  seriesId: string;
  episodeId: string | null;
  back: string;
};

function toLatest(m: Partial<Record<Stage, Artifact>>) {
  const out: Partial<Record<Stage, LatestArtifact>> = {};
  for (const [k, v] of Object.entries(m)) if (v) out[k as Stage] = { id: v.id, stage: v.stage as Stage, status: v.status };
  return out;
}

/** 단계 진행 보드: 단계마다 상태, 최근 결과, 승인·반려·수정·다시 생성 */
export async function StageBoard({ stages, latest, seriesId, episodeId, back }: Props) {
  const l = toLatest(latest);
  const states = stageStates(stages, l);
  const generating = Object.values(latest).filter((a): a is Artifact => a?.status === "generating");
  const jobs = await activeJobs({ artifactIds: generating.map((a) => a.id) });
  const typical = await typicalSeconds(jobs.map((j) => j.type));
  // 실패한 결과물의 작업: '이어서 그리기'로 같은 작업을 다시 시작해요
  const failedIds = Object.values(latest).filter((a): a is Artifact => a?.status === "failed").map((a) => a.id);
  const failedJobs = failedIds.length
    ? await db
        .select({ id: schema.jobs.id, artifactId: schema.jobs.artifactId })
        .from(schema.jobs)
        .where(and(inArray(schema.jobs.artifactId, failedIds), eq(schema.jobs.status, "failed")))
    : [];
  const brief = stages.includes("style") || stages.includes("sheets")
    ? (await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId)))[0]?.brief
    : undefined;
  const styleRefs = brief?.styleRefs ?? [];
  const [scoutJob] = brief
    ? await db
        .select({ status: schema.jobs.status, error: schema.jobs.error, progress: schema.jobs.progress })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.type, "style_scout"), eq(schema.jobs.seriesId, seriesId)))
        .orderBy(desc(schema.jobs.createdAt))
        .limit(1)
    : [];
  const versionIds = [...new Set(Object.values(latest).flatMap((a) => a?.guidelineVersionIds ?? []))];
  const applied = new Map(
    (versionIds.length
      ? await db
          .select({
            id: schema.guidelineVersions.id,
            version: schema.guidelineVersions.version,
            body: schema.guidelineVersions.body,
            guidelineId: schema.guidelines.id,
            title: schema.guidelines.title,
            scope: schema.guidelines.scope,
            current: schema.guidelines.currentVersion,
          })
          .from(schema.guidelineVersions)
          .innerJoin(schema.guidelines, eq(schema.guidelines.id, schema.guidelineVersions.guidelineId))
          .where(inArray(schema.guidelineVersions.id, versionIds))
      : []
    ).map((v) => [v.id, v]),
  );
  const scoutBusy = !!scoutJob && (scoutJob.status === "queued" || scoutJob.status === "running");
  return (
    <ol className="space-y-3">
      <AutoRefresh active={generating.length > 0 || scoutBusy} />
      {stages.map((stage) => {
        const info = STAGE_INFO[stage];
        const a = latest[stage];
        const state = states[stage];
        const startable = canStart(stage, l);
        const reviewable = a && (a.status === "pending_review" || a.status === "stale");
        const editable = a && a.status !== "generating";
        const markdown = typeof a?.body?.markdown === "string" ? (a.body.markdown as string) : null;
        const open = state === "pending_review" || state === "stale" || state === "failed";
        return (
          <li key={stage}>
            <Card className={state === "locked" ? "opacity-60" : ""}>
              <details open={open} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5">
                  <span className="font-serif text-[15px] font-semibold">
                    {info.no} {info.label}
                  </span>
                  <span className="text-[12px] text-ink-faint">{info.desc}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {a && a.attempt > 1 ? <span className="text-[11px] text-ink-faint">{a.attempt}번째</span> : null}
                    <StageBadge state={state} />
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-4">
                  <StageHelp stage={stage} open={!a} />
                  {stage === "style" && state !== "locked" ? (
                    <>
                      <StyleScout
                        seriesId={seriesId}
                        back={back}
                        suggestions={brief?.styleSuggestions}
                        choice={brief?.styleChoice ?? []}
                        busy={scoutBusy}
                        error={scoutJob?.status === "failed" ? (scoutJob.error ?? "찾기에 실패했어요") : null}
                      />
                      <StyleRefs seriesId={seriesId} refs={styleRefs} own={brief?.ownArt ?? []} back={back} />
                      <ImageModelPicker seriesId={seriesId} back={back} current={brief?.imageModel} />
                    </>
                  ) : null}
                  {stage === "sheets" && state !== "locked" ? <HistoryRefs seriesId={seriesId} refs={brief?.historyRefs ?? []} back={back} /> : null}
                  {state === "locked" ? (
                    <p className="text-[13px] text-ink-faint">앞 단계가 승인되면 시작할 수 있어요.</p>
                  ) : null}

                  {a?.status === "generating" ? <Generating job={jobs.find((j) => j.artifactId === a.id)} typical={typical} /> : null}

                  {a?.status === "failed" ? (
                    <div className="mb-3">
                      <p className="text-[13px] text-plum">{String(a.body?.error ?? "생성에 실패했어요. 다시 생성해 주세요.")}</p>
                      <PartialResult body={a.body} back={back} jobId={failedJobs.find((j) => j.artifactId === a.id)?.id} />
                    </div>
                  ) : null}

                  {a?.status === "stale" ? (
                    <p className="mb-3 text-[13px] text-plum">
                      앞 단계가 바뀌어 낡은 결과예요. 그대로 다시 승인하거나, 새 입력으로 다시 생성하세요.
                    </p>
                  ) : null}

                  {a && a.status !== "generating" && a.status !== "failed" ? (
                    isCopyeditBody(a.body) ? (
                      <CopyeditView body={a.body} />
                    ) : isSheetsBody(a.body) ? (
                      <SheetsView
                        body={a.body}
                        artifactId={a.id}
                        seriesId={seriesId}
                        back={back}
                        canRedraw={a.status !== "stale" && canStart(stage, l)}
                      />
                    ) : isResearchBody(a.body) ? (
                      <ResearchView body={a.body} />
                    ) : isStyleBody(a.body) ? (
                      <StyleView body={a.body} artifactId={a.id} back={back} canApprove={!!reviewable} />
                    ) : isArtBody(a.body) ? (
                      <ArtView
                        body={a.body}
                        canRedraw={a.status !== "stale" && canStart(stage, l)}
                        artifactId={a.id}
                        seriesId={seriesId}
                        episodeId={episodeId}
                        back={back}
                      />
                    ) : isLetteredBody(a.body) ? (
                      <LetteredView body={a.body} />
                    ) : (
                      <>
                        {isManuscriptBody(a.body) ? <StatsLine stats={a.body.stats} fixed={a.body.length_fixed} /> : null}
                        <TextChecks checks={a.body.checks as TextCheck | undefined} />
                        <ArtifactView body={a.body} markdown={markdown} />
                      </>
                    )
                  ) : null}

                  {a ? (
                    <details className="mt-3 text-[11px] text-ink-faint">
                      <summary className="cursor-pointer">
                        {formatDate(a.updatedAt)} · {a.guidelineVersionIds.length ? `지침 ${a.guidelineVersionIds.length}개로 만들었어요 (눌러서 보기)` : "기본 지침으로 만들었어요"}
                      </summary>
                      <AppliedGuidelines ids={a.guidelineVersionIds} applied={applied} />
                    </details>
                  ) : null}

                  {reviewable ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <form action={decideArtifact}>
                        <Hidden back={back} artifactId={a.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <Button variant="seal" type="submit">
                          승인
                        </Button>
                      </form>
                      <form action={decideArtifact} className="flex min-w-[260px] flex-1 items-center gap-2">
                        <Hidden back={back} artifactId={a.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Input name="note" placeholder="반려 이유 (선택)" className="flex-1" />
                        <Button variant="danger" type="submit">
                          반려
                        </Button>
                      </form>
                    </div>
                  ) : null}

                  {startable && state !== "locked" ? (
                    <form action={runStage} className="mt-4 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="seriesId" value={seriesId} />
                      <input type="hidden" name="episodeId" value={episodeId ?? ""} />
                      <input type="hidden" name="stage" value={stage} />
                      <input type="hidden" name="back" value={back} />
                      <Input
                        name="instruction"
                        placeholder={a ? "다시 만들 때 바꿀 점 (예: 주인공을 더 냉소적으로)" : "에이전트에게 줄 추가 지시 (선택)"}
                        className="min-w-[240px] flex-1"
                      />
                      <Button type="submit" variant={a ? "quiet" : "primary"}>
                        {a ? "다시 생성" : "생성 시작"}
                      </Button>
                    </form>
                  ) : null}

                  {editable ? (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-[12px] text-indigo">직접 고치기</summary>
                      {markdown === null && fieldGroups(a.body).length ? (
                        <>
                          <FieldEditor a={a} back={back} />
                          <details className="mt-4">
                            <summary className="cursor-pointer text-[11px] text-ink-faint">고급: 원본 데이터 전체 고치기 (형식이 틀리면 저장되지 않아요)</summary>
                            <RawEditor a={a} back={back} markdown={markdown} />
                          </details>
                        </>
                      ) : (
                        <RawEditor a={a} back={back} markdown={markdown} />
                      )}
                    </details>
                  ) : null}
                </div>
              </details>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

/** 결과 전체(마크다운 또는 원본 데이터)를 그대로 고쳐요 */
function RawEditor({ a, back, markdown }: { a: Artifact; back: string; markdown: string | null }) {
  return (
    <form action={decideArtifact} className="mt-3 space-y-2">
      <Hidden back={back} artifactId={a.id} />
      <input type="hidden" name="decision" value="edit" />
      <input type="hidden" name="format" value={markdown !== null ? "markdown" : "json"} />
      <Textarea name="body" rows={16} defaultValue={markdown ?? JSON.stringify(a.body, null, 2)} className="font-mono text-[13px]" />
      <div className="flex flex-wrap gap-2">
        <Input name="note" placeholder="고친 이유 (제작 원장에 남아요)" className="min-w-[240px] flex-1" />
        <Button type="submit" variant="primary">
          고친 내용으로 승인
        </Button>
      </div>
    </form>
  );
}

/** 자주 고치는 칸(컷 설명, 대사, 말풍선 글)만 입력란으로. 저장하면 그 칸만 바꿔 승인해요. */
function FieldEditor({ a, back }: { a: Artifact; back: string }) {
  const groups = fieldGroups(a.body).filter((g) => g.rows.length);
  return (
    <form action={decideArtifact} className="mt-3 space-y-3">
      <Hidden back={back} artifactId={a.id} />
      <input type="hidden" name="decision" value="edit" />
      <input type="hidden" name="format" value="fields" />
      <ol className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {groups.map((g) => (
          <li key={g.index} className="rounded-[5px] border border-line px-3 py-2">
            <p className="text-[12px] font-semibold">{g.index}컷</p>
            {g.rows.map((r) => (
              <label key={r.name} className="mt-1.5 block text-[12px] text-ink-soft">
                {r.label}
                {r.long ? (
                  <Textarea name={r.name} rows={3} defaultValue={r.value} className="mt-0.5 text-[13px]" />
                ) : (
                  <Input name={r.name} defaultValue={r.value} className="mt-0.5 w-full text-[13px]" />
                )}
              </label>
            ))}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Input name="note" placeholder="고친 이유 (제작 원장에 남아요)" className="min-w-[240px] flex-1" />
        <Button type="submit" variant="primary">
          고친 내용으로 승인
        </Button>
      </div>
    </form>
  );
}

function Generating({ job, typical }: { job?: JobView; typical: Partial<Record<JobType, number>> }) {
  if (!job) return <p className="text-[13px] text-ink-soft">에이전트가 만들고 있어요. 작업 큐에서 진행 상황을 볼 수 있어요.</p>;
  return (
    <div className="max-w-[520px]">
      <JobProgressBar job={job} typical={typical[job.type]} />
      <p className="mt-1.5 text-[11px] text-ink-faint">10초마다 저절로 새로 고쳐져요. 이 화면을 떠나도 작업은 계속돼요.</p>
    </div>
  );
}

/** 이 단계에서 AI가 하는 일, 대표가 볼 것, 승인 기준. 아직 결과가 없을 때는 펼쳐 둬요. */
function StageHelp({ stage, open }: { stage: Stage; open: boolean }) {
  const h = STAGE_HELP[stage];
  return (
    <details open={open} className="mb-4 rounded-[5px] bg-paper-sunk px-3.5 py-2.5 text-[13px] leading-relaxed">
      <summary className="cursor-pointer text-[12px] font-medium text-ink-soft">이 단계 안내</summary>
      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="inline font-medium">AI가 하는 일 </dt>
          <dd className="inline text-ink-soft">{h.ai}</dd>
        </div>
        <div>
          <dt className="inline font-medium">대표가 볼 것 </dt>
          <dd className="inline text-ink-soft">{h.look}</dd>
        </div>
        <div>
          <dt className="inline font-medium">승인 </dt>
          <dd className="inline text-ink-soft">{h.approve}</dd>
        </div>
      </dl>
    </details>
  );
}

function Hidden({ back, artifactId }: { back: string; artifactId: string }) {
  return (
    <>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="artifactId" value={artifactId} />
    </>
  );
}

function ArtifactView({ body, markdown }: { body: Record<string, unknown>; markdown: string | null }) {
  if (markdown !== null) {
    return (
      <div className="max-h-[480px] overflow-y-auto rounded-[5px] bg-paper px-4 py-3 text-[14px] leading-[1.75] whitespace-pre-wrap">
        {markdown}
      </div>
    );
  }
  if (Object.keys(body).length === 0) return <p className="text-[13px] text-ink-faint">내용이 비어 있어요.</p>;
  return (
    <pre className="max-h-[480px] overflow-auto rounded-[5px] bg-paper px-4 py-3 text-[12px] leading-relaxed">
      {JSON.stringify(body, null, 2)}
    </pre>
  );
}

const SCOPE_LABEL = { global: "공통", genre: "장르", series: "작품", episode: "회차" } as const;
type Applied = {
  id: string;
  version: number;
  body: { rules?: { code: string; text: string }[] };
  guidelineId: string;
  title: string;
  scope: keyof typeof SCOPE_LABEL;
  current: number;
};

/** 이 결과물을 만들 때 실제로 읽힌 지침 목록. 지금 최신 버전이 아니면 알려줘요. */
function AppliedGuidelines({ ids, applied }: { ids: string[]; applied: Map<string, Applied> }) {
  const rows = ids.map((id) => applied.get(id)).filter((v): v is Applied => !!v);
  if (!rows.length) return <p className="mt-1.5">이 결과물에 기록된 지침이 없어요.</p>;
  const old = rows.filter((v) => v.version < v.current).length;
  return (
    <div className="mt-1.5 rounded-[5px] bg-paper-sunk px-3 py-2 text-[12px] text-ink-soft">
      <p className="mb-1">
        만들 때 읽힌 지침이에요.{" "}
        {old ? <span className="text-plum">그 뒤에 {old}개가 고쳐졌어요. 다시 만들면 최신 지침이 반영돼요.</span> : "모두 지금 최신 버전이에요."}
      </p>
      <ul className="space-y-0.5">
        {rows.map((v) => (
          <li key={v.id}>
            <a href={`/studio/guidelines/${v.guidelineId}`} className="text-indigo underline-offset-2 hover:underline">
              [{SCOPE_LABEL[v.scope]}] {v.title}
            </a>{" "}
            v{v.version} · 규칙 {v.body.rules?.length ?? 0}개
            {v.body.rules?.length ? <span className="text-ink-faint"> ({v.body.rules.map((r) => r.code).join(", ")})</span> : null}
            {v.version < v.current ? <span className="text-plum"> · 지금은 v{v.current}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TextCheck = {
  items: { code: string; ok: boolean; severity: "major" | "minor"; note: string }[];
  summary?: string;
  revised?: boolean;
  first_failed?: string[];
};

/** 글 단계 지침 점검표: 규칙별 통과/미통과. 빨간 줄부터 읽으면 돼요. */
function TextChecks({ checks }: { checks?: TextCheck }) {
  if (!checks?.items?.length) return null;
  const items = [...checks.items].sort((x, y) => Number(x.ok) - Number(y.ok) || (x.severity === "major" ? -1 : 1));
  const bad = items.filter((i) => !i.ok);
  return (
    <details className="mb-4 rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px]" open={bad.some((i) => i.severity === "major")}>
      <summary className="cursor-pointer text-[12px] font-medium text-ink-soft">
        지침 점검표 · 규칙 {items.length}개 중 {items.length - bad.length}개 통과
        {bad.length ? ` · 미통과 ${bad.length}개` : ""}
        {checks.revised ? ` · 처음 걸린 ${checks.first_failed?.join(", ")}를 스스로 고쳐 썼어요` : ""}
      </summary>
      {checks.summary ? <p className="mt-2 text-ink-soft">{checks.summary}</p> : null}
      <ul className="mt-2 space-y-1 text-[12px]">
        {items.map((i) => (
          <li key={i.code + i.note} className={i.ok ? "text-ink-soft" : i.severity === "major" ? "text-plum" : ""}>
            <span className="font-medium">{i.ok ? "통과" : i.severity === "major" ? "미통과(주요)" : "미통과(경미)"}</span> {i.code} {i.note}
          </li>
        ))}
      </ul>
    </details>
  );
}

type PartialBody = { kind?: string; job_id?: string; drawn?: number; total?: number; panels?: { index: number; image: string; score?: number; passed?: boolean }[] };

/** 멈춘 작업: 그때까지 끝난 컷을 보여 주고, 같은 작업을 이어서 시작해요 (끝난 컷은 다시 그리지 않아요) */
function PartialResult({ body, back, jobId }: { body: Record<string, unknown> | null | undefined; back: string; jobId?: string }) {
  const b = (body ?? {}) as PartialBody;
  const job = b.job_id ?? jobId;
  if (!job) return null;
  const panels = b.kind === "art_partial" ? (b.panels ?? []) : [];
  return (
    <div className="mt-2 space-y-2">
      {panels.length ? (
        <>
          <p className="text-[13px] text-ink-soft">
            멈추기 전까지 {b.drawn}/{b.total}컷을 그렸어요. 이 컷들은 저장돼 있어서 이어서 그리면 다시 그리지 않아요.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {panels.map((p) => (
              <a key={p.index} href={mediaUrl(p.image)} target="_blank" className="block text-[11px] text-ink-faint">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(p.image)} alt={`${p.index}컷`} loading="lazy" className="w-full rounded-[4px] border border-line" />
                {p.index}컷{typeof p.score === "number" ? ` · ${p.score}점` : ""}
              </a>
            ))}
          </div>
        </>
      ) : null}
      <form action={resumeJob}>
        <input type="hidden" name="jobId" value={job} />
        <input type="hidden" name="back" value={back} />
        <Button type="submit">이어서 그리기</Button>
        <span className="ml-2 text-[12px] text-ink-faint">멈춘 곳 다음부터 이어 가요. 이미 그려 둔 그림은 검사만 다시 해서 맞으면 그대로 써요. 크레딧 부족이었다면 충전한 뒤 눌러 주세요.</span>
      </form>
    </div>
  );
}
