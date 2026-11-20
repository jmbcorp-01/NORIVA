// 기본 지침·금지 표현·소재를 DB에 넣어요. 웹 서버가 켜질 때와 npm run db:seed에서 불러요.
// 여러 번 실행해도 안전해요. 대표가 한 번도 고치지 않은 기본 지침은 새 기본값으로 버전을 올려요.
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { DEFAULT_BANNED_TERMS, DEFAULT_GUIDELINES, DEFAULT_SOURCES } from "./seed-data";

const DEFAULT_NOTE = "기본 지침";

/** jsonb는 키 순서를 바꿔 저장해서, 키를 정렬해 비교해요 */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export async function ensureDefaults(db: NodePgDatabase<typeof schema>) {
  return db.transaction(async (tx) => {
    // 웹 서버가 여러 대 동시에 켜져도 한 번만 넣게 잠가요
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    let added = 0;
    let updated = 0;
    for (const d of DEFAULT_GUIDELINES) {
      const [g] = await tx
        .select()
        .from(schema.guidelines)
        .where(and(eq(schema.guidelines.scope, "global"), eq(schema.guidelines.scopeRef, ""), eq(schema.guidelines.agent, d.agent)));
      if (!g) {
        const [row] = await tx
          .insert(schema.guidelines)
          .values({ scope: "global", scopeRef: "", agent: d.agent, title: d.title, currentVersion: 1 })
          .returning();
        await tx.insert(schema.guidelineVersions).values({ guidelineId: row.id, version: 1, body: d.body, note: `${DEFAULT_NOTE} (docs 02~04번)` });
        added++;
        continue;
      }
      const [latest] = await tx
        .select()
        .from(schema.guidelineVersions)
        .where(eq(schema.guidelineVersions.guidelineId, g.id))
        .orderBy(desc(schema.guidelineVersions.version))
        .limit(1);
      const untouched = !latest || latest.note.startsWith(DEFAULT_NOTE);
      if (untouched && stable(latest?.body) !== stable(d.body)) {
        const version = (latest?.version ?? 0) + 1;
        await tx.insert(schema.guidelineVersions).values({ guidelineId: g.id, version, body: d.body, note: `${DEFAULT_NOTE} 갱신` });
        await tx.update(schema.guidelines).set({ currentVersion: version, title: d.title }).where(eq(schema.guidelines.id, g.id));
        updated++;
      }
    }

    let banned = 0;
    const terms = await tx.select().from(schema.bannedTerms);
    for (const t of DEFAULT_BANNED_TERMS) {
      if (terms.some((x) => x.kind === t.kind && x.term === t.term)) continue;
      await tx.insert(schema.bannedTerms).values(t);
      banned++;
    }

    let sources = 0;
    const existing = await tx.select({ name: schema.sources.name }).from(schema.sources);
    for (const src of DEFAULT_SOURCES) {
      if (existing.some((x) => x.name === src.name)) continue;
      await tx.insert(schema.sources).values(src);
      sources++;
    }
    return { added, updated, banned, sources };
  });
}
