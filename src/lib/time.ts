/** Date/time helpers. Days are ISO strings "YYYY-MM-DD" in the user's configured timezone. */

export function todayIn(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function nowMinuteIn(tz: string, d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

export function slotStarts(slotMinutes: number, startHour: number, endHour: number): number[] {
  const out: number[] = [];
  for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) out.push(m);
  return out;
}

/** 12-hour clock, e.g. 540 → "9:00 AM", 1440 → "12:00 AM". */
export function fmtMinute(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Compact 12-hour label for axes, e.g. 540 → "9 AM", 570 → "9:30 AM". */
export function fmtHourShort(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

export function weekdayName(day: string, style: "long" | "short" = "long"): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" });
}

export function prettyDay(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/** 75 → "1h 15m", 45 → "45m", 120 → "2h" */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}
