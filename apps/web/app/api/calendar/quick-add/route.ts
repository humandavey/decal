import { NextResponse } from "next/server";
import * as chrono from "chrono-node";
import { requireFamilySession } from "@/lib/session";
import type { ParsedEventDraft } from "@/lib/quickAdd";

// This never uses process.env.TZ or any server-side notion of "now" — the
// client sends its own local wall-clock date/time (see nowDate/nowTime
// below) and every field this route returns is a plain wall-clock value
// meant to be interpreted in THAT timezone, never converted through one.
// The client is the only place that turns these numbers into a real Date,
// using its own local timezone (same pattern used everywhere else in this
// app for date-only fields — see lib/dates.ts).

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Best-effort "at <place>" extraction from whatever text chrono didn't
 * already claim as the date/time — not exhaustive, but good enough to
 * pre-fill the field; the preview step lets the user fix it either way. */
function extractLocation(text: string): { location: string | null; rest: string } {
  const match = text.match(/\bat\s+(.+)$/i);
  if (!match) return { location: null, rest: text };
  const location = match[1].trim();
  const rest = text.slice(0, match.index).trim();
  return { location: location || null, rest };
}

function cleanTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, "").trim();
  return cleaned || "Untitled event";
}

/** Zero-config fallback used when no AI key is configured, or the AI call
 * fails — runs entirely locally, no network call. Good on clearly-shaped
 * text, can miss the date entirely on very free-form phrasing (in which
 * case it returns null and the route reports a "couldn't find a date"
 * error rather than guessing). */
function parseLocally(text: string, nowDate: string, nowTime: string): ParsedEventDraft | null {
  const [y, m, d] = nowDate.split("-").map(Number);
  const [hh, mm] = nowTime.split(":").map(Number);
  const refDate = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);

  const results = chrono.parse(text, refDate, { forwardDate: true });
  if (results.length === 0) return null;

  const result = results[0];
  const allDay = !result.start.isCertain("hour");
  const startDateObj = result.start.date();
  const endDateObj = result.end ? result.end.date() : null;

  const before = text.slice(0, result.index);
  const after = text.slice(result.index + result.text.length);
  const remainder = `${before} ${after}`.trim();
  const { location, rest } = extractLocation(remainder);

  return {
    title: cleanTitle(rest),
    allDay,
    startDate: formatDate(startDateObj),
    startTime: allDay ? null : formatTime(startDateObj),
    endDate: endDateObj ? formatDate(endDateObj) : null,
    endTime: endDateObj && !allDay ? formatTime(endDateObj) : null,
    location,
    description: null,
    source: "local"
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function parseWithGemini(
  text: string,
  nowDate: string,
  nowTime: string
): Promise<ParsedEventDraft | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

  const prompt = [
    "You extract exactly one calendar event from short, informal pasted text — texts, emails, sticky notes.",
    `The viewer's current local date and time is ${nowDate} ${nowTime} (24-hour clock). Resolve every relative reference ("tomorrow", "Sunday", "next Friday", "in two weeks") against that date. Every date/time you return is a plain LOCAL wall-clock value for the viewer — never attach a timezone or UTC offset to anything.`,
    "If the text gives a single time with no clear end, assume the event is 1 hour long. If it only names a day with no time at all, set allDay to true and leave startTime/endTime out.",
    "Write a short, clean event title (strip out the date/time and location wording) — a few words, not the whole pasted text.",
    "If you truly cannot find any date or day reference anywhere in the text, set \"found\" to false and leave the other fields as best guesses.",
    "",
    "Text to parse:",
    '"""',
    text,
    '"""'
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              allDay: { type: "BOOLEAN" },
              startDate: { type: "STRING" },
              startTime: { type: "STRING", nullable: true },
              endDate: { type: "STRING", nullable: true },
              endTime: { type: "STRING", nullable: true },
              location: { type: "STRING", nullable: true },
              description: { type: "STRING", nullable: true },
              found: { type: "BOOLEAN" }
            },
            required: ["title", "allDay", "startDate", "found"]
          }
        }
      })
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned no content");

  const parsed = JSON.parse(raw);
  if (!parsed.found || !DATE_RE.test(parsed.startDate)) return null;

  const allDay = Boolean(parsed.allDay);
  const startTime = !allDay && TIME_RE.test(parsed.startTime) ? parsed.startTime : null;
  const endTime = !allDay && TIME_RE.test(parsed.endTime) ? parsed.endTime : null;

  return {
    title: (typeof parsed.title === "string" && parsed.title.trim()) || "Untitled event",
    allDay,
    startDate: parsed.startDate,
    startTime,
    endDate: DATE_RE.test(parsed.endDate) ? parsed.endDate : null,
    endTime,
    location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
    description:
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : null,
    source: "ai"
  };
}

export async function POST(request: Request) {
  const { unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const { text, nowDate, nowTime } = body as { text?: string; nowDate?: string; nowTime?: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: "Paste some text first" }, { status: 400 });
  }
  if (!nowDate || !nowTime || !DATE_RE.test(nowDate) || !TIME_RE.test(nowTime)) {
    return NextResponse.json({ error: "nowDate and nowTime are required" }, { status: 400 });
  }

  let draft: ParsedEventDraft | null = null;
  try {
    draft = await parseWithGemini(text, nowDate, nowTime);
  } catch (error) {
    console.error("Quick-add AI parse failed, falling back to local parser", error);
  }

  if (!draft) {
    draft = parseLocally(text, nowDate, nowTime);
  }

  if (!draft) {
    return NextResponse.json(
      { error: "Couldn't find a date or time in that text — try rephrasing, or fill it in manually." },
      { status: 422 }
    );
  }

  return NextResponse.json({ draft });
}
