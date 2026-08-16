"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CalendarEvent } from "@decal/shared-types";
import { addDays, startOfDay } from "@/lib/dates";
import { dedupeCalendarEvents } from "@/lib/eventDedupe";
import { contributorNames } from "@/lib/calendarDisplay";
import { useSession } from "next-auth/react";
import { EventDetailModal } from "../EventDetailModal";
import type { FamilyNote } from "../NotesTab";
import { getCached, setCached } from "@/lib/mobileCache";

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

interface MealEntry {
  mealType: string;
  title: string;
}

const MEAL_LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack"
};

/** The mobile app's landing screen — everything worth a glance on the way
 * out the door, in one scroll: today's schedule, today's meals, how many
 * chores are still outstanding, and the latest notes left on the board.
 * Deliberately NOT a re-hosting of the desktop's week grid + side panels —
 * this is its own, phone-shaped summary; each underlying list still gets
 * its own full tab (Calendar / Family) for anything beyond a glance. */
export function MobileToday() {
  const { data: session } = useSession();
  const today = useMemo(() => startOfDay(new Date()), []);
  // Seeded from mobileCache instead of null, so a return visit to this tab
  // within the same app session shows what was here a moment ago instantly
  // instead of flashing "Loading…" again while the fetches below re-run in
  // the background — see lib/mobileCache.ts.
  const [events, setEvents] = useState<CalendarEvent[] | null>(() => getCached("today:events") ?? null);
  const [meals, setMeals] = useState<MealEntry[] | null>(() => getCached("today:meals") ?? null);
  const [choresRemaining, setChoresRemaining] = useState<number | null>(
    () => getCached("today:choresRemaining") ?? null
  );
  const [notes, setNotes] = useState<FamilyNote[] | null>(() => getCached("today:notes") ?? null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    const start = today;
    const end = addDays(today, 1);
    const eventParams = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });

    fetch(`/api/calendar/events?${eventParams}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const result = data?.events ?? [];
        setCached("today:events", result);
        setEvents(result);
      })
      .catch(() => setEvents((prev) => prev ?? []));

    // /api/meals's start/end are an inclusive day range (matching
    // MealsTab's week view, which passes the first and last day of the
    // week it's showing — both included), unlike /api/calendar/events's
    // start/end above, which are exact timestamps with an exclusive end
    // (Google Calendar's own timeMin/timeMax convention). Reusing
    // eventParams' end of "tomorrow" here — meant as an exclusive
    // boundary for events — instead pulled in the whole of tomorrow's
    // meals too, since for meals it's an inclusive day. That's the "Meals
    // today" card showing more than one day's worth of meals. A same-day
    // range fixes it.
    const mealParams = new URLSearchParams({ start: start.toISOString(), end: start.toISOString() });
    fetch(`/api/meals?${mealParams}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const result = data?.entries ?? [];
        setCached("today:meals", result);
        setMeals(result);
      })
      .catch(() => setMeals((prev) => prev ?? []));

    fetch("/api/chores")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const chores = (data?.chores ?? []) as { completedToday: boolean }[];
        const remaining = chores.filter((c) => !c.completedToday).length;
        setCached("today:choresRemaining", remaining);
        setChoresRemaining(remaining);
      })
      .catch(() => {});

    fetch("/api/notes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const result = (data?.notes ?? []).slice(0, 3);
        setCached("today:notes", result);
        setNotes(result);
      })
      .catch(() => setNotes((prev) => prev ?? []));
  }, [today]);

  const dedupedEvents = useMemo(
    () => (events ? dedupeCalendarEvents(events, session?.userId ?? null) : null),
    [events, session?.userId]
  );

  return (
    <div style={styles.wrap}>
      <div>
        <p style={styles.eyebrow}>Today</p>
        <h1 style={styles.heading}>{DAY_LABEL.format(today)}</h1>
      </div>

      <section style={styles.card}>
        <p style={styles.cardLabel}>Schedule</p>
        {dedupedEvents === null ? (
          <p style={styles.muted}>Loading&hellip;</p>
        ) : dedupedEvents.length === 0 ? (
          <p style={styles.muted}>Nothing on the calendar today.</p>
        ) : (
          <div style={styles.eventList}>
            {dedupedEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                style={styles.eventRow}
                onClick={() => setSelectedEvent(event)}
              >
                <div style={{ ...styles.eventRail, background: event.color }} />
                <div style={styles.eventBody}>
                  <span style={styles.eventTime}>
                    {event.allDay ? "All day" : TIME.format(new Date(event.start))}
                  </span>
                  <span style={styles.eventTitle}>{event.title}</span>
                  {contributorNames(event) && (
                    <span style={{ ...styles.eventMember, color: event.color }}>
                      {contributorNames(event)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div style={styles.cardRow}>
        <Link href="/m/family?tab=chores" style={styles.miniCard}>
          <p style={styles.miniCardValue}>{choresRemaining ?? "…"}</p>
          <p style={styles.miniCardLabel}>Chores left today</p>
        </Link>
        <Link href="/m/family?tab=meals" style={styles.miniCard}>
          <p style={styles.miniCardValue}>{meals === null ? "…" : meals.length}</p>
          <p style={styles.miniCardLabel}>Meals planned</p>
        </Link>
      </div>

      {meals && meals.length > 0 && (
        <section style={styles.card}>
          <p style={styles.cardLabel}>Meals today</p>
          <div style={styles.mealList}>
            {meals.map((m) => (
              <p key={m.mealType} style={styles.mealRow}>
                <span style={styles.mealType}>{MEAL_LABEL[m.mealType] ?? m.mealType}</span>
                {m.title}
              </p>
            ))}
          </div>
        </section>
      )}

      <section style={styles.card}>
        <div style={styles.cardHeaderRow}>
          <p style={styles.cardLabel}>Notes</p>
          <Link href="/m/family?tab=notes" style={styles.cardLink}>
            View all
          </Link>
        </div>
        {notes === null ? (
          <p style={styles.muted}>Loading&hellip;</p>
        ) : notes.length === 0 ? (
          <p style={styles.muted}>No notes on the board.</p>
        ) : (
          <div style={styles.noteList}>
            {notes.map((note) => (
              <div key={note.id} style={{ ...styles.noteRow, borderLeftColor: note.authorColor }}>
                <p style={styles.noteText}>{note.text}</p>
                <p style={{ ...styles.noteAuthor, color: note.authorColor }}>
                  {note.authorName ?? "Someone"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onChanged={() => {
            // Cheap and simple: today's window is small, a full refetch on
            // change is unnoticeable and avoids duplicating CalendarBoard's
            // more elaborate month-cache invalidation for a single-day view.
            setEvents(null);
            const start = today;
            const end = addDays(today, 1);
            const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
            fetch(`/api/calendar/events?${params}`)
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => {
                const result = data?.events ?? [];
                setCached("today:events", result);
                setEvents(result);
              })
              .catch(() => setEvents([]));
          }}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--accent-1)",
    margin: "0 0 4px"
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontWeight: 600,
    fontSize: "clamp(24px, 7vw, 30px)",
    margin: 0,
    color: "var(--color-paper)"
  },
  card: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    padding: 16
  },
  cardHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cardLink: { fontSize: 12, color: "var(--accent-4)", textDecoration: "none", fontWeight: 600 },
  cardLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 10px"
  },
  muted: { color: "var(--color-muted)", fontSize: 13.5, margin: 0 },
  eventList: { display: "flex", flexDirection: "column", gap: 8 },
  eventRow: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    background: "rgba(237, 233, 225, 0.04)",
    border: "none",
    borderRadius: "var(--radius-tag)",
    padding: "10px 12px",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit"
  },
  eventRail: { width: 4, borderRadius: 999, flexShrink: 0 },
  eventBody: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  eventTime: { fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-muted)" },
  eventTitle: { fontSize: 15, fontWeight: 600, color: "var(--color-paper)" },
  eventMember: { fontSize: 11, fontWeight: 600 },
  cardRow: { display: "flex", gap: 12 },
  miniCard: {
    flex: 1,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    padding: "16px 14px",
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  miniCardValue: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 30,
    margin: 0,
    color: "var(--color-paper)"
  },
  miniCardLabel: { fontSize: 12, color: "var(--color-muted)", margin: 0 },
  mealList: { display: "flex", flexDirection: "column", gap: 6 },
  mealRow: { fontSize: 14, color: "var(--color-paper)", margin: 0, display: "flex", gap: 8 },
  mealType: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--accent-3)",
    width: 66,
    flexShrink: 0
  },
  noteList: { display: "flex", flexDirection: "column", gap: 8 },
  noteRow: {
    background: "rgba(237,233,225,0.04)",
    borderLeft: "3px solid transparent",
    borderRadius: 10,
    padding: "10px 12px"
  },
  noteText: { fontSize: 13.5, lineHeight: 1.4, margin: "0 0 4px", overflowWrap: "anywhere" },
  noteAuthor: { fontSize: 11, fontWeight: 600, margin: 0 }
};
