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
