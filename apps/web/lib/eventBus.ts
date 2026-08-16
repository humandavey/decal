import { EventEmitter } from "events";

/** Resource kinds other browser tabs/devices care about — kept intentionally
 * small and coarse (not per-item) so a listener just refetches its list
 * rather than trying to patch a single record in place. */
export type SyncEventType = "chores" | "todos" | "meals" | "family" | "calendar" | "groceries" | "notes";

// HMR-safe singleton, same pattern as packages/db/src/client.ts's Prisma
// client — Next.js dev mode hot-reloads this module, which would otherwise
// spin up a fresh EventEmitter (dropping every connected SSE subscriber) on
// every file save.
//
// This only fans events out within ONE Node process. Decal is meant to run
// as a single long-lived `next start` process (a home server/Raspberry Pi),
// so that's the right tradeoff — it needs no external dependency (Redis,
// etc.) to work. If you ever scale this to multiple server instances behind
// a load balancer, swap this for a real pub/sub broker; a single instance
// won't see events published on another one.
const globalForBus = globalThis as unknown as { decalEventBus?: EventEmitter };

const bus = globalForBus.decalEventBus ?? new EventEmitter();
// Every open dashboard tab holds one subscription for its whole session —
// that's easily more than Node's default 10-listener warning threshold.
bus.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForBus.decalEventBus = bus;
}

function channel(familyId: string) {
  return `family:${familyId}`;
}

/** Call this right after a mutating API route successfully writes — every
 * other open tab/device for the same family gets nudged to refetch that
 * resource instead of waiting for a manual page reload. */
export function notifyFamilyChange(familyId: string, type: SyncEventType) {
  bus.emit(channel(familyId), type);
}

/** Subscribes to a family's change stream; returns an unsubscribe function.
 * Used by the SSE route to forward events to a connected browser tab. */
export function subscribeFamilyChanges(familyId: string, listener: (type: SyncEventType) => void) {
  const event = channel(familyId);
  bus.on(event, listener);
  return () => bus.off(event, listener);
}
