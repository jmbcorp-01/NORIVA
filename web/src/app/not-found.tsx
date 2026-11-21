import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { DICT, getLocale } from "@/lib/i18n";

export default async function NotFound() {
  const t = DICT[await getLocale()];
  return (
    <main className="hanji flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark size={44} />
      <h1 className="mt-6 text-[22px] font-bold">{t.notFound}</h1>
      <p className="mt-2 text-[14px] text-ink-soft">{t.notFoundSub}</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-[6px] bg-ink px-6 text-[15px] font-bold text-paper">
        {t.goHome}
      </Link>
    </main>
  );
}
