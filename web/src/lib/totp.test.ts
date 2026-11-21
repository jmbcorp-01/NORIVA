import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpCode, verifyTotp } from "./totp";

// RFC 6238 부록 B의 SHA-1 시험 값 (비밀값 "12345678901234567890")
const secret = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("base32 왕복", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("RFC 시험 값과 같아요", () => {
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
    expect(totpCode(secret, 2000000000_000)).toBe("279037");
  });
  it("앞뒤 30초는 받고 그 밖은 거절", () => {
    const at = 1111111109_000;
    expect(verifyTotp(secret, "081804", at + 30_000)).toBe(true);
    expect(verifyTotp(secret, "081804", at + 90_000)).toBe(false);
    expect(verifyTotp(secret, "abc", at)).toBe(false);
  });
});
