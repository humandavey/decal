import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// POST { date?: string, completed: boolean }
// Marks (or unmarks) this chore as done for the given day (defaults to today).
// Scoped to the caller's family so you can't toggle another family's chore
// by guessing an id.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const chore = await prisma.chore.findFirst({
    where: { id: params.id, familyId: session.familyId },
    include: { assignments: true }
  });
  if (!chore) {
    return NextResponse.json({ error: "Chore not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const forDate = startOfDayUTC(body.date ? new Date(body.date) : new Date());
  const completed = body.completed ?? true;

  if (completed) {
    const existing = await prisma.choreCompletion.findUnique({
      where: { choreId_forDate: { choreId: chore.id, forDate } }
    });
    await prisma.choreCompletion.upsert({
      where: { choreId_forDate: { choreId: chore.id, forDate } },
      update: { userId: session.userId },
      create: { choreId: chore.id, userId: session.userId, forDate }
    });
    // Pass the baton — but only on the actual incomplete→complete
    // transition, not on a redundant "still complete" call (re-toggling
    // the same day's completion shouldn't skip someone in the rotation).
    if (!existing && chore.rotationEnabled && chore.assignments.length > 0) {
      await prisma.chore.update({
        where: { id: chore.id },
        data: { rotationIndex: (chore.rotationIndex + 1) % chore.assignments.length }
      });
    }
  } else {
    await prisma.choreCompletion
      .delete({ where: { choreId_forDate: { choreId: chore.id, forDate } } })
      .catch(() => {
        // already not completed for this day — nothing to do
      });
    // Deliberately not reverting rotationIndex here — un-completing is
    // meant to fix a mis-tap, not un-pass the baton, and reversing it
    // safely would need to know this was the same session that advanced
    // it in the first place.
  }

  notifyFamilyChange(session.familyId, "chores");
  return NextResponse.json({ ok: true, completed });
}
