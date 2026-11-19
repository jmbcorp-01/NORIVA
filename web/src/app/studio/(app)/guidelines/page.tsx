import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Label, Notice, PageHeader, Select } from "@/components/ui";
import { AGENT_LABEL, GENRES, SCOPE_LABEL } from "@/lib/labels";
import { createScopedGuideline } from "../../actions";

export default async function GuidelinesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [rows, seriesRows] = await Promise.all([
    db.select().from(schema.guidelines).orderBy(asc(schema.guidelines.scope), asc(schema.guidelines.updatedAt)),
    db.select({ id: schema.series.id, title: schema.series.title }).from(schema.series),
  ]);
  const seriesTitle = Object.fromEntries(seriesRows.map((s) => [s.id, s.title]));

  return (
    <>
      <PageHeader
        title="지침 관리"
        sub="에이전트마다 따르는 규칙이에요. 전체 < 장르 < 작품 < 회차 순서로 아래 범위가 위를 덮어써요. 저장할 때마다 새 버전이 쌓이고, 모든 결과물에 어느 버전으로 만들었는지 남아요."
      />
      <Notice>{error}</Notice>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(AGENT_LABEL).map(([agent, label]) => {
          const layers = rows.filter((r) => r.agent === agent);
          return (
            <Card key={agent} className="px-4 py-4">
              <h2 className="mb-3 font-serif text-[16px] font-semibold">{label}</h2>
              <ul className="space-y-1.5">
                {layers.map((g) => (
                  <li key={g.id}>
                    <Link href={`/studio/guidelines/${g.id}`} className="flex items-center gap-2 text-[13px] hover:text-indigo">
                      <Badge tone={g.scope === "global" ? "neutral" : "indigo"}>{SCOPE_LABEL[g.scope]}</Badge>
                      <span className="truncate">
                        {g.scope === "series" ? seriesTitle[g.scopeRef] ?? g.title : g.scope === "genre" ? g.scopeRef : g.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-ink-faint">v{g.currentVersion}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 mb-3 text-[14px] font-semibold">범위 지침 추가</h2>
      <Card className="px-4 py-4">
        <p className="mb-4 text-[13px] text-ink-soft">
          특정 장르나 작품에만 적용할 규칙을 더해요. 예: 오컬트 장르는 공포 장면에 무대사 컷을 더 많이, 이 작품은 하나의 말투를 더 건조하게.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <form action={createScopedGuideline} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="scope" value="genre" />
            <label className="min-w-[140px] flex-1">
              <Label>장르</Label>
              <Select name="scopeRef">
                {GENRES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </label>
            <AgentSelect />
            <Button type="submit">추가</Button>
          </form>
          <form action={createScopedGuideline} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="scope" value="series" />
            <label className="min-w-[140px] flex-1">
              <Label>작품</Label>
              <Select name="scopeRef" disabled={seriesRows.length === 0}>
                {seriesRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </label>
            <AgentSelect />
            <Button type="submit" disabled={seriesRows.length === 0}>
              추가
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}

function AgentSelect() {
  return (
    <label className="min-w-[120px] flex-1">
      <Label>에이전트</Label>
      <Select name="agent">
        {Object.entries(AGENT_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
    </label>
  );
}
