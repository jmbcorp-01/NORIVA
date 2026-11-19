import { Logo } from "@/components/logo";

// 독자 앱은 2단계에서 만들어요. 지금은 브랜드 톤을 보여주는 준비 중 화면이에요.
export default function Home() {
  return (
    <main className="hanji flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo size={44} />
      <p className="mt-10 font-serif text-[19px] leading-relaxed text-ink">
        한국의 옛이야기가
        <br />
        지금의 웹툰이 되는 곳
      </p>
      <p className="mt-3 text-[13px] tracking-wide text-ink-faint">Korean tales, retold as webtoons.</p>
      <p className="mt-14 text-[12px] text-ink-faint">곧 첫 작품으로 찾아올게요 · Coming soon</p>
    </main>
  );
}
