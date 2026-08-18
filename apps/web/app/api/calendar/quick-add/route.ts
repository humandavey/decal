import { NextResponse } from "next/server";
import * as chrono from "chrono-node";
import { requireFamilySession } from "@/lib/session";
import type { ParsedEventDraft, RecurrenceDraft } from "@/lib/quickAdd";
import { recurrenceLabel } from "@/lib/quickAdd";

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

// --- Recurrence detection (local parser only) --------------------------
//
// chrono-node has no concept of recurrence at all — it only ever finds a
// single point in time (or a start/end pair). Handing it text like "every
// wednesday from 4-6pm through december 16" unmodified used to produce
// exactly the bug this block fixes: chrono would grab SOME fragment of
// that (often just the bare time range) as its one result, silently
// default the date to today since nothing else in that specific fragment
// named a day, and leave "every," "wednesday," and "through december 16"
// scattered as unconsumed text that became a garbled title.
//
// The fix: detect recurrence wording FIRST, strip it out of the text
// entirely, and compute the correct first-occurrence date ourselves from
// the named weekday — only THEN hand what's left to chrono, which at that
// point is only ever looking for a bare time-of-day, something it's
// reliably good at.

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const WEEKDAY_CODE: Record<string, string> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA"
};

const EVERY_WEEKDAY_RE =
  /\b(?:every|each)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i;
const WEEKLY_ON_WEEKDAY_RE =
  /\bweekly\s+on\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i;
const EVERY_DAY_RE = /\b(?:every day|daily)\b/i;
const UNTIL_RE = /\b(?:through|until|thru)\s+([^.,;]+)/i;

interface LocalRecurrenceMatch {
  freq: "DAILY" | "WEEKLY";
  /** Day-of-week index (0=Sunday), when a specific weekday was named —
   * used to compute the correct first-occurrence date ourselves, since
   * that wording is stripped out of `rest` before chrono ever sees it. */
  byDayIndex: number | null;
  byDay: string[] | null;
  untilDate: string | null;
  label: string;
  /** The original text with all recurrence/until wording removed — safe
   * to hand to chrono for time-of-day extraction only. */
  rest: string;
}

/** Returns null when no recurrence wording is present at all, so plain
 * one-time text ("next Wednesday," "this Friday") is completely
 * unaffected and falls through to the exact same parsing as before this
 * existed. Only ever recognizes an explicit recurrence signal word
 * ("every"/"each"/"weekly"/"daily") — never inferred just from a bare
 * weekday mention, which would incorrectly turn plain one-time phrasing
 * like "next Wednesday" into a repeating event. */
function extractRecurrence(text: string, refDate: Date): LocalRecurrenceMatch | null {
  let working = text;
  let freq: "DAILY" | "WEEKLY";
  let byDayIndex: number | null = null;
  let byDay: string[] | null = null;

  const everyMatch = working.match(EVERY_WEEKDAY_RE) ?? working.match(WEEKLY_ON_WEEKDAY_RE);
  if (everyMatch) {
    const day = everyMatch[1].toLowerCase();
    freq = "WEEKLY";
    byDayIndex = WEEKDAY_INDEX[day];
    byDay = [WEEKDAY_CODE[day]];
    working = working.slice(0, everyMatch.index) + working.slice(everyMatch.index! + everyMatch[0].length);
  } else if (EVERY_DAY_RE.test(working)) {
    freq = "DAILY";
    working = working.replace(EVERY_DAY_RE, "");
  } else {
    return null;
  }

  let untilDate: string | null = null;
  const untilMatch = working.match(UNTIL_RE);
  if (untilMatch) {
    const parsed = chrono.parseDate(untilMatch[1].trim(), refDate, { forwardDate: true });
    if (parsed) untilDate = formatDate(parsed);
    working = working.slice(0, untilMatch.index) + working.slice(untilMatch.index! + untilMatch[0].length);
  }

  return {
    freq,
    byDayIndex,
    byDay,
    untilDate,
    label: recurrenceLabel(freq, byDay, untilDate),
    rest: working.replace(/\s+/g, " ").trim()
  };
}

/** Next date (today included) that falls on `weekdayIndex` (0=Sunday) —
 * "every Wednesday" starting from a Tuesday means the coming Wednesday;
 * starting from a Wednesday means today. */
function nextOccurrenceOf(weekdayIndex: number, refDate: Date): Date {
  const result = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const diff = (weekdayIndex - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

function buildDraft(params: {
  title: string;
  allDay: boolean;
  startDateObj: Date;
  endDateObj: Date | null;
  location: string | null;
  recurrence: RecurrenceDraft | null;
}): ParsedEventDraft {
  const { title, allDay, startDateObj, endDateObj, location, recurrence } = params;
  return {
    title: cleanTitle(title),
    allDay,
    startDate: formatDate(startDateObj),
    startTime: allDay ? null : formatTime(startDateObj),
    endDate: endDateObj ? formatDate(endDateObj) : null,
    endTime: endDateObj && !allDay ? formatTime(endDateObj) : null,
    location,
    description: null,
    recurrence,
    source: "local"
  };
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

  const recurrence = extractRecurrence(text, refDate);

  if (!recurrence) {
    // Unchanged from before recurrence detection existed.
    const results = chrono.parse(text, refDate, { forwardDate: true });
    if (results.length === 0) return null;

    const result = results[0];
    const allDay = !result.start.isCertain("hour");
    const startDateObj = result.start.date();
    const endDateObj = result.end ? result.end.date() : null;

    const before = text.slice(0, result.index);
    const after = text.slice(result.index + result.text.length);
    const { location, rest } = extractLocation(`${before} ${after}`.trim());

    return buildDraft({ title: rest, allDay, startDateObj, endDateObj, location, recurrence: null });
  }

  // Recurrence detected — `recurrence.rest` has already had the
  // weekday/"every day" wording (and any "through"/"until" bound) removed,
  // so chrono is only ever looking for a bare time-of-day here, never a
  // date. See this function-block's header comment for why that matters.
  const timeResults = chrono.parse(recurrence.rest, refDate, { forwardDate: true });
  const timeResult = timeResults[0] ?? null;
  const allDay = !timeResult || !timeResult.start.isCertain("hour");

  const startDateObj =
    recurrence.byDayIndex != null ? nextOccurrenceOf(recurrence.byDayIndex, refDate) : new Date(refDate);
  if (timeResult && !allDay) {
    const t = timeResult.start.date();
    startDateObj.setHours(t.getHours(), t.getMinutes(), 0, 0);
  }

  let endDateObj: Date | null = null;
  if (timeResult?.end && !allDay) {
    const t = timeResult.end.date();
    endDateObj = new Date(startDateObj);
    endDateObj.setHours(t.getHours(), t.getMinutes(), 0, 0);
  }

  const before = timeResult ? recurrence.rest.slice(0, timeResult.index) : recurrence.rest;
  const after = timeResult ? recurrence.rest.slice(timeResult.index + timeResult.text.length) : "";
  const { location, rest } = extractLocation(`${before} ${after}`.trim());

  return buildDraft({
    title: rest,
    allDay,
    startDateObj,
    endDateObj,
    location,
    recurrence: {
      freq: recurrence.freq,
      byDay: recurrence.byDay,
      untilDate: recurrence.untilDate,
      label: recurrence.label
    }
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const RRULE_DAY_CODES = new Set(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);

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
    'If the text describes something that repeats — "every Wednesday," "weekly," "every day," "daily," etc. — fill in the `recurrence` object: `freq` is "WEEKLY" or "DAILY"; `byDay` is an array of two-letter codes (SU, MO, TU, WE, TH, FR, SA) for a WEEKLY rule tied to specific day(s) of the week, or omit it for DAILY or an unqualified weekly rule; `untilDate` is a plain YYYY-MM-DD if the text gives an end bound ("through December 16," "until the end of the month"), otherwise omit it. `startDate`/`startTime` should still be the FIRST occurrence (matching the named day of the week, not necessarily today). Leave `recurrence` entirely out for a normal one-time event — do not guess a recurrence that isn\'t stated.',
    "Write a short, clean event title (strip out the date/time, recurrence, and location wording) — a few words, not the whole pasted text.",
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
              found: { type: "BOOLEAN" },
              recurrence: {
                type: "OBJECT",
                nullable: true,
                properties: {
                  freq: { type: "STRING" },
                  byDay: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
                  untilDate: { type: "STRING", nullable: true }
                },
                required: ["freq"]
              }
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

  let recurrence: RecurrenceDraft | null = null;
  const rawRecurrence = parsed.recurrence;
  if (rawRecurrence && typeof rawRecurrence === "object") {
    const freq = rawRecurrence.freq === "DAILY" ? "DAILY" : rawRecurrence.freq === "WEEKLY" ? "WEEKLY" : null;
    if (freq) {
      const byDay = Array.isArray(rawRecurrence.byDay)
        ? rawRecurrence.byDay.filter((code: unknown): code is string => typeof code === "string" && RRULE_DAY_CODES.has(code))
        : null;
      const untilDate =
        typeof rawRecurrence.untilDate === "string" && DATE_RE.test(rawRecurrence.untilDate)
          ? rawRecurrence.untilDate
          : null;
      const cleanByDay = byDay && byDay.length ? byDay : null;
      recurrence = { freq, byDay: cleanByDay, untilDate, label: recurrenceLabel(freq, cleanByDay, untilDate) };
    }
  }

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
    recurrence,
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
