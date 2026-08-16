"use client";

import { useEffect, useState } from "react";
import { formatDueDate, parseDateOnly } from "@/lib/dates";
import { MemberPicker, type MemberOption } from "./MemberPicker";
import { useFamilySyncListener } from "@/lib/useFamilySync";

interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  assignee: { id: string; name: string | null } | null;
}

interface TodoTabProps {
  members: MemberOption[];
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

/** "More options" — sliders icon toggling the assign/due-date fields. */
function DetailsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="4.5" r="1.6" fill="currentColor" />
      <path d="M7 4.5H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 4.5H2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11.5" cy="11.5" r="1.6" fill="currentColor" />
      <path d="M2 11.5H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.1 11.5H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TodoTab({ members }: TodoTabProps) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssignee, setNewAssignee] = useState<string | null>(null);
  const [showNewDetails, setShowNewDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const today = new Date();
  const memberById = new Map(members.map((m) => [m.id, m]));

  async function load() {
    const res = await fetch("/api/todos");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Someone else added/checked-off/removed a to-do in another tab/device —
  // refetch live instead of waiting for a page reload.
  useFamilySyncListener(["todos"], load);

  async function toggle(item: TodoItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    await fetch(`/api/todos/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.done })
    });
  }

  async function remove(item: TodoItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await fetch(`/api/todos/${item.id}`, { method: "DELETE" });
  }

  async function updateDetails(item: TodoItem, patch: { assigneeId?: string | null; dueDate?: string | null }) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              ...("assigneeId" in patch
                ? { assignee: patch.assigneeId ? memberById.get(patch.assigneeId) ?? null : null }
                : {}),
              ...("dueDate" in patch ? { dueDate: patch.dueDate ?? null } : {})
            }
          : i
      )
    );
    await fetch(`/api/todos/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        dueDate: newDueDate || null,
        assigneeId: newAssignee || null
      })
    });
    if (res.ok) {
      setNewTitle("");
      setNewDueDate("");
      setNewAssignee(null);
      // Leave the details panel open/closed as-is — handy for adding a
      // run of items that all want the same kind of detail without
      // reopening it each time.
      load();
    }
  }

  if (loading) return <p style={styles.muted}>Loading to-dos&hellip;</p>;

  return (
    <div style={styles.wrap}>
      <form onSubmit={addItem} style={styles.form}>
        <div style={styles.quickRow}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add something to the list"
            style={styles.input}
          />
          <button
            type="button"
            onClick={() => setShowNewDetails((v) => !v)}
            style={{ ...styles.detailsToggle, ...(showNewDetails ? styles.detailsToggleOn : {}) }}
            aria-pressed={showNewDetails}
            aria-label="Assign or set a due date"
          >
            <DetailsIcon />
          </button>
          <button
            type="submit"
            style={{ ...styles.addButton, ...(newTitle.trim() ? {} : styles.addButtonDisabled) }}
            disabled={!newTitle.trim()}
          >
            +
          </button>
        </div>

        {showNewDetails && (
          <div style={styles.detailsPanel}>
            <div style={styles.fieldLabel}>
              Assign to
              <MemberPicker
                mode="single"
                members={members}
                allowUnassigned
                selected={newAssignee}
                onChange={setNewAssignee}
              />
            </div>
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
        )}
      </form>

      {items.length === 0 && <p style={styles.muted}>Nothing on the list yet.</p>}

      {items.map((item) => {
        const due = item.dueDate ? formatDueDate(parseDateOnly(item.dueDate), today) : null;
        const editing = editingId === item.id;
        return (
          <div key={item.id} style={styles.itemWrap}>
            <div style={styles.row}>
              <label style={styles.rowLabel}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggle(item)}
                  style={styles.hiddenCheckbox}
                />
                <span style={{ ...styles.checkbox, ...(item.done ? styles.checkboxOn : {}) }}>
                  {item.done && <CheckIcon />}
                </span>
                <div style={styles.rowBody}>
                  <span style={{ ...styles.title, ...(item.done ? styles.titleDone : {}) }}>
                    {item.title}
                  </span>
                  {(item.assignee || due) && (
                    <div style={styles.metaRow}>
                      {item.assignee?.name && (
                        <span style={styles.assigneeTag}>{item.assignee.name}</span>
                      )}
                      {due && (
                        <span style={{ ...styles.badge, ...(due.overdue ? styles.badgeOverdue : {}) }}>
                          {due.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <button
                type="button"
                onClick={() => setEditingId(editing ? null : item.id)}
                style={styles.editButton}
                aria-label="Edit details"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => remove(item)}
                style={styles.removeButton}
                aria-label={`Delete ${item.title}`}
              >
                &times;
              </button>
            </div>

            {editing && (
              <div style={styles.editPanel}>
                <div style={styles.fieldLabel}>
                  Assign to
                  <MemberPicker
                    mode="single"
                    members={members}
                    allowUnassigned
                    selected={item.assignee?.id ?? null}
                    onChange={(id) => updateDetails(item, { assigneeId: id })}
                  />
                </div>
                <label style={styles.fieldLabel}>
                  Due date
                  <input
                    type="date"
                    value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                    onChange={(e) => updateDetails(item, { dueDate: e.target.value || null })}
                    style={styles.input}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  itemWrap: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 12,
    padding: "12px 10px 12px 14px"
  },
  rowLabel: { display: "flex", alignItems: "flex-start", gap: 12, flex: 1, cursor: "pointer", minWidth: 0 },
  // The native checkbox stays in the DOM (so the row is keyboard/label
  // accessible — clicking the label forwards to it) but is visually
  // hidden; the span right after it is the checkbox people actually see,
  // styled straight from `item.done` instead of a CSS :checked selector.
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
    background: "var(--accent-4)",
    borderColor: "var(--accent-4)"
  },
  rowBody: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 1.35 },
  titleDone: { textDecoration: "line-through", color: "var(--color-muted)" },
  metaRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  assigneeTag: {
    fontSize: 11,
    color: "var(--color-ink-deep)",
    background: "var(--accent-4)",
    borderRadius: 999,
    padding: "2px 9px",
    fontWeight: 600
  },
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
  editButton: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 16,
    width: 40,
    height: 40,
    flexShrink: 0,
    cursor: "pointer"
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
  editPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(237,233,225,0.03)",
    borderRadius: 10,
    padding: 12,
    marginTop: 4
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  quickRow: { display: "flex", gap: 8 },
  detailsToggle: {
    background: "var(--color-panel-raised)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 10,
    width: 44,
    height: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-muted)",
    cursor: "pointer"
  },
  detailsToggleOn: {
    background: "var(--accent-4)",
    borderColor: "var(--accent-4)",
    color: "var(--color-ink-deep)"
  },
  detailsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 12,
    padding: 14
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--color-muted)"
  },
  input: {
    flex: 1,
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    minHeight: 44,
    color: "var(--color-paper)",
    fontSize: 14.5,
    fontFamily: "inherit"
  },
  addButton: {
    background: "var(--accent-4)",
    border: "none",
    borderRadius: 999,
    padding: "11px 20px",
    minHeight: 44,
    minWidth: 44,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  },
  addButtonDisabled: {
    background: "var(--color-panel-raised)",
    color: "var(--color-muted)",
    cursor: "default"
  }
};
