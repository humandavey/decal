export function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/**
 * Parses a CalendarEvent's `start`/`end` into a local `Date`, correctly
 * handling all-day events. All-day events come back from Google as a
 * date-only string ("2026-08-17"), and `new Date("2026-08-17")` is parsed
 * as UTC midnight per the ES spec — in any timezone behind UTC (all of the
 * US, for example) that instant falls on the *previous* local day, which
 * silently shifts every all-day event (birthdays, holidays, ...) back by
 * one. Timed events already carry a full ISO timestamp with an offset, so
 * `new Date(...)` on those is fine as-is.
 */
export function parseEventDate(value: string, allDay: boolean): Date {
  if (allDay) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }
  return new Date(value);
}

/**
 * Parses a date-only value into a local calendar `Date` — either a plain
 * "YYYY-MM-DD" string, or a full ISO timestamp representing UTC midnight
 * for a given day (how due-date columns round-trip through the database).
 * Reading the *UTC* date components (not local ones) is what avoids the
 * same off-by-one shift `parseEventDate` guards against for all-day
 * calendar events — a due date is a calendar day, not an instant.
 */
export function parseDateOnly(value: string): Date {
  const d = new Date(value);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface DueDateInfo {
  label: string;
  overdue: boolean;
  dueToday: boolean;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Formats a due date relative to `today` for compact display: "Today",
 * "Tomorrow", "Overdue", or a short date like "Aug 20". */
export function formatDueDate(due: Date, today: Date): DueDateInfo {
  const dueDay = startOfDay(due);
  const todayDay = startOfDay(today);
  const diffDays = Math.round((dueDay.getTime() - todayDay.getTime()) / 86400000);

  if (diffDays === 0) return { label: "Today", overdue: false, dueToday: true };
  if (diffDays === 1) return { label: "Tomorrow", overdue: false, dueToday: false };
  if (diffDays < 0) return { label: "Overdue", overdue: true, dueToday: false };
  return { label: SHORT_DATE.format(dueDay), overdue: false, dueToday: false };
}

/** Sunday on or before `d`. */
export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -d.getDay());
}

/** The 7 days of the week containing `d`, Sunday first. */
export function getWeekDays(d: Date) {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The 42-day (6-week) grid conventionally used for a month view: starts on
 * the Sunday on/before the 1st of the month, ends on the Saturday on/after
 * the last day of the month.
 */
export function getMonthGridDays(d: Date) {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}
