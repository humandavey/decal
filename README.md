# Decal

A self-hosted family dashboard — the wall calendar without the subscription. Decal pulls in everyone's Google Calendars, dedupes overlapping events, and adds the stuff an actual family whiteboard has: chores, a shared meal plan and grocery list, quick to-dos, a family note board, and an always-on screensaver mode for a wall-mounted tablet. There's also a native mobile wrapper for checking in from a phone.

Everything runs on hardware you own. No accounts with a third party, no subscription, no data leaving your own server except calls to Google Calendar (and, optionally, Google's Gemini API for natural-language quick-add) and a public weather API.

## Features

- **Calendar** — pulls events from every family member's connected Google Calendar into one board, with per-member color coding and dedup logic so the same event doesn't show up twice when multiple people are invited. Month grid and day views, an event detail modal, and a "quick add" box that parses natural-language input ("dentist next Tuesday at 3pm") via `chrono-node`, optionally upgraded to a full LLM parse via Gemini if `GEMINI_API_KEY` is set.
- **Chores** — assign chores to family members, mark them complete, track completion history.
- **Meals & groceries** — a weekly meal plan and a shared grocery list.
- **To-dos** — a shared todo list separate from chores.
- **Family notes** — a lightweight message board for the family.
- **Family & profile management** — invite family members via a shareable join link, member picker/color assignment, per-user profile.
- **Screensaver mode** — an idle-timeout screensaver for a dashboard tablet, with a weather overlay (via Open-Meteo, no API key required).
- **Live sync** — an SSE-backed event bus pushes updates to every open screen in the family in real time (chores checked off, notes posted, etc. show up instantly on other devices).
- **Mobile app** — a thin native wrapper (Capacitor) around the same web app's mobile-optimized routes, for iOS and Android. See [`apps/mobile/README.md`](apps/mobile/README.md).

## Tech stack

- **Next.js 14** (App Router), TypeScript strict mode, plain inline `style` objects (CSS-in-JS with CSS custom properties) — no Tailwind or CSS framework.
- **Prisma + SQLite** for storage — a single-file database, no separate DB server to run.
- **NextAuth v4** with the Google provider, backed by the Prisma adapter, for sign-in and Google Calendar access (via `googleapis`).
- **Turborepo + pnpm workspaces** monorepo.
- **Capacitor** for the mobile app shell.

## Monorepo structure

```
apps/
  web/      Next.js app — the actual product (desktop kiosk view at "/",
            mobile-optimized routes under "/m")
  mobile/   Capacitor wrapper around apps/web's "/m" routes — generates the
            iOS/Android native projects (see apps/mobile/README.md)
packages/
  db/       Prisma schema, generated client, and shared constants
            (e.g. the family member color palette)
  shared-types/
            Types and constants shared between apps/web and apps/mobile
deploy/
  decal.nginx.conf
            Template nginx vhost config for reverse-proxying the app
```

## Running it

**Local development**: `pnpm install` at the repo root, then `pnpm dev` (runs every app's dev server via Turborepo). You'll need a `.env` in `apps/web` with `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and a Google OAuth client's `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — see `.env.example` at the repo root for the full list and where to get each value (the same file the production deploy uses).

**Production deploy**: Decal is designed to run as a single Docker container on your own server (originally built around a home Ubuntu box also running Pterodactyl Panel, with Decal riding as a second nginx vhost alongside it), deployed automatically via a GitHub Actions self-hosted runner on push to `main`. Full step-by-step instructions — domain/DNS, the runner, nginx + HTTPS via certbot, Google OAuth Console setup, first deploy — are in [`DEPLOY.md`](DEPLOY.md).

**Mobile app**: build instructions, the Google sign-in flow's native-side quirks, and current known limitations (Android sign-in untested, no push notifications yet) are in [`apps/mobile/README.md`](apps/mobile/README.md).

## Status

The web app is deployed and in daily use. The mobile app builds and runs on iOS with working sign-in (including Google's embedded-WebView restrictions worked around via a system-browser handoff — see the mobile README for the mechanism); Android hasn't been tested yet. See [`apps/mobile/README.md`](apps/mobile/README.md#whats-not-done-yet) for the current list of what's left.
