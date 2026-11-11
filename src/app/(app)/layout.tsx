import { Nav, TabBar } from "@/components/nav";
import { ConfirmProvider } from "@/components/ui";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <div className="mx-auto flex min-h-dvh max-w-[1240px] flex-col md:flex-row">
        <aside className="pt-safe md:sticky md:top-0 md:h-dvh md:w-52 md:shrink-0 md:border-r md:border-rule">
          <div className="flex items-center justify-between px-4 pb-1 pt-3 md:block md:px-6 md:pb-6 md:pt-8">
            <a href="/" className="display text-2xl italic leading-none md:text-[1.75rem]">
              Upward<span className="text-accent">.</span>
            </a>
            <p className="mt-2 hidden text-xs leading-snug text-muted md:block">A ledger of hours,<br />projects &amp; to-dos.</p>
            {process.env.APP_PASSWORD && (
              <form action={logout} className="md:hidden">
                <button className="min-h-11 px-2 text-xs text-muted">Lock</button>
              </form>
            )}
          </div>
          <Nav />
          {process.env.APP_PASSWORD && (
            <form action={logout} className="absolute bottom-6 hidden px-6 md:block">
              <button className="text-xs text-muted hover:text-ink">Lock</button>
            </form>
          )}
        </aside>
        <main className="pb-tabbar min-w-0 flex-1 px-4 pt-3 md:px-10 md:pt-10">{children}</main>
      </div>
      <TabBar />
    </ConfirmProvider>
  );
}
