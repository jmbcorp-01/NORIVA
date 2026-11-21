"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentReader, deleteReader, signOut } from "@/lib/reader-auth";
import { CommerceError, unlockEpisode } from "@/lib/commerce";
import { rateLimit } from "@/lib/rate-limit";

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
  if (!r) redirect("/login?next=/me/account");
  const nickname = String(formData.get("nickname") ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
  if (nickname.length >= 2) await db.update(schema.readers).set({ nickname, updatedAt: new Date() }).where(eq(schema.readers.id, r.id));
  redirect("/me/account");
}

export async function deleteAccountAction(formData: FormData) {
  const r = await currentReader();
  if (!r) redirect("/login?next=/me/account");
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== "탈퇴" && typed !== "delete") redirect("/me/account?error=confirm");
  await deleteReader(r.id);
  redirect("/");
}

function intIn(v: FormDataEntryValue | null, max = 9999) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

function slugOf(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return /^[a-z0-9-]{1,120}$/.test(s) ? s : null;
}

/** 회차 열기 (코인 또는 기다무). 성공하면 바로 뷰어로 가요. */
export async function unlockAction(formData: FormData) {
  const slug = slugOf(formData.get("slug"));
  const ep = intIn(formData.get("ep"));
  if (!slug || !ep) redirect("/");
  const back = `/series/${slug}?open=${ep}`;
  const r = await currentReader();
  if (!r) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!(await rateLimit(`unlock:${r.id}`, 30, 60))) redirect(`${back}&error=too_many`);
  const method = formData.get("method") === "wait_free" ? "wait_free" : "coin";
  if (formData.get("auto") === "1" && !r.autoUnlock) await db.update(schema.readers).set({ autoUnlock: true }).where(eq(schema.readers.id, r.id));
  try {
    await unlockEpisode(r.id, slug, ep, method);
  } catch (e) {
    if (e instanceof CommerceError) redirect(`${back}&error=${e.code}`);
    throw e;
  }
  revalidatePath(`/series/${slug}`);
  redirect(`/series/${slug}/${ep}`);
}

/** 회차 반응: 재미있어 / 아쉬워. 같은 것을 다시 누르면 취소돼요. */
export async function reactAction(formData: FormData) {
  const slug = slugOf(formData.get("slug"));
  const ep = intIn(formData.get("ep"));
  const kind = formData.get("kind") === "meh" ? "meh" : "fun";
  if (!slug || !ep) redirect("/");
  const back = `/series/${slug}/${ep}#react`;
  const r = await currentReader();
  if (!r) redirect(`/login?next=${encodeURIComponent(`/series/${slug}/${ep}`)}`);
  const [row] = await db
    .select({ id: schema.episodes.id })
    .from(schema.episodes)
    .innerJoin(schema.series, eq(schema.series.id, schema.episodes.seriesId))
    .where(and(eq(schema.series.slug, slug), eq(schema.episodes.number, ep)));
  if (!row) redirect("/");
  const where = and(eq(schema.episodeReactions.readerId, r.id), eq(schema.episodeReactions.episodeId, row.id));
  const [cur] = await db.select().from(schema.episodeReactions).where(where);
  if (cur?.kind === kind) await db.delete(schema.episodeReactions).where(where);
  else
    await db
      .insert(schema.episodeReactions)
      .values({ readerId: r.id, episodeId: row.id, kind })
      .onConflictDoUpdate({ target: [schema.episodeReactions.readerId, schema.episodeReactions.episodeId], set: { kind, createdAt: new Date() } });
  redirect(back);
}

/** 알림 설정 저장 */
export async function saveNotifPrefs(formData: FormData) {
  const r = await currentReader();
  if (!r) redirect("/login?next=/me/notifications");
  const v = { newEpisode: formData.get("newEpisode") === "on", waitFree: formData.get("waitFree") === "on", events: formData.get("events") === "on" };
  await db
    .insert(schema.notificationPrefs)
    .values({ readerId: r.id, ...v })
    .onConflictDoUpdate({ target: schema.notificationPrefs.readerId, set: { ...v, updatedAt: new Date() } });
  redirect("/me/notifications?saved=1");
}

/** 알림함을 열면 모두 읽음으로 */
export async function markAllRead() {
  const r = await currentReader();
  if (!r) redirect("/login?next=/notifications");
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.readerId, r.id), isNull(schema.notifications.readAt)));
  revalidatePath("/", "layout");
  redirect("/notifications");
}
