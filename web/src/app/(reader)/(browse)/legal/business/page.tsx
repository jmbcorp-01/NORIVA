import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { businessInfo } from "@/lib/business";
import { DICT, getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business information" };

const LABELS = {
  ko: { company: "상호", ceo: "대표자", regNo: "사업자등록번호", salesNo: "통신판매업 신고번호", address: "주소", phone: "전화", email: "이메일", privacyOfficer: "개인정보 보호책임자", hosting: "호스팅 서비스 제공자", tbd: "등록 예정" },
  en: { company: "Company", ceo: "CEO", regNo: "Business registration no.", salesNo: "Mail-order business no.", address: "Address", phone: "Phone", email: "Email", privacyOfficer: "Privacy officer", hosting: "Hosting provider", tbd: "Coming soon" },
} as const;

export default async function Business() {
  const locale = await getLocale();
  const t = DICT[locale];
  const b = businessInfo(locale);
  const L = LABELS[locale];
  const keys = ["company", "ceo", "regNo", "salesNo", "address", "phone", "email", "privacyOfficer", "hosting"] as const;
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-6">
      <PageTitle>{t.business}</PageTitle>
      <dl className="mt-5 border-t border-line">
        {keys.map((k) => (
          <div key={k} className="flex gap-4 border-b border-line py-3 text-[14.5px]">
            <dt className="w-[150px] flex-none text-ink-faint">{L[k]}</dt>
            <dd className="min-w-0 break-words">{b[k] || L.tbd}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
