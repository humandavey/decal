import { NextResponse } from "next/server";
import { MEMBER_COLOR_PALETTE, updateMemberColor } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Self-service: lets the signed-in member pick their own color from the
 * fixed palette. Not an admin action — anyone can recolor themselves. */
export async function PATCH(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const color = typeof body?.color === "string" ? body.color : "";
  if (!(MEMBER_COLOR_PALETTE as readonly string[]).includes(color)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }

  const updated = await updateMemberColor(session.familyId, session.userId, color);
  notifyFamilyChange(session.familyId, "family");
  return NextResponse.json({ color: updated.color });
}
