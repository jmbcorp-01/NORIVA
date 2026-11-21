import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CoinIcon } from "@/components/reader/icons";
import { btn, PageTitle } from "@/components/reader/parts";
import { testChargeAction } from "@/app/commerce-actions";
import { activeProducts, testPaymentsEnabled, wallet } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coins" };

export default async function Coins({ searchParams }: { searchParams: Promise<{ charged?: string; next?: string; error?: string }> }) {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/coins");
  const locale = await getLocale();
  const t = DICT[locale];
  const sp = await searchParams;
  const [w, products] = await Promise.all([wallet(reader.id), activeProducts()]);
  const test = testPaymentsEnabled();
  const next = sp.next && sp.next.startsWith("/series/") ? sp.next : "/coins";

  return (
    <div className="mx-auto max-w-[560px] px-4 pt-5">
      <PageTitle>{t.coinShop}</PageTitle>
      {sp.charged ? (
        <p role="status" className="mt-4 rounded-[6px] bg-pine-soft px-3 py-2.5 text-[13px] text-pine">
          {t.charged(Number(sp.charged) || 0)}
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="mt-4 rounded-[6px] bg-plum-soft px-3 py-2.5 text-[13px] text-plum">
          {t.unlockErrors[sp.error] ?? t.errorSub}
        </p>
      ) : null}
      <div className="mt-4 rounded-[10px] bg-[#1f2830] p-5 text-[#efe9dd]">
        <p className="text-[12.5px] opacity-70">{t.balance}</p>
        <p className="mt-1.5 flex items-center gap-2 text-[30px] font-bold">
          <CoinIcon size={26} /> {w.total.toLocaleString()}
        </p>
        <p className="mt-2 text-[12.5px] opacity-70">{t.balanceSplit(w.paid, w.free)}</p>
      </div>

      <h2 className="mt-6 text-[16px] font-bold">{t.charge}</h2>
      <p className="mt-0.5 text-[12px] text-ink-faint">{t.coinRule}</p>
      <ul className="mt-3 space-y-2">
        {products.map((p) => (
          <li key={p.id}>
            <form action={testChargeAction} className={`flex items-center gap-3 rounded-[8px] bg-paper-raised p-3.5 ${p.badge === "많이 사요" ? "border-[1.5px] border-ink" : "border border-line"}`}>
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="next" value={next} />
              <CoinIcon size={24} />
              <div className="flex flex-1 flex-wrap items-center gap-x-2 text-[16px] font-bold">
                {t.coinUnit(p.coins)}
                {p.bonusCoins ? <span className="text-[13px] text-seal">{t.bonus(p.bonusCoins)}</span> : null}
                {p.badge ? <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[10.5px] text-paper">{p.badge}</span> : null}
              </div>
              <button type="submit" disabled={!test} className={`${btn.small} border border-line-strong bg-paper font-semibold text-ink hover:bg-paper-sunk disabled:opacity-50`}>
                {t.won(p.priceKrw)}
              </button>
            </form>
          </li>
        ))}
      </ul>
      {test ? <p className="mt-2 text-[12px] text-ochre">{t.testPayNote}</p> : null}

      <Link href="/pass" className="mt-4 flex items-center gap-3 rounded-[8px] border border-[#d8c5bf] bg-seal-soft p-3.5">
        <div className="flex-1">
          <p className="text-[14.5px] font-bold text-seal">
            {t.pass} · {t.passPrice}
          </p>
          <p className="mt-0.5 text-[12px] text-seal/80">{t.passPerks[0]}</p>
        </div>
        <span className={`${btn.small} bg-seal text-white`}>{t.passLearn}</span>
      </Link>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
        {t.coinFoot}{" "}
        <Link href="/legal/refund" className="underline">
          {t.refund}
        </Link>
      </p>
    </div>
  );
}
