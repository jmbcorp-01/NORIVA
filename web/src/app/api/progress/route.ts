import { NextResponse } from "next/server";
import { z } from "zod";
import { recordProgress } from "@/lib/library";
import { currentReader } from "@/lib/reader-auth";

const Body = z.object({
  slug: z.string().min(1).max(120),
  ep: z.number().int().min(1).max(9999),
  maxPanel: z.number().int().min(0).max(10000),
  panelCount: z.number().int().min(1).max(10000),
});

/** 뷰어가 보내는 읽은 위치. 로그인한 독자만 저장해요. */
export async function POST(req: Request) {
  const reader = await currentReader();
  if (!reader) return new NextResponse(null, { status: 204 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { slug, ep, maxPanel, panelCount } = parsed.data;
  const ok = await recordProgress(reader.id, slug, ep, maxPanel, panelCount);
  return new NextResponse(null, { status: ok ? 204 : 404 });
}
