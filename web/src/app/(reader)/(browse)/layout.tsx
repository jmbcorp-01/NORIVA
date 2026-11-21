import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { HeaderTools } from "@/components/reader/header-tools";
import { IconSearch } from "@/components/reader/icons";
import { LangToggle } from "@/components/reader/lang-toggle";
import { TabBar } from "@/components/reader/tab-bar";
import { DICT, getLocale } from "@/lib/i18n";
import { chromeData } from "@/lib/reader-chrome";
import { currentReader } from "@/lib/reader-auth";

/** 독자 화면 바깥 틀. 휴대폰·앱은 아래 탭, 태블릿·PC는 위쪽 메뉴와 검색창을 써요. */
export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const reader = await currentReader();
  const { coins, unread } = await chromeData(reader);
  const nav = [
    { href: "/", label: t.home },
    { href: "/explore", label: t.explore },
    { href: "/library", label: t.library },
    { href: "/me", label: t.me },
  ];
  return (
    <div className="hanji min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-[56px] max-w-[1200px] items-center gap-3 pl-4 pr-2 md:h-[64px] md:px-6">
          <Link href="/" aria-label="NORIVA" className="flex items-center">
            <Logo size={30} sub="" />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-6 text-[15px] md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-ink-soft hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action="/search" className="ml-auto hidden h-10 w-[280px] items-center gap-2 rounded-[8px] bg-paper-sunk px-3 text-ink-faint lg:flex">
            <IconSearch size={18} />
            <input name="q" placeholder={t.searchPh} aria-label={t.search} className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint" />
          </form>
          <div className="ml-auto flex items-center lg:ml-2">
            <Suspense>
              <LangToggle locale={locale} label={t.langLabel} />
            </Suspense>
            <HeaderTools t={t} coins={coins} unread={unread} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] md:px-2">{children}</main>
      <footer className="mx-auto max-w-[1200px] px-4 pb-8 pt-12 text-[11.5px] leading-relaxed text-ink-faint md:px-6">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
          <Link href="/legal/terms">{t.terms}</Link>
          <Link href="/legal/privacy" className="font-semibold">
            {t.privacy}
          </Link>
          <Link href="/legal/refund">{t.refund}</Link>
          <Link href="/legal/copyright">{t.copyright}</Link>
          <Link href="/legal/business">{t.business}</Link>
          <Link href="/support">{t.support}</Link>
        </nav>
        <p className="mt-3">{t.aiNote}</p>
        <p className="mt-1">{t.copyrightLine}</p>
        <p className="mt-1">© JMB Corporation Inc.</p>
      </footer>
      <TabBar labels={{ home: t.home, explore: t.explore, library: t.library, me: t.me }} />
    </div>
  );
}
