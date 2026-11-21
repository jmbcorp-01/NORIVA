import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { DICT, getLocale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Age verification" };

export default async function Adult() {
  const t = DICT[await getLocale()];
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <PageTitle>{t.adult}</PageTitle>
      <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">{t.adultBody}</p>
    </div>
  );
}
