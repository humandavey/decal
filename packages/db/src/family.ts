import { prisma } from "./client";
import type { FamilyRole, MealType } from "./constants";
import { MEMBER_COLOR_PALETTE } from "./constants";

// Excludes visually-ambiguous characters (0/O, 1/I) so codes are easy to
// read off a screen and type on a phone.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 7;

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

/**
 * Creates a brand-new family with the given user as its OWNER, plus a
 * default to-do list, and returns the invite code so the caller can share
 * it right away. This is the "Create a family" path on the onboarding
 * screen — the counterpart to `joinFamilyByInviteCode` ("Join an existing
 * family"). We never auto-create or auto-join a family on sign-in anymore;
 * the person explicitly picks one of these two the first time they sign in.
 */
export async function createFamilyForUser(
  userId: string,
  familyName: string,
  displayName?: string | null
) {
  const name =
    familyName.trim() || (displayName ? `${displayName.split(" ")[0]}'s Family` : "Our Family");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.familyMembership.create({
        data: {
          role: "OWNER" satisfies FamilyRole,
          color: MEMBER_COLOR_PALETTE[0],
          user: { connect: { id: userId } },
          family: {
            create: {
              name,
              inviteCode: generateInviteCode(),
              todoLists: { create: { name: "Family To-Do" } }
            }
          }
        },
        include: { family: true }
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < 4) continue; // invite code collision, retry
      throw error;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/**
 * Joins the family that owns `inviteCode`. Assigns the new member the next
 * unused color in the palette (based on current member count) so they're
 * visually distinct from everyone already in the family.
 */
export async function joinFamilyByInviteCode(userId: string, inviteCode: string) {
  const code = inviteCode.trim().toUpperCase();
  if (!code) throw new Error("Invalid invite code");

  const family = await prisma.family.findUnique({
    where: { inviteCode: code },
    include: { _count: { select: { members: true } } }
  });
  if (!family) throw new Error("Invalid invite code");

  const memberRole: FamilyRole = "MEMBER";
  const color = MEMBER_COLOR_PALETTE[family._count.members % MEMBER_COLOR_PALETTE.length];

  return prisma.familyMembership.upsert({
    where: { familyId_userId: { familyId: family.id, userId } },
    update: {},
    create: { familyId: family.id, userId, role: memberRole, color },
    include: { family: true }
  });
}

export async function getFamilyIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.familyMembership.findFirst({ where: { userId } });
  return membership?.familyId ?? null;
}

/** Owner-only: invalidates the old invite code and issues a new one. */
export async function regenerateInviteCode(familyId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      await prisma.family.update({ where: { id: familyId }, data: { inviteCode: code } });
      return code;
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/**
 * Owner-only: removes a member from the family. Refuses to remove the
 * OWNER (there always has to be one, and only the family creator ever
 * holds that role) so a family can never be left ownerless. The removed
 * member's User row and Google account are untouched — they just lose
 * this FamilyMembership, so they'll see the "create or join a family"
 * screen again next time their session refreshes.
 */
export async function removeMember(familyId: string, membershipId: string) {
  const membership = await prisma.familyMembership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.familyId !== familyId) {
    throw new Error("Member not found");
  }
  if (membership.role === "OWNER") {
    throw new Error("Can't remove the family owner");
  }
  await prisma.familyMembership.delete({ where: { id: membershipId } });
}

/** Lets a member pick their own color from MEMBER_COLOR_PALETTE — a
 * self-service action, not an admin one, so it's keyed on (familyId, userId)
 * rather than a membershipId an admin might pass in. */
export async function updateMemberColor(familyId: string, userId: string, color: string) {
  return prisma.familyMembership.update({
    where: { familyId_userId: { familyId, userId } },
    data: { color }
  });
}

/** Owner-only: sets which meal slots the family actually plans for (e.g.
 * dinner-only). Stored comma-separated — see Family.mealPrepTypes. */
export async function updateMealPrepTypes(familyId: string, mealTypes: MealType[]) {
  return prisma.family.update({
    where: { id: familyId },
    data: { mealPrepTypes: mealTypes.join(",") }
  });
}
