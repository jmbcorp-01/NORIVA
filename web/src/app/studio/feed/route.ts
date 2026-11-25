import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/auth";
import { jobLabel, recentlyFinishedRows } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** 최근 몇 분 안에 끝난 작업. 스튜디오 화면이 완료 알림을 띄울 때 읽어요. */
export async function GET() {
  if (!(await currentOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await recentlyFinishedRows(new Date(Date.now() - 5 * 60 * 1000));
  return NextResponse.json({
    jobs: rows.map((r) => ({
      id: r.job.id,
      ok: r.job.status === "done",
      title: `${r.name} · ${jobLabel(r.job.type)}`,
      href: r.href,
    })),
  });
}
