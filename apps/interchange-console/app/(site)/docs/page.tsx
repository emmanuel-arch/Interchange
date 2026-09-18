import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "fs";
import { join } from "path";
import { DocsNav, type DocsSection } from "@/components/site/DocsNav";
import { CodeBlock } from "@/components/site/CodeBlock";
import {
  BUREAU_REPORT_TYPES,
  REPORT_REASONS,
  IDENTITY_TYPES,
  DELINQUENCY_CODES,
  LENDER_SECTORS,
  PRODUCT_TYPES,
  ACCOUNT_STATUSES,
  BUREAU_RESPONSE_CODES,
} from "@/lib/codes/metropol";
import { IX_LIST } from "@/lib/codes/interchange";
import { REPORTS } from "@/lib/reports/catalogue";
import { SCOPES } from "@/lib/consent/scopes";
import { previewByType } from "@/lib/preview/manifest";
import { PUBLIC_ORIGIN } from "@/lib/brand";

export const metadata: Metadata = {
  title: "API reference · The Interchange",
  description: "Sign a request, ask the network, read the answer. Endpoints, authentication, report types, code tables and response codes.",
};

const SECTIONS: DocsSection[] = [
  { id: "overview", label: "Overview", children: [{ id: "base-url", label: "Base URL and versions" }, { id: "credentials", label: "Your credential pack" }] },
  { id: "authentication", label: "Authentication", children: [{ id: "canonical", label: "The canonical string" }, { id: "snippets", label: "Signing in your language" }] },
  { id: "quickstart", label: "Quickstart" },
  { id: "endpoints", label: "Endpoints" },
  { id: "reports", label: "Interchange reports" },
  { id: "bureau-direct", label: "Bureau Direct" },
  { id: "envelope", label: "The response envelope" },
  { id: "consent", label: "Consent" },
  { id: "codes", label: "Code tables", children: [
    { id: "codes-reasons", label: "Report reasons" },
    { id: "codes-identity", label: "Identity types" },
    { id: "codes-delinquency", label: "Delinquency" },
    { id: "codes-sectors", label: "Lender sectors" },
    { id: "codes-products", label: "Product types" },
    { id: "codes-status", label: "Account status" },
  ] },
  { id: "errors", label: "Response codes", children: [{ id: "errors-ix", label: "Interchange (IX)" }, { id: "errors-bureau", label: "Bureau (E)" }] },
  { id: "quirks", label: "Bureau behaviour" },
];

const STATE = {
  live: "border-emerald-500/30 text-emerald-300",
  soon: "border-amber-500/30 text-amber-300",
} as const;

function Badge({ state, children }: { state: keyof typeof STATE; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${STATE[state]}`}>{children}</span>;
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-20 border-t border-white/[0.07] pt-10 text-[28px] font-semibold tracking-tight text-white first:mt-0 first:border-0 first:pt-0">
      <a href={`#${id}`} className="hover:text-emerald-200">{children}</a>
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-10 text-[19px] font-semibold text-white/90">
      <a href={`#${id}`} className="hover:text-emerald-200">{children}</a>
    </h3>
  );
}

function Table({ head, rows, mono = [0] }: { head: string[]; rows: React.ReactNode[][]; mono?: number[] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-white/[0.03]">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/40">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/[0.06] align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${mono.includes(j) ? "whitespace-nowrap font-mono text-[12.5px] text-emerald-200/90" : "text-white/65"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NODE_SNIPPET = `import { createHash, randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";

const BASE = "${PUBLIC_ORIGIN}";
const MEMBER = "KE/LENDER/3002";
const SECRET_KEY_HEX = process.env.INTERCHANGE_SECRET_KEY; // 32-byte Ed25519 seed, hex

export async function interchange(path, payload) {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const nonce = randomBytes(16).toString("hex");
  const canonical = [
    "POST",
    path,
    createHash("sha256").update(body, "utf8").digest("hex"),
    timestamp,
    nonce,
    MEMBER,
  ].join("\\n");
  const signature = Buffer.from(
    ed25519.sign(new TextEncoder().encode(canonical), Buffer.from(SECRET_KEY_HEX, "hex")),
  ).toString("hex");

  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-interchange-member": MEMBER,
      "x-interchange-timestamp": timestamp,
      "x-interchange-nonce": nonce,
      "x-interchange-signature": signature,
    },
    body, // send exactly the bytes you hashed
  });
  return res;
}`;

const CSHARP_SNIPPET = `// dotnet add package BouncyCastle.Cryptography
using System.Security.Cryptography;
using System.Text;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;

static HttpRequestMessage Sign(string path, string body, string member, string secretKeyHex, string baseUrl)
{
    var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
    var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
    var canonical = string.Join("\\n", "POST", path, digest, timestamp, nonce, member);

    var signer = new Ed25519Signer();
    signer.Init(true, new Ed25519PrivateKeyParameters(Convert.FromHexString(secretKeyHex), 0));
    var bytes = Encoding.UTF8.GetBytes(canonical);
    signer.BlockUpdate(bytes, 0, bytes.Length);
    var signature = Convert.ToHexString(signer.GenerateSignature()).ToLowerInvariant();

    var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + path)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };
    req.Headers.Add("x-interchange-member", member);
    req.Headers.Add("x-interchange-timestamp", timestamp);
    req.Headers.Add("x-interchange-nonce", nonce);
    req.Headers.Add("x-interchange-signature", signature);
    return req;
}`;

const PYTHON_SNIPPET = `# pip install cryptography requests
import hashlib, json, os, secrets, requests
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

BASE = "${PUBLIC_ORIGIN}"
MEMBER = "KE/LENDER/3002"
KEY = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(os.environ["INTERCHANGE_SECRET_KEY"]))

def interchange(path, payload):
    body = json.dumps(payload, separators=(",", ":"))
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    nonce = secrets.token_hex(16)
    canonical = "\\n".join(["POST", path, hashlib.sha256(body.encode()).hexdigest(), timestamp, nonce, MEMBER])
    signature = KEY.sign(canonical.encode()).hex()
    return requests.post(BASE + path, data=body.encode(), headers={
        "content-type": "application/json",
        "x-interchange-member": MEMBER,
        "x-interchange-timestamp": timestamp,
        "x-interchange-nonce": nonce,
        "x-interchange-signature": signature,
    })`;

const PHP_SNIPPET = `<?php
// Requires the sodium extension (bundled with PHP 7.2+).
function interchange(string $path, array $payload): string {
    $base = "${PUBLIC_ORIGIN}";
    $member = "KE/LENDER/3002";
    $seed = hex2bin(getenv("INTERCHANGE_SECRET_KEY"));          // 32-byte seed
    $secret = sodium_crypto_sign_secretkey(sodium_crypto_sign_seed_keypair($seed));

    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $timestamp = gmdate("Y-m-d\\\\TH:i:s.v\\\\Z");
    $nonce = bin2hex(random_bytes(16));
    $canonical = implode("\\n", ["POST", $path, hash("sha256", $body), $timestamp, $nonce, $member]);
    $signature = bin2hex(sodium_crypto_sign_detached($canonical, $secret));

    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "content-type: application/json",
            "x-interchange-member: $member",
            "x-interchange-timestamp: $timestamp",
            "x-interchange-nonce: $nonce",
            "x-interchange-signature: $signature",
        ],
    ]);
    return curl_exec($ch);
}`;

function sampleEnvelope(): string {
  const p = previewByType(2);
  if (!p?.files?.json) return "";
  try {
    const full = JSON.parse(readFileSync(join(process.cwd(), "public", p.files.json.path), "utf8"));
    return JSON.stringify({ ...full, notices: { regulation_40_1: "…", bureau_disclaimer: ["…"], interchange: "…" } }, null, 2);
  } catch {
    return "";
  }
}

export default function Docs() {
  const envelope = sampleEnvelope();

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:pt-14">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-10 pr-2">
          <div className="inst mb-4 px-3 text-[10px] text-white/35">API v1</div>
          <DocsNav sections={SECTIONS} />
        </div>
      </aside>

      <article className="prose-docs min-w-0 max-w-[860px]">
        <div className="inst text-[10px] text-emerald-400/80">Developers</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">API reference</h1>
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-[13.5px] leading-relaxed text-amber-100/80">
          Anything marked <b>Live</b> answers today. Anything marked <b>With the engine move</b> is specified here as the contract and is being built
          as the Registry moves beside its database. Nothing on this page is described as working before it does.
        </div>
        <p className="mt-5 text-[16px]">
          One signed request asks the network. The request fields match the bureau&apos;s, so an existing bureau integration
          keeps its parsing code. What changes is the signature, which no one can forge, and the answer, which comes back already read.
        </p>

        <H2 id="overview">Overview</H2>
        <H3 id="base-url">Base URL and versions</H3>
        <Table
          head={["Environment", "Base URL", "Port", "Version", "State"]}
          mono={[1, 2, 3]}
          rows={[
            ["Production", `${PUBLIC_ORIGIN}/api/v1`, "443", "v1", <Badge key="p" state="live">Live</Badge>],
            ["Sandbox", `${PUBLIC_ORIGIN}/sandbox/v1`, "443", "v1", <Badge key="s" state="soon">With the engine move</Badge>],
          ]}
        />
        <p>
          All calls are HTTPS <code>POST</code> with a JSON body, except the health and catalogue reads. Versions change only by path. Fields are
          added inside a version and never removed or repurposed.
        </p>

        <H3 id="credentials">Your credential pack</H3>
        <Table
          head={["Item", "What it is"]}
          mono={[]}
          rows={[
            ["Member code", <span key="m">Your X-Road style identity, for example <code>KE/LENDER/3002</code>. Sent in <code>x-interchange-member</code>.</span>],
            ["Public key", "Ed25519, 32 bytes, hex. Registered with the Interchange; it is how we recognise your signature."],
            ["Private key", "A 32-byte Ed25519 seed, hex. Generated on your side and never sent to us, so nobody can sign as you, including us. In-portal generation arrives with the engine move."],
            ["IP allowlist", "The addresses your systems call from. Required for production keys. With the engine move."],
            ["Webhook secret", "Used to sign the events we send you: report.ready, crunch.completed, cap.reached. With the engine move."],
          ]}
        />

        <H2 id="authentication">Authentication</H2>
        <p>
          Every member call carries four headers. The signature covers the method, the path, the SHA-256 of the exact body bytes, the timestamp,
          a random nonce and your member code, so a request cannot be replayed, altered in transit, or sent in another member&apos;s name.
        </p>
        <Table
          head={["Header", "Value"]}
          mono={[0]}
          rows={[
            ["x-interchange-member", "Your member code."],
            ["x-interchange-timestamp", "ISO 8601 UTC, e.g. 2026-09-17T08:15:59.212Z. Refused outside a 60-second window (IX004)."],
            ["x-interchange-nonce", "32 random hex characters, fresh for every request."],
            ["x-interchange-signature", "Ed25519 signature over the canonical string, lowercase hex."],
          ]}
        />
        <H3 id="canonical">The canonical string</H3>
        <p>Six lines joined with a single newline, no trailing newline:</p>
        <CodeBlock
          title="canonical string"
          code={`POST
/api/v1/report
<sha256 of the body bytes, lowercase hex>
2026-09-17T08:15:59.212Z
9f1c2b7e4d0a4c3b8e6f1a2d3c4b5a69
KE/LENDER/3002`}
        />
        <p>
          The most common failure is hashing one serialisation of the body and sending another. Serialise once, hash those bytes, send those bytes.
        </p>
        <H3 id="snippets">Signing in your language</H3>
        <CodeBlock title="Node.js" code={NODE_SNIPPET} />
        <CodeBlock title="C# / .NET" code={CSHARP_SNIPPET} />
        <CodeBlock title="Python" code={PYTHON_SNIPPET} />
        <CodeBlock title="PHP" code={PHP_SNIPPET} />

        <H2 id="quickstart">Quickstart</H2>
        <ol className="my-5 list-decimal space-y-3 pl-5 text-white/65">
          <li>Sign in to the member portal, open <b className="text-white/85">API keys</b>, and generate a key pair. The private half downloads to your machine; the public half is registered.</li>
          <li>Add your server&apos;s address to the allowlist.</li>
          <li>
            Call the sandbox with the test ID <code>880000088</code>. It answers with the same anonymised file the{" "}
            <Link href="/preview" className="text-emerald-300 hover:text-emerald-200">live samples</Link> are built from, and costs nothing.
          </li>
          <li>Capture consent from a real borrower, then switch the base URL to production.</li>
        </ol>
        <CodeBlock
          title="POST /sandbox/v1/report"
          code={`{
  "report_type": 12,
  "identity_number": "880000088",
  "identity_type": "001",
  "loan_amount": 8000,
  "report_reason": 1,
  "consent_ref": "csn_…",
  "format": "json"
}`}
        />

        <H2 id="endpoints">Endpoints</H2>
        <Table
          head={["Call", "Purpose", "State"]}
          mono={[0]}
          rows={[
            ["POST /api/v1/report", "Any Interchange report, in json, html, pdf or bundle (JSON with the PDF inside).", <Badge key="a" state="live">Live</Badge>],
            ["POST /api/v1/bureau/report", "Bureau Direct: any entitled bureau report type, by the bureau's own integer.", <Badge key="b" state="soon">With the engine move</Badge>],
            ["POST /api/v1/statement/crunch", "Multipart: the M-PESA PDF, its password, and the name to check against.", <Badge key="c" state="soon">With the engine move</Badge>],
            ["POST /api/v1/exposure", "Hosted exposure query with a per-member answer status.", <Badge key="d" state="soon">With the engine move</Badge>],
            ["GET /api/v1/report/{reference}", "Download a past document again, in any format, within retention.", <Badge key="e" state="soon">With the engine move</Badge>],
            ["POST /api/consent", "Record a consent against a subject token. Signed.", <Badge key="f" state="live">Live</Badge>],
            ["POST /api/consent/{ref}/revoke", "Withdraw a consent. Prospective and idempotent.", <Badge key="g" state="live">Live</Badge>],
            ["POST /api/oprf/evaluate", "Blinded token evaluation for members running their own node.", <Badge key="h" state="live">Live</Badge>],
            ["GET /api/filters", "Published screening filters, for local screening before a fan-out.", <Badge key="i" state="live">Live</Badge>],
            ["GET /api/log/verify", "Re-verify the hash-chained message log.", <Badge key="j" state="live">Live</Badge>],
          ]}
        />

        <H2 id="reports">Interchange reports</H2>
        <p>
          Sent to <code>/api/v1/report</code>. Ecosystem reports are free to a contributing member. Bureau-backed reports carry the bureau&apos;s
          cost and a stated fee, shown as separate lines on the invoice.
        </p>
        <Table
          head={["Type", "Report", "Answers", "Source", "State"]}
          mono={[0]}
          rows={REPORTS.map((r) => [
            String(r.type),
            <span key="n" className="text-white/85">{r.name}</span>,
            r.answers,
            r.source === "ecosystem" ? "Member books" : r.source === "bureau" ? "Bureau" : "Both",
            <Badge key="s" state={r.live ? "live" : "soon"}>{r.live ? "Live" : "Specified"}</Badge>,
          ])}
        />
        <p>
          Interchange report numbers follow the bureau&apos;s where the product is the same, and start at 20 where no bureau has an equivalent.
          Two numbers collide by meaning: Interchange 2 reads live member books, while bureau report 2 is the bureau&apos;s own delinquency flag;
          and Interchange 22 is Contactability, while bureau report 22 is a 12-month account history. That is why bureau products have their own path.
        </p>

        <H2 id="bureau-direct">Bureau Direct</H2>
        <p>
          Sent to <code>/api/v1/bureau/report</code> with the bureau&apos;s own <code>report_type</code> integer. Every pull returns four things:
          the document on the Interchange letterhead, the Interchange JSON, the bureau&apos;s response exactly as received with its SHA-256, and for
          account reports a CSV of every account.
        </p>
        <Table
          head={["Type", "Report", "What the lender learns", "Needs loan context"]}
          mono={[0]}
          rows={BUREAU_REPORT_TYPES.map((r) => [
            String(r.type),
            <span key="n" className="text-white/85">
              {r.name}
              {!r.entitled ? <span className="ml-2 font-mono text-[10px] text-red-300/80">not in contract</span> : null}
            </span>,
            r.answers,
            r.needsLoanContext ? "loan_amount, report_reason" : "no",
          ])}
        />

        <H2 id="envelope">The response envelope</H2>
        <p>
          The top-level <code>has_error</code>, <code>api_code</code> and <code>api_code_description</code> keep the bureau&apos;s meaning.
          Everything the bureau said sits under <code>data</code>, restructured but never recomputed. Everything the Interchange worked out from
          it sits under <code>reading</code>, so the two can never be confused. This is the real sample for bureau report 2:
        </p>
        {envelope ? <CodeBlock title="200 OK · application/json" code={envelope} /> : null}

        <H2 id="consent">Consent</H2>
        <p>
          No consent reference, no answer. A consent is recorded against the borrower&apos;s token, never a national ID, and a consent issued for
          one borrower cannot be used to ask about another (IX104). The scopes a consent can carry:
        </p>
        <Table
          head={["Scope", "Label", "Mandatory"]}
          mono={[0]}
          rows={Object.entries(SCOPES).map(([k, v]) => [k, (v as { label: string }).label, (v as { mandatory: boolean }).mandatory ? "yes" : "no"])}
        />

        <H2 id="codes">Code tables</H2>
        <p>
          Every code value the bureau returns is passed through unchanged, so switch statements written against the bureau keep working. The
          descriptions below are the Interchange&apos;s own.
        </p>
        <H3 id="codes-reasons">Report reasons</H3>
        <Table head={["Code", "Reason", "When to use it"]} rows={REPORT_REASONS.map((c) => [c.code, c.label, c.meaning])} />
        <H3 id="codes-identity">Identity types</H3>
        <Table head={["Code", "Type", "Meaning"]} rows={IDENTITY_TYPES.map((c) => [c.code, c.label, c.meaning])} />
        <H3 id="codes-delinquency">Delinquency</H3>
        <Table head={["Code", "Status", "Meaning"]} rows={DELINQUENCY_CODES.map((c) => [c.code, c.label, c.meaning])} />
        <H3 id="codes-sectors">Lender sectors</H3>
        <Table head={["Key", "Sector", "Covers"]} rows={LENDER_SECTORS.map((c) => [c.code, c.label, c.meaning])} />
        <H3 id="codes-products">Product types</H3>
        <Table head={["Id", "Product", "Meaning"]} rows={PRODUCT_TYPES.map((c) => [String(c.id), c.label, c.meaning])} />
        <p>Ids 15, 16 and 17 are not used.</p>
        <H3 id="codes-status">Account status</H3>
        <Table
          head={["Code", "Status", "Meaning", "Counts as"]}
          rows={ACCOUNT_STATUSES.map((c) => [c.code, c.label, c.meaning, c.adverse ? "adverse" : c.finished ? "finished" : "open"])}
        />

        <H2 id="errors">Response codes</H2>
        <p>
          Every error says whose code it is. <code>api_code_source</code> is <code>&quot;interchange&quot;</code> when the Interchange decided, and{" "}
          <code>&quot;bureau&quot;</code> when the bureau produced the code, which is then passed through untouched.
        </p>
        <H3 id="errors-ix">Interchange (IX)</H3>
        <Table
          head={["Code", "HTTP", "Meaning", "What to do"]}
          mono={[0, 1]}
          rows={IX_LIST.map((c) => [c.code, String(c.http), <span key="m"><span className="text-white/85">{c.label}.</span> {c.meaning}</span>, c.action])}
        />
        <H3 id="errors-bureau">Bureau (E)</H3>
        <Table
          head={["Code", "Meaning", "Retry"]}
          rows={BUREAU_RESPONSE_CODES.map((c) => [c.code, <span key="m"><span className="text-white/85">{c.label}.</span> {c.meaning}</span>, c.retryable ? "yes" : "no"])}
        />

        <H2 id="quirks">Bureau behaviour worth knowing</H2>
        <p>Learned from live production responses, and handled by the Interchange so your integration does not have to be:</p>
        <ul className="my-5 list-disc space-y-2.5 pl-5 text-white/65">
          <li><code>api_code</code> arrives as a number or a string depending on the report. The Interchange always returns a string or null.</li>
          <li>E017 on an entitled report is a thin or unknown file. It is an answer, not a failure.</li>
          <li>Days in arrears count to the lender&apos;s last upload (<code>loaded_at</code>), not to today. The Interchange carries the date with every figure.</li>
          <li>An account reported open with a nil balance is settled but not yet re-flagged. It is not counted as live exposure.</li>
          <li>Enquiry counters are not real-time. Several pulls on one identity did not move them within half an hour.</li>
          <li>For the same person on the same day, the bureau&apos;s printed report and its API can list different account counts. Every Interchange figure states which source it came from.</li>
          <li>Report 12 nests identity fields inside the verification block while leaving the outer fields empty. The Interchange reads the nested values.</li>
        </ul>
      </article>
    </div>
  );
}
