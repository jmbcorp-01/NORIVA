export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // 낙관(도장) 안에 띠살문 창살로 짠 N. 색은 낙관 빨강 하나만 써요.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="7" fill="var(--seal)" />
      <rect x="9" y="9" width="46" height="46" rx="3" fill="none" stroke="#F4EFE4" strokeWidth="1.4" opacity=".55" />
      <clipPath id="nv-mark-clip">
        <rect x="17.9" y="17" width="28.2" height="30" />
      </clipPath>
      <g stroke="#F4EFE4" strokeWidth="4.2" fill="none" clipPath="url(#nv-mark-clip)">
        <path d="M20 47V17" />
        <path d="M44 47V17" />
        <path d="M19 16L45 48" />
      </g>
      <path d="M14 25h8M14 39h8M42 25h8M42 39h8" stroke="#F4EFE4" strokeWidth="1.6" opacity=".8" />
    </svg>
  );
}

export function Logo({ sub = "옛이야기 웹툰", size = 30 }: { sub?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="NORIVA">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[17px] font-semibold tracking-[0.28em] text-ink">NORIVA</span>
        {sub ? <span className="mt-1 text-[10px] tracking-[0.35em] text-ink-faint">{sub}</span> : null}
      </span>
    </span>
  );
}
