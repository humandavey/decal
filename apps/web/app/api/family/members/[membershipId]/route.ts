import { NextResponse } from "next/server";
import { prisma, removeMember } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Owner-only: removes another member from the family. */
export async function DELETE(request: Request, { params }: { params: { membershipId: string } }) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const me = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId: session.familyId, userId: session.userId } }
  });
  if (me?.role !== "OWNER") {
    return NextResponse.json({ error: "Only the family owner can remove members" }, { status: 403 });
  }

  try {
    await removeMember(session.familyId, params.membershipId);
    notifyFamilyChange(session.familyId, "family");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't remove that member" },
      { status: 400 }
    );
  }
}
