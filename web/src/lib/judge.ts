/** 대표 판정과 자동 검사기의 일치도. 검사기가 합격시킨 컷을 대표가 'AI 같다'고 하면 검사기가 놓친 것이에요. */
export type Verdict = "good" | "ai";
type P = { index: number; passed?: boolean; image?: string; owner_verdict?: Verdict; owner_note?: string };

export function agreement(panels: P[]): { judged: number; agree: number; pct: number; missed: number[]; strict: number[] } {
  const judged = panels.filter((p) => p.image && (p.owner_verdict === "good" || p.owner_verdict === "ai"));
  const missed = judged.filter((p) => p.owner_verdict === "ai" && p.passed).map((p) => p.index);
  const strict = judged.filter((p) => p.owner_verdict === "good" && p.passed === false).map((p) => p.index);
  const agree = judged.length - missed.length - strict.length;
  return { judged: judged.length, agree, pct: judged.length ? Math.round((agree / judged.length) * 100) : 0, missed, strict };
}

/** 한 컷에 대표 판정을 적어요. verdict가 null이면 판정을 지워요. */
export function setVerdict(body: unknown, index: number, verdict: Verdict | null, note: string): Record<string, unknown> {
  const b = body as { kind?: string; panels?: P[] } | null;
  if (!b || b.kind !== "art" || !Array.isArray(b.panels)) throw new Error("작화 결과에서만 판정할 수 있어요");
  if (!b.panels.some((p) => p.index === index)) throw new Error(`${index}컷이 없어요`);
  const panels = b.panels.map((p) => {
    if (p.index !== index) return p;
    const { owner_verdict: _v, owner_note: _n, ...rest } = p;
    void _v;
    void _n;
    return verdict ? { ...rest, owner_verdict: verdict, ...(note.trim() ? { owner_note: note.trim().slice(0, 300) } : {}) } : rest;
  });
  return { ...(body as Record<string, unknown>), panels };
}
