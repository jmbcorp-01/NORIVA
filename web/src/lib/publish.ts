import type { PublishedPanel } from "@/db/schema";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

type LetteredBubble = {
  shape: PublishedPanel["bubbles"][number]["shape"];
  text: { ko: string; en: string };
  box: { x: number; y: number; w: number; h: number };
  tail: { x: number; y: number } | null;
};
type LetteredPanel = {
  index: number;
  image: string;
  gap_before?: string;
  join?: { overlap?: number; margin?: number };
  effect?: string;
  bubbles: LetteredBubble[];
  sfx: { text: { ko: string; en: string }; x: number; y: number; size: number; angle: number } | null;
};

export class PublishError extends Error {}

/** 이어지는 컷 정보가 말이 되는 값일 때만 써요 (겹침이 너무 크면 앞 컷을 가려요). */
export function toJoin(j: LetteredPanel["join"]): PublishedPanel["join"] | undefined {
  const overlap = Number(j?.overlap);
  const margin = Number(j?.margin);
  if (!(overlap > 0 && overlap <= 0.5 && margin > 0 && margin <= 100)) return undefined;
  return { overlap, margin };
}

/** 이어지는 컷을 앞 컷 아래 끝에 겹쳐 놓는 스타일: 위로 당기고, 겹치는 띠는 위에서부터 서서히 보이게 섞어요. */
export function joinStyles(join: PublishedPanel["join"] | undefined) {
  if (!join) return { figure: undefined, img: undefined };
  const fade = `linear-gradient(to bottom, transparent 0%, #000 ${Math.round(join.overlap * 1000) / 10}%)`;
  return {
    figure: { marginTop: `-${join.margin}%` },
    img: { WebkitMaskImage: fade, maskImage: fade },
  };
}

const GAPS = ["none", "normal", "long"] as const;

/** 검수를 통과한 말풍선 결과를 언어 하나의 독자용 공개본으로 바꿔요. 빈 번역이 있으면 공개하지 않아요. */
export function toPublishedPanels(body: Record<string, unknown>, locale: Locale): PublishedPanel[] {
  if (body.kind !== "lettered" || !Array.isArray(body.panels)) throw new PublishError("말풍선 결과가 아니에요");
  const panels = body.panels as LetteredPanel[];
  if (panels.length === 0) throw new PublishError("컷이 없어요");
  return panels.map((p) => {
    if (!p.image) throw new PublishError(`${p.index}컷에 그림이 없어요`);
    const bubbles = p.bubbles.map((b) => {
      const text = (b.text[locale] ?? "").trim();
      if (!text) throw new PublishError(`${p.index}컷에 ${locale === "en" ? "영어" : "한국어"} 대사가 비어 있어요`);
      return { shape: b.shape, text, box: b.box, tail: b.tail };
    });
    const sfxText = p.sfx ? (p.sfx.text[locale] || p.sfx.text.ko).trim() : "";
    const join = toJoin(p.join);
    return {
      index: p.index,
      image: p.image,
      gapBefore: join ? "none" : (GAPS as readonly string[]).includes(p.gap_before ?? "") ? (p.gap_before as PublishedPanel["gapBefore"]) : "normal",
      ...(join ? { join } : {}),
      ...(p.effect === "focus" || p.effect === "speed" || p.effect === "flash" ? { effect: p.effect } : {}),
      bubbles,
      sfx: p.sfx && sfxText ? { text: sfxText, x: p.sfx.x, y: p.sfx.y, size: p.sfx.size, angle: p.sfx.angle } : null,
    };
  });
}
