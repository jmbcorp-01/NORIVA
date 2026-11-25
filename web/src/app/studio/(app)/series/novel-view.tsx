import { diffParagraphs, diffSummary } from "@/lib/text-diff";

type Stats = { chars: number; chars_no_space?: number; read_minutes?: number; in_range?: boolean };
type Change = { before: string; after: string; reason: string; kind: string };
type Warning = { kind: string; quote: string; note: string };
export type CopyeditBody = {
  kind: "copyedit";
  markdown: string;
  original: string;
  changes?: Change[];
  warnings?: Warning[];
  summary?: string;
  stats?: Stats;
  stats_before?: Stats;
};

const CHANGE_KIND: Record<string, string> = {
  spelling: "맞춤법",
  style: "문체",
  length: "분량",
  repetition: "반복",
  continuity: "설정",
  other: "기타",
};
const WARNING_KIND: Record<string, string> = { banned: "금지 소재", sensitivity: "민감 사항", continuity: "설정 충돌", length: "분량" };

export function isCopyeditBody(b: unknown): b is CopyeditBody {
  const x = b as CopyeditBody | null;
  return !!x && x.kind === "copyedit" && typeof x.markdown === "string" && typeof x.original === "string";
}

export function isManuscriptBody(b: unknown): b is { markdown: string; stats: Stats; length_fixed?: boolean } {
  const x = b as { stage?: string; markdown?: unknown; stats?: Stats } | null;
  return !!x && x.stage === "manuscript" && typeof x.markdown === "string" && typeof x.stats?.chars === "number";
}

/** 분량 한 줄: 5,210자 (공백 제외 3,980자) · 약 8분 */
export function StatsLine({ stats, fixed }: { stats: Stats; fixed?: boolean }) {
  return (
    <p className={`mb-3 text-[12px] ${stats.in_range === false ? "text-plum" : "text-ink-soft"}`}>
      분량 {stats.chars.toLocaleString()}자
      {typeof stats.chars_no_space === "number" ? ` (공백 제외 ${stats.chars_no_space.toLocaleString()}자)` : ""}
      {stats.read_minutes ? ` · 읽는 데 약 ${stats.read_minutes}분` : ""}
      {stats.in_range === false ? " · 기준(4,500~6,500자)을 벗어났어요" : " · 기준 안"}
      {fixed ? " · 분량을 맞춰 한 번 고쳐 썼어요" : ""}
    </p>
  );
}

/** ⑦ 퇴고·교정 검수: 경고 → 고친 곳(색 표시) → 고친 곳 목록 */
export function CopyeditView({ body }: { body: CopyeditBody }) {
  const diff = diffParagraphs(body.original, body.markdown);
  const sum = diffSummary(diff);
  const warnings = body.warnings ?? [];
  const changes = body.changes ?? [];
  return (
    <div className="space-y-3">
      {warnings.length ? (
        <div className="rounded-[5px] border border-plum px-4 py-3 text-[13px]">
          <p className="font-medium text-plum">대표 확인이 필요한 곳 {warnings.length}개</p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-medium">{WARNING_KIND[w.kind] ?? w.kind}</span> {w.note}
                {w.quote ? <span className="block text-[12px] text-ink-soft">&ldquo;{w.quote}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] text-pine">금지 소재·민감 사항 경고는 없어요.</p>
      )}
      {body.summary ? <p className="text-[13px] text-ink-soft">{body.summary}</p> : null}
      {body.stats ? (
        <p className="text-[12px] text-ink-soft">
          {body.stats_before ? `${body.stats_before.chars.toLocaleString()}자 → ` : ""}
          <StatsInline stats={body.stats} /> · 바뀐 문단 {sum.changed}개, 더한 문단 {sum.added}개, 뺀 문단 {sum.removed}개
        </p>
      ) : null}
      <div className="max-h-[560px] space-y-3 overflow-y-auto rounded-[5px] bg-paper px-4 py-3 text-[14px] leading-[1.8]">
        {diff.map((d, i) =>
          d.kind === "same" ? (
            <p key={i} className="text-ink-soft">
              {d.text}
            </p>
          ) : d.kind === "added" ? (
            <p key={i} className="bg-indigo-soft">
              {d.text}
            </p>
          ) : d.kind === "removed" ? (
            <p key={i} className="text-plum line-through">
              {d.text}
            </p>
          ) : (
            <p key={i}>
              {d.pieces.map((p, j) =>
                p.t === "same" ? (
                  <span key={j}>{p.s}</span>
                ) : p.t === "ins" ? (
                  <ins key={j} className="bg-indigo-soft no-underline">
                    {p.s}
                  </ins>
                ) : (
                  <del key={j} className="text-plum">
                    {p.s}
                  </del>
                ),
              )}
            </p>
          ),
        )}
      </div>
      <p className="text-[11px] text-ink-faint">파란 바탕은 더한 글, 빨간 줄은 뺀 글이에요. 회색 문단은 그대로예요.</p>
      {changes.length ? (
        <details className="rounded-[5px] bg-paper-sunk px-4 py-3 text-[13px]">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-soft">고친 곳 목록 {changes.length}개 (이유와 함께)</summary>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {changes.map((c, i) => (
              <li key={i}>
                <span className="font-medium">[{CHANGE_KIND[c.kind] ?? c.kind}]</span> <del className="text-plum">{c.before}</del> →{" "}
                <ins className="no-underline">{c.after}</ins> <span className="text-ink-soft">· {c.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function StatsInline({ stats }: { stats: Stats }) {
  return (
    <span className={stats.in_range === false ? "text-plum" : ""}>
      {stats.chars.toLocaleString()}자{stats.read_minutes ? ` · 약 ${stats.read_minutes}분` : ""}
    </span>
  );
}
