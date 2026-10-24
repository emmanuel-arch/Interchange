// POST /api/console/lookup — the search box on /search and /exposure.
//
// A phone number is looked up in the acting member's own book (lib/console/
// resolve); a national ID is used as typed, and looked up too for the name.
// For the customer it settles on, it answers what the page needs before any
// money moves: the consent on record, the reports this member already holds
// and when each stops being re-servable, and what each live report costs.
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, refusalOr, sessionOr401 } from "@/lib/console/http";
import { actingMember, classify, liveConsent, tokenFor } from "@/lib/console/subject";
import { resolveInBook, type BookMatch } from "@/lib/console/resolve";
import { REPORTS, quote } from "@/lib/reports/catalogue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = sessionOr401(request, "reports:read");
  if (session instanceof NextResponse) return session;
  const body = await readJson(request);

  try {
    const member = await actingMember(session, typeof body.member_code === "string" ? body.member_code : null);
    const q = classify(String(body.query ?? ""));
    if (!q) {
      return NextResponse.json(
        { error: "UNREADABLE", message: "Enter a phone number (07…, 01… or 254…) or a national ID number." },
        { status: 400 },
      );
    }

    // ── Who ─────────────────────────────────────────────────────────────────
    let matches: BookMatch[] = [];
    let bookNote: string | null = null;
    const looked = await resolveInBook(member.code, q.kind === "phone" ? { msisdn: q.msisdn } : { nationalId: q.id });
    if (looked.ok) matches = looked.matches;
    else bookNote = looked.message;

    if (q.kind === "phone" && matches.length === 0) {
      return NextResponse.json({
        member: { code: member.code, name: member.name },
        query: { kind: "phone", value: q.msisdn },
        matches: [],
        message: bookNote
          ? `${bookNote} Search by their national ID instead.`
          : `No customer on ${member.name}'s book has ${q.msisdn}. Search by their national ID instead — the bureau keys on it.`,
      });
    }

    // Several customers on one number (a shared or recycled line): the operator
    // picks. Nothing is tokenised until they do.
    const ids = [...new Set(q.kind === "id" ? [q.id] : matches.map((m) => m.nationalId))];
    if (ids.length > 1 && typeof body.national_id !== "string") {
      return NextResponse.json({
        member: { code: member.code, name: member.name },
        query: { kind: q.kind, value: q.kind === "phone" ? q.msisdn : q.id },
        matches,
        choose: true,
      });
    }
    const nationalId = typeof body.national_id === "string" && ids.includes(body.national_id) ? body.national_id : ids[0];
    const match = matches.find((m) => m.nationalId === nationalId) ?? null;

    // ── What is on record ───────────────────────────────────────────────────
    const subjectToken = tokenFor(nationalId);
    const [consent, pulls] = await Promise.all([
      liveConsent(member.id, subjectToken, ["bureau.pull"]),
      prisma.reportPull.findMany({
        where: { callerId: member.id, subjectToken, source: { in: ["BUREAU", "STORED"] } },
        orderBy: { pulledAt: "desc" },
        take: 12,
        select: { id: true, reportType: true, pulledAt: true, expiresAt: true, billedPulls: true, logSeq: true, purgedAt: true },
      }),
    ]);

    const now = Date.now();
    const options = REPORTS.filter((r) => r.live && r.bureauReports.length > 0).map((r) => {
      const held = pulls.find((p) => p.reportType === r.type && !p.purgedAt && p.expiresAt.getTime() > now) ?? null;
      return {
        type: r.type,
        name: r.name,
        answers: r.answers,
        bureauReports: r.bureauReports,
        quote: quote(r.type, { contributing: true }),
        held: held ? { pulledAt: held.pulledAt.toISOString(), expiresAt: held.expiresAt.toISOString() } : null,
      };
    });

    return NextResponse.json({
      member: { code: member.code, name: member.name },
      query: { kind: q.kind, value: q.kind === "phone" ? q.msisdn : q.id },
      matches,
      subject: {
        nationalId,
        name: match?.name ?? null,
        phone: match?.phone ?? (q.kind === "phone" ? q.msisdn : null),
        accountNo: match?.accountNo ?? null,
        onBook: !!match,
        loans: match?.loans ?? 0,
        openLoans: match?.openLoans ?? 0,
        bookNote,
      },
      consent,
      pulls: pulls.map((p) => ({
        id: p.id,
        reportType: p.reportType,
        name: REPORTS.find((r) => r.type === p.reportType)?.name ?? `Report ${p.reportType}`,
        pulledAt: p.pulledAt.toISOString(),
        billed: p.billedPulls > 0,
        logSeq: p.logSeq?.toString() ?? null,
        servable: !p.purgedAt && p.expiresAt.getTime() > now,
      })),
      options,
    });
  } catch (e) {
    return refusalOr(e);
  }
}
