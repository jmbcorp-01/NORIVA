import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale } from "./publish";

export type { Locale };

/** 독자 화면 언어: 고른 언어(쿠키) > 기기 언어 > 영어 */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("lang")?.value;
  if (c === "ko" || c === "en") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().trimStart().startsWith("ko") ? "ko" : "en";
}

const ko = {
  tagline: "한국의 옛이야기가 지금의 웹툰이 되는 곳",
  home: "홈",
  explore: "탐색",
  langLabel: "언어 바꾸기, 현재 한국어",
  newThisWeek: "새로 올라온 작품",
  readFirst: "1화 보기",
  byDay: "요일별 연재",
  allDays: "전체",
  done: "완결",
  byRoot: "뿌리로 찾기",
  rootNote: "뿌리 노트",
  aiNote: "노리바의 작품은 AI 도구로 만들고 사람이 검수해요.",
  free: "무료",
  freeBeta: "오픈 베타 기간에는 모든 회차가 무료예요.",
  episodes: (n: number) => `${n}화`,
  episodeCount: (n: number) => `총 ${n}화`,
  epNo: (n: number) => `${n}화`,
  noSeries: "첫 작품을 준비하고 있어요. 곧 찾아올게요.",
  noEpisodes: "아직 공개된 회차가 없어요.",
  updates: (days: string) => `매주 ${days} 연재`,
  roots: "뿌리",
  prev: "이전 화",
  next: "다음 화",
  list: "목록",
  endOfEpisode: "이번 화는 여기까지예요",
  nextComing: "다음 화를 기다려 주세요",
  genre: "장르",
  all: "전체",
  noMatch: "조건에 맞는 작품이 없어요.",
  back: "뒤로",
  latest: "최신화",
  first: "첫 화부터",
};

const en: typeof ko = {
  tagline: "Korean tales, retold as webtoons.",
  home: "Home",
  explore: "Explore",
  langLabel: "Change language, current English",
  newThisWeek: "New on NORIVA",
  readFirst: "Read Episode 1",
  byDay: "Updates by day",
  allDays: "All",
  done: "Done",
  byRoot: "Browse by roots",
  rootNote: "Roots note",
  aiNote: "NORIVA series are made with AI tools and reviewed by people.",
  free: "FREE",
  freeBeta: "Every episode is free during the open beta.",
  episodes: (n) => `Ep. ${n}`,
  episodeCount: (n) => `${n} episode${n === 1 ? "" : "s"}`,
  epNo: (n) => `Episode ${n}`,
  noSeries: "Our first series is on its way. See you soon.",
  noEpisodes: "No episodes yet.",
  updates: (days) => `New episodes every ${days}`,
  roots: "Roots",
  prev: "Previous",
  next: "Next",
  list: "Episodes",
  endOfEpisode: "That's the end of this episode",
  nextComing: "The next episode is on its way",
  genre: "Genre",
  all: "All",
  noMatch: "No series match these filters.",
  back: "Back",
  latest: "Latest",
  first: "From the start",
};

export const DICT = { ko, en };
export type Dict = typeof ko;

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABEL: Record<Locale, Record<string, string>> = {
  ko: { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
};

// 장르는 스튜디오에서 한국어로 정해요 (lib/labels GENRES). 독자 화면 영어 이름.
export const GENRE_EN: Record<string, string> = {
  "오컬트·호러": "Occult · Horror",
  "사극 로맨스": "Historical Romance",
  "회귀·빙의 사극": "Regression · Historical",
  "무협·액션": "Martial Arts · Action",
  "현대 판타지": "Modern Fantasy",
  "미스터리·스릴러": "Mystery · Thriller",
  코믹: "Comedy",
};

export const ROOT_CATEGORY: Record<Locale, Record<string, string>> = {
  ko: { folktale: "설화·신화", history_event: "역사 사건", history_person: "역사 인물", folk_belief: "민속 신앙", creature: "요괴·신", place: "장소", custom: "풍속" },
  en: { folktale: "Folktales & myths", history_event: "History", history_person: "Historical figures", folk_belief: "Folk belief", creature: "Spirits & creatures", place: "Places", custom: "Customs" },
};

export function genreLabel(genre: string, locale: Locale) {
  return locale === "en" ? (GENRE_EN[genre] ?? genre) : genre;
}

/** 오늘 요일 키 (한국 시간 기준) */
export function todayKey(now = new Date()): string {
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })).getDay();
  return DAY_KEYS[(d + 6) % 7];
}
