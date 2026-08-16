"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export function SignInGate() {
  // Capacitor.isNativePlatform() touches `window`, so this is computed
  // after mount rather than during render — safe for SSR/hydration, and
  // correct either way since it's false in every non-native context
  // (the desktop kiosk view, a plain browser tab, etc).
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  async function connect() {
    if (!isNative) {
      signIn("google");
      return;
    }

    // Google refuses to complete OAuth from an embedded WebView at all
    // (the `disallowed_useragent` error) — that's enforced Google-side,
    // not something any Capacitor config can work around. The sanctioned
    // fix is handing the whole flow to a real system browser component
    // (SFSafariViewController on iOS, Chrome Custom Tabs on Android),
    // which @capacitor/browser opens. It shares cookie storage with the
    // app's own WebView, so the session cookie NextAuth sets there during
    // sign-in is already visible here once the user comes back — no
    // token-passing needed, just a reload to pick it up.
    //
    // authOptions.pages.signIn is "/" (our own SignInGate instead of
    // NextAuth's generic provider list), so opening "/" directly lands the
    // user on the exact same button they just tapped — just now inside a
    // real browser context, where `isNative` is false and the `else`
    // branch above runs the normal `signIn("google")` flow. One consistent
    // browsing context handles CSRF token, Google redirect, and callback.
    const callbackUrl = `${window.location.origin}/m/auth-complete`;
    await Browser.open({
      url: `${window.location.origin}/?callbackUrl=${encodeURIComponent(callbackUrl)}`
    });

    const listener = await Browser.addListener("browserFinished", () => {
      listener.remove();
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
