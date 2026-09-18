// ─────────────────────────────────────────────────────────────────────────────
// THE NOTICES — what every document says about where its data came from.
//
// Two of these are the bureau's own words and are reproduced EXACTLY, spelling,
// capitals and spacing included, because a lender comparing our document with
// the bureau's must find the same regulatory text in the same place. Do not
// "tidy" them. The third is the Interchange's own statement of what it is and
// is not, drafted for counsel's review.
//
// The founder's instruction (17 Sep 2026): the Interchange notice does not name
// the bureau subscriber. The bureau is named; the contract holder is not.
// ─────────────────────────────────────────────────────────────────────────────

/** Printed at the top of page one of any document that carries bureau data. Verbatim. */
export const REGULATION_40_NOTICE =
  "Disclaimer: According to the Banking (Credit Reference Bureau Regulations, 2020 Regulation 40 (1), A customer's " +
  "credit score shall not be used solely to deny the customer a loan, credit facility, or any other financial " +
  "service. However, it shall be used as one of the factors to inform the decision-making when determining the " +
  "customer's application for a loan, credit facility, or any other financial service.";

/** The bureau's closing disclaimer. Verbatim, as a list of its own lines. */
export const BUREAU_DISCLAIMER_LINES = [
  "The information provided in this report is for the purposes of decision making as stipulated in the Banking (Credit Reference Bureau) Regulations, 2020 only.",
  "It is not in any way METROPOL CREDIT REFERENCE BUREAU's opinion of the financial capability, solvency, integrity or intentions of any persons mentioned herein.",
  "It therefore cannot be used to inform any level of decision making, positive or adverse, on any and all persons mentioned herein, whether regarding current or potential credit lines.",
  "All parties given access to this information are bound to keep any and all information,whether intentionally or accidentally accessed, strictly confidential.",
  "METROPOL CREDIT REFERENCE BUREAU does not warrant or guarantee any use of the information contained herein.",
];

export const BUREAU_NAME = "Metropol Credit Reference Bureau";

/** The Interchange's statement of its role on a document carrying bureau data. Draft for counsel. */
export const INTERCHANGE_BUREAU_NOTICE =
  "The credit information in this document was supplied by Metropol Credit Reference Bureau, a credit reference " +
  "bureau licensed by the Central Bank of Kenya. The Interchange did not create, alter or verify that information. " +
  "The Interchange is a technology intermediary: it is not a credit reference bureau and it gives no credit opinion. " +
  "It retrieves the bureau's response, keeps it unchanged (the original response and its SHA-256 fingerprint are " +
  "held under the reference on this document), and presents it in a form a lending decision can use. Where this " +
  "document shows totals, orderings, charts or flags, they are marked as the Interchange's reading of the bureau's " +
  "data and are not the bureau's statement. Questions or disputes about the underlying data must be raised with " +
  "Metropol Credit Reference Bureau, which holds the record. This document is confidential to the requesting " +
  "organisation and may be used only for the purposes permitted by the Banking (Credit Reference Bureau) Regulations, 2020.";

/** The same statement for documents built only from member books. */
export const INTERCHANGE_ECOSYSTEM_NOTICE =
  "This document was assembled by the Interchange from the published books of its contributing members, at the " +
  "moment shown, under the consent referenced above. Figures are aggregates: no member's customer list, loan " +
  "identifier or exact balance crossed to the requesting organisation. A member that did not answer in time is " +
  "named as silent, and an answer with silent members is a floor, not a total. The Interchange is a technology " +
  "intermediary and gives no credit opinion. This document is confidential to the requesting organisation.";

/** For documents read from an M-PESA statement the requesting organisation supplied. */
export const INTERCHANGE_STATEMENT_NOTICE =
  "This document was produced by the Interchange from an M-PESA statement supplied by the requesting organisation, " +
  "with the account holder's consent referenced above. The statement file and its password were processed in memory " +
  "and not retained; the file's SHA-256 fingerprint is recorded under this document's reference so the analysis can be " +
  "matched to the statement it was read from. Every figure is the Interchange's reading of the transactions in that " +
  "statement. It is not a statement by Safaricom, and it is not a credit reference bureau report. The Interchange gives " +
  "no credit opinion. This document is confidential to the requesting organisation.";

/** Marked on every page of an anonymised sample. */
export const SAMPLE_NOTICE =
  "SAMPLE. Built from a real bureau response with every identifying detail replaced: name, national ID, phone, " +
  "date of birth, addresses, ID serial, account numbers and transaction references. Amounts, dates, statuses and " +
  "scores are as the bureau returned them. This document describes no real person.";

/** Marked on a sample read from a synthetic statement rather than a real response. */
export const SYNTHETIC_SAMPLE_NOTICE =
  "SAMPLE. Built by running the production statement engine over a synthetic M-PESA statement. The transactions " +
  "were written for the demonstration and describe no real person; every figure computed from them is the engine's real output.";
