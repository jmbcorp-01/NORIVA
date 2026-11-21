import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PublishedPanel, SeriesBrief } from "@/db/schema";

/**
 * IR(투자 설명)용 샘플 작품. 작품 15개마다 표지 1장과 회차 1개(그림 1장)만 넣어요.
 * 그림은 저장소의 public/samples/ 에 있는 기존 시험 작화를 다시 써서 그림 모델 비용이 들지 않아요.
 * 모두 is_dummy로 표시되고, '샘플 모두 삭제'는 이 표시가 있는 작품만 지워요.
 */

type Sample = { slug: string; title: string; titleEn: string; genre: string; logline: string; loglineEn: string; ep: string; epEn: string; days: string[]; done?: boolean; paid?: boolean; hoursAgo: number };

export const SAMPLES: Sample[] = [
  { slug: "sample-painted-tiger", title: "그림 속 호랑이", titleEn: "The Painted Tiger", genre: "미스터리·스릴러", logline: "이백 년 된 호작도를 복원하던 날부터, 그는 그림 속 마을의 꿈을 꾼다.", loglineEn: "Restoring a 200-year-old tiger painting, he starts dreaming of the village inside it.", ep: "복원실의 발자국", epEn: "Footprints in the Studio", days: ["tue", "fri"], paid: true, hoursAgo: 3 },
  { slug: "sample-dawn-guest", title: "새벽 세 시의 객", titleEn: "The 3 A.M. Guest", genre: "미스터리·스릴러", logline: "막차에서 내린 손님은 그림자가 없었다.", loglineEn: "The last passenger off the night bus had no shadow.", ep: "막차", epEn: "Last Bus", days: ["mon", "thu"], paid: true, hoursAgo: 5 },
  { slug: "sample-alley-gate", title: "골목 끝 붉은 문", titleEn: "The Red Gate at the End", genre: "오컬트·호러", logline: "재개발 골목 끝, 아무도 열지 않는 문 하나가 매일 밤 조금씩 열린다.", loglineEn: "At the end of a condemned alley, a door no one opens creeps wider every night.", ep: "첫 번째 틈", epEn: "The First Gap", days: ["wed"], hoursAgo: 8 },
  { slug: "sample-fox-ledger", title: "여우 할멈의 장부", titleEn: "The Fox Granny's Ledger", genre: "현대 판타지", logline: "오십 년 묵은 빚을 받으러, 꼬리 아홉 달린 손님이 찾아왔다.", loglineEn: "A guest with nine tails comes to collect a fifty-year-old debt.", ep: "빚 문서", epEn: "The Debt", days: ["fri"], paid: true, hoursAgo: 12 },
  { slug: "sample-lantern-granny", title: "등불 할멈", titleEn: "The Lantern Granny", genre: "오컬트·호러", logline: "길 잃은 혼을 데려다주는 할멈의 등불이 꺼지던 밤.", loglineEn: "The night the old woman's lantern, which guides lost souls home, went out.", ep: "꺼진 등불", epEn: "The Lantern Goes Out", days: ["sat"], done: true, hoursAgo: 200 },
  { slug: "sample-bari", title: "바리", titleEn: "Bari", genre: "오컬트·호러", logline: "응급실 간호사의 눈에만, 떠나지 못한 환자들이 보인다.", loglineEn: "Only one ER nurse can see the patients who never left.", ep: "49일", epEn: "Forty-Nine Days", days: ["mon"], paid: true, hoursAgo: 30 },
  { slug: "sample-last-guest", title: "산사의 마지막 손님", titleEn: "The Last Guest at the Temple", genre: "미스터리·스릴러", logline: "눈에 갇힌 산사, 스님이 셈한 손님 수가 하나 더 많다.", loglineEn: "Snowed in at a mountain temple, the monk counts one guest too many.", ep: "눈 오는 밤", epEn: "Snowfall", days: ["thu"], hoursAgo: 40 },
  { slug: "sample-dont-call", title: "이름을 부르지 마", titleEn: "Don't Say Its Name", genre: "오컬트·호러", logline: "출석부에 없는 서른한 번째 학생이 대답했다.", loglineEn: "The thirty-first student, missing from the roll, answered.", ep: "출석부", epEn: "Roll Call", days: ["tue"], paid: true, hoursAgo: 60 },
  { slug: "sample-moon-wedding", title: "달빛 혼례", titleEn: "Moonlight Wedding", genre: "사극 로맨스", logline: "신랑은 혼례 전날 밤에만 나타난다.", loglineEn: "The groom only appears on the night before the wedding.", ep: "사주단자", epEn: "The Betrothal Letter", days: ["wed", "sat"], paid: true, hoursAgo: 2 },
  { slug: "sample-jar-of-salt", title: "소금 항아리", titleEn: "The Salt Jar", genre: "오컬트·호러", logline: "굿판의 항아리에 담긴 건 소금이 아니었다.", loglineEn: "What filled the ritual jar was not salt.", ep: "항아리", epEn: "The Jar", days: ["sun"], hoursAgo: 90 },
  { slug: "sample-second-life", title: "다시 쓰는 무녀전", titleEn: "The Shaman, Rewritten", genre: "회귀·빙의 사극", logline: "처형당한 무녀가 열여섯 살 그날 아침으로 돌아왔다.", loglineEn: "An executed shaman wakes up on the morning she turned sixteen.", ep: "두 번째 아침", epEn: "The Second Morning", days: ["mon", "thu"], paid: true, hoursAgo: 20 },
  { slug: "sample-white-hair", title: "백발 검객", titleEn: "The White-Haired Blade", genre: "무협·액션", logline: "칼을 놓은 지 사십 년, 할머니의 검이 다시 운다.", loglineEn: "Forty years after she laid down her sword, it sings again.", ep: "칼집", epEn: "The Scabbard", days: ["sat"], done: true, hoursAgo: 300 },
  { slug: "sample-convenience", title: "편의점 퇴마사", titleEn: "Night-Shift Exorcist", genre: "코믹", logline: "알바비보다 퇴마비가 더 나오는 동네 편의점.", loglineEn: "At this corner store, exorcisms pay better than the night shift.", ep: "첫 출근", epEn: "First Shift", days: ["fri"], hoursAgo: 6 },
  { slug: "sample-white-hanbok", title: "흰 옷의 손님", titleEn: "The Guest in White", genre: "사극 로맨스", logline: "상여 행렬 끝에 선 여인은 매년 같은 날 돌아온다.", loglineEn: "The woman at the end of the funeral procession returns on the same day every year.", ep: "상여", epEn: "The Bier", days: ["sun"], hoursAgo: 120 },
  { slug: "sample-five-colors", title: "오방색 무당", titleEn: "Five Colors", genre: "현대 판타지", logline: "아이돌 연습생이 신내림을 받았다. 데뷔는 다음 달이다.", loglineEn: "An idol trainee receives the spirit call a month before her debut.", ep: "신내림", epEn: "The Calling", days: ["wed"], paid: true, hoursAgo: 1 },
];

const brief: SeriesBrief = { tone: "", ageRating: "all", audience: "", memo: "IR용 샘플 작품 (스튜디오 '샘플 작품'에서 만들고 지워요)" };

export async function sampleCount(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(schema.series).where(eq(schema.series.isDummy, true));
  return r.n;
}

/** 샘플 15개를 넣어요. 이미 있는 샘플(같은 주소)은 건너뛰어요. */
export async function fillSamples(): Promise<number> {
  const { series, episodes, episodeAssets } = schema;
  const existing = new Set((await db.select({ slug: series.slug }).from(series).where(inArray(series.slug, SAMPLES.map((s) => s.slug)))).map((r) => r.slug));
  let added = 0;
  await db.transaction(async (tx) => {
    for (const [i, s] of SAMPLES.entries()) {
      if (existing.has(s.slug)) continue;
      const img = `/samples/${String(i + 1).padStart(2, "0")}.jpg`;
      const at = new Date(Date.now() - s.hoursAgo * 3600 * 1000);
      const [row] = await tx
        .insert(series)
        .values({
          slug: s.slug,
          title: s.title,
          titleEn: s.titleEn,
          genre: s.genre,
          status: s.done ? "completed" : "serializing",
          brief,
          logline: s.logline,
          loglineEn: s.loglineEn,
          coverUrl: img,
          scheduleDays: s.days,
          paid: Boolean(s.paid),
          waitFree: true,
          isDummy: true,
        })
        .returning({ id: series.id });
      const [ep] = await tx
        .insert(episodes)
        .values({ seriesId: row.id, number: 1, title: s.ep, titleEn: s.epEn, status: "published", publishAt: at })
        .returning({ id: episodes.id });
      const panel = (text: string): PublishedPanel[] => [
        { index: 0, image: img, gapBefore: "none", bubbles: [{ shape: "narration", text, box: { x: 6, y: 4, w: 52, h: 8 }, tail: null }], sfx: null },
      ];
      await tx.insert(episodeAssets).values([
        { episodeId: ep.id, locale: "ko", panels: panel(s.logline) },
        { episodeId: ep.id, locale: "en", panels: panel(s.loglineEn) },
      ]);
      added++;
    }
  });
  return added;
}

/** 샘플 표시가 있는 작품만 지워요. 회차·공개본·관심·읽은 기록·반응·조회는 함께 지워져요 (DB의 연쇄 삭제). */
export async function deleteSamples(slug?: string): Promise<number> {
  const where = slug ? and(eq(schema.series.isDummy, true), eq(schema.series.slug, slug)) : eq(schema.series.isDummy, true);
  const rows = await db.delete(schema.series).where(where).returning({ id: schema.series.id });
  return rows.length;
}
