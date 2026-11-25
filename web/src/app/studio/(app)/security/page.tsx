import { Button, Card, Input, Label, Notice, PageHeader } from "@/components/ui";
import { confirmTwoFactor, disableTwoFactor, startTwoFactor } from "@/app/studio/security-actions";
import { requireOwner } from "@/lib/auth";
import { pendingSecret, totpSecret } from "@/lib/studio-2fa";
import { otpauthUri } from "@/lib/totp";

export const dynamic = "force-dynamic";

/** 스튜디오 2단계 인증 켜기·끄기 */
export default async function Security({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const sp = await searchParams;
  const owner = await requireOwner();
  const [on, pending] = await Promise.all([totpSecret(), pendingSecret()]);
  const codeField = (
    <label className="block max-w-[220px]">
      <Label>인증 코드 6자리</Label>
      <Input name="code" inputMode="numeric" autoComplete="one-time-code" required />
    </label>
  );
  return (
    <>
      <PageHeader title="보안" sub="스튜디오에 들어올 때 비밀번호에 더해 휴대폰 인증 앱의 코드를 받아요. 비밀번호가 새어도 휴대폰 없이는 들어올 수 없어요." />
      {sp.error === "code" ? <Notice>코드가 맞지 않아요. 인증 앱에 보이는 지금 코드를 넣어 주세요.</Notice> : null}
      {sp.done === "on" ? <Notice tone="pine">2단계 인증을 켰어요. 다음 로그인부터 코드를 물어봐요.</Notice> : null}
      {sp.done === "off" ? <Notice tone="pine">2단계 인증을 껐어요.</Notice> : null}

      <Card className="max-w-[560px] p-5">
        <h2 className="text-[15px] font-semibold">2단계 인증 {on ? "· 켜져 있어요" : "· 꺼져 있어요"}</h2>
        {on ? (
          <form action={disableTwoFactor} className="mt-4 space-y-3">
            <p className="text-[13px] text-ink-soft">끄려면 지금 코드를 넣어 주세요. 휴대폰을 바꿀 때는 끄고 다시 켜면 돼요.</p>
            {codeField}
            <Button type="submit">2단계 인증 끄기</Button>
          </form>
        ) : pending ? (
          <form action={confirmTwoFactor} className="mt-4 space-y-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-ink-soft">
              <li>휴대폰에 Google OTP나 Microsoft Authenticator 같은 인증 앱을 설치해요.</li>
              <li>앱에서 &apos;설정 키 입력&apos;을 누르고 아래 키를 넣어요 (계정 이름: NORIVA Studio).</li>
              <li>앱에 나온 6자리 코드를 아래에 넣어요.</li>
            </ol>
            <p className="select-all rounded-[6px] bg-paper-sunk px-3 py-2.5 font-mono text-[15px] tracking-[0.12em]">{pending.match(/.{1,4}/g)?.join(" ")}</p>
            <p className="break-all text-[11.5px] text-ink-faint">휴대폰에서 이 화면을 연 경우 이 주소를 눌러도 돼요: <a className="underline" href={otpauthUri(pending, owner.email)}>인증 앱에 추가</a></p>
            {codeField}
            <Button variant="primary" type="submit">확인하고 켜기</Button>
          </form>
        ) : (
          <form action={startTwoFactor} className="mt-4">
            <Button variant="primary" type="submit">2단계 인증 켜기</Button>
          </form>
        )}
      </Card>

      <Card className="mt-4 max-w-[560px] p-5 text-[13px] leading-relaxed text-ink-soft">
        <h2 className="text-[15px] font-semibold text-ink">이미 켜져 있는 보호</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>로그인은 같은 곳에서 15분에 10번까지만 시도할 수 있어요.</li>
          <li>유료 회차 그림은 공개 주소가 아니라, 10분 동안만 쓸 수 있는 서명된 주소로 보여요.</li>
          <li>회차 열기와 충전은 짧은 시간에 너무 많이 하지 못하게 막아요.</li>
          <li>다른 사이트가 우리 화면을 틀 안에 넣지 못하게 하고, 허락한 곳의 스크립트만 실행돼요.</li>
        </ul>
      </Card>
    </>
  );
}
