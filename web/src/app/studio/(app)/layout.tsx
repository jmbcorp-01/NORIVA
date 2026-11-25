import Link from "next/link";
import { Logo } from "@/components/logo";
import { JobNotifier } from "@/components/job-notifier";
import { requireOwner } from "@/lib/auth";
import { logout } from "../actions";
import { StudioNav } from "./nav";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[208px_1fr]">
      <aside className="border-b border-line bg-paper-raised md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <Link href="/studio">
            <Logo sub="스튜디오" size={26} />
          </Link>
        </div>
        <StudioNav />
        <div className="px-5 md:pt-4">
          <JobNotifier />
        </div>
        <form action={logout} className="hidden px-5 pt-6 md:block">
          <p className="mb-2 truncate text-[11px] text-ink-faint">{owner.email}</p>
          <button className="text-[12px] text-ink-soft underline-offset-4 hover:underline">로그아웃</button>
        </form>
      </aside>
      <main className="min-w-0 px-4 py-7 md:px-10 md:py-9">
        <div className="mx-auto max-w-[1080px]">{children}</div>
      </main>
    </div>
  );
}
