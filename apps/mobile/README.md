# Decal Mobile

A thin native wrapper (via [Capacitor](https://capacitorjs.com)) around the same web app in `apps/web` — specifically its mobile-optimized `/m` routes (see `apps/web/app/m/`), not the kiosk dashboard at `/`. This is code, not a finished app: the pieces below need to be run **on your own Mac**, since building an iOS app requires Xcode and building an Android app requires the Android SDK, neither of which exist in a cloud sandbox.

## How it connects to your server

Decal is self-hosted, so unlike a normal app there's no single fixed backend URL to bake in at build time. Instead:

1. The app launches into a small local bootstrap screen (`www/index.html`) asking for your server's address — the same URL you'd type into a browser at home.
2. That address is saved with `@capacitor/preferences`, which is real native app storage — not a browser tab, so it doesn't get evicted the way mobile Safari can clear a home-screen web app's data after a period of disuse. This is the actual fix for the login-persistence problem that started this conversation.
3. The WebView then navigates to `<your-server>/m` and stays there. Every future launch skips straight past the bootstrap screen once a URL is saved.

This is the same pattern the Home Assistant companion app uses, for the same reason (a self-hosted server with no fixed address).

## Prerequisites

- Node + pnpm (already set up for the rest of the monorepo)
- **For iOS**: a Mac with Xcode installed (free from the App Store) and its command line tools (`xcode-select --install`)
- **For Android**: [Android Studio](https://developer.android.com/studio) (free), which bundles the Android SDK

## First-time setup

From the repo root (this is a pnpm workspace, so installing at the root covers this package too):

```bash
pnpm install
cd apps/mobile
npx cap add ios       # generates ios/ — needs Xcode + CocoaPods
npx cap add android    # generates android/ — needs Android Studio installed
```

Both commands scaffold a native project folder that isn't checked in by default (they're regenerated from `capacitor.config.ts` + `www/`) — commit them once they exist if you want to track any manual native-side changes.

### HTTPS — read this before testing on a real device

Your Decal server almost certainly isn't behind HTTPS yet if you're just running it on your home network. Two separate things need to line up for that to work on mobile:

1. **The WebView itself** — `capacitor.config.ts` already sets `cleartext: true` for Android, which allows loading a plain `http://` URL. iOS needs its own opt-in: after running `cap add ios`, open `ios/App/App/Info.plist` and add an App Transport Security exception for your server's host (replace `decal.local` with whatever you actually type into the connect screen):

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

Whenever you change anything under `www/`, `capacitor.config.ts`, or add/remove a Capacitor plugin, run `npx cap sync` to push those changes into the native projects before rebuilding in Xcode/Android Studio.

## What's not done yet

- **App icon / splash screen** — currently the Capacitor placeholder. [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) can generate a full icon set from one source image once you have one.
- **Push notifications** — `@capacitor/push-notifications` is already a dependency so the plugin's there, but nothing calls it yet. This is the natural next step after the app itself is running, since it needs a server-side piece too (registering device tokens, sending on chore-due/event-starting).
- **A way to change the saved server URL without reinstalling** — right now that's stored once and there's no in-app "disconnect" screen. Worth adding once you're actually using this day to day.
- **App Store / Play Store distribution** — not set up, and not necessary for personal/family use (sideloading as described above is enough). Worth revisiting only if you want it on a phone you can't plug into your Mac (e.g. Play Store's internal testing track, or Apple's TestFlight, are the lighter-weight options short of a full public listing).
