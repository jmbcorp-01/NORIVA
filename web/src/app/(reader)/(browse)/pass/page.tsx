import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { btn, PageTitle } from "@/components/reader/parts";
import { cancelPassAction, startPassAction } from "@/app/commerce-actions";
import { passInfo, testPaymentsEnabled } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "NORIVA Pass" };

export default async function Pass() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/pass");
  const locale = await getLocale();
  const t = DICT[locale];
  const p = await passInfo(reader.id);
  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="mx-auto max-w-[560px] px-4 pt-5">
      <PageTitle>{t.pass}</PageTitle>
      <div className="mt-4 rounded-[10px] bg-[#1f2830] p-6 text-[#efe9dd]">
        <p className="text-[13px] opacity-70">{t.passPrice}</p>
        <p className="mt-1 font-serif text-[24px] font-semibold">{t.passPitch}</p>
        <ul className="mt-4 space-y-2 text-[14px]">
          {t.passPerks.map((x) => (
            <li key={x} className="flex gap-2">
              <span aria-hidden="true">✓</span>
              {x}
            </li>
          ))}
        </ul>
      </div>
      {p && p.status === "active" ? (
        <div className="mt-4 rounded-[8px] border border-line bg-paper-raised p-4">
          <p className="text-[15px] font-bold">{t.passActive(fmt.format(p.expiresAt))}</p>
          <form action={cancelPassAction} className="mt-3">
            <button type="submit" className={`${btn.small} border border-line-strong bg-paper text-ink`}>
              {t.passCancel}
            </button>
          </form>
        </div>
      ) : (
        <form action={startPassAction} className="mt-4">
          <button type="submit" disabled={!testPaymentsEnabled()} className={`${btn.seal} w-full disabled:opacity-50`}>
            {t.passStart} · {t.passTrial}
          </button>
          {testPaymentsEnabled() ? <p className="mt-2 text-[12px] text-ochre">{t.testPayNote}</p> : null}
        </form>
      )}
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">{t.passFoot}</p>
    </div>
  );
}
