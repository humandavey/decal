# Decal Mobile

A thin native wrapper (via [Capacitor](https://capacitorjs.com)) around the same web app in `apps/web` — specifically its mobile-optimized `/m` routes (see `apps/web/app/m/`), not the kiosk dashboard at `/`. This is code, not a finished app: the pieces below need to be run **on your own Mac**, since building an iOS app requires Xcode and building an Android app requires the Android SDK, neither of which exist in a cloud sandbox.

## How it connects to your server

Decal is self-hosted, so unlike a normal app there's no single fixed backend URL to bake in — but it does get baked in, at **build time**, per family:

1. Before running any `cap` command, copy `.env.example` to `.env` in this folder and set `DECAL_SERVER_URL` to your server's address (the same one you'd type into a browser at home).
2. `capacitor.config.ts` reads that and sets it as `server.url` — Capacitor then loads your server as the WebView's actual home page at launch, instead of a packaged local page.

This makes the WebView's home *origin* your own server, so ordinary navigation within it (following a link, NextAuth's own sign-in redirects, etc.) is same-origin and stays in the app. If you ever change `DECAL_SERVER_URL`, run `npx cap sync` and rebuild.

An earlier version of this asked for the server address at runtime, on a bootstrap screen, and navigated there. That doesn't work — Capacitor treats a navigation to a *different* origin than the app's configured one as "external" and hands it to Safari/Chrome instead of the WebView, which is exactly the "opens Safari, gets stuck on Connecting, keeps bouncing to Safari on restart" behavior. Building per-family with `DECAL_SERVER_URL` set is the fix.

### Signing in with Google

Google refuses to complete OAuth from an embedded WebView at all (it returns a `disallowed_useragent` error) — that's enforced on Google's end, not something any Capacitor setting works around. So "Connect Google Calendar" behaves differently here than in a normal browser tab: on native, it opens NextAuth's sign-in page in a real system browser component (`SFSafariViewController` on iOS, Chrome Custom Tabs on Android, via the `@capacitor/browser` plugin) instead of the in-app WebView. That's a Google-sanctioned browser context, so sign-in completes normally there.

On iOS specifically, that browser's cookies are **not** shared with this app's own WKWebView — `SFSafariViewController` shares cookies with Safari.app device-wide, not with the private WebView of whichever app opened it. So instead of the session cookie just showing up back in the app, NextAuth's callback hands off a short-lived, single-use token through this app's own `decal://` URL scheme, which the app picks up and redeems with a normal same-origin request (see the comments in `apps/web/components/SignInGate.tsx` and `apps/web/app/api/auth/mobile-handoff/` for the full mechanism). **This needs one manual step after `cap add ios`** — register the URL scheme, or iOS has nowhere to hand that redirect off to:

Open `ios/App/App/Info.plist` and add:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>decal</string>
    </array>
  </dict>
</array>
```

Without this, tapping "Connect Google Calendar" signs in fine in the browser sheet, but closing it back to the app leaves you signed out — iOS has no registered handler for `decal://` to route the handoff to.

## Prerequisites

- Node + pnpm (already set up for the rest of the monorepo)
- **For iOS**: a Mac with Xcode installed (free from the App Store) and its command line tools (`xcode-select --install`)
- **For Android**: [Android Studio](https://developer.android.com/studio) (free), which bundles the Android SDK

## First-time setup

From this folder (`apps/mobile`):

```bash
cp .env.example .env    # then edit DECAL_SERVER_URL to your server's address
```

Then from the repo root (this is a pnpm workspace, so installing at the root covers this package too):

```bash
pnpm install
cd apps/mobile
npx cap add ios       # generates ios/ — needs Xcode + CocoaPods
npx cap add android    # generates android/ — needs Android Studio installed
```

Both commands scaffold a native project folder that isn't checked in by default (they're regenerated from `capacitor.config.ts` + `www/`) — commit them once they exist if you want to track any manual native-side changes.

### HTTPS — read this before testing on a real device

Your Decal server almost certainly isn't behind HTTPS yet if you're just running it on your home network. Two separate things need to line up for that to work on mobile:

1. **The WebView itself** — `capacitor.config.ts` already sets `cleartext: true` for Android, which allows loading a plain `http://` URL. iOS needs its own opt-in: after running `cap add ios`, open `ios/App/App/Info.plist` and add an App Transport Security exception for your server's host (replace `decal.local` with whatever you set as `DECAL_SERVER_URL`):

   ```xml
   <key>NSAppTransportSecurity</key>
   <dict>
     <key>NSExceptionDomains</key>
     <dict>
       <key>decal.local</key>
       <dict>
         <key>NSExceptionAllowsInsecureHTTPLoads</key>
         <true/>
       </dict>
     </dict>
   </dict>
   ```

2. **NextAuth's session cookie** — by default it's marked `Secure`, meaning the browser (or WebView) simply won't send it back over a plain HTTP connection, which breaks sign-in even with the WebView-level exception above in place. The real fix, and the one worth doing anyway once you're relying on this daily, is putting your server behind HTTPS — a reverse proxy with a free cert (Caddy makes this closest to automatic), or a tunnel like Tailscale Funnel or a Cloudflare Tunnel if you don't want to open a port. Once `NEXTAUTH_URL` is an `https://` address, cookies behave correctly and the ATS exception above isn't needed at all.

If you just want to click around in a simulator against `localhost`, cleartext HTTP is fine for that. For actual daily use on your family's phones, HTTPS is worth setting up.

## Running it

```bash
npx cap open ios       # opens the Xcode project
npx cap open android   # opens the Android Studio project
```

From there it's a normal Xcode/Android Studio run — pick a simulator/emulator or a device plugged in over USB and hit Run. No app-store account is required to run on your own device this way (Xcode's free "Personal Team" signing works for a 7-day-refreshing install; Android just needs "install from unknown sources" enabled once).

Whenever you change `.env`, `capacitor.config.ts`, or add/remove a Capacitor plugin, run `npx cap sync` to push those changes into the native projects before rebuilding in Xcode/Android Studio.

## What's not done yet

- **Android sign-in hasn't been tested yet** — Chrome Custom Tabs (what `@capacitor/browser` opens on Android) may or may not share cookies with the app's WebView; if it doesn't, and you hit the same "signed in in the browser sheet, still signed out in the app" symptom, Android needs the equivalent of the iOS fix above: an intent filter for the `decal://` scheme in `android/app/src/main/AndroidManifest.xml` (the JS-side handoff logic in `SignInGate.tsx` already works cross-platform, it's only the native URL-scheme registration that's iOS-only right now).
- **App icon / splash screen** — currently the Capacitor placeholder. [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) can generate a full icon set from one source image once you have one.
- **Push notifications** — `@capacitor/push-notifications` is already a dependency so the plugin's there, but nothing calls it yet. This is the natural next step after the app itself is running, since it needs a server-side piece too (registering device tokens, sending on chore-due/event-starting).
- **Changing the server address without rebuilding** — right now `DECAL_SERVER_URL` is baked in at build time, so switching servers means editing `.env` and rebuilding. Fine for one family's own server; worth revisiting only if that address changes often.
- **App Store / Play Store distribution** — not set up, and not necessary for personal/family use (sideloading as described above is enough). Worth revisiting only if you want it on a phone you can't plug into your Mac (e.g. Play Store's internal testing track, or Apple's TestFlight, are the lighter-weight options short of a full public listing).
