// 기본 지침, 금지 표현, 소재를 넣어요. 이미 있는 항목은 건너뛰어서 여러 번 실행해도 안전해요.
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { databaseConfig } from "../src/db/url";
import { DEFAULT_BANNED_TERMS, DEFAULT_GUIDELINES, DEFAULT_SOURCES } from "../src/db/seed-data";

const pool = new Pool(databaseConfig());
const db = drizzle(pool, { schema });

async function main() {
  let g = 0;
  for (const d of DEFAULT_GUIDELINES) {
    const existing = await db
      .select()
      .from(schema.guidelines)
      .where(and(eq(schema.guidelines.scope, "global"), eq(schema.guidelines.scopeRef, ""), eq(schema.guidelines.agent, d.agent)));
    if (existing.length) continue;
    const [row] = await db
      .insert(schema.guidelines)
      .values({ scope: "global", scopeRef: "", agent: d.agent, title: d.title, currentVersion: 1 })
      .returning();
    await db.insert(schema.guidelineVersions).values({ guidelineId: row.id, version: 1, body: d.body, note: "기본 지침 (docs 02~04번)" });
    g++;
  }

  let b = 0;
  const terms = await db.select().from(schema.bannedTerms);
  for (const t of DEFAULT_BANNED_TERMS) {
    if (terms.some((x) => x.kind === t.kind && x.term === t.term)) continue;
    await db.insert(schema.bannedTerms).values(t);
    b++;
  }

  let s = 0;
  const existingSources = await db.select({ name: schema.sources.name }).from(schema.sources);
  for (const src of DEFAULT_SOURCES) {
    if (existingSources.some((x) => x.name === src.name)) continue;
    await db.insert(schema.sources).values(src);
    s++;
  }
  console.log(`지침 ${g}개, 금지 표현 ${b}개, 소재 ${s}개를 넣었어요.`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
