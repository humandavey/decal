// Every screen under app/m/* is its own route, so switching tabs in
// MobileShell's bottom nav unmounts the old screen's client component and
// mounts a fresh one — which starts from useState(null) and refetches
// everything over the network, even for a tab you were on ten seconds ago.
// That round trip (plus whatever latency the family's own server/home
// connection adds) is what shows up as "flashes to Loading… every time I
// switch tabs."
//
// This is a plain in-memory module-level Map, not localStorage/
// sessionStorage — browser storage APIs don't survive well in a Capacitor
// WebView and aren't needed here anyway: the goal is only to skip the
// blank "Loading…" flash during THIS running session, not to persist
// data across app restarts. A screen that reads from here still kicks off
// a real background refetch on every mount (see useCachedState below) —
// this is stale-while-revalidate, not a replacement for fresh data.
const cache = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  cache.set(key, value);
}
