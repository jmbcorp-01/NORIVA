import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CREDIT_ROLES, defaultCredits, type Credit } from "./credits";
import type { SeriesFormat } from "./pipeline";
import { StudioError } from "./studio";

const { seriesCredits, series, decisionLedger } = schema;

export type CreditRow = typeof seriesCredits.$inferSelect;

const plain = (c: CreditRow | Credit) => ({
  role: c.role,
  label: c.label,
  name: c.name,
  kind: c.kind,
  aiTool: c.aiTool,
  basis: c.basis,
  note: c.note,
  fromEpisode: c.fromEpisode,
  visible: c.visible,
  sort: c.sort,
});

/** 작품 크레딧. 한 번도 넣지 않은 작품(이 기능 전에 만든 작품 포함)은 필수 항목 기본값을 먼저 넣어요. */
export async function seriesCreditsOf(seriesId: string, actor = "system"): Promise<CreditRow[]> {
  const rows = await db.select().from(seriesCredits).where(eq(seriesCredits.seriesId, seriesId)).orderBy(asc(seriesCredits.sort), asc(seriesCredits.createdAt));
  if (rows.length) return rows;
  const [s] = await db.select({ format: series.format }).from(series).where(eq(series.id, seriesId));
  if (!s) return [];
  const defaults = defaultCredits((s.format ?? "webtoon") as SeriesFormat);
  const inserted = await db
    .insert(seriesCredits)
    .values(defaults.map((d) => ({ ...plain(d), seriesId })))
    .returning();
  await db.insert(decisionLedger).values({
    seriesId,
    actor,
    action: "credit_default",
    after: defaults.map(plain),
    note: "크레딧 필수 항목 기본값",
  });
  return inserted;
}

export type CreditInput = Omit<Credit, "id">;

function check(input: CreditInput) {
  if (!CREDIT_ROLES[input.role]) throw new StudioError("알 수 없는 크레딧 역할이에요");
  if (!input.name.trim()) throw new StudioError("이름을 적어 주세요");
  if (input.role === "custom" && !input.label.trim()) throw new StudioError("직접 입력은 역할 이름을 적어 주세요");
  if (input.role === "original" && !["contract", "public_domain", "own"].includes(input.basis)) {
    throw new StudioError("원작은 이용 근거(계약, 저작권 만료, 자체 원작)를 골라 주세요");
  }
  if (input.role === "ai" && input.kind === "human") throw new StudioError("AI 제작 표시는 사람으로 적을 수 없어요");
}

export async function addCredit(seriesId: string, input: CreditInput, actor: string) {
  check(input);
  const [row] = await db.insert(seriesCredits).values({ ...input, seriesId }).returning();
  await db.insert(decisionLedger).values({ seriesId, actor, action: "credit_add", after: plain(row), note: `크레딧 추가: ${input.name}` });
}

export async function updateCredit(id: string, input: CreditInput, actor: string) {
  check(input);
  const [cur] = await db.select().from(seriesCredits).where(eq(seriesCredits.id, id));
  if (!cur) throw new StudioError("크레딧을 찾을 수 없어요");
  const [row] = await db.update(seriesCredits).set({ ...input, updatedAt: new Date() }).where(eq(seriesCredits.id, id)).returning();
  await db.insert(decisionLedger).values({
    seriesId: cur.seriesId,
    actor,
    action: "credit_edit",
    before: plain(cur),
    after: plain(row),
    note: `크레딧 수정: ${cur.name} → ${row.name}`,
  });
  return cur.seriesId;
}

export async function deleteCredit(id: string, actor: string) {
  const [cur] = await db.select().from(seriesCredits).where(eq(seriesCredits.id, id));
  if (!cur) throw new StudioError("크레딧을 찾을 수 없어요");
  await db.delete(seriesCredits).where(eq(seriesCredits.id, id));
  await db.insert(decisionLedger).values({ seriesId: cur.seriesId, actor, action: "credit_delete", before: plain(cur), note: `크레딧 삭제: ${cur.name}` });
  return cur.seriesId;
}
