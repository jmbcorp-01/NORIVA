import Link from "next/link";
import type { ReactNode } from "react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { ALL_STAGES, STAGE_HELP, STAGE_INFO, type Stage } from "@/lib/pipeline";

// 단계별 대략적인 시간과 비용 (claude-opus-5-5, 그림 Nano Banana Pro 2K 1장 약 $0.15 기준, 2026-11 1화 실측. 실제 금액은 대시보드의 이번 달 제작비에 쌓여요)
const COST: Record<Stage, string> = {
  concept: "2~5분 · 약 $0.4",
  story: "3~8분 · 약 $0.8",
  characters: "3~6분 · 약 $1",
  research: "3~6분 · 약 $1~2 (실물 사진 확인 포함)",
  style: "5~10분 · 약 $1.5 (샘플 그림 9장)",
  sheets: "5~10분 · 인물 8명 기준 약 $2~4",
  plot: "3~6분 · 약 $0.6",
  storyboard: "5~10분 · 약 $1.2",
  art: "시험 컷 10~15분 · 약 $3, 전체 30~60분 · 회차당 약 $25~35",
  lettering: "5~10분 · 약 $1",
  review: "3~6분 · 약 $0.5",
};

const GLOSSARY: [string, string][] = [
  ["뿌리", "작품의 바탕이 되는 한국 설화·역사·민속 소재. 모든 작품은 뿌리를 하나 이상 연결해야 해요 (R-1)."],
  ["소재 라이브러리", "뿌리 후보를 모아 둔 곳. 기획 에이전트가 여기서 소재를 읽어요."],
  ["소재 발굴", "AI가 웹에서 시장을 조사해 소재 후보를 가져오는 곳. 채택한 후보만 라이브러리에 들어가요."],
  ["결과물", "단계마다 에이전트가 만든 것 (기획안, 대본, 콘티, 그림 등)."],
  ["승인 게이트", "대표가 승인해야 다음 단계가 열리는 지점."],
  ["검토 대기", "에이전트가 다 만들어서 대표의 승인을 기다리는 상태."],
  ["낡음", "앞 단계를 고쳐서 이 결과가 옛 입력으로 만들어졌다는 뜻. 그대로 다시 승인하거나 다시 생성해요."],
  ["다시 생성", "바꿀 점을 적어 같은 단계를 새로 만드는 것. 이전 결과는 기록으로 남아요."],
  ["직접 고치기", "결과를 대표가 손으로 고쳐 승인하는 것. 고친 내용은 제작 원장에 남아요."],
  ["지침", "에이전트가 따르는 규칙. 전체 < 장르 < 작품 < 회차 순으로 좁은 지침이 우선해요."],
  ["R-1~R-6", "뿌리 원칙. 한국 소재, 뿌리가 이야기의 엔진, 재해석, 고증과 비극 존중, 일본·중국 요소 금지, 유명작 겹침 회피."],
  ["작업 큐", "에이전트에게 맡긴 작업 목록. 작업 서버가 순서대로 실행하고, 실패하면 다시 시도할 수 있어요."],
  ["작업 서버", "에이전트가 실제로 도는 서버. 할 일이 없으면 15분 뒤 스스로 꺼지고, 작업을 넣으면 1~2분 안에 켜져요."],
  ["제작 원장", "대표의 선택·수정·승인 기록. 저작권 기여를 증명하는 자료예요."],
  ["로그라인", "작품을 한 문장으로 요약한 소개."],
  ["절단", "회차 끝에서 다음 화를 보게 만드는 끊는 장면."],
  ["떡밥 장부", "심어 둔 복선과 회수할 회차를 적어 둔 표."],
];

export default function GuidePage() {
  return (
    <>
      <PageHeader
        title="사용 안내"
        sub="NORIVA 스튜디오가 무엇이고, 작품 하나를 어떻게 만드는지 정리했어요."
        actions={
          <LinkButton href="/studio/scout" variant="seal">
            소재 발굴부터 시작
          </LinkButton>
        }
      />

      <Section title="NORIVA는">
        <Card className="px-5 py-4 text-[14px] leading-[1.8]">
          <p>
            NORIVA는 한국의 역사, 설화, 민속에 뿌리를 둔 웹툰을 <b>한국어와 영어로 함께</b> 연재하는 플랫폼이에요. 대표 한 명이 AI
            에이전트와 함께 작품을 만들어요.
          </p>
          <p className="mt-2">
            에이전트가 기획부터 그림, 말풍선까지 만들고, 대표는 단계마다 <b>고르고, 고치고, 승인</b>해요. 대표가 승인하지 않으면 다음
            단계로 넘어가지 않아요. 모든 결정은 제작 원장에 남아요.
          </p>
          <p className="mt-2 text-ink-soft">
            원칙 한 줄: 뿌리를 빼면 이야기가 무너져야 해요. 소재는 장식이 아니라 이야기의 엔진이에요.
          </p>
        </Card>
      </Section>

      <Section title="첫 작품까지 순서">
        <ol className="grid gap-3 md:grid-cols-2">
          <Step n={1} title="소재 찾기" href="/studio/scout">
            소재 발굴에서 시장 조사를 돌리거나, 소재 라이브러리에 직접 소재를 넣어요. 이름만 적고 &lsquo;AI로 빈 칸 채우기&rsquo;를 눌러도 돼요.
          </Step>
          <Step n={2} title="새 작품 기획" href="/studio/series/new">
            장르와 뿌리 소재를 고르고 메모를 적으면 기획안 3개가 나와요. 후보 카드의 &lsquo;이 소재로 작품 기획&rsquo;을 누르면 미리 채워져요.
          </Step>
          <Step n={3} title="작품 단계 승인" href="/studio/series">
            ① 기획안 → ② 스토리 → ③ 인물 → ④ 화풍을 차례로 승인해요. 각 단계 카드의 &lsquo;이 단계 안내&rsquo;에 볼 것이 적혀 있어요.
          </Step>
          <Step n={4} title="1화 만들기" href="/studio/series">
            작품 화면에서 회차를 추가하고 ⑤ 대본부터 ⑨ 검수까지 진행해요. 작화는 시간이 가장 오래 걸려요.
          </Step>
          <Step n={5} title="연재 예약" href="/studio/series">
            검수를 승인한 회차에 공개 일시를 정하면 독자 앱에 예약 공개돼요.
          </Step>
          <Step n={6} title="지침 다듬기" href="/studio/guidelines">
            결과가 계속 같은 방향으로 아쉬우면 지침을 고쳐요. 다음 생성부터 반영돼요.
          </Step>
        </ol>
      </Section>

      <Section title="10단계 흐름">
        <p className="mb-3 text-[13px] text-ink-soft">
          ①~④는 작품마다 한 번, ⑤~⑨는 회차마다 반복해요. 앞 단계를 고치면 뒤 단계 결과에 &lsquo;낡음&rsquo; 표시가 붙어요. 시간과 비용은 대략이에요.
        </p>
        <div className="space-y-2">
          {ALL_STAGES.map((st) => (
            <Card key={st} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif text-[15px] font-semibold">
                  {STAGE_INFO[st].no} {STAGE_INFO[st].label}
                </span>
                <span className="text-[12px] text-ink-faint">{STAGE_INFO[st].desc}</span>
                <span className="ml-auto text-[12px] text-ink-soft">{COST[st]}</span>
              </div>
              <dl className="mt-2 grid gap-2 text-[13px] leading-relaxed md:grid-cols-3">
                <Def term="AI가 하는 일">{STAGE_HELP[st].ai}</Def>
                <Def term="대표가 볼 것">{STAGE_HELP[st].look}</Def>
                <Def term="승인">{STAGE_HELP[st].approve}</Def>
              </dl>
            </Card>
          ))}
          <Card className="px-4 py-3">
            <span className="font-serif text-[15px] font-semibold">⑩ 연재</span>
            <p className="mt-1 text-[13px] text-ink-soft">공개 일시를 예약하면 그 시각에 독자 앱에 올라가요. 한국어와 영어가 함께 공개돼요.</p>
          </Card>
        </div>
      </Section>

      <Section title="소재 발굴은 이렇게 돌아요">
        <Card className="px-5 py-4 text-[13px] leading-[1.8]">
          <ol className="list-decimal space-y-1 pl-5">
            <li>AI가 웹 검색으로 국내·해외 웹툰 시장의 흐름과 흥행작을 확인해요.</li>
            <li>그 흐름과 맞으면서 덜 쓰인 한국 소재를 5~10개 골라, 근거 링크와 로그라인, 비슷한 작품과의 차이를 붙여요.</li>
            <li>R-4(실존 인물·실제 비극), R-5(일본·중국 요소)에 걸릴 수 있는 점을 따로 표시해요.</li>
            <li>대표가 채택하면 라이브러리에 들어가고, 넘기면 이유를 기억해 다음 조사에 반영해요.</li>
            <li>필요할 때 직접 실행해요 (한 번에 약 $1~3). 화면의 '자동 실행'을 켜면 매주 월요일 오전 9시에도 한 번 돌아요 (기본은 꺼짐).</li>
          </ol>
        </Card>
      </Section>

      <Section title="용어">
        <Card>
          <dl className="divide-y divide-line">
            {GLOSSARY.map(([t, d]) => (
              <div key={t} className="grid gap-1 px-4 py-2.5 text-[13px] sm:grid-cols-[140px_1fr]">
                <dt className="font-medium">{t}</dt>
                <dd className="text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, href, children }: { n: number; title: string; href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="group block h-full">
        <Card className="h-full px-4 py-3 transition-colors group-hover:border-line-strong">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-paper">{n}</span>
            <span className="text-[14px] font-semibold">{title}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{children}</p>
        </Card>
      </Link>
    </li>
  );
}

function Def({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-ink-faint">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
