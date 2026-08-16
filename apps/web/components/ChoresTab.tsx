"use client";

import { useEffect, useState } from "react";
import { formatDueDate, parseDateOnly } from "@/lib/dates";
import { MemberPicker, type MemberOption } from "./MemberPicker";
import { useFamilySyncListener } from "@/lib/useFamilySync";

interface ChoreItem {
  id: string;
  title: string;
  points: number;
  recurrence: string | null;
  dueDate: string | null;
  rotationEnabled: boolean;
  assignees: { id: string; name: string | null }[];
  onDuty: { id: string; name: string | null } | null;
  completedToday: boolean;
}

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "One-time" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MON,TUE,WED,THU,FRI", label: "Weekdays" }
];

interface ChoresTabProps {
  members: MemberOption[];
  /** Bumped when family settings (the scoring toggle) change elsewhere —
   * refetches live instead of needing a page reload. */
  familyVersion: number;
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

/** Two curved arrows chasing each other — the "this rotates" signal next
 * to whoever's currently on duty for a rotating chore. */
function RotateIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.2h-3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChoresTab({ members, familyVersion }: ChoresTabProps) {
  const [chores, setChores] = useState<ChoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPoints, setNewPoints] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssignees, setNewAssignees] = useState<string[]>([]);
  const [newRotation, setNewRotation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Whether the family tracks chore points at all — set in family settings.
  // Defaults to on until that loads, so points UI doesn't flash away.
  const [scoringEnabled, setScoringEnabled] = useState(true);

  const today = new Date();

  async function load() {
    const res = await fetch("/api/chores");
    if (res.ok) {
      const data = await res.json();
      setChores(data.chores);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Someone else completed/added/removed a chore in another tab/device —
  // refetch live instead of waiting for a page reload.
  useFamilySyncListener(["chores"], load);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/family")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.choresScoringEnabled === "boolean") {
          setScoringEnabled(data.choresScoringEnabled);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyVersion]);

  async function toggle(chore: ChoreItem) {
    setChores((prev) =>
      prev.map((c) => (c.id === chore.id ? { ...c, completedToday: !c.completedToday } : c))
    );
    await fetch(`/api/chores/${chore.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !chore.completedToday })
    });
  }

  async function removeChore(chore: ChoreItem) {
    if (!window.confirm(`Remove "${chore.title}"?`)) return;
    setChores((prev) => prev.filter((c) => c.id !== chore.id));
    await fetch(`/api/chores/${chore.id}`, { method: "DELETE" });
  }

  async function addChore(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/chores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        points: newPoints ? Number(newPoints) : 0,
        recurrence: newRecurrence || null,
        dueDate: newDueDate || null,
        assigneeIds: newAssignees,
        rotationEnabled: newRotation
      })
    });
    setSubmitting(false);
    if (res.ok) {
      setNewTitle("");
      setNewPoints("");
      setNewRecurrence("");
      setNewDueDate("");
      setNewAssignees([]);
      setNewRotation(false);
      setShowForm(false);
      load();
    }
  }

  if (loading) return <p style={styles.muted}>Loading chores&hellip;</p>;

  return (
    <div style={styles.wrap}>
      {chores.length === 0 && !showForm && (
        <p style={styles.muted}>No chores yet — add the first one below.</p>
      )}

      {chores.map((chore) => {
        const due = chore.dueDate ? formatDueDate(parseDateOnly(chore.dueDate), today) : null;
        return (
          <div key={chore.id} style={styles.row}>
            <label style={styles.rowLabel}>
              <input
                type="checkbox"
                checked={chore.completedToday}
                onChange={() => toggle(chore)}
                style={styles.hiddenCheckbox}
              />
              <span style={{ ...styles.checkbox, ...(chore.completedToday ? styles.checkboxOn : {}) }}>
                {chore.completedToday && <CheckIcon />}
              </span>
              <div style={styles.rowBody}>
                <span style={{ ...styles.title, ...(chore.completedToday ? styles.titleDone : {}) }}>
                  {chore.title}
                </span>
                <div style={styles.metaRow}>
                  {scoringEnabled && chore.points > 0 && (
                    <span style={styles.points}>{chore.points} pts</span>
                  )}
                  {chore.recurrence && <span style={styles.badge}>{recurrenceLabel(chore.recurrence)}</span>}
                  {due && (
                    <span style={{ ...styles.badge, ...(due.overdue ? styles.badgeOverdue : {}) }}>
                      {due.label}
                    </span>
                  )}
                  {/* Rotating chores show only whoever's up this time —
                      listing everyone eligible would bury the one thing
                      that actually matters: whose turn it is. */}
                  {chore.rotationEnabled && chore.onDuty ? (
                    <span style={styles.assigneeTag}>
                      <RotateIcon />
                      {chore.onDuty.name ?? "Someone"}
                    </span>
                  ) : (
                    chore.assignees.map((a) => (
                      <span key={a.id} style={styles.assigneeTag}>
                        {a.name ?? "Someone"}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </label>
            <button
              type="button"
              onClick={() => removeChore(chore)}
              style={styles.removeButton}
              aria-label={`Remove ${chore.title}`}
            >
              &times;
            </button>
          </div>
        );
      })}

      {showForm ? (
        <form onSubmit={addChore} style={styles.form}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Chore (e.g. Take out trash)"
            style={styles.input}
          />

          <div style={styles.formGrid}>
            {scoringEnabled && (
              <label style={styles.fieldLabel}>
                Points
                <input
                  type="number"
                  min={0}
                  value={newPoints}
                  onChange={(e) => setNewPoints(e.target.value)}
                  style={styles.input}
                  placeholder="0"
                />
              </label>
            )}
            <label style={styles.fieldLabel}>
              Repeats
              <select
                value={newRecurrence}
                onChange={(e) => setNewRecurrence(e.target.value)}
                style={styles.select}
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              Due date
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                style={styles.input}
              />
            </label>
          </div>

          <div style={styles.fieldLabel}>
            Assign to
            <MemberPicker mode="multi" members={members} selected={newAssignees} onChange={setNewAssignees} />
          </div>

          {newAssignees.length >= 2 && (
            <label style={styles.rotationRow}>
              <input
                type="checkbox"
                checked={newRotation}
                onChange={(e) => setNewRotation(e.target.checked)}
              />
              Rotate between them — one person&rsquo;s on duty at a time, passing along each time
              it&rsquo;s completed
            </label>
          )}

          <div style={styles.formActions}>
            <button type="button" style={styles.cancelButton} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" style={styles.addButton} disabled={submitting}>
              {submitting ? "Adding…" : "Add chore"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" style={styles.newButton} onClick={() => setShowForm(true)}>
          + Add a chore
        </button>
      )}
    </div>
  );
}

function recurrenceLabel(value: string) {
  const match = RECURRENCE_OPTIONS.find((opt) => opt.value === value);
  return match?.label ?? value;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 12,
    padding: "12px 14px"
  },
  rowLabel: { display: "flex", alignItems: "flex-start", gap: 12, flex: 1, cursor: "pointer" },
  // Native checkbox stays for accessibility (label click forwards to it)
  // but is visually hidden — the span right after it is the checkbox
  // people actually see, styled from `completedToday` directly.
  hiddenCheckbox: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    border: "none"
  },
  checkbox: {
    width: 27,
    height: 27,
    marginTop: 1,
    borderRadius: 9,
    border: "2px solid var(--color-hairline-strong)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "var(--color-ink-deep)",
    transition: "background 0.15s ease, border-color 0.15s ease"
  },
  checkboxOn: {
    background: "var(--accent-2)",
    borderColor: "var(--accent-2)"
  },
  rowBody: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 1.35 },
  titleDone: { textDecoration: "line-through", color: "var(--color-muted)" },
  metaRow: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  points: { fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--accent-3)" },
  badge: {
    fontSize: 11,
    color: "var(--color-muted)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "2px 9px"
  },
  badgeOverdue: {
    color: "var(--accent-1)",
    borderColor: "rgba(240, 99, 61, 0.5)"
  },
  assigneeTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "var(--color-ink-deep)",
    background: "var(--color-muted)",
    borderRadius: 999,
    padding: "2px 9px",
    fontWeight: 600
  },
  removeButton: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 22,
    width: 40,
    height: 40,
    flexShrink: 0,
    cursor: "pointer",
    lineHeight: 1
  },
  newButton: {
    background: "transparent",
    border: "1px dashed var(--color-hairline-strong)",
    borderRadius: 12,
    padding: "13px 16px",
    fontSize: 14,
    color: "var(--color-muted)",
    cursor: "pointer",
    textAlign: "left"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 12,
    padding: 14
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--color-muted)"
  },
  rotationRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 12.5,
    lineHeight: 1.4,
    color: "var(--color-muted)",
    cursor: "pointer"
  },
  input: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    minHeight: 44,
    color: "var(--color-paper)",
    fontSize: 14.5,
    fontFamily: "inherit"
  },
  select: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    minHeight: 44,
    color: "var(--color-paper)",
    fontSize: 14.5,
    fontFamily: "inherit"
  },
  formActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancelButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "11px 18px",
    minHeight: 44,
    fontSize: 13.5,
    color: "var(--color-paper)",
    cursor: "pointer"
  },
  addButton: {
    background: "var(--accent-2)",
    border: "none",
    borderRadius: 999,
    padding: "11px 20px",
    minHeight: 44,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  }
};
