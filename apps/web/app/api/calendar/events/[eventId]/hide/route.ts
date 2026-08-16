import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/**
 * "Deleting" an event from the day/week/month view never touches the
 * underlying Google Calendar event — this just records that the owning
 * member doesn't want to see it on the shared dashboard anymore. It can be
 * undone later from their profile (see ../../hidden-events).
 *
 * Restricted to your own events on purpose: hiding someone else's event
 * would silently remove it from everyone's shared view, which isn't a call
 * any one family member should get to make on another's behalf.
 */
export async function POST(request: Request, { params }: { params: { eventId: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const { calendarId, memberId, title, start, allDay } = body as {
    calendarId?: string;
    memberId?: string;
    title?: string;
    start?: string;
    allDay?: boolean;
  };

  if (!calendarId || !memberId || !title || !start) {
    return NextResponse.json(
      { error: "calendarId, memberId, title, and start are required" },
      { status: 400 }
    );
  }

  if (memberId !== session.userId) {
    return NextResponse.json({ error: "You can only hide your own events" }, { status: 403 });
  }

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }

  await prisma.hiddenEvent.upsert({
    where: {
      ownerId_calendarId_eventId: { ownerId: session.userId, calendarId, eventId: params.eventId }
    },
    update: { title, start: startDate, allDay: Boolean(allDay) },
    create: {
      familyId: session.familyId,
      ownerId: session.userId,
      calendarId,
      eventId: params.eventId,
      title,
      start: startDate,
      allDay: Boolean(allDay)
    }
  });

  notifyFamilyChange(session.familyId, "calendar");
  return NextResponse.json({ ok: true });
}
