"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/studio", label: "대시보드", exact: true },
  { href: "/studio/series", label: "작품 제작" },
  { href: "/studio/scout", label: "소재 발굴" },
  { href: "/studio/sources", label: "소재 라이브러리" },
  { href: "/studio/guidelines", label: "지침 관리" },
  { href: "/studio/jobs", label: "작업 큐" },
  { href: "/studio/store", label: "판매 관리" },
  { href: "/studio/samples", label: "샘플 작품" },
  { href: "/studio/security", label: "보안" },
  { href: "/studio/guide", label: "사용 안내" },
];

export function StudioNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
      {ITEMS.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`shrink-0 rounded-[5px] px-2.5 py-2 text-[13px] transition-colors ${
              active ? "bg-paper-sunk font-semibold text-ink" : "text-ink-soft hover:bg-paper-sunk hover:text-ink"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
