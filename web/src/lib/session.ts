// 스튜디오 세션 토큰. Next 의존성이 없어서 proxy와 서버 코드가 같이 써요.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "noriva_studio";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET 환경 변수가 32자 이상이어야 해요");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(email: string): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.role !== "owner" || typeof payload.sub !== "string") return null;
    return { email: payload.sub };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
