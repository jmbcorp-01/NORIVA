import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { businessInfo } from "@/lib/business";
import { DICT, getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business information" };

export default async function Business() {
  const t = DICT[await getLocale()];
  const b = businessInfo();
  const tbd = "등록 예정";
  const rows: [string, string][] = [
    ["상호", b.company],
    ["대표자", b.ceo || tbd],
    ["사업자등록번호", b.regNo || tbd],
    ["통신판매업 신고번호", b.salesNo || tbd],
    ["주소", b.address || tbd],
    ["전화", b.phone || tbd],
    ["이메일", b.email || tbd],
    ["개인정보 보호책임자", b.privacyOfficer || b.ceo || tbd],
  ];
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-6">
      <PageTitle>{t.business}</PageTitle>
      <dl className="mt-5 border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 border-b border-line py-3 text-[14.5px]">
            <dt className="w-[150px] flex-none text-ink-faint">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
