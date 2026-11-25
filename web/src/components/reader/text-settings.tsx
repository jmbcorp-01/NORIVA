"use client";

import { useEffect, useState } from "react";
import {
  LINE_HEIGHTS,
  TEXT_FONTS,
  TEXT_SETTINGS_COOKIE,
  TEXT_SIZES,
  TEXT_THEMES,
  THEME_VAR_KEYS,
  textStyle,
  type TextSettings,
} from "@/lib/novel-text";

type Labels = {
  textSettings: string;
  textSize: string;
  lineHeight: string;
  textFont: string;
  fontSerif: string;
  fontSans: string;
  textTheme: string;
  themePaper: string;
  themeSepia: string;
  themeNight: string;
  close: string;
  lineTight: string;
  lineNormal: string;
  lineWide: string;
};

/** 글 뷰어 보기 설정: 글자 크기, 줄 간격, 글꼴, 배경. 이 기기에 쿠키로 저장해서 다음 회차에도 그대로예요. */
export function TextSettingsButton({ initial, labels: l, rootId }: { initial: TextSettings; labels: Labels; rootId: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    for (const k of THEME_VAR_KEYS) root.style.removeProperty(k);
    for (const [k, x] of Object.entries(textStyle(v))) root.style.setProperty(k, x);
    root.dataset.font = v.font;
    root.dataset.theme = v.theme;
    try {
      document.cookie = `${TEXT_SETTINGS_COOKIE}=${encodeURIComponent(JSON.stringify(v))}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* 저장이 막힌 기기에서도 이번 화면에는 적용돼요 */
    }
  }, [v, rootId]);

  const set = (p: Partial<TextSettings>) => setV((x) => ({ ...x, ...p }));
  const seg = "h-10 flex-1 rounded-[6px] border text-[13.5px]";
  const on = "border-ink bg-ink font-semibold text-paper";
  const off = "border-line bg-paper-raised text-ink-soft";
  const themeName = { paper: l.themePaper, sepia: l.themeSepia, night: l.themeNight };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-label={l.textSettings}
        title={l.textSettings}
        className="flex h-11 w-11 items-baseline justify-center whitespace-nowrap pt-2.5 font-serif text-[18px] font-semibold leading-none text-ink"
      >
        가<span className="text-[12px]">가</span>
      </button>
      {open ? (
        <div role="dialog" aria-label={l.textSettings} className="fixed inset-x-0 top-[calc(56px+env(safe-area-inset-top))] z-30 border-b border-line bg-paper-raised shadow-[0_8px_24px_rgba(0,0,0,.12)]">
          <div className="mx-auto max-w-[720px] space-y-3 px-4 py-4 text-[13px]">
            <Row label={l.textSize}>
              <button type="button" className={`${seg} ${off}`} disabled={v.size === 0} onClick={() => set({ size: Math.max(0, v.size - 1) })} aria-label={`${l.textSize} -`}>
                가−
              </button>
              <span className="w-12 text-center tabular-nums text-ink">{TEXT_SIZES[v.size]}</span>
              <button
                type="button"
                className={`${seg} ${off}`}
                disabled={v.size === TEXT_SIZES.length - 1}
                onClick={() => set({ size: Math.min(TEXT_SIZES.length - 1, v.size + 1) })}
                aria-label={`${l.textSize} +`}
              >
                가+
              </button>
            </Row>
            <Row label={l.lineHeight}>
              {LINE_HEIGHTS.map((h, i) => (
                <button key={h} type="button" aria-pressed={v.line === i} className={`${seg} ${v.line === i ? on : off}`} onClick={() => set({ line: i })}>
                  {[l.lineTight, l.lineNormal, l.lineWide][i]}
                </button>
              ))}
            </Row>
            <Row label={l.textFont}>
              {TEXT_FONTS.map((f) => (
                <button key={f} type="button" aria-pressed={v.font === f} className={`${seg} ${v.font === f ? on : off} ${f === "serif" ? "font-serif" : "font-sans"}`} onClick={() => set({ font: f })}>
                  {f === "serif" ? l.fontSerif : l.fontSans}
                </button>
              ))}
            </Row>
            <Row label={l.textTheme}>
              {TEXT_THEMES.map((th) => (
                <button key={th} type="button" aria-pressed={v.theme === th} className={`${seg} ${v.theme === th ? on : off}`} onClick={() => set({ theme: th })}>
                  {themeName[th]}
                </button>
              ))}
            </Row>
            <button type="button" onClick={() => setOpen(false)} className="h-10 w-full rounded-[6px] text-[13px] text-ink-soft">
              {l.close}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] flex-none text-ink-faint">{label}</span>
      <div className="flex flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** 지난번에 중간까지 읽었으면 그 문단으로 갈지 물어봐요 */
export function ResumePrompt({ at, ask, go, close }: { at: number; ask: string; go: string; close: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-10 mx-4 mt-3 flex items-center gap-3 rounded-[8px] border border-line bg-paper-raised px-3.5 py-2.5 text-[13px] shadow-[0_4px_14px_rgba(0,0,0,.08)]">
      <span className="flex-1 text-ink-soft">{ask}</span>
      <button
        type="button"
        className="h-9 rounded-full bg-ink px-4 text-[13px] font-semibold text-paper"
        onClick={() => {
          document.querySelector(`[data-panel="${at}"]`)?.scrollIntoView({ block: "center" });
          setShown(false);
        }}
      >
        {go}
      </button>
      <button type="button" aria-label={close} className="h-9 w-9 text-ink-faint" onClick={() => setShown(false)}>
        ×
      </button>
    </div>
  );
}
