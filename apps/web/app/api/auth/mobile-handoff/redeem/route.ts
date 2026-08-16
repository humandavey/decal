import { NextRequest, NextResponse } from "next/server";
import { redeemHandoffToken } from "@/lib/mobileHandoff";

// Called from *inside the app's own WebView* (see SignInGate.tsx's
// appUrlOpen listener) — unlike the Safari context the token was minted
// in, a normal fetch from here isn't isolated from this WebView's cookie
// jar, so the Set-Cookie below actually sticks.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const entry = redeemHandoffToken(token);
  if (!entry) {
    return NextResponse.json({ error: "invalid or expired token" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(entry.cookieName, entry.cookieValue, {
    httpOnly: true,
    secure: entry.secure,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
