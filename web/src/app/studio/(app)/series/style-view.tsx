import { Button } from "@/components/ui";
import { IMAGE_MODELS, imageModelLabel } from "@/lib/pipeline";
import type { StyleWork } from "@/db/schema";
import { approveStyle, findStyleWorks, setImageModel, setStyleChoice, updateStyleRefs } from "../../actions";
import { mediaUrl } from "./panel-views";
import { ZoomImage } from "@/components/zoom-image";

type StyleBody = {
  kind: "style";
  markdown: string;
  criteria: Record<string, string | number> | null;
  candidates: { name: string; medium?: string; card: string; style_prompt: string; samples: (string | null)[] }[];
  scenes: { title: string; prompt: string }[];
  model?: string | null;
  style_masters?: string[];
  chosen?: number | null;
  picked?: string[];
};

const MEDIUM_LABEL: Record<string, string> = { cel: "셀 채색", painterly: "브러시 채색", ink: "현대 수묵" };

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
  const samplePics = body.candidates.flatMap((c, ci) =>
    c.samples.flatMap((k, si) => (k ? [{ src: mediaUrl(k), alt: `후보 ${ci + 1} 장면 ${si + 1}` }] : [])),
  );
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

      {body.picked?.length ? (
        <p className="text-[12px] text-ink-soft">참고한 화풍: {body.picked.join(", ")} (선·채색 같은 특징만 반영했어요)</p>
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
                후보 {ci + 1}. {c.name}{" "}
                {c.medium ? <span className="text-[12px] font-normal text-ink-faint">({MEDIUM_LABEL[c.medium] ?? c.medium})</span> : null}{" "}
                {body.chosen === ci ? <span className="text-[12px] font-normal text-pine">· 선택됨</span> : null}
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {c.samples.map((k, si) =>
                  k ? (
                    <div key={k}>
                      <ZoomImage
                        src={mediaUrl(k)}
                        alt={`후보 ${ci + 1} 장면 ${si + 1}`}
                        gallery={samplePics}
                        className="w-full rounded-[5px] border border-line"
                        loading="lazy"
                      />
                      <label className="mt-1 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 text-[12px]">
                        <input type="checkbox" name="masters" value={k} defaultChecked={masters.has(k)} disabled={!canApprove} className="size-4 accent-[var(--color-pine)]" />
                        마스터로
                      </label>
                    </div>
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
function Traits({ traits }: { traits: Record<string, string | number> }) {
  return (
    <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
      {Object.entries(CRITERIA_LABEL).map(([k, label]) =>
        traits[k] !== undefined && traits[k] !== "" ? (
          <div key={k}>
            <dt className="inline font-medium">{label} </dt>
            <dd className="inline text-ink-soft">{String(traits[k])}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

/** ④ 화풍: ①~③에 맞는 시장 웹툰을 AI가 찾아 주고, 대표가 참고할 화풍을 고르는 칸 */
export function StyleScout({
  seriesId,
  back,
  suggestions,
  choice,
  busy,
  error,
}: {
  seriesId: string;
  back: string;
  suggestions?: { at: string; works: StyleWork[] };
  choice: number[];
  busy: boolean;
  error: string | null;
}) {
  const works = suggestions?.works ?? [];
  const picked = new Set(choice);
  return (
    <div className="mb-4 rounded-[5px] border border-line px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">어울리는 웹툰 화풍 {works.length ? `${works.length}편` : ""}</p>
        <form action={findStyleWorks} className="ml-auto">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="seriesId" value={seriesId} />
          <Button type="submit" disabled={busy}>
            {busy ? "찾는 중 (2~4분)" : works.length ? "다시 찾기" : "①~③에 맞는 웹툰 화풍 찾기"}
          </Button>
        </form>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        승인한 기획·스토리·인물을 읽고 장르·시대·분위기가 닮은 웹툰을 웹에서 찾아요. 마음에 드는 화풍을 1~3개 고른 뒤 ④를 생성하면, 그 작품의 선·채색·비율 같은 특징만 화풍 후보에 반영돼요. 작품 이름과 그림은 그림 모델에 보내지 않아요.
      </p>
      {error && !busy ? <p className="mt-2 text-[12px] text-plum">{error}</p> : null}
      {works.length ? (
        <form action={setStyleChoice} className="mt-3 space-y-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="seriesId" value={seriesId} />
          {works.map((w, i) => (
            <label
              key={i}
              className={`block cursor-pointer rounded-[5px] border px-3 py-2.5 ${picked.has(i) ? "border-ink bg-paper-sunk" : "border-line"}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <input type="checkbox" name="pick" value={i} defaultChecked={picked.has(i)} className="translate-y-[1px]" />
                <span className="font-medium">{w.title}</span>
                <span className="text-[12px] text-ink-faint">
                  {[w.platform, w.author].filter(Boolean).join(" · ")}
                </span>
                {w.url ? (
                  <a href={w.url} target="_blank" rel="noreferrer" className="ml-auto text-[12px] text-ink-soft underline">
                    작품 보기
                  </a>
                ) : null}
              </span>
              {w.why ? <span className="mt-1 block text-[12px] text-ink-soft">{w.why}</span> : null}
              <span className={`mt-1 inline-block text-[11px] ${w.measured ? "text-ink-soft" : "text-plum"}`}>
                {w.measured ? "공식 대표 이미지를 보고 잰 화풍 특징" : "그림을 확인하지 못해 글로 추정한 특징이에요. 이 작품을 고르려면 화면을 캡처해 아래에 올려 주세요."}
              </span>
              <Traits traits={w.traits} />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" variant="primary">
              고른 화풍으로 정하기
            </Button>
            <span className="text-[12px] text-ink-faint">
              {picked.size ? `${picked.size}개 골랐어요. ④를 생성(또는 다시 생성)하면 반영돼요.` : "최대 3개까지 고를 수 있어요."}
            </span>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** ④ 화풍 샘플과 ⑦ 작화에 쓸 그림 모델 고르기 */
export function ImageModelPicker({ seriesId, back, current }: { seriesId: string; back: string; current?: string }) {
  return (
    <form action={setImageModel} className="mb-4 flex flex-wrap items-center gap-2 rounded-[5px] border border-line px-4 py-3 text-[13px]">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <label htmlFor="image-model" className="font-medium">
        그림 모델
      </label>
      <select id="image-model" name="model" defaultValue={current ?? ""} className="rounded-[4px] border border-line-strong bg-paper px-2 py-1 text-[13px]">
        <option value="">기본 모델 (Nano Banana Pro)</option>
        {IMAGE_MODELS.filter((m) => m.id !== "fal-ai/nano-banana-pro").map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} (장당 약 ${m.price})
          </option>
        ))}
      </select>
      <Button type="submit">저장</Button>
      <span className="w-full text-[12px] text-ink-soft">
        지금 {imageModelLabel(current)}. ④ 샘플 9장과 ⑦ 작화가 이 모델로 그려요. 기본인 Nano Banana Pro가 지시를 가장 잘 따라 품질이 가장 좋아요. Seedream 4는 아시아 만화체에 강하고 저렴해요.
      </span>
    </form>
  );
}

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
