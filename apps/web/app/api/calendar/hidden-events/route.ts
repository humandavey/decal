import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";

/** Lists the signed-in member's own hidden events — never anyone else's,
 * since an event can only ever be hidden by the member who owns it. Shown
 * in Profile with an "Unhide" action per row. */
export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const hidden = await prisma.hiddenEvent.findMany({
    where: { familyId: session.familyId, ownerId: session.userId },
    orderBy: { start: "desc" }
  });

  return NextResponse.json({ hidden });
}
