import { beforeAll, describe, expect, it } from "vitest";
import { signReader, verifyReader } from "./reader-session";
import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
});

describe("독자 세션", () => {
  it("서명한 독자 id와 세션 버전을 돌려줘요", async () => {
    expect(await verifyReader(await signReader("r1", 3))).toEqual({ readerId: "r1", version: 3 });
  });
  it("스튜디오 토큰으로는 독자 로그인이 안 되고, 그 반대도 안 돼요", async () => {
    expect(await verifyReader(await signSession("owner@example.com"))).toBeNull();
    expect(await verifySession(await signReader("r1", 1))).toBeNull();
  });
  it("망가진 토큰은 null", async () => {
    expect(await verifyReader("abc")).toBeNull();
    expect(await verifyReader(undefined)).toBeNull();
  });
});
