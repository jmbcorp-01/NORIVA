import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentOwner } from "@/lib/auth";
import { historyCsv, seriesHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

/** 제작 이력 CSV 내려받기 (대표만) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [s] = await db.select({ slug: schema.series.slug }).from(schema.series).where(eq(schema.series.id, id));
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const csv = historyCsv(await seriesHistory(id));
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="noriva-history-${s.slug}.csv"`,
      "cache-control": "no-store",
    },
  });
}
