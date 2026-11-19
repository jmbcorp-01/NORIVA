import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Button, Card, Input, Label, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { AGE_RATING, GENRES, SOURCE_CATEGORY } from "@/lib/labels";
import { createSeries } from "../../../actions";

export default async function NewSeriesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sources = await db.select().from(schema.sources).orderBy(asc(schema.sources.category), asc(schema.sources.name));

  return (
    <>
      <PageHeader
        title="새 작품 기획"
        sub="장르와 뿌리가 될 소재를 고르면 기획 에이전트가 기획안 3개를 만들어요. 고른 소재가 이야기의 엔진이 돼야 해요 (R-1, R-2)."
      />
      <Notice>{error}</Notice>
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
            <Select name="genre" required>
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
                  <input type="checkbox" name="sourceIds" value={s.id} className="peer sr-only" />
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
            rows={4}
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
