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
  bubbles: LetteredBubble[];
  sfx: { text: { ko: string; en: string }; x: number; y: number; size: number; angle: number } | null;
};

export class PublishError extends Error {}

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
    return {
      index: p.index,
      image: p.image,
      gapBefore: (GAPS as readonly string[]).includes(p.gap_before ?? "") ? (p.gap_before as PublishedPanel["gapBefore"]) : "normal",
      bubbles,
      sfx: p.sfx && sfxText ? { text: sfxText, x: p.sfx.x, y: p.sfx.y, size: p.sfx.size, angle: p.sfx.angle } : null,
    };
  });
}
