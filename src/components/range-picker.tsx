"use client";

import { useRouter } from "next/navigation";
import { DatePicker } from "./ui";

export function RangePicker({ from, to, today }: { from: string; to: string; today: string }) {
  const router = useRouter();
  const go = (f: string, t: string) => router.push(`/insights?from=${f}&to=${t}`);
  return (
    <div className="flex items-center gap-1 text-sm">
      <DatePicker value={from} today={today} max={to} clearable={false} label="From" onChange={(d) => d && go(d, to)} className="rounded-full bg-paper-2 px-3 text-xs" />
      <span className="text-muted">→</span>
      <DatePicker value={to} today={today} min={from} clearable={false} label="To" onChange={(d) => d && go(from, d)} className="rounded-full bg-paper-2 px-3 text-xs" />
    </div>
  );
}
