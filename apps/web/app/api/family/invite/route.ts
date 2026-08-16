import { NextResponse } from "next/server";
import { prisma, regenerateInviteCode } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Owner-only: retires the current invite code and issues a fresh one. */
export async function POST() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const membership = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId: session.familyId, userId: session.userId } }
  });
  if (membership?.role !== "OWNER") {
    return NextResponse.json({ error: "Only the family owner can do that" }, { status: 403 });
  }

  const inviteCode = await regenerateInviteCode(session.familyId);
  notifyFamilyChange(session.familyId, "family");
  return NextResponse.json({ inviteCode });
}
