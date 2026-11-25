# NORIVA 앱 (iOS·Android)

웹(`web/`)을 Capacitor로 감싼 앱이에요. 화면 코드는 따로 없고, 서비스 주소를 그대로 열어요.

## 처음 만들기
```bash
cd app
npm install
NORIVA_URL=https://k-noriva.com npx cap add ios
NORIVA_URL=https://k-noriva.com npx cap add android
NORIVA_URL=https://k-noriva.com npx cap sync
```

## 인앱결제 연결 (실제 작품이 준비되면)
1. App Store Connect·Google Play Console에 소모성 상품을 만들어요. 상품 번호는 스튜디오 '판매 관리'의 iOS·Android 칸과 같아야 해요 (기본: `kr.noriva.coins.10` / `coins_10` 등).
2. 앱에 인앱결제 플러그인(예: `@capgo/native-purchases` 또는 RevenueCat)을 넣어요.
3. 결제가 끝나면 앱이 웹 서버 `POST /api/iap/verify`로 영수증을 보내요.
   - iOS: `{ "store": "app_store", "transactionId": "..." }`
   - Android: `{ "store": "play", "productId": "coins_10", "purchaseToken": "..." }`
4. 서버가 스토어에 직접 확인한 뒤에만 코인을 넣어요. 같은 영수증은 두 번 들어가지 않아요.
5. 서버 환경 변수(비밀 값은 AWS Secrets Manager): `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_PLAY_SERVICE_ACCOUNT`. 스튜디오 '판매 관리' 맨 위에서 연결 상태를 볼 수 있어요.
