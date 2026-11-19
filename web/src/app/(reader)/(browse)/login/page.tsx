import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader, enabledProviders, safeNext } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in" };

// 제공자마다 정해진 버튼 색 (각 회사 로그인 버튼 안내에 맞춤)
const STYLE: Record<string, string> = {
  kakao: "bg-[#FEE500] text-[#191919]",
  naver: "bg-[#03C75A] text-white",
  google: "border border-line-strong bg-white text-[#1f1f1f]",
  apple: "bg-black text-white",
  dev: "border border-dashed border-line-strong bg-paper-raised text-ink-soft",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const dest = safeNext(next);
  if (await currentReader()) redirect(dest);
  const locale = await getLocale();
  const t = DICT[locale];
  const providers = enabledProviders();
  return (
    <section className="mx-auto max-w-[400px] px-4 pt-12">
      <LogoMark size={40} />
      <h1 className="mt-6 font-serif text-[22px] font-semibold">{t.loginTitle}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{t.loginSub}</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-[5px] bg-plum-soft px-3 py-2 text-[13px] text-plum">
          {t.loginErrors[error] ?? t.loginErrors.failed}
        </p>
      ) : null}
      <ul className="mt-8 space-y-2.5">
        {providers.length === 0 ? <li className="text-[13px] text-ink-faint">{t.loginNone}</li> : null}
        {providers.map((p) => (
          <li key={p}>
            {/* 제공자 화면으로 이동하는 일반 링크예요 (자바스크립트 없이 동작) */}
            <a
              href={`/auth/${p}?next=${encodeURIComponent(dest)}`}
              className={`flex h-12 items-center justify-center rounded-[6px] text-[15px] font-semibold ${STYLE[p]}`}
            >
              {t.loginWith[p]}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">{t.loginTerms}</p>
    </section>
  );
}
