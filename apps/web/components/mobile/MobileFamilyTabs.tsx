"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChoresTab } from "../ChoresTab";
import { MealsTab } from "../MealsTab";
import { TodoTab } from "../TodoTab";
import { GroceryTab } from "../GroceryTab";
import { NotesTab } from "../NotesTab";
import { FamilyModal } from "../FamilyModal";
import type { MemberOption } from "../MemberPicker";
import { useFamilySyncListener } from "@/lib/useFamilySync";

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 12.9a7.6 7.6 0 0 0 .07-.9 7.6 7.6 0 0 0-.07-.9l2-1.56a.5.5 0 0 0 .12-.63l-1.9-3.3a.5.5 0 0 0-.6-.22l-2.36.95a7.1 7.1 0 0 0-1.55-.9l-.36-2.5a.5.5 0 0 0-.5-.42h-3.8a.5.5 0 0 0-.5.42l-.36 2.5c-.56.22-1.08.53-1.55.9l-2.36-.95a.5.5 0 0 0-.6.22l-1.9 3.3a.5.5 0 0 0 .12.63l2 1.56c-.04.3-.07.6-.07.9s.03.6.07.9l-2 1.56a.5.5 0 0 0-.12.63l1.9 3.3a.5.5 0 0 0 .6.22l2.36-.95c.47.37.99.68 1.55.9l.36 2.5a.5.5 0 0 0 .5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.5c.56-.22 1.08-.53 1.55-.9l2.36.95a.5.5 0 0 0 .6-.22l1.9-3.3a.5.5 0 0 0-.12-.63l-2-1.56Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const [showSettings, setShowSettings] = useState(false);

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
      <div style={styles.headerRow}>
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
        {/* The desktop kiosk gets to this same content — members, invite
            code, chore scoring, meal-prep types, weather location,
            screensaver — via a "Family" button in its always-visible
            header (see CalendarBoard). Mobile has no such header, and this
            page's own "Family" *tab* is already the chores/meals/etc. list
            above, so a settings icon here is the mobile equivalent of that
            button rather than a second thing confusingly also called
            "Family". */}
        <button
          type="button"
          style={styles.settingsButton}
          onClick={() => setShowSettings(true)}
          aria-label="Family settings"
        >
          <SettingsIcon />
        </button>
      </div>
      <div style={styles.body}>
        {tab === "chores" && <ChoresTab members={members} familyVersion={familyVersion} />}
        {tab === "meals" && <MealsTab members={members} familyVersion={familyVersion} />}
        {tab === "todo" && <TodoTab members={members} />}
        {tab === "groceries" && <GroceryTab />}
        {tab === "notes" && <NotesTab />}
      </div>

      {showSettings && (
        <FamilyModal
          onClose={() => setShowSettings(false)}
          onFamilyChanged={() => {
            setFamilyVersion((v) => v + 1);
            loadMembers();
          }}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" },
  // Negative margin lets the row run edge-to-edge (matching MobileShell's
  // content padding) without the tabs themselves needing to know about it —
  // the settings button gets its own right-side padding back so it isn't
  // flush against the screen edge.
  headerRow: {
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid var(--color-hairline)",
    margin: "0 -16px",
    padding: "0 8px 0 16px"
  },
  tabRow: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    overflowX: "auto",
    flex: 1,
    minWidth: 0
  },
  settingsButton: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
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
