import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { login } from "../actions";

export const metadata: Metadata = { title: "스튜디오 로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
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
          {error ? <p className="text-[13px] text-plum">이메일이나 비밀번호가 맞지 않아요.</p> : null}
          <Button variant="primary" className="w-full" type="submit">
            들어가기
          </Button>
        </form>
      </div>
    </main>
  );
}
