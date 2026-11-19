import { NextResponse, type NextRequest } from "next/server";
import { beginLogin, devLoginEnabled, enabledProviders, PROVIDERS, safeNext, signIn } from "@/lib/reader-auth";

/** /auth/kakao?next=/library → 제공자 로그인 화면으로 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const next = req.nextUrl.searchParams.get("next");
  if (provider === "dev" && devLoginEnabled()) {
    await signIn("dev", { id: "local-dev", email: null, name: "시험 독자" });
    return NextResponse.redirect(new URL(safeNext(next), req.url));
  }
  const p = PROVIDERS.find((x) => x === provider);
  if (!p || !enabledProviders().includes(p)) return NextResponse.redirect(new URL("/login?error=unavailable", req.url));
  return NextResponse.redirect(await beginLogin(p, next));
}
