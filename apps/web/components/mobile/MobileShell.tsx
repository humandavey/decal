"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

function TodayIcon({ active }: { active: boolean }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {active && <circle cx="12" cy="15" r="2.4" fill="currentColor" />}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 9.5h17M8 3v3M16 3v3M7.5 13h3M7.5 16.5h3M13.5 13h3M13.5 16.5h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="9.5" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M14.7 15c2.5.2 4.3 2.4 4.3 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const TABS: Tab[] = [
  { href: "/m", label: "Today", icon: (active) => <TodayIcon active={active} /> },
  { href: "/m/calendar", label: "Calendar", icon: () => <CalendarIcon /> },
  { href: "/m/family", label: "Family", icon: () => <FamilyIcon /> },
  { href: "/m/profile", label: "Profile", icon: () => <ProfileIcon /> }
];

/** The mobile app's whole navigation shell — a bottom tab bar plus a
 * scrollable content area, replacing the kiosk dashboard's side-by-side
 * panels entirely rather than trying to cram them into a phone screen.
 * There's deliberately no screensaver here (that's a stationary-kiosk
 * idea, not one for a phone you're actively holding) and no calendar +
 * chores shown at once — each is its own tab, one thing on screen at a
 * time, the way a phone app is actually used. */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    // decal-mobile: scopes the iOS input-zoom fix in globals.css to just
    // this route tree — see the comment there for why it's not global.
    <div className="decal-mobile" style={styles.shell}>
      <div style={styles.content}>{children}</div>
      <nav style={styles.tabBar}>
        {TABS.map((tab) => {
          // Exact match for "/m" (else it'd stay lit on every sub-route);
          // prefix match for the rest, so e.g. "/m/family" and a future
          // "/m/family/notes" both light up the same tab.
          const active = tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{ ...styles.tabLink, color: active ? "var(--accent-1)" : "var(--color-muted)" }}
            >
              {tab.icon(active)}
              <span style={styles.tabLabel}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-ink-deep)"
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    // Extra bottom padding so the last bit of scrollable content never
    // sits behind the fixed tab bar.
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 84px)"
  },
  tabBar: {
    display: "flex",
    flexShrink: 0,
    borderTop: "1px solid var(--color-hairline-strong)",
    background: "var(--color-panel)",
    // Real safe-area padding on top of a fixed floor — a phone with no
    // home-indicator inset still gets a comfortable tap zone, a phone with
    // one doesn't have its tab bar crowded against the edge.
    paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)"
  },
  tabLink: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    padding: "10px 4px 2px",
    minHeight: 52,
    textDecoration: "none"
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.01em"
  }
};
