"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedEventDraft } from "@/lib/quickAdd";

// Web Speech API isn't in TypeScript's DOM lib yet, and support is
// browser-specific (Chrome/Safari ship it prefixed as webkitSpeechRecognition,
// Firefox doesn't ship it at all) — so this is detected at runtime and typed
// loosely rather than pulled in as a real interface.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nowTimeLocal() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Builds a real local Date from plain wall-clock components — the browser's
 * own timezone is what makes this correct, no conversion needed. Same
 * pattern the rest of the app uses for date-only fields (see lib/dates.ts). */
function combineLocal(dateStr: string, timeStr: string | null) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!timeStr) return new Date(y, (m || 1) - 1, d || 1);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

function addDaysToDateString(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function addOneHour(timeStr: string) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const total = (hh * 60 + mm + 60) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Turns a RecurrenceDraft (plain wall-clock fields, per its own comment in
 * lib/quickAdd.ts) into the actual RFC 5545 lines Google Calendar expects.
 * The one part that genuinely needs a real instant — UNTIL — is built here
 * specifically because this is client code running in the browser, so
 * `combineLocal` below resolves it in the family's own actual timezone,
 * the same way startISO/endISO already do in create() — doing this
 * server-side would use whatever timezone the server container happens to
 * be running in instead, silently wrong for anyone not in that timezone. */
function buildRecurrenceRules(recurrence: NonNullable<ParsedEventDraft["recurrence"]>): string[] {
  const parts = [`FREQ=${recurrence.freq}`];
  if (recurrence.byDay?.length) parts.push(`BYDAY=${recurrence.byDay.join(",")}`);
  if (recurrence.untilDate) {
    // End-of-day LOCAL time on the until date, so the intended last
    // occurrence (whatever time of day the event actually falls at) is
    // still included — RRULE's UNTIL is inclusive only if it's
    // timestamped at or after that occurrence's own start.
    const untilLocal = combineLocal(recurrence.untilDate, "23:59");
    const stamp = untilLocal.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    parts.push(`UNTIL=${stamp}`);
  }
  return [`RRULE:${parts.join(";")}`];
}

interface QuickAddPanelProps {
  /** Skips this component's own card chrome (border/background/heading) —
   * for use inside something that already supplies a title and scrollable
   * frame, like MobileFullScreenModal on mobile's quick-add screen. The
   * desktop sidebar usage (CalendarBoard) omits this and gets the normal
   * self-contained card. */
  bare?: boolean;
  /** Hides the voice-input mic button even where the Web Speech API is
   * otherwise detected as supported. MobileAgenda passes this — the mic
   * button is a Chrome/desktop-Safari feature in practice; inside a
   * Capacitor WKWebView, SpeechRecognition support is inconsistent at best
   * and would need its own native mic-permission wiring (an
   * NSMicrophoneUsageDescription entry, at minimum) that nothing here sets
   * up, so showing it on mobile mostly just offers a button that doesn't
   * work. */
  hideMic?: boolean;
}

/** Paste-text-to-event: paste something with a date in it, get back an
 * editable preview, confirm to create it on your own Google Calendar. Never
 * creates anything without a confirm — parsing (AI or local) can get
 * details wrong, so nothing is written until the person looks it over. */
export function QuickAddPanel({ bare, hideMic }: QuickAddPanelProps) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedEventDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Only Chrome/Safari (as of this writing) ship the Web Speech API — hide
  // the mic entirely rather than show a button that just fails everywhere
  // else (Firefox has no native support).
  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((result: any) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function parse(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setParsing(true);
    setParseError(null);
    setJustAdded(false);
    try {
      const res = await fetch("/api/calendar/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), nowDate: todayLocal(), nowTime: nowTimeLocal() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that — try rephrasing.");
      setDraft(data.draft);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(patch: Partial<ParsedEventDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function create() {
    if (!draft) return;
    setCreating(true);
    setCreateError(null);
    try {
      const startISO = draft.allDay
        ? draft.startDate
        : combineLocal(draft.startDate, draft.startTime || "09:00").toISOString();
      const endISO = draft.allDay
        ? addDaysToDateString(draft.endDate || draft.startDate, 1)
        : combineLocal(
            draft.endDate || draft.startDate,
            draft.endTime || addOneHour(draft.startTime || "09:00")
          ).toISOString();

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description || undefined,
          location: draft.location || undefined,
          start: startISO,
          end: endISO,
          allDay: draft.allDay,
          recurrence: draft.recurrence ? buildRecurrenceRules(draft.recurrence) : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't create that event.");
      // The calendar view picks this up on its own — creating fires the
      // same "calendar" sync event editing/hiding does, and every open tab
      // (including this one) is already listening for it.
      setDraft(null);
      setText("");
      setJustAdded(true);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  const showMic = voiceSupported && !hideMic;

  const formBody = (
    <>
      {!draft ? (
          <form onSubmit={parse} style={styles.form}>
            <div style={styles.textareaWrap}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Paste anything with a date — "9pm-10pm Sunday, dinner at Joe\'s"'}
                style={{ ...styles.textarea, ...(showMic ? { paddingRight: 44 } : {}) }}
                rows={3}
              />
              {showMic && (
                <button
                  type="button"
                  onClick={toggleListening}
                  style={{ ...styles.micButton, ...(listening ? styles.micButtonActive : {}) }}
                  aria-label={listening ? "Stop voice input" : "Add by voice"}
                  aria-pressed={listening}
                  title={listening ? "Listening… tap to stop" : "Add by voice"}
                >
                  <MicIcon />
                </button>
              )}
            </div>
            {listening && <p style={styles.listeningNote}>Listening&hellip;</p>}
            {parseError && <p style={styles.error}>{parseError}</p>}
            {justAdded && <p style={styles.success}>Added to your calendar.</p>}
            <button type="submit" style={styles.parseButton} disabled={parsing || !text.trim()}>
              {parsing ? "Reading…" : "Parse text"}
            </button>
          </form>
        ) : (
          <div style={styles.preview}>
            <p style={styles.sourceNote}>
              {draft.source === "ai"
                ? "Parsed with AI — double-check before adding."
                : "Parsed locally — double-check before adding."}
            </p>

            <label style={styles.fieldLabel}>
              Title
              <input
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                style={styles.input}
              />
            </label>

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(e) => updateDraft({ allDay: e.target.checked })}
              />
              All day
            </label>

            {draft.recurrence && (
              <div style={styles.recurrenceRow}>
                <span style={styles.recurrenceLabel}>
                  <span style={styles.recurrenceBadge}>Repeats</span>
                  {draft.recurrence.label}
                </span>
                <button
                  type="button"
                  style={styles.recurrenceClear}
                  onClick={() => updateDraft({ recurrence: null })}
                  title="Turn this into a one-time event instead"
                >
                  Make one-time
                </button>
              </div>
            )}

            <div style={styles.formGrid}>
              <label style={styles.fieldLabel}>
                {draft.recurrence ? "First occurrence" : "Starts"}
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => updateDraft({ startDate: e.target.value })}
                  style={styles.input}
                />
              </label>
              {!draft.allDay && (
                <label style={styles.fieldLabel}>
                  Time
                  <input
                    type="time"
                    value={draft.startTime ?? ""}
                    onChange={(e) => updateDraft({ startTime: e.target.value })}
                    style={styles.input}
                  />
                </label>
              )}
            </div>

            <div style={styles.formGrid}>
              <label style={styles.fieldLabel}>
                Ends
                <input
                  type="date"
                  value={draft.endDate ?? draft.startDate}
                  onChange={(e) => updateDraft({ endDate: e.target.value })}
                  style={styles.input}
                />
              </label>
              {!draft.allDay && (
                <label style={styles.fieldLabel}>
                  Time
                  <input
                    type="time"
                    value={draft.endTime ?? ""}
                    onChange={(e) => updateDraft({ endTime: e.target.value })}
                    style={styles.input}
                  />
                </label>
              )}
            </div>

            <label style={styles.fieldLabel}>
              Location
              <input
                value={draft.location ?? ""}
                onChange={(e) => updateDraft({ location: e.target.value })}
                placeholder="Optional"
                style={styles.input}
              />
            </label>

            {createError && <p style={styles.error}>{createError}</p>}

            <div style={styles.previewActions}>
              <button type="button" style={styles.cancelButton} onClick={() => setDraft(null)}>
                Start over
              </button>
              <button type="button" style={styles.addButton} onClick={create} disabled={creating}>
                {creating ? "Adding…" : "Add to calendar"}
              </button>
            </div>
          </div>
        )}
    </>
  );

  if (bare) return formBody;

  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <p style={styles.eyebrow}>Quick add</p>
        <h3 style={styles.heading}>Paste to add an event</h3>
      </div>
      <div style={styles.body}>{formBody}</div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline)",
    borderRadius: "var(--radius-card)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    maxHeight: "48vh",
    overflow: "hidden"
  },
  header: {
    padding: "16px 18px 12px",
    borderBottom: "1px solid var(--color-hairline)",
    flexShrink: 0
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--accent-5)",
    margin: "0 0 4px"
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 16,
    margin: 0
  },
  body: {
    padding: 16,
    overflowY: "auto",
    flex: 1,
    minHeight: 0
  },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  textareaWrap: { position: "relative" },
  textarea: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    color: "var(--color-paper)",
    fontSize: 13.5,
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: 64,
    width: "100%"
  },
  micButton: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--color-panel-raised)",
    border: "1px solid var(--color-hairline-strong)",
    color: "var(--color-muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease"
  },
  micButtonActive: {
    background: "var(--accent-1)",
    borderColor: "var(--accent-1)",
    color: "var(--color-ink-deep)"
  },
  listeningNote: {
    fontSize: 11.5,
    color: "var(--accent-1)",
    fontStyle: "italic",
    margin: 0
  },
  error: { color: "var(--accent-1)", fontSize: 12.5, margin: 0 },
  success: { color: "var(--accent-2)", fontSize: 12.5, margin: 0 },
  parseButton: {
    background: "var(--accent-5)",
    border: "none",
    borderRadius: 999,
    padding: "11px 18px",
    minHeight: 44,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  },
  preview: { display: "flex", flexDirection: "column", gap: 12 },
  sourceNote: {
    fontSize: 11.5,
    color: "var(--color-muted)",
    fontStyle: "italic",
    margin: 0
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--color-muted)"
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--color-paper)"
  },
  recurrenceRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "8px 10px"
  },
  recurrenceLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--color-paper)"
  },
  recurrenceBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--accent-5)"
  },
  recurrenceClear: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 11.5,
    textDecoration: "underline",
    cursor: "pointer"
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10
  },
  input: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    minHeight: 42,
    color: "var(--color-paper)",
    fontSize: 13.5,
    fontFamily: "inherit"
  },
  previewActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancelButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 42,
    fontSize: 13,
    color: "var(--color-paper)",
    cursor: "pointer"
  },
  addButton: {
    background: "var(--accent-5)",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    minHeight: 42,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  }
};
