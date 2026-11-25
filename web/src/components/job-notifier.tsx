"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

type Finished = { id: string; ok: boolean; title: string; href: string };
const SEEN = "noriva.seenJobs";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(s: Set<string>) {
  try {
    sessionStorage.setItem(SEEN, JSON.stringify([...s].slice(-200)));
  } catch {
    /* 저장이 안 되는 브라우저면 이번 화면에서만 기억해요 */
  }
}

/** 작업이 끝나면 브라우저 알림과 화면 아래 알림을 띄워요. 스튜디오 화면 어디서든 20초마다 확인해요. */
export function JobNotifier() {
  const router = useRouter();
  const sysPerm = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported" as const,
  );
  const [asked, setPerm] = useState<NotificationPermission | null>(null);
  const perm = asked ?? sysPerm;
  const [toasts, setToasts] = useState<Finished[]>([]);

  useEffect(() => {
    const seen = loadSeen();
    let first = true;
    const tick = async () => {
      if (document.visibilityState !== "visible" && perm !== "granted") return;
      try {
        const res = await fetch("/studio/feed", { cache: "no-store" });
        if (!res.ok) return;
        const { jobs } = (await res.json()) as { jobs: Finished[] };
        // 새 탭을 막 열었을 때는 이미 끝나 있던 작업으로 알림을 몰아 띄우지 않아요
        const silent = first && seen.size === 0;
        first = false;
        const fresh = jobs.filter((j) => !seen.has(j.id));
        fresh.forEach((j) => seen.add(j.id));
        saveSeen(seen);
        if (silent || !fresh.length) return;
        for (const j of fresh) {
          if (perm === "granted" && document.visibilityState !== "visible") {
            const n = new Notification(j.ok ? "작업이 끝났어요" : "작업이 실패했어요", { body: j.title, tag: j.id });
            n.onclick = () => {
              window.focus();
              router.push(j.href);
            };
          }
        }
        setToasts((t) => [...fresh, ...t].slice(0, 3));
        router.refresh();
      } catch {
        /* 다음 확인 때 다시 시도해요 */
      }
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [perm, router]);

  return (
    <>
      {perm === "default" ? (
        <button
          type="button"
          onClick={async () => setPerm(await Notification.requestPermission())}
          className="hidden text-[12px] text-ink-soft underline-offset-4 hover:underline md:inline"
        >
          작업 완료 알림 켜기
        </button>
      ) : null}
      {toasts.length ? (
        <div className="fixed right-4 bottom-4 z-50 flex w-[300px] flex-col gap-2">
          {toasts.map((j) => (
            <div key={j.id} className="rounded-[6px] border border-line-strong bg-paper-raised px-4 py-3 text-[13px] shadow-lg">
              <div className={`font-medium ${j.ok ? "text-pine" : "text-plum"}`}>{j.ok ? "작업이 끝났어요" : "작업이 실패했어요"}</div>
              <a href={j.href} className="mt-0.5 block text-ink hover:text-indigo">
                {j.title}
              </a>
              <button
                type="button"
                onClick={() => setToasts((t) => t.filter((x) => x.id !== j.id))}
                className="mt-1 text-[11px] text-ink-faint hover:underline"
              >
                닫기
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
