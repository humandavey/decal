import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

// Due dates are calendar days, not instants — normalize to UTC midnight so
// they round-trip through the (timezone-naive) date-only display logic on
// the client without drifting a day in either direction.
function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function getOrCreateDefaultList(familyId: string) {
  const existing = await prisma.todoList.findFirst({ where: { familyId } });
  if (existing) return existing;
  return prisma.todoList.create({ data: { familyId, name: "Family To-Do" } });
}

export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const list = await getOrCreateDefaultList(session.familyId);
  const items = await prisma.todoItem.findMany({
    where: { listId: list.id },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } }
    },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ listId: list.id, items });
}

export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const { title, dueDate, assigneeId } = body as {
    title?: string;
    dueDate?: string;
    assigneeId?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const list = await getOrCreateDefaultList(session.familyId);

  const item = await prisma.todoItem.create({
    data: {
      listId: list.id,
      title: title.trim(),
      dueDate: dueDate ? startOfDayUTC(new Date(dueDate)) : null,
      assigneeId: assigneeId || null,
      createdById: session.userId
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } }
    }
  });

  notifyFamilyChange(session.familyId, "todos");
  return NextResponse.json({ item }, { status: 201 });
}
