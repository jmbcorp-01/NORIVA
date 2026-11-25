/** 작화 결과의 한 컷 그림을 손으로 고친 그림으로 바꿔요. 원래 그림은 raw_image로 남겨요. */
export function replacePanel(body: unknown, index: number, key: string): Record<string, unknown> {
  const b = body as { kind?: string; panels?: { index: number; image?: string; raw_image?: string }[] } | null;
  if (!b || (b.kind !== "art" && b.kind !== "lettered") || !Array.isArray(b.panels)) throw new Error("작화나 말풍선 결과에서만 컷 그림을 바꿀 수 있어요");
  if (!b.panels.some((p) => p.index === index)) throw new Error(`${index}컷이 없어요`);
  const panels = b.panels.map((p) =>
    p.index === index
      ? {
          ...p,
          image: key,
          raw_image: p.raw_image ?? p.image,
          hand_edited: true,
          // 사람이 고친 그림은 자동 검사 점수 대신 대표 판단을 따라요
          passed: true,
          ...(b.kind === "art" ? { defects: [] } : {}),
          // 손으로 고친 그림은 앞뒤 컷과 겹쳐 잇는 위치가 맞지 않을 수 있어 따로 보여 줘요
          join: undefined,
        }
      : // 바뀐 컷 아래에 겹쳐 잇던 컷도 이제 위치가 맞지 않아 따로 보여 줘요
        (p as { join?: { prev?: number } }).join?.prev === index
        ? { ...p, join: undefined }
        : p,
  );
  return { ...(body as Record<string, unknown>), panels };
}
