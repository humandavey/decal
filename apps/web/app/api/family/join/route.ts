import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { joinFamilyByInviteCode } from "@decal/db";
import { notifyFamilyChange } from "@/lib/eventBus";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.familyId) {
    return NextResponse.json({ error: "You're already in a family" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Enter an invite code" }, { status: 400 });
  }

  try {
    const membership = await joinFamilyByInviteCode(session.userId, code);
    // Tell everyone else already looking at this family's dashboard that a
    // new member just joined, so the member list/filter row updates live.
    notifyFamilyChange(membership.familyId, "family");
    return NextResponse.json({
      familyId: membership.familyId,
      familyName: membership.family.name
    });
  } catch {
    return NextResponse.json({ error: "That invite code doesn't match a family" }, { status: 404 });
  }
}
