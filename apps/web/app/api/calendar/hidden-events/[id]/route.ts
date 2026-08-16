import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Unhides a previously-hidden event — brings it back into the combined
 * calendar feed. Scoped to `ownerId: session.userId` so you can only ever
 * unhide your own picks, same as hiding. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const existing = await prisma.hiddenEvent.findFirst({
    where: { id: params.id, ownerId: session.userId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.hiddenEvent.delete({ where: { id: params.id } });
  notifyFamilyChange(session.familyId, "calendar");
  return NextResponse.json({ ok: true });
}
