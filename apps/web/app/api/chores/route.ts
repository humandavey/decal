import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const forDate = startOfDayUTC(
    searchParams.get("date") ? new Date(searchParams.get("date")!) : new Date()
  );

  const chores = await prisma.chore.findMany({
    where: { familyId: session.familyId, archivedAt: null },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { order: "asc" }
      },
      completions: { where: { forDate } }
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
  });

  return NextResponse.json({
    chores: chores.map((chore: (typeof chores)[number]) => {
      const assignees = chore.assignments.map((a: (typeof chore.assignments)[number]) => a.user);
      // Whose turn it is, when rotation is on — rotationIndex is only ever
      // advanced (see complete/route.ts), never validated against the
      // current assignee count, so it's modded here rather than assumed
      // in-range (the pool can shrink if someone's removed from the chore).
      const onDuty =
        chore.rotationEnabled && assignees.length > 0
          ? assignees[chore.rotationIndex % assignees.length]
          : null;
      return {
        id: chore.id,
        title: chore.title,
        description: chore.description,
        points: chore.points,
        recurrence: chore.recurrence,
        dueDate: chore.dueDate,
        rotationEnabled: chore.rotationEnabled,
        assignees,
        onDuty,
        completedToday: chore.completions.length > 0,
        completedBy: chore.completions[0]?.userId ?? null
      };
    })
  });
}

export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const { title, description, points, recurrence, dueDate, assigneeIds, rotationEnabled } = body as {
    title?: string;
    description?: string;
    points?: number;
    recurrence?: string;
    dueDate?: string;
    assigneeIds?: string[];
    rotationEnabled?: boolean;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const chore = await prisma.chore.create({
    data: {
      familyId: session.familyId,
      title: title.trim(),
      description,
      points: points ?? 0,
      recurrence: recurrence ?? null,
      dueDate: dueDate ? startOfDayUTC(new Date(dueDate)) : null,
      // Rotation only makes sense with 2+ people to rotate between — a
      // stray `true` with 0-1 assignees is harmless (onDuty just falls
      // back to null/that one person) but not worth persisting as "on".
      rotationEnabled: Boolean(rotationEnabled) && (assigneeIds?.length ?? 0) >= 2,
      assignments: assigneeIds?.length
        ? { create: assigneeIds.map((userId, order) => ({ userId, order })) }
        : undefined
    },
    include: { assignments: { include: { user: { select: { id: true, name: true } } } } }
  });

  notifyFamilyChange(session.familyId, "chores");
  return NextResponse.json({ chore }, { status: 201 });
}
