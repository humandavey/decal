// Shared between the quick-add API route and the QuickAddPanel client
// component. Kept out of the route file itself since Next's App Router
// only expects HTTP-method exports (GET/POST/etc.) and a small set of
// route config exports from a route.ts module.

/** A detected "repeats" rule — deliberately NOT a raw RRULE string. Every
 * field here is a plain wall-clock value (same discipline as the rest of
 * ParsedEventDraft below): `untilDate` is a bare "YYYY-MM-DD", not a
 * timezone-aware instant, even though Google Calendar's actual RRULE
 * UNTIL clause has to be a precise UTC instant. That conversion happens
 * client-side in QuickAddPanel's create() — the one place (per the
 * comment on ParsedEventDraft below) that's allowed to turn any of this
 * into a real Date, using the browser's own timezone. Doing that
 * conversion here on the server would silently use the SERVER's
 * timezone instead (this route runs in a Docker container that's very
 * possibly not in the same timezone as the family using it), which is
 * exactly the class of bug this file's fields are designed to avoid
 * everywhere else. */
export interface RecurrenceDraft {
  freq: "DAILY" | "WEEKLY";
  /** RRULE BYDAY codes, e.g. ["WE"] for "every Wednesday". Null for DAILY,
   * or a WEEKLY rule with no specific day named. */
  byDay: string[] | null;
  /** Plain "YYYY-MM-DD", inclusive of the last occurrence — null means
   * "repeats indefinitely," a valid RRULE with no UNTIL clause at all. */
  untilDate: string | null;
  /** Human-readable, e.g. "Weekly on Wednesdays, through Dec 16" — for the
   * preview only, never sent to Google Calendar. */
  label: string;
}

/** Every field here is a plain wall-clock value ("YYYY-MM-DD" / "HH:MM"),
 * never a timezone-aware instant — see the comment at the top of
 * app/api/calendar/quick-add/route.ts for why. */
export interface ParsedEventDraft {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  source: "ai" | "local";
  /** null for a normal one-time event. When set, startDate/startTime above
   * are the FIRST occurrence — not a separate, redundant date. */
  recurrence: RecurrenceDraft | null;
}

const DAY_CODE_NAME: Record<string, string> = {
  SU: "Sundays",
  MO: "Mondays",
  TU: "Tuesdays",
  WE: "Wednesdays",
  TH: "Thursdays",
  FR: "Fridays",
  SA: "Saturdays"
};

const UNTIL_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Builds the human-readable `RecurrenceDraft.label` from its other
 * fields — shared by both the local and AI parsers (see
 * app/api/calendar/quick-add/route.ts) so the two produce identically
 * worded labels for the same underlying rule. */
export function recurrenceLabel(freq: "DAILY" | "WEEKLY", byDay: string[] | null, untilDate: string | null): string {
  const base =
    freq === "DAILY"
      ? "Daily"
      : byDay && byDay.length
        ? `Weekly on ${byDay.map((code) => DAY_CODE_NAME[code] ?? code).join(", ")}`
        : "Weekly";

  if (!untilDate) return base;
  const [y, m, d] = untilDate.split("-").map(Number);
  if (!y || !m || !d) return base;
  return `${base}, through ${UNTIL_LABEL_FORMAT.format(new Date(y, m - 1, d))}`;
}
