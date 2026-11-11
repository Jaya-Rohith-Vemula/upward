"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Project, ProjectLog, Todo } from "@/db/schema";
import {
  addProjectLog,
  addTodo,
  deleteProject,
  deleteProjectLog,
  deleteTodo,
  getProjectDetail,
  updateProject,
  updateProjectLog,
  updateTodo,
  type ProjectPatch,
} from "@/app/actions";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, SelectProp, TYPE_OPTIONS, TagsProp } from "./props";
import { TodoCheck } from "./todo-check";
import { DatePicker, Slider, Switch, useConfirm } from "./ui";

const RichEditor = dynamic(() => import("./rich-editor"), {
  ssr: false,
  loading: () => <div className="h-10 animate-pulse rounded bg-paper-2" />,
});

type Detail = { project: Project; logs: ProjectLog[]; todos: Todo[] };
type Tab = "log" | "notes" | "todos";

export function ProjectModal({
  id,
  allTags,
  today,
  onClose,
  onChange,
  onDeleted,
}: {
  id: number;
  allTags: string[];
  today: string;
  onClose: () => void;
  onChange: (patch: Partial<Project> & { logCount?: number; lastLogAt?: string | null; openTodos?: number }) => void;
  onDeleted: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("log");
  const confirm = useConfirm();

  useEffect(() => {
    ref.current?.showModal();
    // Focus the sheet itself, not the first button (avoids a stray focus ring / keyboard pop on phones).
    ref.current?.focus();
    getProjectDetail(id).then((r) => (r ? setD(r) : setMissing(true)));
  }, [id]);

  const patch = (p: ProjectPatch & Partial<Project>) => {
    if (!d) return;
    const local = { ...p } as Partial<Project>;
    if (p.status === "done") local.progress = 100;
    setD({ ...d, project: { ...d.project, ...local } });
    onChange(local);
    void updateProject(id, p);
  };

  const p = d?.project;
  const openTodos = d?.todos.filter((t) => !t.done).length ?? 0;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onClose={onClose}
      onCancel={(e) => {
        // Esc inside the editor or an open menu shouldn't close the whole project.
        const a = document.activeElement;
        if (a?.closest(".bn-editor, .bn-container") || document.querySelector("[data-popover-open]")) e.preventDefault();
      }}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="upward-dialog m-0 h-dvh outline-none max-h-none w-full max-w-none overscroll-contain bg-paper p-0 text-ink md:m-auto md:h-[min(90dvh,960px)] md:max-w-3xl md:rounded-xl md:border md:border-rule"
      aria-label={p?.title ?? "Project"}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-rule px-3 pt-[env(safe-area-inset-top)] md:px-8 md:py-3">
          <p className="eyebrow">Project</p>
          <div className="flex items-center gap-1">
            {p && (
              <button
                className="btn btn-ghost text-xs text-muted hover:text-warn"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete “${p.title}”?`,
                    body: "Its log entries and notes are deleted for good. Linked to-dos are kept.",
                    confirmLabel: "Delete project",
                    destructive: true,
                  });
                  if (!ok) return;
                  await deleteProject(id);
                  onDeleted();
                }}
              >
                Delete
              </button>
            )}
            <button className="btn btn-ghost min-h-11 min-w-11 justify-center" onClick={() => ref.current?.close()} aria-label="Close">
              <span className="md:hidden">Done</span>
              <span className="hidden md:inline">✕</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(4rem,calc(env(safe-area-inset-bottom)+2rem))] pt-5 md:px-8 md:pt-6">
          {missing && <p className="text-muted">This project no longer exists.</p>}
          {!d && !missing && <div className="h-40 animate-pulse rounded-md bg-paper-2" />}
          {d && p && (
            <>
              <TitleInput value={p.title} onCommit={(title) => patch({ title })} />

              {/* Properties */}
              <dl className="mt-5 grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1 text-sm md:grid-cols-[7.5rem_1fr] md:gap-x-4">
                <Prop label="Status">
                  <SelectProp label="Status" value={p.status} options={STATUS_OPTIONS} onChange={(status) => patch({ status })} />
                </Prop>
                <Prop label="Type">
                  <SelectProp label="Type" value={p.type} options={TYPE_OPTIONS} onChange={(type) => patch({ type })} />
                </Prop>
                <Prop label="Priority">
                  <SelectProp label="Priority" value={p.priority} options={PRIORITY_OPTIONS} onChange={(priority) => patch({ priority })} />
                </Prop>
                <Prop label="Tags">
                  <TagsProp value={p.tags} suggestions={[...new Set([...allTags, ...p.tags])]} onChange={(tags) => patch({ tags })} />
                </Prop>
                <Prop label="Target date">
                  <DatePicker
                    value={p.targetDate}
                    today={today}
                    label="Target date"
                    placeholder="Empty"
                    onChange={(targetDate) => patch({ targetDate })}
                    tone={p.targetDate && p.targetDate < today && p.status !== "done" ? "warn" : undefined}
                    className="-mx-1.5 rounded px-1.5 hover:bg-paper-2"
                  />
                </Prop>
                <Prop label="Progress">
                  <ProgressInput value={p.progress} onCommit={(progress) => patch({ progress })} />
                </Prop>
                <Prop label="Created">
                  <span className="py-1 text-muted">{new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </Prop>
              </dl>

              {/* Tabs */}
              <div role="tablist" className="mt-8 flex gap-5 border-b border-rule">
                {(
                  [
                    ["log", `Log${d.logs.length ? ` · ${d.logs.length}` : ""}`],
                    ["notes", "Notes"],
                    ["todos", `To-dos${openTodos ? ` · ${openTodos}` : ""}`],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${tab === k ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="pt-6">
                {tab === "log" && (
                  <LogTab
                    project={p}
                    logs={d.logs}
                    onAdded={(log) => {
                      setD({ ...d, logs: [log, ...d.logs], project: { ...p, progress: log.progress ?? p.progress } });
                      onChange({ logCount: d.logs.length + 1, lastLogAt: new Date(log.createdAt).toISOString(), ...(log.progress != null ? { progress: log.progress } : {}) });
                    }}
                    onUpdated={(log) => setD({ ...d, logs: d.logs.map((l) => (l.id === log.id ? log : l)) })}
                    onDeleted={(logId) => {
                      setD({ ...d, logs: d.logs.filter((l) => l.id !== logId) });
                      onChange({ logCount: d.logs.length - 1 });
                    }}
                  />
                )}
                {tab === "notes" && <NotesTab project={p} onSaved={(notes) => setD({ ...d, project: { ...p, notes } })} />}
                {tab === "todos" && (
                  <TodosTab
                    projectId={id}
                    todos={d.todos}
                    today={today}
                    setTodos={(todos) => {
                      setD({ ...d, todos });
                      onChange({ openTodos: todos.filter((t) => !t.done).length });
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="py-1 text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function TitleInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      rows={1}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ""))}
      onBlur={() => v.trim() && v !== value && onCommit(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      className="keep-size display w-full resize-none bg-transparent text-3xl leading-tight [field-sizing:content] focus:outline-none md:text-4xl"
      aria-label="Project title"
      maxLength={500}
    />
  );
}

function ProgressInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-3">
      <Slider value={v} onChange={setV} onCommit={(x) => x !== value && onCommit(x)} label="Progress" className="w-40 max-w-full flex-1 md:flex-none" />
      <span className="w-10 text-sm tabular-nums">{v}%</span>
    </div>
  );
}

// ───────── Log

function LogTab({
  project,
  logs,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  project: Project;
  logs: ProjectLog[];
  onAdded: (l: ProjectLog) => void;
  onUpdated: (l: ProjectLog) => void;
  onDeleted: (id: number) => void;
}) {
  const [doc, setDoc] = useState<{ blocks: unknown[]; md: string } | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [withProgress, setWithProgress] = useState(false);
  const [progress, setProgress] = useState(project.progress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = !doc || !doc.md.trim();

  async function save() {
    if (empty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const row = await addProjectLog(project.id, doc!.blocks, doc!.md, withProgress ? progress : null);
      onAdded(row);
      setDoc(null);
      setWithProgress(false);
      setComposerKey((k) => k + 1);
    } catch {
      setError("Couldn't save the entry. Your text is still here, so try again.");
    } finally {
      setSaving(false);
    }
  }

  // Group entries by day
  const groups = new Map<string, ProjectLog[]>();
  for (const l of logs) {
    const k = new Date(l.createdAt).toLocaleDateString("en-CA");
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }

  return (
    <div>
      <div
        className="rounded-lg border border-rule px-1 py-3 focus-within:border-rule-strong"
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), save())}
      >
        <RichEditor key={composerKey} placeholder="What happened? Decisions, blockers, what you learned… Type '/' for blocks" onChange={(blocks, md) => setDoc({ blocks, md })} />
        <div className="mt-2 flex flex-wrap items-center gap-3 px-3">
          <Switch checked={withProgress} onChange={(v) => (setWithProgress(v), setProgress(project.progress))} label="Update progress" />
          {withProgress && (
            <span className="flex items-center gap-2">
              <Slider value={progress} onChange={setProgress} label="New progress" className="w-32" />
              <span className="text-xs tabular-nums">{progress}%</span>
            </span>
          )}
          <span className="ml-auto hidden text-[11px] text-muted sm:inline">⌘↵ to save</span>
          <button className="btn btn-primary" onClick={save} disabled={empty || saving}>
            {saving ? "Saving…" : "Add entry"}
          </button>
        </div>
        {error && <p className="mt-2 px-3 text-xs text-warn">{error}</p>}
      </div>

      {logs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No entries yet. Write what you did, decided or got stuck on. Future you (and the weekly analysis) will thank you.</p>
      ) : (
        <ol className="mt-10 space-y-10">
          {[...groups.entries()].map(([day, items]) => (
            <li key={day}>
              <h3 className="display text-lg">
                {new Date(day + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </h3>
              <ul className="mt-3 space-y-5 border-l border-rule pl-4">
                {items.map((l) => (
                  <LogEntry key={l.id} log={l} onUpdated={onUpdated} onDeleted={onDeleted} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LogEntry({ log, onUpdated, onDeleted }: { log: ProjectLog; onUpdated: (l: ProjectLog) => void; onDeleted: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const [draft, setDraft] = useState<{ blocks: unknown[]; md: string } | null>(null);
  const [v, setV] = useState(0);
  const time = new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const hasDoc = Array.isArray(log.content) && log.content.length > 0;
  return (
    <li className="group">
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="tabular-nums">{time}</span>
        {log.progress != null && <span className="rounded bg-paper-2 px-1.5 py-0.5 tabular-nums">→ {log.progress}%</span>}
        <span className="ml-auto flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {editing ? (
            <>
              <button
                className="rounded px-1.5 py-0.5 font-semibold text-accent hover:bg-accent-soft"
                onClick={async () => {
                  if (draft) onUpdated(await updateProjectLog(log.id, draft.blocks, draft.md));
                  setEditing(false);
                  setV((x) => x + 1);
                }}
              >
                Save
              </button>
              <button className="rounded px-1.5 py-0.5 hover:bg-paper-2" onClick={() => (setEditing(false), setDraft(null), setV((x) => x + 1))}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="min-h-9 rounded px-2 hover:bg-paper-2 hover:text-ink" onClick={() => setEditing(true)}>Edit</button>
              <button
                className="min-h-9 rounded px-2 hover:bg-warn-soft hover:text-warn"
                onClick={async () => {
                  if (!(await confirm({ title: "Delete this entry?", body: "This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
                  await deleteProjectLog(log.id);
                  onDeleted(log.id);
                }}
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
      <div className={`mt-1 ${editing ? "-ml-7 rounded-md bg-paper-2/60 py-2" : ""}`}>
        {hasDoc ? (
          <RichEditor key={`${log.id}-${v}-${editing}`} initial={log.content} editable={editing} onChange={(blocks, md) => setDraft({ blocks, md })} />
        ) : (
          <p className="whitespace-pre-wrap text-[0.9375rem]">{log.text}</p>
        )}
      </div>
    </li>
  );
}

// ───────── Notes (autosaves)

function NotesTab({ project, onSaved }: { project: Project; onSaved: (notes: unknown) => void }) {
  const [state, setState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ blocks: unknown[]; md: string } | null>(null);

  const flush = async () => {
    if (!latest.current) return;
    const { blocks, md } = latest.current;
    latest.current = null;
    setState("saving");
    try {
      await updateProject(project.id, { notes: blocks, notesText: md });
      onSaved(blocks);
      setState("saved");
    } catch {
      setState("error");
    }
  };
  // Save on unmount (tab switch / close) if there's a pending change.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div>
      <p className="mb-3 h-4 text-right text-[11px] text-muted" aria-live="polite">
        {state === "pending" || state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? <span className="text-warn">Not saved. Check your connection.</span> : ""}
      </p>
      <div className="-ml-7">
        <RichEditor
          initial={project.notes}
          placeholder="A living page for this project: goals, plan, links, open questions. Type '/' for blocks"
          onChange={(blocks, md) => {
            latest.current = { blocks, md };
            setState("pending");
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, 800);
          }}
        />
      </div>
    </div>
  );
}

// ───────── To-dos linked to the project

function TodosTab({ projectId, todos, today, setTodos }: { projectId: number; todos: Todo[]; today: string; setTodos: (t: Todo[]) => void }) {
  const [v, setV] = useState("");
  const [due, setDue] = useState("");
  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!v.trim()) return;
          const row = await addTodo({ title: v, projectId, dueDate: due || null });
          if (row) setTodos([row, ...todos]);
          setV("");
          setDue("");
        }}
      >
        <input className="field min-w-0 flex-1 basis-48" enterKeyHint="done" placeholder="Add a to-do for this project" value={v} onChange={(e) => setV(e.target.value)} aria-label="New to-do" />
        <DatePicker value={due || null} onChange={(d) => setDue(d ?? "")} today={today} label="Due date" placeholder="Due" className="shrink-0 rounded-full bg-paper-2 px-3 text-xs" />
        <button className="btn btn-primary shrink-0" disabled={!v.trim()}>Add</button>
      </form>
      <ul className="mt-4">
        {todos.map((t) => (
          <li key={t.id} className="group flex items-center gap-3 border-b border-rule py-2.5">
            <TodoCheck
              done={t.done}
              onToggle={() => {
                setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
                void updateTodo(t.id, { done: !t.done });
              }}
            />
            <span className={`flex-1 text-[0.9375rem] ${t.done ? "text-muted line-through decoration-rule-strong" : ""}`}>{t.title}</span>
            {t.dueDate && <span className={`text-xs tabular-nums ${!t.done && t.dueDate < today ? "font-semibold text-warn" : "text-muted"}`}>{t.dueDate.slice(5)}</span>}
            <button
              className="grid min-h-9 min-w-9 place-items-center text-xs text-muted opacity-100 hover:text-warn md:opacity-0 md:group-hover:opacity-100"
              onClick={() => {
                setTodos(todos.filter((x) => x.id !== t.id));
                void deleteTodo(t.id);
              }}
              aria-label={`Delete ${t.title}`}
            >
              ✕
            </button>
          </li>
        ))}
        {todos.length === 0 && <li className="py-3 text-sm text-muted">No to-dos linked to this project. They&apos;ll also show on the To-dos page.</li>}
      </ul>
    </div>
  );
}
