"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeWeatherCode, type WeatherIconKey } from "@/lib/weather";
import { useFamilySyncListener } from "@/lib/useFamilySync";
import type { FamilyNote } from "./NotesTab";

const NOTES_LIMIT = 3;
// No sync event fires on a schedule — this is just a safety net in case an
// SSE reconnect gets missed while the screensaver's been up a long time.
const NOTES_REFRESH_MS = 5 * 60 * 1000;

// How long each photo stays up before crossfading to the next.
const PHOTO_INTERVAL_MS = 25000;
// Gives the (invisible) back layer's <img> a moment to load before it gets
// crossfaded into view — otherwise a slow network shows a blank flash
// instead of the old photo held a beat longer.
const CROSSFADE_DELAY_MS = 600;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Picsum's /seed/ path returns a stable photo per seed and needs no API
 * key or account — a fresh random seed each rotation is effectively a
 * random stock photo. Requested at a size that covers a large kiosk
 * display; the browser handles any further downscaling. */
function randomPhotoUrl() {
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://picsum.photos/seed/${seed}/1920/1080`;
}

interface WeatherState {
  location: string | null;
  current: { tempF: number; weatherCode: number; isDay: boolean } | null;
}

function WeatherIcon({ icon }: { icon: WeatherIconKey }) {
  const common = { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true };
  switch (icon) {
    case "clear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "cloud-sun":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 3.5v1.6M4.3 9H6M12.6 5.7l-1.1 1.1M4.9 12.4l1.1-1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M8 20h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8 12.2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "fog":
      return (
        <svg {...common}>
          <path
            d="M6 12h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6.2 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M4 16h16M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "rain":
      return (
        <svg {...common}>
          <path
            d="M6 11h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6.2 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16l-1.5 3M13 16l-1.5 3M18 16l-1.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path
            d="M6 11h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6.2 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M9 16v5M6.5 17.5l5 2M11.5 17.5l-5 2M15 16v5M12.5 17.5l5 2M17.5 17.5l-5 2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "storm":
      return (
        <svg {...common}>
          <path
            d="M6 10h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6.2 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M12.5 13l-3 5h3l-2 4.5 5.5-7h-3l2.5-2.5z" fill="currentColor" />
        </svg>
      );
    case "cloud":
    default:
      return (
        <svg {...common}>
          <path
            d="M6 16h10.5a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.3 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

/** Full-screen idle overlay — rotating stock photos (Picsum, no key/upload
 * needed) crossfading behind a clock + date + current-weather readout.
 * Rendered by CalendarBoard whenever `useIdle` reports the dashboard has
 * sat untouched past the family's configured threshold; any of the same
 * activity events that hook listens for (click, key, touch, scroll,
 * mousemove) bubble straight through this overlay and dismiss it — no
 * separate dismiss handler needed here. */
interface ScreensaverProps {
  /** Called on any click/tap/keypress on the overlay itself — on top of
   * `useIdle`'s own window-level listeners (which handle the "idle timed
   * out" path by resetting that timer), this is what clears a screensaver
   * that was opened manually via the header button, which isn't tracked
   * by the idle timer at all. */
  onDismiss?: () => void;
}

export function Screensaver({ onDismiss }: ScreensaverProps) {
  const [frontIsA, setFrontIsA] = useState(true);
  const frontIsARef = useRef(frontIsA);
  const [urlA, setUrlA] = useState(randomPhotoUrl);
  const [urlB, setUrlB] = useState(randomPhotoUrl);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [notes, setNotes] = useState<FamilyNote[]>([]);

  useEffect(() => {
    frontIsARef.current = frontIsA;
  }, [frontIsA]);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const rotateTimer = setInterval(() => {
      const nextUrl = randomPhotoUrl();
      if (frontIsARef.current) {
        setUrlB(nextUrl);
      } else {
        setUrlA(nextUrl);
      }
      setTimeout(() => setFrontIsA((prev) => !prev), CROSSFADE_DELAY_MS);
    }, PHOTO_INTERVAL_MS);
    return () => clearInterval(rotateTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/weather");
        if (!cancelled && res.ok) setWeather(await res.json());
      } catch {
        // Weather is a nice-to-have overlay, not core to the screensaver —
        // a failed fetch just means the clock/photos show without it.
      }
    }
    load();
    const weatherTimer = setInterval(load, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(weatherTimer);
    };
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setNotes((data.notes as FamilyNote[]).slice(0, NOTES_LIMIT));
      }
    } catch {
      // A nice-to-have overlay, not core to the screensaver working at all
      // — a failed fetch just means it shows without the note stack.
    }
  }, []);

  useEffect(() => {
    loadNotes();
    const notesTimer = setInterval(loadNotes, NOTES_REFRESH_MS);
    return () => clearInterval(notesTimer);
  }, [loadNotes]);

  // A note posted (or taken down) elsewhere while the screensaver's up
  // shows without waiting for the fallback timer above — this is the fast
  // path, that timer is just a safety net for a missed SSE reconnect.
  useFamilySyncListener(["notes"], loadNotes);

  const condition = weather?.current ? describeWeatherCode(weather.current.weatherCode, weather.current.isDay) : null;

  return (
    <div
      className="decal-screensaver-in"
      style={styles.overlay}
      role="button"
      tabIndex={0}
      aria-label="Screensaver — tap, click, or press any key to return"
      onClick={onDismiss}
      onTouchStart={onDismiss}
      onKeyDown={onDismiss}
    >
      <img src={urlA} alt="" style={{ ...styles.photo, opacity: frontIsA ? 1 : 0 }} />
      <img src={urlB} alt="" style={{ ...styles.photo, opacity: frontIsA ? 0 : 1 }} />
      <div style={styles.scrim} />

      {notes.length > 0 && (
        <div style={styles.notesStack}>
          {notes.map((note, i) => (
            <div
              key={note.id}
              style={{
                ...styles.noteCard,
                borderLeftColor: note.authorColor,
                // A slight alternating tilt is the only thing separating
                // this from a plain list — enough to read as "stuck up
                // notes" without leaning on any external image/icon asset.
                transform: `rotate(${i % 2 === 0 ? -1.2 : 1.2}deg)`
              }}
            >
              <p style={styles.noteCardText}>{note.text}</p>
              <p style={{ ...styles.noteCardAuthor, color: note.authorColor }}>
                {note.authorName ?? "Someone"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={styles.content}>
        <p style={styles.time}>{TIME_FORMAT.format(now)}</p>
        <p style={styles.date}>{DATE_FORMAT.format(now)}</p>
        {condition && weather?.current && (
          <div style={styles.weatherRow}>
            <WeatherIcon icon={condition.icon} />
            <span style={styles.weatherTemp}>{weather.current.tempF}&deg;</span>
            <span style={styles.weatherLabel}>
              {condition.label}
              {weather.location ? ` · ${weather.location}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "#000",
    overflow: "hidden",
    cursor: "pointer"
  },
  photo: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "opacity 1.6s ease"
  },
  scrim: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.55) 100%)"
  },
  content: {
    position: "absolute",
    left: "5vw",
    bottom: "6vh",
    color: "var(--color-paper)",
    textShadow: "0 2px 18px rgba(0,0,0,0.55)"
  },
  time: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "clamp(56px, 10vw, 128px)",
    lineHeight: 1,
    margin: 0
  },
  date: {
    fontSize: "clamp(16px, 2vw, 26px)",
    margin: "10px 0 0",
    color: "rgba(237,233,225,0.85)"
  },
  weatherRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 22
  },
  weatherTemp: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "clamp(24px, 2.6vw, 34px)"
  },
  weatherLabel: {
    fontSize: "clamp(14px, 1.6vw, 18px)",
    color: "rgba(237,233,225,0.85)"
  },
  notesStack: {
    position: "absolute",
    top: "6vh",
    right: "5vw",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxWidth: "min(340px, 30vw)"
  },
  noteCard: {
    background: "rgba(20, 23, 29, 0.72)",
    backdropFilter: "blur(6px)",
    borderLeft: "3px solid transparent",
    borderRadius: 10,
    padding: "14px 16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
  },
  noteCardText: {
    color: "var(--color-paper)",
    fontSize: "clamp(14px, 1.5vw, 17px)",
    lineHeight: 1.4,
    margin: "0 0 8px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere"
  },
  noteCardAuthor: {
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    margin: 0,
    fontWeight: 600
  }
};
