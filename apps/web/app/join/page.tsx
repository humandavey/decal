import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@decal/db";
import { JoinFamilyClient } from "@/components/JoinFamilyClient";

/** Lands here from an invite link (`/join?code=XXXXXXX`) shared over email, text, etc. */
export default async function JoinPage({
  searchParams
}: {
  searchParams: { code?: string };
}) {
  const code = (searchParams.code ?? "").trim().toUpperCase();
  const session = await getServerSession(authOptions);

  const family = code
    ? await prisma.family.findUnique({ where: { inviteCode: code }, select: { name: true } })
    : null;

  return (
    <JoinFamilyClient
      code={code}
      familyName={family?.name ?? null}
      isSignedIn={Boolean(session)}
      alreadyInFamily={Boolean(session?.familyId)}
    />
  );
}
