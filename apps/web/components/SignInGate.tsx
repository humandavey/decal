"use client";

import { signIn } from "next-auth/react";

export function SignInGate() {
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Decal</p>
        <h1 style={styles.headline}>
          The wall calendar,
          <br />
          <em>without the subscription.</em>
        </h1>
        <p style={styles.copy}>
          Connect a Google account to pull in everyone&rsquo;s calendars. Nothing is
          stored anywhere but this screen.
        </p>
        <button style={styles.button} onClick={() => signIn("google")}>
          Connect Google Calendar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  card: {
    maxWidth: 460,
    textAlign: "center",
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: "var(--radius-card)",
    padding: "48px 40px"
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--accent-1)",
    margin: 0
  },
  headline: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "clamp(28px, 4vw, 38px)",
    lineHeight: 1.15,
    margin: "16px 0"
  },
  copy: {
    color: "var(--color-muted)",
    fontSize: 15,
    lineHeight: 1.6,
    margin: "0 0 28px"
  },
  button: {
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    border: "none",
    borderRadius: 999,
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer"
  }
};
