"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { InviteShare } from "./InviteShare";
import { useFamilySyncListener } from "@/lib/useFamilySync";

interface Member {
  membershipId: string;
  userId: string;
  role: string;
  color: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface FamilyData {
  id: string;
  name: string;
  inviteCode: string;
  mealPrepTypes: string[];
  choresScoringEnabled: boolean;
  screensaverEnabled: boolean;
  screensaverIdleMinutes: number;
  weatherLat: number | null;
  weatherLon: number | null;
  weatherLabel: string | null;
  scores: { userId: string; points: number }[];
  members: Member[];
}

interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1: string | null;
  country: string | null;
  label: string;
}

const MEAL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" }
];

interface FamilyTabProps {
  /** Told when a setting that other parts of the app read (meal-prep
   * types, for now) changed, so they can refetch without a page reload. */
  onFamilyChanged?: () => void;
}

export function FamilyTab({ onFamilyChanged }: FamilyTabProps) {
  const { data: session } = useSession();
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingMealTypes, setSavingMealTypes] = useState(false);
  const [mealTypesError, setMealTypesError] = useState<string | null>(null);
  const [savingScoring, setSavingScoring] = useState(false);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [savingScreensaver, setSavingScreensaver] = useState(false);
  const [screensaverError, setScreensaverError] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const res = await fetch("/api/family");
    if (res.ok) setFamily(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    return () => {
      if (locationSearchTimerRef.current) clearTimeout(locationSearchTimerRef.current);
    };
  }, []);

  // Someone else changed a family setting or the member list in another
  // tab/device — refetch live instead of waiting for a page reload.
  useFamilySyncListener(["family"], load);

  async function toggleMealType(value: string) {
    if (!family) return;
    const enabled = family.mealPrepTypes.includes(value);
    if (enabled && family.mealPrepTypes.length === 1) {
      setMealTypesError("At least one meal has to stay on.");
      return;
    }
    const next = enabled
      ? family.mealPrepTypes.filter((t) => t !== value)
      : [...family.mealPrepTypes, value];

    setMealTypesError(null);
    setSavingMealTypes(true);
    // Optimistic — the meal planner reads this from the same endpoint.
    setFamily({ ...family, mealPrepTypes: next });
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealPrepTypes: next })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMealTypesError(data.error ?? "Couldn't save that.");
      setFamily({ ...family, mealPrepTypes: family.mealPrepTypes }); // revert
    } else {
      onFamilyChanged?.();
    }
    setSavingMealTypes(false);
  }

  async function toggleScoring() {
    if (!family) return;
    const next = !family.choresScoringEnabled;
    setScoringError(null);
    setSavingScoring(true);
    setFamily({ ...family, choresScoringEnabled: next });
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choresScoringEnabled: next })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setScoringError(data.error ?? "Couldn't save that.");
      setFamily({ ...family, choresScoringEnabled: !next }); // revert
    } else {
      onFamilyChanged?.();
      if (next) load(); // pick up the scores list now that it's on
    }
    setSavingScoring(false);
  }

  async function toggleScreensaver() {
    if (!family) return;
    const next = !family.screensaverEnabled;
    setScreensaverError(null);
    setSavingScreensaver(true);
    setFamily({ ...family, screensaverEnabled: next });
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screensaverEnabled: next })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setScreensaverError(data.error ?? "Couldn't save that.");
      setFamily({ ...family, screensaverEnabled: !next }); // revert
    } else {
      onFamilyChanged?.();
    }
    setSavingScreensaver(false);
  }

  async function saveIdleMinutes(minutes: number) {
    if (!family) return;
    const prev = family.screensaverIdleMinutes;
    setFamily({ ...family, screensaverIdleMinutes: minutes });
    setSavingScreensaver(true);
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screensaverIdleMinutes: minutes })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setScreensaverError(data.error ?? "Couldn't save that.");
      setFamily({ ...family, screensaverIdleMinutes: prev });
    } else {
      onFamilyChanged?.();
    }
    setSavingScreensaver(false);
  }

  function onLocationQueryChange(value: string) {
    setLocationQuery(value);
    setLocationError(null);
    if (locationSearchTimerRef.current) clearTimeout(locationSearchTimerRef.current);
    if (value.trim().length < 2) {
      setLocationResults([]);
      return;
    }
    locationSearchTimerRef.current = setTimeout(async () => {
      setSearchingLocation(true);
      const res = await fetch(`/api/family/geocode?q=${encodeURIComponent(value.trim())}`);
      const data = await res.json().catch(() => ({ results: [] }));
      setLocationResults(data.results ?? []);
      setSearchingLocation(false);
    }, 350);
  }

  async function chooseLocation(result: GeocodeResult) {
    if (!family) return;
    setLocationError(null);
    setSavingLocation(true);
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weatherLat: result.latitude,
        weatherLon: result.longitude,
        weatherLabel: result.label
      })
    });
    if (res.ok) {
      setFamily({ ...family, weatherLat: result.latitude, weatherLon: result.longitude, weatherLabel: result.label });
      setLocationQuery("");
      setLocationResults([]);
      onFamilyChanged?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setLocationError(data.error ?? "Couldn't save that location.");
    }
    setSavingLocation(false);
  }

  async function clearLocation() {
    if (!family) return;
    setLocationError(null);
    setSavingLocation(true);
    const res = await fetch("/api/family", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weatherLat: null, weatherLon: null, weatherLabel: null })
    });
    if (res.ok) {
      setFamily({ ...family, weatherLat: null, weatherLon: null, weatherLabel: null });
      onFamilyChanged?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setLocationError(data.error ?? "Couldn't clear that.");
    }
    setSavingLocation(false);
  }

  async function regenerate() {
    if (!window.confirm("Generate a new invite code? The old one will stop working.")) return;
    setRegenerating(true);
    const res = await fetch("/api/family/invite", { method: "POST" });
    if (res.ok) await load();
    setRegenerating(false);
  }

  async function removeMember(member: Member) {
    const label = member.name ?? member.email ?? "this person";
    if (!window.confirm(`Remove ${label} from the family? They'll lose access to this calendar.`)) {
      return;
    }
    setRemovingId(member.membershipId);
    const res = await fetch(`/api/family/members/${member.membershipId}`, { method: "DELETE" });
    if (res.ok) await load();
    setRemovingId(null);
  }

  if (loading) return <p style={styles.muted}>Loading family&hellip;</p>;
  if (!family) return <p style={styles.muted}>Couldn&rsquo;t load your family.</p>;

  const me = family.members.find((m) => m.userId === session?.userId);
  const isOwner = me?.role === "OWNER";

  const scoreByUser = new Map(family.scores.map((s) => [s.userId, s.points]));

  return (
    <div style={styles.wrap}>
      <div>
        <p style={styles.sectionLabel}>{family.name}</p>
        <div style={styles.members}>
          {family.members.map((m) => {
            const canRemove = isOwner && m.role !== "OWNER";
            return (
              <div key={m.membershipId} style={styles.memberRow}>
                <span style={{ ...styles.dot, background: m.color }} />
                <span style={styles.memberName}>{m.name ?? m.email ?? "Family member"}</span>
                {family.choresScoringEnabled && (
                  <span style={styles.points}>{scoreByUser.get(m.userId) ?? 0} pts</span>
                )}
                {m.role === "OWNER" && <span style={styles.ownerTag}>Owner</span>}
                {canRemove && (
                  <button
                    type="button"
                    style={styles.removeButton}
                    onClick={() => removeMember(m)}
                    disabled={removingId === m.membershipId}
                  >
                    {removingId === m.membershipId ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!isOwner && (
          <p style={styles.hint}>Only the family owner can invite or remove members.</p>
        )}
      </div>

      <div style={styles.scoringSection}>
        <p style={styles.sectionLabel}>Chore scoring</p>
        <p style={styles.hint}>
          Track points for completed chores{isOwner ? "" : " — set by the family owner"}
          {family.choresScoringEnabled ? " — shown next to each name above." : ""}.
        </p>
        <button
          type="button"
          disabled={!isOwner || savingScoring}
          onClick={toggleScoring}
          style={{
            ...styles.scoringToggle,
            ...(family.choresScoringEnabled ? styles.scoringToggleOn : {}),
            ...(isOwner ? {} : styles.mealToggleReadOnly)
          }}
          aria-pressed={family.choresScoringEnabled}
        >
          <span
            style={{
              ...styles.mealToggleDot,
              ...(family.choresScoringEnabled ? styles.scoringToggleDotOn : {})
            }}
          />
          {family.choresScoringEnabled ? "On" : "Off"}
        </button>
        {scoringError && <p style={styles.mealError}>{scoringError}</p>}
      </div>

      <div style={styles.mealSection}>
        <p style={styles.sectionLabel}>Meal prep</p>
        <p style={styles.hint}>
          Only these show up in the meal planner{isOwner ? "" : " — set by the family owner"}.
        </p>
        <div style={styles.mealToggleRow}>
          {MEAL_TYPE_OPTIONS.map((opt) => {
            const on = family.mealPrepTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!isOwner || savingMealTypes}
                onClick={() => toggleMealType(opt.value)}
                style={{
                  ...styles.mealToggle,
                  ...(on ? styles.mealToggleOn : {}),
                  ...(isOwner ? {} : styles.mealToggleReadOnly)
                }}
                aria-pressed={on}
              >
                <span style={{ ...styles.mealToggleDot, ...(on ? styles.mealToggleDotOn : {}) }} />
                {opt.label}
              </button>
            );
          })}
        </div>
        {mealTypesError && <p style={styles.mealError}>{mealTypesError}</p>}
      </div>

      <div style={styles.mealSection}>
        <p style={styles.sectionLabel}>Location &amp; weather</p>
        <p style={styles.hint}>
          Used for the screensaver&rsquo;s weather overlay{isOwner ? "" : " — set by the family owner"}.
        </p>
        {family.weatherLabel ? (
          <div style={styles.locationCurrent}>
            <span style={styles.locationCurrentLabel}>{family.weatherLabel}</span>
            {isOwner && (
              <button type="button" style={styles.locationClearButton} onClick={clearLocation} disabled={savingLocation}>
                Change
              </button>
            )}
          </div>
        ) : (
          isOwner && (
            <div style={styles.locationSearchWrap}>
              <input
                value={locationQuery}
                onChange={(e) => onLocationQueryChange(e.target.value)}
                placeholder="Search for a city…"
                style={styles.input}
              />
              {searchingLocation && <p style={styles.hint}>Searching&hellip;</p>}
              {locationResults.length > 0 && (
                <div style={styles.locationResults}>
                  {locationResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={styles.locationResultRow}
                      onClick={() => chooseLocation(r)}
                      disabled={savingLocation}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {!isOwner && !family.weatherLabel && <p style={styles.hint}>No location set yet.</p>}
        {locationError && <p style={styles.mealError}>{locationError}</p>}
      </div>

      <div style={styles.mealSection}>
        <p style={styles.sectionLabel}>Screensaver</p>
        <p style={styles.hint}>
          Rotating stock photos with a clock and weather overlay after the dashboard sits idle
          {isOwner ? "" : " — set by the family owner"}.
        </p>
        <button
          type="button"
          disabled={!isOwner || savingScreensaver}
          onClick={toggleScreensaver}
          style={{
            ...styles.scoringToggle,
            ...(family.screensaverEnabled ? styles.scoringToggleOn : {}),
            ...(isOwner ? {} : styles.mealToggleReadOnly)
          }}
          aria-pressed={family.screensaverEnabled}
        >
          <span
            style={{
              ...styles.mealToggleDot,
              ...(family.screensaverEnabled ? styles.scoringToggleDotOn : {})
            }}
          />
          {family.screensaverEnabled ? "On" : "Off"}
        </button>
        {family.screensaverEnabled && (
          <label style={styles.idleMinutesRow}>
            Starts after
            <select
              value={family.screensaverIdleMinutes}
              onChange={(e) => saveIdleMinutes(Number(e.target.value))}
              disabled={!isOwner || savingScreensaver}
              style={styles.idleMinutesSelect}
            >
              {[2, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            idle
          </label>
        )}
        {screensaverError && <p style={styles.mealError}>{screensaverError}</p>}
      </div>

      <div style={styles.inviteSection}>
        <p style={styles.sectionLabel}>Invite someone else</p>
        <InviteShare code={family.inviteCode} familyName={family.name} />
        {isOwner && (
          <button type="button" style={styles.regenButton} onClick={regenerate} disabled={regenerating}>
            {regenerating ? "Generating…" : "Generate a new code"}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 22 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  hint: { color: "var(--color-muted)", fontSize: 12, margin: "10px 2px 0" },
  sectionLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    margin: "0 0 10px"
  },
  members: { display: "flex", flexDirection: "column", gap: 6 },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 10,
    padding: "9px 12px"
  },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  memberName: { fontSize: 13.5, flex: 1 },
  ownerTag: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-muted)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "2px 8px"
  },
  removeButton: {
    background: "transparent",
    border: "1px solid rgba(240, 99, 61, 0.4)",
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--accent-1)",
    cursor: "pointer"
  },
  scoringSection: {
    borderTop: "1px solid var(--color-hairline)",
    paddingTop: 18
  },
  scoringToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    background: "transparent",
    border: "1.5px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 44,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-muted)",
    cursor: "pointer"
  },
  scoringToggleOn: {
    borderColor: "var(--accent-2)",
    color: "var(--color-paper)",
    background: "rgba(52, 168, 150, 0.12)"
  },
  scoringToggleDotOn: {
    background: "var(--accent-2)",
    borderColor: "var(--accent-2)"
  },
  points: {
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--accent-2)",
    background: "rgba(52, 168, 150, 0.12)",
    borderRadius: 999,
    padding: "2px 9px",
    whiteSpace: "nowrap"
  },
  mealSection: {
    borderTop: "1px solid var(--color-hairline)",
    paddingTop: 18
  },
  mealToggleRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  mealToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "1.5px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 44,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-muted)",
    cursor: "pointer"
  },
  mealToggleOn: {
    borderColor: "var(--accent-3)",
    color: "var(--color-paper)",
    background: "rgba(231, 169, 59, 0.12)"
  },
  mealToggleReadOnly: {
    cursor: "default",
    opacity: 0.85
  },
  mealToggleDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1.5px solid var(--color-hairline-strong)",
    background: "transparent"
  },
  mealToggleDotOn: {
    background: "var(--accent-3)",
    borderColor: "var(--accent-3)"
  },
  mealError: {
    color: "var(--accent-1)",
    fontSize: 12,
    margin: "10px 2px 0"
  },
  input: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    minHeight: 44,
    color: "var(--color-paper)",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    marginTop: 12
  },
  locationSearchWrap: { display: "flex", flexDirection: "column", gap: 6 },
  locationResults: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 10,
    padding: 6
  },
  locationResultRow: {
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "9px 10px",
    minHeight: 40,
    fontSize: 13.5,
    color: "var(--color-paper)",
    textAlign: "left",
    cursor: "pointer"
  },
  locationCurrent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    background: "rgba(237,233,225,0.04)",
    borderRadius: 10,
    padding: "10px 14px"
  },
  locationCurrentLabel: { fontSize: 13.5 },
  locationClearButton: {
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11.5,
    color: "var(--color-muted)",
    cursor: "pointer"
  },
  idleMinutesRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    fontSize: 12.5,
    color: "var(--color-muted)"
  },
  idleMinutesSelect: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "6px 8px",
    color: "var(--color-paper)",
    fontSize: 12.5,
    fontFamily: "inherit"
  },
  inviteSection: {
    borderTop: "1px solid var(--color-hairline)",
    paddingTop: 18
  },
  regenButton: {
    marginTop: 12,
    background: "transparent",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 12.5,
    color: "var(--color-muted)",
    cursor: "pointer"
  }
};
