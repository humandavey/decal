import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

/** Session narrowed to the fields every API route actually needs, both required. */
export interface FamilySession {
  userId: string;
  familyId: string;
}

export async function requireFamilySession(): Promise<
  { session: FamilySession; unauthorized: null } | { session: null; unauthorized: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.userId || !session?.familyId) {
    return {
      session: null,
      unauthorized: NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    };
  }
  return { session: { userId: session.userId, familyId: session.familyId }, unauthorized: null };
}
