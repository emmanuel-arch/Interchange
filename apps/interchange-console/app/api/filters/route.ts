// GET /api/filters — published Bloom filters, one per member.
//
// Nodes download these and screen queries LOCALLY. That placement is the whole
// privacy argument: if screening happened at the Registry, the Registry would
// see every token any member ever evaluated. Publishing the filters instead
// means the broker in each node decides who to ask without telling anyone what
// it is asking about.
//
// A filter reveals nothing useful on its own. It is a bit array with a 1% false
// positive rate over tokens that are already unlinkable OPRF outputs — you
// cannot enumerate a member's borrowers from it, only test a token you already
// hold, which is exactly the operation the ecosystem exists to permit.
//
// In production these go to R2 and are fetched from there; this endpoint is the
// same bytes, served directly.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const filters = await prisma.memberFilter.findMany({
    orderBy: { generation: "desc" },
  });

  // Latest generation per member. Older generations stay readable until they are
  // replaced, so a rebuild never leaves a node with nothing to screen against.
  const latest = new Map<string, (typeof filters)[number]>();
  for (const f of filters) if (!latest.has(f.memberId)) latest.set(f.memberId, f);

  const members = await prisma.member.findMany({
    where: { id: { in: [...latest.keys()] } },
    select: { id: true, code: true },
  });
  const codeById = new Map(members.map((m) => [m.id, m.code]));

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    filters: [...latest.values()].map((f) => ({
      member_code: codeById.get(f.memberId),
      generation: f.generation,
      m: f.m,
      k: f.k,
      item_count: f.itemCount,
      built_at: f.builtAt,
      bits: Buffer.from(f.bits).toString("base64"),
    })),
  });
}
