// 퇴고 전후 비교 (⑦ 퇴고·교정 검수 화면). 문단끼리 먼저 맞추고, 바뀐 문단 안에서는 단어 단위로 비교해요.

export type Piece = { t: "same" | "del" | "ins"; s: string };
export type ParaDiff =
  | { kind: "same"; text: string }
  | { kind: "changed"; pieces: Piece[] }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

/** 두 목록의 최장 공통 부분으로 같은/지움/넣음 순서를 만들어요 */
function lcsOps<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): { t: "same" | "del" | "ins"; i: number; j: number }[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = eq(a[i], b[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const out: { t: "same" | "del" | "ins"; i: number; j: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ t: "same", i, j });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) out.push({ t: "del", i: i++, j });
    else out.push({ t: "ins", i, j: j++ });
  }
  while (i < n) out.push({ t: "del", i: i++, j });
  while (j < m) out.push({ t: "ins", i, j: j++ });
  return out;
}

/** 글자 단위 비교 (한국어는 조사·띄어쓰기만 바뀌는 일이 많아 단어보다 글자가 읽기 쉬워요). 이어지는 같은 종류는 하나로 합쳐요 */
export function diffWords(a: string, b: string): Piece[] {
  const ta = Array.from(a);
  const tb = Array.from(b);
  const out: Piece[] = [];
  for (const op of lcsOps(ta, tb, (x, y) => x === y)) {
    const s = op.t === "ins" ? tb[op.j] : ta[op.i];
    const last = out[out.length - 1];
    if (last && last.t === op.t) last.s += s;
    else out.push({ t: op.t, s });
  }
  return out;
}

const paras = (s: string) =>
  s
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** 문단 단위 비교. 지운 문단 바로 뒤에 넣은 문단이 오면 '바뀐 문단'으로 묶어 단어 비교를 붙여요 */
export function diffParagraphs(before: string, after: string): ParaDiff[] {
  const a = paras(before);
  const b = paras(after);
  const ops = lcsOps(a, b, (x, y) => x === y);
  const out: ParaDiff[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.t === "same") {
      out.push({ kind: "same", text: a[op.i] });
      k++;
      continue;
    }
    const dels: string[] = [];
    const ins: string[] = [];
    while (k < ops.length && ops[k].t !== "same") {
      if (ops[k].t === "del") dels.push(a[ops[k].i]);
      else ins.push(b[ops[k].j]);
      k++;
    }
    // 비슷한 문단끼리만 '바뀐 문단'으로 묶고, 나머지는 뺀 문단·더한 문단으로 보여줘요
    // 거의 통째로 다시 쓴 경우는 짝 맞추기를 건너뛰어요 (비교 계산이 너무 커져요)
    if (dels.length * ins.length > 200) {
      for (const d of dels) out.push({ kind: "removed", text: d });
      for (const x of ins) out.push({ kind: "added", text: x });
      continue;
    }
    let q = 0;
    for (const d of dels) {
      const at = ins.findIndex((x, idx) => idx >= q && similarity(d, x) >= 0.5);
      if (at < 0) {
        out.push({ kind: "removed", text: d });
        continue;
      }
      for (const x of ins.slice(q, at)) out.push({ kind: "added", text: x });
      out.push({ kind: "changed", pieces: diffWords(d, ins[at]) });
      q = at + 1;
    }
    for (const x of ins.slice(q)) out.push({ kind: "added", text: x });
  }
  return out;
}

/** 두 문단이 얼마나 같은지 (0~1). 같은 글자 수 × 2 / 전체 글자 수 */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const same = diffWords(a, b)
    .filter((p) => p.t === "same")
    .reduce((n, p) => n + Array.from(p.s).length, 0);
  return (2 * same) / (Array.from(a).length + Array.from(b).length);
}

export function diffSummary(d: ParaDiff[]) {
  return {
    changed: d.filter((x) => x.kind === "changed").length,
    added: d.filter((x) => x.kind === "added").length,
    removed: d.filter((x) => x.kind === "removed").length,
  };
}
