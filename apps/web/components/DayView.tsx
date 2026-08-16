"use client";

import type { CalendarEvent } from "@decal/shared-types";
import { eventKey } from "./DayColumn";
import { contributorColors, contributorNames } from "@/lib/calendarDisplay";

interface DayViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** A quiet "you're clear" glyph for the empty state — a circle with a
 * checkmark reads calmer than a blank box or a plain line of italic text. */
function AllClearIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <path
        d="M8 12.4L10.5 15L16 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function DayView({ events, onSelectEvent }: DayViewProps) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const allDay = sorted.filter((e) => e.allDay);
  const timed = sorted.filter((e) => !e.allDay);

  return (
    <div style={styles.wrap}>
      {allDay.length > 0 && (
        <div style={styles.allDaySection}>
          <p style={styles.allDayLabel}>All day</p>
          <div style={styles.allDayRow}>
            {allDay.map((event) => (
              <button
                key={eventKey(event)}
                type="button"
                style={{ ...styles.allDayChip, background: event.color }}
                onClick={() => onSelectEvent(event)}
              >
                <span style={styles.allDayTitle}>{event.title}</span>
                {contributorNames(event) && (
                  <span style={styles.allDayMember}>{contributorNames(event)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {timed.length === 0 ? (
        // Previously this rendered as an empty-but-styled box (background +
        // border + padding, no content) whenever there were only all-day
        // events above — a stray one-line gray rectangle with nothing in
        // it. Now it's a real empty state, centered and legible either way.
        <div style={styles.emptyState}>
          <AllClearIcon />
          <p style={styles.emptyText}>
            {allDay.length > 0 ? "Nothing else scheduled today." : "Nothing scheduled today."}
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {timed.map((event) => (
            <button
              key={eventKey(event)}
              type="button"
              style={styles.row}
              onClick={() => onSelectEvent(event)}
            >
              <div style={{ ...styles.rail, background: event.color }} />
              <div style={styles.rowBody}>
                <span style={styles.time}>
                  {TIME.format(new Date(event.start))} &ndash; {TIME.format(new Date(event.end))}
                </span>
                <span style={styles.title}>{event.title}</span>
                {event.location && <span style={styles.location}>{event.location}</span>}
                {contributorNames(event) && (
                  <span style={styles.memberTagRow}>
                    {contributorColors(event).length > 1 && (
                      <span style={styles.dotStack}>
                        {contributorColors(event)
                          .slice(0, 4)
                          .map((c, i) => (
                            <span
                              key={i}
                              style={{ ...styles.stackedDot, background: c, marginLeft: i === 0 ? 0 : -3 }}
                            />
                          ))}
                      </span>
                    )}
                    <span style={{ ...styles.memberTag, color: event.color }}>{contributorNames(event)}</span>
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    flex: 1
  },
  allDaySection: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  allDayLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: 0
  },
  allDayRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  allDayChip: {
    border: "none",
    borderRadius: 14,
    padding: "10px 18px",
    minHeight: 48,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-start",
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  },
  allDayTitle: {
    fontSize: 14,
    fontWeight: 700
  },
  allDayMember: {
    fontSize: 11,
    fontWeight: 600,
    opacity: 0.8
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    padding: 18,
    flex: 1
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    padding: 18,
    flex: 1,
    minHeight: 140,
    color: "var(--color-muted)",
    textAlign: "center"
  },
  emptyText: {
    fontSize: 14,
    fontStyle: "italic",
    margin: 0
  },
  row: {
    display: "flex",
    alignItems: "stretch",
    gap: 14,
    background: "rgba(237, 233, 225, 0.04)",
    border: "none",
    borderRadius: "var(--radius-tag)",
    padding: "12px 16px",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit"
  },
  rail: {
    width: 4,
    borderRadius: 999,
    flexShrink: 0
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: 3
  },
  time: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--color-muted)"
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 600
  },
  location: {
    fontSize: 12.5,
    color: "var(--color-muted)"
  },
  memberTagRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 2
  },
  memberTag: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase"
  },
  dotStack: {
    display: "flex",
    alignItems: "center"
  },
  stackedDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1.5px solid var(--color-panel)"
  }
};
