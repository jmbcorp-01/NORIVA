/**
 * 회차별 독자 흐름 (01번 7장 운영 지표): 몇 명이 읽기 시작해 끝까지 봤는지, 어느 컷에서 많이 떠났는지.
 * 뷰어가 이미 저장하는 '어디까지 봤는지(reading_progress)'만으로 계산해요.
 */

export type ProgressRow = { maxPanel: number; panelCount: number };

export type Funnel = {
  readers: number;
  finished: number;
  /** 끝까지 본 비율 (0~100) */
  completion: number;
  /** 끝까지 보지 않은 독자가 가장 많이 멈춘 컷 번호와 그 수. 끝까지 보지 않은 독자가 없으면 null */
  topDrop: { panel: number; readers: number } | null;
};

export function funnel(rows: ProgressRow[]): Funnel {
  const readers = rows.length;
  const done = (r: ProgressRow) => r.panelCount > 0 && r.maxPanel >= r.panelCount;
  const finished = rows.filter(done).length;
  const stops = new Map<number, number>();
  for (const r of rows) {
    if (done(r) || r.maxPanel <= 0) continue;
    stops.set(r.maxPanel, (stops.get(r.maxPanel) ?? 0) + 1);
  }
  let topDrop: Funnel["topDrop"] = null;
  for (const [panel, n] of stops) {
    if (!topDrop || n > topDrop.readers || (n === topDrop.readers && panel < topDrop.panel)) topDrop = { panel, readers: n };
  }
  return { readers, finished, completion: readers ? Math.round((finished / readers) * 100) : 0, topDrop };
}
