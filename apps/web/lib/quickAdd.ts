// Shared between the quick-add API route and the QuickAddPanel client
// component. Kept out of the route file itself since Next's App Router
// only expects HTTP-method exports (GET/POST/etc.) and a small set of
// route config exports from a route.ts module.

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
}
