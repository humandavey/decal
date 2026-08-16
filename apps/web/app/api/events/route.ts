import { requireFamilySession } from "@/lib/session";
import { subscribeFamilyChanges } from "@/lib/eventBus";

// This route holds a connection open indefinitely (until the browser tab
// closes) to push live updates — it must never be statically optimized or
// cached, and it needs the Node.js runtime (not edge) for the EventEmitter
// bus in lib/eventBus.ts.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25000;

export async function GET() {
  const { session, unauthorized } = await requireFamilySession();
  if (unauthorized) return unauthorized;

  const familyId = session.familyId;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type })}\n\n`));
        } catch {
          // Controller already closed (client disconnected) — the cancel()
          // callback below will tear everything down; ignore stray sends.
        }
      };

      unsubscribe = subscribeFamilyChanges(familyId, send);

      // Proxies/browsers can silently drop an idle HTTP connection; a
      // periodic comment line keeps it alive without being treated as a
      // real event by the client's onmessage handler.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // ignore — cancel() will clean up
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
