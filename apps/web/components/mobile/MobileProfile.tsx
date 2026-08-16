"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ProfileContent } from "../ProfileContent";

/** Full-page version of ProfileModal's content — same identity/color/
 * hidden-events/sign-out, just framed as its own tab instead of an
 * overlay, since the mobile app has no "close this and go back to the
 * dashboard" — Profile IS one of the four places you can be. */
export function MobileProfile() {
  const { data: session } = useSession();
  const [color, setColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/family")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const mine = data?.members?.find((m: { userId: string }) => m.userId === session?.userId);
        if (mine?.color) setColor(mine.color);
      })
      .catch(() => {});
  }, [session?.userId]);

  return (
    <div style={styles.wrap}>
      <div>
        <p style={styles.eyebrow}>Manage</p>
        <h1 style={styles.heading}>Profile</h1>
      </div>
      <ProfileContent color={color} onColorChanged={() => {}} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--accent-4)",
    margin: "0 0 4px"
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontWeight: 600,
    fontSize: "clamp(24px, 7vw, 30px)",
    margin: 0,
    color: "var(--color-paper)"
  }
};
