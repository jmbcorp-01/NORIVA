// 웹소설 공개본과 글 뷰어 설정 (07번 2단계). DB를 읽지 않는 순수 함수예요.

/** 웹소설 판매 기본값 (07번 정책표): 무료 10화, 회차 1코인, 선공개 2코인, 최신 10화는 기다무 제외 */
export const NOVEL_SALE = { freeEpisodes: 10, priceCoins: 1, earlyPrice: 2, waitFreeExclude: 10 } as const;
export const WEBTOON_SALE = { freeEpisodes: 3, priceCoins: 3, earlyPrice: 5, waitFreeExclude: 3 } as const;
export const saleDefaults = (format: "webtoon" | "novel") => (format === "novel" ? NOVEL_SALE : WEBTOON_SALE);

/** 장면 바꿈 표시. 공개본 문단 목록에서는 이 값 하나로 바꿔 둬요 */
export const SCENE_BREAK = "* * *";
const READ_CHARS_PER_MIN = 650;

/**
 * 승인된 퇴고본(마크다운)을 독자용 문단 목록으로 바꿔요.
 * - 맨 앞의 제목 줄(# ...)은 회차 제목과 겹치니 빼요. 다른 제목 줄은 앞의 #만 지워요.
 * - '* * *', '***', '---', '◆' 같은 장면 바꿈은 SCENE_BREAK 하나로 맞추고, 겹치거나 맨 앞·맨 끝이면 빼요.
 * - 굵게·기울임 표시(**, _)는 지워요. 독자 화면은 글자만 보여줘요.
 */
export function toNovelParagraphs(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const out: string[] = [];
  let sawText = false;
  for (const raw of lines) {
    if (!raw) continue;
    if (/^(\*\s*){3,}$|^-{3,}$|^[◆◇○●#]{1,3}$|^[◆◇]\s*[◆◇]\s*[◆◇]$/.test(raw)) {
      if (out.length && out[out.length - 1] !== SCENE_BREAK) out.push(SCENE_BREAK);
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      if (!sawText) continue; // 첫 제목 줄
      out.push(clean(heading[1]));
      continue;
    }
    const text = clean(raw.replace(/^>\s?/, ""));
    if (!text) continue;
    sawText = true;
    out.push(text);
  }
  while (out[0] === SCENE_BREAK) out.shift();
  while (out[out.length - 1] === SCENE_BREAK) out.pop();
  return out;
}

const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, "$1$2").trim();

/** 공백 포함 글자 수 (장면 바꿈 제외). 작업기 novel.char_count와 같은 기준이에요 */
export function novelChars(paragraphs: string[]): number {
  return paragraphs.filter((p) => p !== SCENE_BREAK).reduce((n, p) => n + Array.from(p.trim()).length, 0);
}

export const readMinutes = (chars: number) => Math.max(1, Math.round(chars / READ_CHARS_PER_MIN));

/* ─── 글 뷰어 설정 (독자 기기에 쿠키로 저장) ─── */

export const TEXT_SIZES = [15, 17, 19, 21, 24] as const;
export const LINE_HEIGHTS = [1.6, 1.8, 2.0] as const;
export const TEXT_FONTS = ["serif", "sans"] as const;
export const TEXT_THEMES = ["paper", "sepia", "night"] as const;
export type TextSettings = { size: number; line: number; font: (typeof TEXT_FONTS)[number]; theme: (typeof TEXT_THEMES)[number] };
export const DEFAULT_TEXT_SETTINGS: TextSettings = { size: 1, line: 1, font: "serif", theme: "paper" };
export const TEXT_SETTINGS_COOKIE = "nv_text";

const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);

/** 쿠키 값을 읽어요. 망가진 값은 기본값으로 */
export function parseTextSettings(raw: string | undefined | null): TextSettings {
  const d = DEFAULT_TEXT_SETTINGS;
  if (!raw) return d;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<TextSettings>;
    return {
      size: idx(v.size, TEXT_SIZES.length, d.size),
      line: idx(v.line, LINE_HEIGHTS.length, d.line),
      font: TEXT_FONTS.includes(v.font as TextSettings["font"]) ? (v.font as TextSettings["font"]) : d.font,
      theme: TEXT_THEMES.includes(v.theme as TextSettings["theme"]) ? (v.theme as TextSettings["theme"]) : d.theme,
    };
  } catch {
    return d;
  }
}

/** 배경 테마: 기본은 앱 색(기기 어두운 모드도 따라가요), 옛 종이·밤은 화면 색을 바꿔요 */
const THEME_VARS: Record<TextSettings["theme"], Record<string, string>> = {
  paper: {},
  sepia: {
    "--paper": "#f1e7d2",
    "--paper-raised": "#f7efdd",
    "--paper-sunk": "#e7dcc3",
    "--ink": "#3b3226",
    "--ink-soft": "#5f5240",
    "--ink-faint": "#6f604a",
    "--line": "#dccdb0",
    "--line-strong": "#c9b792",
  },
  night: {
    "--paper": "#151618",
    "--paper-raised": "#1e2023",
    "--paper-sunk": "#101113",
    "--ink": "#d9d4ca",
    "--ink-soft": "#aaa498",
    "--ink-faint": "#8f897f",
    "--line": "#2c2f33",
    "--line-strong": "#3d4146",
  },
};
export const THEME_VAR_KEYS = Object.keys(THEME_VARS.night);

/** 글 뷰어 바깥 틀에 붙일 CSS 변수 (서버가 처음 그릴 때와 설정을 바꿀 때 똑같이 써요) */
export function textStyle(t: TextSettings): Record<string, string> {
  return {
    ...THEME_VARS[t.theme],
    "--nv-size": `${TEXT_SIZES[t.size]}px`,
    "--nv-line": String(LINE_HEIGHTS[t.line]),
  };
}

/** 이어 읽기: 지난번에 본 문단에서 다시 시작할지. 끝까지 읽었거나 처음 몇 문단이면 처음부터 */
export function resumeParagraph(maxSeen: number, count: number): number | null {
  if (count <= 0 || maxSeen <= 3 || maxSeen >= count) return null;
  return maxSeen;
}
