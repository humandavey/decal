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
 * Returns a valid Google access token for the given linked account,
 * refreshing it (and persisting the refreshed token back to the Account
 * row) if it's expired or about to be.
 *
 * This is distinct from the token refresh in lib/auth.ts, which only ever
 * refreshes the *signed-in viewer's* token, held in their own JWT. The
 * combined family calendar needs to pull events from every family member's
 * Google account, not just the person currently looking at the screen — so
 * this reads/writes the Account table directly instead.
 */
export async function getValidAccessTokenForAccount(
  account: GoogleAccountRow
): Promise<string | null> {
  const bufferMs = 60_000;
  const isFresh =
    Boolean(account.access_token) &&
    Boolean(account.expires_at) &&
    Date.now() < (account.expires_at as number) * 1000 - bufferMs;
  if (isFresh) return account.access_token;
  if (!account.refresh_token) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token
      })
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: refreshed.access_token,
        expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
        refresh_token: refreshed.refresh_token ?? account.refresh_token
      }
    });

    return refreshed.access_token as string;
  } catch (error) {
    console.error("Failed to refresh Google access token for account", account.id, error);
    return null;
  }
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
