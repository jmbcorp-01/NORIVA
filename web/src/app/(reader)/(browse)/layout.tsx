import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/reader/lang-toggle";
import { TabBar } from "@/components/reader/tab-bar";
import { DICT, getLocale } from "@/lib/i18n";

export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = DICT[locale];
  return (
    <div className="hanji min-h-dvh pb-20 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[60px] max-w-[720px] items-center gap-3 pl-4 pr-2">
          <Link href="/" aria-label="NORIVA" className="flex items-center">
            <Logo size={28} sub="" />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-5 text-[14px] md:flex">
            <Link href="/" className="text-ink-soft hover:text-ink">
              {t.home}
            </Link>
            <Link href="/explore" className="text-ink-soft hover:text-ink">
              {t.explore}
            </Link>
            <Link href="/library" className="text-ink-soft hover:text-ink">
              {t.library}
            </Link>
            <Link href="/me" className="text-ink-soft hover:text-ink">
              {t.me}
            </Link>
          </nav>
          <div className="ml-auto">
            <Suspense>
              <LangToggle locale={locale} label={t.langLabel} />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[720px]">{children}</main>
      <footer className="mx-auto max-w-[720px] px-4 pb-6 pt-10 text-[11px] leading-relaxed text-ink-faint">
        <p>{t.aiNote}</p>
        <p className="mt-1">© NORIVA</p>
      </footer>
      <TabBar labels={{ home: t.home, explore: t.explore, library: t.library, me: t.me }} />
    </div>
  );
}
