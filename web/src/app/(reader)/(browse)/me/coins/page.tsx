import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { coinHistory, wallet } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coin history" };

export default async function CoinHistory() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/me/coins");
  const locale = await getLocale();
  const t = DICT[locale];
  const [w, rows] = await Promise.all([wallet(reader.id), coinHistory(reader.id)]);
  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <PageTitle>{t.coinHistory}</PageTitle>
      <p className="mt-2 text-[13px] text-ink-soft">{t.balanceSplit(w.paid, w.free)}</p>
      {rows.length ? (
        <ul className="mt-4 border-t border-line">
          {rows.map((r) => {
            const d = r.deltaPaid + r.deltaFree;
            return (
              <li key={r.id} className="flex items-center justify-between border-b border-line py-3">
                <span>
                  <span className="block text-[14.5px] font-semibold">{t.reasons[r.reason] ?? r.reason}</span>
                  <span className="block text-[12px] text-ink-faint">{fmt.format(r.createdAt)}</span>
                </span>
                <span className="text-right">
                  <span className={`block text-[15px] font-bold ${d >= 0 ? "text-pine" : "text-ink"}`}>
                    {d >= 0 ? "+" : ""}
                    {d}
                  </span>
                  <span className="block text-[11.5px] text-ink-faint">{r.balanceAfter}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-[13.5px] text-ink-faint">{t.emptyHistory}</p>
      )}
    </div>
  );
}
