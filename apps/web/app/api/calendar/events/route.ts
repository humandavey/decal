import { NextResponse } from "next/server";
import type { calendar_v3 } from "googleapis";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { calendarClientFor, getValidAccessTokenForAccount, normalizeGoogleEvent } from "@/lib/google-calendar";
import { notifyFamilyChange } from "@/lib/eventBus";
import type { CalendarEvent } from "@decal/shared-types";

export async function GET(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  // Callers pass an explicit range (week view, month view, "next 3 months"
  // prefetch, etc). Falls back to the next 14 days if omitted.
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const timeMin = startParam ? new Date(startParam) : new Date();
  const timeMax = endParam ? new Date(endParam) : new Date(Date.now() + 14 * 86400000);

  // Pull every family member's linked Google account, not just the signed-in
  // viewer's — this is what makes the calendar "combined": everyone's events,
  // tagged with whose they are, merged into one feed.
  const memberships = await prisma.familyMembership.findMany({
    where: { familyId: session.familyId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          accounts: { where: { provider: "google" } }
        }
      }
    }
  });

  const unavailable: string[] = [];

  // Every family member's hidden-event picks, grouped by whose events they
  // apply to — "hide" is only ever done to your own events, so this is
  // scoped per-owner rather than one flat family-wide set.
  const hiddenRows = await prisma.hiddenEvent.findMany({
    where: { familyId: session.familyId },
    select: { ownerId: true, calendarId: true, eventId: true }
  });
  const hiddenByOwner = new Map<string, Set<string>>();
  for (const row of hiddenRows as (typeof hiddenRows)[number][]) {
    const set = hiddenByOwner.get(row.ownerId) ?? new Set<string>();
    set.add(`${row.calendarId}::${row.eventId}`);
    hiddenByOwner.set(row.ownerId, set);
  }

  const perMember = await Promise.all(
    memberships.map(async (membership: (typeof memberships)[number]): Promise<CalendarEvent[]> => {
      const account = membership.user.accounts[0];
      if (!account) return [];

      const accessToken = await getValidAccessTokenForAccount(account);
      if (!accessToken) {
        unavailable.push(membership.user.name ?? "A family member");
        return [];
      }

      try {
        const calendar = calendarClientFor(accessToken);
        const calendarList = await calendar.calendarList.list();
        const calendars = calendarList.data.items ?? [];

        const eventsByCalendar = await Promise.all(
          calendars.map(async (cal) => {
            if (!cal.id) return [];
            const res = await calendar.events.list({
              calendarId: cal.id,
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 150
            });

            return (res.data.items ?? []).map((event) =>
              normalizeGoogleEvent(event, {
                calendarId: cal.id!,
                color: membership.color,
                memberId: membership.userId,
                memberName: membership.user.name
              })
            );
          })
        );

        const normalized = eventsByCalendar.flat();
        const hidden = hiddenByOwner.get(membership.userId);
        return hidden ? normalized.filter((e) => !hidden.has(`${e.calendarId}::${e.id}`)) : normalized;
      } catch (error) {
        console.error(`Failed to fetch calendar events for ${membership.user.name}`, error);
        unavailable.push(membership.user.name ?? "A family member");
        return [];
      }
    })
  );

  const events = perMember.flat().sort((a, b) => a.start.localeCompare(b.start));

  return NextResponse.json({
    events,
    members: memberships.map((m: (typeof memberships)[number]) => ({
      id: m.userId,
      name: m.user.name,
      color: m.color,
      role: m.role,
      connected: m.user.accounts.length > 0
    })),
    unavailable
  });
}

/**
 * Creates a new event on the signed-in member's OWN Google Calendar
 * (their "primary" calendar) — this is the only calendar a person's
 * OAuth grant lets them write to on their behalf, and it's exactly what
 * "add to your Google Calendar" means. It shows up in the combined family
 * view for free the next time that view refetches, same as any other
 * event on their calendar. Used by the Quick Add panel, but general enough
 * for any future "create an event" entry point.
 */
export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const { title, description, location, start, end, allDay, recurrence } = body as {
    title?: string;
    description?: string;
    location?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    // Raw RFC 5545 lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20251217T065959Z"] —
    // already fully assembled client-side (see QuickAddPanel's create()), since
    // that's the only place with access to the browser's real timezone, which
    // an RRULE's UNTIL clause genuinely needs. Passed straight through to
    // Google's API untouched; this route only validates the shape.
    recurrence?: string[];
  };

  if (!title?.trim() || !start || !end) {
    return NextResponse.json({ error: "title, start, and end are required" }, { status: 400 });
  }
  const recurrenceRules =
    Array.isArray(recurrence) && recurrence.every((rule) => typeof rule === "string" && rule.startsWith("RRULE:"))
      ? recurrence
      : undefined;

  const membership = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId: session.familyId, userId: session.userId } },
    include: { user: { select: { name: true, accounts: { where: { provider: "google" } } } } }
  });
  const account = membership?.user.accounts[0];
  if (!membership || !account) {
    return NextResponse.json({ error: "Connect your Google account first" }, { status: 400 });
  }

  const accessToken = await getValidAccessTokenForAccount(account);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Your Google Calendar isn't connected right now" },
      { status: 502 }
    );
  }

  const eventBody: calendar_v3.Schema$Event = {
    summary: title.trim(),
    description: description?.trim() || undefined,
    location: location?.trim() || undefined,
    start: allDay ? { date: start } : { dateTime: start },
    end: allDay ? { date: end } : { dateTime: end },
    recurrence: recurrenceRules
  };

  try {
    const calendar = calendarClientFor(accessToken);
    const res = await calendar.events.insert({ calendarId: "primary", requestBody: eventBody });

    notifyFamilyChange(session.familyId, "calendar");

    return NextResponse.json(
      {
        event: normalizeGoogleEvent(res.data, {
          calendarId: "primary",
          color: membership.color,
          memberId: session.userId,
          memberName: membership.user.name
        })
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create calendar event", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 502 });
  }
}
