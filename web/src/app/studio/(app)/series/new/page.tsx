import { ErrorNotice } from "@/components/error-notice";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Button, Card, Input, Label, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { AGE_RATING, GENRES, SOURCE_CATEGORY } from "@/lib/labels";
import { createSeries } from "../../../actions";

export default async function NewSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; candidate?: string }>;
}) {
  const { error, candidate: candidateId } = await searchParams;
  const sources = await db.select().from(schema.sources).orderBy(asc(schema.sources.category), asc(schema.sources.name));
  // 소재 발굴함에서 "이 소재로 작품 기획"을 누르면 후보 내용으로 미리 채워요
  const [cand] =
    candidateId && /^[0-9a-f-]{36}$/.test(candidateId)
      ? await db.select().from(schema.sourceCandidates).where(eq(schema.sourceCandidates.id, candidateId))
      : [];
  const pre = cand?.body;
  const preGenre = pre ? GENRES.find((g) => pre.genre.includes(g) || g.split("·").some((w) => pre.genre.includes(w))) : undefined;
  const preMemo = pre
    ? [
        `소재 발굴함 후보 "${pre.name}"에서 시작해요.`,
        pre.combo ? `조합: ${pre.combo}` : "",
        pre.loglines.length ? `로그라인 후보:\n${pre.loglines.map((l) => `- ${l}`).join("\n")}` : "",
        pre.difference ? `차별점: ${pre.difference}` : "",
        pre.similarHits.length ? `겹치지 않게 할 작품: ${pre.similarHits.join(", ")}` : "",
        pre.factCheck.length ? `고증 주의: ${pre.factCheck.join(" / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;

  return (
    <>
      <PageHeader
        title="새 작품 기획"
        sub="장르와 뿌리가 될 소재를 고르면 기획 에이전트가 기획안 3개를 만들어요. 고른 소재가 이야기의 엔진이 돼야 해요 (R-1, R-2)."
      />
      <ErrorNotice>{error}</ErrorNotice>
      {pre ? (
        <Notice tone="indigo">
          소재 발굴 후보 &ldquo;{pre.name}&rdquo;의 내용으로 채워 뒀어요. 장르와 메모를 다듬은 뒤 기획안을 만들어 보세요.
        </Notice>
      ) : null}
      <form action={createSeries} className="space-y-7">
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <Label hint="비워 두면 기획안에서 정해요">가제 (한국어)</Label>
            <Input name="title" placeholder="예: 소금과 향" />
          </label>
          <label>
            <Label>가제 (영어)</Label>
            <Input name="titleEn" placeholder="Salt & Incense" />
          </label>
          <label>
            <Label>장르</Label>
            <Select name="genre" required defaultValue={preGenre}>
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>연령 등급</Label>
            <Select name="ageRating" defaultValue="15">
              {Object.entries(AGE_RATING).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <Label>톤</Label>
            <Input name="tone" placeholder="예: 정적인 공포에 건조한 유머, 밑바닥은 따뜻한 가족 이야기" />
          </label>
          <label>
            <Label>대상 독자</Label>
            <Input name="audience" placeholder="예: 20~30대, 한국어·영어 동시" />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-ink-soft">
            뿌리 소재 <span className="font-normal text-ink-faint">하나 이상</span>
          </legend>
          {sources.length === 0 ? (
            <p className="text-[13px] text-ink-faint">소재 라이브러리에 먼저 소재를 추가해 주세요.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((s) => (
                <label key={s.id} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="sourceIds"
                    value={s.id}
                    defaultChecked={s.id === cand?.sourceId}
                    className="peer sr-only"
                  />
                  <Card className="h-full px-3.5 py-3 transition-colors peer-checked:border-indigo peer-checked:bg-indigo-soft peer-focus-visible:outline-2 peer-focus-visible:outline-indigo">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{s.name}</span>
                      <span className="text-[11px] text-ink-faint">{SOURCE_CATEGORY[s.category]}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] text-ink-soft">{s.summary}</p>
                  </Card>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <label className="block">
          <Label hint="기획 에이전트에게 그대로 전달돼요">메모</Label>
          <Textarea
            name="memo"
            rows={pre ? 9 : 4}
            defaultValue={preMemo}
            placeholder="예: 미국에서 자란 한국계 주인공이 할머니의 신당을 물려받는 이야기. 로맨스는 빼고 가족과 빚에 집중."
          />
        </label>
        <Button variant="seal" type="submit">
          기획안 만들기
        </Button>
      </form>
    </>
  );
}
