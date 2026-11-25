import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { seriesHistory } from "@/lib/history";
import { seriesCreditsOf } from "@/lib/credits-store";
import { roleLabel } from "@/lib/credits";

/** 제작 이력: 단계마다 AI가 만든 것과 대표의 결정 (저작권 등록·분쟁 때 증빙) */
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, id));
  if (!s) notFound();
  const [rows, credits] = await Promise.all([seriesHistory(id), seriesCreditsOf(id)]);
  const owner = rows.filter((r) => r.who === "owner").length;
  const fmt = (d: Date) => d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <PageHeader
        title="제작 이력"
        sub={
          <Link href={`/studio/series/${id}`} className="text-indigo underline-offset-4 hover:underline">
            {s.title}
          </Link>
        }
        actions={
          <LinkButton href={`/studio/series/${id}/history/export`} prefetch={false}>
            파일로 내려받기 (CSV)
          </LinkButton>
        }
      />
      <p className="mb-4 text-[13px] text-ink-soft">
        AI가 만든 결과 {rows.length - owner}건, 대표의 선택·수정·승인 {owner}건이에요. AI가 만든 부분만으로는 저작권 보호가 어려워서, 대표의 결정 기록이 사람 기여의 증거가 돼요.
        저작권 등록이나 분쟁 때 이 파일을 내려받아 쓰세요.
      </p>
      <Card className="mb-6 px-4 py-3 text-[13px]">
        <span className="font-medium">크레딧 </span>
        {credits.filter((c) => c.visible).map((c) => `${roleLabel(c)} ${c.name}${c.aiTool ? ` (${c.aiTool})` : ""}`).join(" · ")}
        <Link href={`/studio/series/${id}/credits`} className="ml-2 text-indigo underline-offset-4 hover:underline">
          고치기
        </Link>
      </Card>
      {rows.length === 0 ? (
        <Empty>아직 기록이 없어요.</Empty>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-left text-ink-faint">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">시각</th>
                  <th className="px-3 py-2 font-medium">누가</th>
                  <th className="px-3 py-2 font-medium">회차</th>
                  <th className="px-3 py-2 font-medium">단계</th>
                  <th className="px-3 py-2 font-medium">한 일</th>
                  <th className="px-3 py-2 font-medium">내용 · 모델</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i} className={r.who === "owner" ? "" : "text-ink-soft"}>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmt(r.at)}</td>
                    <td className="px-3 py-1.5">{r.who === "ai" ? <Badge>AI</Badge> : <Badge tone="indigo">대표</Badge>}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.episode ? `${r.episode}화` : ""}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.stage}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.action}</td>
                    <td className="px-3 py-1.5">
                      {r.detail}
                      {r.models ? <span className="text-ink-faint"> {r.models}{r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ""}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
