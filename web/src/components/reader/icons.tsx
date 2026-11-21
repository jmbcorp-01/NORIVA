export function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.6} strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11l8-6 8 6v9H4z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
export function IconCompass({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.6} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M15 9l-2 4-4 2 2-4z" strokeLinejoin="round" />
    </svg>
  );
}
export function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
export function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
export function IconBooks({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.6} strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.6 1-3.4 14-3.6-1" />
    </svg>
  );
}
export function IconPerson({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.6} aria-hidden="true">
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" strokeLinecap="round" />
    </svg>
  );
}
export function IconBookmark({ filled }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  );
}
export function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15zM10 21h4" />
    </svg>
  );
}
export function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" strokeLinecap="round" />
    </svg>
  );
}
export function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}
export function IconClock({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6" strokeLinecap="round" />
    </svg>
  );
}
export function IconLock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
/** 코인 표시: 황토색 동전 안에 N */
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid flex-none place-items-center rounded-full bg-[#c79a3e] font-extrabold text-[#fff8e8] shadow-[inset_0_0_0_1.5px_#a67c26]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
    >
      N
    </span>
  );
}
