"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, isSameDay, parseDateOnly, startOfDay } from "@/lib/dates";
import { MemberPicker, type MemberOption } from "./MemberPicker";
import { useFamilySyncListener } from "@/lib/useFamilySync";

type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack"
};
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });

function CartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.5h1.6l1.3 8.2a1.4 1.4 0 0 0 1.4 1.2h5.9a1.4 1.4 0 0 0 1.4-1.1l1-5.4H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.2" cy="14" r="1" fill="currentColor" />
      <circle cx="11.4" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.3L6.4 11.7L13 4.5"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MealEntry {
  date: string;
  mealType: MealType;
  title: string;
  notes: string | null;
  assignee: { id: string; name: string | null } | null;
}

function keyFor(date: Date, mealType: MealType) {
  return `${startOfDay(date).toDateString()}__${mealType}`;
}

interface MealsTabProps {
  members: MemberOption[];
  /** Bumped when family settings (meal-prep toggles) change elsewhere —
   * refetches enabled meal types live instead of needing a page reload. */
  familyVersion: number;
}

export function MealsTab({ members, familyVersion }: MealsTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState<Map<string, MealEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssignee, setEditAssignee] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Slot keys whose "add to groceries" button was just pressed — swaps in a
  // checkmark for a couple seconds as lightweight confirmation, then reverts
  // (no persistent "already added" tracking; pushing the same meal twice is
  // harmless, it just makes two list entries).
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  // Which slots this family actually plans for (e.g. dinner-only) — set in
  // family settings. Defaults to all four until that loads, so nothing
  // flashes empty.
  const [enabledMealTypes, setEnabledMealTypes] = useState<MealType[]>(MEAL_TYPES);

  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => {
    const base = addDays(today, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [today, weekOffset]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/family")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.mealPrepTypes?.length) return;
        setEnabledMealTypes(data.mealPrepTypes.filter((t: string) => MEAL_TYPES.includes(t as MealType)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyVersion]);

  // Guards against a slower, now-stale request (e.g. from a rapid week
  // change, or a sync-triggered refetch racing the initial load) clobbering
  // a newer one that already landed.
  const loadRequestId = useRef(0);

  // `silent` skips the loading state — used for background refreshes
  // (another tab/device changed something) so the whole week doesn't flash
  // away and reappear; the visible entries just get swapped in-place once
  // the fresh copy lands. A direct week change still shows the loading
  // state since that's an intentional "go elsewhere" navigation.
  const fetchEntries = useCallback(
    async (opts?: { silent?: boolean }) => {
      const requestId = ++loadRequestId.current;
      if (!opts?.silent) setLoading(true);
      const params = new URLSearchParams({
        start: days[0].toISOString(),
        end: days[days.length - 1].toISOString()
      });
      const res = await fetch(`/api/meals?${params}`);
      if (res.ok) {
        const data = await res.json();
        const map = new Map<string, MealEntry>();
        for (const entry of data.entries as MealEntry[]) {
          // entry.date is a UTC-midnight instant for a calendar day, not a
          // timestamp — parseDateOnly (not `new Date(...)`) is what keeps
          // this on the right local day instead of shifting back one in
          // negative-UTC-offset timezones. Same bug class as the birthday
          // off-by-one fixed earlier.
          map.set(keyFor(parseDateOnly(entry.date), entry.mealType), entry);
        }
        if (requestId === loadRequestId.current) setEntries(map);
      }
      if (requestId === loadRequestId.current) setLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [days[0].getTime(), days[6].getTime()]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Someone else edited/cleared a meal slot in another tab/device —
  // refetch live (quietly) instead of waiting for a page reload.
  useFamilySyncListener(
    ["meals"],
    useCallback(() => fetchEntries({ silent: true }), [fetchEntries])
  );

  function openEditor(day: Date, mealType: MealType) {
    const key = keyFor(day, mealType);
    if (openSlot === key) {
      setOpenSlot(null);
      return;
    }
    const existing = entries.get(key);
    setEditTitle(existing?.title ?? "");
    setEditNotes(existing?.notes ?? "");
    setEditAssignee(existing?.assignee?.id ?? null);
    setSaveError(null);
    setOpenSlot(key);
  }

  async function save(day: Date, mealType: MealType) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: day.toISOString(),
          mealType,
          title: editTitle.trim(),
          notes: editNotes.trim() || null,
          assigneeId: editAssignee
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save that — try again.");
      }
      const key = keyFor(day, mealType);
      setEntries((prev) => {
        const next = new Map(prev);
        if (!editTitle.trim()) {
          next.delete(key);
        } else {
          const assignee = editAssignee ? members.find((m) => m.id === editAssignee) ?? null : null;
          next.set(key, {
            date: day.toISOString(),
            mealType,
            title: editTitle.trim(),
            notes: editNotes.trim() || null,
            assignee: assignee ? { id: assignee.id, name: assignee.name } : null
          });
        }
        return next;
      });
      setOpenSlot(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function clear(day: Date, mealType: MealType) {
    setEditTitle("");
    await save(day, mealType);
  }

  async function addToGroceries(key: string, title: string) {
    setAddedKeys((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setAddedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 2000);
    await fetch("/api/groceries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.weekNav}>
        <button type="button" style={styles.navButton} onClick={() => setWeekOffset((w) => w - 1)}>
          &larr;
        </button>
        <span style={styles.weekLabel}>
          {weekOffset === 0 ? "This week" : weekOffset > 0 ? `${weekOffset} week${weekOffset > 1 ? "s" : ""} ahead` : `${-weekOffset} week${weekOffset < -1 ? "s" : ""} ago`}
        </span>
        <button type="button" style={styles.navButton} onClick={() => setWeekOffset((w) => w + 1)}>
          &rarr;
        </button>
      </div>

      {loading ? (
        <p style={styles.muted}>Loading meal plan&hellip;</p>
      ) : (
        <div style={styles.days}>
          {days.map((day) => (
            <div key={day.toDateString()} style={styles.dayCard}>
              <p style={{ ...styles.dayLabel, ...(isSameDay(day, today) ? styles.dayLabelToday : {}) }}>
                {DAY_LABEL.format(day)}
                {isSameDay(day, today) && <span style={styles.todayTag}>Today</span>}
              </p>

              {enabledMealTypes.map((mealType) => {
                const key = keyFor(day, mealType);
                const entry = entries.get(key);
                const open = openSlot === key;
                return (
                  <div key={mealType} style={styles.slotWrap}>
                    <div style={styles.slotRow}>
                      <button
                        type="button"
                        onClick={() => openEditor(day, mealType)}
                        style={{ ...styles.slotButton, flex: 1 }}
                      >
                        <span style={styles.slotType}>{MEAL_LABEL[mealType]}</span>
                        <span style={styles.slotContent}>
                          {entry ? (
                            <>
                              <span style={styles.slotTitle}>{entry.title}</span>
                              {entry.assignee?.name && (
                                <span style={styles.slotAssignee}>{entry.assignee.name}</span>
                              )}
                            </>
                          ) : (
                            <span style={styles.slotPlaceholder}>+ Add</span>
                          )}
                        </span>
                      </button>
                      {entry && (
                        <button
                          type="button"
                          onClick={() => addToGroceries(key, entry.title)}
                          style={styles.groceryButton}
                          aria-label={`Add ${entry.title} to grocery list`}
                          title="Add to grocery list"
                        >
                          {addedKeys.has(key) ? <CheckIcon /> : <CartIcon />}
                        </button>
                      )}
                    </div>

                    {open && (
                      <div style={styles.editPanel}>
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="What's cooking?"
                          style={styles.input}
                        />
                        <input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes (optional)"
                          style={styles.input}
                        />
                        <div style={styles.fieldLabel}>
                          Who&rsquo;s cooking
                          <MemberPicker
                            mode="single"
                            members={members}
                            allowUnassigned
                            unassignedLabel="Anyone"
                            selected={editAssignee}
                            onChange={setEditAssignee}
                          />
                        </div>
                        {saveError && <p style={styles.error}>{saveError}</p>}
                        <div style={styles.editActions}>
                          {entry && (
                            <button
                              type="button"
                              style={styles.clearButton}
                              onClick={() => clear(day, mealType)}
                              disabled={saving}
                            >
                              Clear
                            </button>
                          )}
                          <button
                            type="button"
                            style={styles.saveButton}
                            onClick={() => save(day, mealType)}
                            disabled={saving}
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  weekNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  navButton: {
    background: "var(--color-panel-raised)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    width: 40,
    height: 40,
    color: "var(--color-paper)",
    cursor: "pointer",
    fontSize: 15
  },
  weekLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  days: { display: "flex", flexDirection: "column", gap: 14 },
  dayCard: {
    background: "rgba(237,233,225,0.04)",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  dayLabel: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-muted)",
    margin: "2px 4px 4px",
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  dayLabelToday: { color: "var(--color-paper)" },
  todayTag: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-ink-deep)",
    background: "var(--accent-3)",
    borderRadius: 999,
    padding: "2px 8px"
  },
  slotWrap: { display: "flex", flexDirection: "column" },
  slotRow: { display: "flex", alignItems: "stretch", gap: 6 },
  slotButton: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: 10,
    padding: "12px 14px",
    minHeight: 48,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    minWidth: 0
  },
  groceryButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 44,
    minHeight: 48,
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: 10,
    color: "var(--color-muted)",
    cursor: "pointer",
    transition: "color 0.15s ease, border-color 0.15s ease"
  },
  slotType: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--accent-3)",
    width: 66,
    flexShrink: 0
  },
  slotContent: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  slotTitle: { fontSize: 14, color: "var(--color-paper)" },
  slotAssignee: { fontSize: 11, color: "var(--color-muted)" },
  slotPlaceholder: { fontSize: 13.5, color: "var(--color-muted)", fontStyle: "italic" },
  editPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(237,233,225,0.03)",
    borderRadius: 10,
    padding: 12,
    marginTop: 6
  },
  input: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    minHeight: 44,
    color: "var(--color-paper)",
    fontSize: 14,
    fontFamily: "inherit"
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--color-muted)"
  },
  error: { color: "var(--accent-1)", fontSize: 12.5, margin: 0 },
  editActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  clearButton: {
    background: "transparent",
    border: "1px solid rgba(240, 99, 61, 0.4)",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 44,
    fontSize: 13,
    color: "var(--accent-1)",
    cursor: "pointer"
  },
  saveButton: {
    background: "var(--accent-3)",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    minHeight: 44,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  }
};
