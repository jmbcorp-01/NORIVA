import { Badge, Button, Input } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";
import { imageModelLabel } from "@/lib/pipeline";
import { addSeriesRules, redrawSheets, updateHistoryRefs } from "../../actions";
import { mediaUrl } from "./panel-views";

type Defect = { code: string; severity: "critical" | "major" | "minor"; note: string };
type SheetChar = {
  id: string;
  name: string;
  kind?: "person" | "animal" | "creature";
  role?: string;
  appearance: string;
  period_notes?: string;
  never?: string[];
  sheet?: string;
  score?: number;
  passed?: boolean;
  defects?: Defect[];
  candidates?: { image: string; score: number }[];
};
type SheetsBody = {
  kind: "sheets";
  characters: SheetChar[];
  medium?: string;
  model?: string | null;
  redrawn?: string[];
  rule_suggestions?: string[];
  summary: { characters: number; passed: number };
};

const SEVERITY = { critical: "치명", major: "주요", minor: "경미" } as const;
const KIND = { person: "사람", animal: "동물", creature: "요괴·신수" } as const;

export function isSheetsBody(b: Record<string, unknown>): b is SheetsBody {
  return b.kind === "sheets" && Array.isArray(b.characters);
}

/** ④+ 인물 시트: 인물마다 시트, 고정 명세, 자동 검사 결과. 고른 인물만 다시 그리기 */
export function SheetsView({
  body,
  artifactId,
  seriesId,
  back,
  canRedraw,
}: {
  body: SheetsBody;
  artifactId: string;
  seriesId: string;
  back: string;
  canRedraw: boolean;
}) {
  const pics = body.characters.filter((c) => c.sheet).map((c) => ({ src: mediaUrl(c.sheet!), alt: `${c.name} 인물 시트` }));
  return (
    <div>
      {body.rule_suggestions?.length ? <RuleSuggestions rules={body.rule_suggestions} seriesId={seriesId} back={back} /> : null}
    <form action={redrawSheets}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="artifactId" value={artifactId} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <p className="text-[13px] text-ink-soft">
        {body.summary.characters}명 중 {body.summary.passed}명 자동 검사 합격 · {imageModelLabel(body.model)}
        {body.redrawn?.length ? ` · 이번에 다시 그린 인물 ${body.redrawn.join(", ")}` : ""}
      </p>
      <p className="mt-1 text-[12px] text-ink-faint">
        승인하면 ⑦ 작화가 모든 회차에서 이 시트와 외모 명세를 그대로 써요. 칼·옷·머리 모양이 시대에 맞는지, 세 방향이 같은 사람인지 크게 보며 확인하세요.
      </p>
      <ul className="mt-4 space-y-5">
        {body.characters.map((c) => (
          <li key={c.id} className="grid gap-3 sm:grid-cols-[minmax(0,360px)_1fr]">
            <div>
              {c.sheet ? (
                <ZoomImage src={mediaUrl(c.sheet)} alt={`${c.name} 인물 시트`} gallery={pics} className="w-full rounded-[5px] border border-line" loading="lazy" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center rounded-[5px] border border-dashed border-line text-[12px] text-ink-faint">그림 없음</div>
              )}
              {c.candidates && c.candidates.length > 1 ? (
                <div className="mt-1 flex gap-2">
                  {c.candidates.map((x, i) => (
                    <a key={x.image} href={mediaUrl(x.image)} target="_blank" className="text-[11px] text-indigo underline-offset-2 hover:underline">
                      후보 {i + 1} · {x.score}점
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="text-[13px] leading-relaxed">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-[15px] font-semibold">{c.name}</span>
                <span className="text-ink-faint">
                  {c.id} · {KIND[c.kind ?? "person"]}
                </span>
                {typeof c.score === "number" ? <Badge tone={c.passed ? "pine" : "plum"}>{c.score}점</Badge> : null}
              </div>
              <p className="mt-1 text-ink-soft">{c.appearance}</p>
              {c.period_notes ? <p className="mt-1 text-[12px] text-ink-soft">고증: {c.period_notes}</p> : null}
              {c.never?.length ? <p className="mt-1 text-[12px] text-plum">금지: {c.never.join(", ")}</p> : null}
              {c.defects?.length ? (
                <ul className="mt-2 space-y-0.5 text-[12px]">
                  {c.defects.map((d, i) => (
                    <li key={i} className={d.severity === "critical" ? "text-plum" : "text-ink-soft"}>
                      [{SEVERITY[d.severity]}] {d.code} {d.note}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canRedraw ? (
                <label className="mt-2 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 text-[12px]">
                  <input type="checkbox" name="chars" value={c.id} className="size-4 accent-[var(--color-pine)]" />이 인물 다시 그리기
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canRedraw ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[5px] bg-paper-sunk px-3 py-3">
          <Input name="instruction" placeholder="고른 인물에게 줄 지시 (예: 칼은 곧은 환두대도, 두루마기는 무릎 위)" className="min-w-[260px] flex-1" />
          <Button type="submit">고른 인물 다시 그리기</Button>
          <span className="w-full text-[11px] text-ink-faint">인물 한 명에 약 $0.3~0.6이에요. 외모 명세 자체를 바꾸려면 ③ 인물을 고쳐 승인한 뒤 이 단계를 다시 생성하세요.</span>
        </div>
      ) : null}
    </form>
    </div>
  );
}

/** 대표 교정을 작품 지침으로: 한 번 더하면 이후 인물 시트, 작화, 검수가 모든 회차에서 지키고 검사해요 */
function RuleSuggestions({ rules, seriesId, back }: { rules: string[]; seriesId: string; back: string }) {
  return (
    <form action={addSeriesRules} className="mb-4 rounded-[5px] border border-line px-4 py-3 text-[13px]">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <p className="font-medium">작품 지침 후보</p>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        이번에 고친 내용을 작품 지침으로 남기면, 이후 인물 시트·작화·검수가 모든 회차에서 이 규칙을 지키고 검사해요. 이미 들어간 규칙은 다시 더하지 않아요.
      </p>
      <ul className="mt-2 space-y-1">
        {rules.map((r) => (
          <li key={r}>
            <label className="inline-flex min-h-[32px] cursor-pointer items-start gap-2">
              <input type="checkbox" name="rules" value={r} defaultChecked className="mt-0.5 size-4 flex-none accent-[var(--color-pine)]" />
              <span>{r}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" className="mt-2">
        작품 지침에 더하기
      </Button>
    </form>
  );
}

/** 인물 시트를 그릴 때 참조로 넣는 고증 참고 그림 (유물·복식 사진). 비공개로 두고 시트를 그릴 때만 그림 모델에 보내요. */
export function HistoryRefs({ seriesId, refs, back }: { seriesId: string; refs: string[]; back: string }) {
  return (
    <div className="mb-4 rounded-[5px] border border-line px-4 py-3 text-[13px]">
      <p className="font-medium">고증 참고 그림 {refs.length ? `${refs.length}장` : ""}</p>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        칼, 옷, 머리 모양처럼 시대 고증이 중요한 것의 실제 유물·복식 사진을 1~3장 올리면, 인물 시트를 그릴 때 참고 그림으로 함께 넣어요. 글로만 설명하면 그림 모델이 일본도 같은 익숙한 모양으로 그리기 쉬워요. 박물관 공개 자료처럼 써도 되는 사진만 올려 주세요.
      </p>
      {refs.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {refs.map((k) => (
            <form key={k} action={updateHistoryRefs} className="w-[96px] flex-none">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="seriesId" value={seriesId} />
              <input type="hidden" name="remove" value={k} />
              <ZoomImage src={`/studio/private-media/${k}`} alt="고증 참고 그림" className="aspect-square w-full rounded-[4px] border border-line object-cover" />
              <button type="submit" className="mt-1 text-[11px] text-ink-faint hover:text-plum">
                빼기
              </button>
            </form>
          ))}
        </div>
      ) : null}
      {refs.length < 3 ? (
        <form action={updateHistoryRefs} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="seriesId" value={seriesId} />
          <input type="file" name="files" accept="image/png,image/jpeg,image/webp" multiple className="text-[12px]" />
          <Button type="submit">올리기</Button>
        </form>
      ) : null}
    </div>
  );
}
