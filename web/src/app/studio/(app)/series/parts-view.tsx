import { Badge, Button, Input } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";
import { lockParts, redrawParts } from "../../actions";
import { mediaUrl } from "./panel-views";

export type Part = {
  id: string;
  name: string;
  kind?: "object" | "attire" | "hair";
  owners: string[];
  description: string;
  photos?: number;
  variants?: { image: string; issues: { item: string; severity: "critical" | "major" }[] }[];
  recommended?: number;
  locked?: string | null;
};

const PART_KIND: Record<string, string> = { object: "소품", attire: "옷차림", hair: "머리 모양" };

/** ④+ 부품 고르기: 부품마다 후보 4장 중 맞는 것을 골라 잠가요. 모두 잠그면 잠근 부품으로 인물 시트를 그려요. */
export function PartsView({
  parts,
  names,
  artifactId,
  seriesId,
  back,
  canAct,
}: {
  parts: Part[];
  names: Record<string, string>;
  artifactId: string;
  seriesId: string;
  back: string;
  canAct: boolean;
}) {
  const locked = parts.filter((p) => p.locked).length;
  const gallery = parts.flatMap((p) => (p.variants ?? []).map((v, i) => ({ src: mediaUrl(v.image), alt: `${p.name} 후보 ${i + 1}` })));
  return (
    <div className="space-y-4">
      <div className="rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px] leading-relaxed">
        <p className="font-medium">부품을 먼저 골라 잠가요 ({locked}/{parts.length} 잠김)</p>
        <p className="mt-1 text-ink-soft">
          그림 모델이 잘 틀리는 칼·도구, 시대 옷차림, 주인공 머리 모양을 따로 4장씩 그렸어요. 맞는 후보를 고르면 그 그림이 이 작품의 기준이 되어,
          인물 시트와 모든 회차가 그대로 따라 그려요. 빨간 표시는 AI가 본 고증 문제예요. 고르는 건 대표님이 정해요.
        </p>
        <p className="mt-1 text-ink-faint">맞는 후보가 없으면 아래에서 그 부품만 다시 그려요. 모두 잠가야 인물 시트를 그릴 수 있어요.</p>
      </div>

      <form action={lockParts} className="space-y-5">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="artifactId" value={artifactId} />
        <input type="hidden" name="seriesId" value={seriesId} />
        {parts.map((p) => (
          <fieldset key={p.id} className="rounded-[6px] border border-line p-3">
            <legend className="px-1 text-[14px] font-semibold">
              {p.name} <span className="text-[12px] font-normal text-ink-faint">{PART_KIND[p.kind ?? "object"] ?? "부품"}</span>{" "}
              {p.locked ? <Badge tone="pine">잠김</Badge> : null}
            </legend>
            <p className="text-[12px] text-ink-soft">
              {p.owners.map((o) => names[o] ?? o).join(", ")} · 실물 사진 {p.photos ?? 0}장 참고
              {p.photos ? "" : " (사진이 없으면 모양이 틀리기 쉬워요. 고증 사진을 올리면 다시 그릴 때 써요)"}
            </p>
            <details className="mt-1 text-[12px] text-ink-faint">
              <summary className="cursor-pointer text-indigo">생김새 설명</summary>
              <p className="mt-1">{p.description}</p>
            </details>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(p.variants ?? []).map((v, i) => {
                const crit = v.issues.some((x) => x.severity === "critical");
                return (
                  <label key={v.image} className="block cursor-pointer">
                    <ZoomImage src={mediaUrl(v.image)} alt={`${p.name} 후보 ${i + 1}`} gallery={gallery} className="w-full rounded-[5px] border border-line" loading="lazy" />
                    <span className="mt-1 flex min-h-[36px] items-center gap-1.5 text-[12px]">
                      <input
                        type="radio"
                        name={`pick:${p.id}`}
                        value={v.image}
                        defaultChecked={p.locked ? p.locked === v.image : false}
                        disabled={!canAct}
                        className="size-4 accent-[var(--color-pine)]"
                      />
                      후보 {i + 1}
                      {p.recommended === i ? <span className="text-pine">· AI 추천</span> : null}
                    </span>
                    {v.issues.length ? (
                      <span className={crit ? "block text-[12px] text-plum" : "block text-[12px] text-ink-soft"}>
                        {v.issues.map((x) => x.item).join(", ")}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {canAct ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" name="intent" value="lock" variant="quiet">
              고른 부품 잠그기
            </Button>
            <Button type="submit" name="intent" value="compose" variant="seal">
              잠그고 인물 시트 그리기
            </Button>
          </div>
        ) : null}
      </form>

      {canAct ? (
        <form action={redrawParts} className="rounded-[6px] border border-line p-3 text-[13px]">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="artifactId" value={artifactId} />
          <input type="hidden" name="seriesId" value={seriesId} />
          <p className="font-medium">맞는 후보가 없는 부품만 다시 그리기</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((p) => (
              <label key={p.id} className="inline-flex min-h-[36px] items-center gap-1.5">
                <input type="checkbox" name="parts" value={p.id} className="size-4 accent-[var(--color-pine)]" />
                {p.name}
              </label>
            ))}
          </div>
          <Input name="instruction" placeholder="바꿀 점 (예: 손잡이 끝에 둥근 고리, 칼날 사이 보호판 없이)" className="mt-2" />
          <Button type="submit" variant="quiet" className="mt-2">
            고른 부품 후보 다시 그리기
          </Button>
        </form>
      ) : null}
    </div>
  );
}
