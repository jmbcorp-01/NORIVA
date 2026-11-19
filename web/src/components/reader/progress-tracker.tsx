"use client";

import { useEffect } from "react";

/** 뷰어에서 화면에 들어온 가장 아래 컷 번호를 모아 몇 초마다, 그리고 떠날 때 저장해요. */
export function ProgressTracker({ slug, ep, panelCount }: { slug: string; ep: number; panelCount: number }) {
  useEffect(() => {
    let max = 0;
    let sent = 0;
    const send = (beacon = false) => {
      if (max <= sent) return;
      sent = max;
      const body = JSON.stringify({ slug, ep, maxPanel: max, panelCount });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
      else fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const n = Number((e.target as HTMLElement).dataset.panel);
          if (n > max) max = n;
        }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll<HTMLElement>("[data-panel]").forEach((el) => io.observe(el));
    const timer = setInterval(() => send(), 5000);
    const leave = () => send(true);
    window.addEventListener("pagehide", leave);
    return () => {
      io.disconnect();
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      send(true);
    };
  }, [slug, ep, panelCount]);
  return null;
}
