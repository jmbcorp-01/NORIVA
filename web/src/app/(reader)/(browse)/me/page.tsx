import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader, linkedProviders } from "@/lib/reader-auth";
import { deleteAccountAction, logoutAction, saveNickname } from "@/app/reader-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Me" };

export default async function Me({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/me");
  const locale = await getLocale();
  const t = DICT[locale];
  const { error } = await searchParams;
  const providers = await linkedProviders(reader.id);
  const btn = "flex h-11 items-center justify-center rounded-[5px] border border-line bg-paper-raised px-4 text-[14px]";

  return (
    <div className="px-4 pt-5">
      <h1 className="font-serif text-[22px] font-semibold">{t.me}</h1>

      <form action={saveNickname} className="mt-6">
        <label htmlFor="nickname" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
          {t.nickname}
        </label>
        <div className="flex gap-2">
          <input
            id="nickname"
            name="nickname"
            defaultValue={reader.nickname}
            minLength={2}
            maxLength={20}
            required
            className="h-11 min-w-0 flex-1 rounded-[5px] border border-line bg-paper-raised px-3 text-[15px]"
          />
          <button type="submit" className={btn}>
            {t.save}
          </button>
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-[12px] font-medium text-ink-soft">{t.linked}</h2>
        <p className="mt-1.5 text-[14px]">
          {providers.map((p) => t.providerName[p] ?? p).join(", ")}
          {reader.email ? <span className="text-ink-faint"> · {reader.email}</span> : null}
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <form action={logoutAction}>
          <button type="submit" className={btn}>
            {t.logout}
          </button>
        </form>
        <form action={logoutAction}>
          <input type="hidden" name="everywhere" value="1" />
          <button type="submit" className={btn}>
            {t.logoutAll}
          </button>
        </form>
      </div>

      <details className="mt-12 rounded-[6px] border border-line px-4 py-3" open={error === "confirm"}>
        <summary className="cursor-pointer text-[14px] text-plum">{t.deleteAccount}</summary>
        <form action={deleteAccountAction} className="mt-3">
          <label htmlFor="confirm" className="block text-[13px] leading-relaxed text-ink-soft">
            {t.deleteConfirm}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="confirm"
              name="confirm"
              autoComplete="off"
              placeholder={t.deleteWord}
              aria-invalid={error === "confirm" || undefined}
              className="h-11 min-w-0 flex-1 rounded-[5px] border border-line bg-paper-raised px-3 text-[15px]"
            />
            <button type="submit" className="h-11 rounded-[5px] border border-plum px-4 text-[14px] text-plum">
              {t.deleteAccount}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
