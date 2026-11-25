import { describe, expect, it } from "vitest";
import { creditBlockers, creditsForEpisode, defaultCredits, headlineCredits, missingRoles, type Credit } from "./credits";

const c = (role: string, name: string, extra: Partial<Credit> = {}): Credit => ({
  role,
  label: "",
  name,
  kind: "company",
  aiTool: "",
  basis: "",
  note: "",
  fromEpisode: null,
  visible: true,
  sort: 0,
  ...extra,
});

describe("작품 크레딧", () => {
  it("기본값만으로 공개 검사를 통과해요", () => {
    expect(creditBlockers(defaultCredits("webtoon"), "webtoon")).toEqual([]);
    expect(creditBlockers(defaultCredits("novel"), "novel")).toEqual([]);
  });

  it("웹소설은 그림이 필수가 아니에요", () => {
    expect(defaultCredits("novel").some((x) => x.role === "art")).toBe(false);
    expect(missingRoles(defaultCredits("novel"), "webtoon")).toEqual(["art"]);
  });

  it("필수 항목이 비면 공개를 막아요", () => {
    const rows = defaultCredits("webtoon").filter((x) => x.role !== "rights");
    expect(creditBlockers(rows, "webtoon")[0]).toContain("저작권자");
  });

  it("원작은 이용 근거가 있어야 해요", () => {
    const rows = [...defaultCredits("novel"), c("original", "소금과 향 (웹툰)", { kind: "work" })];
    expect(creditBlockers(rows, "novel")).toHaveLength(1);
    rows[rows.length - 1].basis = "own";
    expect(creditBlockers(rows, "novel")).toEqual([]);
  });

  it("직접 입력은 역할 이름이 있어야 해요", () => {
    expect(creditBlockers([...defaultCredits("novel"), c("custom", "홍길동")], "novel")).toHaveLength(1);
  });

  it("회차부터 적용하는 항목은 그 회차부터 보여요", () => {
    const rows = [c("story", "A"), c("person", "보정 홍길동", { fromEpisode: 5, kind: "human" }), c("cover", "숨김", { visible: false })];
    expect(creditsForEpisode(rows, 4).map((x) => x.name)).toEqual(["A"]);
    expect(creditsForEpisode(rows, 5).map((x) => x.name)).toEqual(["A", "보정 홍길동"]);
  });

  it("제목 아래 한 줄은 글·그림·원작 순서예요", () => {
    const rows = [c("original", "소금과 향", { basis: "own" }), c("art", "B"), c("story", "A"), c("rights", "회사")];
    expect(headlineCredits(rows)).toBe("글 A · 그림 B · 원작 소금과 향");
    expect(headlineCredits(rows, "en")).toBe("Story A · Art B · Original work 소금과 향");
  });
});
