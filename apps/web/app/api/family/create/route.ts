import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createFamilyForUser } from "@decal/db";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.familyId) {
    return NextResponse.json({ error: "You're already in a family" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const familyName = typeof body?.name === "string" ? body.name : "";

  const membership = await createFamilyForUser(session.userId, familyName, session.user?.name);

  return NextResponse.json({
    familyId: membership.familyId,
    familyName: membership.family.name,
    inviteCode: membership.family.inviteCode
  });
}
