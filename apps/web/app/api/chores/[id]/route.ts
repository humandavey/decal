import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Soft-deletes a chore (sets archivedAt) — keeps its completion history
 * around instead of cascading a hard delete through it. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const chore = await prisma.chore.findFirst({
    where: { id: params.id, familyId: session.familyId }
  });
  if (!chore) {
    return NextResponse.json({ error: "Chore not found" }, { status: 404 });
  }

  await prisma.chore.update({ where: { id: params.id }, data: { archivedAt: new Date() } });
  notifyFamilyChange(session.familyId, "chores");
  return NextResponse.json({ ok: true });
}
