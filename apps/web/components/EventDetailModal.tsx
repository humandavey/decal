"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { CalendarEvent } from "@decal/shared-types";
import { parseEventDate } from "@/lib/dates";
import { contributorNames, isMergedEvent } from "@/lib/calendarDisplay";
import { MobileFullScreenModal } from "./mobile/MobileFullScreenModal";

interface EventDetailModalProps {
  event: CalendarEvent;
  onClose: () => void;
  /** Told the event changed (saved or deleted) — parent should refetch. */
  onChanged: () => void;
  /** Renders as a full-bleed slide-in screen (MobileFullScreenModal)
   * instead of a centered dialog over a backdrop — see that component's
   * comment for why. Mobile call sites (MobileToday, MobileAgenda) pass
   * this; the desktop CalendarBoard doesn't, so its dialog is unchanged. */
  fullScreen?: boolean;
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});
const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric"
});
const TIME_ONLY = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function toDateTimeLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function EventDetailModal({ event, onClose, onChanged, fullScreen }: EventDetailModalProps) {
  const { data: session } = useSession();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [start, setStart] = useState(event.allDay ? event.start : toDateTimeLocal(event.start));
  const [end, setEnd] = useState(event.allDay ? event.end : toDateTimeLocal(event.end));
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Editing is a shared-calendar action — any family member can manage any
  // other member's event, same as before. Hiding is not: it silently drops
  // the event from everyone's view, so it's restricted to the member who
  // actually owns it.
  const canManage = Boolean(event.memberId && event.calendarId);
  const canHide = canManage && event.memberId === session?.userId;

  function ownerParams() {
    return new URLSearchParams({ calendarId: event.calendarId, memberId: event.memberId ?? "" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/calendar/events/${encodeURIComponent(event.id)}?${ownerParams()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            location,
            start: event.allDay ? start : new Date(start).toISOString(),
            end: event.allDay ? end : new Date(end).toISOString(),
            allDay: event.allDay
          })
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save changes");
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function hide() {
    if (
      !window.confirm(
        `Hide "${event.title}" from Decal? It'll stay on your Google Calendar — you can bring it back anytime from your profile.`
      )
    ) {
      return;
    }
    setHiding(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: event.calendarId,
          memberId: event.memberId,
          title: event.title,
          start: event.start,
          allDay: event.allDay
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't hide this event");
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setHiding(false);
    }
  }

  const body = (
    <>
      {mode === "view" ? (
        <>
          {isMergedEvent(event) ? (
            <div style={styles.colorBarGroup}>
              {event.contributors!.map((c) => (
                <span key={c.memberId} style={{ ...styles.colorBarSegment, background: c.color }} />
              ))}
            </div>
          ) : (
            <div style={{ ...styles.colorBar, background: event.color }} />
          )}
          {contributorNames(event) && (
            <p style={{ ...styles.eyebrow, color: isMergedEvent(event) ? "var(--color-muted)" : event.color }}>
              {contributorNames(event)}
            </p>
          )}
          {/* Full-screen mode already shows the title in
              MobileFullScreenModal's own header — repeating it here as a
              second, bigger heading right below it was redundant in a way
              a floating desktop dialog doesn't have (there, this IS the
              only place the title appears). */}
          {!fullScreen && <h2 style={styles.title}>{event.title}</h2>}
          {isMergedEvent(event) && (
              <p style={styles.mergedHint}>
                Shown once for the whole family — editing or hiding only changes your own copy.
              </p>
            )}
            <p style={styles.when}>
              {event.allDay && <span style={styles.allDayBadge}>All day</span>}
              {event.allDay
                ? DATE_ONLY.format(parseEventDate(event.start, true))
                : `${DATE_TIME.format(new Date(event.start))} – ${TIME_ONLY.format(
                    new Date(event.end)
                  )}`}
            </p>
            {event.location && <p style={styles.meta}>📍 {event.location}</p>}
            {event.description && <p style={styles.description}>{event.description}</p>}
            {event.attendees && event.attendees.length > 0 && (
              <div style={styles.attendees}>
                <p style={styles.sectionLabel}>Guests</p>
                <div style={styles.attendeeList}>
                  {event.attendees.map((a) => (
                    <span key={a.email} style={styles.attendee}>
                      {a.displayName ?? a.email}
                      {a.responseStatus === "accepted" ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              {event.htmlLink && (
                <a style={styles.linkButton} href={event.htmlLink} target="_blank" rel="noreferrer">
                  Open in Google Calendar
                </a>
              )}
              {canManage && (
                <button type="button" style={styles.secondaryButton} onClick={() => setMode("edit")}>
                  Edit
                </button>
              )}
              {canHide && (
                <button type="button" style={styles.hideButton} onClick={hide} disabled={hiding}>
                  {hiding ? "Hiding…" : "Hide"}
                </button>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={save} style={styles.form}>
            {!fullScreen && <h2 style={styles.formHeading}>Edit event</h2>}
            <label style={styles.label}>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Location
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={styles.input}
                placeholder="Optional"
              />
            </label>
            <div style={styles.formRow}>
              <label style={styles.label}>
                Starts
                <input
                  type={event.allDay ? "date" : "datetime-local"}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  style={styles.input}
                />
              </label>
              <label style={styles.label}>
                Ends
                <input
                  type={event.allDay ? "date" : "datetime-local"}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  style={styles.input}
                />
              </label>
            </div>
            <label style={styles.label}>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ ...styles.input, ...styles.textarea }}
                placeholder="Optional"
              />
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setMode("view")}>
                Cancel
              </button>
              <button type="submit" style={styles.primaryButton} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
    </>
  );

  if (fullScreen) {
    return (
      <MobileFullScreenModal
        title={mode === "edit" ? "Edit event" : event.title}
        eyebrow={mode === "view" ? contributorNames(event) ?? undefined : undefined}
        eyebrowColor={isMergedEvent(event) ? "var(--color-muted)" : event.color}
        onClose={onClose}
      >
        {body}
      </MobileFullScreenModal>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>
        {body}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10, 11, 14, 0.6)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50
  },
  modal: {
    position: "relative",
    width: "100%",
    maxWidth: 560,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: "var(--radius-card)",
    padding: "32px 30px 26px",
    // overflow-wrap/word-break both inherit — setting them once here covers
    // the title, description, location, etc. so a long unbroken string
    // (a long word, a URL with no spaces) wraps inside the modal instead
    // of pushing past its edge.
    overflowWrap: "anywhere",
    wordBreak: "break-word"
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    padding: 4
  },
  colorBar: {
    width: 36,
    height: 4,
    borderRadius: 999,
    marginBottom: 14
  },
  colorBarGroup: {
    display: "flex",
    gap: 3,
    marginBottom: 14
  },
  colorBarSegment: {
    width: 16,
    height: 4,
    borderRadius: 999
  },
  mergedHint: {
    fontSize: 12,
    color: "var(--color-muted)",
    fontStyle: "italic",
    margin: "0 0 12px"
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    margin: "0 0 6px"
  },
  title: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 24,
    margin: "0 0 10px",
    paddingRight: 24
  },
  when: {
    fontSize: 14,
    color: "var(--color-paper)",
    margin: "0 0 6px",
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  allDayBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-ink-deep)",
    background: "var(--accent-3)",
    borderRadius: 999,
    padding: "2px 9px"
  },
  meta: {
    fontSize: 13.5,
    color: "var(--color-muted)",
    margin: "0 0 6px"
  },
  description: {
    fontSize: 13.5,
    color: "var(--color-muted)",
    lineHeight: 1.6,
    margin: "12px 0 0",
    whiteSpace: "pre-wrap"
  },
  attendees: {
    marginTop: 18
  },
  sectionLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 8px"
  },
  attendeeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  attendee: {
    fontSize: 12.5,
    background: "rgba(237,233,225,0.06)",
    borderRadius: 999,
    padding: "5px 12px"
  },
  error: {
    color: "var(--accent-1)",
    fontSize: 13,
    margin: "16px 0 0"
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 24
  },
  linkButton: {
    background: "transparent",
    color: "var(--accent-4)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer"
  },
  primaryButton: {
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    border: "none",
    borderRadius: 999,
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  },
  secondaryButton: {
    background: "transparent",
    color: "var(--color-paper)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  },
  // Hiding isn't destructive (the event stays on Google Calendar and can
  // be brought back from Profile), so this is deliberately more muted than
  // the old red "Delete" styling — a plain outline, not an alarm color.
  hideButton: {
    background: "transparent",
    color: "var(--color-muted)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  formHeading: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 20,
    margin: "0 0 4px",
    paddingRight: 24
  },
  formRow: {
    display: "flex",
    gap: 12
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--color-muted)",
    flex: 1
  },
  input: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "9px 11px",
    color: "var(--color-paper)",
    fontSize: 13.5,
    fontFamily: "inherit"
  },
  textarea: {
    minHeight: 80,
    resize: "vertical"
  }
};
