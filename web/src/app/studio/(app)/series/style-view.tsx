import { Button } from "@/components/ui";
import { imageModelLabel } from "@/lib/pipeline";
import { approveStyle, updateStyleRefs } from "../../actions";
import { mediaUrl } from "./panel-views";

type StyleBody = {
  kind: "style";
  markdown: string;
  criteria: Record<string, string | number> | null;
  candidates: { name: string; card: string; style_prompt: string; samples: (string | null)[] }[];
  scenes: { title: string; prompt: string }[];
  model?: string | null;
  style_masters?: string[];
  chosen?: number | null;
};

const CRITERIA_LABEL: Record<string, string> = {
  line: "선",
  coloring: "채색",
  shading_steps: "그림자 단계",
  palette: "팔레트",
  proportions: "비율",
  faces: "얼굴",
  backgrounds: "배경",
  effects: "연출",
  panel_rhythm: "컷 리듬",
  avoid: "피할 것",
};

export function isStyleBody(b: Record<string, unknown>): b is StyleBody {
  return b.kind === "style" && Array.isArray(b.candidates);
}

/** ④ 화풍 결과: 기준 값, 후보별 샘플 그림, 화풍 마스터 고르기 */
export function StyleView({ body, artifactId, back, canApprove }: { body: StyleBody; artifactId: string; back: string; canApprove: boolean }) {
  const masters = new Set(body.style_masters ?? []);
  return (
    <div className="space-y-5">
      {body.criteria ? (
        <div className="rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px]">
          <p className="mb-1.5 text-[12px] font-medium text-ink-soft">참고 캡처에서 뽑은 기준 값 (그림은 쓰지 않고 이 값만 참고했어요)</p>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {Object.entries(CRITERIA_LABEL).map(([k, label]) =>
              body.criteria?.[k] !== undefined && body.criteria?.[k] !== "" ? (
                <div key={k}>
                  <dt className="inline font-medium">{label} </dt>
                  <dd className="inline text-ink-soft">{String(body.criteria[k])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      ) : null}

      <form action={approveStyle}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="artifactId" value={artifactId} />
        <p className="mb-2 text-[13px] text-ink-soft">
          후보 3개를 같은 장면 3개로 그렸어요 ({imageModelLabel(body.model)}). 가장 웹툰다운 그림을 1~5장 고르면 화풍 마스터가 되어, 작화의 모든 컷이 이 그림의 선과 채색을 따라요. 같은 후보 안에서 고르는 걸 권해요.
        </p>
        <p className="mb-3 text-[12px] text-ink-faint">장면: {body.scenes.map((s, i) => `${i + 1}. ${s.title}`).join(" · ")}</p>
        <div className="space-y-5">
          {body.candidates.map((c, ci) => (
            <section key={ci} className={body.chosen === ci ? "rounded-[6px] ring-2 ring-pine/50 p-2" : ""}>
              <h4 className="mb-2 font-serif text-[15px] font-semibold">
                후보 {ci + 1}. {c.name} {body.chosen === ci ? <span className="text-[12px] font-normal text-pine">· 선택됨</span> : null}
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {c.samples.map((k, si) =>
                  k ? (
                    <label key={k} className="block cursor-pointer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(k)} alt={`후보 ${ci + 1} 장면 ${si + 1}`} className="w-full rounded-[5px] border border-line" loading="lazy" />
                      <span className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 text-[12px]">
                        <input type="checkbox" name="masters" value={k} defaultChecked={masters.has(k)} disabled={!canApprove} className="size-4 accent-[var(--color-pine)]" />
                        마스터로
                      </span>
                    </label>
                  ) : (
                    <div key={si} className="grid aspect-[3/4] place-items-center rounded-[5px] border border-dashed border-line text-[12px] text-ink-faint">
                      그림 없음
                    </div>
                  ),
                )}
              </div>
              <details className="mt-2 text-[13px]">
                <summary className="cursor-pointer text-[12px] text-indigo">화풍 카드</summary>
                <div className="mt-2 whitespace-pre-wrap leading-relaxed">{c.card}</div>
              </details>
            </section>
          ))}
        </div>
        {canApprove ? (
          <div className="mt-4 border-t border-line pt-4">
            <Button type="submit" variant="seal">
              고른 그림을 화풍 마스터로 승인
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

/** ④ 화풍 생성 전에 올리는 참고 웹툰 캡처. 비공개로 두고 기준 값 분석에만 써요. */
export function StyleRefs({ seriesId, refs, back }: { seriesId: string; refs: string[]; back: string }) {
  return (
    <div className="mb-4 rounded-[5px] border border-line px-4 py-3 text-[13px]">
      <p className="font-medium">참고 웹툰 캡처 {refs.length ? `${refs.length}장` : ""}</p>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        목표로 삼을 웹툰 화면을 3~8장 올리면, AI가 선 굵기·채색 단계·비율 같은 기준 값만 뽑아 화풍 후보에 반영해요. 캡처는 비공개로 두고 그림 모델에는 보내지 않아요.
      </p>
      {refs.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {refs.map((k) => (
            <form key={k} action={updateStyleRefs} className="w-[96px] flex-none">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="seriesId" value={seriesId} />
              <input type="hidden" name="remove" value={k} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/studio/private-media/${k}`} alt="참고 캡처" className="aspect-[3/4] w-full rounded-[4px] border border-line object-cover" />
              <button type="submit" className="mt-1 text-[11px] text-ink-faint hover:text-plum">
                빼기
              </button>
            </form>
          ))}
        </div>
      ) : null}
      {refs.length < 8 ? (
        <form action={updateStyleRefs} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="seriesId" value={seriesId} />
          <input type="file" name="files" accept="image/png,image/jpeg,image/webp" multiple className="text-[12px]" />
          <Button type="submit">올리기</Button>
        </form>
      ) : null}
    </div>
  );
}
