import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { SOURCE_CATEGORY } from "@/lib/labels";
import { saveSource } from "../../actions";
import type { schema } from "@/db";

type Source = typeof schema.sources.$inferSelect;

export function SourceForm({ source }: { source?: Source }) {
  return (
    <form action={saveSource} className="grid gap-5 md:grid-cols-2">
      {source ? <input type="hidden" name="id" value={source.id} /> : null}
      <label>
        <Label>이름</Label>
        <Input name="name" defaultValue={source?.name} required placeholder="예: 바리공주" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>분류</Label>
          <Select name="category" defaultValue={source?.category ?? "folktale"}>
            {Object.entries(SOURCE_CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>시대</Label>
          <Input name="era" defaultValue={source?.era} placeholder="조선 후기" />
        </label>
      </div>
      <label className="md:col-span-2">
        <Label hint="다섯 줄 안팎">요약</Label>
        <Textarea name="summary" rows={4} defaultValue={source?.summary} />
      </label>
      <label>
        <Label hint="한 줄에 하나. 이야기 장치로 쓸 규칙">핵심 규칙</Label>
        <Textarea name="rules" rows={5} defaultValue={source?.rules.join("\n")} />
      </label>
      <label>
        <Label hint="작화 참고">시각 요소</Label>
        <Textarea name="visualNotes" rows={5} defaultValue={source?.visualNotes} />
      </label>
      <label>
        <Label hint="한 줄에 하나">원전·참고 자료</Label>
        <Textarea name="references" rows={3} defaultValue={source?.references.join("\n")} />
      </label>
      <label>
        <Label hint="틀리기 쉬운 점">고증 메모</Label>
        <Textarea name="caution" rows={3} defaultValue={source?.caution} />
      </label>
      <label className="md:col-span-2">
        <Label hint="한 줄에 하나. 기획 에이전트가 겹침을 피해요">이미 쓴 유명 작품</Label>
        <Textarea name="overlapWorks" rows={2} defaultValue={source?.overlapWorks.join("\n")} />
      </label>
      <div className="md:col-span-2">
        <Button variant="primary" type="submit">
          저장
        </Button>
      </div>
    </form>
  );
}
