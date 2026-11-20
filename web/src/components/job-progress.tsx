import { estimate, formatRemaining, type JobView } from "@/lib/progress";

/** 작업 하나의 진행 막대와 남은 시간 */
export function JobProgressBar({ job, typical }: { job: JobView; typical?: number }) {
  const e = estimate(job, typical);
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
        <span className="text-ink-soft">{e.label}</span>
        <span className="text-ink-faint tabular-nums">
          {e.percent !== null ? `${e.percent}%` : ""} {formatRemaining(e.remainingSec)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-sunk" role="progressbar" aria-valuenow={e.percent ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        {e.percent !== null ? (
          <div className="h-full rounded-full bg-indigo transition-[width]" style={{ width: `${Math.max(3, e.percent)}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo/60" />
        )}
      </div>
    </div>
  );
}
