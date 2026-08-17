import { Preferences } from "@capacitor/preferences";

// Must match PREF_KEY in apps/mobile/www/index.html — there's no bundler
// linking that plain-JS bootstrap page to this TypeScript app, so the
// string is duplicated by hand between the two.
export const SERVER_URL_PREFERENCE_KEY = "decal_server_url";

/** Same normalization the bootstrap page (apps/mobile/www/index.html)
 * applies before storing an address — kept in sync by hand for the same
 * reason as the key above. Returns null for something that isn't even a
 * plausible URL. */
export function normalizeServerUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  value = value.replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Same reachability probe the bootstrap page uses — a `no-cors` fetch
 * doesn't let us see status/body (the server sends us no CORS headers, and
 * has no reason to just for this), but the promise still rejects on a real
 * connection failure, which is the only thing this is checking for. */
export function checkServerReachable(origin: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetch(origin, { mode: "no-cors", signal: controller.signal })
      .then(() => {
        clearTimeout(timer);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

/** Forgets the saved server address (native storage only — a no-op on
 * plain web, where this whole concept doesn't apply) — called on log out
 * so the next time the *app* is opened (not just this session), it asks
 * for a server again instead of silently reconnecting to the last one.
 * Doesn't affect the current session at all: SignInGate still knows the
 * current origin from window.location.origin regardless of what's saved
 * here. */
export async function clearSavedServerUrl(): Promise<void> {
  try {
    await Preferences.remove({ key: SERVER_URL_PREFERENCE_KEY });
  } catch {
    // Not fatal — worst case the app just asks again anyway if this
    // somehow didn't take, which is the safe direction to fail in.
  }
}

/** Saves a server address as the one to jump straight to on next app
 * launch — used when switching servers from SignInGate's own address
 * field, mirroring what the bootstrap page does on first entry. */
export async function saveServerUrl(origin: string): Promise<void> {
  try {
    await Preferences.set({ key: SERVER_URL_PREFERENCE_KEY, value: origin });
  } catch {
    // Non-fatal: the switch below still works for this session, it just
    // might not survive an app restart if this failed.
  }
}
