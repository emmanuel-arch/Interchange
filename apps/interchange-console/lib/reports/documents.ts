// ─────────────────────────────────────────────────────────────────────────────
// THE DOCUMENTS — which sections each report type is made of.
//
// Every function here returns a ReportDocument: metadata plus an ordered list of
// blocks. None of them writes HTML, none of them picks a colour, and none of
// them reads a bureau payload — those are shell.ts, theme.ts and bureau.ts. What
// lives here is EDITORIAL judgement: what a lender needs to see first, what
// belongs on page one, and what a number means.
//
// ── WHAT MAKES THIS BETTER THAN THE BUREAU'S OWN PDF ─────────────────────────
// Metropol's standard report is a faithful dump: seven pages, one account after
// another, no totals, no trend, no ranking, and a score printed as a bare
// integer with a PPI ladder. Everything a credit officer actually decides on —
// how much is live RIGHT NOW, how fresh the figures are, which accounts carry
// the risk, whether this borrower is accelerating — they compute by hand.
//
// So the order here is deliberate: the decision first, the evidence behind it,
// the raw account list last. Same data, opposite priority.
// ─────────────────────────────────────────────────────────────────────────────
import type { Block, Cell, ReportDocument, ReportMeta, Tone } from "./shell";
import { scoreDial, trendLine, compositionBar, barList, ppiLadder, activityStrip, sparkline } from "./charts";
import { PAPER, CATEGORICAL, EMERALD, STATE, ARREARS_BANDS, arrearsBand, scoreBand, kes, kesCompact, date, esc } from "./theme";
import { totals, type BureauFile, type BureauAccount } from "./bureau";
import { identityType as identityTypeCode, delinquency as delinquencyCode, bureauReportType, LENDER_SECTORS } from "../codes/metropol";
import type { CrunchData } from "../statement/assemble";

const SECTOR_LABEL: Record<string, string> = Object.fromEntries(LENDER_SECTORS.map((x) => [x.code, x.label]));

// ── Provenance helpers ───────────────────────────────────────────────────────
// Every panel says whose statement it is. "Metropol CRB" means the figure is the
// bureau's, as returned. "Interchange reading" means we computed it FROM the
// bureau's data — a total, an ordering, a band — and must never be mistaken for
// something the bureau said.

const shortTrx = (file: BureauFile) => (file.trxIds[0] ? ` · trx ${file.trxIds[0].slice(0, 8)}` : "");
const bureauSrc = (file: BureauFile, what: string) =>
  `Source: Metropol CRB · ${what} · report${file.sources.length === 1 ? "" : "s"} ${file.sources.join(", ")}${shortTrx(file)}`;
const readingSrc = (what: string) => `Interchange reading of Metropol data · ${what}`;

/** The person as the bureau identified them, for the letterhead subject line. */
export function subjectFromFile(file: BureauFile): NonNullable<ReportMeta["subjectIdentity"]> {
  const id = file.identity;
  const parts = [id.firstName, id.otherName, id.surname].filter((p): p is string => !!p);
  const name = parts.length ? parts.join(" ").toUpperCase() : (id.names[0] ?? null);
  return {
    name,
    idTypeLabel: identityTypeCode(id.identityType ?? "001")?.label ?? "National ID",
    idNumber: id.identityNumber ?? "not reported",
    verified: id.verified,
    reportedNames: id.names.filter((n) => n.toUpperCase() !== name),
  };
}

/** The bureau fields every bureau document's meta carries. */
function bureauMeta(file: BureauFile) {
  return {
    eyebrow: "Bureau Direct",
    bureau: { trxIds: file.trxIds, reportTypes: file.sources },
    subjectIdentity: subjectFromFile(file),
  };
}

/** Newest first, then by size — the order a reviewer reads accounts in. */
function accountOrder(a: BureauAccount, b: BureauAccount): number {
  if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
  if (a.isAdverse !== b.isAdverse) return a.isAdverse ? -1 : 1;
  const ao = a.opened ? Date.parse(a.opened) : 0;
  const bo = b.opened ? Date.parse(b.opened) : 0;
  return bo - ao;
}

function statusTone(a: BureauAccount): Tone {
  if (a.isAdverse) return "bad";
  if (a.daysInArrears > 0) return "watch";
  if (a.isLive) return "good";
  return "mute";
}

/**
 * THE FLAGSHIP — a Metropol file, re-read as a decision.
 *
 * `raw` is the set of report payloads that were folded into `file`; it decides
 * which sections can be shown. A thin file (report 8 alone) still produces a
 * correct document — it simply has fewer blocks, each marked as such.
 */
export function bureauCreditFile(
  file: BureauFile,
  meta: Omit<ReportMeta, "title" | "reportType">,
  /**
   * Which product this document IS.
   *
   * It used to hardcode report 12, so a report 8 pull produced a page stamped
   * "REPORT 12 · Credit File" — a document that misdescribes itself to the
   * lender holding it, and one that would not reconcile against the invoice
   * line that paid for it. The sections are still assembled from whichever
   * evidence blocks arrived; only the masthead changes.
   */
  identity: { reportType: number; title: string } = { reportType: 12, title: "Credit File" },
): ReportDocument {
  const t = totals(file);
  const band = file.score.value === null ? null : scoreBand(file.score.value);
  const live = file.accounts.filter((a) => a.isLive);

  // ── The four numbers a credit decision actually turns on ──────────────────
  const kpis: Block = {
    kind: "kpis",
    items: [
      {
        label: "Bureau score",
        value: file.score.value === null ? "—" : String(file.score.value),
        note: band
          ? `${band.label}${file.ppi.rank ? ` · PPI ${file.ppi.rank}` : ""}${file.score.asAt ? ` · as at ${date(file.score.asAt)}` : ""}`
          : "not reported",
        tone: band ? (file.score.value! >= 700 ? "good" : file.score.value! >= 550 ? "watch" : "bad") : "mute",
        visual: file.trend.length > 1 ? sparkline(file.trend.map((p) => p.score ?? 0), { width: 80 }) : undefined,
      },
      {
        label: "Live exposure",
        value: `KES ${kes(t.outstanding)}`,
        note: `${t.live} open account${t.live === 1 ? "" : "s"} carrying a balance`,
        tone: t.outstanding > 0 ? "info" : "mute",
      },
      {
        label: "Currently overdue",
        value: `KES ${kes(t.overdue)}`,
        note: t.worstArrears > 0 ? `worst ${t.worstArrears} days past due` : "nothing past due",
        tone: t.overdue > 0 ? "bad" : "good",
      },
      {
        label: "Adverse accounts",
        value: String(t.adverse),
        note: t.worstArrearsEver > 0 ? `worst ever ${t.worstArrearsEver} days` : "no arrears on record",
        tone: t.adverse > 0 ? "bad" : "good",
      },
      {
        label: "New credit, 12m",
        value: String(t.openedLast12Months),
        note: t.openedLast6Months > 0 ? `${t.openedLast6Months} in the last 6 months` : "none in 6 months",
        tone: t.openedLast12Months >= 4 ? "watch" : "mute",
      },
    ],
  };

  const blocks: Block[] = [kpis];

  // ── Verdict line ──────────────────────────────────────────────────────────
  // Stated in words, because a lender reading a file at speed should not have
  // to assemble the headline from five tiles.
  blocks.push({
    kind: "callout",
    tone: t.adverse > 0 ? "bad" : t.overdue > 0 ? "watch" : "good",
    title: "What this file says",
    body:
      `${file.delinquency.label ?? "Delinquency not reported"}. ` +
      `${t.accounts} account${t.accounts === 1 ? "" : "s"} on file across ` +
      `${Object.keys(file.sectors).length || "an unreported number of"} ` +
      `${Object.keys(file.sectors).length === 1 ? "sector" : "sectors"}, of which ${t.live} ` +
      `carr${t.live === 1 ? "ies" : "y"} a live balance totalling KES ${kes(t.outstanding)}. ` +
      (t.adverse > 0
        ? `${t.adverse} account${t.adverse === 1 ? " is" : "s are"} adverse — written off, non-performing or more than 90 days late. `
        : "No account is written off or more than 90 days late. ") +
      (t.openedLast6Months >= 2
        ? `${t.openedLast6Months} new accounts were opened in the last six months, which is the pattern that precedes stacking.`
        : "Account openings show no recent acceleration."),
  });

  // ── Score, trend, PPI ─────────────────────────────────────────────────────
  blocks.push({ kind: "heading", text: "Bureau score and payment performance" });
  blocks.push({
    kind: "row",
    blocks: [
      {
        kind: "chart",
        title: "Metro score",
        hint: file.score.asAt ? date(file.score.asAt) : undefined,
        svg: scoreDial(file.score.value, { caption: "200 – 900" }),
        half: true,
        caption:
          "Band labels are the market's reading of the range, not Metropol's own cut-offs — the bureau publishes none.",
        source: bureauSrc(file, "credit_score"),
      },
      file.trend.length > 1
        ? {
            kind: "chart",
            title: "12-month score trend",
            hint: `${file.trend.length} points`,
            half: true,
            svg: trendLine(
              file.trend.filter((p) => p.score !== null).map((p) => ({ label: monthLabel(p.month), value: p.score! })),
              { min: undefined, max: undefined, color: EMERALD[4], title: "Metro score by month" },
            ),
            caption: describeTrend(file.trend.map((p) => p.score).filter((s): s is number => s !== null)),
            source: bureauSrc(file, "metro_score_trend"),
          }
        : {
            kind: "panel",
            title: "12-month score trend",
            half: true,
            html: unavailable("Report 12 carries the monthly score trend. It was not part of this pull."),
          },
    ],
  });

  if (file.ppi.rank) {
    blocks.push({
      kind: "chart",
      title: "Payment performance index",
      hint: file.ppi.month ? `as at ${date(file.ppi.month)}` : undefined,
      svg: ppiLadder(file.ppi.rank),
      caption:
        `Metropol's PPI runs M1 to M9; lower is better. ${file.ppi.rank} indicates an average delay of ` +
        `${ppiDelay(file.ppi.rank)} beyond agreed terms over the last 12 months` +
        (file.ppi.value !== null ? ` (index value ${file.ppi.value}).` : "."),
      source: bureauSrc(file, "ppi"),
    });
  }

  // ── Exposure composition ──────────────────────────────────────────────────
  blocks.push({ kind: "heading", text: "Where the exposure sits" });

  const sectorRows = Object.entries(file.sectors)
    .map(([key, v]) => ({
      label: SECTOR_LABEL[key] ?? key.replace("sector_", ""),
      value: v.npa + v.performing + v.performingWithHistory,
      note: v.npa > 0 ? `${v.npa} NPA` : "",
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  blocks.push({
    kind: "row",
    blocks: [
      {
        kind: "chart",
        title: "Account status",
        hint: `${t.accounts} accounts`,
        half: true,
        svg: compositionBar([
          { label: "Live, owing", value: t.live, color: CATEGORICAL[0] },
          { label: "Open, nil balance", value: t.openButSettled, color: CATEGORICAL[1] },
          { label: "Closed / settled", value: t.closed, color: PAPER.inkMuted },
          { label: "Adverse", value: t.adverse, color: STATE.bad },
        ]),
        caption:
          "Open with a nil balance is counted separately: the account is reported live but nothing is owed, so it is not exposure.",
        source: readingSrc("account_info statuses and balances"),
      },
      sectorRows.length
        ? {
            kind: "chart",
            title: "Accounts by sector",
            hint: "as reported",
            half: true,
            svg: barList(sectorRows, { format: (n) => String(Math.round(n)), color: EMERALD[3] }),
            caption: "One measure across sectors, so one colour — length carries the comparison.",
            source: bureauSrc(file, "lender_sector"),
          }
        : { kind: "panel", title: "Accounts by sector", half: true, html: unavailable("No sector breakdown in this pull.") },
    ],
  });

  // The bureau's own sector table, with the same four columns its printed
  // report uses, so a lender holding both documents can reconcile them line
  // by line. Total is the sum of the other three, as the bureau's is.
  const sectorEntries = Object.entries(file.sectors);
  if (sectorEntries.length) {
    const sum = sectorEntries.reduce(
      (acc, [, v]) => ({ npa: acc.npa + v.npa, hist: acc.hist + v.performingWithHistory, clean: acc.clean + v.performing }),
      { npa: 0, hist: 0, clean: 0 },
    );
    blocks.push({
      kind: "table",
      title: "Accounts by sector",
      hint: "the bureau's table",
      columns: [
        { header: "Sector", width: 34 },
        { header: "All accounts", align: "right", mono: true },
        { header: "Non-performing", align: "right", mono: true },
        { header: "Performing, default history", align: "right", mono: true },
        { header: "Performing, clean", align: "right", mono: true },
      ],
      rows: [
        ...sectorEntries.map(([key, v]): Cell[] => [
          { text: SECTOR_LABEL[key] ?? key.replace("sector_", "") },
          { text: String(v.npa + v.performing + v.performingWithHistory) },
          { text: String(v.npa), tone: v.npa > 0 ? "bad" : undefined },
          { text: String(v.performingWithHistory), tone: v.performingWithHistory > 0 ? "watch" : undefined },
          { text: String(v.performing) },
        ]),
        [
          { text: "Total", strong: true },
          { text: String(sum.npa + sum.hist + sum.clean), strong: true },
          { text: String(sum.npa), strong: true, tone: sum.npa > 0 ? "bad" : undefined },
          { text: String(sum.hist), strong: true },
          { text: String(sum.clean), strong: true },
        ],
      ],
      note:
        "The API groups every non-bank lender, digital credit providers included, as Other lenders. The bureau's printed report splits that group further, so its sector rows can differ while the totals agree.",
      source: bureauSrc(file, "lender_sector"),
    });
  }

  // Arrears ladder — ordered severity, counted across every account on file.
  const ladder = ARREARS_BANDS.map((b, i) => {
    const prev = i === 0 ? -1 : ARREARS_BANDS[i - 1].max;
    return {
      label: b.label,
      value: file.accounts.filter((a) => a.daysInArrears > prev && a.daysInArrears <= b.max).length,
      color: b.color,
    };
  }).filter((r) => r.value > 0);

  blocks.push({
    kind: "row",
    blocks: [
      {
        kind: "chart",
        title: "Arrears distribution",
        hint: "every account on file",
        half: true,
        svg: compositionBar(ladder),
        caption:
          t.stalestReportDays !== null
            ? `Days past due are as of each lender's last submission — between ${t.freshestReportDays} and ${t.stalestReportDays} days ago, not today.`
            : "Days past due are as of each lender's last submission to the bureau.",
        source: readingSrc("days_in_arrears by band"),
      },
      {
        kind: "chart",
        title: "When accounts were opened",
        hint: t.oldestOpened ? `${date(t.oldestOpened)} to ${date(t.newestOpened)}` : undefined,
        half: true,
        svg: activityStrip(
          file.accounts
            .filter((a) => a.opened)
            .map((a) => ({
              date: a.opened!,
              weight: Math.min(1, a.originalAmount / 50_000),
              color: a.isAdverse ? STATE.bad : a.isLive ? EMERALD[3] : PAPER.axis,
            })),
        ),
        caption:
          "One mark per account, height by size. Clusters are the signal — several facilities opened in one month is stacking, which a monthly total would hide.",
        source: readingSrc("date_opened and original_amount"),
      },
    ],
  });

  // ── The largest live positions ────────────────────────────────────────────
  if (live.length > 0) {
    blocks.push({
      kind: "chart",
      title: "Largest live balances",
      hint: `${live.length} account${live.length === 1 ? "" : "s"} owing`,
      svg: barList(
        [...live]
          .sort((a, b) => b.currentBalance - a.currentBalance)
          .slice(0, 8)
          .map((a) => ({
            // Three "Mobile Banking Loan" rows are indistinguishable without a
            // qualifier, so each carries the year it was opened.
            label: a.opened ? `${a.product}, ${new Date(a.opened).getFullYear()}` : a.product,
            value: a.currentBalance,
            note: a.daysInArrears > 0 ? `${a.daysInArrears}d late` : "",
            color: a.isAdverse ? STATE.bad : a.daysInArrears > 0 ? arrearsBand(a.daysInArrears).color : EMERALD[3],
          })),
        { format: (n) => `KES ${kesCompact(n)}` },
      ),
      caption: "Concentration matters: one large facility and six small ones is a different risk from seven equal ones.",
      source: readingSrc("live balances ranked"),
    });
  }

  blocks.push({ kind: "pagebreak" });

  // ── Identity ──────────────────────────────────────────────────────────────
  blocks.push({ kind: "heading", text: "Identity as the bureau holds it" });
  const id = file.identity;
  blocks.push({
    kind: "facts",
    columns: 4,
    items: [
      { label: "Verified", value: id.verified === true ? "Yes" : id.verified === false ? "No" : "Not checked", verified: id.verified === true },
      { label: "Date of birth", value: date(id.dateOfBirth), mono: true, verified: id.verified === true && !!id.dateOfBirth },
      { label: "Gender", value: id.gender ?? "—", verified: id.verified === true && !!id.gender },
      { label: "Citizenship", value: id.citizenship ?? "—", verified: id.verified === true && !!id.citizenship },
      { label: "ID serial", value: id.serialNumber ?? "—", mono: true },
      { label: "Marital status", value: id.maritalStatus ?? "—" },
      { label: "Phones on file", value: id.phones.length ? id.phones.join(", ") : "—", mono: true },
      { label: "Deceased", value: id.dateOfDeath ? date(id.dateOfDeath) : "No record" },
    ],
  });

  if (id.names.length > 1) {
    blocks.push({
      kind: "callout",
      tone: "info",
      title: "Names reported by lenders",
      body:
        `${id.names.length} spellings are on file: ${id.names.join(" · ")}. ` +
        "Variation is normal in Kenyan bureau data and is not by itself a fraud signal — it is how different lenders typed the same person.",
    });
  }

  if (id.employment.length || id.physicalAddresses.length || id.postalAddresses.length) {
    blocks.push({
      kind: "table",
      title: "Traces",
      hint: "employer and address history",
      source: bureauSrc(file, "identity_scrub"),
      columns: [
        { header: "Type", width: 18 },
        { header: "Detail", width: 52 },
        { header: "Reported", width: 30 },
      ],
      rows: [
        ...id.employment.map((e): Cell[] => [
          { text: "Employer" },
          { text: e.employerName ?? "—" },
          { text: e.employmentDate ? date(e.employmentDate) : "date not reported" },
        ]),
        ...id.physicalAddresses.map((a): Cell[] => [
          { text: "Physical" },
          { text: [a.address, a.town].filter(Boolean).join(", ") || "—" },
          { text: a.country ?? "—" },
        ]),
        ...id.postalAddresses.map((a): Cell[] => [
          { text: "Postal" },
          { text: [a.number, a.town, a.code].filter(Boolean).join(" · ") || "—" },
          { text: a.country ?? "—" },
        ]),
      ],
    });
  }

  // ── Enquiry windows ───────────────────────────────────────────────────────
  if (file.enquiries || file.applications || file.bouncedCheques) {
    blocks.push({
      kind: "table",
      title: "Bureau activity windows",
      hint: "3 / 6 / 12 months",
      source: bureauSrc(file, "no_of_enquiries, no_of_credit_applications, no_of_bounced_cheques"),
      columns: [
        { header: "Measure", width: 40 },
        { header: "3 months", align: "right", mono: true },
        { header: "6 months", align: "right", mono: true },
        { header: "12 months", align: "right", mono: true },
      ],
      rows: [
        windowRow("Enquiries", file.enquiries),
        windowRow("Credit applications", file.applications),
        windowRow("Bounced cheques", file.bouncedCheques),
      ].filter((r): r is Cell[] => r !== null),
      note:
        "Measured live on 15 Sep 2026: these counters did not move 29 minutes after four billed pulls on the same " +
        "identity. Metropol's enquiry counts are not real-time and a zero here does not mean nobody has asked.",
    });
  }

  // ── Affordability ─────────────────────────────────────────────────────────
  if (file.income.estimatedAmount !== null || file.accountsSummary) {
    blocks.push({ kind: "heading", text: "Affordability as the bureau estimates it" });
    const s = file.accountsSummary ?? {};
    blocks.push({
      kind: "facts",
      columns: 4,
      items: [
        { label: "Estimated income", value: file.income.estimatedAmount !== null ? `KES ${kes(file.income.estimatedAmount, { decimals: true })}` : "—", mono: true },
        { label: "Monthly instalments", value: s.total_monthly_instalment_generic !== undefined ? `KES ${kes(s.total_monthly_instalment_generic)}` : "—", mono: true },
        { label: "Mobile loans active", value: s.mobile_account_count_active !== undefined ? String(s.mobile_account_count_active) : "—", mono: true },
        { label: "Generic loans active", value: s.generic_account_count !== undefined ? String(s.generic_account_count) : "—", mono: true },
      ],
    });
    if (file.income.estimatedAmount !== null && s.total_monthly_instalment_generic !== undefined) {
      const ratio = (s.total_monthly_instalment_generic / Math.max(1, file.income.estimatedAmount)) * 100;
      blocks.push({
        kind: "callout",
        tone: ratio > 60 ? "bad" : ratio > 40 ? "watch" : "good",
        title: "Instalment-to-income",
        body:
          `Known instalments consume ${ratio.toFixed(0)}% of the bureau's estimated income. ` +
          "The estimate is Metropol's own model, not a payslip or a statement — treat it as a cross-check on an " +
          "affordability assessment rather than as the assessment.",
      });
    }
  }

  // ── The account list ──────────────────────────────────────────────────────
  blocks.push({ kind: "pagebreak" });
  blocks.push({
    kind: "heading",
    text: "Every account on file",
    lede: "Live and adverse accounts first, then by how recently they were opened.",
  });
  blocks.push({
    kind: "table",
    columns: [
      { header: "Product", width: 20 },
      { header: "Status", width: 13 },
      { header: "Opened", width: 11, mono: true },
      { header: "Original", align: "right", width: 12, mono: true },
      { header: "Balance", align: "right", width: 12, mono: true },
      { header: "Overdue", align: "right", width: 11, mono: true },
      { header: "Late", align: "right", width: 9, mono: true },
      { header: "Reported", width: 12, mono: true },
    ],
    rows: [...file.accounts].sort(accountOrder).map((a): Cell[] => [
      { text: a.product, sub: a.accountNumber },
      { text: a.status, tone: statusTone(a) },
      { text: date(a.opened) },
      { text: kes(a.originalAmount) },
      { text: kes(a.currentBalance), strong: a.isLive },
      { text: a.overdueBalance > 0 ? kes(a.overdueBalance) : "—", tone: a.overdueBalance > 0 ? "bad" : undefined },
      {
        text: a.daysInArrears > 0 ? `${a.daysInArrears}d` : "—",
        tone: a.daysInArrears > 90 ? "bad" : a.daysInArrears > 0 ? "watch" : undefined,
        sub: a.highestDaysInArrears > a.daysInArrears ? `max ${a.highestDaysInArrears}d` : undefined,
      },
      { text: date(a.loadedAt), sub: a.stalenessDays !== null && a.stalenessDays > 60 ? `${a.stalenessDays}d ago` : undefined },
    ]),
    emptyMessage: "No accounts on file",
    source: bureauSrc(file, "account_info"),
    note:
      "“Late” is days past due AS OF the date in “Reported”, not as of today — a lender that has not submitted for " +
      "months will show stale arrears. “Max” is the worst this account has ever been.",
  });

  // ── What was and was not available ────────────────────────────────────────
  blocks.push({
    kind: "ledger",
    items: [
      { label: "Identity verification (report 1 / 12)", status: file.identity.dateOfBirth || file.identity.serialNumber ? "present" : "unavailable" },
      { label: "Identity scrub — phones, addresses, employment (6 / 12)", status: file.identity.phones.length || file.identity.employment.length ? "present" : "unavailable" },
      { label: "Metro score (3 / 8 / 11)", status: file.score.value !== null ? "present" : "unavailable" },
      { label: "12-month score and PPI trend (12)", status: file.trend.length > 0 ? "present" : "unavailable" },
      { label: "Credit accounts (8 / 10 / 11 / 12)", status: file.accounts.length > 0 ? "present" : "unavailable" },
      { label: "Income estimation (11)", status: file.income.estimatedAmount !== null ? "present" : "unavailable" },
      { label: "Account counts and instalments (16)", status: file.accountsSummary ? "present" : "unavailable" },
      { label: "Guarantors and stakeholders (10)", status: file.guarantors.length || file.stakeholders.length ? "present" : "unavailable" },
      {
        label: "Month-by-month account history (22)",
        status: "refused",
        note: "Report 22 is not in this lender's Metropol contract — E029. The 12-point score trend from report 12 is the closest available substitute.",
      },
    ],
  });

  if (file.notes.length) {
    blocks.push({
      kind: "panel",
      title: "Reading notes",
      hint: "derived from this file",
      html: `<ul style="margin:0;padding-left:4mm">${file.notes.map((n) => `<li style="margin-bottom:1.5mm">${esc(n)}</li>`).join("")}</ul>`,
    });
  }

  return {
    meta: {
      ...bureauMeta(file),
      ...meta,
      title: identity.title,
      reportType: identity.reportType,
      subtitle:
        "Metropol bureau data, re-read as a credit decision. Every figure is the bureau's; the totals, ordering and " +
        "staleness flags are the Interchange's.",
      source: meta.source ?? `Metropol CRB · report${file.sources.length === 1 ? "" : "s"} ${file.sources.join(", ")}`,
    },
    blocks,
  };
}

function windowRow(label: string, w: { last3: number; last6: number; last12: number } | null): Cell[] | null {
  if (!w) return null;
  return [{ text: label }, { text: String(w.last3) }, { text: String(w.last6) }, { text: String(w.last12) }];
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "short" });
}

function describeTrend(scores: number[]): string {
  if (scores.length < 2) return "";
  const first = scores[0];
  const last = scores[scores.length - 1];
  const delta = last - first;
  const dir = delta > 0 ? "risen" : delta < 0 ? "fallen" : "held flat";
  return delta === 0
    ? `The score has held flat at ${last} across the reported window.`
    : `The score has ${dir} ${Math.abs(delta)} points over ${scores.length} months, from ${first} to ${last}.`;
}

function ppiDelay(rank: string): string {
  const n = Number(String(rank).replace(/\D/g, "")) || 1;
  const from = (n - 1) * 10;
  return n >= 9 ? "over 80 days" : `${from} to ${from + 10} days`;
}

function unavailable(reason: string): string {
  return (
    `<div style="padding:8mm 4mm;text-align:center">` +
    `<div style="font-family:'Sora',sans-serif;font-size:8pt;letter-spacing:0.16em;text-transform:uppercase;color:${PAPER.inkMuted};margin-bottom:2mm">Not available</div>` +
    `<div style="font-size:8.6pt;color:${PAPER.inkSecondary};max-width:80mm;margin:0 auto">${esc(reason)}</div></div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-PRODUCT BUREAU DOCUMENTS
//
// A lender who buys report 1 is paying to know whether an ID is real — handing
// them a twelve-page credit file with most panels marked "not available" would
// misdescribe what they bought. Each of these is the ONE question its report
// answers, on the same letterhead, with the same notices.
//
// `section` is set when the evidence was not a standalone call but a block
// inside a bigger answer (report 12 carries 1, 2 and 6). The document says so.
// ─────────────────────────────────────────────────────────────────────────────

type BureauDocOpts = { section?: { of: number } | null; loanAmount?: number | null };

function sectionNote(type: number, opts: BureauDocOpts): string {
  return opts.section ? `section of the report ${opts.section.of} answer` : `report ${type}`;
}

function productMeta(type: number, file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, subtitle: string, opts: BureauDocOpts) {
  const def = bureauReportType(type);
  return {
    ...bureauMeta(file),
    ...meta,
    title: def?.name ?? `Report ${type}`,
    reportType: type,
    subtitle,
    source: meta.source ?? `Metropol CRB · ${sectionNote(type, opts)}`,
  };
}

/** Report 1 — is this ID real, and who is it? */
export function identityVerificationDocument(file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, opts: BureauDocOpts = {}): ReportDocument {
  const id = file.identity;
  const v = id.verified === true;
  const blocks: Block[] = [
    {
      kind: "callout",
      tone: id.verified === true ? "good" : id.verified === false ? "bad" : "watch",
      title: v ? "Identity confirmed by the bureau" : id.verified === false ? "Identity not confirmed" : "Identity not checked",
      body: v
        ? `The bureau holds this ID number against ${subjectFromFile(file).name ?? "a registered person"}. Compare the date of birth and gender below with the person in front of you: the bureau confirms the record exists, not that the applicant is its holder.`
        : "The bureau did not confirm a registered person for this ID number. Do not lend against it until the identity is resolved.",
    },
    {
      kind: "facts",
      columns: 4,
      items: [
        { label: "First name", value: id.firstName ?? "—", verified: v && !!id.firstName },
        { label: "Other name", value: id.otherName ?? "—", verified: v && !!id.otherName },
        { label: "Surname", value: id.surname ?? "—", verified: v && !!id.surname },
        { label: "Date of birth", value: date(id.dateOfBirth), mono: true, verified: v && !!id.dateOfBirth },
        { label: "Gender", value: id.gender === "M" ? "Male" : id.gender === "F" ? "Female" : (id.gender ?? "—"), verified: v && !!id.gender },
        { label: "Citizenship", value: id.citizenship ?? "—", verified: v && !!id.citizenship },
        { label: "ID serial", value: id.serialNumber ?? "—", mono: true },
        { label: "Deceased", value: id.dateOfDeath ? date(id.dateOfDeath) : "No record" },
      ],
    },
  ];
  if (id.dateOfDeath) {
    blocks.push({ kind: "callout", tone: "bad", title: "Deceased record", body: `The bureau records a date of death, ${date(id.dateOfDeath)}. An application on this ID is not from its holder.` });
  }
  if (id.names.length > 1) {
    blocks.push({
      kind: "panel",
      title: "Names lenders have reported",
      hint: `${id.names.length} spellings`,
      html: `<p style="margin:0;font-size:8.8pt">${id.names.map(esc).join(" · ")}</p>`,
      source: bureauSrc(file, "reported names"),
    });
  }
  return { meta: productMeta(1, file, meta, "Whether this ID exists, and who the bureau holds it against.", opts), blocks };
}

/** Report 2 — in default now, or ever? */
export function delinquencyDocument(file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, opts: BureauDocOpts = {}): ReportDocument {
  const d = delinquencyCode(file.delinquency.code);
  const tone: Tone = d?.tone === "bad" ? "bad" : d?.tone === "watch" ? "watch" : d?.tone === "good" ? "good" : "mute";
  const blocks: Block[] = [
    {
      kind: "kpis",
      items: [
        { label: "Delinquency status", value: d?.label ?? "Not reported", note: d ? `code ${d.code}` : undefined, tone },
        { label: "Loan amount asked about", value: opts.loanAmount ? `KES ${kes(opts.loanAmount)}` : "—", note: "as sent with the request" },
      ],
    },
    {
      kind: "callout",
      tone,
      title: "What the code means",
      body: d ? d.meaning : "The bureau returned no delinquency code for this ID.",
    },
    {
      kind: "table",
      title: "Every delinquency code",
      hint: "the one returned is marked",
      columns: [{ header: "Code", width: 12, mono: true }, { header: "Status", width: 28 }, { header: "Meaning" }],
      rows: ["001", "002", "003", "004", "005"].map((c): Cell[] => {
        const e = delinquencyCode(c)!;
        const hit = c === file.delinquency.code;
        return [{ text: c, strong: hit }, { text: e.label, strong: hit, tone: hit ? tone : undefined }, { text: e.meaning }];
      }),
      source: bureauSrc(file, "delinquency_code"),
    },
  ];
  return { meta: productMeta(2, file, meta, "Whether this person is in default now, or has been, anywhere the bureau can see.", opts), blocks };
}

/** Report 3 — the bureau's score. */
export function scoreDocument(file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, opts: BureauDocOpts = {}): ReportDocument {
  const band = file.score.value === null ? null : scoreBand(file.score.value);
  const blocks: Block[] = [
    {
      kind: "row",
      blocks: [
        {
          kind: "chart",
          title: "Metro score",
          hint: file.score.asAt ? date(file.score.asAt) : undefined,
          half: true,
          svg: scoreDial(file.score.value, { caption: "200 – 900" }),
          caption: "Band labels are the market's reading of the range, not Metropol's own cut-offs — the bureau publishes none.",
          source: bureauSrc(file, "credit_score"),
        },
        {
          kind: "panel",
          title: "Reading the score",
          half: true,
          html:
            `<div style="font-size:8.8pt;line-height:1.55">` +
            `<p style="margin:0 0 2mm"><b>${file.score.value ?? "—"}</b> sits in the <b>${esc(band?.label ?? "unreported")}</b> band of the 200 to 900 range.</p>` +
            `<p style="margin:0 0 2mm">Regulation 40(1) forbids declining on the score alone. Read it with the account history and affordability, which reports 8, 11 and 12 carry.</p>` +
            (file.score.category ? `<p style="margin:0">Bureau category: <b>${esc(file.score.category)}</b></p>` : "") +
            `</div>`,
          source: readingSrc("band"),
        },
      ],
    },
  ];
  return { meta: productMeta(3, file, meta, "The bureau's own score for this person, and where it sits in the range.", opts), blocks };
}

/** Report 6 — contact and address traces. */
export function identityScrubDocument(file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, opts: BureauDocOpts = {}): ReportDocument {
  const id = file.identity;
  const src = bureauSrc(file, opts.section ? "identity_scrub section" : "identity scrub");
  const blocks: Block[] = [
    {
      kind: "kpis",
      items: [
        { label: "Name spellings", value: String(id.names.length) },
        { label: "Phones", value: String(id.phones.length) },
        { label: "Emails", value: String(id.emails.length) },
        { label: "Addresses", value: String(id.postalAddresses.length + id.physicalAddresses.length) },
        { label: "Employers", value: String(id.employment.length) },
      ],
    },
    {
      kind: "table",
      title: "Every trace on file",
      hint: "as lenders reported them",
      columns: [{ header: "Kind", width: 18 }, { header: "Detail", width: 58 }, { header: "Country / date", width: 24 }],
      rows: [
        ...id.names.map((n): Cell[] => [{ text: "Name" }, { text: n }, { text: "—" }]),
        ...id.phones.map((p): Cell[] => [{ text: "Phone" }, { text: p, mono: true }, { text: "—" }]),
        ...id.emails.map((e): Cell[] => [{ text: "Email" }, { text: e, mono: true }, { text: "—" }]),
        ...id.physicalAddresses.map((a): Cell[] => [{ text: "Physical" }, { text: [a.address, a.town].filter(Boolean).join(", ") || "—" }, { text: a.country ?? "—" }]),
        ...id.postalAddresses.map((a): Cell[] => [{ text: "Postal" }, { text: [a.number, a.town, a.code].filter(Boolean).join(" · ") || "—" }, { text: a.country ?? "—" }]),
        ...id.employment.map((e): Cell[] => [{ text: "Employer" }, { text: e.employerName ?? "—" }, { text: e.employmentDate ? date(e.employmentDate) : "—" }]),
      ],
      emptyMessage: "No traces on file",
      source: src,
    },
    {
      kind: "callout",
      tone: "info",
      title: "Reading traces",
      body: "Several spellings of one name and several addresses are normal: each lender typed what it was given. A trace the applicant cannot explain — an employer they never worked for, a town they never lived in — is the signal worth asking about.",
    },
  ];
  return { meta: productMeta(6, file, meta, "Every phone, email, address, employer and name spelling lenders have reported against this ID.", opts), blocks };
}

/** Report 16 — the bureau's own account arithmetic. */
export function accountsSummaryDocument(file: BureauFile, meta: Omit<ReportMeta, "title" | "reportType">, opts: BureauDocOpts = {}): ReportDocument {
  const s = file.accountsSummary ?? {};
  const n = (k: string) => (s[k] === undefined ? "—" : String(Math.round(s[k])));
  const blocks: Block[] = [
    {
      kind: "kpis",
      items: [
        { label: "Mobile loans active", value: n("mobile_account_count_active"), note: `${n("mobile_account_count_closed")} closed` },
        { label: "Generic loans", value: n("generic_account_count"), note: `${n("generic_account_count_closed")} closed` },
        { label: "In arrears", value: String(Math.round((s.mobile_account_in_arrears_count ?? 0) + (s.generic_account_in_arrears_count ?? 0))), tone: (s.mobile_account_in_arrears_count ?? 0) + (s.generic_account_in_arrears_count ?? 0) > 0 ? "watch" : "good" },
        { label: "Non-performing", value: String(Math.round((s.mobile_account_npa_count ?? 0) + (s.generic_account_npa_count ?? 0))), tone: (s.mobile_account_npa_count ?? 0) + (s.generic_account_npa_count ?? 0) > 0 ? "bad" : "good" },
        { label: "Monthly instalment", value: s.total_monthly_instalment_generic === undefined ? "—" : `KES ${kes(s.total_monthly_instalment_generic)}`, note: "generic loans only" },
      ],
    },
    {
      kind: "table",
      title: "The bureau's counts",
      hint: "every field returned",
      columns: [{ header: "Measure", width: 62 }, { header: "Mobile", align: "right", mono: true }, { header: "Generic", align: "right", mono: true }],
      rows: [
        [{ text: "Accounts active" }, { text: n("mobile_account_count_active") }, { text: n("generic_account_count") }],
        [{ text: "Accounts closed" }, { text: n("mobile_account_count_closed") }, { text: n("generic_account_count_closed") }],
        [{ text: "In arrears" }, { text: n("mobile_account_in_arrears_count") }, { text: n("generic_account_in_arrears_count") }],
        [{ text: "Non-performing" }, { text: n("mobile_account_npa_count") }, { text: n("generic_account_npa_count") }],
        [
          { text: "Average principal, active" },
          { text: s.average_principal_mobile_loans_active === undefined ? "—" : kes(s.average_principal_mobile_loans_active) },
          { text: "—" },
        ],
        [
          { text: "Average principal, closed" },
          { text: s.average_principal_mobile_loans_closed === undefined ? "—" : kes(s.average_principal_mobile_loans_closed) },
          { text: "—" },
        ],
      ],
      source: bureauSrc(file, "credit_info"),
    },
    {
      kind: "callout",
      tone: "info",
      title: "Whose arithmetic",
      body: "These counts are the bureau's own. They can differ from an account-by-account count of report 8 or 12, because the bureau classifies mobile and generic loans by its own rules.",
    },
  ];
  return { meta: productMeta(16, file, meta, "How many mobile and generic loans this person holds, how many are late, and what they already pay each month.", opts), blocks };
}

/**
 * One bureau product, as its own document.
 *
 * 8, 10, 11, 12 and 14 are account files and share the flagship layout under
 * their own name. The rest answer one narrow question each.
 */
export function bureauDocument(
  type: number,
  file: BureauFile,
  meta: Omit<ReportMeta, "title" | "reportType">,
  opts: BureauDocOpts = {},
): ReportDocument {
  switch (type) {
    case 1:
      return identityVerificationDocument(file, meta, opts);
    case 2:
      return delinquencyDocument(file, meta, opts);
    case 3:
      return scoreDocument(file, meta, opts);
    case 6:
      return identityScrubDocument(file, meta, opts);
    case 16:
      return accountsSummaryDocument(file, meta, opts);
    default: {
      const def = bureauReportType(type);
      const doc = bureauCreditFile(file, meta, { reportType: type, title: def?.name ?? `Report ${type}` });
      return doc;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 11 · STATEMENT CRUNCH — affordability read from the M-PESA rail itself.
//
// What the theatre plays, as a document an officer files. Every figure is the
// statement's; the band, the ceiling and the flags are the Interchange's reading
// of it, and the page says which is which.
// ─────────────────────────────────────────────────────────────────────────────

export function statementDocument(
  crunch: CrunchData,
  meta: Omit<ReportMeta, "title" | "reportType">,
  opts: { fileSha256?: string | null; synthetic?: boolean } = {},
): ReportDocument {
  const f = crunch.features;
  const s = crunch.creditScore;
  const r = crunch.report;
  const tone: Tone = s.tone === "good" ? "good" : s.tone === "bad" ? "bad" : "watch";
  const src = `Source: M-PESA statement · ${crunch.transactionCount} transactions · ${f.periodStart} to ${f.periodEnd}`;
  const reading = (what: string) => `Interchange reading of the statement · ${what}`;

  const blocks: Block[] = [
    {
      kind: "kpis",
      items: [
        { label: "Average income", value: `KES ${kes(f.avgMonthlyIncome)}`, note: "per month", tone: "info" },
        { label: "Average spend", value: `KES ${kes(f.avgMonthlyExpense)}`, note: "per month" },
        { label: "Monthly surplus", value: `KES ${kes(f.avgMonthlyNet)}`, note: f.avgMonthlyNet > 0 ? "after spending" : "spending exceeds income", tone: f.avgMonthlyNet > 0 ? "good" : "bad" },
        { label: "Comfortable instalment", value: `KES ${kes(crunch.affordability.recommendedMaxInstallment)}`, note: "a third of the surplus", tone: "info" },
        { label: "Statement score", value: String(s.score), note: `${s.band} · ${s.decision}`, tone },
      ],
    },
    {
      kind: "callout",
      tone: r.highlights.some((h) => h.tone === "negative") ? "watch" : "good",
      title: "What this statement says",
      body: r.lifestyle.narrative,
    },
  ];

  if (crunch.nameCheck) {
    blocks.push({
      kind: "callout",
      tone: crunch.nameCheck.matched ? "good" : "bad",
      title: "Statement holder",
      body: crunch.nameCheck.matched
        ? `The statement is registered to ${crunch.nameCheck.statementName}, which matches ${crunch.nameCheck.expectedName} on the enquiry.`
        : `The statement names ${crunch.nameCheck.statementName ?? "nobody readable"}, not ${crunch.nameCheck.expectedName}. It does not describe the borrower on the enquiry.`,
    });
  }

  blocks.push({ kind: "heading", text: "Cashflow, month by month" });
  blocks.push({
    kind: "row",
    blocks: [
      {
        kind: "chart",
        title: "Income by month",
        half: true,
        svg: trendLine(crunch.monthly.map((m) => ({ label: m.month.slice(5), value: m.income })), { color: EMERALD[4], valueFormat: (n) => kesCompact(n), title: "Income by month" }),
        source: src,
      },
      {
        kind: "chart",
        title: "Where the money goes",
        hint: "top categories",
        half: true,
        svg: barList(
          r.spendByCategory.slice(0, 7).map((c) => ({ label: c.category, value: c.amount, note: `${Math.round(c.share * 100)}%`, color: c.category === "Betting" ? STATE.bad : EMERALD[3] })),
          { format: (n) => `KES ${kesCompact(n)}` },
        ),
        source: reading("life-category clustering"),
      },
    ],
  });
  blocks.push({
    kind: "table",
    title: "Monthly breakdown",
    columns: [
      { header: "Month", width: 16, mono: true },
      { header: "Income", align: "right", mono: true },
      { header: "Spend", align: "right", mono: true },
      { header: "Net", align: "right", mono: true },
      { header: "Betting", align: "right", mono: true },
    ],
    rows: crunch.monthly.map((m): Cell[] => [
      { text: m.month },
      { text: kes(m.income) },
      { text: kes(m.expense) },
      { text: kes(m.net), tone: m.net < 0 ? "bad" : undefined, strong: true },
      { text: m.gambling > 0 ? kes(m.gambling) : "—", tone: m.gambling > 0 ? "bad" : undefined },
    ]),
    source: src,
  });

  blocks.push({ kind: "heading", text: "Behaviour the audit tested" });
  const monthsWithIncome = Math.round(f.incomeMonthsRatio * f.monthsCovered);
  blocks.push({
    kind: "table",
    columns: [{ header: "Check", width: 32 }, { header: "Result", width: 48 }, { header: "Reading", width: 20 }],
    rows: [
      [{ text: "Income every month" }, { text: `Income in ${monthsWithIncome} of ${f.monthsCovered} months` }, { text: f.incomeMonthsRatio >= 0.8 ? "Pass" : "Watch", tone: f.incomeMonthsRatio >= 0.8 ? "good" : "watch" }],
      [{ text: "Income stability" }, { text: `Volatility ${f.incomeVolatility}` }, { text: f.incomeVolatility <= 0.5 ? "Stable" : "Erratic", tone: f.incomeVolatility <= 0.5 ? "good" : "watch" }],
      [{ text: "Betting" }, { text: `${(f.gamblingRatio * 100).toFixed(1)}% of outflow · KES ${kes(f.gamblingOutflow)}` }, { text: f.gamblingRatio <= 0.02 ? "Pass" : "Watch", tone: f.gamblingRatio <= 0.02 ? "good" : "watch" }],
      [{ text: "Borrowing" }, { text: `${Math.round(f.loanDependencyRatio * 100)}% of inflow · ${f.loanEventCount} loan events` }, { text: f.loanDependencyRatio <= 0.15 ? "Pass" : "Watch", tone: f.loanDependencyRatio <= 0.15 ? "good" : "watch" }],
      [{ text: "Surplus" }, { text: `KES ${kes(f.avgMonthlyNet)} a month after spending` }, { text: f.avgMonthlyNet > 0 ? "Pass" : "Fail", tone: f.avgMonthlyNet > 0 ? "good" : "bad" }],
    ],
    source: reading("audit thresholds"),
  });

  if (r.loanBehaviour.lenders.length) {
    blocks.push({
      kind: "table",
      title: "Lenders visible in the statement",
      hint: `repays ${r.loanBehaviour.repaymentCadence}${r.loanBehaviour.fulizaReliant ? " · Fuliza-reliant" : ""}`,
      columns: [{ header: "Lender", width: 34 }, { header: "Borrowed", align: "right", mono: true }, { header: "Repaid", align: "right", mono: true }, { header: "Events", align: "right", mono: true }],
      rows: r.loanBehaviour.lenders.map((l): Cell[] => [{ text: l.name }, { text: kes(l.borrowed) }, { text: kes(l.repaid) }, { text: String(l.events) }]),
      note: "A statement shows only lenders that move money through M-PESA. An exposure query shows every member's live book.",
      source: src,
    });
  }

  blocks.push({
    kind: "table",
    title: "What drove the score",
    hint: s.modelVersion,
    columns: [{ header: "Factor", width: 30 }, { header: "Points", align: "right", width: 12, mono: true }, { header: "Why" }],
    rows: s.breakdown
      .filter((b) => b.points !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .map((b): Cell[] => [
        { text: b.factor },
        { text: `${b.points > 0 ? "+" : ""}${b.points}`, tone: b.points > 0 ? "good" : "bad" },
        { text: s.reasonCodes.find((x) => x.code === b.code)?.detail ?? "" },
      ]),
    note: `Default probability ${s.pdPercent}. The statement score runs 300 to 900 and is the Interchange's model, not a bureau score.`,
    source: reading("thin-file scorecard"),
  });

  return {
    meta: {
      ...meta,
      title: "Cashflow & Affordability",
      reportType: 11,
      eyebrow: "Statement Crunch",
      subtitle: opts.synthetic
        ? "Read from a synthetic M-PESA statement by the production engine. The transactions are invented; everything computed from them is real output."
        : "Read from the borrower's own M-PESA statement: what comes in, what goes out, and what they can carry each month.",
      source: meta.source ?? `M-PESA statement · ${f.periodStart} to ${f.periodEnd}`,
      statement: { fileSha256: opts.fileSha256 ?? null, period: `${f.periodStart} to ${f.periodEnd}`, holder: crunch.nameCheck?.statementName ?? null, synthetic: opts.synthetic },
    },
    blocks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 20 — ECOSYSTEM EXPOSURE. The one no bureau can sell.
// ─────────────────────────────────────────────────────────────────────────────

export type ExposureForReport = {
  activeLoans: number;
  lenders: number;
  outstandingBand: string;
  worstBucket: string;
  newestDisbursement: string | null;
  velocity14d: number;
  partial: boolean;
  screened: number;
  queried: number;
  responded: number;
  silent?: { memberCode: string; reason: string }[];
  lendersNamed?: string[] | null;
  timings?: { screenMs: number; fanoutMs: number; totalMs: number };
  asOf: string;
};

const BUCKET_LABEL: Record<string, string> = {
  prepayment: "Ahead of schedule",
  due: "Current",
  watch_1: "1–30 days late",
  watch_2: "31–60 days late",
  watch_3: "61–90 days late",
  npl: "Non-performing",
};

export function exposureReport(e: ExposureForReport, meta: Omit<ReportMeta, "title" | "reportType">): ReportDocument {
  const bucketTone: Tone =
    e.worstBucket === "npl" || e.worstBucket === "watch_3" ? "bad" : e.worstBucket.startsWith("watch") ? "watch" : "good";

  const blocks: Block[] = [
    {
      kind: "kpis",
      items: [
        { label: "Active loans", value: String(e.activeLoans), note: "across the ecosystem, this moment", tone: e.activeLoans > 0 ? "info" : "mute" },
        { label: "Lenders", value: String(e.lenders), note: e.lendersNamed?.length ? e.lendersNamed.join(", ") : "identities withheld by consent", tone: e.lenders >= 3 ? "watch" : "mute" },
        { label: "Outstanding", value: e.outstandingBand === "none" ? "—" : `KES ${e.outstandingBand}`, note: "banded, never exact" },
        { label: "Worst bucket", value: BUCKET_LABEL[e.worstBucket] ?? e.worstBucket, note: "worst position held anywhere", tone: bucketTone },
        { label: "New credit, 14d", value: String(e.velocity14d), note: e.velocity14d >= 2 ? "stacking signal" : "no recent acceleration", tone: e.velocity14d >= 2 ? "bad" : "good" },
      ],
    },
  ];

  if (e.velocity14d >= 2) {
    blocks.push({
      kind: "callout",
      tone: "bad",
      title: "Stacking signal",
      body:
        `This borrower took credit from ${e.velocity14d} lenders in the last fortnight. Totals alone cannot separate ` +
        "them from somebody holding the same loans for a year, and no bureau sees this at all — a monthly submission " +
        "cycle would report it weeks from now.",
    });
  }

  if (e.partial) {
    blocks.push({
      kind: "callout",
      tone: "watch",
      title: "Incomplete answer",
      body:
        `Only ${e.responded} of ${e.queried} members answered in time. Treat this as a FLOOR, not a total. ` +
        (e.silent?.length ? `Silent: ${e.silent.map((s) => `${s.memberCode} (${s.reason})`).join(", ")}.` : ""),
    });
  }

  blocks.push({
    kind: "row",
    blocks: [
      {
        kind: "panel",
        title: "How this answer was reached",
        half: true,
        html:
          `<ol style="margin:0;padding-left:4.5mm;font-size:8.8pt;line-height:1.6">` +
          `<li>The identifier was tokenised inside the asking member's node. The Registry never saw it.</li>` +
          `<li><strong>${e.screened}</strong> members were screened locally against published Bloom filters.</li>` +
          `<li><strong>${e.queried}</strong> were contacted — the other ${Math.max(0, e.screened - e.queried)} never learned the query happened.</li>` +
          `<li><strong>${e.responded}</strong> answered with aggregates only: counts, a band, a bucket. No names, no loan ids, no amounts to the shilling.</li>` +
          `</ol>`,
      },
      {
        kind: "chart",
        title: "Fan-out",
        hint: e.timings ? `${e.timings.totalMs}ms total` : undefined,
        half: true,
        svg: barList(
          [
            { label: "Members in network", value: e.screened, color: PAPER.axis },
            { label: "Contacted after screening", value: e.queried, color: CATEGORICAL[1] },
            { label: "Answered", value: e.responded, color: EMERALD[3] },
            { label: "Holding this borrower", value: e.lenders, color: STATE.bad },
          ],
          { format: (n) => String(Math.round(n)), max: Math.max(e.screened, 1) },
        ),
        caption: e.timings
          ? `Screened in ${e.timings.screenMs}ms, fan-out ${e.timings.fanoutMs}ms. Target is p95 under 400ms.`
          : undefined,
      },
    ],
  });

  blocks.push({
    kind: "facts",
    columns: 3,
    items: [
      { label: "Newest disbursement", value: date(e.newestDisbursement), mono: true },
      { label: "As of", value: e.asOf.replace("T", " ").slice(0, 19), mono: true },
      { label: "Answer completeness", value: e.partial ? `Partial — ${e.responded}/${e.queried}` : "Complete" },
    ],
  });

  blocks.push({
    kind: "ledger",
    items: [
      { label: "Ecosystem exposure — live member books", status: "present" },
      { label: "Lender identities", status: e.lendersNamed?.length ? "present" : "unavailable", note: e.lendersNamed?.length ? undefined : "The borrower did not grant identity.disclose, so counterparties are counted and not named." },
      { label: "Bureau file (Metropol)", status: "unavailable", note: "Not requested in this call. Available as report 12." },
    ],
  });

  return {
    meta: {
      ...meta,
      title: "Ecosystem Exposure",
      reportType: 20,
      subtitle:
        "Is this borrower, who looks clean, currently servicing loans across this ecosystem? Answered from live " +
        "member books, not from a monthly bureau submission.",
      source: meta.source ?? `${e.responded} member node${e.responded === 1 ? "" : "s"}`,
    },
    blocks,
  };
}
