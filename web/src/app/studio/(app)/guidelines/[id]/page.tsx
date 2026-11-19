import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, formatDate, Input, Label, Notice, PageHeader, Textarea } from "@/components/ui";
import { AGENT_LABEL, SCOPE_LABEL } from "@/lib/labels";
import { restoreGuidelineVersion, saveGuidelineVersion } from "../../../actions";

export default async function GuidelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; restored?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [g] = await db.select().from(schema.guidelines).where(eq(schema.guidelines.id, id));
  if (!g) notFound();
  const versions = await db
    .select()
    .from(schema.guidelineVersions)
    .where(eq(schema.guidelineVersions.guidelineId, id))
    .orderBy(desc(schema.guidelineVersions.version));
  const current = versions.find((v) => v.version === g.currentVersion) ?? versions[0];
  const body = current.body;
  let scopeName = g.scopeRef;
  if (g.scope === "series") {
    const [s] = await db.select({ title: schema.series.title }).from(schema.series).where(and(eq(schema.series.id, g.scopeRef)));
    scopeName = s?.title ?? g.scopeRef;
  }

  return (
    <>
      <PageHeader
        title={`${AGENT_LABEL[g.agent]} 지침`}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={g.scope === "global" ? "neutral" : "indigo"}>{SCOPE_LABEL[g.scope]}</Badge>
            {g.scope !== "global" ? <span>{scopeName}</span> : null}
            <span>현재 v{g.currentVersion}</span>
          </span>
        }
      />
      <Notice>{sp.error}</Notice>
      {sp.saved ? <Notice tone="pine">새 버전으로 저장했어요. 다음 생성부터 적용돼요.</Notice> : null}
      {sp.restored ? <Notice tone="pine">v{sp.restored}로 되돌렸어요.</Notice> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <form action={saveGuidelineVersion} className="space-y-5">
          <input type="hidden" name="id" value={g.id} />
          <label className="block">
            <Label>역할</Label>
            <Textarea name="role" rows={3} defaultValue={body.role} required />
          </label>
          <label className="block">
            <Label hint="한 줄에 하나, '코드 | 내용' 형식">규칙</Label>
            <Textarea
              name="rules"
              rows={Math.min(22, Math.max(6, body.rules.length + 2))}
              defaultValue={body.rules.map((r) => (r.code ? `${r.code} | ${r.text}` : r.text)).join("\n")}
              className="font-mono text-[13px]"
            />
          </label>
          <label className="block">
            <Label hint="한 줄에 하나">금지 목록</Label>
            <Textarea name="banned" rows={5} defaultValue={body.banned.join("\n")} />
          </label>
          <label className="block">
            <Label>출력 형식</Label>
            <Textarea name="outputFormat" rows={3} defaultValue={body.outputFormat} />
          </label>
          <label className="block">
            <Label hint="좋은 예, 나쁜 예">예시</Label>
            <Textarea name="examples" rows={4} defaultValue={body.examples} />
          </label>
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <label className="min-w-[240px] flex-1">
              <Label>바꾼 이유</Label>
              <Input name="note" placeholder="예: 3화 대사가 너무 설명적이라 D-2 강화" />
            </label>
            <Button variant="primary" type="submit">
              새 버전으로 저장
            </Button>
          </div>
        </form>

        <aside>
          <h2 className="mb-3 text-[13px] font-semibold">버전 기록</h2>
          <Card>
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">v{v.version}</span>
                    {v.version === g.currentVersion ? <Badge tone="pine">사용 중</Badge> : null}
                    {v.version !== g.currentVersion ? (
                      <form action={restoreGuidelineVersion} className="ml-auto">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="version" value={v.version} />
                        <button className="text-[12px] text-indigo underline-offset-4 hover:underline">되돌리기</button>
                      </form>
                    ) : null}
                  </div>
                  {v.note ? <p className="mt-1 text-[12px] text-ink-soft">{v.note}</p> : null}
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(v.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
