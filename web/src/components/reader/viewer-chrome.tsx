"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 뷰어 위·아래 막대. 그림을 누르거나 아래로 내리면 숨고, 위로 올리면 다시 나와요.
 * 아래 막대에는 읽은 만큼 차는 진행 막대가 있어요.
 */
export function ViewerChrome({ top, bottom, children }: { top: ReactNode; bottom: ReactNode; children: ReactNode }) {
  const [shown, setShown] = useState(true);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (y / max) * 100) : 100);
      if (Math.abs(y - last) > 12) setShown(y < last || y < 80 || y >= max - 40);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const slide = "transition-transform duration-200";
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm ${slide} ${shown ? "" : "-translate-y-full"}`}>
        {top}
      </header>
      <div onClick={(e) => (e.target as HTMLElement).closest("a,button,form") ? null : setShown((v) => !v)}>{children}</div>
      <div className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm ${slide} ${shown ? "" : "translate-y-full"}`}>
        <div className="h-[3px] bg-paper-sunk">
          <div className="h-full bg-ink" style={{ width: `${progress}%` }} />
        </div>
        {bottom}
      </div>
    </>
  );
}
