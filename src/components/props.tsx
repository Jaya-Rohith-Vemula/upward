"use client";

import { useState } from "react";
import { Popover } from "./ui";

/** Notion-ish property controls: a pill that opens a small menu. */

export type Option<V extends string> = { value: V; label: string; color: string };

export function Pill({ color, children, className = "" }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-xs font-medium text-ink ${className}`}
      style={{ background: `color-mix(in oklch, ${color} 22%, var(--paper))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function SelectProp<V extends string>({ value, options, onChange, label }: { value: V; options: readonly Option<V>[]; onChange: (v: V) => void; label: string }) {
  const cur = options.find((o) => o.value === value) ?? options[0];
  return (
    <Popover
      title={label}
      width={220}
      trigger={(p) => (
        <button {...p} aria-label={`${label}: ${cur.label}`} className="-mx-1.5 min-h-9 rounded px-1.5 py-1 hover:bg-paper-2">
          <Pill color={cur.color}>{cur.label}</Pill>
        </button>
      )}
    >
      {(close) => (
        <ul role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-paper-2 focus:bg-paper-2 focus:outline-none md:min-h-0 md:py-1.5"
              >
                <Pill color={o.color}>{o.label}</Pill>
                {o.value === value && <span className="text-xs text-accent">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

const TAG_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#eb6834", "#e87ba4", "#6250d6", "#008300", "#e34948"];
export function tagColor(tag: string) {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function TagsProp({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (v: string[]) => void }) {
  return (
    <Popover
      title="Tags"
      width={272}
      trigger={(p) => (
        <button {...p} aria-label="Tags" className="-mx-1.5 flex min-h-9 flex-wrap items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-paper-2">
          {value.length ? value.map((t) => <Pill key={t} color={tagColor(t)}>{t}</Pill>) : <span className="text-sm text-muted">Empty</span>}
        </button>
      )}
    >
      {() => <TagsEditor value={value} suggestions={suggestions} onChange={onChange} />}
    </Popover>
  );
}

function TagsEditor({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase().replace(/^#/, "");
  const matches = suggestions.filter((t) => !value.includes(t) && t.includes(query)).slice(0, 8);
  const canCreate = query && !suggestions.includes(query) && !value.includes(query);
  const add = (t: string) => {
    onChange([...value, t]);
    setQ("");
  };
  return (
    <div className="p-1">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-2">
          {value.map((t) => (
            <button key={t} type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="group min-h-8">
              <Pill color={tagColor(t)}>
                {t} <span className="text-muted group-hover:text-ink">×</span>
              </Pill>
            </button>
          ))}
        </div>
      )}
      <input
        data-autofocus
        className="field text-sm"
        placeholder="Search or create a tag"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="done"
        autoCapitalize="none"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0]) add(matches[0]);
            else if (canCreate) add(query);
          } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
        }}
      />
      <ul className="mt-1 max-h-56 overflow-y-auto">
        {matches.map((t) => (
          <li key={t}>
            <button type="button" onClick={() => add(t)} className="flex min-h-11 w-full items-center rounded-md px-2 text-left hover:bg-paper-2 md:min-h-0 md:py-1.5">
              <Pill color={tagColor(t)}>{t}</Pill>
            </button>
          </li>
        ))}
        {canCreate && (
          <li>
            <button type="button" onClick={() => add(query)} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-paper-2 md:min-h-0 md:py-1.5">
              <span className="text-muted">Create</span> <Pill color={tagColor(query)}>{query}</Pill>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

export const STATUS_OPTIONS = [
  { value: "idea", label: "Idea", color: "#9a948a" },
  { value: "next", label: "Up next", color: "#eda100" },
  { value: "active", label: "In progress", color: "#2a78d6" },
  { value: "paused", label: "Paused", color: "#e87ba4" },
  { value: "done", label: "Done", color: "#1baf7a" },
  { value: "dropped", label: "Dropped", color: "#6b6560" },
] as const satisfies readonly Option<string>[];

export const TYPE_OPTIONS = [
  { value: "build", label: "Build", color: "#eb6834" },
  { value: "learn", label: "Learn", color: "#6250d6" },
] as const satisfies readonly Option<string>[];

export const PRIORITY_OPTIONS = [
  { value: "high", label: "High", color: "#e34948" },
  { value: "medium", label: "Medium", color: "#eda100" },
  { value: "low", label: "Low", color: "#9a948a" },
] as const satisfies readonly Option<string>[];
