import Link from "next/link";
import { unlockAction } from "@/app/reader-actions";
import { formatCountdown, type Access } from "@/lib/access-rules";
import type { Dict } from "@/lib/i18n";
import { CoinIcon } from "./icons";
import { btn } from "./parts";

type Locked = Extract<Access, { kind: "locked" }>;

/**
 * 회차 열기 시트. 휴대폰에서는 아래에서 올라오고, 태블릿·PC에서는 가운데 대화상자예요.
 * 주소(?open=N)로 열고 닫아서 자바스크립트 없이도 동작해요. 실제 판단과 차감은 서버(unlockAction)가 해요.
 */
export function UnlockSheet(p: {
  t: Dict;
  slug: string;
  seriesTitle: string;
  ep: { number: number; title: string };
  access: Locked;
  coins: number | null;
  loggedIn: boolean;
  closeHref: string;
  error?: string;
}) {
  const { t, access: a } = p;
  const canWait = a.waitFree === "ready";
  const enough = p.coins !== null && p.coins >= a.price;
  const waitSub =
    a.waitFree === "ready" ? t.optWaitReady : a.waitFree === "waiting" && a.waitFreeAt ? t.optWaitWaiting(formatCountdown(a.waitFreeAt)) : t.optWaitExcluded;
  const opt = "flex items-center gap-3 rounded-[8px] border p-3.5";
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <Link href={p.closeHref} scroll={false} aria-label={t.close} className="absolute inset-0 bg-[rgba(20,18,16,.52)]" />
      <div className="relative w-full max-w-[480px] rounded-t-[18px] bg-paper-raised px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2.5 md:rounded-[14px] md:pb-6">
        <div className="mx-auto mb-4 h-[5px] w-[38px] rounded-full bg-line-strong md:hidden" />
        <p className="text-[12px] text-ink-faint">{p.seriesTitle}</p>
        <h2 id="unlock-title" className="mb-4 mt-0.5 text-[19px] font-bold">
          {t.episodes(p.ep.number)}
          {p.ep.title ? ` · ${p.ep.title}` : ""}
        </h2>
        {p.error ? (
          <p role="alert" className="mb-3 rounded-[6px] bg-plum-soft px-3 py-2 text-[13px] text-plum">
            {t.unlockErrors[p.error] ?? t.unlockErrors.not_found}
          </p>
        ) : null}

        {!p.loggedIn ? (
          <Link href={`/login?next=${encodeURIComponent(`/series/${p.slug}?open=${p.ep.number}`)}`} className={`${btn.ink} w-full`}>
            {t.loginToOpen}
          </Link>
        ) : (
          <div className="space-y-2.5">
            {a.waitFree !== "off" ? (
              <form action={unlockAction} className={`${opt} ${canWait ? "border-ochre bg-ochre-soft" : "border-line opacity-60"}`}>
                <input type="hidden" name="slug" value={p.slug} />
                <input type="hidden" name="ep" value={p.ep.number} />
                <input type="hidden" name="method" value="wait_free" />
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold">{t.optWait}</p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">{waitSub}</p>
                </div>
                {canWait ? (
                  <button type="submit" className={`${btn.small} bg-ochre text-white`}>
                    {t.useWait}
                  </button>
                ) : null}
              </form>
            ) : null}

            <form action={unlockAction} className={`${opt} border-ink`}>
              <input type="hidden" name="slug" value={p.slug} />
              <input type="hidden" name="ep" value={p.ep.number} />
              <input type="hidden" name="method" value="coin" />
              <div className="flex-1">
                <p className="text-[14.5px] font-semibold">{t.optCoin}</p>
                <p className="mt-0.5 text-[12px] text-ink-faint">{t.optCoinSub}</p>
                <label className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-soft">
                  <input type="checkbox" name="auto" value="1" className="h-4 w-4 accent-[var(--ink)]" />
                  {t.autoUnlock}
                </label>
              </div>
              {enough ? (
                <button type="submit" className={`${btn.small} gap-1 bg-seal text-white`}>
                  <CoinIcon size={15} /> {a.price}
                </button>
              ) : (
                <span className="flex items-center gap-1 font-bold">
                  <CoinIcon size={16} /> {a.price}
                </span>
              )}
            </form>

            {!a.early ? (
              <Link href="/pass" className={`${opt} border-line bg-paper hover:border-line-strong`}>
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold">{t.optPass}</p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">{t.optPassSub}</p>
                </div>
                <span className="rounded-[4px] bg-seal-soft px-1.5 py-1 text-[11px] font-bold text-seal">{t.passTrial}</span>
              </Link>
            ) : null}

            <div className="flex justify-between px-0.5 pt-1 text-[13px] text-ink-soft">
              <span>{t.haveCoins(p.coins ?? 0)}</span>
              {enough ? <span>{t.afterUse(p.coins! - a.price)}</span> : null}
            </div>
            <p className="px-0.5 text-[11.5px] leading-relaxed text-ink-faint">{t.unlockNotice}</p>
            {!enough ? (
              <Link href={`/coins?next=${encodeURIComponent(`/series/${p.slug}?open=${p.ep.number}`)}`} className={`${btn.seal} w-full`}>
                {t.needCoins(a.price - (p.coins ?? 0))}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
