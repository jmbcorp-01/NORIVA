"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBooks, IconCompass, IconHome, IconPerson } from "./icons";

export function TabBar({ labels }: { labels: { home: string; explore: string; library: string; me: string } }) {
  const path = usePathname();
  const items = [
    { href: "/", label: labels.home, Icon: IconHome, active: path === "/" },
    { href: "/explore", label: labels.explore, Icon: IconCompass, active: path.startsWith("/explore") },
    { href: "/library", label: labels.library, Icon: IconBooks, active: path.startsWith("/library") },
    { href: "/me", label: labels.me, Icon: IconPerson, active: path.startsWith("/me") || path.startsWith("/login") },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto flex max-w-[720px]">
        {items.map(({ href, label, Icon, active }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-ink" : "text-ink-faint"}`}
            >
              <Icon active={active} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
