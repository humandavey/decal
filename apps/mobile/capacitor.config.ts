import type { CapacitorConfig } from "@capacitor/cli";

// Decal is self-hosted — that's the whole point, so there's no single
// backend URL to ship with the app the way a normal SaaS app would. This
// used to be handled by baking DECAL_SERVER_URL in at *build* time (each
// family built their own copy of the app), which worked but meant "install
// the app" wasn't actually a thing — you had to build it yourself, per
// family, from source. Now the server address is entered at *runtime*
// instead, on first launch (see www/index.html) — one app, install it like
// any other app, type in your own server the first time you open it.
//
// Leaving `server.url` unset here is what makes that possible: it's what
// makes Capacitor boot into the bundled www/index.html on launch instead
// of loading a fixed remote origin. That page checks native storage (the
// Preferences plugin) for a previously-entered server address and either
// jumps straight there, or asks for one if this is a first launch (or the
// address was cleared by logging out — see ProfileContent.tsx).
//
// `allowNavigation: ["*"]` is the other half of this: without it,
// Capacitor treats navigating to any origin other than the app's own
// configured one as "external" and hands it off to Safari/Chrome instead
// of loading it in the WebView — the exact "opens Safari, gets stuck on
// Connecting" bug from the build-time-URL era, which is what motivated
// baking the URL in in the first place. A wildcard here is what Capacitor
// itself calls "not intended for production" in its own docs — but that
// guidance is really aimed at apps navigating out to *third-party* sites
// they don't own (e.g. an OAuth provider), where losing the app's own
// origin context is a real problem. Here, the "external" site the user is
// navigating to *is* the app — their own self-hosted Decal server, which
// becomes the WebView's real content for as long as they're signed in.
// It's the same pattern self-hosted-service companion apps generally use
// (Home Assistant, Nextcloud, and similar). Google's own sign-in flow
// still goes through the isolated Safari sheet via @capacitor/browser
// (see SignInGate.tsx) either way — this only affects navigation to the
// user's own server.
const config: CapacitorConfig = {
  appId: "app.decal.mobile",
  appName: "Decal",
  webDir: "www",
  server: {
    allowNavigation: ["*"],
    // Some self-hosted setups (a bare LAN IP, before a reverse proxy with a
    // real cert is set up) serve over plain HTTP. Both platforms block
    // that by default; these two flags are the standard, narrowly-scoped
    // way to allow it — see the README for the HTTPS-in-production caveat,
    // and the per-host iOS exception you still need to add by hand.
    androidScheme: "https",
    cleartext: true
  }
};

export default config;
