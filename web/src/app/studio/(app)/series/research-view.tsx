import { Badge } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";
import { mediaUrl } from "./panel-views";

type Photo = { image: string; title: string; page: string; license: string; artist: string };
type Item = {
  id: string;
  category: string;
  name: string;
  who: string[];
  description: string;
  mistakes: string[];
  certainty?: "high" | "medium" | "low";
  photos: Photo[];
};
type ResearchBody = {
  kind: "research";
  era: string;
  items: Item[];
  search_log?: { item: string; queries: string[]; candidates: number; accepted: number; notes: string[] }[];
  summary?: { items: number; with_photos: number };
};

const CATEGORY: Record<string, string> = {
  attire: "옷",
  hair: "머리 모양",
  headwear: "관모·머리 장식",
  weapon: "무기",
  tool: "도구",
  architecture: "건물",
  creature: "동물·요괴",
  other: "기타",
};
const CERTAINTY = { high: { label: "확실", tone: "pine" }, medium: { label: "추정", tone: "ochre" }, low: { label: "근거 약함", tone: "plum" } } as const;

export function isResearchBody(b: Record<string, unknown>): b is ResearchBody {
  return b.kind === "research" && Array.isArray(b.items);
}

/** ③+ 고증 자료: 항목별 맞는 생김새, 잘 틀리는 모습, 확인한 실물 사진 */
export function ResearchView({ body }: { body: ResearchBody }) {
  const pics = body.items.flatMap((it) => it.photos.map((p) => ({ src: mediaUrl(p.image), alt: `${it.name}: ${p.title}` })));
  const missing = (body.search_log ?? []).filter((l) => l.queries.length && !l.accepted);
  return (
    <div className="space-y-4 text-[13px]">
      <p>
        <span className="font-medium">시대</span> <span className="text-ink-soft">{body.era}</span>
      </p>
      <p className="text-[12px] text-ink-faint">
        승인하면 ④ 화풍, ④+ 인물 시트, ⑦ 작화와 모든 검사가 이 자료를 기준으로 그려요. 생김새가 틀렸거나 사진이 그 시대 실물이 아니면 지시에 적어 다시 만들어 주세요.
      </p>
      <ul className="space-y-4">
        {body.items.map((it) => (
          <li key={it.id} className="rounded-[5px] border border-line px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-[14px] font-semibold">{it.name}</span>
              <span className="text-[12px] text-ink-faint">{CATEGORY[it.category] ?? it.category}</span>
              {it.who.length ? <span className="text-[12px] text-ink-faint">· {it.who.join(", ")}</span> : null}
              {it.certainty ? <Badge tone={CERTAINTY[it.certainty].tone}>{CERTAINTY[it.certainty].label}</Badge> : null}
            </div>
            <p className="mt-1 leading-relaxed">{it.description}</p>
            {it.mistakes.length ? <p className="mt-1 text-[12px] text-plum">잘 틀리는 모습: {it.mistakes.join(", ")}</p> : null}
            {it.photos.length ? (
              <ul className="mt-2 flex gap-3 overflow-x-auto pb-1">
                {it.photos.map((p) => (
                  <li key={p.image} className="w-[150px] flex-none text-[12px]">
                    <ZoomImage src={mediaUrl(p.image)} alt={p.title} gallery={pics} className="aspect-square w-full rounded-[4px] border border-line object-cover" loading="lazy" />
                    <a href={p.page} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-indigo hover:underline">
                      {p.title}
                    </a>
                    <span className="block truncate text-ink-faint">
                      {p.license}
                      {p.artist ? ` · ${p.artist}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {missing.length ? (
        <details className="text-[12px] text-ink-soft">
          <summary className="cursor-pointer text-indigo">실물 사진을 못 찾은 항목 {missing.length}개</summary>
          <ul className="mt-1 space-y-0.5">
            {missing.map((l) => (
              <li key={l.item}>
                {body.items.find((it) => it.id === l.item)?.name ?? l.item}: 검색어 {l.queries.join(" / ")} · 후보 {l.candidates}장
                {l.notes.length ? ` · ${l.notes.join(" ")}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-faint">사진이 없어도 글로 된 생김새로 그려요. ④+에서 박물관 실물 사진을 직접 올리면 그 사진을 먼저 써요.</p>
        </details>
      ) : null}
    </div>
  );
}
