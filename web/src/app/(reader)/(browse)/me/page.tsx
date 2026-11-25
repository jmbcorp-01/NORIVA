import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CoinIcon } from "@/components/reader/icons";
import { MenuRow, PageTitle } from "@/components/reader/parts";
import { logoutAction } from "@/app/reader-actions";
import { ownedEpisodes, passInfo, wallet } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader, linkedProviders } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Me" };

export default async function Me() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/me");
  const locale = await getLocale();
  const t = DICT[locale];
  const [w, pass, owned, providers] = await Promise.all([wallet(reader.id), passInfo(reader.id), ownedEpisodes(reader.id), linkedProviders(reader.id)]);
  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-[640px] pt-5">
      <div className="px-4">
        <PageTitle>{t.me}</PageTitle>
      </div>
      <Link href="/me/account" className="flex items-center gap-3.5 px-4 py-5 hover:bg-paper-sunk">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-seal font-serif text-[22px] font-bold text-[#f4efe4]">{reader.nickname.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold">{reader.nickname}</span>
          <span className="block text-[12.5px] text-ink-faint">
            {providers.map((p) => t.providerName[p] ?? p).join(", ")} · {t.languageName}
          </span>
        </span>
        <span className="text-[13px] text-ink-faint">{t.edit} ›</span>
      </Link>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        <Link href="/coins" className="rounded-[8px] border border-line bg-paper-raised p-3.5 hover:border-line-strong">
          <span className="text-[12px] text-ink-faint">{t.coins}</span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[20px] font-bold">
            <CoinIcon /> {w.total.toLocaleString()}
          </span>
          <span className="mt-2 block text-[12.5px] font-bold text-seal">{t.charge} ›</span>
        </Link>
        <Link href="/pass" className="rounded-[8px] border border-line bg-paper-raised p-3.5 hover:border-line-strong">
          <span className="text-[12px] text-ink-faint">{t.pass}</span>
          <span className="mt-2 block text-[16px] font-bold">{pass?.status === "active" ? t.passActive(fmt.format(pass.expiresAt)) : t.passNone}</span>
          <span className="mt-2 block text-[12.5px] font-bold text-seal">{pass?.status === "active" ? `${t.pass} ›` : `${t.passTrial} ›`}</span>
        </Link>
      </div>
      <nav className="mt-5 border-t border-line md:mx-4">
        <MenuRow href="/me/coins" label={t.coinHistory} />
        <MenuRow href="/me/purchases" label={t.purchases} value={owned.length ? t.purchasesN(owned.length) : undefined} />
        <MenuRow href="/me/notifications" label={t.notifSettings} />
        <MenuRow href="/me/account" label={t.account} />
        <MenuRow href="/adult" label={t.adult} value={t.adultNone} />
        <MenuRow href="/support" label={t.support} />
        <MenuRow href="/legal/copyright" label={t.copyright} />
      </nav>
      <form action={logoutAction} className="px-4 pt-5 md:px-4">
        <button type="submit" className="text-[14px] text-ink-faint hover:text-ink">
          {t.logout}
        </button>
      </form>
    </div>
  );
}
