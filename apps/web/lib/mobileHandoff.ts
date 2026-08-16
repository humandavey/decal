import { randomBytes } from "crypto";

/**
 * On iOS, the system browser opened for native Google sign-in
 * (SFSafariViewController, via @capacitor/browser) does NOT share cookies
 * with this app's own WKWebView — that was a wrong assumption in the
 * original implementation. SFSafariViewController shares cookies with
 * Safari.app itself (device-wide), not with the private WebView of
 * whichever app happened to open it; there's no OS-level bridge between
 * the two. So the session cookie NextAuth sets during that sign-in never
 * shows up back in the app on its own — see SignInGate.tsx and
 * app/api/auth/mobile-handoff/ for the actual fix (a short-lived,
 * single-use token that hands the *value* of that cookie back to the
 * app's own WebView through a custom-URL-scheme redirect, where a normal
 * same-origin fetch — not crossing the Safari/WebView isolation boundary —
 * sets it for real).
 *
 * In-memory and single-process is fine here: this app always runs as one
 * long-lived Node process (see Dockerfile/docker-compose.yml), never
 * serverless/multi-instance, and a token is only ever alive for the
 * ~2 minutes between "tapped Connect" and "redeemed it."
 */

interface PendingHandoff {
  cookieName: string;
  cookieValue: string;
  secure: boolean;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000;
const pending = new Map<string, PendingHandoff>();

function sweepExpired() {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(token);
  }
}

export function createHandoffToken(cookieName: string, cookieValue: string, secure: boolean): string {
  sweepExpired();
  const token = randomBytes(32).toString("hex");
  pending.set(token, { cookieName, cookieValue, secure, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function redeemHandoffToken(token: string): PendingHandoff | null {
  const entry = pending.get(token);
  if (!entry) return null;
  pending.delete(token); // single-use, win or lose
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}
