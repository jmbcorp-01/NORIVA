import "server-only";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { Apple, decodeIdToken, generateCodeVerifier, generateState, Google, Kakao, Naver, type OAuth2Tokens } from "arctic";
import { db, schema } from "@/db";
import { READER_COOKIE, READER_MAX_AGE, signReader, verifyReader } from "./reader-session";

const { readers, readerIdentities } = schema;

export const PROVIDERS = ["kakao", "naver", "google", "apple"] as const;
export type Provider = (typeof PROVIDERS)[number] | "dev";

export type Profile = { id: string; email: string | null; name: string | null };

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
const redirectUri = (p: Provider) => `${appUrl()}/auth/${p}/callback`;

/** 키가 들어 있는 로그인 수단만 화면에 보여줘요. */
export function enabledProviders(): Provider[] {
  const e = process.env;
  const out: Provider[] = [];
  if (e.KAKAO_CLIENT_ID) out.push("kakao");
  if (e.NAVER_CLIENT_ID && e.NAVER_CLIENT_SECRET) out.push("naver");
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) out.push("google");
  if (e.APPLE_CLIENT_ID && e.APPLE_TEAM_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY) out.push("apple");
  if (devLoginEnabled()) out.push("dev");
  return out;
}

/** 로컬 개발에서만: 외부 로그인 없이 시험 계정으로 들어가요 */
export function devLoginEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.READER_DEV_LOGIN === "1";
}

function client(p: Exclude<Provider, "dev">) {
  const e = process.env;
  switch (p) {
    case "kakao":
      // 카카오는 client secret이 선택 사항이에요 (콘솔에서 켜면 넣어요)
      return new Kakao(e.KAKAO_CLIENT_ID!, e.KAKAO_CLIENT_SECRET ?? "", redirectUri(p));
    case "naver":
      return new Naver(e.NAVER_CLIENT_ID!, e.NAVER_CLIENT_SECRET!, redirectUri(p));
    case "google":
      return new Google(e.GOOGLE_CLIENT_ID!, e.GOOGLE_CLIENT_SECRET!, redirectUri(p));
    case "apple": {
      const pem = e.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
      const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
      return new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, new Uint8Array(der), redirectUri(p));
    }
  }
}

const STATE_COOKIE = "noriva_oauth";

function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/studio") ? next : "/";
}

/** 로그인 시작: 상태 값을 쿠키에 두고 제공자 로그인 화면 주소를 돌려줘요. */
export async function beginLogin(p: Exclude<Provider, "dev">, next: string | null): Promise<URL> {
  const state = generateState();
  const verifier = p === "google" ? generateCodeVerifier() : "";
  let url: URL;
  if (p === "google") url = (client(p) as Google).createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  else if (p === "naver") {
    url = (client(p) as Naver).createAuthorizationURL();
    url.searchParams.set("state", state);
  } else if (p === "apple") {
    url = (client(p) as Apple).createAuthorizationURL(state, ["name", "email"]);
    url.searchParams.set("response_mode", "form_post"); // 이름·이메일을 받으려면 애플은 POST로 돌아와요
  } else url = (client(p) as Kakao).createAuthorizationURL(state, []); // 받을 항목은 카카오 콘솔의 동의항목 설정을 따라요

  (await cookies()).set(STATE_COOKIE, JSON.stringify({ p, state, verifier, next: safeNext(next) }), {
    httpOnly: true,
    secure: p === "apple" || process.env.NODE_ENV === "production",
    // 애플은 다른 사이트에서 POST로 돌아오므로 SameSite=None이어야 쿠키가 따라와요
    sameSite: p === "apple" ? "none" : "lax",
    path: "/auth",
    maxAge: 600,
  });
  return url;
}

export class LoginError extends Error {}

/** 로그인 마무리: 상태 확인 → 코드 교환 → 프로필 → 회원 연결 → 로그인 쿠키. 돌아갈 주소를 돌려줘요. */
export async function completeLogin(p: Exclude<Provider, "dev">, params: URLSearchParams): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/auth" });
  const saved = raw ? (JSON.parse(raw) as { p: string; state: string; verifier: string; next: string }) : null;
  if (params.get("error")) throw new LoginError("로그인을 취소했어요");
  const code = params.get("code");
  if (!saved || saved.p !== p || !code || params.get("state") !== saved.state) throw new LoginError("로그인 요청이 만료됐어요. 다시 시도해 주세요");

  let profile: Profile;
  if (p === "google") {
    const tokens = await (client(p) as Google).validateAuthorizationCode(code, saved.verifier);
    profile = fromIdToken(tokens);
  } else if (p === "apple") {
    const tokens = await (client(p) as Apple).validateAuthorizationCode(code);
    profile = fromIdToken(tokens);
    // 애플은 첫 로그인 때만 이름을 form의 user 필드로 줘요
    const user = params.get("user");
    if (user && !profile.name) {
      try {
        const n = (JSON.parse(user) as { name?: { firstName?: string; lastName?: string } }).name;
        profile.name = [n?.firstName, n?.lastName].filter(Boolean).join(" ") || null;
      } catch {}
    }
  } else if (p === "kakao") {
    const tokens = await (client(p) as Kakao).validateAuthorizationCode(code);
    const me = await fetchJson("https://kapi.kakao.com/v2/user/me", tokens);
    const acc = (me.kakao_account ?? {}) as { email?: string; is_email_verified?: boolean; profile?: { nickname?: string } };
    profile = { id: String(me.id), email: acc.is_email_verified ? (acc.email ?? null) : null, name: acc.profile?.nickname ?? null };
  } else {
    const tokens = await (client(p) as Naver).validateAuthorizationCode(code);
    const me = await fetchJson("https://openapi.naver.com/v1/nid/me", tokens);
    const r = (me.response ?? {}) as { id?: string; email?: string; nickname?: string; name?: string };
    if (!r.id) throw new LoginError("네이버 프로필을 받지 못했어요");
    profile = { id: r.id, email: r.email ?? null, name: r.nickname ?? r.name ?? null };
  }
  await signIn(p, profile);
  return saved.next;
}

function fromIdToken(tokens: OAuth2Tokens): Profile {
  const c = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean | string; name?: string };
  const verified = c.email_verified === true || c.email_verified === "true";
  return { id: c.sub, email: verified ? (c.email ?? null) : null, name: c.name ?? null };
}

async function fetchJson(url: string, tokens: OAuth2Tokens): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tokens.accessToken()}` } });
  if (!r.ok) throw new LoginError(`프로필을 받지 못했어요 (${r.status})`);
  return (await r.json()) as Record<string, unknown>;
}

/** 같은 제공자 계정이면 같은 회원으로, 처음이면 새 회원을 만들어요. 이메일만으로 다른 계정을 합치지는 않아요(가로채기 방지). */
export async function signIn(provider: Provider, profile: Profile, locale?: string) {
  const id = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ readerId: readerIdentities.readerId })
      .from(readerIdentities)
      .where(and(eq(readerIdentities.provider, provider), eq(readerIdentities.providerUserId, profile.id)));
    if (found) {
      await tx.update(readers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(readers.id, found.readerId));
      return found.readerId;
    }
    const nickname = (profile.name ?? "").trim().slice(0, 20) || `독자${Math.floor(1000 + Math.random() * 9000)}`;
    const [r] = await tx
      .insert(readers)
      .values({ nickname, email: profile.email, locale: locale ?? "ko", lastLoginAt: new Date() })
      .returning({ id: readers.id });
    await tx.insert(readerIdentities).values({ readerId: r.id, provider, providerUserId: profile.id, email: profile.email });
    return r.id;
  });
  const [r] = await db.select({ v: readers.sessionVersion }).from(readers).where(eq(readers.id, id));
  (await cookies()).set(READER_COOKIE, await signReader(id, r.v), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: READER_MAX_AGE,
  });
}

export type Reader = typeof readers.$inferSelect;

/** 지금 로그인한 독자. 로그아웃·탈퇴로 세션 버전이 바뀌었으면 null. */
export async function currentReader(): Promise<Reader | null> {
  const t = await verifyReader((await cookies()).get(READER_COOKIE)?.value);
  if (!t) return null;
  const [r] = await db.select().from(readers).where(eq(readers.id, t.readerId));
  if (!r || r.sessionVersion !== t.version) return null;
  return r;
}

export async function signOut(everywhere = false) {
  const jar = await cookies();
  if (everywhere) {
    const r = await currentReader();
    if (r) await db.update(readers).set({ sessionVersion: sql`${readers.sessionVersion} + 1` }).where(eq(readers.id, r.id));
  }
  jar.delete(READER_COOKIE);
}

export async function linkedProviders(readerId: string): Promise<string[]> {
  const rows = await db.select({ p: readerIdentities.provider }).from(readerIdentities).where(eq(readerIdentities.readerId, readerId));
  return rows.map((r) => r.p);
}

/** 탈퇴: 회원과 연결 계정, 서재, 읽은 기록을 지워요 (앱스토어 계정 삭제 요건). */
export async function deleteReader(readerId: string) {
  await db.delete(readers).where(eq(readers.id, readerId));
  (await cookies()).delete(READER_COOKIE);
}

export { safeNext };
