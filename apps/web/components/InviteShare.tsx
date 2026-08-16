"use client";

import { useEffect, useState } from "react";

interface InviteShareProps {
  code: string;
  familyName: string;
}

/** Copyable invite code + link + a pre-filled email draft — used on the
 * onboarding "family created" screen and again later in the Family tab so
 * an owner can re-invite someone. */
export function InviteShare({ code, familyName }: InviteShareProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = origin ? `${origin}/join?code=${code}` : "";

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard API can be unavailable (older browsers, non-https) — the
      // text is still selectable/visible, so this is a soft failure.
    }
  }

  const mailSubject = encodeURIComponent(`Join our ${familyName} calendar`);
  const mailBody = encodeURIComponent(
    `Hey — join our family calendar on Decal so we're all looking at the same thing.\n\n` +
      `Click this link and sign in with Google:\n${link}\n\n` +
      `Or open Decal and enter the invite code: ${code}`
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <span style={styles.code}>{code}</span>
        <button type="button" style={styles.smallButton} onClick={() => copy(code, "code")}>
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
      </div>
      <div style={styles.row}>
        <input readOnly value={link} style={styles.linkInput} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          style={styles.smallButton}
          onClick={() => copy(link, "link")}
          disabled={!link}
        >
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
      <a style={styles.mailto} href={`mailto:?subject=${mailSubject}&body=${mailBody}`}>
        Email this invite &rarr;
      </a>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  code: {
    fontFamily: "var(--font-mono)",
    fontSize: 20,
    letterSpacing: "0.12em",
    fontWeight: 600,
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 10,
    padding: "10px 16px",
    flex: 1,
    textAlign: "center"
  },
  linkInput: {
    flex: 1,
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--color-muted)",
    fontSize: 12.5,
    fontFamily: "var(--font-mono)"
  },
  smallButton: {
    background: "var(--color-panel-raised)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--color-paper)",
    cursor: "pointer",
    whiteSpace: "nowrap"
  },
  mailto: {
    fontSize: 13,
    color: "var(--accent-1)",
    textDecoration: "none",
    fontWeight: 600
  }
};
