// 독자 로그인 토큰. 스튜디오 쿠키와 이름·대상(audience)이 달라서 서로 섞이지 않아요.
import { SignJWT, jwtVerify } from "jose";

export const READER_COOKIE = "noriva_reader";
export const READER_MAX_AGE = 60 * 60 * 24 * 60; // 60일

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET 환경 변수가 32자 이상이어야 해요");
  return new TextEncoder().encode(secret);
}

export async function signReader(readerId: string, version: number): Promise<string> {
  return new SignJWT({ ver: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(readerId)
    .setAudience("reader")
    .setIssuedAt()
    .setExpirationTime(`${READER_MAX_AGE}s`)
    .sign(key());
}

export async function verifyReader(token: string | undefined): Promise<{ readerId: string; version: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: "reader" });
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { readerId: payload.sub, version: payload.ver };
  } catch {
    return null;
  }
}
