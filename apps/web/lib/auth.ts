import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import type { AdapterAccount } from "next-auth/adapters";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma, getFamilyIdForUser } from "@decal/db";

// We need read access to the user's calendars, not just sign-in.
// `access_type=offline` + `prompt=consent` is required to get a refresh_token
// back the *first* time a user connects — Google only sends it once.
const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events"
].join(" ");

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const url = "https://oauth2.googleapis.com/token";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string
      })
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Google usually doesn't rotate the refresh token, but keep the new one if sent.
      refreshToken: refreshed.refresh_token ?? token.refreshToken
    };
  } catch (error) {
    console.error("Failed to refresh Google access token", error);
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

export const authOptions: NextAuthOptions = {
  // The adapter persists Users/Accounts to Postgres/SQLite so multiple
  // family members (and later, the mobile app) share the same durable
  // identity — even though we still use JWT for the session itself, so we
  // can carry the Google access/refresh token without a DB round-trip on
  // every request.
  adapter: {
    ...PrismaAdapter(prisma),
    // Google's token response now includes `refresh_token_expires_in`,
    // which isn't a column on our Account model — the default adapter
    // forwards the whole account object straight into
    // `prisma.account.create()`, so that extra field makes the insert (and
    // therefore every sign-in) fail with a PrismaClientValidationError.
    // Strip anything Prisma doesn't recognize before handing it off.
    linkAccount: async (account: AdapterAccount) => {
      const { refresh_token_expires_in, ...data } = account as AdapterAccount & {
        refresh_token_expires_in?: number;
      };
      await prisma.account.create({ data });
    }
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Google verifies email ownership, and this is our only provider, so
      // there's no real account-takeover risk in linking by email here (the
      // risk this flag normally guards against is a *different, unverified*
      // provider claiming someone else's email). Without this, an orphaned
      // User row — which the Prisma adapter can leave behind if a sign-in
      // gets interrupted mid-flow (common with Next.js dev hot-reload) —
      // permanently blocks sign-in with "OAuthAccountNotLinked" until
      // someone manually deletes the row.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: GOOGLE_CALENDAR_SCOPES,
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user, trigger, session }) {
      // Initial sign-in: persist the Google tokens, and the database user
      // id (from the adapter) so we can look up family membership later
      // without hitting Google or re-querying by email. We deliberately do
      // NOT auto-create or auto-join a family here — a first-time user
      // picks "Create a family" or "Join with a code" on the onboarding
      // screen (see FamilyOnboarding + /api/family/create + /api/family/join).
      // Until they do, familyId is left undefined and app/page.tsx renders
      // the onboarding gate instead of the calendar.
      if (account && user) {
        const familyId = await getFamilyIdForUser(user.id);
        return {
          ...token,
          userId: user.id,
          familyId: familyId ?? undefined,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: (account.expires_at ?? 0) * 1000
        };
      }

      // The onboarding screen calls `useSession().update({ familyId })`
      // immediately after creating/joining a family. That surfaces here as
      // an "update" trigger — stamp the new familyId onto the token so the
      // very next request (a `router.refresh()` right after) sees it,
      // without forcing a full re-login.
      if (trigger === "update" && session?.familyId) {
        return { ...token, familyId: session.familyId as string };
      }

      // Subsequent requests: reuse the token if it's still valid.
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Expired: refresh it.
      return refreshAccessToken(token);
    },
    async session({ session, token }): Promise<Session> {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      session.userId = token.userId as string;
      session.familyId = token.familyId as string;
      return session;
    }
  },
  pages: {
    // We render our own sign-in gate on the dashboard instead of NextAuth's default page.
    signIn: "/"
  }
};
