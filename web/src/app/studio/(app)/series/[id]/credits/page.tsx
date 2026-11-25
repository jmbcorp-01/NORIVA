import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ErrorNotice } from "@/components/error-notice";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select } from "@/components/ui";
import { seriesCreditsOf, type CreditRow } from "@/lib/credits-store";
import {
  CREDIT_BASIS_LABEL,
  CREDIT_KIND_LABEL,
  CREDIT_ROLES,
  creditBlockers,
  headlineCredits,
  missingRoles,
  roleLabel,
} from "@/lib/credits";
import { FORMAT_LABEL, type SeriesFormat } from "@/lib/pipeline";
import { removeCredit, saveCredit } from "../../../../actions";

/** 작품 크레딧: 글, 그림, 원작, 저작권자, AI 제작 표시 등 (docs/07 4절). 제작 중 언제든 더하고 고칠 수 있어요. */
export default async function CreditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, id));
  if (!s) notFound();
  const format = (s.format ?? "webtoon") as SeriesFormat;
  const credits = await seriesCreditsOf(id);
  const issues = creditBlockers(credits, format);
  const required = new Set(
    Object.entries(CREDIT_ROLES)
      .filter(([, r]) => r.need === "always" || (r.need === "webtoon" && format === "webtoon"))
      .map(([k]) => k),
  );
  const missing = missingRoles(credits, format);

  return (
    <>
      <PageHeader
        title="크레딧"
        sub={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Link href={`/studio/series/${id}`} className="text-indigo underline-offset-4 hover:underline">
              {s.title}
            </Link>
            <Badge>{FORMAT_LABEL[format]}</Badge>
            <Link href={`/studio/series/${id}/history`} className="ml-2 text-indigo underline-offset-4 hover:underline">
              제작 이력 보기
            </Link>
          </span>
        }
      />
      <ErrorNotice>{error}</ErrorNotice>
      {saved ? <p className="mb-3 text-[12px] text-pine">저장했어요. 바꾼 내용은 제작 원장에 남아요.</p> : null}
      {issues.length ? (
        <Notice tone="plum">
          공개 전에 고칠 것: {issues.join(" / ")}
        </Notice>
      ) : (
        <Notice tone="pine">필수 항목이 모두 있어요. 독자 화면에는 &ldquo;{headlineCredits(credits) || "-"}&rdquo;로 보여요.</Notice>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 text-[14px] font-semibold">지금 크레딧 {credits.length}개</h2>
          <ul className="space-y-2">
            {credits.map((c) => (
              <li key={c.id}>
                <Card className="px-4 py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-24 text-[12px] font-medium text-ink-soft">{roleLabel(c)}</span>
                      <span className="text-[14px]">{c.name}</span>
                      {c.aiTool ? <span className="text-[12px] text-ink-faint">({c.aiTool})</span> : null}
                      <span className="ml-auto flex items-center gap-1.5">
                        {required.has(c.role) ? <Badge tone="indigo">필수</Badge> : null}
                        <Badge>{CREDIT_KIND_LABEL[c.kind as keyof typeof CREDIT_KIND_LABEL] ?? c.kind}</Badge>
                        {c.fromEpisode ? <Badge>{c.fromEpisode}화부터</Badge> : null}
                        {!c.visible ? <Badge tone="ochre">독자에게 숨김</Badge> : null}
                        {c.role === "original" && c.basis ? <Badge tone="pine">{CREDIT_BASIS_LABEL[c.basis as keyof typeof CREDIT_BASIS_LABEL]}</Badge> : null}
                      </span>
                    </summary>
                    <CreditForm seriesId={id} credit={c} />
                    <form action={removeCredit} className="mt-2">
                      <input type="hidden" name="seriesId" value={id} />
                      <input type="hidden" name="creditId" value={c.id} />
                      <Button type="submit" variant="danger">
                        이 크레딧 지우기
                      </Button>
                      {required.has(c.role) ? <span className="ml-2 text-[12px] text-plum">필수 항목이라 지우면 공개할 수 없어요</span> : null}
                    </form>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
          {missing.length ? (
            <p className="mt-3 text-[13px] text-plum">빠진 필수 항목: {missing.map((r) => CREDIT_ROLES[r].ko).join(", ")}. 오른쪽에서 더해 주세요.</p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-[14px] font-semibold">크레딧 더하기</h2>
          <Card className="px-4 py-3">
            <CreditForm seriesId={id} />
          </Card>
          <div className="mt-6 space-y-2 text-[12px] leading-relaxed text-ink-soft">
            <p className="font-medium text-ink">왜 남기나요</p>
            <p>사람 저작자(외주 작가, 감수자)는 이름 표시를 요구할 수 있고 이 권리는 넘길 수 없어요(저작권법 제12·14조). 계약에서 정한 이름으로 올려 주세요.</p>
            <p>남의 작품을 원작으로 쓰면 허락이 필요하고 원작을 밝혀야 해요. 저작권이 끝난 설화·고전도 출처를 적어 두면 표절 의심을 막아요.</p>
            <p>AI는 작가로 올리지 않아요. AI 제작 표시로 알리고, 대표의 선택·수정·승인 기록(제작 이력)이 사람 기여의 증거가 돼요.</p>
            <p className="text-ink-faint">일반 안내예요. 외주 계약이나 원작 각색은 변호사 확인을 받아요.</p>
          </div>
        </section>
      </div>
    </>
  );
}

function CreditForm({ seriesId, credit }: { seriesId: string; credit?: CreditRow }) {
  const c = credit;
  return (
    <form action={saveCredit} className="mt-3 space-y-2.5">
      <input type="hidden" name="seriesId" value={seriesId} />
      {c ? <input type="hidden" name="creditId" value={c.id} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <Label>역할</Label>
          <Select name="role" defaultValue={c?.role ?? "person"}>
            {Object.entries(CREDIT_ROLES).map(([k, r]) => (
              <option key={k} value={k} title={r.hint}>
                {r.ko}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label hint="'직접 입력'일 때 꼭 적어요">역할 이름</Label>
          <Input name="label" defaultValue={c?.label ?? ""} placeholder="예: 기획, 음악" />
        </label>
      </div>
      <label className="block">
        <Label hint="독자에게 보이는 이름. 사람은 실명이나 필명, 원작은 '제목 (원저작자)'">이름</Label>
        <Input name="name" defaultValue={c?.name ?? ""} required className="w-full" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <Label>구분</Label>
          <Select name="kind" defaultValue={c?.kind ?? "human"}>
            {Object.entries(CREDIT_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label hint="원작일 때 필수">원작 이용 근거</Label>
          <Select name="basis" defaultValue={c?.basis ?? ""}>
            <option value="">해당 없음</option>
            {Object.entries(CREDIT_BASIS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block">
        <Label hint="AI 제작 표시일 때 (예: 글 Claude, 그림 이미지 생성 AI)">사용한 AI 도구</Label>
        <Input name="aiTool" defaultValue={c?.aiTool ?? ""} className="w-full" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <Label hint="비우면 작품 전체">이 회차부터</Label>
          <Input name="fromEpisode" type="number" min={1} defaultValue={c?.fromEpisode ?? ""} />
        </label>
        <label className="block">
          <Label hint="작을수록 앞에 보여요">순서</Label>
          <Input name="sort" type="number" defaultValue={c?.sort ?? 50} />
        </label>
      </div>
      <label className="block">
        <Label hint="독자에게 보이지 않아요. 계약 날짜, 원전 출처 등">근거 메모</Label>
        <Input name="note" defaultValue={c?.note ?? ""} className="w-full" />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="visible" defaultChecked={c ? c.visible : true} /> 독자에게 보이기
      </label>
      <Button type="submit" variant="primary">
        {c ? "저장" : "더하기"}
      </Button>
    </form>
  );
}
