"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** 독자가 고른 언어를 1년 동안 기억해요 */
export async function setLocale(formData: FormData) {
  const lang = formData.get("lang") === "en" ? "en" : "ko";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const back = String(formData.get("back") ?? "/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
