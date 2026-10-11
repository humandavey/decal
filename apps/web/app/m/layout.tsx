import type { Viewport } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignInGate } from "@/components/SignInGate";
import { FamilyOnboarding } from "@/components/FamilyOnboarding";
import { MobileShell } from "@/components/mobile/MobileShell";
import { viewerNeedsReconnect } from "@/lib/google-calendar";

// `viewportFit: "cover"` is what makes the `env(safe-area-inset-*)` values
// MobileShell relies on actually resolve to something other than 0 — the
// default viewport meta Next.js emits doesn't set this. Only the mobile
// route tree needs it; the kiosk dashboard at "/" is never full-bleed
// behind a notch/home-indicator the way this is meant to run (wrapped in
// Capacitor, or added to a phone's home screen).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14171d"
};

/** Root of the mobile app's route tree — same auth/session gating as the
 * kiosk dashboard's page.tsx, but wrapped in MobileShell's tab-bar
 * navigation instead of CalendarBoard's side-by-side panels. Every page
 * under app/m/* shares this layout automatically (Next.js App Router). */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <SignInGate />;
  }

  if (!session.familyId) {
    return <FamilyOnboarding />;
  }

  if (session.userId && (await viewerNeedsReconnect(session.userId))) {
    return <SignInGate reconnect />;
  }

  return <MobileShell>{children}</MobileShell>;
}
