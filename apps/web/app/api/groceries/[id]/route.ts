import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

async function findOwnedItem(familyId: string, id: string) {
  return prisma.groceryItem.findFirst({ where: { id, familyId } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await findOwnedItem(session.familyId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { checked, title } = body as { checked?: boolean; title?: string };

  const item = await prisma.groceryItem.update({
    where: { id: params.id },
    data: {
      ...(checked !== undefined ? { checked, checkedAt: checked ? new Date() : null } : {}),
      ...(title !== undefined ? { title: title.trim() } : {})
    }
  });

  notifyFamilyChange(session.familyId, "groceries");
  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await findOwnedItem(session.familyId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.groceryItem.delete({ where: { id: params.id } });
  notifyFamilyChange(session.familyId, "groceries");
  return NextResponse.json({ ok: true });
}
