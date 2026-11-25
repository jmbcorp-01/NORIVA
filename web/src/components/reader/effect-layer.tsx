/**
 * 연출 효과 레이어 (04번 5장): 집중선·속도선·번쩍임을 그림 모델에 그리게 하지 않고 뷰어가 직접 얹어요.
 * 그림 모델이 그린 효과선은 'AI 그림' 티가 가장 많이 나는 곳이에요. 컷 번호로 모양을 정해 같은 컷은 늘 같은 모양이에요.
 */
export type EffectKind = "focus" | "speed" | "flash";

function rand(seed: number) {
  let x = (seed * 2654435761) % 4294967296;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

export function effectLines(kind: EffectKind, seed: number): { x1: number; y1: number; x2: number; y2: number; w: number }[] {
  const r = rand(seed + 1);
  const out: { x1: number; y1: number; x2: number; y2: number; w: number }[] = [];
  if (kind === "focus") {
    // 가장자리에서 가운데로 모이는 선. 가운데(인물 얼굴 자리)는 비워 둬요
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2 + r() * 0.06;
      const inner = 30 + r() * 14;
      out.push({ x1: 50 + Math.cos(a) * 75, y1: 50 + Math.sin(a) * 75, x2: 50 + Math.cos(a) * inner, y2: 50 + Math.sin(a) * inner, w: 0.25 + r() * 0.55 });
    }
  } else if (kind === "speed") {
    for (let i = 0; i < 34; i++) {
      const y = r() * 100;
      const len = 25 + r() * 45;
      const fromLeft = r() < 0.5;
      const x1 = fromLeft ? -2 : 102;
      out.push({ x1, y1: y, x2: fromLeft ? x1 + len : x1 - len, y2: y, w: 0.2 + r() * 0.5 });
    }
  }
  return out;
}

export function EffectLayer({ kind, seed }: { kind?: string | null; seed: number }) {
  if (kind !== "focus" && kind !== "speed" && kind !== "flash") return null;
  if (kind === "flash") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{ background: "radial-gradient(circle at 50% 45%, rgba(255,250,235,.85) 0%, rgba(255,250,235,.25) 28%, rgba(255,250,235,0) 60%)" }}
      />
    );
  }
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      {effectLines(kind, seed).map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#16130f" strokeOpacity={0.45} strokeWidth={l.w} strokeLinecap="round" />
      ))}
    </svg>
  );
}
