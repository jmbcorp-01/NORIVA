import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { ownedEpisodes } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Purchased episodes" };

export default async function Purchases() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/me/purchases");
  const locale = await getLocale();
  const t = DICT[locale];
  const rows = await ownedEpisodes(reader.id);
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <PageTitle>{t.purchases}</PageTitle>
      {rows.length ? (
        <ul className="mt-4 border-t border-line">
          {rows.map((r) => (
            <li key={`${r.slug}-${r.number}`} className="border-b border-line">
              <Link href={`/series/${r.slug}/${r.number}`} className="flex justify-between py-3 text-[14.5px] hover:bg-paper-sunk">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{locale === "en" ? r.titleEn || r.title : r.title}</span> · {t.episodes(r.number)}
                  {r.epTitle ? ` ${r.epTitle}` : ""}
                </span>
                <span className="text-ink-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-[13.5px] text-ink-faint">{t.emptyOwned}</p>
      )}
    </div>
  );
}
