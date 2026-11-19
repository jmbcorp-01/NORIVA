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
  library: "내 서재",
  me: "내 정보",
  login: "로그인",
  loginTitle: "노리바에 로그인",
  loginSub: "관심 작품과 읽던 위치를 어느 기기에서나 이어 볼 수 있어요.",
  loginWith: { kakao: "카카오로 계속하기", naver: "네이버로 계속하기", google: "Google로 계속하기", apple: "Apple로 계속하기", dev: "시험 계정으로 들어가기 (개발용)" } as Record<string, string>,
  loginNone: "로그인 준비 중이에요.",
  loginErrors: { unavailable: "지금은 쓸 수 없는 로그인 방법이에요.", expired: "로그인이 취소됐거나 만료됐어요. 다시 시도해 주세요.", failed: "로그인하지 못했어요. 잠시 후 다시 시도해 주세요." } as Record<string, string>,
  loginTerms: "계속하면 이용약관과 개인정보 처리방침에 동의하게 돼요.",
  logout: "로그아웃",
  logoutAll: "모든 기기에서 로그아웃",
  deleteAccount: "회원 탈퇴",
  deleteConfirm: "탈퇴하면 관심 작품과 읽은 기록이 모두 지워지고 되돌릴 수 없어요. 확인하려면 아래 칸에 '탈퇴'라고 적어 주세요.",
  deleteWord: "탈퇴",
  nickname: "닉네임",
  save: "저장",
  linked: "연결된 로그인",
  providerName: { kakao: "카카오", naver: "네이버", google: "Google", apple: "Apple", dev: "시험 계정" } as Record<string, string>,
  bookmark: "관심 작품에 담기",
  bookmarked: "관심 작품",
  following: "관심 작품",
  recent: "최근 본 작품",
  continueReading: "이어보기",
  readUpTo: (n: number) => `${n}화까지 봤어요`,
  continueEp: (n: number) => `${n}화 이어보기`,
  emptyLibrary: "아직 담은 작품이 없어요. 작품 화면에서 관심 작품에 담아 보세요.",
  emptyRecent: "아직 본 작품이 없어요.",
  needLogin: "로그인하면 볼 수 있어요.",
  language: "언어",
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
  library: "Library",
  me: "Me",
  login: "Log in",
  loginTitle: "Log in to NORIVA",
  loginSub: "Keep your saved series and reading place on every device.",
  loginWith: { kakao: "Continue with Kakao", naver: "Continue with Naver", google: "Continue with Google", apple: "Continue with Apple", dev: "Use the test account (dev only)" },
  loginNone: "Log in is coming soon.",
  loginErrors: { unavailable: "That log in option isn't available right now.", expired: "Log in was canceled or timed out. Please try again.", failed: "We couldn't log you in. Please try again shortly." },
  loginTerms: "By continuing you agree to the Terms of Service and Privacy Policy.",
  logout: "Log out",
  logoutAll: "Log out on all devices",
  deleteAccount: "Delete account",
  deleteConfirm: "Deleting your account erases your saved series and reading history for good. Type 'delete' below to confirm.",
  deleteWord: "delete",
  nickname: "Nickname",
  save: "Save",
  linked: "Linked log in",
  providerName: { kakao: "Kakao", naver: "Naver", google: "Google", apple: "Apple", dev: "Test account" },
  bookmark: "Add to library",
  bookmarked: "In your library",
  following: "Saved series",
  recent: "Recently read",
  continueReading: "Continue reading",
  readUpTo: (n) => `Read up to Ep. ${n}`,
  continueEp: (n) => `Continue Ep. ${n}`,
  emptyLibrary: "Nothing saved yet. Add a series to your library from its page.",
  emptyRecent: "You haven't read anything yet.",
  needLogin: "Log in to see this.",
  language: "Language",
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
