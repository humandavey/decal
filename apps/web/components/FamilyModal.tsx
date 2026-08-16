"use client";

import { useEffect } from "react";
import { FamilyTab } from "./FamilyTab";
import { MobileFullScreenModal } from "./mobile/MobileFullScreenModal";

interface FamilyModalProps {
  onClose: () => void;
  /** Told when a family-wide setting (e.g. meal-prep toggles) changed, so
   * the parent can let anything else reading that setting refetch live. */
  onFamilyChanged: () => void;
  /** Renders as a full-bleed slide-in screen instead of a centered dialog
   * — see MobileFullScreenModal's comment. MobileFamilyTabs' settings icon
   * passes this; the desktop "Family" header button doesn't. */
  fullScreen?: boolean;
}

/** Overlay for family management — members, invite sharing, and (for the
 * owner) removing members. Opened from the "Family" button in the header
 * on desktop, or the settings icon on mobile (see MobileFamilyTabs). */
export function FamilyModal({ onClose, onFamilyChanged, fullScreen }: FamilyModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (fullScreen) {
    return (
      <MobileFullScreenModal title="Family" eyebrow="Manage" onClose={onClose}>
        <FamilyTab onFamilyChanged={onFamilyChanged} />
      </MobileFullScreenModal>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>
        <p style={styles.eyebrow}>Manage</p>
        <h2 style={styles.heading}>Family</h2>
        <FamilyTab onFamilyChanged={onFamilyChanged} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10, 11, 14, 0.6)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50
  },
  modal: {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: "var(--radius-card)",
    padding: "32px 30px 30px"
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    padding: 4
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--accent-5)",
    margin: 0
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 24,
    margin: "6px 0 22px",
    paddingRight: 24
  }
};
