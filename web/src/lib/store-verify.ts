import "server-only";
import { decodeJwt, importPKCS8, SignJWT } from "jose";

/**
 * 인앱결제 영수증 확인 (3단계 앱 출시 때 켜요).
 * 앱은 결제가 끝나면 거래 번호(iOS) 또는 구매 토큰(Android)을 /api/iap/verify로 보내고,
 * 서버는 애플·구글 서버에 직접 물어본 뒤에만 코인을 넣어요. 앱이 보낸 내용만 믿지 않아요.
 *
 * 필요한 설정 (AWS Secrets Manager):
 *  - iOS: APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY(.p8 내용), APPLE_BUNDLE_ID, APPLE_IAP_SANDBOX=1(심사·시험 중)
 *  - Android: GOOGLE_PLAY_PACKAGE, GOOGLE_PLAY_SERVICE_ACCOUNT(서비스 계정 JSON)
 */

export type VerifiedPurchase = { productId: string; transactionId: string; raw: Record<string, unknown> };

export class StoreVerifyError extends Error {}

export function storeConfigured(store: "app_store" | "play"): boolean {
  const e = process.env;
  return store === "app_store"
    ? Boolean(e.APPLE_IAP_ISSUER_ID && e.APPLE_IAP_KEY_ID && e.APPLE_IAP_PRIVATE_KEY && e.APPLE_BUNDLE_ID)
    : Boolean(e.GOOGLE_PLAY_PACKAGE && e.GOOGLE_PLAY_SERVICE_ACCOUNT);
}

/** iOS: App Store Server API로 거래 하나를 조회해요 */
export async function verifyApple(transactionId: string): Promise<VerifiedPurchase> {
  const e = process.env;
  if (!storeConfigured("app_store")) throw new StoreVerifyError("App Store 결제 설정이 없어요");
  if (!/^\d{1,30}$/.test(transactionId)) throw new StoreVerifyError("거래 번호 형식이 아니에요");
  const key = await importPKCS8(e.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n"), "ES256");
  const token = await new SignJWT({ bid: e.APPLE_BUNDLE_ID })
    .setProtectedHeader({ alg: "ES256", kid: e.APPLE_IAP_KEY_ID, typ: "JWT" })
    .setIssuer(e.APPLE_IAP_ISSUER_ID!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience("appstoreconnect-v1")
    .sign(key);
  const host = e.APPLE_IAP_SANDBOX === "1" ? "api.storekit-sandbox.itunes.apple.com" : "api.storekit.itunes.apple.com";
  const res = await fetch(`https://${host}/inApps/v1/transactions/${transactionId}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new StoreVerifyError(`App Store 확인 실패 (${res.status})`);
  const body = (await res.json()) as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) throw new StoreVerifyError("App Store 응답에 거래 정보가 없어요");
  // 애플 서버에서 직접(우리 인증으로) 받은 값이라 내용을 읽어 확인해요
  const info = decodeJwt(body.signedTransactionInfo) as Record<string, unknown>;
  if (info.bundleId !== e.APPLE_BUNDLE_ID) throw new StoreVerifyError("다른 앱의 거래예요");
  if (info.revocationDate) throw new StoreVerifyError("환불된 거래예요");
  return { productId: String(info.productId), transactionId: String(info.transactionId), raw: info };
}

async function googleAccessToken(): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT!) as { client_email: string; private_key: string };
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new StoreVerifyError(`Google 인증 실패 (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Android: Play Developer API로 구매 토큰을 조회해요. 코인을 넣은 뒤 consumeGoogle로 '사용함' 처리해야 같은 상품을 다시 살 수 있어요. */
export async function verifyGoogle(productId: string, purchaseToken: string): Promise<VerifiedPurchase> {
  if (!storeConfigured("play")) throw new StoreVerifyError("Google Play 결제 설정이 없어요");
  if (!/^[\w.]{1,100}$/.test(productId) || !/^[\w.\-:]{10,4096}$/.test(purchaseToken)) throw new StoreVerifyError("구매 정보 형식이 아니에요");
  const pkg = process.env.GOOGLE_PLAY_PACKAGE!;
  const token = await googleAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${productId}/tokens/${purchaseToken}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new StoreVerifyError(`Google Play 확인 실패 (${res.status})`);
  const info = (await res.json()) as Record<string, unknown>;
  if (info.purchaseState !== 0) throw new StoreVerifyError("결제가 끝나지 않은 구매예요");
  return { productId, transactionId: String(info.orderId ?? purchaseToken), raw: info };
}

export async function consumeGoogle(productId: string, purchaseToken: string) {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE!;
  const token = await googleAccessToken();
  await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${productId}/tokens/${purchaseToken}:consume`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}
