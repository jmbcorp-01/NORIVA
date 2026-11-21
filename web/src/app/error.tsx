"use client";

import Link from "next/link";

/** 오류 화면: 언어를 서버에서 읽을 수 없어서 두 언어를 함께 보여줘요 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="hanji flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[22px] font-bold">잠시 문제가 생겼어요</h1>
      <p className="mt-1 text-[14px] text-ink-soft">Something went wrong. Please try again.</p>
      <div className="mt-8 flex gap-2">
        <button onClick={reset} className="inline-flex h-12 items-center rounded-[6px] bg-ink px-6 text-[15px] font-bold text-paper">
          다시 시도 · Retry
        </button>
        <Link href="/" className="inline-flex h-12 items-center rounded-[6px] border border-line-strong px-6 text-[15px]">
          홈 · Home
        </Link>
      </div>
    </main>
  );
}
