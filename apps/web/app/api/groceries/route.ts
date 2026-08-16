import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

// One flat, shared list per family — unlike TodoList there's no concept of
// multiple named grocery lists here, so nothing to look up or auto-create.

export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const items = await prisma.groceryItem.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ checked: "asc" }, { createdAt: "asc" }]
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const item = await prisma.groceryItem.create({
    data: { familyId: session.familyId, title, addedById: session.userId }
  });

  notifyFamilyChange(session.familyId, "groceries");
  return NextResponse.json({ item }, { status: 201 });
}

/** Bulk "Clear checked" — the one grocery-specific action a plain to-do
 * list doesn't need, since a shopping trip clears a whole batch at once
 * rather than one item at a time. */
export async function DELETE() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  await prisma.groceryItem.deleteMany({ where: { familyId: session.familyId, checked: true } });

  notifyFamilyChange(session.familyId, "groceries");
  return NextResponse.json({ ok: true });
}
