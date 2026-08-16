import { NextResponse } from "next/server";
import { prisma, MEAL_TYPES, type MealType } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const entries = await prisma.mealPlanEntry.findMany({
    where: {
      familyId: session.familyId,
      ...(start && end
        ? { date: { gte: startOfDayUTC(new Date(start)), lte: startOfDayUTC(new Date(end)) } }
        : {})
    },
    include: { assignee: { select: { id: true, name: true, image: true } } },
    orderBy: [{ date: "asc" }]
  });

  return NextResponse.json({ entries });
}

// POST upserts one meal slot (family, date, mealType) — this is how the
// meal planner grid saves edits: one call per cell.
export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const { date, mealType, title, notes, assigneeId } = body as {
    date?: string;
    mealType?: MealType;
    title?: string;
    notes?: string;
    assigneeId?: string | null;
  };

  if (!date || !mealType) {
    return NextResponse.json({ error: "date and mealType are required" }, { status: 400 });
  }
  if (!MEAL_TYPES.includes(mealType)) {
    return NextResponse.json(
      { error: `mealType must be one of: ${MEAL_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const day = startOfDayUTC(new Date(date));

  if (!title?.trim()) {
    // Empty title means "clear this slot."
    await prisma.mealPlanEntry
      .delete({
        where: { familyId_date_mealType: { familyId: session.familyId, date: day, mealType } }
      })
      .catch(() => {});
    notifyFamilyChange(session.familyId, "meals");
    return NextResponse.json({ ok: true, cleared: true });
  }

  const entry = await prisma.mealPlanEntry.upsert({
    where: { familyId_date_mealType: { familyId: session.familyId, date: day, mealType } },
    update: { title: title.trim(), notes, assigneeId: assigneeId || null },
    create: {
      familyId: session.familyId,
      date: day,
      mealType,
      title: title.trim(),
      notes,
      assigneeId: assigneeId || null
    },
    include: { assignee: { select: { id: true, name: true, image: true } } }
  });

  notifyFamilyChange(session.familyId, "meals");
  return NextResponse.json({ entry });
}
