// ─────────────────────────────────────────────────────────────────────────────
// ANONYMISE A REAL BUREAU ANSWER INTO A PUBLISHABLE SAMPLE.
//
// The preview shows what a live request returns, so it is built from a REAL
// answer — invented data would show a layout, not the product. That makes this
// file the only thing standing between a real person's credit file and a public
// web page, and it is written to fail closed:
//
//   1. HARVEST. Every identifying value is read OUT of the answer first — names,
//      IDs, phones, emails, dates of birth, serials, addresses, employers,
//      account numbers, transaction ids. Nothing depends on knowing in advance
//      what this particular person's details are.
//   2. REPLACE. Every harvested value is swapped for a consistent stand-in,
//      everywhere it occurs, including INSIDE other strings. On the live file 42
//      of 48 account numbers start with the person's phone number, so an account
//      number that survived un-rewritten would publish the phone.
//   3. SCAN. The harvest becomes the leak list. Every byte written for the
//      preview is scanned for every harvested value, and the build fails if any
//      one appears. A sample that leaks is not published at all.
//
// Kept exactly: amounts, dates opened and updated, statuses, arrears, product
// types, sector counts, scores. Those are what the lender is being shown, and on
// their own they identify nobody.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** The stand-in person. The ID is from the bureau's published test set, which matches no real file. */
export const SAMPLE_PERSON = {
  idNumber: "880000088",
  names: ["AMANI", "JABALI", "MWENDA"],
  phone: "254799000123",
  email: "sample.borrower@example.com",
  dateOfBirth: "1990-06-14",
  serial: "200004170",
  towns: ["KITENGELA", "KAJIADO", "ATHI RIVER", "ISINYA"],
  employer: "SAMPLE EMPLOYER LIMITED",
};

export type Harvest = {
  idNumbers: Set<string>;
  nameTokens: Set<string>;
  /** Which part of the name a token was seen as: 0 first, 1 other, 2 surname. */
  nameRoles: Map<string, number>;
  phones: Set<string>;
  emails: Set<string>;
  dates: Set<string>;
  serials: Set<string>;
  places: Set<string>;
  employers: Set<string>;
  accountNumbers: Set<string>;
  trxIds: Set<string>;
  references: Set<string>;
  ips: Set<string>;
};

const NAME_KEYS = new Set(["first_name", "other_name", "surname", "last_name", "customer_name"]);
const NAME_LIST_KEYS = new Set(["names", "reported_name"]);
const PHONE_KEYS = new Set(["phone", "phone_number", "mobile", "msisdn"]);
const DOB_KEYS = new Set(["date_of_birth", "dob", "date_of_being"]);
const ID_KEYS = new Set(["identity_number", "id_number"]);

function walk(v: Json, visit: (key: string, value: Json, parentKey: string) => void, key = "", parentKey = "") {
  if (Array.isArray(v)) {
    for (const x of v) walk(x, visit, key, parentKey);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      visit(k, x, key);
      walk(x, visit, k, key);
    }
  }
}

const strings = (v: Json): string[] =>
  Array.isArray(v) ? v.flatMap(strings) : typeof v === "string" || typeof v === "number" ? [String(v)] : [];

/** Read every identifying value out of a set of bureau payloads. */
export function harvest(payloads: Json[]): Harvest {
  const h: Harvest = {
    idNumbers: new Set(), nameTokens: new Set(), nameRoles: new Map(), phones: new Set(), emails: new Set(),
    dates: new Set(), serials: new Set(), places: new Set(), employers: new Set(), accountNumbers: new Set(),
    trxIds: new Set(), references: new Set(), ips: new Set(),
  };
  const ROLE: Record<string, number> = { first_name: 0, other_name: 1, surname: 2, last_name: 2 };
  const addName = (s: string, role?: number) => {
    for (const t of s.toUpperCase().split(/[\s.,]+/)) {
      const clean = t.replace(/[^A-Z']/g, "");
      if (clean.length >= 3) {
        h.nameTokens.add(clean);
        const base = clean.replace(/'/g, "");
        if (role !== undefined && !h.nameRoles.has(base)) h.nameRoles.set(base, role);
        if (clean.includes("'")) h.nameTokens.add(clean.replace(/'/g, ""));
      }
    }
  };

  for (const p of payloads) {
    walk(p, (k, v, parent) => {
      if (NAME_KEYS.has(k) || NAME_LIST_KEYS.has(k)) strings(v).forEach((s) => addName(s, ROLE[k]));
      if (ID_KEYS.has(k)) strings(v).forEach((s) => s && h.idNumbers.add(s));
      if (PHONE_KEYS.has(k)) strings(v).forEach((s) => s && h.phones.add(s.replace(/\D/g, "")));
      if (k === "email") strings(v).forEach((s) => s.trim() && h.emails.add(s.trim()));
      if (DOB_KEYS.has(k)) strings(v).forEach((s) => s && h.dates.add(s));
      if (k === "serial_number") strings(v).forEach((s) => s && h.serials.add(s));
      if (k === "account_number") strings(v).forEach((s) => s && s !== "None" && h.accountNumbers.add(s));
      if (k === "trx_id") strings(v).forEach((s) => s && h.trxIds.add(s));
      if (k === "reference_number") strings(v).forEach((s) => s && h.references.add(s));
      if (k === "ipaddress") strings(v).forEach((s) => s && h.ips.add(s));
      if (k === "employer_name") strings(v).forEach((s) => s && h.employers.add(s));
      if ((parent === "postal_address" || parent === "physical_address") && (k === "town" || k === "address")) {
        strings(v).forEach((s) => s && !/^(KENYA|NAIROBI|-|0)$/i.test(s.trim()) && h.places.add(s.trim().toUpperCase()));
      }
    });
  }
  return h;
}

const digest = (s: string) => createHash("sha256").update(`interchange-sample|${s}`).digest();

/** Same length, same shape (letters stay letters, digits stay digits), different content. */
function reshape(value: string): string {
  const d = digest(value);
  let i = 0;
  return value.replace(/[A-Za-z0-9]/g, (ch) => {
    const b = d[i++ % d.length];
    if (/[0-9]/.test(ch)) return String(b % 10);
    const letter = String.fromCharCode(65 + (b % 26));
    return ch === ch.toUpperCase() ? letter : letter.toLowerCase();
  });
}

function fakeUuid(value: string): string {
  const h = digest(value).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Local forms of a Kenyan number, so 254701…, 0701… and 701… all get caught. */
function phoneForms(p: string): string[] {
  const core = p.replace(/^254/, "").replace(/^0/, "");
  return core.length >= 9 ? [`254${core}`, `0${core}`, core] : [p];
}

type Rule = { find: RegExp; replace: string | ((m: string) => string) };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rules(h: Harvest): Rule[] {
  const out: Rule[] = [];
  const fakePhoneCore = SAMPLE_PERSON.phone.replace(/^254/, "");

  // Account numbers first — they may CONTAIN the phone, and must be rewritten
  // whole before the phone rule gets a chance to half-rewrite them.
  const phoneCores = [...h.phones].map((p) => p.replace(/^254/, "").replace(/^0/, "")).filter((c) => c.length >= 9);
  for (const acc of [...h.accountNumbers].sort((a, b) => b.length - a.length)) {
    let fake: string;
    const core = phoneCores.find((c) => acc.includes(c));
    if (core) {
      // Keep the lender's structure — phone then date — so the sample reads true.
      fake = acc.replace(`254${core}`, SAMPLE_PERSON.phone).replace(`0${core}`, `0${fakePhoneCore}`).replace(core, fakePhoneCore);
    } else {
      fake = reshape(acc);
    }
    out.push({ find: new RegExp(escapeRe(acc), "g"), replace: fake });
  }

  for (const p of h.phones) {
    for (const form of phoneForms(p)) {
      const fake = form.startsWith("254") ? SAMPLE_PERSON.phone : form.startsWith("0") ? `0${fakePhoneCore}` : fakePhoneCore;
      out.push({ find: new RegExp(escapeRe(form), "g"), replace: fake });
    }
  }
  for (const id of h.idNumbers) out.push({ find: new RegExp(`\\b${escapeRe(id)}\\b`, "g"), replace: SAMPLE_PERSON.idNumber });
  for (const s of h.serials) out.push({ find: new RegExp(escapeRe(s), "g"), replace: SAMPLE_PERSON.serial });
  for (const d of h.dates) out.push({ find: new RegExp(escapeRe(d), "g"), replace: SAMPLE_PERSON.dateOfBirth });
  for (const e of h.emails) out.push({ find: new RegExp(escapeRe(e), "gi"), replace: SAMPLE_PERSON.email });
  for (const t of h.trxIds) out.push({ find: new RegExp(escapeRe(t), "g"), replace: fakeUuid(t) });
  for (const r of h.references) out.push({ find: new RegExp(escapeRe(r), "g"), replace: reshape(r) });
  for (const ip of h.ips) out.push({ find: new RegExp(escapeRe(ip), "g"), replace: "0.0.0.0" });
  for (const e of h.employers) out.push({ find: new RegExp(escapeRe(e), "gi"), replace: SAMPLE_PERSON.employer });

  [...h.places].forEach((place, i) => {
    out.push({ find: new RegExp(`\\b${escapeRe(place)}\\b`, "gi"), replace: SAMPLE_PERSON.towns[i % SAMPLE_PERSON.towns.length] });
  });

  // Name tokens, case-preserving: DANIEL → AMANI, Daniel → Amani.
  const tokens = [...h.nameTokens].sort((a, b) => b.length - a.length);
  // Each part of the real name becomes the SAME part of the sample name, so a
  // first name stays a first name and the document reads the right way round.
  // Tokens seen only in name lists take whichever sample parts are left.
  const fakeFor = new Map<string, string>();
  for (const t of tokens) {
    const base = t.replace(/'/g, "");
    const role = h.nameRoles.get(base);
    if (role !== undefined && !fakeFor.has(base)) fakeFor.set(base, SAMPLE_PERSON.names[role]);
  }
  const spare = SAMPLE_PERSON.names.filter((x) => ![...fakeFor.values()].includes(x));
  let n = 0;
  for (const t of tokens) {
    const base = t.replace(/'/g, "");
    if (!fakeFor.has(base)) {
      const pool = spare.length ? spare : SAMPLE_PERSON.names;
      fakeFor.set(base, pool[n++ % pool.length]);
    }
  }
  for (const t of tokens) {
    const fake = fakeFor.get(t.replace(/'/g, ""))!;
    // Letters with an optional apostrophe between any two, so M'ERIA, MERIA and
    // M&#39;ERIA are one name to this rule.
    const pattern = t
      .replace(/'/g, "")
      .split("")
      .map(escapeRe)
      .join("(?:'|&#39;|’)?");
    out.push({
      find: new RegExp(`(?<![A-Za-z])${pattern}(?![A-Za-z])`, "gi"),
      replace: (m: string) =>
        m === m.toUpperCase() ? fake : m === m.toLowerCase() ? fake.toLowerCase() : fake[0] + fake.slice(1).toLowerCase(),
    });
  }
  return out;
}

export function anonymiseText(text: string, h: Harvest): string {
  let out = text;
  for (const r of rules(h)) out = out.replace(r.find, r.replace as never);
  return out;
}

/**
 * Fields a sample never carries, whatever they hold. A registry answer can come
 * back with a photograph, a signature, a fingerprint or a tax PIN; on the file
 * this was built from they were null, but a rule that only works on the file it
 * was tested on is not a rule. Keys are kept, so the shape stays true.
 */
const ALWAYS_BLANK = new Set([
  "photo", "photo_from_passport", "signature", "fingerprint", "pin", "passport_number", "place_of_birth",
  "place_of_live", "place_of_death", "reg_office", "regoffice", "clan", "family", "ethnic_group", "occupation",
  "date_of_issue", "date_of_expiry",
]);

function blank(v: Json): Json {
  if (Array.isArray(v)) return v.map(blank);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ALWAYS_BLANK.has(k) && x !== null ? null : blank(x)]));
  }
  return v;
}

/** Anonymise a payload: blank the never-carried fields, then rewrite every harvested value. */
export function anonymisePayload<T extends Json>(payload: T, h: Harvest): T {
  return JSON.parse(anonymiseText(JSON.stringify(blank(payload)), h)) as T;
}

export type Leak = { what: string; value: string; where: string };

/** Every harvested value, as the needles a scan looks for. */
function needles(h: Harvest): { what: string; value: string; re: RegExp }[] {
  const list: { what: string; value: string; re: RegExp }[] = [];
  const add = (what: string, value: string, re?: RegExp) => list.push({ what, value, re: re ?? new RegExp(escapeRe(value), "i") });
  h.idNumbers.forEach((v) => add("national ID", v, new RegExp(`\\b${escapeRe(v)}\\b`)));
  h.phones.forEach((p) => phoneForms(p).forEach((f) => add("phone", f)));
  h.emails.forEach((v) => add("email", v));
  h.dates.forEach((v) => add("date of birth", v));
  h.serials.forEach((v) => add("ID serial", v));
  h.accountNumbers.forEach((v) => add("account number", v));
  h.trxIds.forEach((v) => add("transaction id", v));
  h.references.forEach((v) => add("bureau reference", v));
  h.employers.forEach((v) => add("employer", v));
  h.places.forEach((v) => add("place", v, new RegExp(`(?<![A-Za-z])${escapeRe(v)}(?![A-Za-z])`, "i")));
  h.nameTokens.forEach((t) => {
    const pattern = t.replace(/'/g, "").split("").map(escapeRe).join("(?:'|&#39;|’)?");
    add("name", t, new RegExp(`(?<![A-Za-z])${pattern}(?![A-Za-z])`, "i"));
  });
  return list;
}

/** Scan an output for any harvested value. Binary files are scanned as latin1. */
export function scan(where: string, content: string | Buffer, h: Harvest): Leak[] {
  const text = typeof content === "string" ? content : content.toString("latin1");
  return needles(h)
    .filter((n) => n.re.test(text))
    .map((n) => ({ what: n.what, value: n.value, where }));
}
