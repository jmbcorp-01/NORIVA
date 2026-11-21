import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n";
import { LEGAL, legalReviewed, type LegalKey } from "@/lib/legal";

const KEYS = Object.keys(LEGAL) as LegalKey[];

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = LEGAL[(await params).doc as LegalKey];
  return d ? { title: d[await getLocale()].title } : {};
}

/** 약관·방침·저작권 안내. 영어 화면에서 영어 번역이 없는 문서는 한국어를 보여주고 그렇다고 알려요. */
export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const key = (await params).doc as LegalKey;
  if (!KEYS.includes(key)) notFound();
  const locale = await getLocale();
  const doc = LEGAL[key][locale];
  const koOnly = locale === "en" && LEGAL[key].en === LEGAL[key].ko;
  return (
    <article className="mx-auto max-w-[720px] px-4 pt-6">
      <h1 className="text-[24px] font-bold md:text-[28px]">{doc.title}</h1>
      {!legalReviewed() ? (
        <p className="mt-3 rounded-[6px] bg-ochre-soft px-3 py-2 text-[12.5px] text-ochre">
          {locale === "ko" ? "법률 검토 전 초안이에요. 정식 공개 전에 확정해요." : "Draft before legal review. It will be finalized before launch."}
        </p>
      ) : null}
      {koOnly ? <p className="mt-3 text-[12.5px] text-ink-faint">This document is available in Korean. The Korean version governs.</p> : null}
      {doc.sections.map((s) => (
        <section key={s.h} className="mt-7">
          <h2 className="text-[16px] font-bold">{s.h}</h2>
          {s.p.map((x, i) => (
            <p key={i} className="mt-2 text-[14.5px] leading-[1.75] text-ink-soft">
              {x}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
