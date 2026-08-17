# Decal Mobile

A thin native wrapper (via [Capacitor](https://capacitorjs.com)) around the same web app in `apps/web` — specifically its mobile-optimized `/m` routes (see `apps/web/app/m/`), not the kiosk dashboard at `/`. This is code, not a finished app: the pieces below need to be run **on your own Mac**, since building an iOS app requires Xcode and building an Android app requires the Android SDK, neither of which exist in a cloud sandbox.

## How it connects to your server

Decal is self-hosted — that's the point, so one build of this app has to work for anyone's server, not just one family's. The address is entered **at runtime**, on first launch, not baked in at build time:

1. On first open (nothing saved yet — see `www/index.html`), the app shows a plain "enter your server address" screen. It does a quick reachability check before continuing, so a typo gets caught immediately instead of leaving you on a blank/broken screen.
2. Once entered, the address is saved via the [Preferences plugin](https://capacitorjs.com/docs/apis/preferences) — real native storage, so it's remembered across app restarts, not just for one session — and the app navigates straight there (specifically to its `/m` routes; see below).
3. Every launch after that jumps straight to the saved server, skipping the entry screen entirely, for as long as that address stays reachable and you're not logged out (see "Switching servers or signing out" below).

Two `capacitor.config.ts` settings are what make this possible without hitting the bug an earlier version of this had:

- `server.url` is deliberately **left unset**. Setting it (the old approach: baking one family's server in at build time) is what makes Capacitor boot straight into a fixed remote origin; leaving it unset is what makes the app boot into the bundled `www/index.html` first, so there's somewhere to ask for an address before any server is known.
- `server.allowNavigation: ["*"]` is what lets navigating from that local page to whatever address gets typed in — an entirely different origin — happen *inside* the WebView instead of Capacitor treating it as "external" and bouncing to Safari/Chrome. Capacitor's own docs call a wildcard here "not intended for production," but that guidance targets apps that navigate out to *third-party* sites they don't own (an OAuth provider, say) — here, the "external" site being navigated to *is* the app: the user's own self-hosted server, which becomes the real content of the WebView for as long as they're signed in. It's the same pattern other self-hosted-service companion apps generally use.

The `/m` matters too: the app always navigates to `<address>/m`, not just `<address>`, since `/m` is the mobile-optimized bottom-tab route tree (`apps/web/app/m/`) — the bare origin would land on the desktop kiosk's side-by-side dashboard layout instead.

### Switching servers or signing out

The "Log out" button (Profile tab) forgets the saved address in addition to signing out, so the *next time the app itself is opened* it asks for a server again instead of silently reconnecting to the same one — treat logging out as "start over," not just "sign out of this one." It does **not** touch anything on the server itself: no family, member, chore, meal, note, or calendar connection is deleted by logging out, on any device. It only ever affects this one device's session and its locally-saved address.

You don't have to fully log out just to point at a different server, though: the sign-in screen also has a "Server" field next to the Connect button, pre-filled with whatever server you're currently on, editable at any time. Changing it and tapping Switch does the same reachability check + save + navigate as first-launch entry, without needing to log out first (useful for testing against a second server, or if you got the address wrong the first time and are still signed out).

### Signing in with Google

Google refuses to complete OAuth from an embedded WebView at all (it returns a `disallowed_useragent` error) — that's enforced on Google's end, not something any Capacitor setting works around. So "Connect Google Calendar" behaves differently here than in a normal browser tab: tapping it on native opens a system browser sheet (`SFSafariViewController` on iOS, Chrome Custom Tabs on Android, via the `@capacitor/browser` plugin) pointed at `/native-signin` — a small dedicated page (`apps/web/app/native-signin/page.tsx`) whose only job is to immediately kick off Google's sign-in the instant the sheet finishes loading. There's no second tap needed inside the sheet; you land straight on Google's own login. That's a Google-sanctioned browser context, so sign-in completes normally there.

(`/native-signin` exists as its own route rather than just opening `/` because `signIn()` without an explicit `callbackUrl` defaults to the *current page's* URL — a query string tacked onto some other page's URL doesn't actually redirect it anywhere useful. `/native-signin` is the one place that pins down exactly where NextAuth sends you next.)

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

Android needs the equivalent registration, just as an intent filter instead of an `Info.plist` entry. **After `cap add android`**, open `android/app/src/main/AndroidManifest.xml`, find the `<activity>` block (the one with `android:name=".MainActivity"`), and add a second `<intent-filter>` inside it, alongside whichever one is already there:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="decal" />
</intent-filter>
```

No Java/Kotlin changes needed beyond that — Capacitor's App plugin picks up `decal://` links and fires the same `appUrlOpen` event `SignInGate.tsx` already listens for on both platforms. This hasn't been tested end-to-end on a real Android device (nothing in this project has, yet), so treat it as the documented starting point rather than a guarantee — if "Connect Google Calendar" still leaves you signed out after adding this, that intent filter is the first thing worth double-checking (right XML, right `<activity>`, ran `cap sync` after).

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

1. **The WebView itself** — `capacitor.config.ts` already sets `cleartext: true` for Android, which allows loading a plain `http://` URL. iOS needs its own opt-in: after running `cap add ios`, open `ios/App/App/Info.plist` and add an App Transport Security exception for your server's host (replace `decal.local` with the actual address you plan to enter on the app's sign-in screen):

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

Note that the ATS exception above is tied to one specific domain, hand-edited into `Info.plist` — since the server address is now typed in at runtime rather than fixed at build time, that exception only helps if you actually enter the exact address it names. This is really just another point in favor of HTTPS: it's a one-time setup step regardless of which server address ends up getting typed in, rather than something that has to be kept in sync with it.

## Running it

```bash
npx cap open ios       # opens the Xcode project
npx cap open android   # opens the Android Studio project
```

From there it's a normal Xcode/Android Studio run — pick a simulator/emulator or a device plugged in over USB and hit Run. No app-store account is required to run on your own device this way (Xcode's free "Personal Team" signing works for a 7-day-refreshing install; Android just needs "install from unknown sources" enabled once).

Whenever you change `capacitor.config.ts`, `www/index.html`, or add/remove a Capacitor plugin, run `npx cap sync` to push those changes into the native projects before rebuilding in Xcode/Android Studio. Since the server address is now entered at runtime rather than baked into the build, you generally do **not** need to rebuild just to point at a different server — see "Switching servers or signing out" above.

## What's not done yet

- **Android hasn't been tested on a real device yet** — the intent filter under "Signing in with Google" above is the documented fix for the same "signed in in the browser sheet, still signed out in the app" symptom iOS had before its `Info.plist` entry, since Chrome Custom Tabs (what `@capacitor/browser` opens on Android) is expected to have the same cookie-isolation behavior `SFSafariViewController` does — but it's unverified until someone actually runs it on a device or emulator.
- **App icon / splash screen** — currently the Capacitor placeholder. [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) can generate a full icon set from one source image once you have one.
- **Push notifications** — `@capacitor/push-notifications` is already a dependency so the plugin's there, but nothing calls it yet. This is the natural next step after the app itself is running, since it needs a server-side piece too (registering device tokens, sending on chore-due/event-starting).
- **App Store / Play Store distribution** — not set up, and not necessary for personal/family use (sideloading as described above is enough). Worth revisiting only if you want it on a phone you can't plug into your Mac (e.g. Play Store's internal testing track, or Apple's TestFlight, are the lighter-weight options short of a full public listing).
