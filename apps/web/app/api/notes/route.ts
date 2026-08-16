import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

/** Notes don't store the author's display color themselves (it can change
 * any time in Profile) — this looks it up fresh from the family's current
 * memberships each time, same as chore/todo assignee colors already do. */
async function colorByUserId(familyId: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: { familyId },
    select: { userId: true, color: true }
  });
  return new Map(memberships.map((m: (typeof memberships)[number]) => [m.userId, m.color]));
}

export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const [notes, colors] = await Promise.all([
    prisma.familyNote.findMany({
      where: { familyId: session.familyId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } }
    }),
    colorByUserId(session.familyId)
  ]);

  return NextResponse.json({
    notes: notes.map((n: (typeof notes)[number]) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt,
      authorId: n.authorId,
      authorName: n.author.name,
      authorColor: colors.get(n.authorId) ?? "var(--color-hairline-strong)"
    }))
  });
}

export async function POST(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 280) {
    return NextResponse.json({ error: "Keep it under 280 characters" }, { status: 400 });
  }

  const note = await prisma.familyNote.create({
    data: { familyId: session.familyId, authorId: session.userId, text }
  });

  notifyFamilyChange(session.familyId, "notes");
  return NextResponse.json({ note }, { status: 201 });
}
