"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

/**
 * Dedicated landing target for the native app's "Connect Google Calendar"
 * button (see SignInGate.tsx's connect()) — opened directly in the system
 * browser sheet instead of the site's own "/" page, so there's no second
 * tap once the sheet appears, and — the actual reason this exists — it's
 * the one place that controls the exact callbackUrl NextAuth uses.
 * Getting here any other way (e.g. a "?callbackUrl=" query param on
 * whatever page loaded) doesn't work: signIn() without an explicit
 * callbackUrl option defaults to `window.location.href`, i.e. this page's
 * own URL, not something a query string on it can override.
 *
 * Deliberately lives outside app/m/ — that layout gates every child on
 * having a session already, which is exactly the thing that hasn't
 * happened yet here.
 */
export default function NativeSignInPage() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/api/auth/mobile-handoff?dest=%2Fm" });
  }, []);

  return (
    <div style={styles.wrap}>
      <p style={styles.copy}>Connecting to Google…</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-ink-deep)"
  },
  copy: {
    color: "var(--color-muted)",
    fontFamily: "var(--font-body)",
    fontSize: 15
  }
};
