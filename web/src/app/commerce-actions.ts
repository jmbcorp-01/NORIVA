"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cancelPass, CommerceError, creditPurchase, startTestPass, testPaymentsEnabled } from "@/lib/commerce";
import { rateLimit } from "@/lib/rate-limit";
import { currentReader } from "@/lib/reader-auth";

function safeBack(v: FormDataEntryValue | null, fallback: string) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/studio") ? s : fallback;
}

/**
 * 시험 결제로 코인 충전 (스토어 결제를 붙이기 전 흐름 확인용).
 * 앱에서는 이 자리에서 스토어 결제 창을 띄우고, 결제가 끝나면 /api/iap/verify가 코인을 넣어요.
 */
export async function testChargeAction(formData: FormData) {
  const next = safeBack(formData.get("next"), "/coins");
  const r = await currentReader();
  if (!r) redirect(`/login?next=${encodeURIComponent("/coins")}`);
  if (!testPaymentsEnabled()) redirect("/coins?error=disabled");
  if (!(await rateLimit(`charge:${r.id}`, 10, 60))) redirect("/coins?error=too_many");
  const productId = String(formData.get("productId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(productId)) redirect("/coins");
  try {
    const res = await creditPurchase({ readerId: r.id, productId, store: "test", storeTransactionId: `test-${randomUUID()}` });
    revalidatePath("/", "layout");
    redirect(next === "/coins" ? `/coins?charged=${res.credited}` : next);
  } catch (e) {
    if (e instanceof CommerceError) redirect(`/coins?error=${e.code}`);
    throw e;
  }
}

export async function startPassAction() {
  const r = await currentReader();
  if (!r) redirect(`/login?next=${encodeURIComponent("/pass")}`);
  try {
    await startTestPass(r.id);
  } catch (e) {
    if (e instanceof CommerceError) redirect(`/pass?error=${e.code}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/pass");
}

export async function cancelPassAction() {
  const r = await currentReader();
  if (!r) redirect("/login?next=/pass");
  await cancelPass(r.id);
  redirect("/pass");
}
