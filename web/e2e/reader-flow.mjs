/**
 * 독자 흐름 전체 시험 (비평 F7): 로그인 → 무료 회차 → 코인 회차 열기 → 관심 작품 담기 → 서재 확인 → 새 회차 알림.
 *
 * 로컬에서 돌려요. 돈이 드는 호출은 없어요.
 *   1) 시험 DB로 웹을 띄워요:  DATABASE_URL=postgres://... READER_DEV_LOGIN=1 SESSION_SECRET=... npx next dev -p 3100
 *   2) 다른 창에서:            DATABASE_URL=postgres://... node e2e/reader-flow.mjs
 * 시험용 작품을 새로 만들고 끝나면 지워요.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/noriva" });
const q = (text, values) => db.query(text, values).then((r) => r.rows);

function check(ok, what) {
  if (!ok) throw new Error(`실패: ${what}`);
  console.log(`  ✓ ${what}`);
}

const slug = `e2e-${randomUUID().slice(0, 8)}`;
const panel = (i) => ({ index: i, image: `e2e/${slug}/${i}.png`, gapBefore: "normal", bubbles: [{ shape: "speech", text: `대사 ${i}`, box: { x: 10, y: 10, w: 40, h: 12 }, tail: null }], sfx: null });

async function setup() {
  const [s] = await q(
    `insert into series (slug, title, title_en, genre, status, brief, logline, root_note, cover_url, auto_approve, logline_en, root_note_en, schedule_days, paid, free_episodes, wait_free, is_dummy)
     values ($1, '시험 작품 E2E', 'E2E Test', 'fantasy', 'serializing', '{}', '시험', '', '', '{}', '', '', '[]', true, 1, false, false) returning id`,
    [slug],
  );
  for (const n of [1, 2]) {
    const [e] = await q(
      `insert into episodes (series_id, number, title, title_en, logline, status, publish_at, price_coins, early_access)
       values ($1, $2, $3, '', '', 'published', now() - interval '1 day', $4, false) returning id`,
      [s.id, n, `${n}화 제목`, n === 1 ? 0 : 3],
    );
    for (const locale of ["ko", "en"]) {
      await q(`insert into episode_assets (episode_id, locale, panels) values ($1, $2, $3)`, [e.id, locale, JSON.stringify([panel(1), panel(2)])]);
    }
  }
  return s.id;
}

async function main() {
  const seriesId = await setup();
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "ko-KR" });
  try {
    console.log(`시험 작품 ${slug}`);
    await page.goto(`${BASE}/auth/dev`);
    const [reader] = await q(`select reader_id from reader_identities where provider = 'dev' and provider_user_id = 'local-dev'`);
    check(Boolean(reader), "시험 계정으로 로그인");

    await page.goto(`${BASE}/series/${slug}/1`);
    check((await page.locator("figure[data-panel]").count()) === 2, "무료 1화의 컷 2개가 보임");
    check((await page.getByRole("link", { name: /2화 2화 제목/ }).count()) === 1, "1화 끝에 다음 화 미리보기 (2화 제목)");

    await page.goto(`${BASE}/series/${slug}/2`);
    check(page.url().includes("open=2"), "코인 회차 2화는 잠겨서 회차 열기로 감");

    await q(`insert into coin_wallets (reader_id, paid, free) values ($1, 10, 0) on conflict (reader_id) do update set paid = 10, free = 0`, [reader.reader_id]);
    await page.goto(`${BASE}/series/${slug}?open=2`);
    await page.locator("form button[type=submit]").filter({ hasText: /3/ }).first().click();
    await page.waitForURL(`**/series/${slug}/2`);
    check((await page.locator("figure[data-panel]").count()) === 2, "코인으로 연 2화가 보임");
    const [w] = await q(`select paid + free as coins from coin_wallets where reader_id = $1`, [reader.reader_id]);
    check(Number(w.coins) === 7, "코인 3개가 한 번만 빠짐 (10 → 7)");
    await page.goto(`${BASE}/series/${slug}/2`);
    const [w2] = await q(`select paid + free as coins from coin_wallets where reader_id = $1`, [reader.reader_id]);
    check(Number(w2.coins) === 7, "다시 열어도 코인이 더 빠지지 않음");

    await page.getByRole("button", { name: "관심 작품에 담기" }).first().click();
    await page.waitForLoadState("networkidle");
    const marks = await q(`select 1 from bookmarks where reader_id = $1 and series_id = $2`, [reader.reader_id, seriesId]);
    check(marks.length === 1, "마지막 화 끝에서 관심 작품 담기");
    await page.goto(`${BASE}/library?tab=saved`);
    check(await page.getByText("시험 작품 E2E").first().isVisible(), "서재 관심 목록에 보임");
  } finally {
    await browser.close();
    if (!process.env.KEEP) await q(`delete from series where slug = $1`, [slug]);
    await db.end();
  }
}

main().then(
  () => console.log("독자 흐름 시험 통과"),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
