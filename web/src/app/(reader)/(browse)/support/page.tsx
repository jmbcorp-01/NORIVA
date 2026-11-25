import Link from "next/link";
import type { Metadata } from "next";
import { PageTitle } from "@/components/reader/parts";
import { businessInfo } from "@/lib/business";
import { DICT, getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help" };

const FAQ = {
  ko: [
    ["코인은 어떻게 써요?", "유료 회차를 열 때 써요. 보너스 코인을 먼저 쓰고, 그다음 충전 코인을 써요. 1화는 보통 3코인, 선공개 회차는 5코인이에요."],
    ["기다리면 무료는 뭐예요?", "작품마다 24시간에 1화씩 무료로 열 수 있어요. 최신 3화와 선공개 회차는 빠져요."],
    ["산 회차는 계속 볼 수 있어요?", "네. 코인으로 연 회차는 계속 소장돼요. '내 서재 > 소장'에서 볼 수 있어요."],
    ["환불은 어떻게 받아요?", "충전 후 7일 안에 쓰지 않은 충전 코인은 전액 환불돼요. 자세한 내용은 환불 규정을 봐 주세요."],
    ["다른 기기에서도 이어 볼 수 있어요?", "같은 계정으로 로그인하면 웹과 앱 어디서나 읽던 곳부터 이어 봐요."],
  ],
  en: [
    ["How do coins work?", "Coins open paid episodes. Bonus coins are used first, then purchased coins. Most episodes cost 3 coins; early access costs 5."],
    ["What is wait for free?", "Each series lets you open one episode free every 24 hours. The latest 3 and early-access episodes are excluded."],
    ["Do I keep episodes I buy?", "Yes. Episodes you open with coins stay in Library > Owned."],
    ["How do refunds work?", "Unused purchased coins can be fully refunded within 7 days. See the Refund Policy for details."],
    ["Can I continue on another device?", "Log in with the same account on the web or the app to pick up where you left off."],
  ],
};

export default async function Support() {
  const locale = await getLocale();
  const t = DICT[locale];
  const email = businessInfo().email;
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-6">
      <PageTitle>{t.support}</PageTitle>
      <h2 className="mt-6 text-[16px] font-bold">{t.faq}</h2>
      <div className="mt-2 border-t border-line">
        {FAQ[locale].map(([q, a]) => (
          <details key={q} className="border-b border-line py-3.5">
            <summary className="cursor-pointer text-[15px] font-semibold">{q}</summary>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
      <h2 className="mt-8 text-[16px] font-bold">{t.contact}</h2>
      <p className="mt-2 text-[14.5px] text-ink-soft">
        {email ? (
          <a href={`mailto:${email}`} className="text-indigo underline">
            {email}
          </a>
        ) : (
          "등록 예정"
        )}
      </p>
      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
        <Link href="/legal/refund">{t.refund}</Link>
        <Link href="/legal/terms">{t.terms}</Link>
        <Link href="/legal/privacy">{t.privacy}</Link>
        <Link href="/legal/copyright">{t.copyright}</Link>
      </p>
    </div>
  );
}
