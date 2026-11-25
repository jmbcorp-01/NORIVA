import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { totpSecret } from "@/lib/studio-2fa";
import { login } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "이메일이나 비밀번호가 맞지 않아요.",
  code: "인증 코드가 맞지 않아요. 휴대폰 인증 앱의 지금 코드를 넣어 주세요.",
  limit: "시도가 너무 많아요. 15분 뒤에 다시 해 주세요.",
};

export const metadata: Metadata = { title: "스튜디오 로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const twoFactor = Boolean(await totpSecret());
  return (
    <main className="hanji flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        <div className="mb-10 flex justify-center">
          <Logo sub="스튜디오" size={34} />
        </div>
        <form action={login} className="space-y-4">
          <label className="block">
            <Label>이메일</Label>
            <Input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="block">
            <Label>비밀번호</Label>
            <Input name="password" type="password" autoComplete="current-password" required />
          </label>
          {twoFactor ? (
            <label className="block">
              <Label>인증 코드 (휴대폰 인증 앱의 6자리)</Label>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
            </label>
          ) : null}
          {error ? <p className="text-[13px] text-plum">{ERRORS[error] ?? ERRORS["1"]}</p> : null}
          <Button variant="primary" className="w-full" type="submit">
            들어가기
          </Button>
        </form>
      </div>
    </main>
  );
}
