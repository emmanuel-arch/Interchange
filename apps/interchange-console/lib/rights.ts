// ─────────────────────────────────────────────────────────────────────────────
// The rights catalogue.
//
// ONE LIST, and every gate reads it. The console nav, the proxy, the route
// handlers and the operator CLI all derive from this file, so a right cannot
// exist in a menu and be missing from the check that menu leads to — which is
// the failure mode that produces a door opening onto a 403, or worse, a door
// that opens onto data.
//
// Naming is `surface:verb`. Surfaces match the console routes so the mapping
// from "what can I see" to "what may I do" needs no lookup table.
//
// WILDCARD. `*` is a real, storable right and it means every right in this
// file, including ones added after the grant was made. That is deliberate for
// the platform operator — a super admin whose powers silently fail to include
// next sprint's surface is a super admin who files a bug every release. It is
// also why `*` is refused on any role except SUPER_ADMIN (see lib/operator.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const WILDCARD = "*" as const;

/** Every right the Interchange knows about, grouped by console surface. */
export const RIGHTS = {
  // Directory — who the members are
  "directory:read": "See the member directory",
  "directory:admin": "Edit member records and provenance",

  // Exposure — the brokered fan-out
  "exposure:query": "Run an exposure check across members",
  "exposure:read": "See exposure results and history",

  // Consent — the gate everything else depends on
  "consent:read": "See consent records and their events",
  "consent:capture": "Capture a consent on a borrower's behalf",
  "consent:revoke": "Revoke a consent",

  // Audit — who asked what
  "audit:read": "Read the audit trail",
  "audit:export": "Export audit evidence",

  // Score — the decision surface
  "score:read": "See scores and their feature vectors",
  "score:run": "Run a score against a subject token",

  // Learning — Plane B
  "learning:read": "See model performance and drift",
  "learning:train": "Trigger training and promote a model",

  // Message log — the hash chain
  "log:read": "Read the message log",
  "log:verify": "Re-verify the hash chain and timestamps",

  // Governance — admission and suspension
  "governance:read": "See governance actions and applications",
  "governance:decide": "Admit, reject, suspend or reinstate a member",

  // Registry administration
  "member:onboard": "Onboard a new member and register its key",
  "member:suspend": "Suspend or reinstate a member",
  "member:key:rotate": "Rotate a member's signing key",

  // Platform — the things only BirgenAI does
  "operator:manage": "Create, disable and re-code operators",
  "oprf:rotate": "Rotate the ecosystem OPRF key",
  "registry:admin": "Unrestricted Registry administration",
} as const;

export type Right = keyof typeof RIGHTS;

export const ALL_RIGHTS = Object.keys(RIGHTS) as Right[];

/** Is this string a right this build knows about? */
export function isRight(value: string): value is Right {
  return Object.prototype.hasOwnProperty.call(RIGHTS, value);
}

// ── Role defaults ────────────────────────────────────────────────────────────
//
// What a role grants BEFORE any per-operator additions. Kept deliberately tight:
// the wildcard is the only way to hold everything, and only one role may hold it.

export const ROLE_RIGHTS: Record<string, readonly string[]> = {
  SUPER_ADMIN: [WILDCARD],

  MEMBER_ADMIN: [
    "directory:read",
    "exposure:query",
    "exposure:read",
    "consent:read",
    "consent:capture",
    "consent:revoke",
    "audit:read",
    "audit:export",
    "score:read",
    "score:run",
    "learning:read",
    "log:read",
    "log:verify",
    "governance:read",
    "member:key:rotate",
    "operator:manage",
  ],

  ANALYST: [
    "directory:read",
    "exposure:query",
    "exposure:read",
    "consent:read",
    "consent:capture",
    "audit:read",
    "score:read",
    "score:run",
    "learning:read",
    "log:read",
    "governance:read",
  ],

  AUDITOR: [
    "directory:read",
    "consent:read",
    "audit:read",
    "audit:export",
    "log:read",
    "log:verify",
    "governance:read",
  ],
};

/**
 * The full set an operator effectively holds: role defaults ∪ explicit grants.
 *
 * Returns `["*"]` unexpanded when the wildcard is present. Callers must go
 * through `can()` rather than testing membership themselves, or the wildcard
 * silently stops working.
 */
export function effectiveRights(role: string, granted: readonly string[] = []): string[] {
  const base = ROLE_RIGHTS[role] ?? [];
  const set = new Set<string>([...base, ...granted]);
  if (set.has(WILDCARD)) return [WILDCARD];
  return [...set].sort();
}

/** Does this set of rights admit `right`? The one place the wildcard is honoured. */
export function can(rights: readonly string[] | undefined, right: Right | string): boolean {
  if (!rights || rights.length === 0) return false;
  if (rights.includes(WILDCARD)) return true;
  return rights.includes(right);
}

/** Expand a right set for DISPLAY — the wildcard becomes the concrete list. */
export function expandForDisplay(rights: readonly string[]): Right[] {
  return rights.includes(WILDCARD) ? [...ALL_RIGHTS] : (rights.filter(isRight) as Right[]);
}

// ── Route → right ────────────────────────────────────────────────────────────
//
// Read by proxy.ts and by the console layout, so a nav item and the page it
// points at can never disagree about who may open it.

export const ROUTE_RIGHTS: Record<string, Right> = {
  "/directory": "directory:read",
  "/exposure": "exposure:read",
  "/consent": "consent:read",
  "/audit": "audit:read",
  "/score": "score:read",
  "/learning": "learning:read",
  "/log": "log:read",
  "/governance": "governance:read",
};

/** The right that admits a pathname, or null when the path is not gated. */
export function rightForPath(pathname: string): Right | null {
  for (const [prefix, right] of Object.entries(ROUTE_RIGHTS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return right;
  }
  return null;
}
