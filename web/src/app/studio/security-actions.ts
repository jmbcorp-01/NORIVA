"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { disable, enable, pendingSecret, setPending, totpSecret } from "@/lib/studio-2fa";
import { newTotpSecret, verifyTotp } from "@/lib/totp";

const BACK = "/studio/security";

export async function startTwoFactor() {
  await requireOwner();
  if (await totpSecret()) redirect(BACK);
  await setPending(newTotpSecret());
  redirect(BACK);
}

export async function confirmTwoFactor(formData: FormData) {
  await requireOwner();
  const secret = await pendingSecret();
  if (!secret) redirect(BACK);
  if (!verifyTotp(secret, String(formData.get("code") ?? ""))) redirect(`${BACK}?error=code`);
  await enable(secret);
  redirect(`${BACK}?done=on`);
}

/** 끄려면 지금 코드가 있어야 해요 (세션만 훔친 사람은 끌 수 없게) */
export async function disableTwoFactor(formData: FormData) {
  await requireOwner();
  const secret = await totpSecret();
  if (!secret) redirect(BACK);
  if (!verifyTotp(secret, String(formData.get("code") ?? ""))) redirect(`${BACK}?error=code`);
  await disable();
  redirect(`${BACK}?done=off`);
}
