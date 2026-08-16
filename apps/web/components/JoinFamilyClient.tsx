"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

interface JoinFamilyClientProps {
  code: string;
  familyName: string | null;
  isSignedIn: boolean;
  alreadyInFamily: boolean;
}

/** The landing screen for an invite link (`/join?code=...`). Handles every
 * combination: not signed in yet, signed in with no family, or signed in
 * and already part of one. */
export function JoinFamilyClient({ code, familyName, isSignedIn, alreadyInFamily }: JoinFamilyClientProps) {
  const router = useRouter();
  const { update } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const codeIsValid = Boolean(code) && Boolean(familyName);

  async function handleJoin() {
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
      setJoined(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  let body: React.ReactNode;

  if (!code) {
    body = (
      <>
        <h1 style={styles.headline}>Missing invite code</h1>
        <p style={styles.copy}>
          This link is missing its invite code. Ask whoever sent it to resend, or head back and
          create your own family.
        </p>
        <a style={styles.linkButton} href="/">
          Go to Decal
        </a>
      </>
    );
  } else if (!codeIsValid) {
    body = (
      <>
        <h1 style={styles.headline}>Invite not found</h1>
        <p style={styles.copy}>
          The code <strong>{code}</strong> doesn&rsquo;t match a family. It may have been
          regenerated — ask for a fresh link.
        </p>
        <a style={styles.linkButton} href="/">
          Go to Decal
        </a>
      </>
    );
  } else if (!isSignedIn) {
    body = (
      <>
        <p style={styles.eyebrow}>You&rsquo;re invited</p>
        <h1 style={styles.headline}>Join {familyName}</h1>
        <p style={styles.copy}>Sign in with Google to join this family&rsquo;s shared calendar.</p>
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => signIn("google", { callbackUrl: `/join?code=${code}` })}
        >
          Sign in with Google
        </button>
      </>
    );
  } else if (alreadyInFamily) {
    body = (
      <>
        <h1 style={styles.headline}>You&rsquo;re already in a family</h1>
        <p style={styles.copy}>
          Your account is already part of a family calendar, so it can&rsquo;t join {familyName}{" "}
          too. Ask an owner to remove you from your current family first if you meant to switch.
        </p>
        <a style={styles.linkButton} href="/">
          Go to your calendar
        </a>
      </>
    );
  } else if (joined) {
    body = (
      <>
        <h1 style={styles.headline}>You&rsquo;re in!</h1>
        <p style={styles.copy}>Loading {familyName}&rsquo;s calendar&hellip;</p>
      </>
    );
  } else {
    body = (
      <>
        <p style={styles.eyebrow}>You&rsquo;re invited</p>
        <h1 style={styles.headline}>Join {familyName}</h1>
        <p style={styles.copy}>
          You&rsquo;ll see the same calendar, chores, meal plan, and to-do list as everyone else
          in this family.
        </p>
        {error && <p style={styles.error}>{error}</p>}
        <button type="button" style={styles.primaryButton} onClick={handleJoin} disabled={submitting}>
          {submitting ? "Joining…" : `Join ${familyName}`}
        </button>
      </>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>{body}</div>
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
    maxWidth: 440,
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
    margin: "0 0 28px"
  },
  error: {
    color: "var(--accent-1)",
    fontSize: 13,
    margin: "0 0 16px"
  },
  primaryButton: {
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    border: "none",
    borderRadius: 999,
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer"
  },
  linkButton: {
    display: "inline-block",
    background: "var(--accent-1)",
    color: "var(--color-ink-deep)",
    borderRadius: 999,
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none"
  }
};
