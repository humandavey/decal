import { NextResponse } from "next/server";
import { prisma } from "@decal/db";
import { requireFamilySession } from "@/lib/session";

/** Family's stored location -> current conditions, via Open-Meteo's free
 * forecast API (no key required). Returns { location: null } rather than an
 * error when no location has been set yet — that's an expected, common
 * state (screensaver still works fine without the weather overlay), not a
 * failure. */
export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const family = await prisma.family.findUnique({
    where: { id: session.familyId },
    select: { weatherLat: true, weatherLon: true, weatherLabel: true }
  });

  if (!family?.weatherLat || !family?.weatherLon) {
    return NextResponse.json({ location: null });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${family.weatherLat}&longitude=${family.weatherLon}&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ location: family.weatherLabel, current: null });
    }
    const data = await res.json();
    return NextResponse.json({
      location: family.weatherLabel,
      current: {
        tempF: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code as number,
        isDay: Boolean(data.current.is_day)
      }
    });
  } catch {
    return NextResponse.json({ location: family.weatherLabel, current: null });
  }
}
