import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { CoinIcon, IconBell } from "./icons";

/** 상단 오른쪽: 코인 잔액과 알림. 로그인하지 않았으면 로그인 링크. */
export function HeaderTools({ t, coins, unread }: { t: Dict; coins: number | null; unread: number }) {
  return (
    <div className="flex items-center gap-1">
      {coins === null ? (
        <Link href="/login" className="px-2 text-[13px] font-semibold text-ink-soft hover:text-ink">
          {t.loginBtn}
        </Link>
      ) : (
        <Link href="/coins" aria-label={`${t.balance} ${coins}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-paper-raised py-1 pl-1 pr-2.5 text-[13px] font-semibold">
          <CoinIcon size={20} />
          {coins.toLocaleString()}
        </Link>
      )}
      <Link href="/notifications" aria-label={t.notifications} className="relative grid h-11 w-11 place-items-center text-ink">
        <IconBell />
        {unread > 0 ? <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-seal" aria-hidden="true" /> : null}
      </Link>
    </div>
  );
}
