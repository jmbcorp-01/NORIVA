import { Button, Card, formatDate, Input, Textarea } from "@/components/ui";
import { StageBadge } from "@/components/stage-badge";
import { canStart, STAGE_INFO, stageStates, type LatestArtifact, type Stage } from "@/lib/pipeline";
import type { Artifact } from "@/lib/studio";
import { decideArtifact, runStage } from "../../actions";
import { ArtView, isArtBody, isLetteredBody, LetteredView } from "./panel-views";

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
export function StageBoard({ stages, latest, seriesId, episodeId, back }: Props) {
  const l = toLatest(latest);
  const states = stageStates(stages, l);
  return (
    <ol className="space-y-3">
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
                  {state === "locked" ? (
                    <p className="text-[13px] text-ink-faint">앞 단계가 승인되면 시작할 수 있어요.</p>
                  ) : null}

                  {a?.status === "generating" ? (
                    <p className="text-[13px] text-ink-soft">에이전트가 만들고 있어요. 작업 큐에서 진행 상황을 볼 수 있어요.</p>
                  ) : null}

                  {a?.status === "failed" ? (
                    <p className="mb-3 text-[13px] text-plum">{String(a.body?.error ?? "생성에 실패했어요. 다시 생성해 주세요.")}</p>
                  ) : null}

                  {a?.status === "stale" ? (
                    <p className="mb-3 text-[13px] text-plum">
                      앞 단계가 바뀌어 낡은 결과예요. 그대로 다시 승인하거나, 새 입력으로 다시 생성하세요.
                    </p>
                  ) : null}

                  {a && a.status !== "generating" && a.status !== "failed" ? (
                    isArtBody(a.body) ? (
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
                      <ArtifactView body={a.body} markdown={markdown} />
                    )
                  ) : null}

                  {a ? (
                    <p className="mt-3 text-[11px] text-ink-faint">
                      {formatDate(a.updatedAt)} · 지침 {a.guidelineVersionIds.length}개 버전 적용 · 입력 지문 {a.inputHash || "없음"}
                    </p>
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
                      <form action={decideArtifact} className="mt-3 space-y-2">
                        <Hidden back={back} artifactId={a.id} />
                        <input type="hidden" name="decision" value="edit" />
                        <input type="hidden" name="format" value={markdown !== null ? "markdown" : "json"} />
                        <Textarea
                          name="body"
                          rows={16}
                          defaultValue={markdown ?? JSON.stringify(a.body, null, 2)}
                          className="font-mono text-[13px]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Input name="note" placeholder="고친 이유 (제작 원장에 남아요)" className="min-w-[240px] flex-1" />
                          <Button type="submit" variant="primary">
                            고친 내용으로 승인
                          </Button>
                        </div>
                      </form>
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
