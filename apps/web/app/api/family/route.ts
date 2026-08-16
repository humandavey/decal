import { NextResponse } from "next/server";
import { prisma, MEAL_TYPES, type MealType } from "@decal/db";
import { requireFamilySession } from "@/lib/session";
import { notifyFamilyChange } from "@/lib/eventBus";

const DEFAULT_MEAL_PREP_TYPES = MEAL_TYPES.join(",");

export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const family = await prisma.family.findUnique({
    where: { id: session.familyId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } }
      }
    }
  });

  if (!family) {
    return NextResponse.json({ error: "Family not found" }, { status: 404 });
  }

  // Only bother totting up points when scoring is actually on — this join
  // is otherwise dead weight on every "just show me my family" fetch.
  let scores: { userId: string; points: number }[] = [];
  if (family.choresScoringEnabled) {
    const completions = await prisma.choreCompletion.findMany({
      where: { chore: { familyId: session.familyId } },
      select: { userId: true, chore: { select: { points: true } } }
    });
    const totals = new Map<string, number>();
    for (const c of completions as (typeof completions)[number][]) {
      totals.set(c.userId, (totals.get(c.userId) ?? 0) + c.chore.points);
    }
    scores = Array.from(totals.entries()).map(([userId, points]) => ({ userId, points }));
  }

  return NextResponse.json({
    id: family.id,
    name: family.name,
    inviteCode: family.inviteCode,
    mealPrepTypes: (family.mealPrepTypes || DEFAULT_MEAL_PREP_TYPES).split(",").filter(Boolean),
    choresScoringEnabled: family.choresScoringEnabled,
    screensaverEnabled: family.screensaverEnabled,
    screensaverIdleMinutes: family.screensaverIdleMinutes,
    weatherLat: family.weatherLat,
    weatherLon: family.weatherLon,
    weatherLabel: family.weatherLabel,
    scores,
    members: family.members.map((m: (typeof family.members)[number]) => ({
      membershipId: m.id,
      userId: m.userId,
      role: m.role,
      color: m.color,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image
    }))
  });
}

/** Owner-only: family-wide settings — meal-prep slot toggles
 * (mealPrepTypes) and whether chore completion tracks points
 * (choresScoringEnabled). Either can be sent alone or together. */
export async function PATCH(request: Request) {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const membership = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId: session.familyId, userId: session.userId } }
  });
  if (membership?.role !== "OWNER") {
    return NextResponse.json({ error: "Only the family owner can change family settings" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    mealPrepTypes,
    choresScoringEnabled,
    screensaverEnabled,
    screensaverIdleMinutes,
    weatherLat,
    weatherLon,
    weatherLabel
  } = body as {
    mealPrepTypes?: unknown;
    choresScoringEnabled?: unknown;
    screensaverEnabled?: unknown;
    screensaverIdleMinutes?: unknown;
    weatherLat?: unknown;
    weatherLon?: unknown;
    weatherLabel?: unknown;
  };

  const data: {
    mealPrepTypes?: string;
    choresScoringEnabled?: boolean;
    screensaverEnabled?: boolean;
    screensaverIdleMinutes?: number;
    weatherLat?: number | null;
    weatherLon?: number | null;
    weatherLabel?: string | null;
  } = {};

  if (mealPrepTypes !== undefined) {
    if (!Array.isArray(mealPrepTypes) || mealPrepTypes.length === 0) {
      return NextResponse.json({ error: "Pick at least one meal to plan for" }, { status: 400 });
    }
    const valid = mealPrepTypes.every(
      (t): t is MealType => typeof t === "string" && (MEAL_TYPES as readonly string[]).includes(t)
    );
    if (!valid) {
      return NextResponse.json(
        { error: `mealPrepTypes must only contain: ${MEAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    data.mealPrepTypes = mealPrepTypes.join(",");
  }

  if (choresScoringEnabled !== undefined) {
    if (typeof choresScoringEnabled !== "boolean") {
      return NextResponse.json({ error: "choresScoringEnabled must be true or false" }, { status: 400 });
    }
    data.choresScoringEnabled = choresScoringEnabled;
  }

  if (screensaverEnabled !== undefined) {
    if (typeof screensaverEnabled !== "boolean") {
      return NextResponse.json({ error: "screensaverEnabled must be true or false" }, { status: 400 });
    }
    data.screensaverEnabled = screensaverEnabled;
  }

  if (screensaverIdleMinutes !== undefined) {
    const minutes = Number(screensaverIdleMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
      return NextResponse.json(
        { error: "screensaverIdleMinutes must be a number between 1 and 120" },
        { status: 400 }
      );
    }
    data.screensaverIdleMinutes = Math.round(minutes);
  }

  // Location fields always travel together — either set all three (picking
  // a place) or clear all three (removing it). Partial updates would leave
  // lat/lon set with no label, or a label with no coordinates.
  if (weatherLat !== undefined || weatherLon !== undefined || weatherLabel !== undefined) {
    if (weatherLat === null && weatherLon === null) {
      data.weatherLat = null;
      data.weatherLon = null;
      data.weatherLabel = null;
    } else {
      const lat = Number(weatherLat);
      const lon = Number(weatherLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof weatherLabel !== "string" || !weatherLabel.trim()) {
        return NextResponse.json({ error: "weatherLat, weatherLon, and weatherLabel are required together" }, { status: 400 });
      }
      data.weatherLat = lat;
      data.weatherLon = lon;
      data.weatherLabel = weatherLabel.trim();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.family.update({ where: { id: session.familyId }, data });
  notifyFamilyChange(session.familyId, "family");
  return NextResponse.json({ ok: true });
}
