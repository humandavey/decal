"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { InviteShare } from "./InviteShare";

type Mode = "choose" | "create" | "join" | "created";

/** Shown right after sign-in for anyone who isn't in a family yet. Lets them
 * either start a brand-new family (and immediately share the invite) or
 * join one someone else already started. */
export function FamilyOnboarding() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("choose");
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ familyName: string; inviteCode: string } | null>(null);

  const defaultFamilyName = session?.user?.name
    ? `${session.user.name.split(" ")[0]}'s Family`
    : "Our Family";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/family/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: familyName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create your family");
      await update({ familyId: data.familyId });
      setCreated({ familyName: data.familyName, inviteCode: data.inviteCode });
      setMode("created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't join that family");
      await update({ familyId: data.familyId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Decal</p>

        {mode === "choose" && (
          <>
            <h1 style={styles.headline}>One last step.</h1>
            <p style={styles.copy}>
              Create a new family calendar, or join one someone in your family already started.
            </p>
            <div style={styles.choiceRow}>
              <button type="button" style={styles.primaryButton} onClick={() => setMode("create")}>
                Create a family
              </button>
              <button type="button" style={styles.secondaryButton} onClick={() => setMode("join")}>
                Join with a code
              </button>
            </div>
          </>
        )}

        {mode === "create" && (
          <form onSubmit={handleCreate} style={styles.form}>
            <h1 style={styles.headline}>Name your family calendar</h1>
            <input
              autoFocus
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder={defaultFamilyName}
              style={styles.input}
            />
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.formRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => setMode("choose")}>
                Back
              </button>
              <button type="submit" style={styles.primaryButton} disabled={submitting}>
                {submitting ? "Creating…" : "Create family"}
              </button>
            </div>
          </form>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin} style={styles.form}>
            <h1 style={styles.headline}>Enter your invite code</h1>
            <p style={styles.copy}>Get this from whoever set up your family&rsquo;s calendar.</p>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K4R8QXT"
              style={{ ...styles.input, ...styles.codeInput }}
            />
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.formRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => setMode("choose")}>
                Back
              </button>
              <button type="submit" style={styles.primaryButton} disabled={submitting}>
                {submitting ? "Joining…" : "Join family"}
              </button>
            </div>
          </form>
        )}

        {mode === "created" && created && (
          <>
            <h1 style={styles.headline}>{created.familyName} is ready.</h1>
            <p style={styles.copy}>
              Share this with the rest of your family so everyone lands on the same calendar.
            </p>
            <InviteShare code={created.inviteCode} familyName={created.familyName} />
            <button
              type="button"
              style={{ ...styles.primaryButton, marginTop: 24, width: "100%" }}
              onClick={() => router.refresh()}
            >
              Continue to your calendar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  card: {
    width: "100%",
    maxWidth: 460,
    textAlign: "center",
    background: "var(--color-panel)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: "var(--radius-card)",
    padding: "48px 40px"
  },
  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--accent-1)",
    margin: 0
  },
  headline: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "clamp(24px, 3.6vw, 32px)",
    lineHeight: 1.2,
    margin: "16px 0 8px"
  },
  copy: {
    color: "var(--color-muted)",
    fontSize: 14.5,
    lineHeight: 1.6,
    margin: "0 0 24px"
  },
  choiceRow: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  form: {
    display: "flex",
    flexDirection: "column",
    textAlign: "left"
  },
  formRow: {
    display: "flex",
    gap: 10,
    marginTop: 20
  },
  input: {
    width: "100%",
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 10,
    padding: "12px 14px",
    color: "var(--color-paper)",
    fontSize: 15
  },
  codeInput: {
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.14em",
    textAlign: "center",
    textTransform: "uppercase"
  },
  error: {
    color: "var(--accent-1)",
    fontSize: 13,
    margin: "12px 0 0"
  },
  primaryButton: {
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    border: "none",
    borderRadius: 999,
    padding: "13px 26px",
    fontSize: 14.5,
    fontWeight: 600,
    cursor: "pointer",
    flex: 1
  },
  secondaryButton: {
    background: "transparent",
    color: "var(--color-paper)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "13px 26px",
    fontSize: 14.5,
    fontWeight: 600,
    cursor: "pointer",
    flex: 1
  }
};
