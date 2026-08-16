"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { CalendarEvent } from "@decal/shared-types";
import { addDays, isSameDay, parseEventDate, startOfDay } from "@/lib/dates";
import { dedupeCalendarEvents } from "@/lib/eventDedupe";
import { contributorNames } from "@/lib/calendarDisplay";
import { EventDetailModal } from "../EventDetailModal";

const AGENDA_DAYS = 21;
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** A scrollable, day-grouped agenda list — the mobile equivalent of the
 * desktop's week/month grid, which doesn't translate to a phone-width
 * screen. Shows the next three weeks starting today; anything further out
 * is still on the same Google Calendar the desktop dashboard reads from,
 * this is just a different lens onto it. */
export function MobileAgenda() {
  const { data: session } = useSession();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  function load() {
    const start = today;
    const end = addDays(today, AGENDA_DAYS);
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    fetch(`/api/calendar/events?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEvents(data?.events ?? []))
      .catch(() => setEvents([]));
  }

  useEffect(load, [today]);

  const days = useMemo(() => Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(today, i)), [today]);

  const eventsByDay = useMemo(() => {
    if (!events) return null;
    const deduped = dedupeCalendarEvents(events, session?.userId ?? null);
    const map = new Map<string, CalendarEvent[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const event of deduped) {
      const eventDate = parseEventDate(event.start, event.allDay);
      for (const day of days) {
        if (isSameDay(eventDate, day)) {
          map.get(day.toDateString())!.push(event);
          break;
        }
      }
    }
    return map;
  }, [events, days, session?.userId]);

  const daysWithEvents = useMemo(
    () => days.filter((d) => (eventsByDay?.get(d.toDateString()) ?? []).length > 0),
    [days, eventsByDay]
  );

  return (
    <div style={styles.wrap}>
      <div>
        <p style={styles.eyebrow}>Calendar</p>
        <h1 style={styles.heading}>Next {AGENDA_DAYS} days</h1>
      </div>

      {eventsByDay === null ? (
        <p style={styles.muted}>Loading&hellip;</p>
      ) : daysWithEvents.length === 0 ? (
        <p style={styles.muted}>Nothing on the calendar in the next {AGENDA_DAYS} days.</p>
      ) : (
        <div style={styles.dayList}>
          {daysWithEvents.map((day) => {
            const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
            return (
              <section key={day.toDateString()}>
                <p style={{ ...styles.dayLabel, ...(isSameDay(day, today) ? styles.dayLabelToday : {}) }}>
                  {isSameDay(day, today) ? "Today" : DAY_LABEL.format(day)}
                </p>
                <div style={styles.eventList}>
                  {dayEvents.map((event) => (
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
              </section>
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onChanged={load} />
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
  muted: { color: "var(--color-muted)", fontSize: 13.5, margin: 0 },
  dayList: { display: "flex", flexDirection: "column", gap: 18 },
  dayLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 8px 2px"
  },
  dayLabelToday: { color: "var(--accent-1)" },
  eventList: { display: "flex", flexDirection: "column", gap: 8 },
  eventRow: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-tag)",
    padding: "11px 13px",
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
  eventMember: { fontSize: 11, fontWeight: 600 }
};
