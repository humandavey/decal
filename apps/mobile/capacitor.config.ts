import type { CapacitorConfig } from "@capacitor/cli";

// There's deliberately no `server.url` set here — Decal is self-hosted, so
// there's no single fixed backend URL to bake into the app at build time
// the way a normal SaaS app would. Instead the app boots into the local
// www/index.html bootstrap page, which asks once for the family's server
// address (saved via @capacitor/preferences — real native storage, not a
// browser tab, so it survives the way mobile Safari's site data doesn't)
// and then navigates the WebView there. Same pattern the Home Assistant
// companion app uses for the same reason.
const config: CapacitorConfig = {
  appId: "app.decal.mobile",
  appName: "Decal",
  webDir: "www",
  // Some self-hosted setups (a bare LAN IP, before a reverse proxy with a
  // real cert is set up) serve over plain HTTP. Both platforms block
  // that by default; these two flags are the standard, narrowly-scoped
  // way to allow it — see the README for the HTTPS-in-production caveat.
  server: {
    androidScheme: "https",
    // Allows the Android WebView to load a plain-HTTP server URL (e.g. a
    // bare LAN IP before a reverse-proxy cert is set up). iOS needs its
    // own separate opt-in for the same thing — an App Transport Security
    // exception added to ios/App/App/Info.plist after `cap add ios`
    // generates it; see the README for the exact snippet.
    cleartext: true
  }
};

export default config;
