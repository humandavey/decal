import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function findOwnedItem(familyId: string, itemId: string) {
  return prisma.todoItem.findFirst({
    where: { id: itemId, list: { familyId } }
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await findOwnedItem(session.familyId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const body = await request.json();
  const { done, title, assigneeId, dueDate } = body as {
    done?: boolean;
    title?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  };

  const item = await prisma.todoItem.update({
    where: { id: params.id },
    data: {
      ...(done !== undefined ? { done, completedAt: done ? new Date() : null } : {}),
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? startOfDayUTC(new Date(dueDate)) : null } : {})
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } }
    }
  });

  notifyFamilyChange(session.familyId, "todos");
  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await findOwnedItem(session.familyId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  await prisma.todoItem.delete({ where: { id: params.id } });
  notifyFamilyChange(session.familyId, "todos");
  return NextResponse.json({ ok: true });
}
