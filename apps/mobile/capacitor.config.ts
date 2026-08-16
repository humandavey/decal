import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";
import path from "path";

// Decal is self-hosted, so there's no single fixed backend URL to ship to
// every install the way a normal SaaS app would — each family points their
// own build at their own server. Set DECAL_SERVER_URL in apps/mobile/.env
// (gitignored — copy .env.example) before running `cap sync`/`cap add
// ios|android`/`cap open ios|android`.
//
// This used to be handled at *runtime* instead: the app booted into
// www/index.html, asked for a server address, and navigated there. That's
// what caused the "opens Safari instead of loading in-app, then gets stuck
// on Connecting" bug — Capacitor treats any navigation to a different
// origin than the app's configured one as "external" and hands it to the
// system browser instead of the WebView, and that included the very first
// navigation from www/index.html to the family's actual server. Baking the
// URL in here instead makes it the WebView's home origin from the start,
// so navigation within it (including NextAuth's own sign-in redirects) is
// same-origin and stays in-app.
loadEnv({ path: path.resolve(__dirname, ".env") });

const serverUrl = process.env.DECAL_SERVER_URL?.trim().replace(/\/+$/, "");

if (!serverUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    "\n[decal-mobile] DECAL_SERVER_URL is not set (see apps/mobile/.env.example).\n" +
      "The app will show a static placeholder instead of your server until it's set.\n"
  );
}

const config: CapacitorConfig = {
  appId: "app.decal.mobile",
  appName: "Decal",
  webDir: "www",
  server: {
    // Setting `url` makes the family's own server the WebView's actual home
    // origin at launch — Capacitor loads it directly instead of the
    // packaged www/index.html. Capacitor's docs call this "not intended for
    // production", but it's the standard pattern for a thin wrapper around
    // one self-hosted site (the Home Assistant companion app works the
    // same way), and it's what fixes the bug above.
    ...(serverUrl ? { url: serverUrl } : {}),
    // Some self-hosted setups (a bare LAN IP, before a reverse proxy with a
    // real cert is set up) serve over plain HTTP. Both platforms block
    // that by default; these two flags are the standard, narrowly-scoped
    // way to allow it — see the README for the HTTPS-in-production caveat.
    androidScheme: "https",
    // iOS needs its own separate opt-in for the same thing — an App
    // Transport Security exception added to ios/App/App/Info.plist after
    // `cap add ios` generates it; see the README for the exact snippet.
    cleartext: true
  }
};

export default config;
