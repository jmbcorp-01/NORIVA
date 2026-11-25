// 작품 크레딧 규칙 (docs/07 4절). DB와 화면에 의존하지 않는 순수 함수만 둬요.
import type { SeriesFormat } from "./pipeline";

export const COMPANY_KO = "주식회사 제이엠비코퍼레이션";
export const COMPANY_EN = "Jmbcorp Co., Ltd.";
export const STUDIO_NAME = "NORIVA 스튜디오";

export type CreditKind = "company" | "human" | "ai" | "work";
export type CreditBasis = "" | "contract" | "public_domain" | "own";

export type Credit = {
  id?: string;
  role: string;
  label: string;
  name: string;
  kind: string;
  aiTool: string;
  basis: string;
  note: string;
  fromEpisode: number | null;
  visible: boolean;
  sort: number;
};

type RoleInfo = {
  ko: string;
  en: string;
  /** always: 모든 작품 필수 · webtoon: 웹툰만 필수 · optional: 선택 */
  need: "always" | "webtoon" | "optional";
  kind: CreditKind;
  hint: string;
};

export const CREDIT_ROLES: Record<string, RoleInfo> = {
  story: { ko: "글", en: "Story", need: "always", kind: "company", hint: "스토리와 본문을 쓴 사람이나 회사" },
  art: { ko: "그림", en: "Art", need: "webtoon", kind: "company", hint: "작화" },
  rights: { ko: "저작권자", en: "Copyright", need: "always", kind: "company", hint: "작품의 권리를 가진 회사" },
  ai: { ko: "AI 제작 표시", en: "Made with AI", need: "always", kind: "ai", hint: "AI 협업 제작 사실과 쓴 도구" },
  original: { ko: "원작", en: "Original work", need: "optional", kind: "work", hint: "각색한 원작이 있을 때. 이용 근거가 꼭 있어야 해요" },
  person: { ko: "참여", en: "Contributor", need: "optional", kind: "human", hint: "외주 작가, 감수자 등 사람 참여자 (실명이나 필명)" },
  style: { ko: "화풍", en: "Art style", need: "optional", kind: "company", hint: "작품 고유 화풍 이름" },
  adapt: { ko: "각색", en: "Adaptation", need: "optional", kind: "company", hint: "원작을 다시 쓴 경우" },
  storyboard: { ko: "콘티", en: "Storyboard", need: "optional", kind: "company", hint: "" },
  color: { ko: "채색", en: "Color", need: "optional", kind: "company", hint: "" },
  letter: { ko: "식자", en: "Lettering", need: "optional", kind: "company", hint: "" },
  cover: { ko: "표지", en: "Cover", need: "optional", kind: "company", hint: "" },
  copyedit: { ko: "교정", en: "Copyediting", need: "optional", kind: "company", hint: "" },
  reference: { ko: "참고", en: "References", need: "optional", kind: "work", hint: "참고한 원전·문헌·민화 (예: 삼국유사)" },
  translate: { ko: "번역", en: "Translation", need: "optional", kind: "company", hint: "" },
  custom: { ko: "직접 입력", en: "", need: "optional", kind: "company", hint: "역할 이름을 직접 적어요 (예: 기획, 음악)" },
};

export const CREDIT_KIND_LABEL: Record<CreditKind, string> = { company: "회사", human: "사람", ai: "AI", work: "작품·자료" };
export const CREDIT_BASIS_LABEL: Record<Exclude<CreditBasis, "">, string> = {
  contract: "원저작자와 계약함",
  public_domain: "저작권이 끝난 원전 (설화·고전 등)",
  own: "우리 회사 작품",
};

export function roleLabel(c: Pick<Credit, "role" | "label">, locale: "ko" | "en" = "ko"): string {
  if (c.label.trim()) return c.label.trim();
  const r = CREDIT_ROLES[c.role];
  if (!r) return c.role;
  return locale === "en" ? r.en || r.ko : r.ko;
}

const base = (role: string, name: string, sort: number, extra: Partial<Credit> = {}): Credit => ({
  role,
  label: "",
  name,
  kind: CREDIT_ROLES[role]?.kind ?? "company",
  aiTool: "",
  basis: "",
  note: "",
  fromEpisode: null,
  visible: true,
  sort,
  ...extra,
});

/** 작품을 만들 때 넣는 필수 항목 기본값 */
export function defaultCredits(format: SeriesFormat): Credit[] {
  const rows = [base("story", STUDIO_NAME, 10)];
  if (format === "webtoon") rows.push(base("art", STUDIO_NAME, 20));
  rows.push(
    base("ai", "AI 협업 제작", 80, {
      aiTool: format === "webtoon" ? "글: Claude, 그림: 이미지 생성 AI" : "글: Claude",
    }),
    base("rights", COMPANY_KO, 90),
  );
  return rows;
}

/** 필수인데 빠진 역할 */
export function missingRoles(credits: Pick<Credit, "role" | "name">[], format: SeriesFormat): string[] {
  const has = (role: string) => credits.some((c) => c.role === role && c.name.trim());
  return Object.entries(CREDIT_ROLES)
    .filter(([, r]) => r.need === "always" || (r.need === "webtoon" && format === "webtoon"))
    .filter(([role]) => !has(role))
    .map(([role]) => role);
}

/** 공개를 막는 이유들 (비어 있으면 공개 가능). 대표에게 그대로 보여주는 문장이에요. */
export function creditBlockers(credits: Credit[], format: SeriesFormat): string[] {
  const out: string[] = [];
  const missing = missingRoles(credits, format);
  if (missing.length) out.push(`크레딧 필수 항목이 비어 있어요: ${missing.map((r) => CREDIT_ROLES[r].ko).join(", ")}`);
  for (const c of credits) {
    if (c.role === "original" && !["contract", "public_domain", "own"].includes(c.basis)) {
      out.push(`원작 '${c.name || "이름 없음"}'의 이용 근거(계약, 저작권 만료, 자체 원작)를 골라 주세요`);
    }
    if (c.role === "person" && !c.name.trim()) out.push("이름이 빈 사람 참여자가 있어요");
    if (c.role === "custom" && !c.label.trim()) out.push("직접 입력한 크레딧에 역할 이름이 없어요");
    if (c.kind === "human" && c.role === "ai") out.push("AI 제작 표시는 사람으로 적을 수 없어요");
  }
  return out;
}

/** 이 회차에 보이는 크레딧 (회차부터 적용하는 항목 반영) */
export function creditsForEpisode(credits: Credit[], episode: number | null): Credit[] {
  return credits
    .filter((c) => c.visible && (episode == null || c.fromEpisode == null || c.fromEpisode <= episode))
    .sort((a, b) => a.sort - b.sort);
}

/** 작품 제목 아래 한 줄: '글 NORIVA 스튜디오 · 그림 NORIVA 스튜디오 · 원작 ○○' */
export function headlineCredits(credits: Credit[], locale: "ko" | "en" = "ko"): string {
  const pick = ["story", "art", "original", "adapt"];
  return credits
    .filter((c) => c.visible && pick.includes(c.role) && c.fromEpisode == null && c.name.trim())
    .sort((a, b) => pick.indexOf(a.role) - pick.indexOf(b.role) || a.sort - b.sort)
    .map((c) => `${roleLabel(c, locale)} ${c.name}`)
    .join(" · ");
}
