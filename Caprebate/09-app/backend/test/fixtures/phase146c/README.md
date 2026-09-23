# Phase 146c — recorded answers for the free register connectors

Every file here is an answer shaped from the supplier's own published documentation, read on 23 September 2026
(the pages are listed in `SUPPLIER_DOCS` in `04-phase-work/phase3/caprebate-source-register.ts`). The values are
INVENTED: `ZZ` postcodes, `INVENTED` ids, made-up names. No file here was fetched from a live service, and no key was
used to make any of them. `test/phase146c.test.ts` replays them through `fixtureTransport`, so the suite needs no key
and no network.

Named people appear only where the supplier's own answer carries a person (a PSC, a CQC contact, an EPC assessor,
a planning applicant), and only so the tests can prove the connector never keeps them.
