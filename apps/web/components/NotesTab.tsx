"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/dates";
import { useFamilySyncListener } from "@/lib/useFamilySync";

export interface FamilyNote {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  authorColor: string;
}

const MAX_LENGTH = 280;

/** The shared sticky-note board — quick messages left for the rest of the
 * family ("pick up milk", "back by 6"). No editing, same as a real sticky
 * note: post a new one or take it down. A trimmed copy of the same feed
 * also shows up on the screensaver (see Screensaver.tsx) so a message
 * posted here is visible even when no one's actively in this panel. */
export function NotesTab() {
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), [notes]);

  async function load() {
    const res = await fetch("/api/notes");
    if (res.ok) {
      const data = await res.json();
      setNotes(data.notes);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Someone else posted or removed a note in another tab/device — refetch
  // live instead of waiting for a page reload.
  useFamilySyncListener(["notes"], load);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    setError(null);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() })
    });
    if (res.ok) {
      setText("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't post that.");
    }
    setPosting(false);
  }

  async function remove(note: FamilyNote) {
    setRemovingId(note.id);
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    setRemovingId(null);
  }

  if (loading) return <p style={styles.muted}>Loading notes&hellip;</p>;

  return (
    <div style={styles.wrap}>
      <form onSubmit={post} style={styles.form}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Leave a note for the family…"
          style={styles.textarea}
          rows={2}
        />
        <div style={styles.formRow}>
          <span style={styles.counter}>
            {text.length}/{MAX_LENGTH}
          </span>
          <button type="submit" style={styles.postButton} disabled={posting || !text.trim()}>
            {posting ? "Posting…" : "Post note"}
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </form>

      {notes.length === 0 ? (
        <p style={styles.muted}>No notes yet — leave one for whoever&rsquo;s next through the kitchen.</p>
      ) : (
        <div style={styles.board}>
          {notes.map((note) => (
            <div key={note.id} style={{ ...styles.note, borderLeftColor: note.authorColor }}>
              <p style={styles.noteText}>{note.text}</p>
              <div style={styles.noteFooter}>
                <span style={{ ...styles.noteAuthor, color: note.authorColor }}>
                  {note.authorName ?? "Someone"}
                </span>
                <span style={styles.noteTime}>{formatRelativeTime(new Date(note.createdAt), now)}</span>
                <button
                  type="button"
                  style={styles.removeButton}
                  onClick={() => remove(note)}
                  disabled={removingId === note.id}
                  aria-label="Take down note"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  muted: { color: "var(--color-muted)", fontSize: 13, margin: "4px 0" },
  form: { display: "flex", flexDirection: "column", gap: 8 },
  textarea: {
    background: "var(--color-ink-deep)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 8,
    padding: "11px 12px",
    color: "var(--color-paper)",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: 56
  },
  formRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  counter: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--color-muted)"
  },
  postButton: {
    background: "var(--accent-1)",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    minHeight: 40,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink-deep)",
    cursor: "pointer"
  },
  error: { color: "var(--accent-1)", fontSize: 12.5, margin: 0 },
  board: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  note: {
    background: "rgba(237,233,225,0.04)",
    borderLeft: "3px solid transparent",
    borderRadius: 10,
    padding: "12px 14px"
  },
  noteText: {
    fontSize: 14,
    lineHeight: 1.45,
    margin: "0 0 8px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere"
  },
  noteFooter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11.5
  },
  noteAuthor: {
    fontWeight: 600
  },
  noteTime: {
    color: "var(--color-muted)",
    flex: 1
  },
  removeButton: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: 18,
    lineHeight: 1,
    width: 28,
    height: 28,
    flexShrink: 0,
    cursor: "pointer"
  }
};
