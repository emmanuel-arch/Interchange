// ─────────────────────────────────────────────────────────────────────────────
// THE LENDER GLOSSARY — who, on a Kenyan M-PESA statement, is a lender.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// A statement does not say "loan". It says:
//
//   Pay Bill Fuliza M-Pesa to 4145907 - MULAR CREDIT LIMITED Acc. 7981717
//
// A keyword cruncher reads that as a merchant payment and files KES 37,367
// under "where they spend", beside the supermarket. It is not spending. It is
// debt service to a Central Bank of Kenya licensed digital credit provider, and
// it is the single most decision-relevant row on the page. Getting it wrong
// does not make the report slightly less good — it makes the affordability
// number wrong in the direction that approves a loan that should be declined.
//
// So counterparties are matched against the actual REGISTERS, not against a
// hand-written list of the lenders somebody happened to remember:
//
//   · CBK Directory of Digital Credit Providers, April 2026 (227 licensees)
//     plus the 25 licensed in July 2026 — the market total is 252.
//   · CBK Directory of Licensed Commercial Banks and Mortgage Finance
//     Institutions.
//   · CBK Directory of Licensed Microfinance Banks (14).
//   · SASRA's deposit-taking SACCOs (the largest by book; the generic SACCO
//     pattern catches the rest).
//
// ── THREE WAYS TO RECOGNISE A LENDER, IN ORDER OF HOW MUCH WE TRUST THEM ─────
//   1. SHORT CODE. An M-PESA paybill or B2C shortcode is issued to one
//      business. When the number matches, the name does not have to.
//   2. REGISTERED NAME. Normalised to a core (legal suffixes, country words
//      and branch numbers stripped) and matched whole-word, so "CHICKEN
//      DELIGHT- DONHOLM" never collides with "d.light".
//   3. LEGAL-FORM PATTERN. "<something> CREDIT LIMITED" is a credit provider
//      whether or not we have heard of it. This is where CARAYAN CAPITAL
//      LIMITED lands — and a counterparty that looks like a lender but is on
//      no register is itself worth printing, because a borrower servicing an
//      unlicensed lender is a different risk from one servicing Watu.
//
// Every match carries its method and its evidence, because a report that says
// "this is a lender" has to be able to answer "says who".
// ─────────────────────────────────────────────────────────────────────────────

export type LenderCategory =
  /** CBK-licensed commercial bank or mortgage finance institution. */
  | "bank"
  /** CBK-licensed microfinance bank (deposit-taking). */
  | "mfb"
  /** CBK-licensed digital credit provider / non-deposit-taking credit provider. */
  | "dcp"
  /** SASRA-regulated deposit-taking SACCO, or a SACCO by name. */
  | "sacco"
  /** Credit-only microfinance institution, not CBK-licensed. */
  | "mfi"
  /** Asset finance and pay-as-you-go: the loan is a motorbike, a phone, a solar kit. */
  | "asset"
  /** A credit product on the mobile-money rail itself. */
  | "mno"
  /** Moves money for other businesses. Not a lender — named so it is not mistaken for one. */
  | "aggregator"
  /**
   * Asset managers, money-market funds and unit trusts.
   *
   * These are here only to be EXCLUDED. "Nabo Capital Ltd" and "Cytonn Money
   * Market Fund" both trip the "CAPITAL" legal-form pattern, and a first run of
   * this engine duly reported a borrower as servicing an unregistered lender
   * when they were in fact saving. Money going to a fund is the OPPOSITE signal
   * from money going to a lender, so reading it backwards is worse than not
   * reading the row at all.
   */
  | "fund";

/**
 * What a CREDIT into the wallet from this counterparty means.
 *
 * The distinction is not pedantic. Money arriving from Getcash Capital is a
 * loan being drawn. Money arriving from "Equity Bulk Account" is a salary, a
 * supplier settlement, an insurance payout or a loan, and the statement does
 * not say which. Calling the second one borrowing would invent a debt; calling
 * it income would invent a salary. It gets its own bucket and is named.
 */
export type B2cMeaning = "loan" | "mixed" | "not-credit";

export type LenderEntry = {
  key: string;
  /** The name on the register. */
  name: string;
  /** What appears on a statement, when that differs from the registered name. */
  brand?: string;
  category: LenderCategory;
  regulator: "CBK" | "SASRA" | "none";
  /** Which register, and as of when. */
  register: string;
  /** M-PESA paybill / till / B2C shortcodes known to belong to this institution. */
  codes?: string[];
  /** Extra spellings seen on real statements. Normalised like everything else. */
  aliases?: string[];
  b2c?: B2cMeaning;
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISATION
//
// Statement text is not clean. The same institution arrives as "Spectrum credit
// limited", "SPECTRUM CREDIT LIMITED B2C" and "Spectrum Credit Ltd". Branch and
// terminal numbers are appended ("ONFON MOBILE LIMITED 2", "TWILIGHT SOIREE
// LIMITED14"). So both sides of every comparison are reduced to a CORE: upper
// case, punctuation to spaces, legal and geographic noise removed, trailing
// digits dropped.
//
// What is NOT removed: "CREDIT", "CAPITAL", "FINANCE", "BANK", "SACCO". Those
// are the words that carry the meaning, and stripping them would make every
// credit company normalise to nothing.
// ─────────────────────────────────────────────────────────────────────────────

const NOISE = new Set([
  "LIMITED", "LTD", "PLC", "COMPANY", "CO", "INC", "INCORPORATED", "GROUP",
  "HOLDINGS", "KENYA", "KE", "EA", "EAST", "AFRICA", "AFRIKA", "INTERNATIONAL",
  "PAYBILL", "B2C", "C2B", "HQ", "ACC", "ACCOUNT", "THE", "AND", "OF",
]);

/** Upper case, punctuation to space, collapse. Keeps every meaningful word. */
export function normaliseName(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The comparable core: noise words out, trailing branch digits out. */
export function coreName(raw: string): string {
  const words = normaliseName(raw)
    .split(" ")
    .filter(Boolean)
    // A trailing or standalone number is a branch, a till or a terminal, never
    // part of the institution's identity: "ONFON MOBILE LIMITED 2".
    .filter((w) => !/^\d+$/.test(w))
    // "TWILIGHT SOIREE LIMITED14" — digits fused to the last word.
    .map((w) => w.replace(/\d+$/, ""))
    .filter((w) => w.length > 0 && !NOISE.has(w));
  return words.join(" ");
}

/** Is `needle` present in `haystack` as a whole-word run? */
function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const h = ` ${haystack} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTER
//
// Compact tuples rather than object literals: at 300 institutions the object
// form is four times the bytes and no clearer. Order inside a group is the
// register's own order.
// ─────────────────────────────────────────────────────────────────────────────

type Tuple = [name: string, codes?: string, aliases?: string, brand?: string];

function group(
  rows: Tuple[],
  category: LenderCategory,
  regulator: LenderEntry["regulator"],
  register: string,
  b2c: B2cMeaning,
): LenderEntry[] {
  return rows.map(([name, codes, aliases, brand]) => ({
    key: coreName(name).toLowerCase().replace(/ /g, "-") || name.toLowerCase(),
    name,
    brand,
    category,
    regulator,
    register,
    codes: codes ? codes.split(" ").filter(Boolean) : undefined,
    aliases: aliases ? aliases.split("|").map((a) => a.trim()).filter(Boolean) : undefined,
    b2c,
  }));
}

const BANK_REGISTER = "CBK Directory of Licensed Commercial Banks and Mortgage Finance Institutions";
const MFB_REGISTER = "CBK Directory of Licensed Microfinance Banks";
const DCP_REGISTER = "CBK Directory of Digital Credit Providers, April 2026";
const DCP_REGISTER_JUL = "CBK press release, licensing of Digital Credit Providers, July 2026";
const SACCO_REGISTER = "SASRA regulated deposit-taking SACCOs";

/**
 * Commercial banks and the mortgage finance institution.
 *
 * `b2c: "mixed"` throughout, deliberately. A bank's bulk-payment shortcode
 * carries payroll, supplier settlements, insurance claims, dividends AND loan
 * disbursements through the same pipe. Two of Kenya's largest employers pay
 * salaries through "Equity Bulk Account". Treating that credit as borrowing
 * would manufacture a debt the borrower does not have.
 */
const BANKS = group(
  [
    ["Absa Bank Kenya PLC", "303030 300068 300067", "ABSA|BARCLAYS|TIMIZA|ABSA TIMIZA"],
    ["Access Bank (Kenya) PLC", "862862", "ACCESS BANK"],
    ["African Banking Corporation Ltd", "111777", "ABC BANK"],
    ["Bank of Africa Kenya Ltd", "972900", "BANK OF AFRICA|BOA KENYA"],
    ["Bank of Baroda (Kenya) Ltd", "990303", "BANK OF BARODA"],
    ["Bank of India", "", "BANK OF INDIA"],
    ["Citibank N.A. Kenya", "", "CITIBANK|CITI"],
    ["Commercial International Bank Kenya Ltd", "447900", "CIB KENYA|MAYFAIR CIB|MAYFAIR BANK"],
    ["Consolidated Bank of Kenya Ltd", "508400", "CONSOLIDATED BANK"],
    ["Co-operative Bank of Kenya Ltd", "400200 400300 149444", "CO OPERATIVE BANK|COOP BANK|CO OP BANK|COOPERATIVE BANK|CO OPERATIVE BANK MONEY TRANSFER"],
    ["Credit Bank PLC", "972700", "CREDIT BANK"],
    ["Development Bank of Kenya Ltd", "", "DEVELOPMENT BANK"],
    ["Diamond Trust Bank Kenya Ltd", "516600 516601", "DTB|DIAMOND TRUST|DTB TOUCH"],
    ["DIB Bank Kenya Ltd", "", "DIB BANK|DUBAI ISLAMIC"],
    ["Ecobank Kenya Ltd", "700201", "ECOBANK"],
    ["Equity Bank Kenya Limited", "247247 247263 300600", "EQUITY|EQUITY BANK|EQUITY PAYBILL|EQUITY BULK|EQUITY BULK ACCOUNT|EAZZY|EAZZY LOAN"],
    ["Family Bank Ltd", "222111", "FAMILY BANK|PESA PAP|FAMILY BANK PESA PAP"],
    ["Guaranty Trust Bank (Kenya) Ltd", "910200", "GTBANK|GT BANK|GUARANTY TRUST"],
    ["Guardian Bank Ltd", "344500", "GUARDIAN BANK"],
    ["Gulf African Bank Ltd", "985050", "GULF AFRICAN"],
    ["Habib Bank AG Zurich", "570425", "HABIB BANK"],
    ["I&M Bank Ltd", "542542", "I M BANK|IM BANK|I AND M BANK|IM BANK C2B"],
    ["KCB Bank Kenya Limited", "522522 522533 522559 501901", "KCB|KCB PAYBILL|LIPA NA KCB|KCB M PESA|KCB MPESA|KCB 1"],
    ["Kingdom Bank Ltd", "529901 529914", "KINGDOM BANK|KINGDOM BANK ALTERNATE PAYBILL"],
    ["Middle East Bank (Kenya) Ltd", "", "MIDDLE EAST BANK"],
    ["M Oriental Bank Ltd", "", "M ORIENTAL|ORIENTAL BANK"],
    ["National Bank of Kenya Ltd", "625625 547700", "NBK|NATIONAL BANK"],
    ["NCBA Bank Kenya PLC", "880100", "NCBA|NIC BANK|CBA|COMMERCIAL BANK ARICA"],
    ["Paramount Bank Ltd", "", "PARAMOUNT BANK"],
    ["Premier Bank Kenya Ltd", "919700", "PREMIER BANK"],
    ["Prime Bank Ltd", "982800", "PRIME BANK"],
    ["SBM Bank Kenya Ltd", "552800", "SBM BANK"],
    ["Sidian Bank Ltd", "111999", "SIDIAN|SIDIAN BANK MONEY TRANSFER"],
    ["Spire Bank Ltd", "", "SPIRE BANK"],
    ["Stanbic Bank Kenya Ltd", "600100 8022127", "STANBIC|STANBIC BANK KENYA B2C"],
    ["Standard Chartered Bank Kenya Ltd", "329329 329299", "STANCHART|STANDARD CHARTERED"],
    ["United Bank for Africa Kenya Ltd", "559900", "UBA|UBA KENYA"],
    ["Victoria Commercial Bank PLC", "", "VICTORIA COMMERCIAL"],
    ["Housing Finance Company of Kenya Ltd", "100400", "HFC|HF GROUP|HOUSING FINANCE"],
    ["Kenya Post Office Savings Bank", "200999", "POSTBANK|POST BANK"],
  ],
  "bank",
  "CBK",
  BANK_REGISTER,
  "mixed",
);

const MFBS = group(
  [
    ["Caritas Microfinance Bank Ltd", "248700"],
    ["Branch Microfinance Bank Ltd", "998608", "BRANCH|BRANCH INTERNATIONAL"],
    ["Choice Microfinance Bank Ltd"],
    ["Daraja Microfinance Bank Ltd"],
    ["Faulu Microfinance Bank Ltd", "328585", "FAULU"],
    ["Kenya Women Microfinance Bank PLC", "101200", "KWFT|KENYA WOMEN FINANCE TRUST"],
    ["Rafiki Microfinance Bank Ltd", "802200", "RAFIKI"],
    ["LOLC Kenya Microfinance Bank PLC", "", "LOLC"],
    ["SMEP Microfinance Bank Ltd", "777001", "SMEP"],
    ["Sumac Microfinance Bank Ltd", "", "SUMAC"],
    ["U & I Microfinance Bank Ltd", "", "U AND I MICROFINANCE|UI MICROFINANCE"],
    ["Salaam Microfinance Bank Ltd", "", "SALAAM"],
    ["On It Microfinance Bank Ltd", "", "ON IT MICROFINANCE"],
    ["Muungano Microfinance Bank PLC", "", "MUUNGANO"],
    ["Century Microfinance Bank Ltd", "888600", "CENTURY MICROFINANCE"],
  ],
  "mfb",
  "CBK",
  MFB_REGISTER,
  "loan",
);

/**
 * The CBK Directory of Digital Credit Providers, April 2026 — all 227.
 *
 * This is the register that matters most on a Kenyan statement: it is where
 * the borrower's other instalments actually go. Kept in the directory's own
 * alphabetical order so it can be diffed against the next publication.
 */
const DCPS = group(
  [
    ["Abepot Credit Limited"], ["Abito Limited"], ["Absolute Credit Kenya Ltd"],
    ["Acquire Credit Limited"], ["Adjacent Possible Finance Limited"], ["Adroit Credit Limited"],
    ["African Capital Limited"], ["Afrimoney Credit Limited"], ["Ajax Credit Kenya Limited"],
    ["Aleza Limited"], ["Amaze Credit Limited"], ["Ambush Capital Limited"],
    ["Anjoy Credit Limited"], ["ASA International Kenya Limited"], ["Asante FS East Africa Limited", "", "ASANTE FS|ASANTE FINANCIAL"],
    ["Asap Credit Limited"], ["Aspire Lending Ltd"], ["Autochek Limited"],
    ["Auxiliary Credit Ltd"], ["Avenews Ke Ltd"], ["Aventus Technology Limited"],
    ["AVL Capital Ltd"], ["Azura Credit Limited"], ["Baecot Credit Ltd"],
    ["BCF Kenya Limited"], ["Beavers Credit Limited"], ["Becalob Credit Limited"],
    ["Betasoft Credit Limited"], ["Bidii Credit Limited"], ["Bimas Kenya Limited", "", "BIMAS"],
    ["Bingwa Micro Capital Limited"], ["Blesmark Credit Limited"], ["Bluewave Cash Limited"],
    ["Boostline Capital Limited"], ["Bossrich Credit Limited"], ["BRAC Kenya Company Limited", "", "BRAC"],
    ["Brisk Credit Limited", "4106969 4106933"], ["Bytech Credit Limited"], ["Cashmart Capital Limited"],
    ["Ceres Tech Limited"], ["Chapeo Capital Limited"], ["Chelete Credit Limited"],
    ["Chime Capital Limited"], ["Colkos Enterprises Limited"], ["Creditarea Capital Limited"],
    ["Dahawi Credit Limited"], ["Decimal Capital Limited"], ["Dexintec Kenya Limited"],
    ["Dime Credit Limited"], ["Dotcash Credit Limited"], ["East Africa Futures Company Limited"],
    ["Easy Asset Management Limited"], ["Easyways Credit Limited"], ["ED Partners Africa Limited"],
    ["Edenbridge Capital Ltd"], ["EDOMX Limited"], ["Elevate Credit Limited"],
    ["Ellegant Credit Limited"], ["Extend Money Services Limited"], ["Fabilo Credit Ltd"],
    ["Factorhouse Limited"], ["Fahari Point Capital Limited"], ["Fantom Capital Limited"],
    ["Fezotech Kenya Limited"], ["Finberry Capital Ltd"], ["Finboom Credit Kenya Limited"],
    ["Fincorp Credit Limited"], ["Fincredit Limited"], ["Finseil Limited"],
    ["Fluid Capital Limited"], ["Fortune Credit Limited"], ["Fourth Generation Capital Limited", "", "4G CAPITAL|FOURTH GENERATION"],
    ["Frictionless Enterprises Limited"], ["Futureinno Digital Tech Limited"], ["Geoland Credit Limited"],
    ["Getcash Capital Limited", "635232 3039499", "GETCASH|GOLD COIN CAPITAL GETCASH CAPITAL|GOLD COIN CAPITAL"],
    ["Giando Africa Limited"], ["Girls First Kenya Limited"], ["Granary Capital Limited"],
    ["Guava Capital Limited"], ["Hakki Africa Limited"], ["Hanis Capital Limited"],
    ["Hela Capital Limited"], ["Helium Credit Limited"], ["Iboda Credit Limited"],
    ["Inkomoko Capital Kenya Ltd"], ["Insight Credit Limited"], ["Inspire Credit Limited"],
    ["Inventure Mobile Limited", "851900", "TALA|INVENTURE", "Tala"],
    ["Ismuk Credit Limited"], ["Izwe Loans Kenya Ltd", "", "IZWE"],
    ["Jackfruit Associates Limited"], ["Jafari Credit Limited"], ["Jambofin Credit Limited"],
    ["Jawabu Biashara Limited"], ["Jefigs Credit Limited"], ["Jijenge Credit Limited"],
    ["Juhudi Kilimo Company Limited", "513900", "JUHUDI KILIMO"],
    ["Jumo Kenya Limited", "", "JUMO"], ["Karibu Credit Limited"],
    ["Kechita Capital Investment Ltd"], ["Keep Vision and Growth Credit Ltd"], ["Kifedha Ltd"],
    ["Kikwetu Credit Ltd"], ["Kopo Kopo Inc. Kenya Ltd", "", "KOPO KOPO"],
    ["Kweli Smart Solutions Limited"], ["Lasiri Capital Limited"], ["Leaf Credit Limited"],
    ["Leja Ltd"], ["Lendara Credit Limited"], ["Lendbucks Ltd"],
    ["Lenana Innovative Solutions Ltd"], ["Letshego Kenya Ltd", "", "LETSHEGO"],
    ["Liberty Afrika Technologies Ltd"], ["Lipa Later Limited", "865050", "LIPA LATER"],
    ["Little Limited"], ["Little Pesa Limited"], ["Loan Plus Digital Credit Provider"],
    ["Lobelitec Credit Limited"], ["LockBx Limited"], ["Longitude Capital Limited"],
    ["Lucason Capital Limited"], ["Maison Capital Limited", "4015471"],
    ["Malicash Investment Limited"], ["Maralal Ledger Limited"], ["Marble Capital Solutions Limited"],
    ["Maxxton Enterprises Ltd"], ["Mayflower Capital Limited"], ["MCF 2 Kenya Limited"],
    ["Mednow Capital Limited"], ["MFS Technologies Limited", "", "MFS TECHNOLOGIES"],
    ["Milhan Access Capital Limited"], ["Mimi Credit Limited"], ["Mint Credit Limited"],
    ["MKash Solutions Limited"], ["MKM Capital Limited"],
    ["M-Kopa Loan Kenya Limited", "333222", "M KOPA|MKOPA|M KOPA KENYA", "M-KOPA"],
    ["Mkulimapay Credit Ltd"], ["Modesty Credit Ltd"],
    ["Mogo Auto Limited", "7034211", "MOGO|MOGO AUTO|MOGO KENYA"],
    ["Momentum Credit Limited", "", "MOMENTUM CREDIT"],
    ["Moneza Ltd"], ["Moto Hope Capital Limited"],
    ["Mular Credit Limited", "4145907", "MULAR|MULAR CREDIT"],
    ["Musoni Capital Limited", "514000", "MUSONI|MUSONI MICROFINANCE"],
    ["Mwananchi Credit Ltd", "", "MWANANCHI CREDIT"],
    ["Mwanzo Credit Limited"], ["Mycredit Limited"], ["MyWagepay Limited"],
    ["Natal Tech Limited"], ["Nawiri African Sprouts Ltd"], ["Newark Frontiers Limited"],
    ["Ngao Credit Limited", "", "NGAO CREDIT"], ["NJB Limited"],
    ["Novatok Credit Limited"], ["Numida Technologies Kenya Ltd", "", "NUMIDA"],
    ["ODI Credit Limited"], ["Okolea International Limited", "", "OKOLEA"],
    ["Onwards Swift Company Limited"], ["Opal Quick Limited"], ["Otas Credit Limited"],
    ["Pato Capital Limited"], ["Payablu Credit Limited"], ["Pembeni Cash Ltd"],
    ["Pesaglow Capital Limited"], ["Pesakuu Credit Limited"], ["Peshee Capital Limited"],
    ["Pezesha Africa Limited", "", "PEZESHA"], ["Phoenix Capital Limited"],
    ["Pi Capital Limited"], ["Platinum Credit Limited", "", "PLATINUM CREDIT"],
    ["Premier Credit Limited", "", "PREMIER CREDIT"], ["Primebridge Capital Limited"],
    ["Progressive Credit Limited"], ["Puphik Credit Limited"], ["Quickflex Ventures Ltd"],
    ["Radi Credit Limited"], ["Real People Kenya Limited", "", "REAL PEOPLE"],
    ["Reazilla DCP Limited"], ["Rewot Ciro Limited"], ["Risine Credit Limited"],
    ["Rosatap Credit Limited"], ["Rosky Credit Limited"], ["Seanala Credit Limited"],
    ["Select Management Services Ltd", "", "SELECT MANAGEMENT|SELECT MANAGEMENT SERVICES"],
    ["Senti Capital Limited"], ["Sevi Innovation Limited"], ["Simbageld Ltd"],
    ["Simplepay Capital Limited"], ["Sipranda Capital Ltd"], ["Siti Mobility Technologies Ltd"],
    ["Snowflex Capital Limited"], ["Sokohela Limited"],
    ["Spectrum Credit Ltd", "4008053", "SPECTRUM CREDIT"],
    ["Spread Capital Ltd"], ["Steadfast Credit Ltd"], ["Stride Credit Limited"],
    ["Suffice Ltd"], ["Sumpay Limited"], ["Sure Cred Capital Limited"],
    ["Tanir Credit & Accounting Serv."], ["Tazu Credit Limited"], ["Tenakata Enterprises Limited"],
    ["Tentacorp Holdings Limited"], ["Tinycost Credit Kenya Limited"], ["Tip-Point Capital Limited"],
    ["Transsnet Credit Limited"], ["Treasure Store Limited"], ["TrustGro SCA Limited"],
    ["Tundar Capital Limited"], ["UbaPesa Limited"],
    ["Umoja Fanisi Limited", "3037683", "UMOJA FANISI|UMOJA FANISI DONHOLM"],
    ["Unidirect Ltd"], ["Unifi Credit Limited", "", "UNIFI|UNIFI CREDIT"],
    ["Vision Edge Credit Partners"], ["Wabema Credit Ltd"], ["Wakanda Credit Limited"],
    ["Watu Credit Ltd", "650880", "WATU|WATU CREDIT|WATU CREDIT PAYBILL"],
    ["Westlip Credit Limited"], ["Wiresphere Limited"], ["Yehu Impact Limited", "606303", "YEHU|YEHU MICROFINANCE"],
    ["Zaidi Pato Limited"], ["Zamaradi Capital & Credit Group"], ["Zanifu Limited", "", "ZANIFU"],
    ["Zenka Digital Limited", "979988", "ZENKA|ZENKA FINANCE"],
    ["Ziki Credit Limited"], ["Zillions Credit Limited"],
  ],
  "dcp",
  "CBK",
  DCP_REGISTER,
  "loan",
);

/** The 25 licensed in July 2026, which took the register to 252. */
const DCPS_JULY = group(
  [
    ["Baraka Credit Limited"], ["Bashy African Credit Limited"],
    ["Centenary Micro Enterprise Services Ltd"], ["Equal Reach Credit Limited"],
    ["Eversure Credit Limited"], ["Glad Agritech Kenya Limited"], ["Hawkins Credit Limited"],
    ["Jiweze Credit Limited"], ["KalTris Limited"], ["KN Global Services Limited"],
    ["Lin-Cap Limited"], ["Nirvana Credit Limited"], ["Onward Digital Company Limited"],
    ["Pesakay Credit Limited"], ["Rapidcash Ventures Limited"], ["Rukisha Solutions Limited"],
    ["Signature Capital Limited"], ["Solvezy Technology Kenya Limited"], ["Statim Capital Limited"],
    ["Stemtide Credit Limited"], ["Stepwise Credit Limited"], ["Transventures Capital Limited"],
    ["Trinmarc Ventures Limited"],
  ],
  "dcp",
  "CBK",
  DCP_REGISTER_JUL,
  "loan",
);

/**
 * Pay-as-you-go and asset finance.
 *
 * Every one of these is a loan wearing the clothes of a purchase: the borrower
 * has a motorbike, a phone, a solar kit or a gas cylinder, and a daily or
 * weekly instalment against it. A cruncher that files d.light under "utilities"
 * misses a committed daily payment, which is precisely the commitment that
 * competes with a new instalment.
 *
 * Several also hold a DCP licence; the entry here is what a statement shows.
 */
const ASSET = group(
  [
    ["d.light Kenya Limited", "215550", "D LIGHT|DLIGHT|D LIGHT KENYA|D LIGHT DESIGN", "d.light"],
    ["Sun King Kenya", "323458", "SUN KING|GREENLIGHT PLANET|SUNKING"],
    // Device and solar financing on a daily instalment. One statement read
    // here shows 98 payments against a single account reference, 57 of them at
    // exactly KES 100 — a repayment schedule, not shopping. Onfon MEDIA (622645)
    // is the same group's bulk-SMS business and is deliberately NOT listed: it
    // sells messages, not credit.
    ["Onfon Mobile Limited", "4191500 4104151 5482450", "ONFON MOBILE"],
    ["Solar Panda Kenya", "999090", "SOLAR PANDA"],
    ["Angaza / PayGo asset financier", "", "PAYGO|PAY AS YOU GO"],
  ],
  "asset",
  "CBK",
  "Asset finance and pay-as-you-go providers, several also on the CBK DCP register",
  "loan",
);

/**
 * Credit on the mobile-money rail itself.
 *
 * Fuliza is not a lender in the register sense — it is Safaricom's overdraft,
 * funded by NCBA and KCB — but on a statement it behaves exactly like one and
 * it is usually the largest single credit relationship on the page.
 */
const MNO = group(
  [
    ["Fuliza M-PESA overdraft", "232323", "FULIZA|M PESA OVERDRAW|MPESA OVERDRAW|OVERDRAFT OF CREDIT PARTY|OD LOAN"],
    ["M-Shwari (NCBA)", "", "M SHWARI|MSHWARI"],
    ["KCB M-PESA", "522559 501901", "KCB M PESA|KCB MPESA"],
    ["Hustler Fund", "", "HUSTLER FUND|FINANCIAL INCLUSION FUND"],
  ],
  "mno",
  "CBK",
  "Mobile-money credit products, funded by CBK-licensed banks",
  "loan",
);

/** The largest deposit-taking SACCOs. The generic pattern catches the rest. */
const SACCOS = group(
  [
    ["Stima DT Sacco", "0240240"], ["Mwalimu National Sacco", "541900"],
    ["Harambee Sacco", "525200"], ["Kenya Police Sacco", "4027903"],
    ["Unaitas Sacco", "544700"], ["Tower Sacco", "885885"],
    ["Imarisha Sacco", "982100"], ["Hazina Sacco", "850436"],
    ["Kenya Bankers Sacco", "400444"], ["Boresha Sacco", "545500 058115", "BORESHA SACCO SOCIETY"],
    ["Chai Sacco", "544200"], ["Kimisitu Sacco", "911200"],
    ["Taifa Sacco", "930642"], ["Nawiri Sacco", "505368"],
    ["Daima Sacco", "874950"], ["Sheria Sacco", "964700"],
    ["Kenya Defence Forces Sacco", "907116"], ["Gusii Mwalimu Sacco", "283052"],
    ["Magadi Sacco", "974100"], ["Apstar Sacco", "953400"],
    ["Biashara Sacco", "400300"], ["Wakulima Commercial Sacco", "7082099"],
    ["The Noble Sacco", "208600 208599"],
  ],
  "sacco",
  "SASRA",
  SACCO_REGISTER,
  "mixed",
);

/**
 * Not lenders. Registered so the matcher can say so out loud.
 *
 * "DIRECT PAY 05" is a collection shortcode operated on behalf of whoever
 * contracted it. The counterparty behind it is not on the statement, and the
 * honest output is "aggregator, beneficiary not disclosed" — not a guess.
 */
const FUNDS = group(
  [
    ["Nabo Capital Ltd", "4072221 4072222", "NABO CAPITAL|NABO"],
    ["Cytonn Asset Managers", "", "CYTONN|CYTONN MONEY MARKET|CYTONN MONEY MARKET FUND"],
    ["Britam Asset Managers", "", "BRITAM ASSET|BRITAM MONEY MARKET"],
    ["ICEA LION Asset Management", "", "ICEA LION ASSET|ICEA LION MONEY MARKET"],
    ["Sanlam Investments East Africa", "", "SANLAM INVESTMENTS|SANLAM MONEY MARKET"],
    ["CIC Asset Management", "", "CIC ASSET|CIC MONEY MARKET"],
    ["Old Mutual Investment Group", "600500", "OLD MUTUAL UNIT TRUST|OLD MUTUAL INVESTMENT"],
    ["Zimele Asset Management", "", "ZIMELE"],
    ["Genghis Capital", "", "GENGHIS|GENGHIS CAPITAL|NDOVU"],
    ["Lofty-Corban Investments", "", "LOFTY CORBAN"],
    ["Etica Capital", "", "ETICA CAPITAL"],
    ["Madison Investment Managers", "", "MADISON INVESTMENT"],
    ["Jubilee Asset Management", "", "JUBILEE ASSET"],
    ["Ziidi Money Market Fund", "", "ZIIDI"],
    ["Mali Money Market Fund", "", "MALI MONEY MARKET"],
  ],
  "fund",
  "none",
  "Capital Markets Authority licensed fund managers and collective investment schemes",
  "not-credit",
);

const AGGREGATORS = group(
  [
    ["Direct Pay Limited", "4187665 4187657 4187658 4187660", "DIRECT PAY"],
    ["Pesapal", "220220", "PESAPAL"],
    ["Kopo Kopo collection", "", "KOPO KOPO"],
    ["Cellulant / Tingg", "", "CELLULANT|TINGG"],
    ["IntaSend", "", "INTASEND"],
    ["Jambopay", "", "JAMBOPAY"],
  ],
  "aggregator",
  "none",
  "Payment service providers — money movers, not credit providers",
  "not-credit",
);

export const LENDER_REGISTRY: LenderEntry[] = [
  // FUNDS first: a name that trips both a fund alias and a "capital" pattern
  // must resolve to the fund. Order in this array is match precedence.
  ...FUNDS, ...MNO, ...BANKS, ...MFBS, ...DCPS, ...DCPS_JULY, ...ASSET, ...SACCOS, ...AGGREGATORS,
];

export const REGISTRY_STATS = {
  total: LENDER_REGISTRY.length,
  banks: BANKS.length,
  microfinanceBanks: MFBS.length,
  digitalCreditProviders: DCPS.length + DCPS_JULY.length,
  assetFinance: ASSET.length,
  saccos: SACCOS.length,
  mobileMoneyCredit: MNO.length,
  aggregators: AGGREGATORS.length,
  fundManagers: FUNDS.length,
  /** What the glossary was built from, printed in the report's method appendix. */
  sources: [
    DCP_REGISTER,
    DCP_REGISTER_JUL,
    BANK_REGISTER,
    MFB_REGISTER,
    SACCO_REGISTER,
  ],
  compiledOn: "2026-09-18",
} as const;

// ── Indexes, built once ──────────────────────────────────────────────────────

const BY_CODE = new Map<string, LenderEntry>();
const BY_CORE = new Map<string, LenderEntry>();
/** Cores long enough to be safe to look for INSIDE a longer counterparty name. */
const CONTAINABLE: { core: string; entry: LenderEntry }[] = [];

for (const e of LENDER_REGISTRY) {
  for (const c of e.codes ?? []) if (!BY_CODE.has(c)) BY_CODE.set(c, e);
  const cores = new Set<string>([coreName(e.name)]);
  if (e.brand) cores.add(coreName(e.brand));
  for (const a of e.aliases ?? []) cores.add(coreName(a));
  for (const core of cores) {
    if (!core) continue;
    if (!BY_CORE.has(core)) BY_CORE.set(core, e);
    // One short word ("LEJA", "ALEZA", "SUFFICE") is too collidable to hunt for
    // inside someone's shop name. Two words, or one long one, is safe.
    const words = core.split(" ");
    if (words.length >= 2 || core.length >= 7) CONTAINABLE.push({ core, entry: e });
  }
}
// Longest first, so "GOLD COIN CAPITAL GETCASH CAPITAL" resolves to the most
// specific registered name rather than the first one that happens to fit.
CONTAINABLE.sort((a, b) => b.core.length - a.core.length);

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL-FORM PATTERNS
//
// A counterparty that is not on any register can still be, unmistakably, a
// credit provider. "CARAYAN CAPITAL LIMITED" takes KES 2,323 a fortnight from
// a borrower's wallet. Whether CBK has licensed it is a separate and very
// interesting question — one this file answers by saying "unregistered".
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS: { re: RegExp; category: LenderCategory; why: string }[] = [
  { re: /\bMICROFINANCE\b/, category: "mfb", why: "name contains MICROFINANCE" },
  { re: /\bSACCO\b|\bSACCOS\b|SAVINGS AND CREDIT/, category: "sacco", why: "name contains SACCO" },
  { re: /\bCREDIT\b(?!\s+(?:REFERENCE|BUREAU|CARD|UNION\s+OF\s+SCHOOLS))/, category: "dcp", why: "name contains CREDIT" },
  { re: /\bLOANS?\b|\bLENDING\b|\bLENDERS?\b/, category: "dcp", why: "name contains LOAN or LENDING" },
  { re: /\bCAPITAL\b/, category: "dcp", why: "name contains CAPITAL" },
  { re: /\bFINANCE\b|\bFINANCIAL\b|\bFINANCIERS?\b/, category: "dcp", why: "name contains FINANCE" },
  { re: /ASSET FINANC|\bLEASING\b|\bHIRE PURCHASE\b|\bLOGBOOK\b/, category: "asset", why: "name describes asset finance" },
  { re: /\bBANK\b(?!\s*(?:HOLIDAY|NOTE))/, category: "bank", why: "name contains BANK" },
];

/**
 * Words that make a "CAPITAL"/"FINANCE" hit meaningless. Nairobi is full of
 * "CAPITAL GRILL" and "FINANCE HOUSE CANTEEN", and a food bill misfiled as a
 * loan instalment is the same error as a loan misfiled as a food bill.
 */
const NOT_A_LENDER = /\b(MONEY\s+MARKET|UNIT\s+TRUST|ASSET\s+MANAG|INVESTMENT\s+GROUP|MUTUAL\s+FUND|GRILL|RESTAURANT|HOTEL|BAR|LOUNGE|CLUB|PUB|BUTCHERY|SUPERMARKET|MINIMART|PHARMACY|CHEMIST|HOSPITAL|CLINIC|SCHOOL|COLLEGE|UNIVERSITY|ACADEMY|CHURCH|MINISTRIES|SACCO\s+SHOP|SALON|BARBER|HARDWARE|AGROVET|BOUTIQUE|FRIES|PIZZA|CAFE|EATERY|LIQUOR|WINES|SPIRITS|MARKET|GARDENS|RESORT|LODGE|APARTMENTS|FUNERAL|MEDIA|MOBILE\s+LIMITED\s+SHOP)\b/;

// ─────────────────────────────────────────────────────────────────────────────
// THE MATCHER
// ─────────────────────────────────────────────────────────────────────────────

export type MatchMethod = "shortcode" | "registered-name" | "name-contains" | "legal-form" | "none";

export type LenderMatch = {
  /** Null when the counterparty is not credit-related at all. */
  entry: LenderEntry | null;
  /** The display name to print. The register's name when known, else what the statement said. */
  name: string;
  category: LenderCategory | null;
  method: MatchMethod;
  /** 0–1. Shortcodes are certain; legal-form patterns are a reading. */
  confidence: number;
  /** Human sentence: why this counterparty was called a lender. Printed in the report. */
  evidence: string;
  /** True when it looks like a credit provider but appears on no register we hold. */
  unregistered: boolean;
};

const NO_MATCH: LenderMatch = {
  entry: null, name: "", category: null, method: "none",
  confidence: 0, evidence: "", unregistered: false,
};

/**
 * Identify a counterparty.
 *
 * @param name  The counterparty as the statement wrote it.
 * @param code  The paybill / till / B2C shortcode, when the row carried one.
 */
export function matchLender(name: string, code?: string | null): LenderMatch {
  const clean = String(name ?? "").trim();

  // 1 — the shortcode. One number, one business.
  if (code) {
    const hit = BY_CODE.get(String(code).trim());
    if (hit) {
      return {
        entry: hit,
        name: hit.brand ?? hit.name,
        category: hit.category,
        method: "shortcode",
        confidence: 1,
        evidence: `M-PESA shortcode ${code} is registered to ${hit.name}${hit.regulator !== "none" ? ` (${hit.regulator}: ${hit.register})` : ""}.`,
        unregistered: false,
      };
    }
  }

  if (!clean) return NO_MATCH;
  const core = coreName(clean);
  if (!core) return NO_MATCH;
  const flat = normaliseName(clean);

  // 2 — the registered name, exactly.
  const exact = BY_CORE.get(core);
  if (exact) {
    return {
      entry: exact,
      name: exact.brand ?? exact.name,
      category: exact.category,
      method: "registered-name",
      confidence: 0.98,
      evidence: `"${clean}" matches ${exact.name} on the ${exact.register}.`,
      unregistered: false,
    };
  }

  // 3 — a registered name inside a longer one. "GOLD COIN CAPITAL- GETCASH
  //     CAPITAL" is Getcash Capital Limited trading under a second name.
  for (const { core: c, entry } of CONTAINABLE) {
    if (containsWords(core, c)) {
      return {
        entry,
        name: entry.brand ?? entry.name,
        category: entry.category,
        method: "name-contains",
        confidence: 0.9,
        evidence: `"${clean}" contains the registered name ${entry.name} (${entry.register}).`,
        unregistered: false,
      };
    }
  }

  // 4 — the legal form. Not on a register, but unmistakably a credit business.
  if (!NOT_A_LENDER.test(flat)) {
    for (const p of PATTERNS) {
      if (!p.re.test(flat)) continue;
      return {
        entry: null,
        name: titleCase(clean),
        category: p.category,
        method: "legal-form",
        // A pattern is a reading, and it is labelled as one everywhere it shows.
        confidence: p.category === "bank" || p.category === "sacco" ? 0.7 : 0.6,
        evidence: `"${clean}" is not on any register held here, but its ${p.why} — treated as a credit provider and flagged as unregistered.`,
        unregistered: true,
      };
    }
  }

  return NO_MATCH;
}

/** True when this counterparty is a credit provider, at any confidence. */
export function isLender(m: LenderMatch): boolean {
  return m.category !== null && m.category !== "aggregator" && m.category !== "fund";
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bLtd\b/g, "Ltd")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** For the report's method appendix: what the glossary knows, in one line each. */
export function registryDigest(): { category: LenderCategory; count: number; regulator: string; register: string }[] {
  const by = new Map<string, { category: LenderCategory; count: number; regulator: string; register: string }>();
  for (const e of LENDER_REGISTRY) {
    const k = `${e.category}|${e.register}`;
    const row = by.get(k) ?? { category: e.category, count: 0, regulator: e.regulator, register: e.register };
    row.count += 1;
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}
