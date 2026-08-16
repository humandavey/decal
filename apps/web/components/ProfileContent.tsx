"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { FAMILY_PALETTE } from "@decal/shared-types";
import { parseDateOnly, startOfDay } from "@/lib/dates";

interface ProfileContentProps {
  /** This member's current color, if known yet (loads with the calendar events). */
  color?: string;
  /** Told the color changed — parent should refetch so events re-tint. */
  onColorChanged: () => void;
}

interface HiddenEventRow {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
}

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const HIDDEN_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function hiddenEventDay(row: HiddenEventRow) {
  // `start` here is what the server stored (a real DateTime, always an ISO
  // instant) rather than Google's raw "YYYY-MM-DD" for all-day events —
  // parseDateOnly (reading UTC Y/M/D) is the one that matches that shape,
  // not parseEventDate (which expects the bare date string).
  return row.allDay ? parseDateOnly(row.start) : new Date(row.start);
}

function formatHiddenDate(row: HiddenEventRow) {
  return HIDDEN_DATE.format(hiddenEventDay(row));
}

// The unhide list is meant for events you might still want back — a hidden
// event from three months ago is just clutter at that point. Compared by
// calendar day (not the precise instant) so something hidden earlier today
// doesn't blink out of the list while today is still underway. This runs
// entirely in the browser, deliberately — it's the one place that actually
// knows the viewer's real timezone (same reasoning as everywhere else
// date math happens in this app).
function isUpcoming(row: HiddenEventRow) {
  return startOfDay(hiddenEventDay(row)).getTime() >= startOfDay(new Date()).getTime();
}

/** Identity + calendar color + hidden events + sign-out — the actual
 * content of "your" settings, with no opinion on how it's framed. Used by
 * both ProfileModal (an overlay, on the kiosk/desktop dashboard) and the
 * mobile app's dedicated Profile tab (a full page, no overlay chrome). */
export function ProfileContent({ color, onColorChanged }: ProfileContentProps) {
  const { data: session } = useSession();
  // The swatch highlight follows this instead of the `color` prop directly
  // — clicking a swatch flips it (and the outline) immediately, rather
  // than waiting on the PATCH request and the parent's refetch to come
  // back around. Falls back in sync with `color` whenever it changes from
  // outside (initial load, or another tab picking a color for you).
  const [displayColor, setDisplayColor] = useState(color);
  useEffect(() => {
    setDisplayColor(color);
  }, [color]);

  // null = still loading; [] = loaded, nothing hidden.
  const [hidden, setHidden] = useState<HiddenEventRow[] | null>(null);
  const [unhidingId, setUnhidingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/hidden-events")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.hidden) {
          setHidden((data.hidden as HiddenEventRow[]).filter(isUpcoming));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function unhide(id: string) {
    setUnhidingId(id);
    try {
      const res = await fetch(`/api/calendar/hidden-events/${id}`, { method: "DELETE" });
      // The calendar view refetches on its own — unhiding fires the same
      // "calendar" sync event hiding does, and this tab is already
      // listening for it (useFamilySyncSource in CalendarBoard).
      if (res.ok) setHidden((prev) => prev?.filter((h) => h.id !== id) ?? prev);
    } finally {
      setUnhidingId(null);
    }
  }

  async function pickColor(next: string) {
    if (next === displayColor) return;
    const previous = displayColor;
    setDisplayColor(next); // instant feedback — don't wait on the network
    try {
      const res = await fetch("/api/family/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: next })
      });
      if (res.ok) {
        onColorChanged();
      } else {
        setDisplayColor(previous);
      }
    } catch {
      setDisplayColor(previous);
    }
  }

  const user = session?.user;

  return (
    <div>
      <div style={styles.identity}>
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" style={styles.avatarImage} />
        ) : (
          <span style={styles.avatarInitials}>{initials(user?.name, user?.email)}</span>
        )}
        <div>
          {user?.name && <p style={styles.name}>{user.name}</p>}
          {user?.email && <p style={styles.email}>{user.email}</p>}
        </div>
      </div>

      <div style={styles.colorSection}>
        <p style={styles.sectionLabel}>Your color</p>
        <p style={styles.hint}>Tags your events and chores everywhere on the dashboard.</p>
        <div style={styles.swatchRow}>
          {FAMILY_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Use ${swatch}`}
              onClick={() => pickColor(swatch)}
              style={{
                ...styles.swatch,
                background: swatch,
                outline: swatch === displayColor ? "3px solid var(--color-paper)" : "none",
                outlineOffset: 3
              }}
            />
          ))}
        </div>
      </div>

      <div style={styles.hiddenSection}>
        <p style={styles.sectionLabel}>Hidden events</p>
        <p style={styles.hint}>
          Upcoming events you&rsquo;ve hidden from the dashboard — they&rsquo;re still on your
          Google Calendar. Past ones drop off this list on their own.
        </p>
        {hidden === null ? (
          <p style={styles.hiddenMuted}>Loading&hellip;</p>
        ) : hidden.length === 0 ? (
          <p style={styles.hiddenMuted}>Nothing upcoming is hidden right now.</p>
        ) : (
          <div style={styles.hiddenList}>
            {hidden.map((h) => (
              <div key={h.id} style={styles.hiddenRow}>
                <div style={styles.hiddenRowBody}>
                  <span style={styles.hiddenTitle}>{h.title}</span>
                  <span style={styles.hiddenDate}>{formatHiddenDate(h)}</span>
                </div>
                <button
                  type="button"
                  style={styles.unhideButton}
                  onClick={() => unhide(h.id)}
                  disabled={unhidingId === h.id}
                >
                  {unhidingId === h.id ? "Restoring…" : "Unhide"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" style={styles.signOutButton} onClick={() => signOut()}>
        Disconnect
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  identity: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    paddingBottom: 20,
    borderBottom: "1px solid var(--color-hairline)"
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0
  },
  avatarInitials: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "var(--color-panel-raised)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-mono)",
    fontSize: 16,
    fontWeight: 600,
    flexShrink: 0
  },
  name: { fontSize: 15, fontWeight: 600, margin: 0 },
  email: { fontSize: 12.5, color: "var(--color-muted)", margin: "3px 0 0" },
  colorSection: {
    paddingTop: 20,
    paddingBottom: 24
  },
  sectionLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 8px"
  },
  hint: { color: "var(--color-muted)", fontSize: 12, margin: "0 0 14px" },
  // Fixed-size grid cells (not flex) — a flex row squeezes fixed-width
  // circles into ovals once there are too many to fit on one line.
  swatchRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, 40px)",
    justifyContent: "space-between",
    rowGap: 14,
    columnGap: 12
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    padding: 0,
    transition: "outline-color 0.12s ease, transform 0.12s ease"
  },
  hiddenSection: {
    paddingTop: 20,
    paddingBottom: 24,
    borderTop: "1px solid var(--color-hairline)"
  },
  hiddenMuted: {
    color: "var(--color-muted)",
    fontSize: 13,
    fontStyle: "italic",
    margin: 0
  },
  hiddenList: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  hiddenRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 10,
    padding: "9px 10px 9px 12px"
  },
  hiddenRowBody: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1
  },
  hiddenTitle: {
    fontSize: 13.5,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  hiddenDate: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--color-muted)"
  },
  unhideButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-paper)",
    cursor: "pointer",
    flexShrink: 0
  },
  signOutButton: {
    width: "100%",
    background: "transparent",
    color: "var(--color-paper)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "12px 16px",
    minHeight: 48,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  }
};
