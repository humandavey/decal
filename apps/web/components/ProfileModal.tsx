"use client";

import { useEffect } from "react";
import { ProfileContent } from "./ProfileContent";

interface ProfileModalProps {
  /** This member's current color, if known yet (loads with the calendar events). */
  color?: string;
  /** Told the color changed — parent should refetch so events re-tint. */
  onColorChanged: () => void;
  onClose: () => void;
}

/** Overlay for "you" — your identity, your calendar color, and signing out.
 * Mirrors FamilyModal's layout so the two settings surfaces feel like one
 * family of screens rather than a modal and a random popover. The actual
 * content lives in ProfileContent, shared with the mobile app's Profile
 * tab (a full page there, no overlay chrome needed). */
export function ProfileModal({ color, onColorChanged, onClose }: ProfileModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>
        <p style={styles.eyebrow}>Manage</p>
        <h2 style={styles.heading}>Profile</h2>
        <ProfileContent color={color} onColorChanged={onColorChanged} />
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
    padding: "32px 30px 30px",
    overflowWrap: "anywhere",
    wordBreak: "break-word"
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
    color: "var(--accent-4)",
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
