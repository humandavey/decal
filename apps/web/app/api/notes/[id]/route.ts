import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Any family member can take any note down — a shared board, not a
 * private inbox, same precedent as chores/todos already being manageable
 * by anyone in the family rather than just their creator. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await prisma.familyNote.findFirst({
    where: { id: params.id, familyId: session.familyId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await prisma.familyNote.delete({ where: { id: params.id } });
  notifyFamilyChange(session.familyId, "notes");
  return NextResponse.json({ ok: true });
}
