"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtHours } from "@/lib/time";

const KIND_ORDER = ["productive", "neutral", "rest", "drain", "uncategorized"] as const;
type KindKey = (typeof KIND_ORDER)[number];
const KIND_LABEL: Record<KindKey, string> = { productive: "Productive", neutral: "Neutral", rest: "Rest", drain: "Drain", uncategorized: "Uncategorized" };
const kindFill = (k: KindKey) => (k === "uncategorized" ? "var(--rule-strong)" : `var(--k-${k})`);

export function KindLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {KIND_ORDER.slice(0, 4).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: kindFill(k) }} />
          {KIND_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}

type Column = {
  key: string;
  label: string;
  title: string;
  kinds: Record<KindKey, number>;
  extra?: [string, string | number][];
  foot?: string;
  href?: string;
};

/** Stacked columns (productive at the baseline), 2px gaps, per-column hover tooltip. */
export function StackedColumns({ columns, unit }: { columns: Column[]; unit: "day" | "hour" }) {
  const [hover, setHover] = useState<string | null>(null);
  const totals = columns.map((c) => KIND_ORDER.reduce((s, k) => s + c.kinds[k], 0));
  const max = Math.max(60, ...totals);
  // round axis max up to whole hours
  const axisMax = Math.ceil(max / 60) * 60;
  const H = 180;
  const showEvery = columns.length > 31 ? Math.ceil(columns.length / 15) : 1;

  return (
    <div className="relative mt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between text-[10px] tabular-nums text-muted" style={{ height: H }}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="flex items-center gap-2">
            <span className="w-7 text-right">{fmtHours(Math.round(axisMax * f))}</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        ))}
      </div>
      <div className="ml-9 flex items-end gap-[2px] md:gap-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {columns.map((c, i) => {
          const total = totals[i];
          const inner = (
            <div className="flex h-full w-full flex-col-reverse gap-[2px]">
              {KIND_ORDER.map((k) =>
                c.kinds[k] > 0 ? (
                  <span
                    key={k}
                    className="block w-full first:rounded-b-none last:rounded-t-[3px]"
                    style={{ height: `${(c.kinds[k] / axisMax) * 100}%`, background: kindFill(k) }}
                  />
                ) : null,
              )}
            </div>
          );
          const common = {
            className: `relative flex h-full min-w-0 flex-1 items-end transition-opacity ${hover && hover !== c.key ? "opacity-45" : ""}`,
            onMouseEnter: () => setHover(c.key),
            onFocus: () => setHover(c.key),
            onBlur: () => setHover(null),
            "aria-label": `${c.title}: ${fmtHours(total)}`,
          };
          return c.href ? (
            <Link key={c.key} href={c.href} {...common}>{inner}</Link>
          ) : (
            <div key={c.key} tabIndex={0} {...common}>{inner}</div>
          );
        })}
      </div>
      <div className="ml-9 mt-1.5 flex gap-[2px] md:gap-1">
        {columns.map((c, i) => (
          <div key={c.key} className="min-w-0 flex-1 text-center">
            <div className={`truncate text-[10px] ${hover === c.key ? "font-semibold text-ink" : "text-muted"}`}>{i % showEvery === 0 ? c.label : ""}</div>
            {unit === "hour" && <div className="text-[10px] tabular-nums text-ink-2">{c.foot}</div>}
          </div>
        ))}
      </div>
      {hover && <Tooltip col={columns.find((c) => c.key === hover)!} index={columns.findIndex((c) => c.key === hover)} count={columns.length} />}
    </div>
  );
}

function Tooltip({ col, index, count }: { col: Column; index: number; count: number }) {
  const left = ((index + 0.5) / count) * 100;
  const total = KIND_ORDER.reduce((s, k) => s + col.kinds[k], 0);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-0 z-10 w-48 rounded-md border border-rule bg-paper px-3 py-2.5 text-xs shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
      style={{ left: `calc(2.25rem + (100% - 2.25rem) * ${left / 100})`, transform: `translate(${left > 70 ? "-105%" : "8%"}, 0)` }}
    >
      <p className="font-semibold">{col.title}</p>
      <p className="mb-1.5 text-muted">{fmtHours(total)} logged</p>
      {KIND_ORDER.filter((k) => col.kinds[k] > 0).reverse().map((k) => (
        <p key={k} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: kindFill(k) }} />
            {KIND_LABEL[k]}
          </span>
          <span className="tabular-nums">{fmtHours(col.kinds[k])}</span>
        </p>
      ))}
      {col.extra && (
        <p className="mt-1.5 border-t border-rule pt-1.5 text-muted">
          {col.extra.map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function CopyReport({ markdown }: { markdown: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        className="btn btn-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(markdown);
            setState("copied");
            setTimeout(() => setState("idle"), 2000);
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed. Use download" : "Copy report"}
      </button>
      <a className="btn btn-ghost" download="upward-report.md" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`}>
        Download .md
      </a>
    </div>
  );
}
