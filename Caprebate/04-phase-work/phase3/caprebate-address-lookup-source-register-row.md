# The address lookup — its source register row, from the supplier's own terms

**Written 12 September 2026 by Phase 129.** This is the research behind the task "Address lookup has no source-register entry — no publisher, no licence, no cache window for the one field every other lookup is matched on", and behind the question **"Who publishes the address lookup's data, under what licence, and how long may we keep it?"**

## The supplier

Homedata was chosen as the address supplier on 26 August 2026 (recorded then as: free tier of 100 lookups a month, £49 a month for the Starter plan; AddressBase rejected because it retires in 2027). No Homedata account has been opened.

## What was read, and when

Every page below was read on **12 September 2026**.

| Page | What it is |
| --- | --- |
| https://homedata.co.uk/terms | Terms of Service, marked "Last updated: November 2024" |
| https://homedata.co.uk/about | Where the data comes from |
| https://homedata.co.uk/docs/pricing | Token weights and the licensing behind them |
| https://homedata.co.uk/docs/endpoints | What the address search returns |
| https://homedata.co.uk/address-lookup-api | The address lookup product page |
| https://homedata.co.uk/pricing | Plans, and the coverage answer |
| https://homedata.co.uk/data/postcode | A second coverage answer |
| https://homedata.co.uk/privacy | Retention of the customer's own personal data |

## What the supplier publishes

- **Who publishes the underlying data.** Ordnance Survey and Royal Mail. The about page says the data is "Sourced from HM Land Registry, MHCLG EPC Register, OS AddressBase, Environment Agency, ONS, Home.co.uk". The pricing documentation says "Address endpoints carry Royal Mail PAF / Ordnance Survey licensing". The endpoint documentation calls the property identifier "a public OS AddressBase id".
- **What licence binds us.** Only the Terms of Service. Clause 7 says the data is "owned by Homedata or our licensors" and grants "a limited, non-exclusive licence to use the data in accordance with your subscription plan". The about page adds, in general terms, "Licensed under Open Government Licence and commercial agreements".
- **Whether we may pass it on.** Clause 4 says we may not "Resell or redistribute our data without authorisation".
- **How far it can be trusted.** Clause 6 says the data is "provided 'as is'", with no promise that it is accurate, complete or current.
- **Law and exit.** Clause 11: the law of England and Wales. Clause 10: either side may end the agreement on 30 days' notice. Clause 13 gives the legal contact as legal@homedata.co.uk.
- **What one lookup uses.** A search costs 2 tokens and the full address costs 5, so a find-then-retrieve lookup costs 7 tokens — **7p**, at "100 tokens = £1". _(Corrected 17 September 2026, Phase 133: this said the free plan carries 100 tokens a month, about fourteen lookups, and Starter is £49 a month for 4,500 tokens. Homedata's pricing page, read on 17 September 2026, is pay as you go: no plans, no subscription, no free monthly allowance, tokens that never expire, and a matched first top-up.)_

## What the supplier does not publish

Each of these is recorded as **NOT PUBLISHED**. None has been guessed.

1. **A cache window.** Nothing on any page says how long a returned address or identifier may be kept before it has to be looked up again. The privacy policy's retention clause covers the customer's own personal data, not the property data.
2. **Attribution wording.** No page gives a line that a report must print. The usual Royal Mail and Ordnance Survey copyright lines have deliberately not been assumed.
3. **A licence name.** There is none beyond the Terms of Service themselves, and no end-user terms from Royal Mail or Ordnance Survey are published.
4. **Permission to reproduce the data in a client report, an accountant's pack or an HMRC submission.** Only the general ban in clause 4 is published.

**Coverage is published two ways.** The pricing page says "Currently England and Wales only", with Scotland "on the roadmap". The postcode page says the service covers England, Wales and Scotland. The decisions note says Homedata covers Scottish addresses, and that should not be relied on until the supplier confirms it.

## The register row

| Field | Value | Where it comes from |
| --- | --- | --- |
| Source | Homedata address lookup: identifier, address line, postcode | the engine's own address source, which names exactly these three fields |
| Publisher | Homedata (supplier); underlying data Ordnance Survey AddressBase and Royal Mail PAF | about page; pricing documentation |
| Licence | Homedata Terms of Service (November 2024): limited, non-exclusive, under the subscription plan. No licence name published | Terms, clause 7 |
| Attribution | **NOT PUBLISHED** | — |
| Cache window | **NOT PUBLISHED.** Held as **0 days** until stated: an address is stale as soon as it is kept, and must be fetched again before it drives anything. This is our refusal, not the supplier's figure | — |
| Client report / accountant pack / HMRC pack | **No / No / No** until the supplier authorises it | Terms, clause 4 |
| Internal use | Yes | Terms, clause 7 |
| Best grade | B, because the data is supplied "as is" | Terms, clause 6 |
| Needs solicitor or DPO review | Yes | — |

**Why 0 days, and why not blank.** In the register, a blank cache window means "no limit". Leaving it blank would state an unpublished fact in the direction that helps us. Zero is the one setting that cannot make a claim bigger or keep a value longer than the supplier might allow.

## What waits, and on whom

The row can be written today, and it is ready as a tested change to the register. **The four unpublished facts need one email to the supplier, sent when the account is opened.** That makes this a question for Lakhbir, not a build.

**One thing to weigh first.** Lakhbir's answer under the Homedata cost question says his previous company never used Homedata: it took the address from the customer and matched it against Companies House and other public sources. He also agreed with building the front of the funnel on a plain typed postcode and address. If the address lookup is not used at launch, the gap closes with a note that it is not used, and nobody needs to email the supplier.

### Draft email to the supplier — NOT SENT

> **To:** legal@homedata.co.uk
> **Subject:** Address data — licence, attribution and retention before we go live
>
> We are about to use your address find and retrieve endpoints in a UK capital allowances service. Your Terms of Service (November 2024) and your documentation say the address data carries Royal Mail PAF and Ordnance Survey AddressBase licensing. Before we build on it, could you confirm four things in writing:
>
> 1. How long may we keep a returned address and UPRN on a client's file before we must look it up again? Is there a limit at all?
> 2. Is there attribution wording, for example Royal Mail or Ordnance Survey copyright lines, that must appear wherever the data is shown? If so, what is the exact text?
> 3. Clause 4 prohibits redistribution without authorisation. May a single property's address and UPRN appear in (a) a report we give our client, (b) a pack we give our client's accountant, and (c) a capital allowances submission to HMRC?
> 4. Do any Royal Mail or Ordnance Survey end-user terms pass through to us? If so, could you send them?
>
> Could you also confirm whether Scottish addresses are covered? Your pricing page and your postcode page answer this differently.

---

_Written by Phase 129 (Claude), 12 September 2026. The tested changes to `caprebate-source-register.ts`, its test file, and the back end's sources panel were handed to the lead as a set, because the back end reads that register._
