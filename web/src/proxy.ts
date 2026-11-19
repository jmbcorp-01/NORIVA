import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// 스튜디오 경로의 1차 확인. 실제 권한 검사는 각 화면과 서버 액션의 requireOwner()가 해요.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/studio/login") return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/studio/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*"],
};
