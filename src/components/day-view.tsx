"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Category, Reflection, Settings, TimeLog } from "@/db/schema";
import { deleteLog, saveLog, saveReflection } from "@/app/actions";
import { addDays, nowMinuteExactIn, todayIn, fmtDuration, fmtHourShort, fmtHours, fmtMinute, prettyDay, weekdayName } from "@/lib/time";
import { Scale } from "./scale";
import { DatePicker, Select, useIsMobile } from "./ui";
import { createPortal } from "react-dom";

/** Pixels per minute on the calendar grid (1 hour = 72px, 15 min = 18px). */
const PPM = 1.2;

type Props = {
  day: string;
  today: string;
  nowMinute: number | null;
  settings: Settings;
  categories: Category[];
  initialLogs: TimeLog[];
  reflection: Reflection | null;
  week: { day: string; minutes: number }[];
};

type Range = { start: number; end: number };
type Draft = Pick<TimeLog, "activity" | "categoryId" | "focus" | "energy" | "notes">;
type Editing = { range: Range; log: TimeLog | null } | null;

const endOf = (l: TimeLog) => l.startMinute + l.durationMinutes;
const draftOf = (l: TimeLog): Draft => ({ activity: l.activity, categoryId: l.categoryId, focus: l.focus, energy: l.energy, notes: l.notes });
const byStart = (a: TimeLog, b: TimeLog) => a.startMinute - b.startMinute;

export function DayView({ day, today, nowMinute: initialNowMinute, settings, categories, initialLogs, reflection, week }: Props) {
  const [logs, setLogs] = useState(() => [...initialLogs].sort(byStart));
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const mobile = useIsMobile();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeCats = categories.filter((c) => !c.archived);
  const snap = settings.slotMinutes;

  // Keep the "now" line live: re-read the clock every second while viewing today.
  const [nowMinute, setNowMinute] = useState(initialNowMinute);
  const isToday = initialNowMinute != null;
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const d = new Date();
      setNowMinute(todayIn(settings.timezone, d) === day ? nowMinuteExactIn(settings.timezone, d) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [day, isToday, settings.timezone]);

  const dayStart = settings.dayStartHour * 60;
  const dayEnd = settings.dayEndHour * 60;
  // Widen the grid if something was logged outside the waking window.
  const gridStart = Math.min(dayStart, ...logs.map((l) => Math.floor(l.startMinute / 60) * 60));
  const gridEnd = Math.max(dayEnd, ...logs.map((l) => Math.ceil(endOf(l) / 60) * 60));

  const logged = logs.reduce((s, l) => s + l.durationMinutes, 0);
  const span = dayEnd - dayStart;
  const totals = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const l of logs) m.set(l.categoryId, (m.get(l.categoryId) ?? 0) + l.durationMinutes);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);

  async function commit(range: Range, input: Draft, id?: number) {
    const draft = draftOf({ ...input } as TimeLog);
    const prev = logs;
    const tempId = id ?? -Date.now();
    const optimistic: TimeLog = {
      id: tempId,
      day,
      startMinute: range.start,
      durationMinutes: range.end - range.start,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...draft,
    };
    setLogs([...logs.filter((l) => l.id !== id), optimistic].sort(byStart));
    setEditing(null);
    setError(null);
    try {
      const res = await saveLog({ id, day, startMinute: range.start, durationMinutes: range.end - range.start, ...draft });
      if (!res.ok) {
        setLogs(prev);
        setError(res.error);
        return;
      }
      setLogs((cur) => cur.map((l) => (l.id === tempId ? res.log : l)));
    } catch {
      setLogs(prev);
      setError(`Couldn't save ${fmtMinute(range.start)}–${fmtMinute(range.end)}. Check your connection.`);
    }
  }

  async function remove(id: number) {
    const prev = logs;
    setLogs(logs.filter((l) => l.id !== id));
    setEditing(null);
    try {
      await deleteLog(id);
    } catch {
      setLogs(prev);
      setError("Couldn't delete that entry.");
    }
  }

  /** First free snap-aligned range at/after now (or day start), for the "Log time" button. */
  function nextFreeRange(): Range {
    let s = nowMinute != null ? Math.floor(nowMinute / snap) * snap - snap : dayStart;
    s = Math.max(gridStart, s);
    for (; s < gridEnd; s += snap) if (!logs.some((l) => l.startMinute < s + snap && endOf(l) > s)) break;
    return { start: s, end: Math.min(gridEnd, s + Math.max(snap, 30)) };
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0">
        <header className="rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">
              {day === today ? "Today" : day < today ? "Looking back" : "Ahead"} · {prettyDay(day)}
            </p>
            <h1 className="display mt-1 text-5xl leading-none md:text-6xl">{weekdayName(day)}</h1>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Link className="btn btn-ghost" href={`/?d=${addDays(day, -1)}`} aria-label="Previous day">←</Link>
            {day !== today && <Link className="btn btn-ghost" href="/">Today</Link>}
            <Link className="btn btn-ghost" href={`/?d=${addDays(day, 1)}`} aria-label="Next day">→</Link>
            <DatePicker
              value={day}
              today={today}
              clearable={false}
              label="Jump to date"
              onChange={(d) => d && router.push(d === today ? "/" : `/?d=${d}`)}
              className="ml-1 rounded-md px-2 text-xs text-ink-2 hover:bg-paper-2"
            />
            <button className="btn btn-primary ml-2 hidden md:inline-flex" onClick={() => setEditing({ range: nextFreeRange(), log: null })}>
              + Log time
            </button>
          </div>
        </header>

        <Ribbon logs={logs} catById={catById} from={dayStart} to={dayEnd} nowMinute={nowMinute} />

        {error && (
          <p role="alert" className="mt-6 flex items-start justify-between gap-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {error}
            <button className="text-xs underline" onClick={() => setError(null)}>Dismiss</button>
          </p>
        )}

        <p className="mt-8 text-xs text-muted">
          <span className="hidden md:inline">Drag across empty time to log it. Drag a block to move it, or its bottom edge to resize. Click to edit.</span>
          <span className="md:hidden">Tap a time to log it, or press and hold, then drag to cover a range. Hold a block to move it.</span>
        </p>
        <Calendar
          logs={logs}
          catById={catById}
          gridStart={gridStart}
          gridEnd={gridEnd}
          dayStart={dayStart}
          dayEnd={dayEnd}
          snap={snap}
          nowMinute={nowMinute}
          editing={editing}
          onCreate={(range) => setEditing({ range, log: null })}
          onEdit={(log) => setEditing({ range: { start: log.startMinute, end: endOf(log) }, log })}
          onReschedule={(log, range) => commit(range, draftOf(log), log.id)}
        />
        {!editing && (
          <button
            onClick={() => setEditing({ range: nextFreeRange(), log: null })}
            aria-label="Log time"
            className="bottom-above-tabbar fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-ink text-2xl text-paper shadow-[0_10px_24px_-8px_rgb(0_0_0/0.5)] active:scale-95 md:hidden"
          >
            +
          </button>
        )}
      </section>

      <aside className={`rise rise-3 space-y-10 ${editing ? "lg:sticky lg:top-6 lg:self-start" : "lg:pt-24"}`}>
        {editing &&
          (mobile
            ? createPortal(
                <>
                  <div className="sheet-backdrop fixed inset-0 z-[45]" onClick={() => setEditing(null)} aria-hidden />
                  <div className="relative z-50">
                    <Editor
            key={`${editing.log?.id ?? "new"}-${editing.range.start}-${editing.range.end}`}
            editing={editing}
            logs={logs}
            categories={activeCats}
            gridStart={gridStart}
            gridEnd={gridEnd}
            snap={snap}
            onCancel={() => setEditing(null)}
            onSave={(range, draft) => commit(range, draft, editing.log?.id)}
            onDelete={editing.log ? () => remove(editing.log!.id) : undefined}
          />
                  </div>
                </>,
                document.body,
              )
            : <Editor
            key={`${editing.log?.id ?? "new"}-${editing.range.start}-${editing.range.end}`}
            editing={editing}
            logs={logs}
            categories={activeCats}
            gridStart={gridStart}
            gridEnd={gridEnd}
            snap={snap}
            onCancel={() => setEditing(null)}
            onSave={(range, draft) => commit(range, draft, editing.log?.id)}
            onDelete={editing.log ? () => remove(editing.log!.id) : undefined}
          />)}
        <div className={`space-y-10 ${editing ? "lg:hidden" : ""}`}>
          <div>
            <p className="eyebrow">Logged</p>
            <p className="display mt-1 text-3xl">
              {fmtHours(logged)}
              <span className="ml-1.5 font-sans text-sm text-muted">of {fmtHours(span)}</span>
            </p>
            {totals.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {totals.map(([id, min]) => {
                  const c = id != null ? catById.get(id) : undefined;
                  return (
                    <li key={String(id)} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex items-center gap-2 truncate">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: c?.color ?? "var(--muted)" }} />
                          {c?.name ?? "Uncategorized"}
                        </span>
                        <span className="tabular-nums text-muted">{fmtDuration(min)}</span>
                      </div>
                      <div className="mt-1 h-[3px] rounded-full bg-paper-2">
                        <div className="h-full rounded-full" style={{ width: `${(min / Math.max(logged, 1)) * 100}%`, background: c?.color ?? "var(--muted)" }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Drag across the calendar to log what you did. A few words is enough.</p>
            )}
          </div>
          <WeekStrip week={week} day={day} span={span} />
          <ReflectionForm day={day} initial={reflection} />
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────── Ribbon (whole day at a glance)

function Ribbon({ logs, catById, from, to, nowMinute }: { logs: TimeLog[]; catById: Map<number, Category>; from: number; to: number; nowMinute: number | null }) {
  const segs: { start: number; end: number; log?: TimeLog }[] = [];
  let cur = from;
  for (const l of logs) {
    const s = Math.max(l.startMinute, from);
    const e = Math.min(endOf(l), to);
    if (e <= s) continue;
    if (s > cur) segs.push({ start: cur, end: s });
    segs.push({ start: s, end: e, log: l });
    cur = e;
  }
  if (cur < to) segs.push({ start: cur, end: to });
  const span = to - from;
  return (
    <div className="rise rise-1 mt-8">
      <div className="relative flex h-9 w-full gap-px overflow-hidden rounded-[3px] border border-rule">
        {segs.map((s) => {
          const c = s.log?.categoryId != null ? catById.get(s.log.categoryId) : undefined;
          return (
            <div
              key={s.start}
              title={`${fmtMinute(s.start)}–${fmtMinute(s.end)} ${s.log ? `· ${c?.name ?? "Uncategorized"}${s.log.activity ? ` · ${s.log.activity}` : ""}` : "· not logged"}`}
              className={s.log ? "" : "hatch"}
              style={{ flexGrow: s.end - s.start, flexBasis: 0, background: s.log ? (c?.color ?? "var(--muted)") : undefined }}
            />
          );
        })}
        {nowMinute != null && nowMinute >= from && nowMinute <= to && (
          <span className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${((nowMinute - from) / span) * 100}%` }} aria-hidden />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
        {Array.from({ length: 5 }, (_, i) => from + Math.round((span * i) / 4)).map((m) => (
          <span key={m}>{fmtHourShort(m)}</span>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Calendar grid with drag-to-create / move / resize

type Drag = {
  mode: "create" | "move" | "resize";
  log?: TimeLog;
  anchor: number;
  offset: number;
  lo: number;
  hi: number;
  start: number;
  end: number;
  moved: boolean;
};

function Calendar(p: {
  logs: TimeLog[];
  catById: Map<number, Category>;
  gridStart: number;
  gridEnd: number;
  dayStart: number;
  dayEnd: number;
  snap: number;
  nowMinute: number | null;
  editing: Editing;
  onCreate: (r: Range) => void;
  onEdit: (l: TimeLog) => void;
  onReschedule: (l: TimeLog, r: Range) => void;
}) {
  const { logs, gridStart, gridEnd, snap } = p;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const [hover, setHover] = useState<number | null>(null);
  const height = (gridEnd - gridStart) * PPM;
  // Touch: long-press starts a drag; a quick tap creates/edits; moving early means the user is scrolling.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; tap: () => void } | null>(null);
  const clearPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // While dragging, stop the page from scrolling under the finger (needs a non-passive listener for iOS).
    const block = (e: TouchEvent) => dragRef.current && e.cancelable && e.preventDefault();
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  // Scroll so "now" (or the day start) is near the top on first load.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const focus = p.nowMinute ?? p.dayStart;
    if (focus <= gridStart + 90) return;
    const y = el.getBoundingClientRect().top + window.scrollY + (focus - gridStart - 90) * PPM;
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minuteAt = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(gridEnd, Math.max(gridStart, gridStart + (clientY - r.top) / PPM));
  };
  const floorSnap = (m: number) => Math.floor(m / snap) * snap;
  const roundSnap = (m: number) => Math.round(m / snap) * snap;

  /** Free window around [s, e) ignoring `exclude`. */
  const gap = (s: number, e: number, exclude?: number) => {
    let lo = gridStart;
    let hi = gridEnd;
    for (const l of logs) {
      if (l.id === exclude) continue;
      if (endOf(l) <= s) lo = Math.max(lo, endOf(l));
      else if (l.startMinute >= e) hi = Math.min(hi, l.startMinute);
      else return null; // overlaps
    }
    return { lo, hi };
  };

  function onGridDown(e: React.PointerEvent) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const a = floorSnap(minuteAt(e.clientY));
    const g = gap(a, a + snap);
    if (!g) return;
    const begin = () => {
      ref.current?.setPointerCapture(e.pointerId);
      setDragBoth({ mode: "create", anchor: a, offset: 0, lo: g.lo, hi: g.hi, start: a, end: Math.min(g.hi, a + snap), moved: false });
    };
    if (e.pointerType !== "touch") return begin();
    const pid = e.pointerId;
    pending.current = {
      x: e.clientX,
      y: e.clientY,
      // Tap: a 30-minute (or one-step) block where there's room.
      tap: () => p.onCreate({ start: a, end: Math.min(g.hi, a + Math.max(snap, 30)) }),
      timer: setTimeout(() => {
        pending.current = null;
        navigator.vibrate?.(8);
        try {
          ref.current?.setPointerCapture(pid);
        } catch {}
        setDragBoth({ mode: "create", anchor: a, offset: 0, lo: g.lo, hi: g.hi, start: a, end: Math.min(g.hi, a + snap), moved: false });
      }, 380),
    };
  }

  function onBlockDown(e: React.PointerEvent, log: TimeLog, mode: "move" | "resize") {
    if (e.button !== 0) return;
    e.stopPropagation();
    const g = gap(log.startMinute, endOf(log), log.id) ?? { lo: log.startMinute, hi: endOf(log) };
    const offset = minuteAt(e.clientY) - log.startMinute;
    const make = (): Drag => ({ mode, log, anchor: log.startMinute, offset, lo: g.lo, hi: g.hi, start: log.startMinute, end: endOf(log), moved: false });
    if (e.pointerType === "touch" && mode === "move") {
      const pid = e.pointerId;
      pending.current = {
        x: e.clientX,
        y: e.clientY,
        tap: () => p.onEdit(log),
        timer: setTimeout(() => {
          pending.current = null;
          navigator.vibrate?.(8);
          try {
            ref.current?.setPointerCapture(pid);
          } catch {}
          setDragBoth(make());
        }, 380),
      };
      return;
    }
    ref.current!.setPointerCapture(e.pointerId);
    setDragBoth({
      mode,
      log,
      anchor: log.startMinute,
      offset: minuteAt(e.clientY) - log.startMinute,
      lo: g.lo,
      hi: g.hi,
      start: log.startMinute,
      end: endOf(log),
      moved: false,
    });
  }

  /** Apply pointer position m to a drag, returning the updated drag. */
  function step(drag: Drag, m: number): Drag {
    let { start, end } = drag;
    if (drag.mode === "create") {
      const c = floorSnap(m);
      if (c >= drag.anchor) {
        start = drag.anchor;
        end = Math.min(drag.hi, c + snap);
      } else {
        start = Math.max(drag.lo, c);
        end = Math.min(drag.hi, drag.anchor + snap);
      }
    } else if (drag.mode === "move") {
      // Can land in any free spot, including past other blocks; otherwise stays where it last fit.
      const dur = drag.end - drag.start;
      const s = Math.min(gridEnd - dur, Math.max(gridStart, roundSnap(m - drag.offset)));
      const free = !logs.some((l) => l.id !== drag.log!.id && l.startMinute < s + dur && endOf(l) > s);
      if (free) {
        start = s;
        end = s + dur;
      }
    } else {
      end = Math.min(drag.hi, Math.max(drag.start + snap, roundSnap(m)));
    }
    return start !== drag.start || end !== drag.end ? { ...drag, start, end, moved: true } : drag;
  }

  function onMove(e: React.PointerEvent) {
    if (pending.current && Math.hypot(e.clientX - pending.current.x, e.clientY - pending.current.y) > 8) clearPending();
    const m = minuteAt(e.clientY);
    const d = dragRef.current;
    if (!d) {
      if (e.pointerType === "mouse") setHover(floorSnap(m));
      return;
    }
    const n = step(d, m);
    if (n !== d) setDragBoth(n);
  }

  function onUp(e: React.PointerEvent) {
    if (pending.current) {
      const tap = pending.current.tap;
      clearPending();
      tap();
      return;
    }
    const d0 = dragRef.current;
    if (!d0) return;
    const d = step(d0, minuteAt(e.clientY));
    const r = { start: d.start, end: d.end };
    if (d.mode === "create") p.onCreate(r);
    else if (!d.moved) p.onEdit(d.log!);
    else p.onReschedule(d.log!, r);
    setDragBoth(null);
  }

  const hours: number[] = [];
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m);
  const top = (m: number) => (m - gridStart) * PPM;

  const draft: Range | null =
    drag?.mode === "create" ? drag : p.editing && !p.editing.log ? p.editing.range : null;

  return (
    <div className="rise rise-2 mt-3 grid grid-cols-[3rem_1fr] md:grid-cols-[3.75rem_1fr]">
      {/* hour labels */}
      <div className="relative" style={{ height }}>
        {hours.map((m) => (
          <span key={m} className="absolute right-3 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: top(m) }}>
            {fmtHourShort(m)}
          </span>
        ))}
      </div>

      <div
        ref={ref}
        className="relative select-none border-l border-rule"
        style={{ height, touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", cursor: drag ? (drag.mode === "resize" ? "ns-resize" : drag.mode === "move" ? "grabbing" : "crosshair") : "crosshair" }}
        onPointerDown={onGridDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (clearPending(), setDragBoth(null))}
        onPointerLeave={() => setHover(null)}
        role="grid"
        aria-label="Day calendar"
      >
        {/* outside-window shading */}
        {p.dayStart > gridStart && <div className="pointer-events-none absolute inset-x-0 bg-paper-2/70" style={{ top: 0, height: top(p.dayStart) }} />}
        {p.dayEnd < gridEnd && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-paper-2/70" style={{ top: top(p.dayEnd) }} />}

        {/* rules */}
        {hours.map((m) => (
          <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-rule" style={{ top: top(m) }} />
        ))}
        {hours.slice(0, -1).map((m) => (
          <div key={`h${m}`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-rule/70" style={{ top: top(m + 30) }} />
        ))}

        {/* hover ghost */}
        {!drag && hover != null && !p.editing && gap(hover, hover + snap) && (
          <div className="pointer-events-none absolute inset-x-1 rounded-[4px] bg-paper-2 px-2 text-[11px] leading-[18px] text-muted" style={{ top: top(hover) + 1, height: snap * PPM - 2 }}>
            + {fmtMinute(hover)}
          </div>
        )}

        {/* blocks */}
        {logs.map((l) => {
          const c = l.categoryId != null ? p.catById.get(l.categoryId) : undefined;
          const live = drag?.log?.id === l.id ? drag : null;
          const s = live ? live.start : l.startMinute;
          const e = live ? live.end : endOf(l);
          const h = (e - s) * PPM;
          const color = c?.color ?? "#9a948a";
          const selected = p.editing?.log?.id === l.id;
          return (
            <div
              key={l.id}
              onPointerDown={(ev) => onBlockDown(ev, l, "move")}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), p.onEdit(l))}
              tabIndex={0}
              role="button"
              aria-label={`${fmtMinute(s)} to ${fmtMinute(e)}: ${l.activity || c?.name || "Uncategorized"}. Press Enter to edit.`}
              className={`group absolute inset-x-1 overflow-hidden rounded-[5px] border px-2 text-ink transition-shadow ${
                live?.moved ? "z-20 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.45)]" : "z-10"
              } ${selected ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""}`}
              style={{
                top: top(s) + 1,
                height: h - 2,
                background: `color-mix(in oklch, ${color} 26%, var(--paper))`,
                borderColor: `color-mix(in oklch, ${color} 55%, var(--paper))`,
                cursor: live?.moved ? "grabbing" : "grab",
                touchAction: "pan-y",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
              }}
            >
              <div className={`flex min-w-0 gap-2 ${h < 44 ? "items-center" : "flex-col gap-0 pt-1"}`} style={{ lineHeight: h < 44 ? `${h - 4}px` : undefined }}>
                <span className="truncate text-[13px] font-semibold">
                  <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: color }} />
                  {l.activity || c?.name || "Uncategorized"}
                </span>
                <span className="truncate text-[11px] tabular-nums text-ink-2">
                  {fmtMinute(s)}–{fmtMinute(e)} · {fmtDuration(e - s)}
                  {h >= 50 && l.activity && c ? ` · ${c.name}` : ""}
                  {h >= 50 && (l.focus != null || l.energy != null) ? ` · F${l.focus ?? "–"} E${l.energy ?? "–"}` : ""}
                </span>
              </div>
              {/* resize handle */}
              <div
                onPointerDown={(ev) => onBlockDown(ev, l, "resize")}
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize [@media(pointer:coarse)]:h-4"
                style={{ touchAction: "none" }}
                aria-hidden
              >
                <span className="mx-auto mt-[3px] block h-[2px] w-6 rounded-full bg-ink/30 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </div>
          );
        })}

        {/* draft selection */}
        {draft && (
          <div
            className="pointer-events-none absolute inset-x-1 z-20 rounded-[5px] border-2 border-dashed border-accent bg-accent-soft/80 px-2 text-accent"
            style={{ top: top(draft.start) + 1, height: (draft.end - draft.start) * PPM - 2 }}
          >
            <span className="text-[12px] font-semibold tabular-nums" style={{ lineHeight: `${Math.min(28, (draft.end - draft.start) * PPM - 6)}px` }}>
              {fmtMinute(draft.start)}–{fmtMinute(draft.end)} · {fmtDuration(draft.end - draft.start)}
            </span>
          </div>
        )}

        {/* now line */}
        {p.nowMinute != null && p.nowMinute >= gridStart && p.nowMinute <= gridEnd && (
          <div className="pointer-events-none absolute inset-x-0 z-30 h-0 border-t-2 border-warn" style={{ top: top(p.nowMinute) }}>
            <span className="absolute -left-[5px] -top-[6px] size-2.5 rounded-full bg-warn" />
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Editor panel (sidebar on desktop, bottom sheet on mobile)

function Editor({
  editing,
  logs,
  categories,
  gridStart,
  gridEnd,
  snap,
  onSave,
  onCancel,
  onDelete,
}: {
  editing: NonNullable<Editing>;
  logs: TimeLog[];
  categories: Category[];
  gridStart: number;
  gridEnd: number;
  snap: number;
  onSave: (r: Range, d: Draft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { log } = editing;
  const [range, setRange] = useState(editing.range);
  const [d, setD] = useState<Draft>({
    activity: log?.activity ?? "",
    categoryId: log?.categoryId ?? null,
    focus: log?.focus ?? null,
    energy: log?.energy ?? null,
    notes: log?.notes ?? null,
  });
  const [showNotes, setShowNotes] = useState(!!log?.notes);

  const others = logs.filter((l) => l.id !== log?.id);
  const clash = others.find((l) => l.startMinute < range.end && endOf(l) > range.start);
  const prev = [...others].filter((l) => endOf(l) <= range.start).sort((a, b) => endOf(b) - endOf(a))[0];
  const step = Math.min(snap, 15);
  const times: number[] = [];
  for (let m = gridStart; m <= gridEnd; m += step) times.push(m);
  const valid = range.end > range.start && !clash && (d.activity.trim() || d.categoryId != null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(range, d);
      }}
      className="sheet fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] space-y-5 overflow-y-auto overscroll-contain rounded-t-2xl border-t border-rule bg-paper px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-16px_40px_-20px_rgb(0_0_0/0.4)] lg:static lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none lg:[animation:rise_320ms_var(--ease-out)_both]"
    >
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{log ? "Edit entry" : "New entry"}</p>
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={onCancel}>Close</button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <TimeSelect label="Start" value={range.start} options={times.filter((t) => t < gridEnd)} onChange={(v) => setRange({ start: v, end: Math.max(range.end, v + step) })} />
        <span className="text-muted">→</span>
        <TimeSelect label="End" value={range.end} options={times.filter((t) => t > range.start)} onChange={(v) => setRange({ ...range, end: v })} />
        <span className="ml-auto text-xs tabular-nums text-muted">{fmtDuration(Math.max(0, range.end - range.start))}</span>
      </div>
      {clash && (
        <p className="text-xs text-warn">
          Overlaps {fmtMinute(clash.startMinute)}–{fmtMinute(endOf(clash))} {clash.activity && `(${clash.activity})`}
        </p>
      )}

      <div>
        <input
          autoFocus
          className="keep-size field text-lg"
          enterKeyHint="done"
          placeholder="What did you do?"
          value={d.activity}
          onChange={(e) => setD({ ...d, activity: e.target.value })}
          aria-label="Activity"
          maxLength={300}
        />
        {prev && !log && !d.activity && (
          <button
            type="button"
            className="mt-2 text-xs text-accent hover:underline"
            onClick={() => setD({ activity: prev.activity, categoryId: prev.categoryId, focus: prev.focus, energy: prev.energy, notes: null })}
          >
            ↑ Same as before: {prev.activity || "previous entry"}
          </button>
        )}
      </div>

      <fieldset>
        <legend className="eyebrow mb-2">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = d.categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setD({ ...d, categoryId: on ? null : c.id })}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on ? "border-transparent text-paper" : "border-rule-strong text-ink-2 hover:border-ink-2"
                }`}
                style={on ? { background: c.color } : undefined}
              >
                {!on && <span className="size-1.5 rounded-full" style={{ background: c.color }} />}
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Scale label="Focus" value={d.focus} onChange={(v) => setD({ ...d, focus: v })} />
        <Scale label="Energy" value={d.energy} onChange={(v) => setD({ ...d, energy: v })} />
      </div>

      {showNotes ? (
        <textarea
          className="field text-sm"
          placeholder="Notes: what helped, what got in the way…"
          value={d.notes ?? ""}
          onChange={(e) => setD({ ...d, notes: e.target.value })}
          rows={2}
        />
      ) : (
        <button type="button" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setShowNotes(true)}>
          + Add a note
        </button>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={!valid}>Save</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        {onDelete && (
          <button type="button" className="btn btn-ghost ml-auto text-warn hover:bg-warn-soft hover:text-warn" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function TimeSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  const opts = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <Select
      label={label}
      value={value}
      width={160}
      onChange={onChange}
      options={opts.map((m) => ({ value: m, label: m >= 1440 ? "12:00 AM (midnight)" : fmtMinute(m) }))}
      className="rounded-md border border-rule-strong px-2.5 tabular-nums hover:border-ink-2"
    />
  );
}

// ───────────────────────── Side widgets

function WeekStrip({ week, day, span }: { week: { day: string; minutes: number }[]; day: string; span: number }) {
  return (
    <div>
      <p className="eyebrow">Last 7 days</p>
      <div className="mt-3 flex items-end gap-1.5" style={{ height: 56 }}>
        {week.map((w) => (
          <Link key={w.day} href={`/?d=${w.day}`} title={`${w.day}: ${fmtHours(w.minutes)} logged`} className="group flex flex-1 flex-col items-center gap-1">
            <span className="flex h-10 w-full items-end overflow-hidden rounded-[2px] bg-paper-2">
              <span
                className={`w-full transition-colors ${w.day === day ? "bg-accent" : "bg-rule-strong group-hover:bg-ink-2"}`}
                style={{ height: `${Math.min(100, (w.minutes / Math.max(span, 1)) * 100)}%` }}
              />
            </span>
            <span className={`text-[10px] ${w.day === day ? "font-semibold text-ink" : "text-muted"}`}>{weekdayName(w.day, "short").slice(0, 2)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReflectionForm({ day, initial }: { day: string; initial: Reflection | null }) {
  const [r, setR] = useState({
    mood: initial?.mood ?? null,
    wins: initial?.wins ?? "",
    blockers: initial?.blockers ?? "",
    tomorrow: initial?.tomorrow ?? "",
  });
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const dirty =
    r.mood !== (initial?.mood ?? null) || r.wins !== (initial?.wins ?? "") || r.blockers !== (initial?.blockers ?? "") || r.tomorrow !== (initial?.tomorrow ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveReflection({ day, ...r });
            setState("saved");
          } catch {
            setState("error");
          }
        });
      }}
      className="space-y-4"
    >
      <p className="eyebrow">End of day</p>
      <Scale label="Mood" value={r.mood} onChange={(v) => (setR({ ...r, mood: v }), setState("idle"))} />
      {(
        [
          ["wins", "What went well?"],
          ["blockers", "What got in the way?"],
          ["tomorrow", "One thing for tomorrow"],
        ] as const
      ).map(([k, ph]) => (
        <textarea
          key={k}
          className="field text-sm"
          rows={1}
          placeholder={ph}
          aria-label={ph}
          value={r[k]}
          onChange={(e) => (setR({ ...r, [k]: e.target.value }), setState("idle"))}
        />
      ))}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending || (!dirty && state !== "error")}>
          {pending ? "Saving…" : "Save reflection"}
        </button>
        {state === "saved" && !dirty && <span className="text-xs text-accent">Saved</span>}
        {state === "error" && <span className="text-xs text-warn">Didn&apos;t save. Try again.</span>}
      </div>
    </form>
  );
}
