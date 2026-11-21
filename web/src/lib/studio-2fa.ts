import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * 스튜디오 2단계 인증 비밀값. studio_settings에 암호화해서 둬요 (SESSION_SECRET에서 키를 만들어요).
 * 'totp_pending'은 설정 중인 값, 'totp_secret'은 켜진 값이에요.
 */

const KEY_ON = "totp_secret";
const KEY_PENDING = "totp_pending";

function key(): Buffer {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET 환경 변수가 32자 이상이어야 해요");
  return Buffer.from(hkdfSync("sha256", s, "noriva", "studio-totp", 32));
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function open(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function read(k: string): Promise<string | null> {
  const [r] = await db.select({ v: schema.studioSettings.value }).from(schema.studioSettings).where(eq(schema.studioSettings.key, k));
  return r ? open(r.v) : null;
}

async function write(k: string, plain: string) {
  const value = seal(plain);
  await db
    .insert(schema.studioSettings)
    .values({ key: k, value })
    .onConflictDoUpdate({ target: schema.studioSettings.key, set: { value, updatedAt: new Date() } });
}

export const totpSecret = () => read(KEY_ON);
export const pendingSecret = () => read(KEY_PENDING);
export const setPending = (secret: string) => write(KEY_PENDING, secret);

export async function enable(secret: string) {
  await write(KEY_ON, secret);
  await db.delete(schema.studioSettings).where(eq(schema.studioSettings.key, KEY_PENDING));
}

export async function disable() {
  await db.delete(schema.studioSettings).where(inArray(schema.studioSettings.key, [KEY_ON, KEY_PENDING]));
}
