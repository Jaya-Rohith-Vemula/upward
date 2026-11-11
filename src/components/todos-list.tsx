"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Todo } from "@/db/schema";
import { addTodo, deleteTodo, updateTodo } from "@/app/actions";
import { addDays, prettyDay, weekdayName } from "@/lib/time";
import { TodoCheck } from "./todo-check";
import { DatePicker, Select } from "./ui";

type ProjectOpt = { id: number; title: string; status: string };

export function TodosList({ initial, projects, today }: { initial: Todo[]; projects: ProjectOpt[]; today: string }) {
  const [todos, setTodos] = useState(initial);
  useEffect(() => setTodos(initial), [initial]);
  const [showDone, setShowDone] = useState(false);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const patch = (id: number, p: Parameters<typeof updateTodo>[1]) => {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...p, ...(p.done !== undefined ? { doneAt: p.done ? new Date() : null } : {}) } : t)));
    void updateTodo(id, p);
  };
  const remove = (id: number) => {
    setTodos((ts) => ts.filter((t) => t.id !== id));
    void deleteTodo(id);
  };

  const shown = todos.filter((t) => projectFilter == null || t.projectId === projectFilter);
  const open = shown.filter((t) => !t.done);
  const pr = { high: 0, medium: 1, low: 2 } as const;
  const byPri = (a: Todo, b: Todo) => pr[a.priority] - pr[b.priority] || a.sort - b.sort;
  const groups: { key: string; label: string; items: Todo[]; tone?: "warn" }[] = [
    { key: "overdue", label: "Overdue", items: open.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)), tone: "warn" },
    { key: "today", label: "Today", items: open.filter((t) => t.dueDate === today).sort(byPri) },
    { key: "upcoming", label: "Upcoming", items: open.filter((t) => t.dueDate && t.dueDate > today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byPri(a, b)) },
    { key: "someday", label: "No date", items: open.filter((t) => !t.dueDate).sort(byPri) },
  ];
  const done = shown.filter((t) => t.done).sort((a, b) => +new Date(b.doneAt ?? 0) - +new Date(a.doneAt ?? 0));
  const doneToday = todos.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toLocaleDateString("en-CA") === today).length;
  const linkedProjects = projects.filter((p) => todos.some((t) => t.projectId === p.id));

  return (
    <div className="max-w-3xl">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {open.length} open · {doneToday} done today
          </p>
          <h1 className="display mt-1 text-5xl leading-none">To-dos</h1>
        </div>
      </header>

      <Composer
        projects={projects}
        today={today}
        defaultProject={projectFilter}
        onAdd={(row) => setTodos((ts) => [row, ...ts])}
      />

      {linkedProjects.length > 0 && (
        <div className="rise rise-1 mt-6 flex flex-wrap gap-1.5 text-xs">
          <button onClick={() => setProjectFilter(null)} aria-pressed={projectFilter == null} className={`min-h-9 rounded-full px-3 ${projectFilter == null ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}>
            All
          </button>
          {linkedProjects.map((p) => (
            <button key={p.id} onClick={() => setProjectFilter(projectFilter === p.id ? null : p.id)} aria-pressed={projectFilter === p.id} className={`min-h-9 rounded-full px-3 ${projectFilter === p.id ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}>
              {p.title}
            </button>
          ))}
        </div>
      )}

      <div className="rise rise-2 mt-8 space-y-10">
        {groups.every((g) => g.items.length === 0) && (
          <p className="text-ink-2">
            Nothing open. Add a to-do above. Use <code className="text-xs">!high</code> for priority, and link it to a project to see it there too.
          </p>
        )}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key}>
              <div className="flex items-baseline justify-between border-b border-ink pb-2">
                <h2 className={`display text-xl ${g.tone === "warn" ? "text-warn" : ""}`}>{g.label}</h2>
                <span className="text-xs tabular-nums text-muted">{g.items.length}</span>
              </div>
              <ul>
                {g.items.map((t) => (
                  <TodoRow key={t.id} todo={t} today={today} projects={projects} project={t.projectId != null ? projectById.get(t.projectId) : undefined} onPatch={patch} onRemove={remove} />
                ))}
              </ul>
            </section>
          ))}

        {done.length > 0 && (
          <section>
            <button className="text-xs text-muted hover:text-ink" onClick={() => setShowDone(!showDone)}>
              {showDone ? "Hide" : "Show"} completed ({done.length})
            </button>
            {showDone && (
              <ul className="mt-2">
                {done.slice(0, 50).map((t) => (
                  <TodoRow key={t.id} todo={t} today={today} projects={projects} project={t.projectId != null ? projectById.get(t.projectId) : undefined} onPatch={patch} onRemove={remove} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Composer({ projects, today, defaultProject, onAdd }: { projects: ProjectOpt[]; today: string; defaultProject: number | null; onAdd: (t: Todo) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>("");
  const [projectId, setProjectId] = useState<number | null>(defaultProject);
  useEffect(() => setProjectId(defaultProject), [defaultProject]);
  const [busy, setBusy] = useState(false);
  const chip = (label: string, value: string) => (
    <button type="button" onClick={() => setDue(due === value ? "" : value)} aria-pressed={due === value} className={`min-h-9 rounded-full px-3 ${due === value ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}>
      {label}
    </button>
  );
  return (
    <form
      className="rise rise-1 mt-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        setBusy(true);
        const row = await addTodo({ title, dueDate: due || null, projectId });
        if (row) onAdd(row);
        setTitle("");
        setBusy(false);
      }}
    >
      <div className="flex items-center gap-3">
        <input className="keep-size field text-xl" enterKeyHint="done" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New to-do" maxLength={500} />
        <button className="btn btn-primary shrink-0" disabled={!title.trim() || busy}>Add</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {chip("Today", today)}
        {chip("Tomorrow", addDays(today, 1))}
        <DatePicker value={due || null} onChange={(d) => setDue(d ?? "")} today={today} label="Due date" placeholder="Pick date" className={`rounded-full px-3 ${due && due !== today && due !== addDays(today, 1) ? "bg-ink text-paper" : "bg-paper-2 text-ink-2"}`} />
        <Select
          label="Project"
          value={projectId}
          onChange={setProjectId}
          options={[{ value: null, label: "No project" }, ...projects.filter((p) => p.status !== "done" && p.status !== "dropped").map((p) => ({ value: p.id as number | null, label: p.title }))]}
          className={`max-w-56 rounded-full px-3 ${projectId != null ? "bg-ink text-paper" : "bg-paper-2 text-ink-2"}`}
          renderValue={(o) => <span className="truncate">{o && o.value != null ? `↳ ${o.label}` : "Project"}</span>}
        />
      </div>
    </form>
  );
}

function TodoRow({
  todo: t,
  today,
  projects,
  project,
  onPatch,
  onRemove,
}: {
  todo: Todo;
  today: string;
  projects: ProjectOpt[];
  project?: ProjectOpt;
  onPatch: (id: number, p: Parameters<typeof updateTodo>[1]) => void;
  onRemove: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [more, setMore] = useState(false);
  const overdue = !t.done && t.dueDate && t.dueDate < today;
  const dueLabel = !t.dueDate ? null : t.dueDate === today ? "Today" : t.dueDate === addDays(today, 1) ? "Tomorrow" : t.dueDate > today && t.dueDate <= addDays(today, 6) ? weekdayName(t.dueDate) : prettyDay(t.dueDate);

  return (
    <li className="group border-b border-rule py-2.5">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <TodoCheck big done={t.done} onToggle={() => onPatch(t.id, { done: !t.done })} label={`${t.done ? "Reopen" : "Complete"} ${t.title}`} />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              className="field py-0 text-[0.9375rem]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => (setEditing(false), title.trim() && title !== t.title && onPatch(t.id, { title: title.trim() }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") (setTitle(t.title), setEditing(false));
              }}
            />
          ) : (
            <button onClick={() => setEditing(true)} className={`text-left text-[0.9375rem] leading-snug ${t.done ? "text-muted line-through decoration-rule-strong" : ""}`}>
              {t.priority === "high" && !t.done && <span className="mr-1.5 text-xs font-bold text-warn">!!</span>}
              {t.title}
            </button>
          )}
          {(dueLabel || project) && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
              {dueLabel && <span className={overdue ? "font-semibold text-warn" : "text-muted"}>{dueLabel}</span>}
              {project && (
                <Link href={`/projects?p=${project.id}`} className="text-muted hover:text-ink">
                  ↳ {project.title}
                </Link>
              )}
            </p>
          )}
          {more && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <DatePicker value={t.dueDate} onChange={(d) => onPatch(t.id, { dueDate: d })} today={today} label="Due date" placeholder="No date" className="rounded-full bg-paper-2 px-3" />
              <Select
                label="Priority"
                value={t.priority}
                onChange={(v) => onPatch(t.id, { priority: v })}
                width={180}
                options={[
                  { value: "high", label: "High", color: "#e34948" },
                  { value: "medium", label: "Medium", color: "#eda100" },
                  { value: "low", label: "Low", color: "#9a948a" },
                ]}
                className="rounded-full bg-paper-2 px-3"
              />
              <Select
                label="Project"
                value={t.projectId}
                onChange={(v) => onPatch(t.id, { projectId: v })}
                options={[{ value: null, label: "No project" }, ...projects.map((p) => ({ value: p.id as number | null, label: p.title }))]}
                className="max-w-56 rounded-full bg-paper-2 px-3"
              />
              <button className="ml-auto min-h-9 rounded px-3 text-warn hover:bg-warn-soft" onClick={() => onRemove(t.id)}>Delete</button>
            </div>
          )}
        </div>
        <button
          onClick={() => setMore(!more)}
          aria-expanded={more}
          aria-label="More options"
          className={`grid min-h-9 min-w-9 place-items-center rounded text-muted transition-opacity hover:bg-paper-2 hover:text-ink ${more ? "" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}
        >
          ⋯
        </button>
      </div>
    </li>
  );
}
