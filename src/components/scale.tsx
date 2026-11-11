"use client";

/** 1–5 rating as a row of ticks. Click the active value again to unset. */
export function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-3">
      <span className="eyebrow w-12">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value != null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(value === n ? null : n)}
              className="group grid size-7 place-items-center"
            >
              <span
                className={`block h-4 w-[5px] rounded-full transition-all duration-200 ${
                  on ? "bg-ink" : "bg-rule-strong group-hover:bg-ink-2"
                }`}
                style={{ height: 6 + n * 3 }}
              />
            </button>
          );
        })}
      </div>
      <span className="w-3 text-xs tabular-nums text-muted">{value ?? ""}</span>
    </div>
  );
}
