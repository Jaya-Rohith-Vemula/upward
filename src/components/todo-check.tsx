"use client";

export function TodoCheck({ done, onToggle, label, big }: { done: boolean; onToggle: () => void; label?: string; big?: boolean }) {
  return (
    <span className={`relative grid place-items-center ${big ? "-m-2.5 p-2.5" : ""}`}>
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label ?? (done ? "Mark not done" : "Mark done")}
      onClick={onToggle}
      className={`relative grid size-[20px] shrink-0 place-items-center rounded-full md:size-[18px] border-[1.5px] transition-colors ${
        done ? "border-accent bg-accent text-paper" : "border-rule-strong hover:border-ink-2"
      }`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {/* invisible enlargement of the touch target */}
      <span className="absolute -inset-3 md:hidden" aria-hidden />
    </button>
    </span>
  );
}
