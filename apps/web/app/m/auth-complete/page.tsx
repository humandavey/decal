// Landing page for the native-app sign-in flow: SignInGate opens NextAuth's
// sign-in page in a system browser (SFSafariViewController/Custom Tabs, not
// the app's own WebView — Google blocks OAuth from embedded WebViews
// outright), with this page as its callbackUrl. By the time NextAuth
// redirects here the session cookie is already set, so app/m/layout.tsx's
// normal session gating passes this through — if a family hasn't been set
// up yet, the layout shows FamilyOnboarding here instead (a real browser
// tab, so it works fine), otherwise this renders.
//
// There's no way for this page to close the system browser sheet itself —
// it isn't running inside the app's Capacitor WebView, so the Capacitor JS
// bridge isn't available here. The user taps "Done"/back, which fires a
// `browserFinished` event back in the app that reloads and picks up the
// session cookie (shared cookie storage between the system browser and the
// WebView, no token-passing required).
export default function AuthCompletePage() {
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Decal</p>
        <h1 style={styles.headline}>You&rsquo;re signed in</h1>
        <p style={styles.copy}>
          Close this tab (tap &ldquo;Done&rdquo; above, or go back) to return to the Decal app.
        </p>
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
    padding: 24,
    background: "#14171d",
    color: "#ede9e1",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },
  card: {
    maxWidth: 380,
    textAlign: "center"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#f0633d",
    margin: "0 0 8px"
  },
  headline: {
    fontSize: 24,
    fontWeight: 600,
    margin: "0 0 12px"
  },
  copy: {
    color: "#8a8f9c",
    fontSize: 14,
    lineHeight: 1.6,
    margin: 0
  }
};
