"use client";

import { useEffect, useRef } from "react";
import type { SyncEventType } from "@/lib/eventBus";

const SYNC_EVENT = "decal-sync";

/** Opens the ONE shared connection to the server's change stream for the
 * whole dashboard. Call this exactly once, near the top of the component
 * tree (CalendarBoard) — every other component that cares about a change
 * should use useFamilySyncListener() instead of opening its own
 * EventSource, since browsers cap concurrent connections per origin. */
export function useFamilySyncSource() {
  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { type: SyncEventType };
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: payload }));
      } catch {
        // Ignore malformed frames (e.g. a stray heartbeat comment slipping
        // through) rather than throwing inside the SSE callback.
      }
    };

    // EventSource auto-reconnects on its own after a network hiccup — no
    // special handling needed here beyond letting onerror be a no-op.
    source.onerror = () => {};

    return () => source.close();
  }, []);
}

/** Re-runs onEvent whenever the server reports a change to one of `types`.
 * Safe to call from many components at once — they all listen to the same
 * window-level CustomEvent dispatched by useFamilySyncSource(), no extra
 * network connections are opened. */
export function useFamilySyncListener(types: SyncEventType[], onEvent: () => void) {
  const typesRef = useRef(types);
  typesRef.current = types;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ type: SyncEventType }>).detail;
      if (detail && typesRef.current.includes(detail.type)) {
        onEventRef.current();
      }
    }
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);
}
