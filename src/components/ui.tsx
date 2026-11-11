"use client";

/**
 * App-wide controls that replace native browser/iOS widgets:
 * Popover (anchored menu on desktop, bottom sheet on touch/small screens), Select, DatePicker,
 * Slider, Switch, ColorPicker, and a promise-based Confirm dialog.
 */

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ───────────────────────── media

export function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const f = () => setM(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

// ───────────────────────── Popover / Sheet

type TriggerProps = {
  ref: React.RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
  type: "button";
};

export function Popover({
  trigger,
  children,
  title,
  width = 240,
  align = "start",
}: {
  trigger: (p: TriggerProps, open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  title: string;
  width?: number;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const mobile = useIsMobile();
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Render inside an open <dialog> (top layer) when the trigger lives in one.
  useEffect(() => {
    if (open) setHost(triggerRef.current?.closest("dialog[open]") ?? document.body);
  }, [open]);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const h = panelRef.current?.offsetHeight ?? 300;
    const up = r.bottom + h + 12 > window.innerHeight && r.top > h + 12;
    const left = align === "end" ? r.right - width : r.left;
    // A transformed host (e.g. <dialog> mid-animation) becomes the containing block for
    // position:fixed, so convert viewport coords into host-relative ones.
    let dx = 0, dy = 0;
    if (host && host !== document.body && getComputedStyle(host).transform !== "none") {
      const hr = host.getBoundingClientRect();
      dx = hr.left + host.clientLeft - host.scrollLeft;
      dy = hr.top + host.clientTop - host.scrollTop;
    }
    setPos({
      top: (up ? r.top - h - 6 : r.bottom + 6) - dy,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) - dx,
      up,
    });
  }, [align, width, host]);

  useLayoutEffect(() => {
    if (!open || mobile) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    host?.addEventListener("animationend", place);
    return () => {
      host?.removeEventListener("animationend", place);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mobile, place, host]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // don't close a surrounding <dialog>
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    // focus first focusable
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[autofocus], [data-autofocus], input, button[aria-selected='true'], button")?.focus({ preventScroll: true }));
    let unlock: (() => void) | undefined;
    if (mobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      unlock = () => (document.body.style.overflow = prev);
    }
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      unlock?.();
    };
  }, [open, mobile, close]);

  const panel = open && host
    ? createPortal(
        mobile ? (
          <div className="fixed inset-0 z-[60]" data-popover-open>
            <div className="sheet-backdrop absolute inset-0" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              id={id}
              role="dialog"
              aria-label={title}
              className="sheet absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-2xl bg-paper shadow-[0_-16px_40px_-16px_rgb(0_0_0/0.4)]"
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule-strong" aria-hidden />
              <div className="flex items-center justify-between px-5 pb-1 pt-3">
                <p className="text-sm font-semibold">{title}</p>
                <button type="button" onClick={close} className="-mr-2 min-h-11 px-2 text-sm font-semibold text-accent">
                  Done
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{children(close)}</div>
            </div>
          </div>
        ) : (
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={title}
            data-popover-open
            className="popover fixed z-[60] rounded-lg border border-rule bg-paper p-1.5 shadow-[0_16px_40px_-14px_rgb(0_0_0/0.35)]"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
          >
            {children(close)}
          </div>
        ),
        host,
      )
    : null;

  return (
    <>
      {trigger({ ref: triggerRef, onClick: () => setOpen((o) => !o), "aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": id, type: "button" }, open)}
      {panel}
    </>
  );
}

// ───────────────────────── Select

export type SelectOption<V> = { value: V; label: string; hint?: string; color?: string };

export function Select<V extends string | number | null>({
  value,
  options,
  onChange,
  label,
  className = "",
  renderValue,
  width = 240,
}: {
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
  renderValue?: (o: SelectOption<V> | undefined) => React.ReactNode;
  width?: number;
}) {
  const cur = options.find((o) => o.value === value);
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <Popover
      title={label}
      width={width}
      trigger={(p) => (
        <button {...p} aria-label={`${label}: ${cur?.label ?? "none"}`} className={`inline-flex min-h-9 items-center gap-1.5 text-left ${className}`}>
          {renderValue ? renderValue(cur) : <span className="truncate">{cur?.label ?? "Select"}</span>}
          <Chevron />
        </button>
      )}
    >
      {(close) => (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="max-h-80 overflow-y-auto md:max-h-72"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <li key={String(o.value)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  ref={(el) => {
                    if (sel && el) el.scrollIntoView({ block: "nearest" });
                  }}
                  onClick={() => {
                    onChange(o.value);
                    close();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-3 text-left text-[15px] md:py-1.5 md:text-sm ${sel ? "bg-paper-2 font-semibold" : "hover:bg-paper-2 focus:bg-paper-2"} focus:outline-none`}
                >
                  {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs font-normal text-muted">{o.hint}</span>}
                  </span>
                  {sel && <Check />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`size-3 shrink-0 text-muted ${className}`} aria-hidden>
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Check() {
  return (
    <svg viewBox="0 0 12 12" className="size-3.5 shrink-0 text-accent" aria-hidden>
      <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ───────────────────────── DatePicker

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const localToday = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};
const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function formatDay(day: string, today = localToday()) {
  if (day === today) return "Today";
  if (day === shift(today, 1)) return "Tomorrow";
  if (day === shift(today, -1)) return "Yesterday";
  const d = new Date(day + "T00:00:00Z");
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Set date",
  today: todayProp,
  clearable = true,
  min,
  max,
  className = "",
  tone,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  placeholder?: string;
  today?: string;
  clearable?: boolean;
  min?: string;
  max?: string;
  className?: string;
  tone?: "warn";
}) {
  const today = todayProp ?? localToday();
  return (
    <Popover
      title={label}
      width={292}
      trigger={(p) => (
        <button {...p} aria-label={`${label}: ${value ? formatDay(value, today) : "none"}`} className={`inline-flex min-h-9 items-center gap-1.5 ${tone === "warn" ? "text-warn" : ""} ${className}`}>
          <CalendarIcon />
          <span className={value ? "" : "text-muted"}>{value ? formatDay(value, today) : placeholder}</span>
        </button>
      )}
    >
      {(close) => <Calendar value={value} today={today} min={min} max={max} clearable={clearable} onPick={(v) => (onChange(v), close())} />}
    </Popover>
  );
}

function Calendar({ value, today, min, max, clearable, onPick }: { value: string | null; today: string; min?: string; max?: string; clearable: boolean; onPick: (v: string | null) => void }) {
  const base = value ?? today;
  const [ym, setYm] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysIn = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(ym.y, ym.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const move = (n: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);
  const nextMon = shift(today, ((8 - new Date(today + "T00:00:00Z").getUTCDay()) % 7) || 7);
  const quick: [string, string][] = [
    ["Today", today],
    ["Tomorrow", shift(today, 1)],
    ["Next Mon", nextMon],
  ];

  return (
    <div className="px-1 pb-1 pt-1">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {quick.filter(([, d]) => ok(d)).map(([l, d]) => (
          <button key={l} type="button" onClick={() => onPick(d)} className={`min-h-9 rounded-full px-3 text-xs font-medium ${value === d ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}>
            {l}
          </button>
        ))}
        {clearable && value && (
          <button type="button" onClick={() => onPick(null)} className="min-h-9 rounded-full px-3 text-xs font-medium text-warn hover:bg-warn-soft">
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => move(-1)} className="grid size-9 place-items-center rounded-full hover:bg-paper-2" aria-label="Previous month">‹</button>
        <p className="display text-base">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <button type="button" onClick={() => move(1)} className="grid size-9 place-items-center rounded-full hover:bg-paper-2" aria-label="Next month">›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={!ok(d)}
              onClick={() => onPick(d)}
              aria-pressed={d === value}
              aria-label={new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
              className={`mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm tabular-nums transition-colors disabled:opacity-30 ${
                d === value ? "bg-ink font-semibold text-paper" : d === today ? "font-semibold text-accent hover:bg-paper-2" : "hover:bg-paper-2"
              }`}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ───────────────────────── Slider & Switch

export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 5,
  label,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="range"
      className={`slider ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      style={{ "--pct": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex min-h-9 items-center gap-2 text-xs text-ink-2">
      <span className={`relative h-[22px] w-[38px] rounded-full transition-colors ${checked ? "bg-accent" : "bg-rule-strong"}`}>
        <span className={`absolute top-[2px] size-[18px] rounded-full bg-paper shadow transition-transform duration-200 ${checked ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </span>
      {label}
    </button>
  );
}

// ───────────────────────── ColorPicker

const SWATCHES = [
  "#2f6b4f", "#1baf7a", "#3d6fa3", "#2a78d6", "#6250d6", "#6f7fa8", "#4b5470", "#a65b7a",
  "#e87ba4", "#b5483b", "#e34948", "#eb6834", "#b8743a", "#c49a3c", "#eda100", "#8a7f6a",
  "#9b8a74", "#7d8b8f", "#008300", "#6b6560",
];

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Popover
      title={label}
      width={232}
      trigger={(p) => (
        <button {...p} aria-label={`${label}: ${value}`} className="grid size-11 shrink-0 place-items-center rounded-full md:size-8">
          <span className="size-6 rounded-full ring-2 ring-paper ring-offset-1 ring-offset-rule-strong" style={{ background: value }} />
        </button>
      )}
    >
      {(close) => (
        <div className="grid grid-cols-5 gap-2 p-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={c.toLowerCase() === value.toLowerCase()}
              onClick={() => (onChange(c), close())}
              className={`mx-auto size-11 rounded-full md:size-9 ${c.toLowerCase() === value.toLowerCase() ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </Popover>
  );
}

// ───────────────────────── Confirm

type ConfirmOpts = { title: string; body?: string; confirmLabel?: string; destructive?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  useEffect(() => {
    if (opts) ref.current?.showModal();
  }, [opts]);
  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    ref.current?.close();
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <dialog
          ref={ref}
          onCancel={(e) => (e.preventDefault(), done(false))}
          onClick={(e) => e.target === ref.current && done(false)}
          className="confirm-dialog m-0 mt-auto w-full max-w-none rounded-t-2xl bg-paper p-0 text-ink md:m-auto md:max-w-sm md:rounded-xl"
          aria-labelledby="confirm-title"
        >
          <div className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
            <h2 id="confirm-title" className="display text-xl">{opts.title}</h2>
            {opts.body && <p className="mt-2 text-sm text-ink-2">{opts.body}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <button type="button" className="btn btn-ghost justify-center" onClick={() => done(false)}>
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                className={`btn justify-center ${opts.destructive ? "bg-warn text-paper hover:opacity-90" : "btn-primary"}`}
                onClick={() => done(true)}
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </ConfirmCtx.Provider>
  );
}
