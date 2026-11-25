"use client";

import { useState } from "react";
import { Notice } from "./ui";

/**
 * 버튼을 눌렀는데 막혔을 때(제작비 상한, 앞 단계 미승인 등) 보이는 알림.
 * 화면 위쪽 알림만 있으면 아래쪽 단계에서 누른 사람은 못 보고 "아무 반응 없음"으로 느껴요.
 * 그래서 화면 아래에도 떠 있는 알림을 함께 보여 줘요.
 */
export function ErrorNotice({ children }: { children?: string | null }) {
  const [open, setOpen] = useState(true);
  if (!children) return null;
  return (
    <>
      <Notice>{children}</Notice>
      {open ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-[5px] bg-plum-soft px-4 py-3 text-[13px] text-plum shadow-lg"
        >
          <p className="flex-1">{children}</p>
          <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-[12px] underline">
            닫기
          </button>
        </div>
      ) : null}
    </>
  );
}
