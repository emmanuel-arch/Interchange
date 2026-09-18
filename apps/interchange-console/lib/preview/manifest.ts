// The preview gallery's index, written by scripts/build-preview.ts after the
// leak scan passes. Imported rather than read at request time, so the public
// pages render statically and work on a deployment with no database at all.
import raw from "@/public/preview/manifest.json";
import crunchMeta from "@/public/preview/crunch/meta.json";

export type PreviewFile = { path: string; bytes: number; sha256: string; pages?: number };

export type PreviewProduct = {
  type: number;
  name: string;
  answers: string;
  contains: string[];
  entitled: boolean;
  status: "captured" | "section" | "needs_pull" | "described" | "refused";
  sectionOf?: number;
  capture?: "wire" | "unwrapped";
  reference?: string;
  reportDate?: string;
  contentDigest?: string;
  accounts?: number;
  note?: string;
  files?: Partial<Record<"html" | "json" | "bureau" | "csv" | "pdf" | "thumb", PreviewFile>>;
};

export type PreviewManifest = {
  generatedAt: string;
  person: { name: string; idNumber: string };
  requestedBy: { person: string; organisation: string; memberCode: string };
  leakScan: { files: number; leaks: number };
  products: PreviewProduct[];
};

export const PREVIEW = raw as unknown as PreviewManifest;

export const previewByType = (type: number) => PREVIEW.products.find((p) => p.type === type) ?? null;
export const previewByReference = (ref: string) => PREVIEW.products.find((p) => p.reference === ref) ?? null;

export const STATUS_LABEL: Record<PreviewProduct["status"], string> = {
  captured: "Real response, anonymised",
  section: "Section of a real response",
  needs_pull: "Needs one capture",
  described: "Bureau's own document",
  refused: "Not in contract",
};

export const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The crunch demo document, which is a sample built from a synthetic statement. */
export const CRUNCH_SAMPLE = crunchMeta as { reference: string; reportDate: string; contentDigest: string; synthetic: true };
