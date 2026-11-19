"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentReader, deleteReader, signOut } from "@/lib/reader-auth";

function backPath(v: FormDataEntryValue | null) {
  const s = String(v ?? "/");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function toggleBookmark(formData: FormData) {
  const back = backPath(formData.get("back"));
  const r = await currentReader();
  if (!r) redirect(`/login?next=${encodeURIComponent(back)}`);
  const seriesId = String(formData.get("seriesId"));
  const where = and(eq(schema.bookmarks.readerId, r.id), eq(schema.bookmarks.seriesId, seriesId));
  const [existing] = await db.select().from(schema.bookmarks).where(where);
  if (existing) await db.delete(schema.bookmarks).where(where);
  else await db.insert(schema.bookmarks).values({ readerId: r.id, seriesId }).onConflictDoNothing();
  revalidatePath(back);
  redirect(back);
}

export async function logoutAction(formData: FormData) {
  await signOut(formData.get("everywhere") === "1");
  redirect("/");
}

export async function saveNickname(formData: FormData) {
  const r = await currentReader();
  if (!r) redirect("/login?next=/me");
  const nickname = String(formData.get("nickname") ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
  if (nickname.length >= 2) await db.update(schema.readers).set({ nickname, updatedAt: new Date() }).where(eq(schema.readers.id, r.id));
  redirect("/me");
}

export async function deleteAccountAction(formData: FormData) {
  const r = await currentReader();
  if (!r) redirect("/login?next=/me");
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== "탈퇴" && typed !== "delete") redirect("/me?error=confirm");
  await deleteReader(r.id);
  redirect("/");
}
