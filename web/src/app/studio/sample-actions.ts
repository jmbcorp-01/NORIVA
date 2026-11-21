"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { deleteSamples, fillSamples } from "@/lib/samples";

export async function fillSamplesAction() {
  await requireOwner();
  const n = await fillSamples();
  revalidatePath("/", "layout");
  redirect(`/studio/samples?added=${n}`);
}

/** 전체 삭제는 '삭제'라고 적어야 해요. 하나만 지울 때는 slug를 보내요. */
export async function deleteSamplesAction(fd: FormData) {
  await requireOwner();
  const slug = String(fd.get("slug") ?? "");
  if (!slug && String(fd.get("confirm") ?? "").trim() !== "삭제") redirect("/studio/samples?error=confirm");
  const n = await deleteSamples(slug && /^sample-[a-z0-9-]+$/.test(slug) ? slug : undefined);
  revalidatePath("/", "layout");
  redirect(`/studio/samples?deleted=${n}`);
}
