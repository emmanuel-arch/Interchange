# Founding cohort — assessment of the shared `.198` book

Source: `FOUNDIN_MEMBERS.xlsx`, pulled 21 Aug 2026 from
`213.148.17.198,4420 / Serviceconnect`. Excel serial dates converted against the
1899-12-30 epoch; "age" is days before 21 Aug 2026.

**Qualification rule:** a member must be *live* (disbursed within 30 days) **and**
*at scale* (≥ 1,000 loans). Live matters because a dormant book contributes
nothing to exposure — the launch product answers "is this borrower borrowing
right now", and a book that stopped lending in 2024 cannot answer it.

## Qualifying — 10 entities

| Entity | Borrowers | Loans | Last disbursed |
|---|---:|---:|---|
| NJB | 13,533 | 31,775 | today |
| Buy Simu | 11,867 | 13,989 | today |
| ATICO AFRICA | 3,272 | 7,109 | today |
| RIFT PLAN MICROENTERPRISES | 1,711 | 3,277 | today |
| VILISHA ENT LIMITED | 2,175 | 3,132 | today |
| Gemstar Ltd | 1,547 | 2,649 | today |
| Brideway Ltd | 1,362 | 1,779 | 13 days |
| Rolab Ventures Ltd | 426 | 1,775 | today |
| Tanzu Microfinance | 1,006 | 1,651 | yesterday |
| truways Company Ltd | 811 | 1,494 | 2 days |

## Live but sub-scale — revisit at month 6

RELIEVER INSURANCE AGENCY (836 loans), BizPoa (710), GD Light Solar (564),
NANONEST (257), IFTIN SOLAR LIGHT (120), ONWARDS SWIFT (5). All disbursing
within the last five days. They are real lenders, just small — worth admitting
once onboarding is self-service, because their queries cost us nothing and their
contribution still widens coverage.

## Dormant, but valuable for a different reason

| Entity | Loans | Last disbursed |
|---|---:|---|
| FOURSIGHT CAPITAL | 2,191 | 223 days |
| Zuerst Africa | 1,440 | 659 days |
| Alygath Microenterprises | 1,325 | 613 days |

These contribute **nothing to live exposure** and should not be counted as
founding members. They are, however, ~5,000 closed loans with known outcomes —
exactly the labelled history the scoring models need, and free of the immaturity
problem that affects a live book. Treat them as a **training-data contribution**
with a separate agreement, not as exchange members.

## Scale at launch

| | Borrowers | Loans |
|---|---:|---:|
| `.198` shared book (25 entities, all states) | 43,423 | 76,838 |
| Micromart (`services`, entities 3002 + 3005) | 158,081 | 334,292 |
| **Combined** | **~201,000** | **~411,000** |

Micromart alone is roughly 3.6× the entire `.198` server by borrower count, so
it remains the anchor member — but the ten qualifying entities are what turn
this from one lender's data into an ecosystem. An exposure check against
Micromart alone answers almost nothing; against eleven live books it answers the
question lenders actually have.

## Still to confirm

1. **Axe Capital** sits on `213.148.17.54`, not `.198` — assess separately.
2. **NJB** is the largest book on `.198` and was not on the original founding
   list. Worth understanding who they are before approaching.
3. Whether the `.198` entities are separate legal entities or trading names
   under one licence — that changes the consent and membership paperwork
   substantially, and it is not answerable from the database.
