import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignInGate } from "@/components/SignInGate";
import { FamilyOnboarding } from "@/components/FamilyOnboarding";
import { CalendarBoard } from "@/components/CalendarBoard";
import { viewerNeedsReconnect } from "@/lib/google-calendar";

export default async function Home() {
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

  return <CalendarBoard />;
}
