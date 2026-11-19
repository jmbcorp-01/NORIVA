import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CandidateBody, MarketReport } from "@/db/schema";
import { Badge, Button, Card, Empty, formatDate, Input, Notice, PageHeader } from "@/components/ui";
import { SOURCE_CATEGORY } from "@/lib/labels";
import { adoptCandidate, dismissCandidate, startScout } from "../../actions";

const REGION = { kr: "국내", global: "해외", both: "국내·해외" } as const;
const RUN_STATUS = { running: "조사 중", done: "완료", failed: "실패" } as const;

export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; started?: string; adopted?: string }>;
}) {
  const { error, started, adopted } = await searchParams;
  const { scoutRuns, sourceCandidates } = schema;
  const [runs, pending, decided] = await Promise.all([
    db.select().from(scoutRuns).orderBy(desc(scoutRuns.createdAt)).limit(12),
    db
      .select()
      .from(sourceCandidates)
      .where(eq(sourceCandidates.status, "pending"))
      .orderBy(desc(sourceCandidates.createdAt))
      .limit(40),
    db
      .select()
      .from(sourceCandidates)
      .where(inArray(sourceCandidates.status, ["adopted", "dismissed"]))
      .orderBy(desc(sourceCandidates.updatedAt))
      .limit(12),
  ]);
  const running = runs.find((r) => r.status === "running");
  const latest = runs.find((r) => r.status === "done" && r.report);
  const lastFailed = runs[0]?.status === "failed" ? runs[0] : null;
  pending.sort((a, b) => b.body.score - a.body.score);

  return (
    <>
      <PageHeader
        title="소재 발굴"
        sub="AI가 웹에서 지금의 국내·해외 웹툰 시장을 조사하고, 그 흐름에 맞는 한국 설화·역사·민속 소재를 골라 와요. 대표가 채택한 후보만 소재 라이브러리에 들어가요. 매주 월요일 아침에도 자동으로 한 번 돌아요."
      />
      <Notice>{error}</Notice>
      {started ? <Notice tone="indigo">조사를 시작했어요. 보통 5~15분 걸려요. 이 화면을 나중에 새로고침하면 결과가 보여요.</Notice> : null}
      {adopted ? (
        <Notice tone="pine">
          소재 라이브러리에 넣었어요.{" "}
          <Link href={`/studio/sources/${adopted}`} className="underline underline-offset-4">
            소재 보기
          </Link>
        </Notice>
      ) : null}
      {lastFailed ? <Notice>지난 조사가 실패했어요: {lastFailed.error ?? "알 수 없는 오류"} (작업 큐에서 다시 시도할 수 있어요)</Notice> : null}

      <Card className="mb-9 px-4 py-4">
        <form action={startScout} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">
              이번 조사의 초점 <span className="font-normal text-ink-faint">비워 두면 시장 전체를 봐요</span>
            </span>
            <Input name="focus" placeholder="예: 해외 독자용 로맨스 판타지, 근대 경성 배경, 조선 수사물" disabled={!!running} />
          </label>
          <Button variant="seal" type="submit" disabled={!!running}>
            {running ? "조사 중…" : "시장 조사 시작"}
          </Button>
        </form>
        <p className="mt-2 text-[12px] text-ink-faint">
          한 번에 약 $1~3 (웹 검색 15회 안팎과 정리). 대표가 넘긴 후보와 이유를 기억해서 다음 조사에 반영해요.
          {running ? ` 지금 조사 중이에요 (${formatDate(running.createdAt)} 시작).` : ""}
        </p>
      </Card>

      {latest?.report ? <Report report={latest.report} at={latest.createdAt} trigger={latest.trigger} /> : null}

      <h2 className="mb-3 text-[14px] font-semibold">
        검토할 후보 <span className="font-normal text-ink-faint">{pending.length}개 · 점수 순</span>
      </h2>
      {pending.length === 0 ? (
        <Empty>{running ? "조사가 끝나면 후보가 여기에 나와요." : "검토할 후보가 없어요. 시장 조사를 시작해 보세요."}</Empty>
      ) : (
        <div className="space-y-3">
          {pending.map((c) => (
            <CandidateCard key={c.id} id={c.id} b={c.body} />
          ))}
        </div>
      )}

      {decided.length ? (
        <>
          <h2 className="mb-3 mt-10 text-[14px] font-semibold">최근 결정</h2>
          <Card>
            <ul className="divide-y divide-line">
              {decided.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span className="font-medium">{c.body.name}</span>
                  {c.status === "adopted" ? <Badge tone="pine">채택</Badge> : <Badge>넘김</Badge>}
                  {c.dismissReason ? <span className="text-ink-soft">{c.dismissReason}</span> : null}
                  {c.sourceId ? (
                    <Link href={`/studio/sources/${c.sourceId}`} className="text-indigo hover:underline">
                      소재 보기
                    </Link>
                  ) : null}
                  <span className="ml-auto text-[12px] text-ink-faint">{formatDate(c.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {runs.length ? (
        <>
          <h2 className="mb-3 mt-10 text-[14px] font-semibold">지난 조사</h2>
          <Card>
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span>{formatDate(r.createdAt)}</span>
                  <Badge tone={r.status === "done" ? "pine" : r.status === "failed" ? "plum" : "indigo"}>{RUN_STATUS[r.status]}</Badge>
                  <span className="text-ink-soft">{r.trigger === "weekly" ? "주간 자동" : "직접 실행"}</span>
                  {r.focus ? <span className="text-ink-faint">초점: {r.focus}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Report({ report, at, trigger }: { report: MarketReport; at: Date; trigger: string }) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 text-[14px] font-semibold">
        시장 리포트{" "}
        <span className="font-normal text-ink-faint">
          {formatDate(at)} · {trigger === "weekly" ? "주간 자동" : "직접 실행"}
        </span>
      </h2>
      <Card className="px-5 py-4">
        <p className="text-[14px] leading-[1.75] whitespace-pre-wrap">{report.summary}</p>
        {report.changes ? (
          <p className="mt-3 rounded-[5px] bg-paper-sunk px-3 py-2 text-[13px] text-ink-soft">
            <span className="font-medium text-ink">지난번과 달라진 점</span> {report.changes}
          </p>
        ) : null}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {report.trends.length ? (
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-ink-soft">흐름</h3>
              <ul className="space-y-2 text-[13px]">
                {report.trends.map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">{t.title}</span> <Badge>{REGION[t.region] ?? t.region}</Badge>
                    <p className="text-ink-soft">{t.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.hits.length ? (
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-ink-soft">눈여겨볼 작품</h3>
              <ul className="space-y-2 text-[13px]">
                {report.hits.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium">{h.title}</span> <span className="text-ink-faint">{h.platform}</span>
                    <p className="text-ink-soft">{h.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {report.links.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-[12px] text-indigo">근거 자료 {report.links.length}개</summary>
            <ul className="mt-2 space-y-1 text-[12px]">
              {report.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-ink-soft hover:text-indigo hover:underline">
                    {l.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
    </section>
  );
}

function CandidateCard({ id, b }: { id: string; b: CandidateBody }) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5">
          <span className="font-serif text-[16px] font-semibold">{b.name}</span>
          <Badge>{SOURCE_CATEGORY[b.category] ?? b.category}</Badge>
          {b.era ? <span className="text-[12px] text-ink-faint">{b.era}</span> : null}
          {b.factCheck.length ? <Badge tone="plum">고증 확인 {b.factCheck.length}</Badge> : null}
          <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-soft">
            <span title="NORIVA에 맞는 정도 (시장 흐름, 뿌리 원칙, 차별성)">적합 {b.score}</span>
            <span title="해외 독자가 처음 봐도 끌릴 만한 정도">글로벌 {b.globalAppeal}</span>
          </span>
          <p className="w-full text-[13px] text-ink-soft">{b.combo || b.genre}</p>
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4 text-[13px] leading-relaxed">
          <Field title="왜 지금인가">
            <p>{b.whyNow}</p>
            {b.evidence.length ? (
              <ul className="mt-1 space-y-0.5">
                {b.evidence.map((e, i) => (
                  <li key={i} className="text-[12px]">
                    <a href={e.url} target="_blank" rel="noreferrer noopener" className="text-indigo hover:underline">
                      {e.claim || e.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>
          <Field title="로그라인">
            <ol className="list-decimal space-y-1 pl-5">
              {b.loglines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field title="비슷한 흥행작">{b.similarHits.join(", ") || "없음"}</Field>
            <Field title="차별점">{b.difference}</Field>
          </div>
          <Field title="요약">{b.summary}</Field>
          {b.rules.length ? (
            <Field title="이야기 장치로 쓸 규칙">
              <ul className="list-disc pl-5">
                {b.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Field>
          ) : null}
          {b.factCheck.length ? (
            <Field title="고증·원칙 확인 (R-4, R-5)">
              <ul className="list-disc pl-5 text-plum">
                {b.factCheck.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Field>
          ) : null}
          {b.references.length ? <Field title="원전">{b.references.join(", ")}</Field> : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <form action={adoptCandidate}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="plan" value="1" />
              <Button variant="seal" type="submit">
                이 소재로 작품 기획
              </Button>
            </form>
            <form action={adoptCandidate}>
              <input type="hidden" name="id" value={id} />
              <Button variant="primary" type="submit">
                라이브러리에 추가
              </Button>
            </form>
            <form action={dismissCandidate} className="flex min-w-[260px] flex-1 items-center gap-2">
              <input type="hidden" name="id" value={id} />
              <Input name="reason" placeholder="넘기는 이유 (다음 조사에 반영돼요)" className="flex-1" />
              <Button type="submit">넘기기</Button>
            </form>
          </div>
        </div>
      </details>
    </Card>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[12px] font-semibold text-ink-soft">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
