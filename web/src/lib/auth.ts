import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./session";

export async function currentOwner(): Promise<{ email: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

/** 스튜디오 화면과 서버 액션 맨 앞에서 호출해요. proxy의 검사는 빠른 1차 확인일 뿐이에요. */
export async function requireOwner(): Promise<{ email: string }> {
  const owner = await currentOwner();
  if (!owner) redirect("/studio/login");
  return owner;
}

export async function checkCredentials(email: string, password: string): Promise<boolean> {
  const ownerEmail = process.env.STUDIO_OWNER_EMAIL;
  // .env 파일은 $를 변수로 읽기 때문에 bcrypt 해시를 base64로 감싸 둬요 (npm run hash-password가 만들어 줘요)
  const raw = process.env.STUDIO_OWNER_PASSWORD_HASH ?? "";
  const hash = raw.startsWith("b64:") ? Buffer.from(raw.slice(4), "base64").toString("utf8") : raw;
  if (!ownerEmail || !hash) return false;
  if (email.trim().toLowerCase() !== ownerEmail.trim().toLowerCase()) {
    // 응답 시간으로 계정 존재를 알 수 없게 비교는 항상 해요
    await bcrypt.compare(password, hash);
    return false;
  }
  return bcrypt.compare(password, hash);
}

export async function startSession(email: string) {
  (await cookies()).set(SESSION_COOKIE, await signSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
