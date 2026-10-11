import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { prisma } from "@decal/db";
import type { CalendarEvent } from "@decal/shared-types";

interface GoogleAccountRow {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

/**
 * - `reconnect`: the refresh token is missing, expired, or revoked. Only the
 *   account's owner signing in again can fix it.
 * - `temporary`: Google couldn't be reached or errored. Worth retrying later.
 */
export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "reconnect" | "temporary" };

/**
 * Returns a valid Google access token for the given linked account,
 * refreshing it (and persisting the refreshed token back to the Account
 * row) if it's expired or about to be.
 *
 * This is distinct from the token refresh in lib/auth.ts, which only ever
 * refreshes the *signed-in viewer's* token, held in their own JWT. The
 * combined family calendar needs to pull events from every family member's
 * Google account, not just the person currently looking at the screen — so
 * this reads/writes the Account table directly instead.
 *
 * When Google rejects the refresh token outright (`invalid_grant`), the
 * stored tokens are cleared. A null `refresh_token` is what marks the
 * account as needing its owner to reconnect (see viewerNeedsReconnect).
 */
export async function getValidAccessTokenForAccount(
  account: GoogleAccountRow
): Promise<AccessTokenResult> {
  const bufferMs = 60_000;
  const isFresh =
    Boolean(account.access_token) &&
    Boolean(account.expires_at) &&
    Date.now() < (account.expires_at as number) * 1000 - bufferMs;
  if (isFresh) return { ok: true, accessToken: account.access_token as string };
  if (!account.refresh_token) return { ok: false, reason: "reconnect" };

  let response: Response;
  let body: { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token
      })
    });
    body = await response.json();
  } catch (error) {
    console.error("Failed to reach Google to refresh access token for account", account.id, error);
    return { ok: false, reason: "temporary" };
  }

  if (!response.ok || !body.access_token) {
    console.error("Failed to refresh Google access token for account", account.id, body);
    if (body.error === "invalid_grant") {
      // Matching on the old refresh_token means a sign-in that already
      // stored a fresh one in the meantime doesn't get wiped out.
      await prisma.account
        .updateMany({
          where: { id: account.id, refresh_token: account.refresh_token },
          data: { refresh_token: null, access_token: null, expires_at: null }
        })
        .catch((error: unknown) => console.error("Failed to clear revoked Google tokens", account.id, error));
      return { ok: false, reason: "reconnect" };
    }
    return { ok: false, reason: "temporary" };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: body.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
      refresh_token: body.refresh_token ?? account.refresh_token
    }
  });

  return { ok: true, accessToken: body.access_token };
}

/**
 * True if the user's stored Google grant is gone, so they need to sign in
 * again. Goes through getValidAccessTokenForAccount rather than just
 * checking for a null refresh_token, so a token that died since the last
 * refresh gets caught the moment its owner opens the app.
 */
export async function viewerNeedsReconnect(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true }
  });
  if (!account) return false;
  const result = await getValidAccessTokenForAccount(account);
  return !result.ok && result.reason === "reconnect";
}

export function calendarClientFor(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

export function normalizeGoogleEvent(
  event: calendar_v3.Schema$Event,
  opts: { calendarId: string; color: string; memberId: string; memberName?: string | null }
): CalendarEvent {
  const isAllDay = Boolean(event.start?.date);
  return {
    id: event.id ?? crypto.randomUUID(),
    title: event.summary ?? "(untitled)",
    start: (event.start?.dateTime ?? event.start?.date ?? "") as string,
    end: (event.end?.dateTime ?? event.end?.date ?? "") as string,
    allDay: isAllDay,
    calendarId: opts.calendarId,
    memberId: opts.memberId,
    memberName: opts.memberName,
    color: opts.color,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    htmlLink: event.htmlLink ?? undefined,
    organizerEmail: event.organizer?.email ?? undefined,
    attendees: event.attendees?.map((a) => ({
      email: a.email ?? "",
      displayName: a.displayName ?? undefined,
      responseStatus: a.responseStatus ?? undefined,
      self: a.self ?? undefined
    }))
  };
}
