"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectCard } from "@/lib/data";
import { createProject, updateProject } from "@/app/actions";
import { Pill, STATUS_OPTIONS, TYPE_OPTIONS, tagColor } from "./props";
import { ProjectModal } from "./project-modal";

type Status = ProjectCard["status"];
const COLUMNS: { status: Status; label: string; hint: string }[] = [
  { status: "idea", label: "Ideas", hint: "Anything you might build or learn." },
  { status: "next", label: "Up next", hint: "Drag here what's worth starting soon." },
  { status: "active", label: "In progress", hint: "Keep this short. Two or three at most." },
  { status: "paused", label: "Paused", hint: "Parked on purpose." },
  { status: "done", label: "Done", hint: "Shipped or learned." },
];
const STATUS_COLOR = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.color])) as Record<Status, string>;

const cid = (id: number) => `p-${id}`;
const pid = (s: string | number) => Number(String(s).slice(2));

export function ProjectsBoard({ initial, today }: { initial: ProjectCard[]; today: string }) {
  const [cards, setCards] = useState(initial);
  useEffect(() => setCards(initial), [initial]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "build" | "learn">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [fromStatus, setFromStatus] = useState<Status | null>(null);
  const [showDropped, setShowDropped] = useState(false);

  // Deep link: /projects?p=12
  useEffect(() => {
    const p = Number(new URLSearchParams(window.location.search).get("p"));
    if (p) setOpenId(p);
  }, []);
  const open = (id: number | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("p", String(id));
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url);
  };

  const allTags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort(), [cards]);
  const visible = (c: ProjectCard) => (typeFilter === "all" || c.type === typeFilter) && (!tagFilter || c.tags.includes(tagFilter));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const statusOfOver = (overId: string | number): Status | null => {
    const s = String(overId);
    if (s.startsWith("col-")) return s.slice(4) as Status;
    return cards.find((c) => c.id === pid(s))?.status ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    const id = pid(e.active.id);
    setActiveId(id);
    setFromStatus(cards.find((c) => c.id === id)?.status ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    if (!e.over) return;
    const id = pid(e.active.id);
    const target = statusOfOver(e.over.id);
    const card = cards.find((c) => c.id === id);
    if (!card || !target || card.status === target) return;
    setCards((cs) => {
      const without = cs.filter((c) => c.id !== id);
      const moved = { ...card, status: target };
      const overIdx = String(e.over!.id).startsWith("p-") ? without.findIndex((c) => c.id === pid(e.over!.id)) : -1;
      if (overIdx >= 0) without.splice(overIdx, 0, moved);
      else without.push(moved);
      return without;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const id = pid(e.active.id);
    setActiveId(null);
    let next = cards;
    if (e.over && String(e.over.id).startsWith("p-") && pid(e.over.id) !== id) {
      const a = cards.findIndex((c) => c.id === id);
      const b = cards.findIndex((c) => c.id === pid(e.over!.id));
      if (a >= 0 && b >= 0 && cards[a].status === cards[b].status) next = arrayMove(cards, a, b);
    }
    const card = next.find((c) => c.id === id);
    if (!card) return;
    // Fractional sort between neighbours in the column.
    const col = next.filter((c) => c.status === card.status);
    const i = col.findIndex((c) => c.id === id);
    const before = col[i - 1]?.sort;
    const after = col[i + 1]?.sort;
    const sort = before == null && after == null ? 0 : before == null ? after! - 1 : after == null ? before + 1 : (before + after) / 2;
    const statusChanged = card.status !== fromStatus;
    if (!statusChanged && sort === card.sort) return;
    setCards(next.map((c) => (c.id === id ? { ...c, sort, ...(card.status === "done" ? { progress: 100 } : {}) } : c)));
    void updateProject(id, { sort, ...(statusChanged ? { status: card.status } : {}) });
  }

  const active = activeId != null ? cards.find((c) => c.id === activeId) : null;
  const dropped = cards.filter((c) => c.status === "dropped");

  return (
    <div>
      <header className="rise flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">What you&apos;re building &amp; learning</p>
          <h1 className="display mt-1 text-5xl leading-none">Projects</h1>
        </div>
        <QuickAdd
          placeholder="New idea… (#tag !high)"
          onAdd={async (t) => {
            const row = await createProject(t, "idea", typeFilter === "learn" ? "learn" : "build");
            if (row) setCards((cs) => [{ ...row, logCount: 0, lastLogAt: null, openTodos: 0 }, ...cs]);
          }}
          className="w-full max-w-sm"
        />
      </header>

      <div className="rise rise-1 mt-6 flex flex-wrap items-center gap-1.5 text-xs">
        {(["all", "build", "learn"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            aria-pressed={typeFilter === t}
            className={`min-h-9 rounded-full px-3 ${typeFilter === t ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}
          >
            {t === "all" ? "All" : t === "build" ? "Build" : "Learn"}
          </button>
        ))}
        {allTags.length > 0 && <span className="mx-1 h-4 w-px bg-rule-strong" />}
        {allTags.map((t) => (
          <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} aria-pressed={tagFilter === t} className={`min-h-9 rounded-full ${tagFilter === t ? "ring-2 ring-ink" : ""}`}>
            <Pill color={tagColor(t)}>{t}</Pill>
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setCards(initial))}>
        <div className="rise rise-2 -mx-4 mt-8 flex snap-x gap-5 overflow-x-auto px-4 pb-6 md:mx-0 md:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.status === col.status && visible(c));
            return (
              <Column key={col.status} col={col} items={items} today={today} onOpen={open} onAdd={async (t) => {
                const row = await createProject(t, col.status, typeFilter === "learn" ? "learn" : "build");
                if (row) setCards((cs) => [{ ...row, logCount: 0, lastLogAt: null, openTodos: 0 }, ...cs]);
              }} />
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {active ? <CardBody card={active} today={today} lifted /> : null}
        </DragOverlay>
      </DndContext>

      {dropped.length > 0 && (
        <div className="mt-6">
          <button className="text-xs text-muted hover:text-ink" onClick={() => setShowDropped(!showDropped)}>
            {showDropped ? "Hide" : "Show"} dropped ({dropped.length})
          </button>
          {showDropped && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {dropped.map((c) => (
                <li key={c.id}>
                  <button onClick={() => open(c.id)} className="rounded-md border border-rule px-2.5 py-1.5 text-sm text-ink-2 line-through decoration-rule-strong hover:border-ink-2">
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openId != null && (
        <ProjectModal
          id={openId}
          allTags={allTags}
          today={today}
          onClose={() => open(null)}
          onChange={(patch) => setCards((cs) => cs.map((c) => (c.id === openId ? { ...c, ...patch } : c)))}
          onDeleted={() => {
            setCards((cs) => cs.filter((c) => c.id !== openId));
            open(null);
          }}
        />
      )}
    </div>
  );
}

function Column({ col, items, today, onOpen, onAdd }: { col: (typeof COLUMNS)[number]; items: ProjectCard[]; today: string; onOpen: (id: number) => void; onAdd: (t: string) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.status}` });
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex w-[80vw] max-w-[320px] shrink-0 snap-start scroll-ml-4 flex-col sm:w-72 xl:w-auto xl:max-w-none">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="display flex items-center gap-2 text-xl">
          <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[col.status] }} />
          {col.label}
        </h2>
        <span className="text-xs tabular-nums text-muted">{items.length}</span>
      </div>
      <SortableContext id={col.status} items={items.map((c) => cid(c.id))} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`mt-3 flex min-h-24 flex-1 flex-col gap-2 rounded-md transition-colors ${isOver ? "bg-paper-2" : ""}`}>
          {items.map((c) => (
            <SortableCard key={c.id} card={c} today={today} onOpen={onOpen} />
          ))}
          {items.length === 0 && <li className="px-1 py-3 text-xs text-muted">{col.hint}</li>}
        </ul>
      </SortableContext>
      {col.status !== "done" &&
        (adding ? (
          <QuickAdd autoFocus placeholder="Title, then Enter" onAdd={onAdd} onBlurEmpty={() => setAdding(false)} className="mt-2" />
        ) : (
          <button onClick={() => setAdding(true)} className="mt-2 min-h-11 rounded-md px-1 text-left md:min-h-0 md:py-1.5 text-sm text-muted hover:bg-paper-2 hover:text-ink">
            + New
          </button>
        ))}
    </section>
  );
}

function SortableCard({ card, today, onOpen }: { card: ProjectCard; today: string; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cid(card.id) });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`select-none [-webkit-touch-callout:none] ${isDragging ? "opacity-30" : ""}`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen(card.id);
      }}
      aria-label={`${card.title}. Press Enter to open, Space to pick up and move.`}
    >
      <CardBody card={card} today={today} />
    </li>
  );
}

function CardBody({ card, today, lifted }: { card: ProjectCard; today: string; lifted?: boolean }) {
  const type = TYPE_OPTIONS.find((t) => t.value === card.type)!;
  const overdue = card.targetDate && card.targetDate < today && card.status !== "done";
  const lastLog = card.lastLogAt ? card.lastLogAt.slice(0, 10) : null;
  return (
    <div
      className={`cursor-grab rounded-md border border-rule bg-paper px-3 py-2.5 transition-[border-color,box-shadow] hover:border-rule-strong ${
        lifted ? "rotate-[1.5deg] cursor-grabbing shadow-[0_14px_32px_-14px_rgb(0_0_0/0.45)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.9375rem] font-medium leading-snug">{card.title}</p>
        {card.priority === "high" && <span className="text-xs font-bold text-warn" title="High priority">!!</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Pill color={type.color}>{type.label}</Pill>
        {card.tags.slice(0, 3).map((t) => (
          <Pill key={t} color={tagColor(t)}>{t}</Pill>
        ))}
      </div>
      {(card.progress > 0 || card.status === "active") && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-[3px] flex-1 rounded-full bg-paper-2">
            <div className="h-full rounded-full bg-ink" style={{ width: `${card.progress}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted">{card.progress}%</span>
        </div>
      )}
      {(card.logCount > 0 || card.openTodos > 0 || card.targetDate) && (
        <p className="mt-2 flex flex-wrap gap-x-2.5 text-[11px] text-muted">
          {card.logCount > 0 && <span title={`Last entry ${lastLog}`}>{card.logCount} log{card.logCount === 1 ? "" : "s"}{lastLog === today ? " · today" : ""}</span>}
          {card.openTodos > 0 && <span>{card.openTodos} to-do{card.openTodos === 1 ? "" : "s"}</span>}
          {card.targetDate && <span className={overdue ? "font-semibold text-warn" : ""}>{overdue ? "overdue " : "→ "}{card.targetDate.slice(5)}</span>}
        </p>
      )}
    </div>
  );
}

function QuickAdd({ placeholder, onAdd, className = "", autoFocus, onBlurEmpty }: { placeholder: string; onAdd: (t: string) => Promise<void>; className?: string; autoFocus?: boolean; onBlurEmpty?: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const t = v.trim();
        if (!t || busy) return;
        setBusy(true);
        await onAdd(t);
        setV("");
        setBusy(false);
      }}
    >
      <input
        autoFocus={autoFocus}
        className="field text-sm"
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !v.trim() && onBlurEmpty?.()}
        onKeyDown={(e) => e.key === "Escape" && onBlurEmpty?.()}
        aria-label={placeholder}
        maxLength={500}
        disabled={busy}
      />
    </form>
  );
}
