"use client";

import { useState } from "react";
import { ChoresTab } from "./ChoresTab";
import { MealsTab } from "./MealsTab";
import { TodoTab } from "./TodoTab";
import { GroceryTab } from "./GroceryTab";
import { NotesTab } from "./NotesTab";
import type { MemberOption } from "./MemberPicker";

type Tab = "chores" | "meals" | "todo" | "groceries" | "notes";

const TABS: { id: Tab; label: string; accent: string }[] = [
  { id: "chores", label: "Chores", accent: "var(--accent-2)" },
  { id: "meals", label: "Meal plan", accent: "var(--accent-3)" },
  { id: "todo", label: "To-do", accent: "var(--accent-4)" },
  { id: "groceries", label: "Groceries", accent: "var(--accent-1)" },
  { id: "notes", label: "Notes", accent: "var(--accent-5)" }
];

interface FamilyPanelProps {
  members: MemberOption[];
  /** Bumped whenever a family-wide setting changes elsewhere (e.g. the
   * Family modal) — passed through to tabs that read those settings so
   * they refetch live instead of waiting for a page reload. */
  familyVersion: number;
  /** Hides the whole sidebar (this panel + Quick Add below it) — the X
   * button up top calls this. Show/hide itself now lives one level up, in
   * CalendarBoard, since it applies to both stacked cards together. */
  onClose: () => void;
}

/** The right-hand sidebar's top card — Chores / Meal plan / To-do. Its own
 * header + tab row stay put while the tab body scrolls, so it behaves well
 * at any height (kiosk display or a short browser window alike). Sized by
 * its parent's flex layout (see the `.decal-sidepanel` wrapper in
 * CalendarBoard) rather than owning its own width. */
export function FamilyPanel({ members, familyVersion, onClose }: FamilyPanelProps) {
  const [tab, setTab] = useState<Tab>("chores");

  return (
    <section style={styles.panel}>
      <div style={styles.tabRow}>
        <div style={styles.tabScroll}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                ...styles.tabButton,
                ...(tab === t.id ? { color: t.accent, borderBottomColor: t.accent } : {})
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Hide panel">
          &times;
        </button>
      </div>
      <div style={styles.body}>
        {tab === "chores" && <ChoresTab members={members} familyVersion={familyVersion} />}
        {tab === "meals" && <MealsTab members={members} familyVersion={familyVersion} />}
        {tab === "todo" && <TodoTab members={members} />}
        {tab === "groceries" && <GroceryTab />}
        {tab === "notes" && <NotesTab />}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  tabRow: {
    display: "flex",
    alignItems: "center",
    padding: "0 8px 0 16px",
    borderBottom: "1px solid var(--color-hairline)",
    flexShrink: 0
  },
  // Five tabs no longer reliably fit a narrow sidepanel at comfortable tap
  // sizes — this scrolls horizontally instead of wrapping onto an awkward
  // second line, while the close button (outside this div) always stays
  // put on the right rather than scrolling out of reach with it.
  tabScroll: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    overflowX: "auto",
    flex: 1,
    minWidth: 0
  },
  tabButton: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "16px 9px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-muted)",
    cursor: "pointer",
    minHeight: 48,
    whiteSpace: "nowrap",
    flexShrink: 0
  },
  closeButton: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 22,
    lineHeight: 1,
    width: 44,
    height: 44,
    flexShrink: 0,
    cursor: "pointer"
  },
  body: {
    padding: 18,
    overflowY: "auto",
    flex: 1,
    minHeight: 0
  }
};
