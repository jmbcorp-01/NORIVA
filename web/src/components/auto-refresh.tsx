"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 작업이 도는 동안 화면을 주기적으로 새로 받아요. 탭이 안 보일 때는 쉬어요. */
export function AutoRefresh({ active, seconds = 10 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
