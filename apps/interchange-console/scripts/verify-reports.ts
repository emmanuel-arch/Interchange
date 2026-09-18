// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE: the report endpoint, exercised exactly as a member node would.
//
//   npm run verify:reports -- http://127.0.0.1:3341
//
// This script IS a member node: it holds a private key, blinds the identifier
// locally, obtains the token through the blinded exchange, issues consent, and
// then asks for the report in each format. Nothing here reaches into the
// database — if it passes, a member with the same key can do the same thing
// from their own infrastructure.
//
// Most of the checks are ATTACKS, because the interesting property of a report
// endpoint is not that it answers, it is what it refuses:
//   · an unsigned request
//   · a report bought with someone else's consent
//   · a bureau report requested with a token instead of an identifier
//   · a subject token that disagrees with the identifier it was derived from
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { blind, finalize } from "../lib/oprf/node";
import { signRequest } from "../lib/signing";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";

const BASE = process.argv[2] ?? "http://127.0.0.1:3341";
const CALLER = process.env.VERIFY_MEMBER ?? "KE/LENDER/3005";
/** The subject whose captured bureau answer is being replayed. */
const SUBJECT_ID = process.env.VERIFY_SUBJECT_ID ?? "30058967";

/**
 * ── THIS SUITE MUST NOT SPEND MONEY BY ACCIDENT ─────────────────────────────
 *
 * The bureau-backed checks ask for report 12, which pulls FOUR Metropol reports.
 * While the Registry replays a captured answer that is free; the moment replay
 * is switched off — as it must be before any real borrower is queried — the
 * same command starts buying real credit files.
 *
 * That is not hypothetical. It happened: two runs of this suite against a live
 * Registry bought eight reports before anybody noticed, because the only signal
 * was a Metropol E409 duplicate-request error on the second run.
 *
 * The script and the Registry read the same .env, so replay can be detected
 * here. Without it the billed checks are SKIPPED unless --live is passed
 * deliberately.
 */
const REPLAYING = !!process.env.INTERCHANGE_BUREAU_REPLAY_DIR?.trim();
const ALLOW_SPEND = process.argv.includes("--live");
const BILLABLE_OK = REPLAYING || ALLOW_SPEND;

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(52)} \x1b[2m${detail}\x1b[0m`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(52)} ${detail}`);
  }
}

function keys(): Record<string, { secretKey: string }> {
  return JSON.parse(readFileSync(".member-keys.json", "utf8"));
}

async function signedPost(path: string, body: unknown, who = CALLER, secretOverride?: string) {
  const payload = JSON.stringify(body);
  const secretKeyHex = secretOverride ?? keys()[who].secretKey;
  const headers = signRequest({ method: "POST", path, body: payload, memberCode: who, secretKeyHex });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
  return res;
}

async function deriveToken(id: string): Promise<string> {
  const { input, blind: blindScalar, blindedHex } = blind("national_id", id);
  const res = await signedPost("/api/oprf/evaluate", { blinded: [blindedHex], purpose: "serving" });
  const j = (await res.json()) as { evaluated?: string[] };
  if (!res.ok || !j.evaluated?.length) throw new Error(`OPRF evaluate failed: ${res.status}`);
  return finalize(input, blindScalar, j.evaluated[0]);
}

async function main() {
  console.log(`\n\x1b[1mInterchange report endpoint\x1b[0m → ${BASE}\n`);
  console.log("  \x1b[2mTokenisation and consent\x1b[0m");

  const token = await deriveToken(SUBJECT_ID);
  check("identifier tokenised through the blinded exchange", token.length === 128, `${token.slice(0, 12)}…`);

  // The same identifier, normalised differently, must land on the same token —
  // this is the drift that silently empties an exposure answer.
  const spaced = await deriveToken(` ${SUBJECT_ID} `);
  check("whitespace variant yields the same token", spaced === token);

  const consentRes = await signedPost("/api/consent", {
    subject_token: token,
    member_code: CALLER,
    // The Registry refuses a consent that omits a mandatory scope at CAPTURE
    // rather than at the gate, so the full set travels here.
    scopes: MANDATORY_SCOPES,
    captured_via: "LMS_CONSOLE",
    evidence: { surface: "verify-reports", capturedAt: new Date().toISOString() },
  });
  const consent = (await consentRes.json()) as { consent_ref?: string };
  check("consent issued against the token", consentRes.status === 201 && !!consent.consent_ref, consent.consent_ref ?? "");

  const other = await deriveToken("11223344");
  const otherConsentRes = await signedPost("/api/consent", {
    subject_token: other,
    member_code: CALLER,
    scopes: MANDATORY_SCOPES,
    captured_via: "LMS_CONSOLE",
  });
  const otherConsent = (await otherConsentRes.json()) as { consent_ref?: string };

  console.log("\n  \x1b[2mRefusals — what the endpoint will not do\x1b[0m");

  const unsigned = await fetch(`${BASE}/api/v1/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report_type: 12, identity_number: SUBJECT_ID, consent_ref: consent.consent_ref }),
  });
  check("unsigned request refused", unsigned.status === 401, `HTTP ${unsigned.status}`);

  const noConsent = await signedPost("/api/v1/report", { report_type: 12, identity_number: SUBJECT_ID });
  const noConsentBody = (await noConsent.json()) as Record<string, unknown>;
  check(
    "no consent_ref refused",
    noConsent.status === 403 && String(noConsentBody.outcome) === "REFUSED_NO_CONSENT" && noConsentBody.api_code === "IX101",
    `${String(noConsentBody.outcome ?? "")} · ${String(noConsentBody.api_code ?? "")}`,
  );

  const wrongSubject = await signedPost("/api/v1/report", {
    report_type: 12,
    identity_number: SUBJECT_ID,
    consent_ref: otherConsent.consent_ref,
  });
  const wrongBody = (await wrongSubject.json()) as Record<string, unknown>;
  check(
    "another person's consent cannot buy this file",
    wrongSubject.status === 403 && wrongBody.api_code === "IX104",
    `${String(wrongBody.api_code ?? "")} · ${String(wrongBody.api_code_description ?? "").slice(0, 44)}`,
  );

  const tokenOnly = await signedPost("/api/v1/report", {
    report_type: 12,
    subject_token: token,
    consent_ref: consent.consent_ref,
  });
  const tokenOnlyBody = (await tokenOnly.json()) as Record<string, unknown>;
  check(
    "bureau report refuses a token with no identifier",
    tokenOnly.status === 400 && tokenOnlyBody.api_code === "IX702",
    String(tokenOnlyBody.api_code ?? ""),
  );

  const mismatched = await signedPost("/api/v1/report", {
    report_type: 12,
    identity_number: SUBJECT_ID,
    subject_token: other,
    consent_ref: consent.consent_ref,
  });
  const mismatchedBody = (await mismatched.json()) as Record<string, unknown>;
  check(
    "a token that disagrees with the identifier is refused",
    mismatched.status === 409 && mismatchedBody.api_code === "IX701",
    `HTTP ${mismatched.status} · ${String(mismatchedBody.api_code ?? "")}`,
  );

  const unknownType = await signedPost("/api/v1/report", {
    report_type: 99,
    identity_number: SUBJECT_ID,
    consent_ref: consent.consent_ref,
  });
  check("unknown report type refused", unknownType.status === 400, `HTTP ${unknownType.status}`);

  // ── STOP HERE UNLESS THIS IS FREE ────────────────────────────────────────
  // Everything below buys real Metropol reports when the Registry is not
  // replaying. This suite is run often and by habit; it must never be the
  // reason a bureau bill moves.
  if (!BILLABLE_OK) {
    console.log([
      "",
      "  SKIPPED - the checks below WOULD SPEND MONEY.",
      "  The Registry is not replaying a captured answer, so report 12 would buy four",
      "  real Metropol reports. Set INTERCHANGE_BUREAU_REPLAY_DIR and restart the Registry",
      "  to run them for free, or pass --live to buy them deliberately.",
      "",
      `  ${passed} passed, ${failed} failed - bureau checks skipped`,
      "",
    ].join("\n"));
    process.exit(failed === 0 ? 0 : 1);
  }

  console.log("\n  \x1b[2mAnswers\x1b[0m");

  const json = await signedPost("/api/v1/report", {
    report_type: 12,
    identity_number: SUBJECT_ID,
    consent_ref: consent.consent_ref,
    format: "json",
  });
  const jsonBody = (await json.json()) as Record<string, unknown>;
  const file = jsonBody.file as Record<string, unknown> | undefined;
  check("JSON report returned", json.status === 200 && jsonBody.has_error === false, `report ${jsonBody.report_type}`);
  check(
    "the file carries accounts and a score",
    Array.isArray(file?.accounts) && (file!.accounts as unknown[]).length > 0,
    `${(file?.accounts as unknown[] | undefined)?.length ?? 0} accounts`,
  );
  check("a log receipt came back", !!json.headers.get("x-interchange-log-seq"), `seq ${json.headers.get("x-interchange-log-seq")}`);

  const html = await signedPost("/api/v1/report", {
    report_type: 12,
    identity_number: SUBJECT_ID,
    consent_ref: consent.consent_ref,
    format: "html",
  });
  const htmlText = await html.text();
  check(
    "HTML report returned",
    html.status === 200 && htmlText.startsWith("<!doctype html>"),
    `${(htmlText.length / 1024).toFixed(0)}KB`,
  );
  check("the document embeds its own faces", htmlText.includes("data:font/woff;base64"), "WOFF v1 inlined");
  check(
    "no raw identifier appears in the document",
    !htmlText.includes(SUBJECT_ID),
    "identity number absent from the rendered page",
  );

  const pdf = await signedPost("/api/v1/report", {
    report_type: 12,
    identity_number: SUBJECT_ID,
    consent_ref: consent.consent_ref,
    format: "pdf",
  });
  if (pdf.headers.get("content-type")?.includes("application/pdf")) {
    const bytes = Buffer.from(await pdf.arrayBuffer());
    check("PDF report returned", bytes.subarray(0, 5).toString() === "%PDF-", `${(bytes.length / 1024).toFixed(0)}KB`);
    const fonts = [...bytes.toString("latin1").matchAll(/\/BaseFont\s*\/([A-Za-z0-9+#_-]+)/g)].map((m) =>
      m[1].replace(/^[A-Z]{6}\+/, ""),
    );
    check(
      "the PDF embeds the intended faces, not a fallback",
      fonts.some((f) => /Sora/i.test(f)) && !fonts.some((f) => /TimesNewRoman|ArialMT/i.test(f)),
      [...new Set(fonts)].join(", ").slice(0, 60),
    );
  } else {
    const body = (await pdf.json()) as Record<string, unknown>;
    check("PDF unavailable is reported honestly, not as a broken file", pdf.status === 503, String(body.api_code ?? ""));
  }

  // ── Report 20: the Registry typesets an answer the node computed ──────────
  // The Registry must never run the fan-out itself, so this path exists to
  // render aggregates the CALLER already holds. Both halves are checked: that
  // it refuses when no result is supplied, and that it renders one when it is.
  console.log("\n  \x1b[2mEcosystem exposure — rendered, never brokered by the Registry\x1b[0m");

  const noResult = await signedPost("/api/v1/report", {
    report_type: 20,
    subject_token: token,
    consent_ref: consent.consent_ref,
  });
  const noResultBody = (await noResult.json()) as Record<string, unknown>;
  check(
    "the Registry refuses to run the fan-out itself",
    noResult.status === 400 && noResultBody.api_code === "E015",
    String(noResultBody.api_code ?? ""),
  );

  const exposurePayload = {
    active_loans: 4,
    lenders: 3,
    outstanding_band: "50k–100k",
    worst_bucket: "watch_2",
    newest_disbursement: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    velocity_14d: 2,
    partial: false,
    screened: 16,
    queried: 3,
    responded: 3,
    timings: { screenMs: 1, fanoutMs: 96, totalMs: 98 },
    as_of: new Date().toISOString(),
  };

  const rendered = await signedPost("/api/v1/report", {
    report_type: 20,
    subject_token: token,
    consent_ref: consent.consent_ref,
    format: "html",
    exposure: exposurePayload,
  });
  const renderedHtml = await rendered.text();
  check(
    "a node's own exposure result is rendered",
    rendered.status === 200 && renderedHtml.includes("Ecosystem Exposure"),
    `${(renderedHtml.length / 1024).toFixed(0)}KB`,
  );
  check(
    "the stacking signal is stated, not buried",
    renderedHtml.includes("Stacking signal"),
    "velocity 2 surfaced as a callout",
  );

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e instanceof Error ? e.stack : String(e)}\x1b[0m\n`);
  process.exit(1);
});
