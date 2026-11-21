import { NextResponse } from "next/server";
import { readPanel, verifyPanel } from "@/lib/panel-media";

/** 유료 회차 그림: 서명과 만료 시각을 확인한 뒤에만 보여줘요 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("k") ?? "";
  const exp = Number(u.searchParams.get("e"));
  const sig = u.searchParams.get("s") ?? "";
  if (!verifyPanel(key, exp, sig)) return new NextResponse("forbidden", { status: 403 });
  const data = await readPanel(key);
  if (!data) return new NextResponse("not found", { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": key.endsWith(".png") ? "image/png" : "image/jpeg",
      "cache-control": "private, max-age=600",
      "x-content-type-options": "nosniff",
    },
  });
}
