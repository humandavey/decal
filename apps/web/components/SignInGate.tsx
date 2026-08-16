"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapacitorApp } from "@capacitor/app";

export function SignInGate() {
  // Capacitor.isNativePlatform() touches `window`, so this is computed
  // after mount rather than during render — safe for SSR/hydration, and
  // correct either way since it's false in every non-native context
  // (the desktop kiosk view, a plain browser tab, etc).
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Google refuses to complete OAuth from an embedded WebView at all (the
  // `disallowed_useragent` error, enforced Google-side), so native sign-in
  // opens a real system browser instead — see connect() below. On iOS
  // that browser's cookies turned out NOT to be shared with this app's own
  // WKWebView (SFSafariViewController shares cookies with Safari.app
  // device-wide, not with the embedding app's private WebView — a wrong
  // assumption in an earlier version of this). So instead of relying on
  // the cookie just appearing here, NextAuth's callback (see
  // app/api/auth/mobile-handoff/route.ts) hands off a short-lived,
  // single-use token via this app's decal:// custom URL scheme, which iOS
  // routes to the listener below. We then redeem it with a plain fetch —
  // made from *this* WebView, not the isolated Safari one — whose
  // Set-Cookie response lands in this WebView's own cookie jar normally.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.protocol !== "decal:" || parsed.hostname !== "auth-bridge") return;

      const token = parsed.searchParams.get("token");
      const dest = parsed.searchParams.get("dest") || "/m";
      if (!token) return;

      // Usually already gone by the time this fires (iOS hands off to the
      // app directly on a recognized custom scheme) — harmless no-op
      // otherwise.
      await Browser.close().catch(() => {});

      try {
        const response = await fetch(
          `${window.location.origin}/api/auth/mobile-handoff/redeem?token=${encodeURIComponent(token)}`,
          { credentials: "include" }
        );
        if (response.ok) {
          window.location.href = dest;
        }
      } catch {
        // Worst case the user's back at this screen and can just tap
        // Connect again.
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  async function connect() {
    if (!isNative) {
      signIn("google");
      return;
    }

    // /native-signin kicks off signIn("google") itself, the instant the
    // sheet finishes loading it — no second tap on a button inside the
    // sheet needed, and (the part that actually matters) it's the one
    // place that controls the exact callbackUrl NextAuth uses. An earlier
    // version opened "/" and relied on a "?callbackUrl=" query param on
    // that URL, which doesn't work: signIn() without an explicit
    // callbackUrl defaults to window.location.href — this *page's* own
    // URL, not something a query string on it can override. See
    // app/native-signin/page.tsx.
    await Browser.open({
      url: `${window.location.origin}/native-signin`
    });

    const listener = await Browser.addListener("browserFinished", () => {
      listener.remove();
      // Defensive fallback only, for if the user closes the sheet by hand
      // before the appUrlOpen handoff above ever fires — re-check session
      // state rather than leaving them stuck.
      window.location.reload();
    });
  }

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
        <button style={styles.button} onClick={connect}>
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
