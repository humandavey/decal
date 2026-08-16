"use client";

import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/** True once no activity event has fired for `minutes` — flips back to
 * false the instant any of them fires again (including ones that happen
 * on the screensaver overlay itself, since it's rendered inline in the
 * page rather than a separate window — events bubble up to these same
 * `window` listeners, so no extra "dismiss" wiring is needed there).
 *
 * Disabled entirely (always false, no listeners attached) when `enabled`
 * is false — a family with the screensaver off pays zero runtime cost. */
export function useIdle(minutes: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    function reset() {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), minutes * 60 * 1000);
    }

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [minutes, enabled]);

  return idle;
}
