"use client";

import { useCallback, useEffect, useState } from "react";

type Pic = { src: string; alt: string };

/**
 * 누르면 화면 가득 크게 보여주는 그림. 바깥을 누르거나 Esc로 닫혀요.
 * gallery를 넘기면 ← → 키나 좌우 버튼으로 같은 묶음의 그림을 넘겨 볼 수 있어요.
 */
export function ZoomImage({
  src,
  alt,
  className,
  loading,
  gallery,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  gallery?: Pic[];
}) {
  const pics = gallery?.length ? gallery : [{ src, alt }];
  const start = Math.max(0, pics.findIndex((p) => p.src === src));
  const [at, setAt] = useState<number | null>(null);
  const many = pics.length > 1;
  const step = useCallback((d: number) => setAt((i) => (i === null ? i : (i + d + pics.length) % pics.length)), [pics.length]);

  useEffect(() => {
    if (at === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAt(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [at, step]);

  const cur = at === null ? null : pics[at];
  const navBtn = "absolute top-1/2 -translate-y-1/2 grid size-11 place-items-center rounded-full bg-white/15 text-[22px] text-white hover:bg-white/30";
  return (
    <>
      <button type="button" onClick={() => setAt(start)} className="block w-full cursor-zoom-in" title="크게 보기">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} loading={loading} />
      </button>
      {cur ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={cur.alt}
          onClick={() => setAt(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.src} alt={cur.alt} className="max-h-[86vh] max-w-full rounded-[5px] object-contain" />
          {many ? (
            <>
              <button type="button" aria-label="이전" onClick={(e) => (e.stopPropagation(), step(-1))} className={`${navBtn} left-3`}>
                ‹
              </button>
              <button type="button" aria-label="다음" onClick={(e) => (e.stopPropagation(), step(1))} className={`${navBtn} right-3`}>
                ›
              </button>
            </>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-white/80">
            <span>
              {cur.alt}
              {many ? ` (${(at ?? 0) + 1}/${pics.length})` : ""}
            </span>
            <a href={cur.src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline underline-offset-2">
              원본 열기
            </a>
            <span className="text-white/50">닫기: 바깥 누르기 또는 Esc{many ? " · 넘기기: ← →" : ""}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
