import { Badge, Button, Input } from "@/components/ui";
import { IMAGE_MODELS, imageModelLabel, restGate } from "@/lib/pipeline";
import { artNextStep, redrawPanels } from "../../actions";
import { LetteredStrip, type LetteredPanel } from "./lettered-strip";
import { ZoomImage } from "@/components/zoom-image";

/** 그림 파일 키 → 주소. 로컬은 스튜디오의 /media 경로, AWS는 CloudFront가 S3에서 보여줘요. */
export const mediaUrl = (key: string) => `/media/${key}`;

type Defect = { code: string; severity: "critical" | "major" | "minor"; note: string };
type ArtPanel = {
  index: number;
  shot: string;
  height: string;
  description: string;
  character_ids: string[];
  dialogue: { speaker: string; text: string }[];
  image?: string;
  score?: number;
  passed?: boolean;
  defects?: Defect[];
  candidates?: { image: string; score: number }[];
  scene?: number;
  scene_ref?: boolean;
  color_matched?: boolean;
  /** 이어지는 긴 세로 컷: 위 컷 아래 끝을 이어받아 그린 컷 */
  join?: { prev: number; overlap: number; margin: number };
  join_failed?: string;
  joins_next?: boolean;
  variants?: { model: string; image?: string; score?: number; passed?: boolean; error?: string }[];
};
type ArtBody = {
  kind: "art";
  characters: { id: string; name: string; appearance: string; sheet?: string }[];
  panels: ArtPanel[];
  flagged: number[];
  rhythm_warnings?: string[];
  /** 그리기 전 이야기 연결 검사: 고친 컷과 대본에서 빠진 사건 */
  story_check?: { fixed?: { index: number; problem: string }[]; missing_beats?: string[]; error?: string };
  scenes?: { id: number; place: string }[];
  redrawn?: number[];
  /** 이어진 위 컷을 다시 그려서 함께 다시 그린 아래 컷 */
  join_added?: number[];
  /** 이어지는 컷 묶음 (컷 번호) */
  strips?: number[][];
  /** 한 장씩 확인하는 장면과, 이번에 그려 확인을 기다리는 컷 */
  step_scenes?: number[];
  step_waiting?: number[];
  pending?: number[];
  blocked?: { index: number; note: string }[];
  test_panels?: number[];
  model?: string | null;
  compare_models?: string[];
  summary: { panels: number; drawn?: number; passed: number; average_score: number };
};

const SEVERITY = { critical: "치명", major: "주요", minor: "경미" } as const;

export function isArtBody(b: Record<string, unknown>): b is ArtBody {
  return b.kind === "art" && Array.isArray(b.panels);
}
export function isLetteredBody(b: Record<string, unknown>): b is { kind: "lettered"; panels: LetteredPanel[] } {
  return b.kind === "lettered" && Array.isArray(b.panels);
}

/** 작화 결과: 인물 시트, 컷별 그림과 자동 검사 결과, 고른 컷만 다시 그리기 */
export function ArtView({
  body,
  canRedraw,
  artifactId,
  seriesId,
  episodeId,
  back,
}: {
  body: ArtBody;
  canRedraw: boolean;
  artifactId: string;
  seriesId: string;
  episodeId: string | null;
  back: string;
}) {
  const { summary } = body;
  const pending = body.pending ?? [];
  const tests = body.test_panels ?? [];
  const compared = body.panels.filter((p) => p.variants?.length);
  const hidden = { back, artifactId, seriesId, episodeId };
  const panelPics = body.panels.filter((p) => p.image).map((p) => ({ src: mediaUrl(p.image!), alt: `${p.index}컷` }));
  return (
    <div>
      {canRedraw && pending.length ? (
        body.step_scenes?.length ? (
          <StepGate body={body} pending={pending} hidden={hidden} />
        ) : (
          <TestGate body={body} pending={pending} tests={tests} compared={compared.length > 0} hidden={hidden} />
        )
      ) : null}
      {compared.length ? <CompareGrid body={body} panels={compared} pending={pending} tests={tests} canChoose={canRedraw} hidden={hidden} /> : null}
      <p className="text-[13px] text-ink-soft">
        {pending.length ? `${summary.panels}컷 중 ${summary.drawn ?? summary.panels - pending.length}컷 그림 · ` : `${summary.panels}컷 중 `}
        {summary.passed}컷 합격 · 평균 {summary.average_score}점 · {imageModelLabel(body.model)}
        {body.flagged.length ? <span className="text-plum"> · 확인할 컷 {body.flagged.join(", ")}</span> : null}
        {body.redrawn?.length ? <span> · 이번에 다시 그린 컷 {body.redrawn.join(", ")}</span> : null}
        {body.join_added?.length ? <span> (이어진 아래 컷 {body.join_added.join(", ")} 포함)</span> : null}
      </p>
      {body.strips?.length ? (
        <p className="mt-1 text-[12px] text-ink-soft">
          이어지는 긴 세로 컷 {body.strips.map((g) => `${g[0]}~${g[g.length - 1]}컷`).join(", ")}: 아래 컷이 위 컷 아래 끝을 이어받아 그려지고, 독자 화면에서 여백 없이 한 장처럼 보여요.
          위 컷을 다시 그리면 아래 컷도 함께 다시 그려요.
        </p>
      ) : null}

      {body.rhythm_warnings?.length ? (
        <div className="rounded-[5px] border border-plum/40 px-3 py-2 text-[12px]">
          <p className="font-medium text-plum">화면 리듬 점검: 콘티에서 고치면 다시 그리는 것보다 싸요.</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {body.rhythm_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {body.story_check && (body.story_check.missing_beats?.length || body.story_check.fixed?.length || body.story_check.error) ? (
        <div className="mt-2 rounded-[5px] border border-line px-3 py-2 text-[12px]">
          <p className="font-medium">그리기 전 이야기 연결 검사</p>
          {body.story_check.missing_beats?.length ? (
            <>
              <p className="mt-1 text-plum">대본에서 빠진 사건이 있어요. 콘티에서 넣고 다시 만드는 게 그림을 다시 그리는 것보다 싸요.</p>
              <ul className="mt-0.5 list-disc pl-4 text-ink-soft">
                {body.story_check.missing_beats.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          ) : null}
          {body.story_check.fixed?.length ? (
            <>
              <p className="mt-1 text-ink-soft">앞뒤가 안 맞아 그리기 전에 지시를 고친 컷:</p>
              <ul className="mt-0.5 list-disc pl-4 text-ink-soft">
                {body.story_check.fixed.map((f) => (
                  <li key={f.index}>
                    {f.index}컷: {f.problem}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {body.story_check.error ? <p className="mt-1 text-ink-soft">검사를 하지 못했어요. 콘티를 직접 한 번 확인해 주세요.</p> : null}
        </div>
      ) : null}
      <RuleTally panels={body.panels} />

      {body.characters.some((c) => c.sheet) ? (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-medium text-ink-soft">인물 시트 (모든 컷이 이 얼굴과 옷을 따라요 · 누르면 크게 보여요)</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {body.characters.map((c, _i, all) =>
              c.sheet ? (
                <figure key={c.id} className="w-[180px] flex-none">
                  <ZoomImage
                    src={mediaUrl(c.sheet)}
                    alt={`${c.name} 인물 시트`}
                    gallery={all.filter((x) => x.sheet).map((x) => ({ src: mediaUrl(x.sheet!), alt: `${x.name} 인물 시트` }))}
                    className="aspect-[4/3] w-full rounded-[5px] border border-line object-cover" />
                  <figcaption className="mt-1 text-[12px] font-medium">{c.name}</figcaption>
                </figure>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      <form action={redrawPanels} className="mt-5">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="artifactId" value={artifactId} />
        <input type="hidden" name="seriesId" value={seriesId} />
        <input type="hidden" name="episodeId" value={episodeId ?? ""} />
        <ol className="max-h-[720px] space-y-5 overflow-y-auto pr-1">
          {body.panels.map((p) => (
            <li key={p.index} className="grid gap-3 sm:grid-cols-[minmax(0,300px)_1fr]">
              <div>
                {p.image ? (
                  <ZoomImage src={mediaUrl(p.image)} alt={`${p.index}컷`} gallery={panelPics} className="w-full rounded-[5px] border border-line" loading="lazy" />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center rounded-[5px] border border-dashed border-line px-3 text-center text-[12px] text-ink-faint">
                    {pending.includes(p.index)
                      ? typeof p.scene === "number" && body.step_scenes?.includes(p.scene)
                        ? "아직 안 그림 · 한 장씩 확인 장면이에요. 앞 컷을 보고 '다음 컷 그리기'를 누르면 그려요"
                        : "아직 안 그림 · 시험 컷을 보고 '나머지 그리기'를 누르면 그려요"
                      : body.blocked?.some((x) => x.index === p.index)
                        ? `그림 모델이 이 컷을 거부했어요. ${body.blocked.find((x) => x.index === p.index)?.note ?? ""} 지시에 표현을 순화해 적고 이 컷만 다시 그려 주세요.`
                        : "그림 없음"}
                  </div>
                )}
                {p.candidates && p.candidates.length > 1 ? (
                  <div className="mt-2 flex gap-2">
                    {p.candidates.map((c, i) => (
                      <a key={c.image} href={mediaUrl(c.image)} target="_blank" className="text-[11px] text-indigo underline-offset-2 hover:underline">
                        후보 {i + 1} · {c.score}점
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="text-[13px] leading-relaxed">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-[15px] font-semibold">{p.index}컷</span>
                  <span className="text-ink-faint">
                    {typeof p.scene === "number" ? `장면 ${p.scene} · ` : ""}
                    {p.shot} · {p.height === "long" ? "긴 컷" : p.height === "short" ? "짧은 컷" : "보통 컷"}
                    {p.scene_ref ? " · 앞 컷 이어 그림" : ""}
                    {p.color_matched ? " · 색 맞춤" : ""}
                    {p.join ? ` · ${p.join.prev}컷과 이어 그림` : ""}
                    {body.step_waiting?.includes(p.index) ? " · 확인 기다림" : ""}
                  </span>
                  {typeof p.score === "number" ? <Badge tone={p.passed ? "pine" : "plum"}>{p.score}점</Badge> : null}
                </div>
                <p className="mt-1 text-ink-soft">{p.description}</p>
                {p.join_failed ? <p className="mt-1 text-[12px] text-plum">{p.join_failed}</p> : null}
                {p.dialogue.length ? (
                  <ul className="mt-2 space-y-0.5">
                    {p.dialogue.map((d, i) => (
                      <li key={i}>
                        <span className="text-ink-faint">{d.speaker === "narration" ? "내레이션" : d.speaker}</span> {d.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {p.defects?.length ? (
                  <ul className="mt-2 space-y-0.5 text-[12px]">
                    {p.defects.map((d, i) => (
                      <li key={i} className={d.severity === "critical" ? "text-plum" : "text-ink-soft"}>
                        [{SEVERITY[d.severity]}] {d.code} {d.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canRedraw ? (
                  <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-indigo">
                    <input type="checkbox" name="panels" value={p.index} defaultChecked={p.passed === false} className="size-4 accent-[var(--color-indigo)]" />
                    이 컷 다시 그리기
                  </label>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {canRedraw ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Input name="instruction" placeholder="다시 그릴 때 바꿀 점 (예: 더 어둡게, 하나의 표정을 굳게)" className="min-w-[240px] flex-1" />
            <Button type="submit">고른 컷 다시 그리기</Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function LetteredView({ body }: { body: { panels: LetteredPanel[] } }) {
  const lines = body.panels.flatMap((p) => p.bubbles.map((b, i) => ({ key: `${p.index}-${i}`, panel: p.index, ko: b.text.ko, en: b.text.en })));
  return (
    <div>
      <LetteredStrip panels={body.panels.map((p) => ({ ...p, image: p.image ? mediaUrl(p.image) : "" }))} />
      {lines.length ? (
        <details className="mt-4 rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px]">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-soft">
            한국어·영어 대사 대조표 ({lines.length}줄{lines.some((l) => !l.en) ? ` · 영어 빠진 줄 ${lines.filter((l) => !l.en).length}개` : ""})
          </summary>
          <table className="mt-2 w-full text-left text-[12px]">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-1 pr-3 font-medium">컷</th>
                <th className="py-1 pr-3 font-medium">한국어</th>
                <th className="py-1 font-medium">영어</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-line align-top">
                  <td className="py-1 pr-3 text-ink-faint">{l.panel}</td>
                  <td className="py-1 pr-3">{l.ko}</td>
                  <td className={`py-1 ${l.en ? "" : "text-plum"}`}>{l.en || "(영어 없음)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-faint">영어를 고치려면 아래 “직접 고치기”에서 해당 줄의 en 값을 바꿔 저장하세요.</p>
        </details>
      ) : null}
    </div>
  );
}

type Hidden = { back: string; artifactId: string; seriesId: string; episodeId: string | null };

function HiddenFields({ h, mode }: { h: Hidden; mode: string }) {
  return (
    <>
      <input type="hidden" name="back" value={h.back} />
      <input type="hidden" name="artifactId" value={h.artifactId} />
      <input type="hidden" name="seriesId" value={h.seriesId} />
      <input type="hidden" name="episodeId" value={h.episodeId ?? ""} />
      <input type="hidden" name="mode" value={mode} />
    </>
  );
}

/** 시험 컷 관문: 시험 컷만 그린 상태에서 나머지를 그릴지, 모델을 비교할지 고르는 곳 */
function TestGate({ body, pending, tests, compared, hidden }: { body: ArtBody; pending: number[]; tests: number[]; compared: boolean; hidden: Hidden }) {
  const gate = restGate(body, pending.length);
  return (
    <div className="mb-5 rounded-[6px] border border-ochre/40 bg-ochre-soft/40 px-4 py-3 text-[13px] leading-relaxed">
      <p className="font-medium">
        시험 컷 {tests.length}장만 먼저 그렸어요 ({tests.join(", ")}컷). 남은 컷 {pending.length}개는 아직 그리지 않았어요.
      </p>
      <p className="mt-1 text-ink-soft">
        그림이 웹툰답고 인물이 시트와 같으면 나머지를 그려요. 아쉬우면 고른 컷 다시 그리기나 모델 비교를 해 보세요. 비교는 시험 컷을 모델마다 한 장씩 그려요.
      </p>
      {gate.total ? (
        <p className={`mt-2 font-medium ${gate.blocked ? "text-plum" : ""}`}>
          시험 컷 {gate.total}장 중 {gate.passed}장 합격 · 나머지 {pending.length}컷 예상 비용 약 ${gate.estimate}
          {gate.blocked ? " · 시험 컷이 모두 떨어져서 나머지 그리기를 막았어요. 인물 시트를 고치거나 시험 컷을 다시 그려 합격시켜 주세요." : null}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!compared ? (
          <form action={artNextStep} className="w-full">
            <HiddenFields h={hidden} mode="rest" />
            <input type="hidden" name="pending" value={pending.join(",")} />
            <StepChoice scenes={body.scenes ?? []} chosen={defaultStepScenes(body.scenes ?? [])} />
            <Button type="submit" variant="primary" disabled={gate.blocked} className="mt-2">
              나머지 {pending.length}컷 그리기 · {imageModelLabel(body.model)}
            </Button>
          </form>
        ) : null}
        <form action={artNextStep} className="flex flex-wrap items-center gap-3">
          <HiddenFields h={hidden} mode="compare" />
          <input type="hidden" name="test" value={tests.join(",")} />
          {IMAGE_MODELS.map((m) => (
            <label key={m.id} className="inline-flex min-h-[44px] items-center gap-1.5">
              <input type="checkbox" name="models" value={m.id} defaultChecked className="size-4 accent-[var(--color-indigo)]" />
              {m.label} <span className="text-ink-faint">장당 약 ${m.price}</span>
            </label>
          ))}
          <Button type="submit">시험 컷 모델 비교</Button>
        </form>
      </div>
    </div>
  );
}

/** 중요한 장면 기본값: 회차 첫 장면과 마지막 장면(절단). 장면이 하나뿐이면 고르지 않아요. */
function defaultStepScenes(scenes: { id: number }[]): number[] {
  if (scenes.length < 2) return [];
  return [scenes[0].id, scenes[scenes.length - 1].id];
}

/** 한 장씩 확인할 장면 고르기. 고른 장면은 한 컷 그리고 멈춰 대표가 확인한 뒤 다음 컷을 그려요. */
function StepChoice({ scenes, chosen }: { scenes: { id: number; place: string }[]; chosen: number[] }) {
  if (!scenes.length) return null;
  return (
    <fieldset className="mt-1">
      <input type="hidden" name="step_choice" value="1" />
      <legend className="text-[12px] text-ink-soft">
        한 장씩 확인할 장면: 고른 장면은 한 컷씩 그리고 멈춰요. 대표님이 보고 넘기면 다음 컷을 그려요. 나머지 장면은 자동으로 그려요.
      </legend>
      <div className="mt-1 flex flex-wrap gap-x-4">
        {scenes.map((sc) => (
          <label key={sc.id} className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="step_scenes" value={sc.id} defaultChecked={chosen.includes(sc.id)} className="size-4 accent-[var(--color-indigo)]" />
            장면 {sc.id} <span className="max-w-[220px] truncate text-ink-faint">{sc.place}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 한 장씩 확인 중: 방금 그린 컷을 보고 다음 컷을 그리거나, 그 컷만 다시 그려요 */
function StepGate({ body, pending, hidden }: { body: ArtBody; pending: number[]; hidden: Hidden }) {
  const steps = body.step_scenes ?? [];
  const left = body.panels.filter((p) => pending.includes(p.index) && typeof p.scene === "number" && steps.includes(p.scene));
  const auto = pending.length - left.length;
  const waiting = body.step_waiting ?? [];
  // 이번에 그릴 컷: 한 장씩 장면마다 한 컷 + 다른 장면의 남은 컷 모두
  const next = new Set(left.map((p) => p.scene)).size + auto;
  return (
    <div className="mb-5 rounded-[6px] border border-indigo/40 bg-indigo-soft/40 px-4 py-3 text-[13px] leading-relaxed">
      <p className="font-medium">
        한 장씩 확인 중 · 장면 {steps.join(", ")} · 남은 컷 {left.length}개{auto ? ` (다른 장면 ${auto}컷 포함)` : ""}
      </p>
      <p className="mt-1 text-ink-soft">
        {waiting.length ? `방금 그린 ${waiting.join(", ")}컷을 확인해 주세요. ` : ""}
        괜찮으면 &lsquo;다음 컷 그리기&rsquo;를 누르세요. 아쉬우면 아래에서 그 컷만 골라 바꿀 점을 적고 다시 그리세요. 다음 컷은 확인한 컷을 이어받아 그려요.
      </p>
      <form action={artNextStep} className="mt-2">
        <HiddenFields h={hidden} mode="rest" />
        <input type="hidden" name="pending" value={pending.join(",")} />
        <StepChoice scenes={body.scenes ?? []} chosen={steps} />
        <Button type="submit" variant="primary" className="mt-2">
          다음 컷 그리기 · {next}컷 · 예상 약 ${restGate(body, next).estimate}
        </Button>
      </form>
    </div>
  );
}

/** 모델 비교 결과: 시험 컷마다 모델별 그림을 나란히, 모델을 고르면 그 모델로 나머지를 그려요 */
function CompareGrid({
  body,
  panels,
  pending,
  tests,
  canChoose,
  hidden,
}: {
  body: ArtBody;
  panels: ArtPanel[];
  pending: number[];
  tests: number[];
  canChoose: boolean;
  hidden: Hidden;
}) {
  const models = body.compare_models?.length ? body.compare_models : [...new Set(panels.flatMap((p) => p.variants!.map((v) => v.model)))];
  const avg = (m: string) => {
    const xs = panels.map((p) => p.variants!.find((v) => v.model === m)?.score).filter((x): x is number => typeof x === "number");
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  };
  return (
    <div className="mb-6">
      <p className="mb-2 text-[13px] font-medium">모델 비교 · 같은 지시, 같은 인물 시트로 그렸어요</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-2 text-[12px]">
          <thead>
            <tr>
              <th className="w-[48px] text-left font-normal text-ink-faint">컷</th>
              {models.map((m) => (
                <th key={m} className="text-left font-medium">
                  {imageModelLabel(m)} {avg(m) !== null ? <span className="font-normal text-ink-faint">평균 {avg(m)}점</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panels.map((p) => (
              <tr key={p.index} className="align-top">
                <td className="pt-1 font-serif text-[14px]">{p.index}</td>
                {models.map((m) => {
                  const v = p.variants!.find((x) => x.model === m);
                  return (
                    <td key={m}>
                      {v?.image ? (
                        <a href={mediaUrl(v.image)} target="_blank">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaUrl(v.image)} alt={`${p.index}컷 ${m}`} className="w-full rounded-[5px] border border-line" loading="lazy" />
                        </a>
                      ) : (
                        <div className="grid aspect-[3/4] place-items-center rounded-[5px] border border-dashed border-line text-ink-faint">
                          {v?.error ? "실패" : "없음"}
                        </div>
                      )}
                      {typeof v?.score === "number" ? <span className={v.passed ? "text-pine" : "text-plum"}>{v.score}점</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            {canChoose ? (
              <tr>
                <td />
                {models.map((m) => (
                  <td key={m}>
                    <form action={artNextStep}>
                      <HiddenFields h={hidden} mode="adopt" />
                      <input type="hidden" name="model" value={m} />
                      <input type="hidden" name="pending" value={pending.join(",")} />
                      <input type="hidden" name="test" value={tests.join(",")} />
                      <Button type="submit" variant="primary">
                        {pending.length ? `이 모델로 나머지 ${pending.length}컷` : "이 모델로 정하기"}
                      </Button>
                    </form>
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">고른 모델은 이 작품의 작화 모델로 저장돼 다음 회차에도 쓰여요.</p>
    </div>
  );
}

/** 지침 점검표: 자동 검사에서 나온 결함을 규칙 코드별로 모아, 어떤 규칙을 몇 컷이 어겼는지 보여줘요. */
function RuleTally({ panels }: { panels: ArtPanel[] }) {
  const checked = panels.filter((p) => typeof p.score === "number");
  if (!checked.length) return null;
  const by = new Map<string, { worst: Defect["severity"]; panels: number[]; note: string }>();
  const rank = { critical: 0, major: 1, minor: 2 } as const;
  for (const p of checked)
    for (const d of p.defects ?? []) {
      const row = by.get(d.code) ?? { worst: d.severity, panels: [], note: d.note };
      if (rank[d.severity] < rank[row.worst]) row.worst = d.severity;
      if (!row.panels.includes(p.index)) row.panels.push(p.index);
      by.set(d.code, row);
    }
  const rows = [...by.entries()].sort((a, b) => rank[a[1].worst] - rank[b[1].worst] || b[1].panels.length - a[1].panels.length);
  return (
    <details className="mt-3 rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px]" open={rows.length > 0}>
      <summary className="cursor-pointer text-[12px] font-medium text-ink-soft">
        지침 점검표 · 검사한 {checked.length}컷 중 {checked.filter((p) => !(p.defects ?? []).length).length}컷은 어긴 규칙 없음
        {rows.length ? ` · 어긴 규칙 ${rows.length}가지` : ""}
      </summary>
      {rows.length ? (
        <table className="mt-2 w-full text-left text-[12px]">
          <thead className="text-ink-faint">
            <tr>
              <th className="py-1 pr-3 font-medium">규칙</th>
              <th className="py-1 pr-3 font-medium">가장 심한 정도</th>
              <th className="py-1 pr-3 font-medium">어긴 컷</th>
              <th className="py-1 font-medium">예시</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([code, r]) => (
              <tr key={code} className="border-t border-line align-top">
                <td className="py-1 pr-3 font-medium">{code}</td>
                <td className={`py-1 pr-3 ${r.worst === "critical" ? "text-plum" : ""}`}>{SEVERITY[r.worst]}</td>
                <td className="py-1 pr-3">
                  {r.panels.length}컷 ({r.panels.sort((a, b) => a - b).join(", ")})
                </td>
                <td className="py-1 text-ink-soft">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-ink-soft">자동 검사에서 어긴 규칙이 없어요.</p>
      )}
    </details>
  );
}
