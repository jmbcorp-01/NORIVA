import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/auth";
import { getPrivate } from "@/lib/private-media";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** 대표만 보는 참고 캡처 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!(await currentOwner())) return new NextResponse("unauthorized", { status: 401 });
  const { key } = await params;
  const k = key.join("/");
  const type = TYPES[k.split(".").pop()?.toLowerCase() ?? ""];
  if (!type || k.includes("..")) return new NextResponse("not found", { status: 404 });
  const data = await getPrivate(k);
  if (!data) return new NextResponse("not found", { status: 404 });
  return new NextResponse(data as BodyInit, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
}
