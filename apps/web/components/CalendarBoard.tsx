"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { CalendarEvent } from "@decal/shared-types";
import { DayColumn } from "./DayColumn";
import { DayView } from "./DayView";
import { MonthGrid } from "./MonthGrid";
import { EventDetailModal } from "./EventDetailModal";
import { FamilyModal } from "./FamilyModal";
import { ProfileMenu } from "./ProfileMenu";
import { addDays, getMonthGridDays, getWeekDays, isSameDay, parseEventDate, startOfDay } from "@/lib/dates";
import { FamilyPanel } from "./FamilyPanel";
import { QuickAddPanel } from "./QuickAddPanel";
import { Screensaver } from "./Screensaver";
import { useFamilySyncListener, useFamilySyncSource } from "@/lib/useFamilySync";
import { useIdle } from "@/lib/useIdle";
import { dedupeCalendarEvents } from "@/lib/eventDedupe";

type ViewMode = "day" | "week" | "month";

interface FamilyMemberSummary {
  id: string;
  name: string | null;
  color: string;
  role: string;
  connected: boolean;
}

interface MonthCacheEntry {
  events: CalendarEvent[];
  fetchedAt: number;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const WEEK_RANGE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

// Cached months are reused instantly; a month older than this refetches
// quietly in the background (data stays on screen the whole time) rather
// than blocking the view.
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Replaces the old `&larr;`/`&rarr;` text glyphs — those render at
 * inconsistent optical centers across fonts/platforms, whereas an SVG path
 * centers exactly the same everywhere. */
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M6.5 1L1.5 6.5L6.5 12" : "M1.5 1L6.5 6.5L1.5 12"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScreensaverIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 13.5h5M8 11v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="6.75" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) for the calendar month a `monthKey` names. */
function monthRange(key: string) {
  const [year, month] = key.split("-").map(Number);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

export function CalendarBoard() {
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  // Events are cached a whole calendar month at a time, keyed by "YYYY-MM".
  // Day/Week/Month are just different windows onto the same months, so once
  // a month is loaded, switching views (or navigating within it) is instant
  // — no network round-trip, and nothing has to disappear while refetching.
  const [monthCache, setMonthCache] = useState<Map<string, MonthCacheEntry>>(new Map());
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set());
  const [failedMonths, setFailedMonths] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<FamilyMemberSummary[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState<string[]>([]);
  const [hiddenMemberIds, setHiddenMemberIds] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  // Bumped whenever family-wide settings change (e.g. meal-prep toggles in
  // the Family modal) — the sidepanel tabs that read those settings watch
  // this to refetch live instead of needing a page reload.
  const [familyVersion, setFamilyVersion] = useState(0);
  const bumpFamilyVersion = useCallback(() => setFamilyVersion((v) => v + 1), []);
  const [showSidePanel, setShowSidePanel] = useState(true);
  // Screensaver on/off + idle threshold — family-wide settings, so read
  // straight off /api/family rather than duplicating them into their own
  // route. Defaults (off, 5 min) hold until the real values land, so the
  // screensaver never flashes on before its own setting has loaded.
  const [screensaverEnabled, setScreensaverEnabled] = useState(false);
  const [screensaverIdleMinutes, setScreensaverIdleMinutes] = useState(5);
  // Lets the "Screensaver" header button jump straight to it, independent
  // of the idle timer — works even when the family hasn't turned on the
  // auto-idle trigger, since the photo/clock/weather overlay itself isn't
  // tied to that setting.
  const [manualScreensaver, setManualScreensaver] = useState(false);

  // One shared connection to the server's change stream for the whole
  // dashboard — other tabs/devices editing the same family push here.
  useFamilySyncSource();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/family")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setScreensaverEnabled(Boolean(data.screensaverEnabled));
        if (data.screensaverIdleMinutes) setScreensaverIdleMinutes(Number(data.screensaverIdleMinutes));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-reads after familyVersion bumps (e.g. the owner just changed it in
    // Family settings) instead of waiting for a page reload.
  }, [familyVersion]);

  const screensaverIdle = useIdle(screensaverIdleMinutes, screensaverEnabled);
  const showScreensaver = (screensaverEnabled && screensaverIdle) || manualScreensaver;

  const today = useMemo(() => startOfDay(new Date()), []);

  const days = useMemo(() => {
    if (viewMode === "day") return [anchor];
    return viewMode === "week" ? getWeekDays(anchor) : getMonthGridDays(anchor);
  }, [viewMode, anchor]);

  // Every distinct calendar month the visible grid touches (month view's
  // 42-day grid can spill a few days into the previous/next month).
  const monthKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const day of days) keys.add(monthKey(day));
    return Array.from(keys);
  }, [days]);
  const monthKeysSignature = monthKeys.join(",");

  const loadMonth = useCallback(async (key: string) => {
    // Atomic check-and-set on the loading set so two effect passes racing
    // for the same month don't both fire a fetch.
    let alreadyLoading = false;
    setLoadingMonths((prev) => {
      if (prev.has(key)) {
        alreadyLoading = true;
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (alreadyLoading) return;

    try {
      const { start, end } = monthRange(key);
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();

      setMonthCache((prev) => {
        const next = new Map(prev);
        next.set(key, { events: data.events ?? [], fetchedAt: Date.now() });
        return next;
      });
      setMembers(data.members ?? []);
      setUnavailable(data.unavailable ?? []);
      setNeedsReconnect(data.needsReconnect ?? []);
      setFailedMonths((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch {
      setFailedMonths((prev) => new Set(prev).add(key));
    } finally {
      setLoadingMonths((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    for (const key of monthKeys) {
      const cached = monthCache.get(key);
      const isStale = !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;
      if (isStale) loadMonth(key);
    }
    // monthCache is deliberately not a dependency — reading its current
    // value here (rather than reacting to it) is what lets a background
    // refresh update the cache without this effect re-running in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKeysSignature, loadMonth]);

  // Re-fetches exactly the months currently in view (e.g. after
  // editing/deleting an event) WITHOUT clearing the cache first — the old
  // data stays on screen the whole time and is only swapped out once the
  // fresh copy lands, instead of the view going blank for a moment while
  // it reloads. Months the person isn't looking at aren't touched.
  const refresh = useCallback(() => {
    for (const key of monthKeys) loadMonth(key);
  }, [monthKeys, loadMonth]);

  // Someone else (another tab/device) changed a family setting or the
  // member list — pick it up live instead of waiting for a page reload.
  useFamilySyncListener(
    ["family"],
    useCallback(() => {
      bumpFamilyVersion();
      refresh();
    }, [bumpFamilyVersion, refresh])
  );

  // Someone else added/edited/deleted a calendar event — the events
  // themselves live on Google's side, not in our DB, so a plain cache-bust
  // + refetch (rather than a patch) is what picks the change up.
  useFamilySyncListener(["calendar"], refresh);

  const events = useMemo(
    () => monthKeys.flatMap((key) => monthCache.get(key)?.events ?? []),
    [monthKeys, monthCache]
  );

  const visibleEvents = useMemo(
    () => events.filter((event) => !event.memberId || !hiddenMemberIds.has(event.memberId)),
    [events, hiddenMemberIds]
  );

  // Folds the same occurrence appearing on more than one family member's
  // calendar (a shared contact's birthday synced into everyone's Google
  // Calendar is the common case) into one entry carrying every contributor,
  // instead of showing it once per person who has it. Runs AFTER the
  // member-visibility filter above, so hiding a member's dot also removes
  // just their copy from a merged entry rather than the merge being
  // computed on events the person already asked not to see.
  const dedupedEvents = useMemo(
    () => dedupeCalendarEvents(visibleEvents, session?.userId ?? null),
    [visibleEvents, session?.userId]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const event of dedupedEvents) {
      const eventDate = parseEventDate(event.start, event.allDay);
      for (const day of days) {
        if (isSameDay(eventDate, day)) {
          map.get(day.toDateString())!.push(event);
          break;
        }
      }
    }
    return map;
  }, [dedupedEvents, days]);

  function step(direction: -1 | 1) {
    setAnchor((prev) => {
      if (viewMode === "day") return addDays(prev, direction);
      if (viewMode === "week") return addDays(prev, direction * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
    });
  }

  function goToday() {
    setAnchor(startOfDay(new Date()));
  }

  function toggleMember(memberId: string) {
    setHiddenMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  const currentMember = useMemo(
    () => members.find((member) => member.id === session?.userId),
    [members, session?.userId]
  );

  // Only treat this as a hard error if every month in view failed AND we
  // have no cached fallback to show instead.
  const hasAnyDataInView = monthKeys.some((key) => monthCache.has(key));
  const allMonthsFailed =
    monthKeys.length > 0 && monthKeys.every((key) => failedMonths.has(key)) && !hasAnyDataInView;
  const isBackgroundSyncing = hasAnyDataInView && monthKeys.some((key) => loadingMonths.has(key));

  const headerLabel =
    viewMode === "month"
      ? MONTH_YEAR.format(anchor)
      : viewMode === "day"
        ? DAY_LABEL.format(anchor)
        : `${WEEK_RANGE.format(days[0])} – ${WEEK_RANGE.format(days[6])}`;

  return (
    <div style={styles.page}>
      <div className="decal-shell" style={{ gap: showSidePanel ? 24 : 0 }}>
        <div className="decal-main">
          <header style={styles.header}>
            <div>
              <p style={styles.eyebrow}>Decal</p>
              <h1 style={styles.monthLabel}>{headerLabel}</h1>
            </div>

            <div style={styles.controls}>
              <div style={styles.navGroup}>
                <button style={styles.navButton} onClick={() => step(-1)} aria-label="Previous">
                  <ChevronIcon direction="left" />
                </button>
                <button style={styles.todayButton} onClick={goToday}>
                  Today
                </button>
                <button style={styles.navButton} onClick={() => step(1)} aria-label="Next">
                  <ChevronIcon direction="right" />
                </button>
                {isBackgroundSyncing && <span style={styles.syncingLabel}>Syncing&hellip;</span>}
              </div>

              <div style={styles.viewToggle}>
                {(["day", "week", "month"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      ...styles.viewToggleButton,
                      ...(viewMode === mode ? styles.viewToggleButtonActive : {})
                    }}
                  >
                    {mode === "day" ? "Day" : mode === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>

              <div style={styles.headerRight}>
                <button
                  type="button"
                  style={styles.screensaverButton}
                  onClick={() => setManualScreensaver(true)}
                  aria-label="Start screensaver"
                  title="Start screensaver"
                >
                  <ScreensaverIcon />
                </button>
                <button type="button" style={styles.familyButton} onClick={() => setShowFamilyModal(true)}>
                  Family
                </button>
                <ProfileMenu color={currentMember?.color} onColorChanged={refresh} />
              </div>
            </div>
          </header>

          {members.length > 1 && (
            <div style={styles.filterRow}>
              {members.map((member) => {
                const active = !hiddenMemberIds.has(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    aria-pressed={active}
                    aria-label={member.name ?? "Family member"}
                    title={member.name ?? "Family member"}
                    style={{
                      ...styles.filterDot,
                      borderColor: member.color,
                      background: active ? member.color : "transparent"
                    }}
                  />
                );
              })}
            </div>
          )}

          {allMonthsFailed && (
            <p style={styles.errorBanner}>
              Couldn&rsquo;t reach Google Calendar. Check your connection and try again.
            </p>
          )}

          {!allMonthsFailed && needsReconnect.length > 0 && (
            <p style={styles.warnBanner}>
              {needsReconnect.join(", ")} {needsReconnect.length === 1 ? "needs" : "need"} to sign in to
              Decal again to reconnect {needsReconnect.length === 1 ? "their calendar" : "their calendars"}.
            </p>
          )}

          {!allMonthsFailed && unavailable.length > 0 && (
            <p style={styles.warnBanner}>
              {unavailable.length === 1 ? `${unavailable[0]}'s calendar` : `${unavailable.join(", ")}'s calendars`}{" "}
              couldn&rsquo;t be loaded right now.
            </p>
          )}

          <div className="decal-calendar-scroll">
            {/* Keying on view+anchor replays the fade-in whenever the
                visible window changes (switching views, stepping a
                day/week/month) — a small motion cue instead of the new
                content just snapping into place. */}
            <div key={`${viewMode}-${anchor.toDateString()}`} className="decal-fade-in">
              {viewMode === "day" ? (
                <DayView events={eventsByDay.get(anchor.toDateString()) ?? []} onSelectEvent={setSelectedEvent} />
              ) : viewMode === "week" ? (
                <div style={styles.weekGrid}>
                  {days.map((day) => (
                    <DayColumn
                      key={day.toDateString()}
                      date={day}
                      isToday={isSameDay(day, today)}
                      events={eventsByDay.get(day.toDateString()) ?? []}
                      onSelectDay={(selected) => {
                        setAnchor(selected);
                        setViewMode("day");
                      }}
                      onSelectEvent={setSelectedEvent}
                    />
                  ))}
                </div>
              ) : (
                <MonthGrid
                  days={days}
                  anchorMonth={anchor.getMonth()}
                  today={today}
                  eventsByDay={eventsByDay}
                  onSelectDay={(day) => {
                    setAnchor(day);
                    setViewMode("day");
                  }}
                  onSelectEvent={setSelectedEvent}
                />
              )}
            </div>
          </div>
        </div>

        {/* Both cards collapse together — hiding the panel is meant to free
            up room for the calendar, and a lone Quick Add card left behind
            would defeat that. Stays mounted (just visually collapsed) so
            reopening doesn't lose anything either card had loaded. */}
        <div
          className={`decal-sidepanel${showSidePanel ? "" : " decal-sidepanel-hidden"}`}
          aria-hidden={!showSidePanel}
          // This React/ReactDOM version only accepts `inert` as present-or-
          // absent, not a real boolean — passing `false` explicitly logs a
          // DOM-attribute warning. Omit it entirely instead of setting false.
          inert={!showSidePanel || undefined}
        >
          <FamilyPanel
            members={members}
            familyVersion={familyVersion}
            onClose={() => setShowSidePanel(false)}
          />
          <QuickAddPanel />
        </div>
      </div>

      {!showSidePanel && (
        <button
          type="button"
          style={styles.edgeTab}
          onClick={() => setShowSidePanel(true)}
          aria-label="Show panel"
          title="Show panel"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden="true">
            <path
              d="M7.5 1.5L1.5 7.5L7.5 13.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onChanged={refresh}
        />
      )}

      {showFamilyModal && (
        <FamilyModal onClose={() => setShowFamilyModal(false)} onFamilyChanged={bumpFamilyVersion} />
      )}

      {showScreensaver && <Screensaver onDismiss={() => setManualScreensaver(false)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100dvh",
    overflow: "hidden",
    padding: "32px 40px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--accent-1)",
    margin: "0 0 4px"
  },
  monthLabel: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontWeight: 600,
    fontSize: "clamp(26px, 3.4vw, 40px)",
    margin: 0
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap"
  },
  navGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  navButton: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-paper)",
    cursor: "pointer",
    fontSize: 14,
    transition: "background 0.15s ease"
  },
  todayButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "7px 14px",
    color: "var(--color-paper)",
    fontSize: 13,
    cursor: "pointer",
    transition: "background 0.15s ease"
  },
  syncingLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--color-muted)",
    marginLeft: 4
  },
  viewToggle: {
    display: "flex",
    background: "var(--color-panel)",
    borderRadius: 999,
    padding: 3,
    border: "1px solid var(--color-hairline)"
  },
  viewToggleButton: {
    background: "transparent",
    border: "none",
    borderRadius: 999,
    padding: "7px 16px",
    fontSize: 13,
    color: "var(--color-muted)",
    cursor: "pointer",
    transition: "background 0.18s ease, color 0.18s ease"
  },
  viewToggleButtonActive: {
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    fontWeight: 600
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 14
  },
  screensaverButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-muted)",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease"
  },
  familyButton: {
    background: "transparent",
    color: "var(--color-paper)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s ease"
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -8
  },
  filterDot: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    borderWidth: 2.5,
    borderStyle: "solid",
    padding: 0,
    cursor: "pointer",
    transition: "background 0.15s ease"
  },
  errorBanner: {
    background: "rgba(240, 99, 61, 0.12)",
    border: "1px solid var(--accent-1)",
    borderRadius: "var(--radius-tag)",
    padding: "10px 16px",
    fontSize: 13,
    margin: 0
  },
  warnBanner: {
    background: "rgba(231, 169, 59, 0.1)",
    border: "1px solid var(--accent-3)",
    borderRadius: "var(--radius-tag)",
    padding: "10px 16px",
    fontSize: 13,
    margin: 0,
    color: "var(--color-paper)"
  },
  weekGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 14,
    flex: 1
  },
  // A discreet handle rather than a labeled button — sits flush against
  // the right edge of the viewport so it reads as "there's more here" and
  // doesn't compete with the header for attention while the panel is
  // hidden.
  edgeTab: {
    position: "fixed",
    right: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: 20,
    height: 68,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRight: "none",
    borderRadius: "12px 0 0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-muted)",
    cursor: "pointer",
    padding: 0,
    opacity: 0.7,
    transition: "opacity 0.15s ease, width 0.15s ease",
    zIndex: 20
  }
};
