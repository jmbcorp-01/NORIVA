import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 앱은 웹 서비스 주소를 그대로 열어요. 코드는 웹 하나만 고치면 앱에도 반영돼요.
 * NORIVA_URL에 실제 서비스 주소(예: https://k-noriva.com)를 넣고 `npx cap sync`를 실행해요.
 */
const url = process.env.NORIVA_URL;
if (!url) throw new Error("NORIVA_URL 환경 변수에 서비스 주소를 넣어 주세요 (예: https://k-noriva.com)");

const config: CapacitorConfig = {
  appId: "kr.noriva.app",
  appName: "NORIVA",
  webDir: "www",
  server: { url, cleartext: false, allowNavigation: [new URL(url).host] },
  ios: { contentInset: "never" },
  android: { allowMixedContent: false },
};

export default config;
