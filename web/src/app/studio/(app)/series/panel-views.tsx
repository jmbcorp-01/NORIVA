import { Badge, Button, Input } from "@/components/ui";
import { redrawPanels } from "../../actions";
import { LetteredStrip, type LetteredPanel } from "./lettered-strip";

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
};
type ArtBody = {
  kind: "art";
  characters: { id: string; name: string; appearance: string; sheet?: string }[];
  panels: ArtPanel[];
  flagged: number[];
  redrawn?: number[];
  summary: { panels: number; passed: number; average_score: number };
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
  return (
    <div>
      <p className="text-[13px] text-ink-soft">
        {summary.panels}컷 중 {summary.passed}컷 합격 · 평균 {summary.average_score}점
        {body.flagged.length ? <span className="text-plum"> · 확인할 컷 {body.flagged.join(", ")}</span> : null}
        {body.redrawn?.length ? <span> · 이번에 다시 그린 컷 {body.redrawn.join(", ")}</span> : null}
      </p>

      {body.characters.some((c) => c.sheet) ? (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-medium text-ink-soft">인물 시트 (모든 컷이 이 얼굴과 옷을 따라요)</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {body.characters.map((c) =>
              c.sheet ? (
                <figure key={c.id} className="w-[180px] flex-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(c.sheet)} alt={`${c.name} 인물 시트`} className="aspect-[4/3] w-full rounded-[5px] border border-line object-cover" />
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(p.image)} alt={`${p.index}컷`} className="w-full rounded-[5px] border border-line" loading="lazy" />
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
