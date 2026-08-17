"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapacitorApp } from "@capacitor/app";
import { checkServerReachable, normalizeServerUrl, saveServerUrl } from "@/lib/nativeServerPreference";

export function SignInGate() {
  // Capacitor.isNativePlatform() touches `window`, so this is computed
  // after mount rather than during render — safe for SSR/hydration, and
  // correct either way since it's false in every non-native context
  // (the desktop kiosk view, a plain browser tab, etc).
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Whatever server this page is currently being served from — which, on
  // native, is also "whatever address the app's bootstrap screen (or a
  // previous switch, right here) last sent it to." Read directly from
  // location rather than the saved-address native storage: they're the
  // same value once the app is actually running, and this way the field
  // is correct even if the saved value was cleared (e.g. right after
  // logging out — see ProfileContent.tsx) without needing this page to
  // reach into native storage just to display something it already knows.
  const [serverInput, setServerInput] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    setServerInput(window.location.origin);
  }, []);

  async function switchServer(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeServerUrl(serverInput);
    if (!normalized) {
      setSwitchError("Enter a valid address, like https://decal.yourdomain.com");
      return;
    }
    if (normalized === window.location.origin) return; // nothing to do
    setSwitching(true);
    setSwitchError(null);
    const reachable = await checkServerReachable(normalized);
    if (!reachable) {
      setSwitching(false);
      setSwitchError(`Couldn't reach ${normalized}. Check the address and try again.`);
      return;
    }
    // Saved *before* navigating, same as the bootstrap screen — so this
    // is what the app jumps straight to next launch, not just this tab.
    await saveServerUrl(normalized);
    window.location.href = `${normalized}/m`;
  }

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
  // True once the appUrlOpen handoff below has actually started handling a
  // decal://auth-bridge redirect — read by connect()'s "browserFinished"
  // fallback (see the comment there) so the two don't race each other. On
  // Android specifically, the Custom Tab closing (which fires
  // browserFinished) and the OS routing the decal:// redirect to this app
  // (which fires appUrlOpen) can both happen within the same moment, and
  // browserFinished's own window.location.reload() winning that race would
  // reload the page mid-fetch, aborting the in-flight token redemption
  // below and leaving the user back at this screen needing to tap Connect
  // a second time — the exact symptom seen on a real Android device the
  // first time this whole flow actually worked end-to-end.
  const handoffInFlight = useRef(false);

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

      // Set synchronously, before anything async below — see
      // handoffInFlight's comment. What matters is that this is set before
      // control ever yields, not that the redemption below has finished.
      handoffInFlight.current = true;

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

  const [connectError, setConnectError] = useState<string | null>(null);

  async function connect() {
    if (!isNative) {
      signIn("google");
      return;
    }

    setConnectError(null);

    // /native-signin kicks off signIn("google") itself, the instant the
    // sheet finishes loading it — no second tap on a button inside the
    // sheet needed, and (the part that actually matters) it's the one
    // place that controls the exact callbackUrl NextAuth uses. An earlier
    // version opened "/" and relied on a "?callbackUrl=" query param on
    // that URL, which doesn't work: signIn() without an explicit
    // callbackUrl defaults to window.location.href — this *page's* own
    // URL, not something a query string on it can override. See
    // app/native-signin/page.tsx.
    try {
      await Browser.open({
        url: `${window.location.origin}/native-signin`
      });

      const listener = await Browser.addListener("browserFinished", () => {
        listener.remove();
        // Defensive fallback only, for if the user closes the sheet by hand
        // before the appUrlOpen handoff above ever fires — re-check session
        // state rather than leaving them stuck. Delayed, and skipped
        // entirely if handoffInFlight is already true, specifically so this
        // doesn't win a race against that handoff's own in-flight token
        // redemption fetch and reload out from under it — see
        // handoffInFlight's comment above for the full story. 400ms is a
        // generous heuristic for "the OS has had a real chance to deliver
        // the decal:// redirect by now," not a measured requirement.
        window.setTimeout(() => {
          if (!handoffInFlight.current) {
            window.location.reload();
          }
        }, 400);
      });
    } catch (err) {
      // Previously unhandled — a failure here (the Browser plugin not
      // being registered in a stale native build after `cap sync` was
      // skipped, or window.location.origin pointing somewhere unexpected)
      // silently did nothing at all: the button just looked broken, with
      // no error anywhere but the native console. Surfacing it here — and
      // always logging it, so it shows up in Safari Web Inspector /
      // Android's chrome://inspect even if this message isn't specific
      // enough — turns that into something reportable.
      // eslint-disable-next-line no-console
      console.error("[decal] Browser.open failed in SignInGate.connect()", err);
      setConnectError(
        err instanceof Error && err.message
          ? `Couldn't open the sign-in screen: ${err.message}`
          : "Couldn't open the sign-in screen. Check the console for details."
      );
    }
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
        {connectError && <p style={styles.connectError}>{connectError}</p>}

        {isNative && (
          <form onSubmit={switchServer} style={styles.serverSection}>
            <label style={styles.serverLabel} htmlFor="server-address">
              Server
            </label>
            <div style={styles.serverRow}>
              <input
                id="server-address"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={serverInput}
                onChange={(e) => {
                  setServerInput(e.target.value);
                  setSwitchError(null);
                }}
                style={styles.serverInput}
              />
              <button type="submit" style={styles.serverSwitchButton} disabled={switching}>
                {switching ? "Checking…" : "Switch"}
              </button>
            </div>
            {switchError && <p style={styles.serverError}>{switchError}</p>}
          </form>
        )}
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
  },
  connectError: {
    color: "var(--accent-1)",
    fontSize: 13,
    margin: "14px 0 0"
  },
  // Deliberately low-key compared to the button above — this is a rarely-
  // needed escape hatch (mainly "I logged out and want a different
  // server," or "I mistyped it the first time"), not a second call to
  // action competing with Connect.
  serverSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid var(--color-hairline)",
    textAlign: "left"
  },
  serverLabel: {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 8px"
  },
  serverRow: {
    display: "flex",
    gap: 8
  },
  serverInput: {
    flex: 1,
    minWidth: 0,
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--color-paper)",
    fontSize: 13.5,
    fontFamily: "inherit"
  },
  serverSwitchButton: {
    flexShrink: 0,
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-paper)",
    cursor: "pointer"
  },
  serverError: {
    color: "var(--accent-1)",
    fontSize: 12,
    margin: "10px 0 0"
  }
};
