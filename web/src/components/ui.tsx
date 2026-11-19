import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "seal" | "quiet" | "danger";
const variants: Record<Variant, string> = {
  // 기본 동작은 먹색, 낙관 빨강은 화면에서 가장 중요한 동작 하나에만
  primary: "bg-ink text-paper hover:bg-ink-soft",
  seal: "bg-seal text-[#fbf6ef] hover:opacity-90",
  quiet: "border border-line-strong text-ink hover:bg-paper-sunk",
  danger: "border border-line-strong text-plum hover:bg-plum-soft",
};
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] px-3.5 text-[13px] font-medium transition-colors disabled:opacity-40";

export function Button({ variant = "quiet", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btn, variants[variant], className)} {...p} />;
}

export function LinkButton({ variant = "quiet", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section className={cx("rounded-[var(--radius-card)] border border-line bg-paper-raised", className)} {...p} />;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="font-serif text-[22px] font-semibold tracking-tight">{title}</h1>
        {sub ? <p className="mt-1.5 text-[13px] text-ink-soft">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "indigo" | "pine" | "ochre" | "plum" | "seal";
const tones: Record<Tone, string> = {
  neutral: "bg-paper-sunk text-ink-soft",
  indigo: "bg-indigo-soft text-indigo",
  pine: "bg-pine-soft text-pine",
  ochre: "bg-ochre-soft text-ochre",
  plum: "bg-plum-soft text-plum",
  seal: "bg-seal-soft text-seal",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">
      {children}
      {hint ? <span className="ml-1.5 font-normal text-ink-faint">{hint}</span> : null}
    </span>
  );
}

const field =
  "w-full rounded-[5px] border border-line-strong bg-paper-raised px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-indigo focus:outline-none";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(field, "h-9", p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(field, "leading-relaxed", p.className)} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(field, "h-9", p.className)} />;
}

export function Notice({ tone = "plum", children }: { tone?: Tone; children: ReactNode }) {
  if (!children) return null;
  return <div className={cx("mb-5 rounded-[5px] px-3.5 py-2.5 text-[13px]", tones[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center text-[13px] text-ink-faint">{children}</div>;
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(d));
}

export { cx };
