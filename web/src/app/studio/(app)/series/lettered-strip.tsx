"use client";

import { useState } from "react";
import { joinStyles, toJoin } from "@/lib/publish";

export type Bubble = {
  speaker: string;
  shape: "speech" | "thought" | "shout" | "whisper" | "narration";
  text: { ko: string; en: string };
  box: { x: number; y: number; w: number; h: number };
  tail: { x: number; y: number } | null;
};
export type LetteredPanel = {
  index: number;
  image: string;
  height: string;
  gap_before: string;
  join?: { overlap?: number; margin?: number };
  bubbles: Bubble[];
  sfx: { text: { ko: string; en: string }; x: number; y: number; size: number; angle: number } | null;
};

const GAP = { none: "mt-1", normal: "mt-6", long: "mt-16" } as const;

/** 세로 스크롤 미리보기: 그림 위에 말풍선 레이어를 얹어 독자 화면처럼 보여줘요. 글자는 그림에 굽지 않아요. */
export function LetteredStrip({ panels }: { panels: LetteredPanel[] }) {
  const [lang, setLang] = useState<"ko" | "en">("ko");
  return (
    <div>
      <div role="group" aria-label="미리보기 언어" className="mb-3 inline-flex rounded-[5px] border border-line p-0.5 text-[13px]">
        {(["ko", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={`min-h-[36px] rounded-[4px] px-3 ${lang === l ? "bg-ink text-paper" : "text-ink-soft"}`}
          >
            {l === "ko" ? "한국어" : "English"}
          </button>
        ))}
      </div>
      <div className="max-h-[760px] overflow-y-auto rounded-[5px] bg-paper-sunk px-3 py-4">
        <div className="mx-auto w-full max-w-[360px]">
          {panels.map((p, i) => {
            const join = i === 0 || !p.image ? undefined : toJoin(p.join);
            const js = joinStyles(join);
            return (
            <figure key={p.index} className={`relative ${i === 0 || join ? "" : GAP[p.gap_before as keyof typeof GAP] ?? GAP.normal}`} style={js.figure}>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={`${p.index}컷`} className="block w-full" style={js.img} loading="lazy" />
              ) : (
                <div className="aspect-[3/4] w-full bg-line" />
              )}
              {p.bubbles.map((b, j) => (
                <BubbleLayer key={j} b={b} text={b.text[lang] || b.text.ko} />
              ))}
              {p.sfx ? (
                <span
                  className="pointer-events-none absolute font-serif font-bold text-paper-raised [text-shadow:0_0_3px_#24221f,0_0_1px_#24221f]"
                  style={{
                    left: `${p.sfx.x}%`,
                    top: `${p.sfx.y}%`,
                    fontSize: `${Math.max(12, p.sfx.size * 1.6)}px`,
                    transform: `translate(-50%, -50%) rotate(${p.sfx.angle}deg)`,
                  }}
                >
                  {p.sfx.text[lang] || p.sfx.text.ko}
                </span>
              ) : null}
              <figcaption className="absolute -left-1 top-1 -translate-x-full text-[10px] text-ink-faint">{p.index}</figcaption>
            </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BubbleLayer({ b, text }: { b: Bubble; text: string }) {
  const narration = b.shape === "narration";
  const shape =
    narration
      ? "rounded-[2px] bg-paper-raised/95 border border-ink/20"
      : b.shape === "thought"
        ? "rounded-[40%] bg-paper-raised/95 border border-dashed border-ink/40"
        : b.shape === "shout"
          ? "rounded-[6px] bg-paper-raised border-2 border-ink"
          : "rounded-[50%] bg-paper-raised border border-ink/70";
  return (
    <>
      {b.tail ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1={b.box.x + b.box.w / 2}
            y1={b.box.y + b.box.h / 2}
            x2={b.tail.x}
            y2={b.tail.y}
            stroke="#24221F"
            strokeOpacity="0.7"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <div
        className={`absolute grid place-items-center px-[6%] text-center leading-snug text-ink ${shape} ${b.shape === "whisper" ? "italic" : ""}`}
        style={{
          left: `${b.box.x}%`,
          top: `${b.box.y}%`,
          width: `${b.box.w}%`,
          minHeight: `${b.box.h}%`,
          fontSize: "12px",
          fontWeight: b.shape === "shout" ? 700 : 500,
        }}
      >
        <span className="py-1.5">{text}</span>
      </div>
    </>
  );
}
