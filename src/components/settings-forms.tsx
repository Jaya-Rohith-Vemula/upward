"use client";

import { useEffect, useState, useTransition } from "react";
import type { Category, Settings } from "@/db/schema";
import { saveSettings, upsertCategory } from "@/app/actions";
import { ColorPicker, Select } from "./ui";

const SLOT_OPTIONS = [15, 30, 60];
const KINDS = [
  { value: "productive", hint: "Moves you forward" },
  { value: "neutral", hint: "Necessary upkeep" },
  { value: "rest", hint: "Recovery, people, sleep" },
  { value: "drain", hint: "Time you'd take back" },
] as const;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [browserTz, setBrowserTz] = useState<string | null>(null);
  useEffect(() => setBrowserTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <form
      className="rise rise-1 mt-10 space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveSettings(s);
            setMsg("Saved");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Couldn't save");
          }
        });
      }}
    >
      <fieldset>
        <legend className="display text-2xl">Grid snap</legend>
        <p className="mt-1 text-sm text-muted">Drag on the Day calendar snaps to this step. Blocks can be any multiple of it.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SLOT_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={s.slotMinutes === m}
              onClick={() => setS({ ...s, slotMinutes: m })}
              className={`min-h-11 rounded-full px-4 text-sm transition-colors md:min-h-9 ${s.slotMinutes === m ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}
            >
              {m < 60 ? `${m} min` : m === 60 ? "1 hour" : `${m / 60} hours`}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="display text-2xl">Waking window</legend>
        <p className="mt-1 text-sm text-muted">Only these hours show as slots and count toward coverage.</p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <Select
            label="Day starts"
            value={s.dayStartHour}
            width={170}
            onChange={(v) => setS({ ...s, dayStartHour: v })}
            options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, "0")}:00` }))}
            className="rounded-md border border-rule-strong px-3 tabular-nums"
          />
          <span className="text-muted">to</span>
          <Select
            label="Day ends"
            value={s.dayEndHour}
            width={190}
            onChange={(v) => setS({ ...s, dayEndHour: v })}
            options={Array.from({ length: 24 }, (_, i) => i + 1).map((h) => ({ value: h, label: h === 24 ? "24:00 (midnight)" : `${String(h).padStart(2, "0")}:00` }))}
            className="rounded-md border border-rule-strong px-3 tabular-nums"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="display text-2xl">Timezone</legend>
        <p className="mt-1 text-sm text-muted">Decides what &ldquo;today&rdquo; and &ldquo;now&rdquo; mean.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input className="field w-64 max-w-full" autoCapitalize="none" autoCorrect="off" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} aria-label="Timezone" />
          {browserTz && browserTz !== s.timezone && (
            <button type="button" className="btn btn-ghost text-accent" onClick={() => setS({ ...s, timezone: browserTz })}>
              Use {browserTz}
            </button>
          )}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-accent" : "text-warn"}`}>{msg}</span>}
      </div>
    </form>
  );
}

export function CategoryEditor({ categories }: { categories: Category[] }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState({ name: "", color: "#6b8f71", kind: "productive" as Category["kind"] });

  return (
    <section className="rise rise-2 mt-16">
      <h2 className="display text-2xl">Categories</h2>
      <p className="mt-1 text-sm text-muted">The kind decides how time is scored in Insights.</p>
      <ul className="mt-4 border-t border-rule">
        {categories.map((c) => (
          <CategoryRow key={c.id} c={c} />
        ))}
      </ul>
      <form
        className="mt-6 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;
          start(async () => {
            await upsertCategory(draft);
            setDraft({ ...draft, name: "" });
          });
        }}
      >
        <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} label="Color" />
        <input className="field w-40 min-w-0 flex-1" placeholder="New category" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} />
        <KindSelect value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
        <button className="btn btn-primary" disabled={pending || !draft.name.trim()}>Add</button>
      </form>
    </section>
  );
}

function CategoryRow({ c }: { c: Category }) {
  const [v, setV] = useState(c);
  const [pending, start] = useTransition();
  const dirty = v.name !== c.name || v.color !== c.color || v.kind !== c.kind;
  const save = (next = v) => start(() => upsertCategory(next));
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-2 ${c.archived ? "opacity-50" : ""}`}>
      <ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} label={`${c.name} color`} />
      <input className="field w-40 min-w-0 flex-1 text-sm" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Name" maxLength={60} />
      <KindSelect value={v.kind} onChange={(kind) => setV({ ...v, kind })} />
      {dirty && <button className="btn btn-primary" disabled={pending} onClick={() => save()}>Save</button>}
      <button className="btn btn-ghost text-xs" disabled={pending} onClick={() => { const n = { ...v, archived: !c.archived }; setV(n); save(n); }}>
        {c.archived ? "Restore" : "Archive"}
      </button>
    </li>
  );
}

function KindSelect({ value, onChange }: { value: Category["kind"]; onChange: (k: Category["kind"]) => void }) {
  return (
    <Select
      label="Kind"
      value={value}
      onChange={onChange}
      width={230}
      options={KINDS.map((k) => ({ value: k.value, label: k.value[0].toUpperCase() + k.value.slice(1), hint: k.hint, color: `var(--k-${k.value})` }))}
      className="rounded-full bg-paper-2 px-3 text-sm"
    />
  );
}
