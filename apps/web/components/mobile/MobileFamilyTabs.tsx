"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChoresTab } from "../ChoresTab";
import { MealsTab } from "../MealsTab";
import { TodoTab } from "../TodoTab";
import { GroceryTab } from "../GroceryTab";
import { NotesTab } from "../NotesTab";
import type { MemberOption } from "../MemberPicker";
import { useFamilySyncListener } from "@/lib/useFamilySync";

type Tab = "chores" | "meals" | "todo" | "groceries" | "notes";

const TABS: { id: Tab; label: string; accent: string }[] = [
  { id: "chores", label: "Chores", accent: "var(--accent-2)" },
  { id: "meals", label: "Meals", accent: "var(--accent-3)" },
  { id: "todo", label: "To-do", accent: "var(--accent-4)" },
  { id: "groceries", label: "Groceries", accent: "var(--accent-1)" },
  { id: "notes", label: "Notes", accent: "var(--accent-5)" }
];

function isTab(value: string | null): value is Tab {
  return Boolean(value) && TABS.some((t) => t.id === value);
}

/** The same five lists the desktop sidebar's FamilyPanel offers (Chores,
 * Meals, To-do, Groceries, Notes) — reusing those exact tab components as-
 * is, since they were already built as self-contained cards rather than
 * anything shaped specifically for the kiosk's narrow sidebar. Framed here
 * as a full page with a top segmented control instead of a sidebar tab
 * row, since the bottom nav already owns tab-switching between Today /
 * Calendar / Family / Profile — a second bottom bar would be confusing. */
export function MobileFamilyTabs() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(initial) ? initial : "chores");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [familyVersion, setFamilyVersion] = useState(0);

  const loadMembers = useCallback(() => {
    fetch("/api/family")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.members) return;
        setMembers(
          data.members.map((m: { userId: string; name: string | null; color: string }) => ({
            id: m.userId,
            name: m.name,
            color: m.color
          }))
        );
      })
      .catch(() => {});
  }, []);

  useEffect(loadMembers, [loadMembers]);

  // Same pattern as CalendarBoard: a family-setting change elsewhere bumps
  // this, which the tabs below read to refetch settings live rather than
  // needing the page reloaded.
  useFamilySyncListener(
    ["family"],
    useCallback(() => {
      setFamilyVersion((v) => v + 1);
      loadMembers();
    }, [loadMembers])
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.tabRow}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
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
      <div style={styles.body}>
        {tab === "chores" && <ChoresTab members={members} familyVersion={familyVersion} />}
        {tab === "meals" && <MealsTab members={members} familyVersion={familyVersion} />}
        {tab === "todo" && <TodoTab members={members} />}
        {tab === "groceries" && <GroceryTab />}
        {tab === "notes" && <NotesTab />}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" },
  tabRow: {
    display: "flex",
    gap: 2,
    overflowX: "auto",
    borderBottom: "1px solid var(--color-hairline)",
    // Negative margin lets the scrollable strip run edge-to-edge (matching
    // MobileShell's content padding) without the tab row itself needing to
    // know about that padding.
    margin: "0 -16px",
    padding: "0 16px"
  },
  tabButton: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "10px 12px 12px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-muted)",
    cursor: "pointer",
    minHeight: 44,
    whiteSpace: "nowrap",
    flexShrink: 0
  },
  body: { flex: 1 }
};
