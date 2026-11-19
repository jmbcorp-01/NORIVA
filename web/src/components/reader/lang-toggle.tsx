"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { setLocale } from "@/app/locale-actions";

export function LangToggle({ locale, label }: { locale: "ko" | "en"; label: string }) {
  const path = usePathname();
  const qs = useSearchParams().toString();
  return (
    <form action={setLocale}>
      <input type="hidden" name="lang" value={locale === "ko" ? "en" : "ko"} />
      <input type="hidden" name="back" value={qs ? `${path}?${qs}` : path} />
      <button type="submit" aria-label={label} className="h-11 px-2.5 text-[12px] tracking-wide text-ink-soft">
        <span className={locale === "ko" ? "font-semibold text-ink" : ""}>KO</span>
        <span className="mx-1 text-ink-faint">/</span>
        <span className={locale === "en" ? "font-semibold text-ink" : ""}>EN</span>
      </button>
    </form>
  );
}
