import { NextResponse, type NextRequest } from "next/server";
import { completeLogin, enabledProviders, LoginError, PROVIDERS } from "@/lib/reader-auth";

async function handle(req: NextRequest, provider: string, params: URLSearchParams) {
  const p = PROVIDERS.find((x) => x === provider);
  // 애플은 다른 사이트에서 POST로 돌아와요. 303으로 GET 화면으로 보내요.
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  if (!p || !enabledProviders().includes(p)) return go("/login?error=unavailable");
  try {
    return go(await completeLogin(p, params));
  } catch (e) {
    if (!(e instanceof LoginError)) console.error("reader login failed", provider, e);
    return go(`/login?error=${e instanceof LoginError ? "expired" : "failed"}`);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, (await params).provider, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const form = await req.formData();
  const qs = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === "string") qs.set(k, v);
  return handle(req, (await params).provider, qs);
}
