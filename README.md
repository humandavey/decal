# Decal (Skylight clone) — monorepo

A self-hosted family calendar dashboard: Google Calendar sync, chores,
meal planning, and a shared to-do list, built for multiple family members
to eventually access from web, mobile, and a wall-mounted Raspberry Pi.

## Structure

```
apps/
  web/               Next.js dashboard
packages/
  shared-types/      CalendarEvent / FamilyMember types shared across apps
  db/                Prisma schema + client: Family, users, chores, meal plan, to-do list
```

`apps/mobile` and the Raspberry Pi kiosk setup come later — the kiosk will
just be Chromium pointed at this same web app in fullscreen mode, so nothing
extra needs to be built for it yet. The mobile app and kiosk will hit the
same `/api/*` routes this web app already exposes, not a separate backend.

## 1. Install

```bash
corepack enable        # ships pnpm with modern Node, if you don't have pnpm yet
pnpm install
```

## 2. Database setup

```bash
cp packages/db/.env.example packages/db/.env
cd packages/db
pnpm prisma migrate dev --name init   # generates the client + creates dev.db
cd ../..
```

This creates `packages/db/dev.db` (SQLite) with tables for families, chores,
meal plan entries, and the to-do list, plus the NextAuth user/account tables.

Multiple family members sign in with their own Google account and — on
first sign-in — automatically get placed in their own family. To have a
second family member join an *existing* family instead of getting their own,
you'll want to build a small "join with invite code" screen that calls
`joinFamilyByInviteCode` (already implemented in `packages/db/src/family.ts`,
just not wired to any UI yet).

If you ever want to inspect the data directly: `pnpm --filter @decal/db studio`
opens Prisma Studio, a GUI for the database, at `localhost:5555`.

> **Deploying for real, multi-device use:** SQLite is a single file, which is
> fine as long as `apps/web` runs as one persistent server (the mobile app
> and Pi kiosk will just call its API over HTTP — they never touch the DB
> file directly). If you ever deploy to something serverless or with
> multiple instances, switch `provider` in `packages/db/prisma/schema.prisma`
> to `"postgresql"` and point `DATABASE_URL` at a hosted Postgres instance
> (Supabase, Neon, Railway, etc.) — nothing else in the schema is
> SQLite-specific.

## 3. Google Cloud OAuth setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create
   (or pick) a project.
2. **APIs & Services > Library** — enable the **Google Calendar API**.
3. **APIs & Services > OAuth consent screen** — set it to "External," add your
   own Google account as a test user (this avoids needing Google's app review
   while you're the only user).
4. **APIs & Services > Credentials > Create Credentials > OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy the generated Client ID and Client Secret.

## 4. Configure env vars

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in `apps/web/.env.local`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...      # generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

## 5. Run it

```bash
pnpm dev
```

Visit `http://localhost:3000`, click **Connect Google Calendar**, and
authorize. You should land on a week view pulling from every calendar your
Google account has access to — with Week/Month toggle, prev/next/Today
navigation, and a Chores / Meal plan / To-do panel underneath.

## Notes on how the Google Calendar integration works

- We request the `calendar.readonly` and `calendar.events` scopes and
  `access_type=offline` so Google gives us a refresh token, not just a
  short-lived access token.
- `lib/auth.ts` refreshes the access token automatically when it's close to
  expiring — nothing else in the app needs to know about token lifetimes.
- `app/api/calendar/events/route.ts` is the only place that talks to Google.
  It lists every calendar the user has, pulls events from each for a given
  date range, and normalizes them into the shared `CalendarEvent` shape from
  `packages/shared-types`.
- Calendar events themselves still aren't persisted to the database — they're
  fetched fresh from Google for whatever range the Week/Month view needs.
  Chores, meal plan entries, and to-dos, on the other hand, are fully
  database-backed (see below).

## Notes on how the family/chores/meals/todo data model works

- Every signed-in Google user gets a `User` row (via the NextAuth Prisma
  adapter) and, on first sign-in, a `Family` they own (`FamilyMembership`
  with role `OWNER`). This is what makes the multi-user story work: chores,
  meal plan entries, and to-dos all belong to a `Family`, not an individual
  `User`, so every member sees the same data once they're in the same family.
- All of `/api/chores`, `/api/meals`, and `/api/todos` scope every query to
  `session.familyId` — there's no way to read or write another family's data
  even if you guessed an id.
- `ChoreCompletion` is keyed on `(choreId, forDate)`, so a recurring chore
  ("take out the trash," daily) can be checked off once per day without
  needing a separate row per occurrence.
- `packages/db/src/family.ts` has `joinFamilyByInviteCode`, ready for when
  you build an "I already have a family — join with this code" flow (e.g. for
  the mobile app's first-run screen).

## Known limitations to fix as you go

- Only Google Calendar is supported right now — no CalDAV (iCloud/Outlook)
  yet.
- If a refresh token isn't granted (e.g. you'd previously authorized the app
  without `prompt=consent`), revoke access at
  https://myaccount.google.com/permissions and sign in again.
- No family-member/color assignment for calendar events yet — event colors
  are currently per-Google-calendar, not per-person. `FamilyMembership.color`
  exists in the schema for this, just not wired into the calendar UI.
- No invite-code UI yet (see above) — right now every new sign-in creates its
  own family rather than optionally joining an existing one.
- This sandbox's network couldn't reach `binaries.prisma.sh` to download
  Prisma's query engine, so `prisma generate`/`migrate` haven't been run
  end-to-end here — only typechecked. Run step 2 above on your own machine
  and let me know if anything doesn't come up cleanly.
