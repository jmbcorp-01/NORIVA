"use client";

import { useEffect, useState } from "react";

/** 누르면 화면 가득 크게 보여주는 그림. 바깥을 누르거나 Esc로 닫혀요. */
export function ZoomImage({ src, alt, className, loading }: { src: string; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in" title="크게 보기">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} loading={loading} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[88vh] max-w-full rounded-[5px] object-contain" />
          <div className="mt-3 flex items-center gap-4 text-[13px] text-white/80">
            <span>{alt}</span>
            <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline underline-offset-2">
              원본 새 창에서 열기
            </a>
            <span className="text-white/50">닫기: 바깥 누르기 또는 Esc</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
