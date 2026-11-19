import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { SOURCE_CATEGORY } from "@/lib/labels";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const valid = c && c in SOURCE_CATEGORY ? (c as (typeof schema.sourceCategory.enumValues)[number]) : undefined;
  const rows = await db
    .select()
    .from(schema.sources)
    .where(valid ? eq(schema.sources.category, valid) : undefined)
    .orderBy(asc(schema.sources.name));

  return (
    <>
      <PageHeader
        title="소재 라이브러리"
        sub="모든 작품의 뿌리가 되는 설화, 역사, 민속이에요. 새 작품을 기획할 때 여기서 하나 이상 골라야 해요."
        actions={<LinkButton href="/studio/sources/new" variant="primary">소재 추가</LinkButton>}
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterLink href="/studio/sources" active={!valid}>전체</FilterLink>
        {Object.entries(SOURCE_CATEGORY).map(([k, v]) => (
          <FilterLink key={k} href={`/studio/sources?c=${k}`} active={valid === k}>
            {v}
          </FilterLink>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>아직 소재가 없어요.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Link key={s.id} href={`/studio/sources/${s.id}`} className="group">
              <Card className="h-full px-4 py-4 transition-colors group-hover:border-line-strong">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-serif text-[16px] font-semibold">{s.name}</span>
                  <Badge>{SOURCE_CATEGORY[s.category]}</Badge>
                </div>
                <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-soft">{s.summary}</p>
                <p className="mt-3 text-[12px] text-ink-faint">{s.era}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-[12px] ${
        active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:bg-paper-sunk"
      }`}
    >
      {children}
    </Link>
  );
}
