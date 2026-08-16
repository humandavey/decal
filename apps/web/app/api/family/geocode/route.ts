import { NextResponse } from "next/server";
import { requireFamilySession } from "@/lib/session";

/** Thin server-side proxy to Open-Meteo's free geocoding API (no key
 * required) — kept server-side just to keep third-party calls out of the
 * browser's network tab and behind the same auth as everything else, not
 * because the API needs a secret. */
export async function GET(request: Request) {
  const { unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
    );
    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }
    const data = await res.json();
    const results = (data.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      admin1: r.admin1 ?? null,
      country: r.country ?? null,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", ")
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
