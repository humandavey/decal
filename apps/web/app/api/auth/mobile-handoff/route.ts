import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHandoffToken } from "@/lib/mobileHandoff";

// NextAuth marks its session cookie __Secure-prefixed once useSecureCookies
// is on (which it is in production — see auth.ts / next-auth's own
// detectOrigin, keyed off NEXTAUTH_URL being https). Checking both names
// directly, rather than inferring from the request's own protocol, sidesteps
// having to trust X-Forwarded-Proto through the nginx/Docker hop.
const SECURE_COOKIE = "__Secure-next-auth.session-token";
const PLAIN_COOKIE = "next-auth.session-token";

// Reached as the *callbackUrl* NextAuth redirects to right after a native
// sign-in finishes (see SignInGate.tsx) — still running inside the
// authenticated Safari context, which is exactly why this has to run here
// and not back in the app: this is the one place that session cookie is
// actually readable. See mobileHandoff.ts for why a cookie can't just be
// read here and handed to the app directly.
export async function GET(request: NextRequest) {
  const dest = request.nextUrl.searchParams.get("dest") || "/m";
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const cookieName = request.cookies.has(SECURE_COOKIE) ? SECURE_COOKIE : PLAIN_COOKIE;
  const cookieValue = request.cookies.get(cookieName)?.value;
  if (!cookieValue) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const token = createHandoffToken(cookieName, cookieValue, cookieName === SECURE_COOKIE);

  return NextResponse.redirect(
    `decal://auth-bridge?token=${encodeURIComponent(token)}&dest=${encodeURIComponent(dest)}`
  );
}
