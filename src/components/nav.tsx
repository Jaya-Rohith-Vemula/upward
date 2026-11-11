"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Day", icon: <path d="M4 5.5h16v14H4zM4 9.5h16M8.5 3v4M15.5 3v4" /> },
  { href: "/projects", label: "Projects", icon: <path d="M4 4.5h4.5v15H4zM10 4.5h4.5v10H10zM16 4.5h4v7h-4z" /> },
  { href: "/todos", label: "To-dos", icon: <path d="M4.5 7.5 6.5 9.5 10 6M4.5 15.5l2 2L10 14M13 8h7M13 16h7" /> },
  { href: "/insights", label: "Insights", icon: <path d="M4 19.5h16M6.5 16v-5M11 16V7M15.5 16v-7M20 16V4.5" /> },
  { href: "/settings", label: "Settings", icon: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /> },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Desktop sidebar links. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="hidden flex-col gap-0.5 px-4 md:flex" aria-label="Main">
      {ITEMS.map((it) => {
        const active = isActive(path, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-md px-2 py-2 text-sm transition-colors ${active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            <span className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile bottom tab bar. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/92 backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map((it) => {
          const active = isActive(path, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-ink" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {it.icon}
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
