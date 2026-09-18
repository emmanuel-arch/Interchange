// ─────────────────────────────────────────────────────────────────────────────
// A synthetic M-PESA statement, for the public demo.
//
// Nobody's real statement is published, so the demo runs the REAL engine over a
// statement written here: six months of a small trader's M-PESA, laid out the
// way Safaricom's statement text comes out of the PDF (receipt, date, time,
// details, "Completed", paid in, withdrawn as a negative, balance). The parser,
// classifier, feature extraction, audit and scorecard are the production code;
// only the transactions are invented, and every surface that shows the result
// says so.
//
// Deterministic: a seeded generator, so the demo reads the same on every build.
// ─────────────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Row = { date: string; time: string; details: string; amount: number };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const SYNTHETIC_HOLDER = "AMANI JABALI MWENDA";

export function syntheticStatement(opts: { seed?: number; start?: string; months?: number } = {}): { text: string; holder: string } {
  const rand = rng(opts.seed ?? 20260917);
  const months = opts.months ?? 6;
  const start = new Date(`${opts.start ?? "2026-03-01"}T00:00:00Z`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
  const rows: Row[] = [];

  const add = (day: Date, details: string, amount: number) => {
    const hh = String(between(6, 21)).padStart(2, "0");
    const mm = String(between(0, 59)).padStart(2, "0");
    const ss = String(between(0, 59)).padStart(2, "0");
    rows.push({ date: day.toISOString().slice(0, 10), time: `${hh}:${mm}:${ss}`, details, amount });
  };

  const customers = ["2547******418 PETER OTIENO", "2547******902 GRACE WANJIRU", "2547******155 JOHN KAMAU", "2547******377 MERCY ACHIENG", "2547******640 BRIAN KIPROTICH"];
  const shops = ["NAIVAS SUPERMARKET THIKA RD", "QUICKMART KASARANI", "MAMA NGINA GREENGROCERS", "JUJA BUTCHERY"];
  const days = months * 30;

  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86_400_000);
    const dom = day.getUTCDate();

    // Trading income: most days, several small business payments.
    if (rand() < 0.8) {
      for (let k = 0; k < between(1, 4); k++) add(day, `Merchant Customer Payment from ${pick(customers)}`, between(250, 1700));
    }
    if (rand() < 0.07) add(day, `Funds received from - ${pick(customers)}`, between(1000, 4000));

    // Stock and household.
    if (rand() < 0.5) add(day, `Merchant Payment to 5${between(10000, 99999)} - ${pick(shops)}`, -between(400, 2200));
    if (rand() < 0.3) add(day, `Customer Transfer to - ${pick(customers)}`, -between(200, 1500));
    if (rand() < 0.2) add(day, "Airtime Purchase", -between(50, 250));
    if (rand() < 0.08) add(day, `Customer Withdrawal At Agent Till 3${between(10000, 99999)} - JUJA AGENCIES`, -between(500, 3000));
    if (rand() < 0.1) add(day, `Merchant Payment Online to 8${between(10000, 99999)} - RUBIS ENERGY JUJA`, -between(400, 1500));

    // The month's fixed costs.
    if (dom === 5) add(day, "Pay Bill to 888880 - KPLC PREPAID Acc. 37194***", -between(900, 1400));
    if (dom === 3) add(day, "Pay Bill to 522533 - SUNRISE APARTMENTS Acc. RENT", -9500);
    if (dom === 12 && [0, 4].includes(Math.floor(d / 30))) add(day, "Pay Bill to 247247 - JUJA ACADEMY Acc. FEES", -between(6000, 9000));

    // Credit behaviour: an M-Shwari loan early in some months, repaid within the month.
    if (dom === 8 && rand() < 0.6) {
      const loan = between(3000, 7000);
      add(day, "M-Shwari Loan Disbursement", loan);
      const repay = new Date(day.getTime() + between(14, 24) * 86_400_000);
      if (repay.getTime() < start.getTime() + days * 86_400_000) add(repay, "M-Shwari Loan Repayment", -Math.round(loan * 1.075));
    }
    // Fuliza to bridge a thin day, repaid as money comes in.
    if (rand() < 0.1) {
      const od = between(300, 1500);
      add(day, "OverDraft of Credit Party", od);
      add(new Date(day.getTime() + 86_400_000), "OD Loan Repayment to 232323 - M-PESA Overdraw", -Math.round(od * 1.01));
    }
    // A Tala loan mid-month in some months, repaid in instalments.
    if (dom === 15 && rand() < 0.5) {
      const loan = between(4000, 9000);
      add(day, "Funds received from - TALA KENYA LIMITED", loan);
      for (const gap of [7, 14, 21]) {
        const when = new Date(day.getTime() + gap * 86_400_000);
        if (when.getTime() < start.getTime() + days * 86_400_000) add(when, "Pay Bill to 851900 - TALA KENYA Acc. LOAN", -Math.round((loan * 1.15) / 3));
      }
    }
    // Betting: small, frequent, and exactly what the audit exists to surface.
    if (rand() < 0.22) add(day, "Pay Bill to 290290 - BETIKA Acc. 07******", -between(100, 700));
  }

  rows.sort((a, b) => (`${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1));

  // Balances run forward; the statement prints newest first, as Safaricom's does.
  let balance = 3120.55;
  const lines = rows.map((r, i) => {
    balance = Math.round((balance + r.amount) * 100) / 100;
    if (balance < 0) balance = Math.round((balance + 5000) * 100) / 100; // topped up from savings, off-statement
    const receipt = `U${"ABCDEFGHJKLMNPQRSTUVWXYZ"[i % 24]}${(i * 7919 + 104729).toString(36).toUpperCase().padStart(8, "0").slice(-8)}`;
    const paidIn = r.amount > 0 ? money(r.amount) : "0.00";
    const withdrawn = r.amount < 0 ? `-${money(-r.amount)}` : "0.00";
    return `${receipt} ${r.date} ${r.time} ${r.details} Completed ${paidIn} ${withdrawn} ${money(balance)}`;
  });

  const header =
    `M-PESA STATEMENT Customer Name: ${SYNTHETIC_HOLDER} Mobile Number: 254799000123 Email Address: sample.borrower@example.com ` +
    `Statement Period: ${rows[0]?.date} - ${rows[rows.length - 1]?.date} Request Date: 2026-09-17 ` +
    "Receipt No. Completion Time Details Transaction Status Paid In Withdrawn Balance ";

  return { text: header + lines.reverse().join(" "), holder: SYNTHETIC_HOLDER };
}
