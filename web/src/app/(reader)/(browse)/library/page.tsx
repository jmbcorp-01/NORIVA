import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SeriesGrid } from "@/components/reader/series-grid";
import { ContinueRow } from "@/components/reader/continue-row";
import { DICT, getLocale } from "@/lib/i18n";
import { bookmarkedSeries, continueReading } from "@/lib/library";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

export default async function Library() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/library");
  const locale = await getLocale();
  const t = DICT[locale];
  const [saved, recent] = await Promise.all([bookmarkedSeries(reader.id, locale), continueReading(reader.id, locale, 20)]);
  return (
    <div className="pt-5">
      <h1 className="px-4 font-serif text-[22px] font-semibold">{t.library}</h1>

      <section className="pt-6" aria-labelledby="recent">
        <h2 id="recent" className="px-4 text-[15px] font-semibold">
          {t.recent}
        </h2>
        {recent.length ? <ContinueRow items={recent} t={t} /> : <p className="px-4 pt-3 text-[13px] text-ink-faint">{t.emptyRecent}</p>}
      </section>

      <section className="px-4 pt-8" aria-labelledby="saved">
        <h2 id="saved" className="text-[15px] font-semibold">
          {t.following}
        </h2>
        <div className="pt-3">
          {saved.length ? (
            <SeriesGrid items={saved} locale={locale} freeLabel={t.free} />
          ) : (
            <p className="text-[13px] text-ink-faint">
              {t.emptyLibrary}{" "}
              <Link href="/explore" className="text-indigo underline-offset-2 hover:underline">
                {t.explore}
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
