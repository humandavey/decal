import { NextResponse } from "next/server";
import type { calendar_v3 } from "googleapis";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { calendarClientFor, getValidAccessTokenForAccount, normalizeGoogleEvent } from "@/lib/google-calendar";
import { notifyFamilyChange } from "@/lib/eventBus";

/**
 * Looks up which family member owns `memberId`'s Google account, scoped to
 * the requesting session's family — so nobody can edit/delete an event on
 * an account outside their own family, even if they somehow guessed a
 * memberId. Any member of the family can manage any other member's events
 * (this is a shared household calendar, not a permissions system).
 */
async function resolveOwnerAccount(familyId: string, memberId: string) {
  const membership = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId, userId: memberId } },
    include: { user: { include: { accounts: { where: { provider: "google" } } } } }
  });
  if (!membership) return null;
  const account = membership.user.accounts[0];
  if (!account) return null;
  return { membership, account };
}

function requiredParams(request: Request) {
  const { searchParams } = new URL(request.url);
  return {
    calendarId: searchParams.get("calendarId"),
    memberId: searchParams.get("memberId")
  };
}

export async function PATCH(request: Request, { params }: { params: { eventId: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const { calendarId, memberId } = requiredParams(request);
  if (!calendarId || !memberId) {
    return NextResponse.json({ error: "calendarId and memberId are required" }, { status: 400 });
  }

  const resolved = await resolveOwnerAccount(session.familyId, memberId);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const accessToken = await getValidAccessTokenForAccount(resolved.account);
  if (!accessToken) {
    return NextResponse.json(
      { error: "That family member's calendar isn't connected right now" },
      { status: 502 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { title, description, location, start, end, allDay } = body as {
    title?: string;
    description?: string;
    location?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
  };

  const patch: calendar_v3.Schema$Event = {};
  if (title !== undefined) patch.summary = title;
  if (description !== undefined) patch.description = description;
  if (location !== undefined) patch.location = location;
  if (start !== undefined) patch.start = allDay ? { date: start } : { dateTime: start };
  if (end !== undefined) patch.end = allDay ? { date: end } : { dateTime: end };

  try {
    const calendar = calendarClientFor(accessToken);
    const res = await calendar.events.patch({
      calendarId,
      eventId: params.eventId,
      requestBody: patch
    });

    notifyFamilyChange(session.familyId, "calendar");
    return NextResponse.json({
      event: normalizeGoogleEvent(res.data, {
        calendarId,
        color: resolved.membership.color,
        memberId,
        memberName: resolved.membership.user.name
      })
    });
  } catch (error) {
    console.error("Failed to update calendar event", error);
    return NextResponse.json({ error: "Failed to update event" }, { status: 502 });
  }
}

// Note: there's deliberately no DELETE here anymore — "deleting" an event
// from Decal no longer touches the underlying Google Calendar event at
// all. See ./hide/route.ts, which just records that the owning member
// doesn't want to see it on the dashboard.
