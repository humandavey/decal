"use client";

import type { ReactNode } from "react";

interface MobileFullScreenModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Small accent-colored line above the title — e.g. who an event's on. */
  eyebrow?: string;
  eyebrowColor?: string;
}

/** The mobile equivalent of the desktop's centered-card dialogs
 * (EventDetailModal, FamilyModal) — full-bleed instead of a card floating
 * over a dimmed backdrop. On a small phone (an iPhone 13 mini's 375px
 * width, specifically) a centered card leaves barely any room for its own
 * padding, and an absolutely-positioned "X" in the corner ends up
 * uncomfortably close to the edge/notch. This reframes the same content as
 * its own screen instead: a back chevron in a real header, sliding in from
 * the right like native push navigation, rather than fading in over a
 * backdrop like a desktop dialog.
 *
 * EventDetailModal and FamilyModal both take a `fullScreen` prop that
 * swaps their own overlay/card chrome for this wrapper — the actual
 * view/edit logic in each is untouched, only the outer frame differs
 * between desktop and mobile call sites. MobileAgenda's quick-add screen
 * uses this directly (it has no desktop-dialog equivalent to begin with —
 * QuickAddPanel lives inline in the desktop sidebar). */
export function MobileFullScreenModal({
  title,
  onClose,
  children,
  eyebrow,
  eyebrowColor
}: MobileFullScreenModalProps) {
  return (
    <div className="decal-mobile-screen-in" style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backButton} onClick={onClose} aria-label="Back">
          <BackIcon />
        </button>
        <div style={styles.headerText}>
          {eyebrow && (
            <p style={{ ...styles.eyebrow, color: eyebrowColor ?? "var(--accent-1)" }}>{eyebrow}</p>
          )}
          <h1 style={styles.title}>{title}</h1>
        </div>
      </div>
      <div style={styles.body}>{children}</div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "var(--color-ink-deep)",
    display: "flex",
    flexDirection: "column"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 12px",
    borderBottom: "1px solid var(--color-hairline)"
  },
  backButton: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "var(--color-paper)",
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  },
  headerText: { minWidth: 0 },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    margin: "0 0 2px"
  },
  title: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 18,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 16px calc(env(safe-area-inset-bottom, 0px) + 24px)"
  }
};
