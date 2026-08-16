"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ProfileModal } from "./ProfileModal";

interface ProfileMenuProps {
  /** This member's current color, if known yet (loads with the calendar events). */
  color?: string;
  /** Told the color changed — parent should refetch so events re-tint. */
  onColorChanged: () => void;
}

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** The avatar button in the header — opens the Profile modal (same pattern
 * as the "Family" button opening FamilyModal). */
export function ProfileMenu({ color, onColorChanged }: ProfileMenuProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user;

  return (
    <>
      <button
        type="button"
        style={{ ...styles.avatarButton, borderColor: color ?? "var(--color-hairline-strong)" }}
        onClick={() => setOpen(true)}
        aria-label="Profile"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" style={styles.avatarImage} />
        ) : (
          <span style={styles.avatarInitials}>{initials(user?.name, user?.email)}</span>
        )}
      </button>

      {open && (
        <ProfileModal color={color} onColorChanged={onColorChanged} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "2px solid var(--color-hairline-strong)",
    padding: 0,
    overflow: "hidden",
    background: "var(--color-panel-raised)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  avatarInitials: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-paper)"
  }
};
