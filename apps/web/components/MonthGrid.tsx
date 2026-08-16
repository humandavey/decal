"use client";

import type { CalendarEvent } from "@decal/shared-types";
import { isSameDay } from "@/lib/dates";
import { eventKey } from "./DayColumn";
import { contributorNames } from "@/lib/calendarDisplay";

interface MonthGridProps {
  days: Date[];
  anchorMonth: number;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectDay: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

// A compact "9a" / "2:30p" time, since a month cell has almost no room —
// the full "9:00 AM" from Intl.DateTimeFormat would crowd out the title.
function compactTime(iso: string) {
  const d = new Date(iso);
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const period = hours24 < 12 ? "a" : "p";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutes === 0 ? `${hours12}${period}` : `${hours12}:${String(minutes).padStart(2, "0")}${period}`;
}

export function MonthGrid({
  days,
  anchorMonth,
  today,
  eventsByDay,
  onSelectDay,
  onSelectEvent
}: MonthGridProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} style={styles.weekdayLabel}>
            {label}
          </span>
        ))}
      </div>
      <div style={styles.grid}>
        {days.map((day) => {
          const events = eventsByDay.get(day.toDateString()) ?? [];
          const isToday = isSameDay(day, today);
          const inMonth = day.getMonth() === anchorMonth;
          return (
            <div
              key={day.toDateString()}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(day)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDay(day);
                }
              }}
              style={{
                ...styles.cell,
                ...(isToday ? styles.cellToday : {}),
                ...(inMonth ? {} : styles.cellOutside)
              }}
            >
              <span style={{ ...styles.dayNumber, ...(isToday ? styles.dayNumberToday : {}) }}>
                {day.getDate()}
              </span>
              <div style={styles.chips}>
                {events.slice(0, MAX_VISIBLE).map((event) => {
                  const allDay = event.allDay;
                  return (
                    <button
                      key={eventKey(event)}
                      type="button"
                      style={{
                        ...styles.chip,
                        ...(allDay
                          ? { background: event.color, color: "var(--color-ink-deep)" }
                          : {
                              background: "rgba(237, 233, 225, 0.06)",
                              borderLeft: `3px solid ${event.color ?? "var(--color-hairline-strong)"}`,
                              color: "var(--color-paper)"
                            })
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                      title={contributorNames(event) ? `${event.title} — ${contributorNames(event)}` : event.title}
                    >
                      {!allDay && `${compactTime(event.start)} `}
                      {event.title}
                      {contributorNames(event) ? ` · ${contributorNames(event)}` : ""}
                    </button>
                  );
                })}
                {events.length > MAX_VISIBLE && (
                  <span style={styles.more}>+{events.length - MAX_VISIBLE} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  weekdayRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    padding: "0 4px"
  },
  weekdayLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    textAlign: "left",
    paddingLeft: 6
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gridAutoRows: "1fr",
    gap: 6,
    flex: 1
  },
  cell: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: 12,
    padding: "8px 8px 10px",
    minHeight: 96,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    cursor: "pointer",
    color: "inherit",
    textAlign: "left"
  },
  cellToday: {
    background: "var(--color-panel-raised)",
    borderColor: "var(--accent-1)"
  },
  cellOutside: {
    opacity: 0.35
  },
  dayNumber: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 16
  },
  dayNumberToday: {
    color: "var(--accent-1)"
  },
  chips: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    width: "100%"
  },
  chip: {
    border: "none",
    fontFamily: "inherit",
    fontSize: 10.5,
    fontWeight: 500,
    color: "var(--color-ink-deep)",
    borderRadius: 5,
    padding: "2px 6px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    width: "100%",
    textAlign: "left",
    cursor: "pointer"
  },
  more: {
    fontSize: 10.5,
    color: "var(--color-muted)"
  }
};
