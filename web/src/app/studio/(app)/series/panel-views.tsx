import { Badge, Button, Input } from "@/components/ui";
import { IMAGE_MODELS, imageModelLabel } from "@/lib/pipeline";
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
  variants?: { model: string; image?: string; score?: number; passed?: boolean; error?: string }[];
};
type ArtBody = {
  kind: "art";
  characters: { id: string; name: string; appearance: string; sheet?: string }[];
  panels: ArtPanel[];
  flagged: number[];
  redrawn?: number[];
  pending?: number[];
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
        <TestGate body={body} pending={pending} tests={tests} compared={compared.length > 0} hidden={hidden} />
      ) : null}
      {compared.length ? <CompareGrid body={body} panels={compared} pending={pending} tests={tests} canChoose={canRedraw} hidden={hidden} /> : null}
      <p className="text-[13px] text-ink-soft">
        {pending.length ? `${summary.panels}컷 중 ${summary.drawn ?? summary.panels - pending.length}컷 그림 · ` : `${summary.panels}컷 중 `}
        {summary.passed}컷 합격 · 평균 {summary.average_score}점 · {imageModelLabel(body.model)}
        {body.flagged.length ? <span className="text-plum"> · 확인할 컷 {body.flagged.join(", ")}</span> : null}
        {body.redrawn?.length ? <span> · 이번에 다시 그린 컷 {body.redrawn.join(", ")}</span> : null}
      </p>

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
                  <div className="grid aspect-[3/4] place-items-center rounded-[5px] border border-dashed border-line text-[12px] text-ink-faint">
                    그림 없음
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
                    {p.shot} · {p.height === "long" ? "긴 컷" : p.height === "short" ? "짧은 컷" : "보통 컷"}
                  </span>
                  {typeof p.score === "number" ? <Badge tone={p.passed ? "pine" : "plum"}>{p.score}점</Badge> : null}
                </div>
                <p className="mt-1 text-ink-soft">{p.description}</p>
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
  return <LetteredStrip panels={body.panels.map((p) => ({ ...p, image: p.image ? mediaUrl(p.image) : "" }))} />;
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
  return (
    <div className="mb-5 rounded-[6px] border border-ochre/40 bg-ochre-soft/40 px-4 py-3 text-[13px] leading-relaxed">
      <p className="font-medium">
        시험 컷 {tests.length}장만 먼저 그렸어요 ({tests.join(", ")}컷). 남은 컷 {pending.length}개는 아직 그리지 않았어요.
      </p>
      <p className="mt-1 text-ink-soft">
        그림이 웹툰답고 인물이 시트와 같으면 나머지를 그려요. 아쉬우면 고른 컷 다시 그리기나 모델 비교를 해 보세요. 비교는 시험 컷을 모델마다 한 장씩 그려요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!compared ? (
          <form action={artNextStep}>
            <HiddenFields h={hidden} mode="rest" />
            <input type="hidden" name="pending" value={pending.join(",")} />
            <Button type="submit" variant="primary">
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
