/**
 * 회차를 어떻게 볼 수 있는지 정하는 규칙 (01번 기획서 4.1). DB를 읽지 않는 순수 함수라 시험하기 쉬워요.
 *
 * - 무료 작품(오픈 베타)이거나 처음 N화, 또는 샘플 작품: 누구나 무료
 * - 이미 연 회차(코인 소장, 기다무로 연 회차): 계속 볼 수 있어요
 * - 패스 구독 중: 선공개를 뺀 모든 회차
 * - 그 밖에는 잠겨 있고, 열 수 있는 방법(기다무, 코인)을 알려줘요
 */

export const EARLY_ACCESS_PRICE = 5;
/** 기다무에서 빼는 최신 회차 수 */
export const WAIT_FREE_EXCLUDE_LATEST = 3;
export const WAIT_FREE_HOURS = 24;

/** waitFreeExclude·earlyPrice는 작품마다 달라요 (웹툰 3·5, 웹소설 10·2). 비우면 웹툰 기준이에요. */
export type SeriesSale = { paid: boolean; freeEpisodes: number; waitFree: boolean; isDummy: boolean; waitFreeExclude?: number; earlyPrice?: number };
export type EpisodeSale = { number: number; priceCoins: number; earlyAccess: boolean };
export type ReaderRights = {
  owned: Set<number>; // 이 작품에서 연 회차 번호
  passActive: boolean;
  waitFreeReadyAt: Date | null; // null이면 바로 쓸 수 있어요
};

export type Access =
  | { kind: "free" }
  | { kind: "owned" }
  | { kind: "pass" }
  | { kind: "locked"; price: number; waitFree: "ready" | "waiting" | "excluded" | "off"; waitFreeAt: Date | null; early: boolean };

export function episodeAccess(s: SeriesSale, ep: EpisodeSale, latestRegular: number, rights: ReaderRights | null, now = new Date()): Access {
  if (s.isDummy || !s.paid || ep.number <= s.freeEpisodes) return { kind: "free" };
  if (rights?.owned.has(ep.number)) return { kind: "owned" };
  if (rights?.passActive && !ep.earlyAccess) return { kind: "pass" };
  const price = ep.earlyAccess ? Math.max(ep.priceCoins, s.earlyPrice ?? EARLY_ACCESS_PRICE) : ep.priceCoins;
  let waitFree: "ready" | "waiting" | "excluded" | "off" = "off";
  let waitFreeAt: Date | null = null;
  if (s.waitFree) {
    if (ep.earlyAccess || ep.number > latestRegular - (s.waitFreeExclude ?? WAIT_FREE_EXCLUDE_LATEST)) waitFree = "excluded";
    else if (!rights?.waitFreeReadyAt || rights.waitFreeReadyAt <= now) waitFree = "ready";
    else {
      waitFree = "waiting";
      waitFreeAt = rights.waitFreeReadyAt;
    }
  }
  return { kind: "locked", price, waitFree, waitFreeAt, early: ep.earlyAccess };
}

/** 선공개가 아닌 회차 중 가장 큰 번호 (기다무 제외 범위 기준) */
export function latestRegularNumber(eps: EpisodeSale[]): number {
  return eps.filter((e) => !e.earlyAccess).reduce((m, e) => Math.max(m, e.number), 0);
}

/** 코인 쓰기: 보너스 코인부터 써요. 모자라면 null. */
export function splitSpend(wallet: { paid: number; free: number }, price: number): { paid: number; free: number } | null {
  if (price < 0 || wallet.paid + wallet.free < price) return null;
  const free = Math.min(wallet.free, price);
  return { free, paid: price - free };
}

/** 남은 시간 "HH:MM:SS" */
export function formatCountdown(until: Date, now = new Date()): string {
  const s = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
