# CIBSE plant lives — its source register row, from the publisher's own terms

**Written 24 September 2026 by Phase 147.** This is the research behind the board item "CIBSE plant lives", and behind the Word question **"Should we get CIBSE's plant life tables, and ask CIBSE for permission to use them in client reports?"** The comment of 12 September 2026 on "Map equipment lives to our fixture list" ended "There is still no task for the CIBSE terms". Nobody owned the source until now.

## What it would feed, and what stays off

The cost model has an empty table, `CB_CIBSE_PLANT_LIVES` (`04-phase-work/phase9/caprebate-cost-model.cjs`). It would hold the expected life, in years, of each item of plant. Two switches read it, and both are off:

- **per-element depreciation** (LEG-E5): each item's age against its expected life, then a Valuation Office obsolescence scale;
- **the crosswalk completeness gate** (ATP-F-3): before any item is priced, check that every item our fixture list can produce has a life in the table.

**The table stays empty and both switches stay off.** This write-up records the terms. It loads no data.

**One ruling comes first, and it may make all of this unnecessary.** Per-element depreciation applies a whole-*building* obsolescence scale to each *plant item* over a CIBSE life. That hybrid is our own idea, and nobody has said it is sound. It is question (a) of the depreciation entry in FOR THE SURVEYOR: *"May a whole-building obsolescence scale be applied per plant element at all?"* If the surveyor says no, per-element depreciation does not ship, the whole-building method is used, and **a whole building has no CIBSE plant life**, so these tables are not needed at all.

## The publisher

The Chartered Institution of Building Services Engineers (CIBSE). The plant lives are in **Guide M**, *Maintenance engineering and management*, third edition, September 2023, which is split into modules. Module **M11, Life cycle** carries them.

## What was read, and when

Read on **24 September 2026**. That morning the live site answered HTTP 503 and then "HTTP Error 500.30 - ASP.NET Core app failed to start", so CIBSE's own pages were read as the Internet Archive captured them. The capture dates are given below. Nothing was taken from a third party's copy of the tables.

| Page | What it is | Captured |
| --- | --- | --- |
| cibse.org/knowledge-research/knowledge-portal/indicative-economic-life-expectancy-tool-2026/ | The life tables themselves | 15 June 2026 |
| cibse.org/knowledge-research/knowledge-portal/guide-m11-life-expectancy-2023/ | Guide M11, the module the tables belong to | 11 June 2026 |
| cibse.org/knowledge-research/knowledge-faqs/ | What a download may be used for | 6 July 2026 |
| cibse.org/about-cibse/terms-and-conditions/ | Copyright and database right | 7 July 2026 |
| thenbs.com, CIBSE document 327938 | Status of the 2020 tables | read live |
| cibsejournal.com, "Maintaining performance: new CIBSE Guide M" | The 2023 edition and the tool | read live |

## What CIBSE publishes

- **The tables.** "Indicative Economic Life Expectancy (2026)", published **June 2026**, 40 pages. It is a zip holding Guide M11 Appendix 11.A1 (the economic life expectancy tables, PDF), Appendix 11.A2 (worked examples, PDF) and an Excel tool that holds the tables and applies nine adjustment factors. **Standard rate FREE, member rate FREE.**
- **What a life is.** A "Reference Service Life" in years, broken down to the smallest item that is maintained, and lined up with the RICS New Rules of Measurement 3 and the SFG20 maintenance codes. CIBSE says healthcare-specific assets appear for the first time. Each life is meant to be adjusted by the nine factors for the actual installation.
- **The older tables are withdrawn.** The January 2020 supplement (Appendix 12.A1 of Guide M 2014) is listed by NBS as withdrawn and replaced by the 2026 files. Anything we have read from the 2014 or 2020 tables is out of date.
- **The guide.** "Guide M11 Life cycle (2023)", September 2023, 22 pages, ISBN 9781914543746. PDF **£20.00 + VAT** at the standard rate and **free to members**. Book £25.00 + VAT, or £12.50 + VAT to members.
- **What the download notice grants.** The publication is "supplied by CIBSE for the sole use of the person making the download".
- **What the FAQs say.** Downloaded files "are for the use of the downloader only. They may not be duplicated or circulated in any form for use by others, for re-sale or for any other purpose." Reproducing CIBSE content "in a text for sale" is allowed "for a cost, and only with our permission", through PLSclear. Use in a presentation or thesis is free only "if circulation is limited and you will not be charging for it".
- **What the terms say.** CIBSE material is protected by the Copyright, Designs and Patents Act 1988 **and the Copyright and Rights in Databases Regulations 1997**, so the tables are a database, and not only a text. Written requests for permission go to the Head of Knowledge.

## What CIBSE does not publish

Each of these is held as **NOT PUBLISHED**. None has been guessed.

1. **Whether a report a client pays for is "a text for sale".** We treat it as one.
2. **Whether using a life in a calculation, without printing the table, counts as reproduction.** We treat it as reproduction. The tables are a database, and a year figure taken from one row is taken from it.
3. **Whether a table loaded into a system several staff use is "circulated for use by others".** We treat it as circulation. So even internal use is refused until CIBSE says otherwise. This is stricter than the BCIS entry, and on purpose: BCIS sells a subscription for business use, while CIBSE's only published grant is to one person.
4. **What PLSclear charges.** It quotes each request. No price is published.
5. **Attribution wording.** None is published.
6. **How long a loaded edition may be relied on.** None is published. We hold it as 0 days, which is our refusal, not their figure.
7. **The "CIBSE copyright" section of the Fair Use Policy page**, which the terms point to. **Not read**: the live site was down and the page is not archived. It may answer 1 to 3. It has to be read before anything is bought or asked.

## The register row

Written into `caprebate-source-register.ts` as the licence `CIBSE_KNOWLEDGE`, and tested by T-CB1 to T-CB3 in `caprebate-source-register.test.ts`.

| Field | Value | Where it comes from |
| --- | --- | --- |
| Licence | CIBSE Knowledge Portal terms: for the sole use of the downloader. **No business or resale licence published** | download notice; FAQs |
| Publisher | CIBSE | — |
| Attribution | **NOT PUBLISHED** | — |
| Cache window | **NOT PUBLISHED.** Held as **0 days**: this is our refusal, not CIBSE's figure | — |
| Client report / accountant pack / HMRC pack | **No / No / No** until CIBSE grants permission | FAQs: "for a cost, and only with our permission" |
| Internal use | **No**, until CIBSE confirms a business may use it | FAQs: "for the use of the downloader only" |
| Needs solicitor or DPO review | Yes | — |
| Source row | **None yet, on purpose** | see below |

**Why no source row yet.** In this register every outside source is a lookup that the research panel lists and a member of staff fires, and it needs a price tier and an on/off switch. CIBSE's tables are neither. They are a reference table, loaded once, under a licence we do not hold. The source row is written with the loader, if the table is ever loaded. Until then no fact can be recorded as coming from CIBSE at all (T-CB3).

**Why every refusal and not a blank.** In the register a blank cache window means "no limit", and an open channel means "allowed". Either would state something CIBSE has not said, and in the direction that helps us. A refusal can only keep a figure out of a report. It can never put one in.

## What waits, and on whom

**Nothing here is blocked on money.** The tables are free, and the guide is £20 + VAT (£24) or free to a member. What stands in the way is the permission, and a ruling that comes before it:

1. **The surveyor's ruling**: may a whole-building obsolescence scale be applied per plant element at all? It is in FOR THE SURVEYOR. **Ask it first.** A "no" ends this, and nobody needs to download or ask anything.
2. **Lakhbir's decision**: whether to download the tables and ask CIBSE for permission. It is the Word question above, with the price and the licence in it.
3. **The solicitor or DPO**: to read CIBSE's reply, and the Fair Use Policy page, against the three points CIBSE does not publish.

### Draft permission request to CIBSE — NOT SENT

> **To:** the Head of Knowledge, CIBSE (enquiries@cibse.org), or through PLSclear
> **Subject:** Using Guide M11 economic life expectancy tables in paid capital allowances reports
>
> We are a UK capital allowances business. We would like to use the reference service lives in Guide M11 Appendix 11.A1 (June 2026) as one input when we value plant in healthcare buildings. Could you confirm, in writing:
>
> 1. May a company use the tables across its staff, or only the person who downloaded them? Is there an organisation licence, and at what price?
> 2. If a life in years is used in a calculation, and the table is not printed, is that reproduction that needs permission?
> 3. May the life used for an item, with CIBSE named as its source, appear in a report we give our client, in a pack for their accountant, and in a claim sent to HMRC? At what price?
> 4. What attribution wording must appear wherever a life is shown?
> 5. How should we treat a new edition? Must we move to it, and by when?

---

_Written by Phase 147 (Claude), 24 September 2026. The licence entry and its three tests are in `caprebate-source-register.ts` and its test file. `CB_CIBSE_PLANT_LIVES` stays empty and the crosswalk completeness gate stays off, both already pinned by the cost model's tests A2 and J1._
