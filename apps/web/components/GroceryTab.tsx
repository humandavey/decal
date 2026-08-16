"use client";

import { useEffect, useState } from "react";
import { useFamilySyncListener } from "@/lib/useFamilySync";

export interface GroceryItem {
  id: string;
  title: string;
  checked: boolean;
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

/** The shared shopping list — deliberately simpler than To-do (no
 * assignees, no due dates): just a title and checked/unchecked, plus a
 * bulk "Clear checked" for after a shopping trip. */
export function GroceryTab() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [clearing, setClearing] = useState(false);

  async function load() {
    const res = await fetch("/api/groceries");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Someone else added/checked/cleared groceries in another tab/device —
  // refetch live instead of waiting for a page reload.
  useFamilySyncListener(["groceries"], load);

  async function toggle(item: GroceryItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    await fetch(`/api/groceries/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !item.checked })
    });
  }

  async function remove(item: GroceryItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await fetch(`/api/groceries/${item.id}`, { method: "DELETE" });
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const res = await fetch("/api/groceries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() })
    });
    if (res.ok) {
      setNewTitle("");
      load();
    }
  }

  async function clearChecked() {
    setClearing(true);
    setItems((prev) => prev.filter((i) => !i.checked));
    await fetch("/api/groceries", { method: "DELETE" });
    setClearing(false);
  }

  if (loading) return <p style={styles.muted}>Loading groceries&hellip;</p>;

  const hasChecked = items.some((i) => i.checked);

  return (
    <div style={styles.wrap}>
      <form onSubmit={addItem} style={styles.quickRow}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add something to buy"
          style={styles.input}
        />
        <button
          type="submit"
          style={{ ...styles.addButton, ...(newTitle.trim() ? {} : styles.addButtonDisabled) }}
          disabled={!newTitle.trim()}
        >
          +
        </button>
      </form>

      {items.length === 0 && <p style={styles.muted}>Nothing on the list yet.</p>}

      {items.map((item) => (
        <div key={item.id} style={styles.row}>
          <label style={styles.rowLabel}>
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => toggle(item)}
              style={styles.hiddenCheckbox}
            />
            <span style={{ ...styles.checkbox, ...(item.checked ? styles.checkboxOn : {}) }}>
              {item.checked && <CheckIcon />}
            </span>
            <span style={{ ...styles.title, ...(item.checked ? styles.titleDone : {}) }}>
              {item.title}
            </span>
          </label>
          <button
            type="button"
            onClick={() => remove(item)}
            style={styles.removeButton}
            aria-label={`Remove ${item.title}`}
          >
            &times;
          </button>
        </div>
      ))}

      {hasChecked && (
        <button type="button" style={styles.clearButton} onClick={clearChecked} disabled={clearing}>
          {clearing ? "Clearing…" : "Clear checked"}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  quickRow: { display: "flex", gap: 8 },
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
    background: "var(--accent-3)",
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
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 12,
    padding: "12px 10px 12px 14px"
  },
  rowLabel: { display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer", minWidth: 0 },
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
    background: "var(--accent-3)",
    borderColor: "var(--accent-3)"
  },
  title: { fontSize: 15, lineHeight: 1.35, minWidth: 0 },
  titleDone: { textDecoration: "line-through", color: "var(--color-muted)" },
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
  clearButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 44,
    fontSize: 13,
    color: "var(--color-muted)",
    cursor: "pointer",
    alignSelf: "flex-start"
  }
};
