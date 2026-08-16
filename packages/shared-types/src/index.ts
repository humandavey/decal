/** One guest on a calendar event. */
export interface CalendarEventAttendee {
  email: string;
  displayName?: string;
  /** Google's RSVP status string: "accepted" | "declined" | "tentative" | "needsAction". */
  responseStatus?: string;
  self?: boolean;
}

/** One family member whose own copy of an event got folded into a merged
 * duplicate — see `CalendarEvent.contributors`. */
export interface CalendarEventContributor {
  memberId: string;
  memberName?: string | null;
  color: string;
}

/** A single calendar event, normalized from whatever provider it came from. */
export interface CalendarEvent {
  /** Provider (Google) event id — unique per calendar, not globally. */
  id: string;
  title: string;
  /** ISO 8601 timestamps. `allDay` events use date-only strings (YYYY-MM-DD). */
  start: string;
  end: string;
  allDay: boolean;
  /** id of the source calendar (e.g. Google calendarId) — needed to edit/delete this event. */
  calendarId: string;
  /** Which family member's calendar this event came from. When this event
   * represents several people's identical copies merged into one (see
   * `contributors`), this — and `memberName`/`color` below — describe
   * specifically the copy that Edit/Hide act on, not the group as a whole. */
  memberId?: string;
  memberName?: string | null;
  /** The owning family member's color, so events read as "whose" at a glance. */
  color?: string;
  /** Set only when this event is standing in for the same occurrence
   * appearing on more than one family member's calendar (a shared
   * contact's birthday synced into everyone's Google Calendar is the
   * common case) — one entry per distinct contributing member, including
   * whichever one is also referenced by `memberId`/`memberName`/`color`
   * above. Absent (not just empty) for an ordinary single-owner event. */
  contributors?: CalendarEventContributor[];
  location?: string;
  description?: string;
  /** Deep link to open/edit this event on calendar.google.com. */
  htmlLink?: string;
  organizerEmail?: string;
  attendees?: CalendarEventAttendee[];
}

/** One Google (or later, CalDAV) calendar a user has connected. */
export interface CalendarSource {
  id: string;
  provider: "google" | "caldav";
  label: string;
  color: string;
  enabled: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  color: string;
}

/**
 * Palette used to tell family members apart at a glance — across calendar
 * events, chore tags, and the member filter row. The first 5 mirror the
 * --accent-1..5 custom properties in apps/web/app/globals.css (those five
 * double as fixed UI roles); the rest just give larger families more
 * distinct member colors. Mirrors packages/db/src/constants.ts'
 * MEMBER_COLOR_PALETTE (kept in sync by hand since packages/db
 * intentionally doesn't depend on this package).
 */
export const FAMILY_PALETTE = [
  "#F0633D",
  "#34A896",
  "#E7A93B",
  "#6E7BF2",
  "#D46FB0",
  "#7FB069",
  "#4A9CC7",
  "#9B6FD9",
  "#D9587A",
  "#E5484D"
] as const;

export function colorForMemberIndex(index: number): string {
  return FAMILY_PALETTE[index % FAMILY_PALETTE.length];
}
