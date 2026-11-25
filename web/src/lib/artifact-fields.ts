/**
 * 스튜디오 '직접 고치기' 입력란: 작화·말풍선 결과에서 자주 고치는 칸(컷 설명, 대사, 말풍선 글)만 입력란으로 보여 주고,
 * 저장할 때 원래 결과에 그 칸만 바꿔 넣어요. 따옴표 하나 틀려 결과가 깨지는 JSON 직접 편집을 대신해요.
 */

type Dialogue = { speaker?: string; text?: string };
type Bubble = { text?: { ko?: string; en?: string } };
type Panel = { index: number; description?: string; dialogue?: Dialogue[]; bubbles?: Bubble[] };

export type FieldRow = { name: string; label: string; value: string; long?: boolean };
export type FieldGroup = { index: number; rows: FieldRow[] };

export function editableKind(body: unknown): "art" | "lettered" | null {
  const b = body as { kind?: string; panels?: unknown } | null;
  if (!b || !Array.isArray(b.panels)) return null;
  return b.kind === "art" || b.kind === "lettered" ? b.kind : null;
}

/** 컷마다 고칠 수 있는 칸 목록 */
export function fieldGroups(body: unknown): FieldGroup[] {
  const kind = editableKind(body);
  if (!kind) return [];
  const panels = (body as { panels: Panel[] }).panels;
  return panels.map((p) => {
    const rows: FieldRow[] = [];
    if (kind === "art") {
      rows.push({ name: `p${p.index}.description`, label: "컷 설명 (그림 지시, 영어)", value: p.description ?? "", long: true });
      (p.dialogue ?? []).forEach((d, i) =>
        rows.push({ name: `p${p.index}.d${i}`, label: `대사 ${i + 1} · ${d.speaker === "narration" ? "내레이션" : d.speaker ?? ""}`, value: d.text ?? "" }),
      );
    } else {
      (p.bubbles ?? []).forEach((b, i) => {
        rows.push({ name: `p${p.index}.b${i}.ko`, label: `말풍선 ${i + 1} 한국어`, value: b.text?.ko ?? "" });
        rows.push({ name: `p${p.index}.b${i}.en`, label: `말풍선 ${i + 1} 영어`, value: b.text?.en ?? "" });
      });
    }
    return { index: p.index, rows };
  });
}

/** 입력란 값을 원래 결과에 넣어요. 모르는 칸 이름은 무시하고, 다른 값은 건드리지 않아요. */
export function applyFields(body: Record<string, unknown>, fields: Map<string, string>): Record<string, unknown> {
  const kind = editableKind(body);
  if (!kind) throw new Error("입력란으로 고칠 수 없는 결과예요");
  const panels = (body.panels as Panel[]).map((p) => {
    const q: Panel = { ...p };
    const get = (k: string) => fields.get(`p${p.index}.${k}`);
    if (kind === "art") {
      const desc = get("description");
      if (desc !== undefined) q.description = desc.trim();
      if (p.dialogue) q.dialogue = p.dialogue.map((d, i) => (get(`d${i}`) !== undefined ? { ...d, text: get(`d${i}`)!.trim() } : d));
    } else if (p.bubbles) {
      q.bubbles = p.bubbles.map((b, i) => {
        const ko = get(`b${i}.ko`);
        const en = get(`b${i}.en`);
        if (ko === undefined && en === undefined) return b;
        return { ...b, text: { ...b.text, ...(ko !== undefined ? { ko: ko.trim() } : {}), ...(en !== undefined ? { en: en.trim() } : {}) } };
      });
    }
    return q;
  });
  return { ...body, panels };
}
