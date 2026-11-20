import { Badge, Button, Input } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";
import { imageModelLabel } from "@/lib/pipeline";
import { addSeriesRules, redrawParts, redrawSheets, updateHistoryRefs } from "../../actions";
import { mediaUrl } from "./panel-views";
import { type Part, PartsView } from "./parts-view";

type Defect = { code: string; severity: "critical" | "major" | "minor"; note: string };
/** 점수는 그림 솜씨가 아니라 명세·고증 위반 개수로 매겨요(치명 −30, 주요 −10). 무엇을 어겼는지 같이 보여 줘요. */
function violations(critical: number, major: number): string {
  const parts = [critical ? `치명 ${critical}` : "", major ? `주요 ${major}` : ""].filter(Boolean);
  return parts.length ? `위반 ${parts.join(" · ")}` : "위반 없음";
}

const STOPPED: Record<string, string> = {
  stalled: "고쳐 그려도 같은 문제가 반복돼서 더 그리지 않고 멈췄어요. 아래 문제를 보고 지시를 남겨 주세요.",
  budget: "이번 실행의 다시 그리기 비용 상한에 닿아 멈췄어요.",
};

function count(defects: Defect[] | undefined, s: Defect["severity"]): number {
  return (defects ?? []).filter((d) => d.severity === s).length;
}

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
  candidates?: { image: string; score: number; critical?: number; major?: number }[];
  stopped?: "" | "stalled" | "budget";
  part_checks?: { id: string; name?: string; matches: boolean; note?: string }[];
};
type SheetsBody = {
  kind: "sheets";
  phase?: "parts" | "sheets";
  parts?: Part[];
  characters: SheetChar[];
  medium?: string;
  model?: string | null;
  redrawn?: string[];
  rule_suggestions?: string[];
  master_warnings?: { item: string; note: string; characters: string[] }[];
  clean_masters?: string[];
  found_photos?: { prop: string; image: string; title: string; page: string; license: string; artist: string }[];
  photo_notes?: { index: number; real_photo: boolean; props: string[]; note: string }[];
  props?: { id: string; name: string; owners: string[]; description: string; kind?: string; image?: string; score?: number; passed?: boolean; as_ref?: boolean; stopped?: "" | "stalled" | "budget"; defects?: Defect[] }[];
  spec_fixes?: { id: string; name: string; changes: string }[];
  retry_spent_usd?: number;
  search_log?: { prop: string; queries: string[]; candidates: number; accepted: number; notes: string[] }[];
  summary: { characters: number; passed: number; parts?: number; parts_locked?: number };
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
  if (body.phase === "parts") {
    return (
      <PartsView
        parts={body.parts ?? []}
        names={Object.fromEntries(body.characters.map((c) => [c.id, c.name]))}
        artifactId={artifactId}
        seriesId={seriesId}
        back={back}
        canAct={canRedraw}
      />
    );
  }
  const partName = Object.fromEntries((body.parts ?? []).map((p) => [p.id, p.name]));
  const pics = body.characters.filter((c) => c.sheet).map((c) => ({ src: mediaUrl(c.sheet!), alt: `${c.name} 인물 시트` }));
  const failed = body.characters.filter((c) => typeof c.score === "number" && !c.passed);
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
      {failed.length ? (
        <div className="mt-2 rounded-[5px] border border-plum/40 px-3 py-2 text-[12px]">
          <p className="font-medium text-plum">
            불합격 {failed.length}명: 승인하면 ⑦ 작화가 이 시트를 모든 회차에서 그대로 따라 그려요. 아래에서 체크해 둔 인물부터 다시 그리기를 권해요.
          </p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {failed.map((c) => (
              <li key={c.id}>
                {c.name} {c.score}점 ({violations(count(c.defects, "critical"), count(c.defects, "major"))}) · {(c.defects ?? []).filter((d) => d.severity !== "minor").slice(0, 2).map((d) => d.note).join(" / ") || "기준 점수 미달"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-faint">점수는 그림 솜씨가 아니라 인물 명세와 ③+ 고증 자료를 어긴 개수로 매겨요. 치명 1개에 30점, 주요 1개에 10점이 깎여요.</p>
          <p className="mt-1 text-ink-faint">다시 그리면 지난 검사에서 걸린 치명·주요 문제를 자동으로 고치라고 넣어요. 지시는 더 바꾸고 싶은 것만 적으면 돼요.</p>
        </div>
      ) : null}
      {body.spec_fixes?.length ? (
        <details className="mt-2 text-[12px] text-ink-soft">
          <summary className="cursor-pointer text-indigo">그리기 전 글 검사로 고친 명세 {body.spec_fixes.length}개</summary>
          <ul className="mt-1 space-y-0.5">
            {body.spec_fixes.map((f) => (
              <li key={f.id}>
                {f.name || f.id}: {f.changes || "명세를 고증 자료에 맞췄어요"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {body.clean_masters?.length ? (
        <div className="mt-2 text-[12px] text-ink-soft">
          <p>화풍 마스터의 머리·옷을 ③+ 고증 자료대로 고치고 금지 소품과 장식을 지운 깨끗한 마스터로 그렸어요. ⑦ 작화도 이 그림을 써요.</p>
          <div className="mt-1 flex gap-2">
            {body.clean_masters.map((k) => (
              <ZoomImage key={k} src={mediaUrl(k)} alt="깨끗한 화풍 마스터" className="h-24 w-auto rounded-[4px] border border-line" loading="lazy" />
            ))}
          </div>
        </div>
      ) : null}
      {body.photo_notes?.some((p) => !p.real_photo || !p.props.length) ? (
        <div className="mt-2 rounded-[5px] border border-plum/40 px-3 py-2 text-[12px]">
          <p className="font-medium text-plum">쓰지 않은 고증 사진이 있어요. 박물관 실물 사진으로 바꿔 주세요 (예: e뮤지엄 emuseum.go.kr).</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {body.photo_notes
              .filter((p) => !p.real_photo || !p.props.length)
              .map((p) => (
                <li key={p.index}>
                  {p.index + 1}번 사진: {p.real_photo ? "어느 소품과도 맞지 않아요." : "실물 사진이 아니에요."} {p.note}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {body.master_warnings?.length ? (
        <p className="mt-2 text-[12px] text-plum">
          화풍 마스터에 금지 소품이 있어서 해당 인물은 마스터 없이 그렸어요: {body.master_warnings.map((w) => `${w.item}${w.characters.length ? ` (${w.characters.join(", ")})` : ""}`).join(" · ")}
        </p>
      ) : null}
      <p className="mt-1 text-[12px] text-ink-faint">
        승인하면 ⑦ 작화가 모든 회차에서 이 시트와 외모 명세를 그대로 써요. 칼·옷·머리 모양이 시대에 맞는지, 세 방향이 같은 사람인지 크게 보며 확인하세요.
      </p>
      {body.props?.length ? (
        <div className="mt-4">
          <p className="text-[13px] font-medium">소품·의상 시트</p>
          <p className="text-[12px] text-ink-faint">고증 사진을 보고 소품과 시대 옷차림만 먼저 그렸어요. 인물 시트와 ⑦ 작화가 이 모양을 그대로 따라요.</p>
          {body.search_log?.some((l) => !l.accepted) ? (
            <details className="mt-1 text-[12px] text-ink-soft">
              <summary className="cursor-pointer text-indigo">실물 사진을 못 찾은 항목 {body.search_log.filter((l) => !l.accepted).length}개</summary>
              <ul className="mt-1 space-y-0.5">
                {body.search_log
                  .filter((l) => !l.accepted)
                  .map((l) => (
                    <li key={l.prop}>
                      {body.props?.find((p) => p.id === l.prop)?.name ?? l.prop}: 검색어 {l.queries.join(" / ")} · 후보 {l.candidates}장
                      {l.notes.length ? ` · ${l.notes.join(" ")}` : ""}
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-ink-faint">박물관 실물 사진을 직접 올리면 그 사진을 먼저 써요 (예: e뮤지엄 emuseum.go.kr).</p>
            </details>
          ) : null}
          {body.found_photos?.length ? (
            <div className="mt-2 text-[12px] text-ink-soft">
              <p>직접 찾아 쓴 실물 사진 (위키미디어 공용, 자유 이용 라이선스)</p>
              <ul className="mt-1 flex gap-3 overflow-x-auto pb-1">
                {body.found_photos.map((f) => (
                  <li key={f.image} className="w-[140px] flex-none">
                    <ZoomImage src={mediaUrl(f.image)} alt={f.title} className="aspect-square w-full rounded-[4px] border border-line object-cover" loading="lazy" />
                    <a href={f.page} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-indigo hover:underline">
                      {f.title}
                    </a>
                    <span className="block truncate text-ink-faint">
                      {f.license}
                      {f.artist ? ` · ${f.artist}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {body.props.map((p) => (
              <li key={p.id} className="text-[12px]">
                {p.image ? (
                  <ZoomImage src={mediaUrl(p.image)} alt={`${p.name} 소품 시트`} className="w-full rounded-[5px] border border-line" loading="lazy" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-[5px] border border-dashed border-line text-ink-faint">그림 없음</div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.kind === "attire" ? <span className="text-ink-faint">의상</span> : null}
                  <span className="text-ink-faint">{p.owners.join(", ")}</span>
                  {typeof p.score === "number" ? <Badge tone={p.passed ? "pine" : "plum"}>{p.score}점</Badge> : null}
                  {typeof p.score === "number" ? <span className="text-ink-faint">{violations(count(p.defects, "critical"), count(p.defects, "major"))}</span> : null}
                </div>
                {p.stopped ? <p className="text-ink-soft">{STOPPED[p.stopped]}</p> : null}
                {p.defects?.filter((d) => d.severity !== "minor").map((d, i) => (
                  <p key={i} className={d.severity === "critical" ? "text-plum" : "text-ink-soft"}>
                    [{SEVERITY[d.severity]}] {d.note}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
                      후보 {i + 1} · {x.score}점{typeof x.critical === "number" ? ` (${violations(x.critical, x.major ?? 0)})` : ""}
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
                {typeof c.score === "number" ? <span className="text-[12px] text-ink-faint">{violations(count(c.defects, "critical"), count(c.defects, "major"))}</span> : null}
              </div>
              {c.stopped ? <p className="mt-1 text-[12px] text-plum">{STOPPED[c.stopped]}</p> : null}
              <p className="mt-1 text-ink-soft">{c.appearance}</p>
              {c.period_notes ? <p className="mt-1 text-[12px] text-ink-soft">고증: {c.period_notes}</p> : null}
              {c.never?.length ? <p className="mt-1 text-[12px] text-plum">금지: {c.never.join(", ")}</p> : null}
              {c.part_checks?.length ? (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                  {c.part_checks.map((pc) => (
                    <li key={pc.id} className={pc.matches ? "text-pine" : "text-plum"} title={pc.note || undefined}>
                      {pc.matches ? "✓" : "✗"} {partName[pc.id] ?? pc.name ?? pc.id}
                      {!pc.matches && pc.note ? ` (${pc.note})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
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
                  <input type="checkbox" name="chars" value={c.id} defaultChecked={typeof c.score === "number" && !c.passed} className="size-4 accent-[var(--color-pine)]" />이 인물 다시 그리기
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
      {canRedraw && body.parts?.length ? (
        <form action={redrawParts} className="mt-4 rounded-[5px] border border-line px-3 py-3 text-[13px]">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="artifactId" value={artifactId} />
          <input type="hidden" name="seriesId" value={seriesId} />
          <p className="font-medium">잠근 부품 바꾸기</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">고른 부품만 후보 4장을 새로 그려요. 다른 부품은 잠근 그대로 두고, 다시 골라 잠근 뒤 인물 시트를 그려요.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {body.parts.map((p) => (
              <label key={p.id} className="inline-flex min-h-[36px] items-center gap-1.5">
                <input type="checkbox" name="parts" value={p.id} className="size-4 accent-[var(--color-pine)]" />
                {p.name}
              </label>
            ))}
          </div>
          <Input name="instruction" placeholder="바꿀 점 (예: 손잡이 끝에 둥근 고리)" className="mt-2" />
          <Button type="submit" variant="quiet" className="mt-2">
            고른 부품 후보 다시 그리기
          </Button>
        </form>
      ) : null}
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
      {!refs.length ? (
        <p className="mt-2 text-[12px] text-plum">
          아직 고증 사진이 없어요. 사극·시대물이면 주인공의 무기와 옷 사진을 먼저 올리세요. 사진 없이 글로만 설명하면 그림 모델이 일본도나 기모노처럼 익숙한 모양으로 그리기 쉬워요.
        </p>
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
