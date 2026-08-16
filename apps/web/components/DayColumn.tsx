"use client";

import type { CalendarEvent } from "@decal/shared-types";
import { contributorColors, contributorNames } from "@/lib/calendarDisplay";

interface DayColumnProps {
  date: Date;
  isToday: boolean;
  events: CalendarEvent[];
  onSelectDay: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function eventKey(event: CalendarEvent) {
  return `${event.memberId ?? "?"}-${event.calendarId}-${event.id}`;
}

export function DayColumn({ date, isToday, events, onSelectDay, onSelectEvent }: DayColumnProps) {
  return (
    <div style={{ ...styles.column, ...(isToday ? styles.columnToday : {}) }}>
      <button type="button" style={styles.header} onClick={() => onSelectDay(date)}>
        <span style={styles.weekday}>{WEEKDAY.format(date)}</span>
        <span style={{ ...styles.dayNumber, ...(isToday ? styles.dayNumberToday : {}) }}>
          {date.getDate()}
        </span>
      </button>

      <div style={styles.events}>
        {events.length === 0 && <p style={styles.empty}>Nothing scheduled</p>}
        {events.map((event) => {
          const allDay = event.allDay;
          return (
            <button
              key={eventKey(event)}
              type="button"
              style={{
                ...styles.tag,
                ...(allDay
                  ? { background: event.color, borderLeftColor: "transparent" }
                  : { borderLeftColor: event.color ?? "var(--color-hairline-strong)" })
              }}
              onClick={() => onSelectEvent(event)}
            >
              <span style={{ ...styles.badge, ...(allDay ? styles.badgeAllDay : {}) }}>
                {allDay ? "All day" : TIME.format(new Date(event.start))}
              </span>
              <span style={{ ...styles.title, ...(allDay ? styles.titleAllDay : {}) }}>
                {event.title}
              </span>
              {contributorNames(event) && (
                <span
                  style={{
                    ...styles.memberRow,
                    ...(allDay ? styles.memberRowAllDay : { color: event.color })
                  }}
                >
                  {allDay ? (
                    <span style={{ ...styles.memberDot, background: "currentColor" }} />
                  ) : (
                    <span style={styles.dotStack}>
                      {(() => {
                        const colors = contributorColors(event);
                        const stacked = colors.length > 1;
                        return colors.slice(0, 4).map((c, i) => (
                          <span
                            key={i}
                            style={{
                              ...(stacked ? styles.stackedDot : styles.memberDot),
                              background: c,
                              marginLeft: stacked && i > 0 ? -3 : 0
                            }}
                          />
                        ));
                      })()}
                    </span>
                  )}
                  {contributorNames(event)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    padding: "18px 14px",
    minHeight: 320,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    transition: "transform 0.2s ease, box-shadow 0.2s ease"
  },
  columnToday: {
    background: "var(--color-panel-raised)",
    borderTop: "3px solid var(--accent-1)",
    transform: "translateY(-6px)",
    boxShadow: "0 16px 32px rgba(0,0,0,0.35)"
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left"
  },
  weekday: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--color-muted)"
  },
  dayNumber: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 30,
    color: "var(--color-paper)"
  },
  dayNumberToday: {
    color: "var(--accent-1)"
  },
  events: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto"
  },
  empty: {
    color: "var(--color-muted)",
    fontSize: 13,
    fontStyle: "italic",
    margin: 0
  },
  // Timed events: a quiet card with a thin colored rail on the left.
  // All-day events: a solid pill filled with the member's color — the
  // fill itself is the "this spans the whole day" signal, distinct at a
  // glance from every timed event around it.
  tag: {
    background: "rgba(237, 233, 225, 0.04)",
    border: "none",
    borderLeft: "3px solid transparent",
    borderRadius: "var(--radius-tag)",
    padding: "9px 11px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
    minHeight: 44
  },
  badge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    color: "var(--color-muted)"
  },
  badgeAllDay: {
    fontSize: 9.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-ink-deep)",
    opacity: 0.7
  },
  title: {
    fontSize: 13.5,
    fontWeight: 500,
    lineHeight: 1.3
  },
  titleAllDay: {
    color: "var(--color-ink-deep)",
    fontWeight: 700
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600
  },
  memberRowAllDay: {
    color: "var(--color-ink-deep)",
    opacity: 0.85
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0
  },
  // Only the timed-event dot stack (never the single all-day dot) needs a
  // ring — that's what keeps overlapping contributor colors from blurring
  // into an indistinct blob when more than one is shown.
  dotStack: {
    display: "flex",
    alignItems: "center"
  },
  stackedDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1.5px solid var(--color-panel)"
  }
};
