/**
 * PANEL 2 — SOURCES: WHAT HAS FIRED AND WHAT HAS NOT.
 *
 * And the first place `assertSignedEngagement` takes any form. It is named in
 * four documents — the Developer Brief, the Build Order, the Provenance Map and
 * src/stubs/signature.ts's own warning — and, until this file, implemented
 * nowhere. Every one of those four says the same three things about it, so they
 * are the specification and they are not restated as opinion:
 *
 *   · SERVER-SIDE, on every paid call. Never in the UI, never on a value the
 *     browser sent, never once per session.
 *   · The operator picks THE MOMENT, NOT THE CALLS. One button fires everything
 *     outstanding, and a per-call confirmation is explicitly not to be built.
 *   · NOTHING REFUSES AND NOTHING THROWS. Before signature a paid source is
 *     simply not consulted and its facts stay asked, which is what N4 already
 *     requires of every unknown.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY A FUNCTION CALLED `assert…` RETURNS A RECORD INSTEAD OF THROWING
 *
 * The name is not this phase's to change: four documents and a board item use
 * it, and renaming it here would make every one of them wrong. But the third
 * rule above forbids the behaviour the name suggests. The two are reconciled by
 * reading "assert" as it is used in caprebate-source-register.ts and in
 * caprebate-name-exclusion.ts — ESTABLISH THE FACT FROM THE RECORD — rather
 * than as "throw unless". It reads the engagements table on the server, on this
 * request, and returns what it found. The gate is then applied by NOT
 * CONSULTING a source, which is a decision and not an error.
 *
 * A version that threw would be a build in which a shut gate produces a screen
 * error, and all four documents name that as the failure mode to avoid.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE TWO GATES ARE READ, NEVER RESTATED, AND NEITHER IS OPENED HERE
 *
 * The FREE gate is `CB_REGISTRY.precondition`. It is `enabled:false`, its own
 * `requires` string says why, and there is no code in this package that can set
 * it. `registryGate()` in engine.ts is the one reader. DO NOT BUILD A SECOND
 * GATE — publishing the notice and flipping one boolean is the data protection
 * decision, and it is not a build step.
 *
 * The PAID gate is a signed engagement, asserted below against the record.
 *
 * Today BOTH are shut, so every source reports NOT_PERMITTED_YET and every fact
 * they would have supplied stays asked. That is the honest state and it is what
 * the screen shows.
 *
 * CA2 — PHASE 132f, 16 September 2026. A source whose fields CB_REGISTRY lists
 * as `postSignature` waits on the signed engagement too, whatever its tier:
 * the list of persons with significant control (CH_PSC) is free of charge and
 * stays tiered FREE, and it is still not consulted before signature. Read off
 * the engine through `postSignatureFieldsFor` / `postSignatureOpen`, never a
 * second list here. The free facts on the same publishers — CH_COMPANY and
 * HMLR_PPD — are untouched.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHO SIGNED, AND WHETHER THE REGISTER SAYS THEY MAY — PHASE 151b, 25 September 2026
 *
 * Word question 156, for the data protection officer: "May we briefly check two public register names without saving
 * them?" Answer, closed 24 September 2026: "Yes – best to check who signs and if they have authority". So "Run the
 * research" makes ONE MORE STEP after the lookups: `runSignatoryCheck` reads the name typed on the signed engagement
 * letter (engagement_signatures.signer_name, migration 040) on the server, and hands it to `checkSignatory`
 * (src/connectors/signatory-check.ts), which compares it in memory with the Companies House officers list and the care
 * regulator's registered manager and nominated individual. What comes back is a register, YES, NO or NOT_CHECKED, and
 * a reason code — never a name — and `storeSignatoryChecks` keeps exactly that in signatory_checks (migration 050),
 * with a SIGNATORY_CHECKED audit row carrying the register and the result.
 *
 * IT RUNS UNDER THE LOOKUPS' OWN GATES AND SWITCHES, NOT NEW ONES: the free gate (both registers are free), the signed
 * engagement asserted here, the source's own switch (CH_COMPANY, CQC) and its key — so it is off today, with them.
 * An outcome where nothing happened (off, not allowed) is shown on the panel and never stored, so no row and "not
 * checked" read alike. A YES or NO already kept for this engagement is not asked again. The panel carries one line in
 * words per register (`signatory` on SourcesPanel); it is a staff page, and nothing here reaches the client.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SITE AREA FROM THE LAND BOUNDARY — PHASE 151c, 25 September 2026
 *
 * "Run the research" is now the one caller of `siteAreaFromLandBoundary` (src/connectors/site-area.ts), through
 * src/web/site-area-run.ts: ONE MORE STEP after the check of who signed, for each of the client's properties, with the
 * postcode's council, any neighbouring council a person added, and the point a person entered or Homedata's own. It
 * waits on the signed letter, the free gate and the client's own choice, as read here, and above them on the boundary
 * switch, which is off. The panel carries one line in words per property (`site_area` on SourcesPanel), drawn without
 * any call outside. The land boundary's own row in the table points at those lines.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { registryGate, REGISTRY } from './engine.ts';
import { DECLINED_LINE, lookupsDeclined } from './address-check.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';
import { switchedOn, runConnector, REGISTER_SWITCHES, type Bundle, type ConnectorContext } from '../connectors/registers.ts';
import type { Transport, RateLimiter } from '../connectors/http.ts';
import type { SecretStore } from '../secrets.ts';
import { FREE_CONNECTORS, NOT_BUILT, researchSubject, runOrder } from '../connectors/free-registers.ts';
import type { PickQuery } from '../connectors/matching.ts';
import { PAID_CONNECTORS, PAID_ORDER, totalBeforePence, pounds } from '../connectors/paid-registers.ts';
import { ingestRegisterRecord } from '../stubs/registers.ts';
import { postcodeStore } from './postcode.ts';
import type { PostcodeStore } from './postcode-port.ts';
import { checkSignature } from './signing.ts';
import {
  checkSignatory, notYet, outcome as signatoryOutcome, signatoryWords, SIGNATORY_SOURCES,
  type SignatoryGates, type SignatoryOutcome, type SignatoryReason, type SignatoryResult, type SignatorySource,
} from '../connectors/signatory-check.ts';
import { runSiteAreas, siteAreaLines, storeSiteAreaRuns, type SiteAreaLine, type SiteAreaSetup } from './site-area-run.ts';

export type Tier = 'FREE' | 'PAID';
export type SourceState = 'NOT_RUN' | 'FIRED' | 'FAILED' | 'NOT_PERMITTED_YET';

/**
 * THE TIERS, TAKEN FROM THE DOCUMENTS THAT DECIDED THEM RATHER THAN INVENTED.
 *
 * "Caprebate — Developer Build Order.md", the two-tier table, and the same
 * table in "Caprebate — API & Data Provenance Map.html" §6, both recording
 * Lakhbir's decision of 4 September 2026:
 *
 *   TIER 1 — FREE: "EPC · care regulators · Ofsted · RSH · Charity Commission ·
 *   OSCR · Companies House · HMLR Price Paid · VOA open data · OS · planning"
 *
 *   TIER 2 — PAID: "Homedata address lookup · HMLR title register · any
 *   licensed or metered product"
 *
 * Mapped onto the source ids in caprebate-source-register.ts, which is the
 * register of what we actually consult. BCIS is tier 2 under "any licensed or
 * metered product": its licence in that same module is a RICS subscription and
 * its own note says the rate table may not be reproduced.
 */
const TIER_BY_SOURCE: Readonly<Record<string, Tier>> = Object.freeze({
  /* Tier 1 — free, gated on the published privacy notice. */
  EPC: 'FREE',
  CQC: 'FREE',
  CIW: 'FREE',
  CH_COMPANY: 'FREE',
  CH_PSC: 'FREE',
  HMLR_PPD: 'FREE',
  VOA: 'FREE',
  PLANNING: 'FREE',
  ONS_POSTCODE: 'FREE',
  /* PHASE 150, 24 September 2026: HM Land Registry's INSPIRE Index Polygons, free open data under the OGL like its
     Price Paid Data, and the land-boundary counterpart of "OS" in the documents' tier 1. Only a council's name is
     sent, never anything about the client. */
  HMLR_INSPIRE: 'FREE',
  /* Phase 151: the free postcode check at the address question (src/connectors/postcode-check.ts). Not run by the button. */
  POSTCODES_IO: 'FREE',
  /* Tier 2 — paid, gated on a signed engagement. */
  HMLR_TITLE: 'PAID',
  BCIS: 'PAID',
  /* "Homedata address lookup" is the first entry in the documents' tier 2. */
  HOMEDATA_ADDRESS: 'PAID',
});

/**
 * A SOURCE NOBODY HAS TIERED IS TREATED AS PAID, AND IT SAYS SO.
 *
 * N4 applied to the tier itself. An unknown must never route to the more
 * permissive branch, and FREE is the more permissive one: it opens on a privacy
 * notice, where PAID additionally needs a signed engagement. So a source added
 * to the register and not to the table above waits for BOTH, and the screen
 * says the tier is unsettled rather than quietly asserting one.
 *
 * There is a test that adds an untiered source and asserts exactly this, so the
 * rule cannot rot into a comment.
 */
export const UNTIERED_DEFAULT: Tier = 'PAID';

export type CatalogueEntry = {
  readonly source_id: string;
  readonly publisher: string;
  readonly dataset: string;
  readonly licence_id: string;
  readonly licence_name: string;
  readonly tier: Tier;
  /** False where the tier came from UNTIERED_DEFAULT rather than the documents. */
  readonly tier_settled: boolean;
  readonly endpoint: string | null;
  /**
   * CB_REGISTRY'S OWN `gate` FOR THIS SOURCE, or null. Today only the valuation
   * office carries one, and its value is 'licence'.
   *
   * THIS IS A THIRD BLOCKER AND IT IS NOT ONE OF THE TWO GATES. The two gates
   * are about PERMISSION — informed clients, signed engagements. This one is
   * about whether we hold the licence to consult a publisher at all, and it is
   * an assertion the derivation layer already makes: `derive()` pushes the
   * field onto `gated` and says "we do not hold the licence for …".
   *
   * IT WAS MISSING FROM THE FIRST DRAFT OF THIS PANEL, and the screen is what
   * found it: VOA rendered as "free, waiting on the privacy notice", which is
   * true and is not the binding constraint. Publishing the notice would not
   * make that source fire, so a panel that named only the notice would have had
   * an operator waiting for the wrong thing.
   */
  readonly licence_gate: string | null;
  /**
   * PHASE 132f, 16 September 2026 — CONDITION CA2, READ OFF THE ENGINE.
   *
   * The fields this source retrieves that CB_REGISTRY.SOURCES[].postSignature
   * lists: retrieved only after a signed engagement, checked on the server.
   * Empty for every source whose fields are free. Today it is `psc_name` on
   * CH_PSC (the list of persons with significant control) and
   * `proprietor_name_personal` on HMLR_TITLE (the title register, already
   * PAID). NOT A SECOND LIST: it is derived in `postSignatureFieldsFor` from
   * the engine's own `postSignature` and the source register's own
   * `personal_name_exceptions`, so the day the site adds a field the panel
   * follows it.
   */
  readonly post_signature_fields: readonly string[];
};

/**
 * CB_REGISTRY's source ids against the source register's.
 *
 * Two vocabularies for overlapping sets, joined in one tested place rather than
 * cast at each call site — the same pattern as roles.ts. A source register
 * entry the derivation layer does not model has no gate to report, which is
 * different from having none: `licence_gate` is null either way, and the
 * derivation layer is the only thing that could say otherwise.
 */
export const REGISTRY_ID_OF: Readonly<Record<string, string>> = Object.freeze({
  CQC: 'cqc',
  CIW: 'cqc', // the Welsh regulator answers the same fields as the English one
  EPC: 'epc',
  CH_COMPANY: 'companies_house',
  CH_PSC: 'companies_house',
  HMLR_PPD: 'hmlr',
  HMLR_TITLE: 'hmlr',
  VOA: 'voa',
  HOMEDATA_ADDRESS: 'homedata',
});

/**
 * THE SOURCE REGISTER'S FIELD NAMES AGAINST CB_REGISTRY'S, where they differ.
 *
 * Only one does. The register splits the title register's proprietor into
 * `proprietor_name_personal` (name exception 2, a person) and
 * `proprietor_company_number` (a company, no exception engaged); CB_REGISTRY
 * calls the exception `proprietor_name`. A field not listed here is the same
 * name in both. This is a vocabulary join, like REGISTRY_ID_OF — it decides
 * nothing: whether a field waits on signature is CB_REGISTRY's answer.
 */
export const REGISTRY_FIELD_OF: Readonly<Record<string, string>> = Object.freeze({
  proprietor_name_personal: 'proprietor_name',
});

/**
 * CA2, per source: the register's name-exception fields that CB_REGISTRY lists
 * as post-signature on the source it models. Read, never restated. A source
 * the derivation layer does not model has none to report, as with the licence
 * gate. A source register entry that names no exception carries no personal
 * name, so it is never post-signature — which is what keeps the free facts on
 * CH_COMPANY and HMLR_PPD free.
 */
/** Display words for the post-signature field ids above. Words only: a field not listed shows its own id. */
const FIELD_WORDS: Readonly<Record<string, string>> = Object.freeze({
  psc_name: 'the names of people with significant control',
  proprietor_name_personal: 'the owner’s name on the title register',
});

export function postSignatureFieldsFor(source_id: string, nameExceptions: readonly string[]): readonly string[] {
  const key = REGISTRY_ID_OF[source_id];
  if (key === undefined) return [];
  const post = REGISTRY.SOURCES[key]?.postSignature;
  if (!Array.isArray(post)) return [];
  return nameExceptions.filter((f) => post.includes(REGISTRY_FIELD_OF[f] ?? f));
}

/**
 * CA2, per call: is every post-signature field on this source open on THIS
 * engagement record? Asked of CB_REGISTRY.classifyField with the record, so
 * the rule — only `signed === true` opens — is the engine's and not this
 * file's. An absent record, null, `signed:false` and a "not sure" typed
 * anywhere all come back NOT_PERMITTED_YET. None of them throws.
 */
export function postSignatureOpen(
  entry: Pick<CatalogueEntry, 'source_id' | 'post_signature_fields'>, engagement: SignedEngagement | null | undefined,
): boolean {
  const key = REGISTRY_ID_OF[entry.source_id];
  if (key === undefined || entry.post_signature_fields.length === 0) return true;
  return entry.post_signature_fields.every((f) => {
    const c = REGISTRY.classifyField(key, REGISTRY_FIELD_OF[f] ?? f, engagement ?? null);
    return !(c.ok === false && c.code === 'NOT_PERMITTED_YET');
  });
}

function licenceGateFor(source_id: string): string | null {
  const key = REGISTRY_ID_OF[source_id];
  if (key === undefined) return null;
  const src = REGISTRY.SOURCES[key];
  return typeof src?.gate === 'string' ? src.gate : null;
}

/**
 * THE SOURCES A CLAIM CONSULTS — derived, not listed.
 *
 * `default_prov === 'API'` is what makes a source an EXTERNAL LOOKUP in
 * caprebate-source-register.ts. The other five entries there are CA, CD, SV,
 * CTA and DR — the client's own answers, their documents, our surveyor, our tax
 * adviser and the engine's own derivations. None of those is something a
 * button fires, and listing them on a panel about what has fired would invite
 * somebody to try to fire the client.
 *
 * WRITTEN AS A FILTER RATHER THAN A LIST so that a source added to the register
 * appears here the day it is added — and, if nobody tiers it, appears as
 * unsettled and waits for both gates rather than being silently omitted.
 */
export function catalogue(): readonly CatalogueEntry[] {
  const licenceName = (id: string): string =>
    LICENCES.find((l) => l.licence_id === id)?.name ?? id;
  return REGISTER_SOURCES
    .filter((s) => s.default_prov === 'API')
    .map((s) => {
      const tier = TIER_BY_SOURCE[s.source_id];
      return {
        source_id: s.source_id,
        publisher: s.publisher,
        dataset: s.dataset,
        licence_id: s.licence_id,
        licence_name: licenceName(s.licence_id),
        tier: tier ?? UNTIERED_DEFAULT,
        tier_settled: tier !== undefined,
        endpoint: s.endpoint,
        licence_gate: licenceGateFor(s.source_id),
        post_signature_fields: postSignatureFieldsFor(s.source_id, s.personal_name_exceptions),
      };
    });
}

/* ================================================================== *
 * THE TWO GATES
 * ================================================================== */

export type FreeGate = {
  readonly open: boolean;
  /** CB_REGISTRY's own words. Not paraphrased — it is the thing being reported. */
  readonly requires: string;
};

/** Read off CB_REGISTRY. There is no second gate and nothing here can open it. */
export function freeGate(): FreeGate {
  const g = registryGate();
  return { open: g.enabled, requires: g.requires };
}

export type SignedEngagement = {
  readonly signed: boolean;
  readonly letter_state: 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED' | 'NONE';
  readonly signed_at: string | null;
  /** A sentence a person can read, and the audit line's `why`. */
  readonly why: string;
};

/**
 * THE PAID GATE. Server-side, against the record, on this request.
 *
 * The `engagements` table is the record. Nothing here reads a form field, a
 * cookie, a query parameter or anything the stub signature provider returned to
 * a browser — src/stubs/signature.ts says in terms that it must not, and the
 * reason is that the stub's `executed` is always false and a build that trusted
 * it would be trusting a value it had just made up.
 *
 * NO BUSINESS AND NO ENGAGEMENT ROW BOTH MEAN NOT SIGNED, and they mean it in
 * the same words, because "there is no such client" is not a thing this
 * function should be able to tell a caller apart from "that client has not
 * signed".
 *
 * PHASE 146f: IT READS THE SIGNATURE RECORD, NOT ONLY THE STATE. A letter marked
 * SIGNED counts only when engagement_signatures holds its record, the record
 * matches its own fingerprint, and the audit chain carries that fingerprint
 * (checkSignature, src/web/signing.ts). A state flipped by hand, or a record
 * edited afterwards, is NOT SIGNED — and says why.
 */
export function assertSignedEngagement(db: Db, business_id: string): SignedEngagement {
  const row = db.get<{ letter_state: string; signed_at: string | null }>(
    'SELECT letter_state, signed_at FROM engagements WHERE business_id = ?',
    [business_id],
  );
  if (row === undefined) {
    return {
      signed: false, letter_state: 'NONE', signed_at: null,
      why: 'no engagement letter has been raised for this client yet',
    };
  }
  const state = row.letter_state as SignedEngagement['letter_state'];
  if (state !== 'SIGNED') {
    return {
      signed: false, letter_state: state, signed_at: null,
      why: `the engagement letter is ${LETTER_WORDS[state] ?? state.toLowerCase()} and is not signed`,
    };
  }
  const eng = db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [business_id]);
  const record = eng === undefined ? { ok: false as const, why: 'no engagement letter has been raised for this client yet' } : checkSignature(db, eng.id);
  if (!record.ok) {
    return { signed: false, letter_state: 'SIGNED', signed_at: null, why: record.why };
  }
  return {
    signed: true, letter_state: 'SIGNED', signed_at: row.signed_at,
    why: 'the engagement letter is signed',
  };
}

export const LETTER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  NONE: 'not raised',
  NOT_SENT: 'drafted but not sent',
  SENT: 'sent and not yet opened',
  VIEWED: 'opened by the client',
  SIGNED: 'signed',
});

/* ================================================================== *
 * THE PANEL
 * ================================================================== */

export type SourceRow = CatalogueEntry & {
  readonly state: SourceState;
  /** When we ran it. Null unless it has been run. */
  readonly fired_at: string | null;
  /** When the publisher's value was read. Distinct from `fired_at` — see 005. */
  readonly retrieved_at: string | null;
  readonly attempts: number;
  readonly failure_code: string | null;
  /** Why it is in this state, in words. Never empty, for any state. */
  readonly detail: string;
  /**
   * TRUE ONLY FOR A SOURCE THAT FAILED. The one exception the brief allows:
   * "a source that FAILED gets a retry, because retrying a failure is not
   * choosing which sources to consult." A source that has simply not run gets
   * no button at all, and there is a test that no such button is rendered.
   */
  readonly may_retry: boolean;
  /**
   * PHASE 146b: the source's own connector switch (REGISTER_SWITCHES in src/connectors/registers.ts). Every one is off.
   * NOT A THIRD GATE: the gates say whether we may consult a source for this client; this says whether its connector
   * is turned on at all. Shown on the panel in plain words ("not switched on").
   */
  readonly switched_on: boolean;
};

export type SourcesPanel = {
  readonly free: FreeGate;
  readonly engagement: SignedEngagement;
  readonly sources: readonly SourceRow[];
  readonly outstanding: number;
  /** How many the button would actually be able to consult right now. */
  readonly would_fire: number;
  readonly rate: RateState;
  /**
   * The gap between the register of sources and the register of what fires,
   * stated rather than hidden. See `KNOWN_GAPS`.
   */
  readonly known_gaps: readonly string[];
  /**
   * PHASE 146d, ITEM 3 — WHAT THIS CLICK WOULD COST, SHOWN BEFORE IT IS CLICKED.
   *
   * Every paid lookup that is outstanding AND switched on, at its supplier's published price. It is a PRICE LIST and
   * the words say so, because the figure shown afterwards is a different thing: that one comes off the suppliers'
   * own responses. Today it is 0 and the words say nothing would be spent — every paid switch is off, and a lookup
   * that cannot run cannot cost anything.
   */
  readonly cost_before_pence: number;
  readonly cost_before_words: string;
  /**
   * AND WHAT THE LAST CLICK DID COST, in the same panel, because the two belong beside each other: a price list and
   * the bill. Null when nothing has been run for this client, or when the last run predates this column — which is
   * NOT the same as nothing having been spent, and the words say which.
   */
  readonly cost_last_pence: number | null;
  readonly cost_last_words: string | null;
  /**
   * PHASE 151b (Word answer 156): whether the person who signed the engagement letter appears on each public register
   * in a role that can sign — one line in words per register. Staff only. Never a name.
   */
  readonly signatory: readonly SignatoryLine[];
  /**
   * PHASE 151c: the site area from HM Land Registry's land boundary — one line in words per property, for every state
   * it can be in (src/web/site-area-run.ts). Never a polygon or a coordinate.
   */
  readonly site_area: readonly SiteAreaLine[];
};

/** One register's line on the research panel: the result and its words, and when it was checked (null if never). */
export type SignatoryLine = {
  readonly source: SignatorySource;
  readonly result: SignatoryResult;
  readonly words: string;
  readonly checked_at: string | null;
};

/**
 * WHAT THIS PANEL CANNOT SHOW, SAID ON THE PANEL.
 *
 * The Provenance Map's tier-2 list opens with "Homedata address lookup", and
 * CB_REGISTRY models it as the source `homedata` which keys every other lookup.
 * Since 12 September 2026 (Phase 129) it IS in caprebate-source-register.ts, as
 * HOMEDATA_ADDRESS under the licence HOMEDATA_TERMS, written from the supplier's
 * own published terms. So it now draws a row like every other source. What is
 * still a gap is what those terms do not publish: a licence name, attribution
 * wording, a cache window and permission to reproduce the data outward. The
 * register holds those as refusals (0 days, every outward channel false), and
 * this panel says so rather than letting the row look complete.
 */
export const KNOWN_GAPS: readonly string[] = Object.freeze([
  'The paid address lookup (Homedata) has gaps in its terms. The supplier does not name its licence. ' +
    'It does not say how to credit it or how long we may keep its data. ' +
    'It does not let us copy its data into a client report, an accountant pack or an HMRC pack. ' +
    'So a returned address counts as out of date at once, and may go in none of the three. ' +
    'We checked the supplier\'s terms on 12 September 2026.',
]);

/**
 * PHASE 146c: THE ATTRIBUTION THAT GOES WITH A REGISTER'S DATA, WORD FOR WORD, WHEREVER A SCREEN SHOWS IT.
 *
 * HM Land Registry prescribes the words for Price Paid Data and says they "must appear verbatim"; they are read from
 * the licence register, never retyped. Only the sources listed here carry a line on a screen today. The rest of the
 * register's attribution lines are for reports and packs (attributionsFor in the source register), where they are
 * already printed.
 */
/*
 * PHASE 146d ADDS THE TITLE REGISTER. Its licence in the register requires attribution and prescribes the words
 * ("Contains HM Land Registry data © Crown copyright and database right."), and a bought official copy draws on a
 * screen exactly as a sale price does — so the words go with it there, read from the licence register and never
 * retyped, for the same reason Price Paid's are.
 */
export const ATTRIBUTION_SHOWN_WITH: readonly string[] = Object.freeze(['HMLR_PPD', 'HMLR_TITLE']);

export function registerAttribution(source_id: string): string | null {
  if (!ATTRIBUTION_SHOWN_WITH.includes(source_id)) return null;
  const src = REGISTER_SOURCES.find((s) => s.source_id === source_id);
  return LICENCES.find((l) => l.licence_id === src?.licence_id)?.attribution_text ?? null;
}

/** The section gate, asked as an object question. See backoffice.ts. */
const RESEARCH_SECTION = '__research_section__';

export function assertResearchSection(actor: Actor, action: 'research.read' | 'research.run'): void {
  authorise(actor, action, { type: 'research', id: RESEARCH_SECTION, business_id: RESEARCH_SECTION });
}

/**
 * What a source's state SHOULD be given the gates, and why — for a source that
 * has not fired. THE GATES DECIDE; this function does not re-decide them.
 *
 * A source that has already FIRED or FAILED keeps its own state: a gate closing
 * later does not un-fire a call that was made, and pretending otherwise would
 * lose the provenance of a value we hold.
 */
export function stateUnderGates(
  entry: CatalogueEntry, current: SourceState, free: FreeGate, engagement: SignedEngagement | null | undefined,
  /** PHASE 151b (Word answer 180): the client chose to answer the property questions themselves. Absent is not a no. */
  declined = false,
): { state: SourceState; detail: string } {
  /* N4 (Phase 132f). Only a record saying `signed === true` is a signed
     engagement. This used to read `!engagement.signed`, under which a truthy
     non-boolean — a "not sure" typed anywhere — would have opened the paid
     tier; and an absent record would have thrown. Both now read as unsigned. */
  const signed = engagement?.signed === true;
  const engagementWhy = engagement?.why ?? 'we have no engagement letter on record, so it counts as not signed';
  if (current === 'FIRED') {
    return { state: 'FIRED', detail: 'looked up — we keep the answer and where it came from' };
  }
  if (current === 'FAILED') {
    return { state: 'FAILED', detail: 'the last try did not work — you can try it again' };
  }
  // THE HARDEST BLOCKER FIRST. Opening either gate would not make this source
  // fire, so naming a gate here would send an operator to wait for the wrong
  // thing. CB_REGISTRY asserts it; this reports it and does not re-decide it.
  if (entry.licence_gate !== null) {
    return {
      state: 'NOT_PERMITTED_YET',
      detail: `we do not hold the ${entry.licence_gate} for ${entry.publisher}, so we ask the client instead ` +
        '— publishing the privacy notice would not change that',
    };
  }
  // CA2 (Phase 132f): a source carrying a post-signature field waits on the
  // signed engagement as well as its own tier's gate. Asked of the engine.
  const ca2Shut = !postSignatureOpen(entry, engagement);
  const ca2Words = `we look up ${entry.post_signature_fields.map((f) => FIELD_WORDS[f] ?? f).join(' and ')} ` +
    'only once the engagement letter is signed. Until then this lookup is not made — ' + engagementWhy;
  // PHASE 151b: a client who asked us to leave the lookups alone is not looked up in the free registers. A person asks
  // them instead. (The paid lookups after signing are the engagement's own, and are not what the choice was about.)
  if (entry.tier === 'FREE' && declined) {
    return { state: 'NOT_PERMITTED_YET', detail: DECLINED_LINE };
  }
  if (entry.tier === 'FREE' && !free.open) {
    return {
      state: 'NOT_PERMITTED_YET',
      detail: 'free lookups wait until our privacy notice is published: ' + free.requires +
        (ca2Shut ? `; and ${ca2Words}` : ''),
    };
  }
  if (entry.tier === 'FREE' && ca2Shut) {
    return { state: 'NOT_PERMITTED_YET', detail: ca2Words };
  }
  if (entry.tier === 'PAID' && (!signed || ca2Shut)) {
    return {
      state: 'NOT_PERMITTED_YET',
      detail: 'paid lookups wait until the engagement letter is signed — ' + engagementWhy +
        (entry.tier_settled ? '' : ' (not sure if free or paid, so it is treated as paid and waits for both)'),
    };
  }
  // Permitted. Whether its connector runs is the switch's and the key's to say (Phase 146c: `consultAllowed`); until
  // one does, it is NOT_RUN with this as the reason.
  return {
    state: 'NOT_RUN',
    detail: 'allowed, but not switched on yet, so nothing was contacted',
  };
}

/**
 * Every source and where it stands.
 *
 * ROWS ARE BUILT FROM THE CATALOGUE, NOT FROM THE TABLE. A source in the
 * register with no row in `research_sources` is a source that has never been
 * considered for this client, and it belongs on the panel saying so — reading
 * the table alone would show a shorter list every time a source was added, and
 * the shortening would look exactly like nothing being wrong.
 */
export function sourcesFor(
  db: Db, actor: Actor, business_id: string,
  /** PHASE 151c: where the site area's grid, store and postcode table come from. Absent: the server's own settings. */
  opts: { readonly site?: SiteAreaSetup } = {},
): SourcesPanel {
  assertResearchSection(actor, 'research.read');
  authorise(actor, 'research.read', { type: 'research', id: business_id, business_id });

  const free = freeGate();
  const engagement = assertSignedEngagement(db, business_id);

  const stored = new Map(
    db.all<{
      source_id: string; state: string; fired_at: string | null; retrieved_at: string | null;
      attempts: number; failure_code: string | null; detail: string | null;
    }>(
      'SELECT source_id, state, fired_at, retrieved_at, attempts, failure_code, detail ' +
        'FROM research_sources WHERE business_id = ?',
      [business_id],
    ).map((r) => [r.source_id, r] as const),
  );

  const sources = catalogue().map((entry) => {
    const row = stored.get(entry.source_id);
    const current = (row?.state ?? 'NOT_RUN') as SourceState;
    const resolved = stateUnderGates(entry, current, free, engagement, lookupsDeclined(db, business_id));
    return {
      ...entry,
      state: resolved.state,
      fired_at: row?.fired_at ?? null,
      retrieved_at: row?.retrieved_at ?? null,
      attempts: row?.attempts ?? 0,
      failure_code: row?.failure_code ?? null,
      detail: resolved.state === 'FAILED' && row?.detail ? row.detail : resolved.detail,
      may_retry: resolved.state === 'FAILED',
      switched_on: switchedOn(entry.source_id),
    };
  });

  const outstandingPaid = sources.filter((s) => s.state !== 'FIRED').map((s) => s.source_id);
  const before = totalBeforePence(outstandingPaid, (id) => switchedOn(id));
  const last = db.get<{ cost_pence: number | null; at: string }>(
    'SELECT cost_pence, at FROM research_runs WHERE business_id = ? ORDER BY at DESC, rowid DESC LIMIT 1',
    [business_id],
  );
  return {
    free, engagement, sources,
    outstanding: sources.filter((s) => s.state !== 'FIRED').length,
    would_fire: sources.filter((s) => s.state === 'NOT_RUN' || s.state === 'FAILED').length,
    rate: rateState(db, business_id, actor),
    known_gaps: KNOWN_GAPS,
    cost_before_pence: before,
    cost_before_words: before === 0
      ? 'This will not cost anything. The lookups we pay for are not switched on.'
      : `This will cost about ${pounds(before)}, at the prices the suppliers publish. ` +
        'We show what it actually cost once it has run.',
    cost_last_pence: last?.cost_pence ?? null,
    cost_last_words: last === undefined ? null
      : last.cost_pence === null ? 'The last time it was run, we did not record what it cost.'
      : last.cost_pence === 0 ? 'The last time it was run, nothing was spent.'
      : `The last time it was run it cost ${pounds(last.cost_pence)}, which is what the suppliers charged us.`,
    signatory: signatoryLines(db, business_id, { free_gate_open: free.open, engagement_signed: engagement.signed === true }),
    site_area: siteAreaLines(db, business_id,
      { free_gate_open: free.open, engagement_signed: engagement.signed === true, declined: lookupsDeclined(db, business_id) }, opts.site ?? {}),
  };
}

/* ================================================================== *
 * THE BUTTON
 * ================================================================== */

/**
 * RATE LIMIT. "It is the one control that could cost real money."
 *
 * Counted per BUSINESS and per WINDOW, off `research_runs`, which is also the
 * history. Per business rather than per user, because the cost is incurred
 * against a claim and two staff members clicking the same button twice costs
 * the same as one clicking it twice.
 *
 * THE LIMIT IS SMALL ON PURPOSE. Research is a thing you do once and then again
 * when something changed; six times in an hour is not a workflow, it is a
 * mistake or a stuck page.
 */
export const RESEARCH_LIMIT = 3;
export const RESEARCH_WINDOW_MS = 60 * 60 * 1000;

export type RateState = {
  readonly used: number;
  readonly limit: number;
  readonly allowed: boolean;
  readonly why: string;
};

export function rateState(db: Db, business_id: string, actor: Actor): RateState {
  const may = can(actor, 'research.run', { type: 'research', id: business_id, business_id });
  const since = new Date(Date.now() - RESEARCH_WINDOW_MS).toISOString();
  const row = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM research_runs WHERE business_id = ? AND kind = ? AND at >= ?',
    [business_id, 'RUN', since],
  );
  const used = row?.n ?? 0;
  if (!may) {
    return { used, limit: RESEARCH_LIMIT, allowed: false, why: 'your role cannot run the research' };
  }
  if (used >= RESEARCH_LIMIT) {
    return {
      used, limit: RESEARCH_LIMIT, allowed: false,
      why: `the research has been run ${used} times for this client in the last hour, which is the limit`,
    };
  }
  return { used, limit: RESEARCH_LIMIT, allowed: true, why: 'ready to run' };
}

export type RunDeps = {
  db: Db;
  audit: AuditLog;
  now: () => string;
  newId: () => string;
  /**
   * PHASE 146c: HOW A PERMITTED, SWITCHED-ON LOOKUP REACHES OUTSIDE — the transport (the live one, or recorded answers
   * in a test), the key file read at start-up, and the switches. ABSENT, NOTHING IS CONTACTED: every permitted lookup
   * stays NOT_RUN, exactly as before this phase. It opens no gate — the gates are decided above it, by
   * `stateUnderGates`, and a lookup the gates do not allow is never handed to a connector.
   */
  outside?: ResearchOutside;
};

export type ResearchOutside = {
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** REGISTER_SWITCHES unless a test passes its own. */
  readonly switches?: Readonly<Record<string, boolean>>;
  readonly limiter?: RateLimiter;
  readonly sleep?: (ms: number) => Promise<void>;
  /** The ONS postcode table; `postcodeStore()` unless a test passes one. */
  readonly postcodeStore?: PostcodeStore | null;
  /**
   * PHASE 151c: the site area's grid, store and — TESTS ONLY — the boundary switch. Absent: CAPREBATE_OSTN15_FILE,
   * CAPREBATE_INSPIRE_STORE_DIR and BOUNDARY_FETCHING_SWITCHED_ON, which is false.
   */
  readonly site?: SiteAreaSetup;
};

export type RunOutcome = {
  readonly ok: boolean;
  readonly why: string;
  readonly considered: number;
  readonly fired: number;
  readonly not_permitted: number;
  readonly failed: number;
  /**
   * PHASE 146d, ITEM 3 — WHAT IT ACTUALLY COST, IN PENCE, AND IT IS THE SUPPLIERS' FIGURE RATHER THAN OURS.
   * Added up from the calls, counting only those that came back saying they were charged. The price list shown
   * before the click is NOT carried forward into it: if the two differ, the difference is the thing worth seeing.
   */
  readonly cost_pence: number;
  readonly cost_words: string;
  /** PHASE 151b: what the check of who signed came to on this click, one line per register asked. Never a name. */
  readonly signatory?: readonly SignatoryLine[];
  /** PHASE 151c: what the site area came to on this click, one line per property. */
  readonly site_area?: readonly SiteAreaLine[];
};

/** One source's decision under the gates, and — Phase 146c — what its connector did, if it was allowed to run. */
export type SourceOutcome = {
  readonly entry: CatalogueEntry;
  readonly state: SourceState;
  readonly detail: string;
  readonly retrieved_at: string | null;
  readonly failure_code: string | null;
  readonly bundle: Bundle | null;
  /** PHASE 146d: what this lookup spent, in pence, from the calls it made. 0 for a free one and for one that failed. */
  readonly cost_pence: number;
};

/**
 * THE CONNECTORS, RUN ONLY FOR WHAT THE GATES ALLOWED. Phase 146c, 23 September 2026.
 *
 * `decided` is what `stateUnderGates` said for each source on this click. A source the gates did not allow is passed
 * through untouched — no connector is asked, nothing is sent. A source they allowed (NOT_RUN) is handed to its
 * connector through `runConnector`, which checks the switch, then the key, then makes the calls, then reads them:
 * FIRED with the time the answer was read, FAILED with a reason, or still NOT_RUN and saying why. A source with no
 * connector in this build (the Welsh care regulator, the valuation office, the paid lookups until Phase 146d) stays
 * NOT_RUN and says so.
 *
 * Exported so a test can hand it an allowed decision directly. It does not decide a gate and cannot open one: while
 * CB_REGISTRY.precondition is false, `runResearch` never passes it a free source as allowed.
 *
 * Nothing here writes: the calls happen first, outside any transaction, and the caller stores what came back.
 */
export async function consultAllowed(
  d: RunDeps, actor: Actor, business_id: string,
  decided: readonly { readonly entry: CatalogueEntry; readonly state: SourceState; readonly detail: string }[],
  gates: { readonly free_gate_open: boolean; readonly engagement_signed: boolean },
  /**
   * PHASE 146h — THE BACK-OFFICE PICK, AND IT IS THE ONLY THING THAT MAY SET THIS. One entry per source, carrying
   * either a `review` hook (hand me the ranked list) or a `chosen` key (a person picked this one). Absent — which is
   * every ordinary click — the query a connector is handed is exactly the query it was handed before this phase, and
   * there is a test that walks every builder and asserts neither key is on it.
   *
   * IT OPENS NOTHING. A pick reaches a connector through the same `decided` list as any other lookup, so the two
   * gates and the source's own switch have already had their say above. src/web/match-review.ts adds one more
   * condition on top — a signed engagement, whatever the source's tier — and it asserts that itself.
   */
  picks?: Readonly<Record<string, PickQuery>>,
): Promise<SourceOutcome[]> {
  const out: SourceOutcome[] = [];
  const subject = researchSubject(d.db, business_id);
  const earlier = new Map<string, Bundle>();
  const order = runOrder(decided.map((x) => x.entry.source_id));
  for (const x of [...decided].sort((a, b) => order.indexOf(a.entry.source_id) - order.indexOf(b.entry.source_id))) {
    const keep: SourceOutcome = { entry: x.entry, state: x.state, detail: x.detail, retrieved_at: null, failure_code: null, bundle: null, cost_pence: 0 };
    /* PHASE 146d: THE PAID LOOKUPS SIT BESIDE THE FREE ONES HERE AND NOWHERE ELSE. One map or the other answers for a
       source; a source in neither has no connector in this build and says so. The gate has already been decided
       above — a paid source reaches this line only when the engagement letter is signed, and that is not re-decided
       here any more than the free gate is. */
    const built = FREE_CONNECTORS[x.entry.source_id] ?? PAID_CONNECTORS[x.entry.source_id];
    if (x.state !== 'NOT_RUN' || d.outside === undefined) { out.push(keep); continue; }
    if (built === undefined) {
      out.push({ ...keep, detail: NOT_BUILT[x.entry.source_id] ?? keep.detail });
      continue;
    }
    const o = d.outside;
    const switches = o.switches ?? REGISTER_SWITCHES;
    const ctx: ConnectorContext = {
      deps: {
        audit: d.audit, now: d.now, transport: o.transport,
        ...(o.limiter === undefined ? {} : { limiter: o.limiter }),
        ...(o.sleep === undefined ? {} : { sleep: o.sleep }),
      },
      actor_id: actor.id, actor_role: actor.role, claim_id: null,
      gate: { ...gates, switched_on: switchedOn(x.entry.source_id, switches) },
      secrets: null,
    };
    const query = built.query(subject, earlier, o.postcodeStore === undefined ? postcodeStore() : o.postcodeStore);
    /* The pick's two keys are added to the query the builder made, rather than passed through every builder: a
       builder's job is to say what to ask the register about this client, and a pick does not change that — it
       changes what is done with the candidates the register comes back with. */
    const pick = picks?.[x.entry.source_id];
    const asked = pick === undefined ? query : { ...(query as Record<string, unknown>), ...pick };
    const run = await runConnector(built.connector, ctx, asked, { state: 'NOT_RUN', detail: x.detail }, o.secrets, switches);
    if (run.state === 'FIRED' && run.bundle !== null) earlier.set(x.entry.source_id, run.bundle);
    out.push({
      entry: x.entry, state: run.state, detail: run.detail,
      retrieved_at: run.state === 'FIRED' ? (run.retrieved_at ?? null) : null,
      failure_code: run.state === 'FAILED' ? (run.failure_code ?? 'ERROR') : null,
      bundle: run.state === 'FIRED' ? run.bundle : null,
      /* PHASE 146d, ITEM 11: WHAT THIS LOOKUP ACTUALLY COST, ADDED UP FROM THE CALLS IT MADE — and only from calls
         that say they were charged. A call that was refused, timed out or came back an error has `charged: false`
         and adds nothing, so a lookup that failed three times reports nothing spent, which is the truth and is what
         the supplier's own terms say ("any 4xx other than a 402 and any 5xx is never billed"). A charge we could
         not read at all is null, never 0, and is left out of the sum rather than counted as free. */
      cost_pence: run.cost_pence,
    });
  }
  return out;
}

/**
 * STORE WHAT THE CONNECTORS CAME BACK WITH — inside the caller's transaction. Exported so a test can store an allowed
 * lookup's outcome as `runResearch` does; nothing else calls it.
 *
 * Every record goes through `ingestRegisterRecord`, the one door, where N2 is checked: a field the name exclusion
 * register does not keep throws, and the transaction takes everything back with it, the state rows included. A record
 * already held for the same entity is not written twice and not overwritten: a fact somebody has checked and approved
 * (Phase 139) does not change under them because the register was asked again.
 */
export function storeResearchOutcomes(d: RunDeps, business_id: string, outcomes: readonly SourceOutcome[], at: string): void {
  const property_id = researchSubject(d.db, business_id).property?.id ?? null;
  for (const o of outcomes) {
    let detail = o.detail;
    if (o.state === 'FIRED' && o.bundle !== null) {
      let kept = 0;
      for (const rec of o.bundle.records) {
        const held = d.db.get<{ id: string }>(
          'SELECT id FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?',
          [business_id, rec.sourceId, rec.entityId],
        );
        if (held !== undefined) continue;
        ingestRegisterRecord(d.db, d.newId, d.now, business_id, rec, { property_id });
        kept++;
      }
      if (o.bundle.records.length > 0 && kept === 0) detail += ' We already held this record, so it was kept as it was.';
    }
    upsertSource(d, business_id, o.entry, o.state, detail, at, o);
  }
}

/**
 * "RUN THE RESEARCH" — one button, everything outstanding.
 *
 * WHAT IT DOES NOT DO, and each of these is a rule rather than an omission:
 *   · it takes no list of sources. The operator picks the moment, not the
 *     calls, so there is no parameter here that could carry a selection;
 *   · it does not open a gate. Every source is put through `stateUnderGates`,
 *     which reads the two gates and does not re-decide them;
 *   · it does not throw when a gate is shut. A source that may not be consulted
 *     is recorded NOT_PERMITTED_YET with the reason and the run continues.
 *
 * PHASE 146c: A PERMITTED LOOKUP NOW RUNS ITS CONNECTOR — through `consultAllowed`, and only when it is switched on and
 * its key is in the key file. FIRED is written only for a lookup that was actually made and read, with the time it was
 * read; FAILED with the reason. WHAT HAPPENS TODAY IS STILL NOTHING: the free gate is shut (CB_REGISTRY.precondition),
 * every switch is off and the key file holds no register key, so every lookup is NOT_PERMITTED_YET or NOT_RUN, `fired`
 * comes back 0 and the screen says so. A build that wrote FIRED against a call nobody made would put a false
 * provenance record into a claim file, which is the worst thing this system could do.
 */
export async function runResearch(d: RunDeps, actor: Actor, business_id: string): Promise<RunOutcome> {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const rate = rateState(d.db, business_id, actor);
  if (!rate.allowed) {
    d.audit.append({
      at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED',
      actor_id: actor.id, actor_role: actor.role,
      object_type: 'research', object_id: business_id,
      detail: { what: 'research_run', used: rate.used, limit: rate.limit },
    });
    return { ok: false, why: rate.why, considered: 0, fired: 0, not_permitted: 0, failed: 0, cost_pence: 0, cost_words: 'Nothing was spent.' };
  }

  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  const panel = sourcesFor(d.db, actor, business_id);

  const decided = panel.sources.filter((s) => s.state !== 'FIRED').map((s) => ({
    entry: s, ...stateUnderGates(s, s.state === 'FAILED' ? 'NOT_RUN' : s.state, free, engagement, lookupsDeclined(d.db, business_id)),
  }));
  const outcomes = await consultAllowed(d, actor, business_id, decided,
    { free_gate_open: free.open, engagement_signed: engagement.signed === true });
  /* PHASE 151b: ONE MORE STEP — who signed, checked against the registers, under the same gates and switches. */
  const signatory = await runSignatoryCheck(d, actor, business_id,
    { free_gate_open: free.open, engagement_signed: engagement.signed === true }, outcomes);
  /* PHASE 151c: AND ONE MORE — the site area from the land boundary, for each property, under the same gates, after
     signing, and switched off. Nothing refuses and nothing throws: every outcome is a line in words. */
  const o = d.outside;
  const site = await runSiteAreas(d, actor, business_id,
    { free_gate_open: free.open, engagement_signed: engagement.signed === true, declined: lookupsDeclined(d.db, business_id) },
    o === undefined ? undefined : {
      transport: o.transport,
      ...(o.limiter === undefined ? {} : { limiter: o.limiter }),
      ...(o.sleep === undefined ? {} : { sleep: o.sleep }),
    },
    { ...(o?.postcodeStore === undefined ? {} : { postcodeStore: o.postcodeStore }), ...(o?.site ?? {}) });
  const areas = site.filter((l) => l.state === 'STORED').length;

  const fired = outcomes.filter((o) => o.state === 'FIRED').length;
  const notPermitted = outcomes.filter((o) => o.state === 'NOT_PERMITTED_YET').length;
  const failed = outcomes.filter((o) => o.state === 'FAILED').length;
  /* ITEM 3's SECOND HALF: the actual cost, off the calls, not off the price list. */
  const spent = outcomes.reduce((n, o) => n + o.cost_pence, 0);
  const at = d.now();

  let checked: readonly SignatoryOutcome[] = [];
  d.db.tx(() => {
    storeResearchOutcomes(d, business_id, outcomes, at);
    d.db.run(
      'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
        'not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
      [d.newId(), business_id, actor.id, at, panel.sources.length, fired, notPermitted, failed, 'RUN', spent],
    );
    checked = storeSignatoryChecks(d, actor, business_id, signatory, at);
    storeSiteAreaRuns(d, actor, business_id, site, at);
  });
  auditSignatoryChecks(d, actor, business_id, checked, at);

  d.audit.append({
    at, kind: 'RESEARCH_FIRED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'research', object_id: business_id,
    detail: {
      considered: panel.sources.length, fired, not_permitted: notPermitted, failed, cost_pence: spent,
      free_gate_open: free.open, engagement_signed: engagement.signed, site_areas_stored: areas,
    },
  });

  return {
    ok: true,
    why: (fired === 0 && areas === 0
      ? (failed === 0
        ? 'Nothing was contacted. Each lookup is either not allowed yet or not switched on yet. ' +
          'No fact was guessed to fill a gap.'
        : `No lookup gave us an answer. ${failed} did not work, and you can try each of them again. ` +
          'No fact was guessed to fill a gap.')
      : (fired === 0 ? '' : `${fired} lookup${fired === 1 ? '' : 's'} made.`) +
        (failed === 0 ? '' : ` ${failed} did not work, and you can try each of them again.`) +
        /* PHASE 151c: a site area worked out on this click is said beside the lookups. */
        (areas === 0 ? '' : ` ${areas === 1 ? 'One site area was' : `${areas} site areas were`} worked out from the land boundary.`)).trim(),
    considered: panel.sources.length, fired, not_permitted: notPermitted, failed,
    cost_pence: spent,
    cost_words: spent === 0 ? 'Nothing was spent.' : `${pounds(spent)} was spent, which is what the suppliers charged us.`,
    signatory: signatory.outcomes.map((o) => ({ source: o.source, result: o.result, words: o.words, checked_at: o.kept ? at : null })),
    site_area: site.map(({ kept: _kept, ...line }) => line),
  };
}

/* ================================================================== *
 * WHO SIGNED, AND WHETHER THE REGISTER SAYS THEY MAY — Phase 151b, Word answer 156
 * ================================================================== */

export type SignatoryRun = {
  /** The engagement whose signer was checked; null when there is no signed letter to check against. */
  readonly engagement_id: string | null;
  /** One per register asked on this click. A register already answered YES or NO for this engagement is not asked. */
  readonly outcomes: readonly SignatoryOutcome[];
};

/** The latest register record of one source for this client, as its fields. Null when none is held or it cannot be read. */
function heldFields(db: Db, business_id: string, source_id: string): Record<string, unknown> | null {
  const r = db.get<{ fields_json: string }>(
    'SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? ORDER BY obtained_at DESC, rowid DESC LIMIT 1',
    [business_id, source_id]);
  if (r === undefined) return null;
  try {
    const v = JSON.parse(r.fields_json) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * THE CHECK, ON THIS CLICK. Exported so a test can hand it open gates, as `consultAllowed` is; `runResearch` passes the
 * gates as they stand, which today are shut. The signer's name is read here, on the server, from the signature record
 * the engagement check has just verified, and goes no further than `checkSignatory`'s memory. `outcomes` is what the
 * lookups found on the same click: a company number or care registration found there is used, else one held from
 * an earlier run, else the one on the client's record.
 */
export async function runSignatoryCheck(
  d: RunDeps, actor: Actor, business_id: string, gates: SignatoryGates, outcomes: readonly SourceOutcome[] = [],
): Promise<SignatoryRun> {
  const signed = gates.engagement_signed === true
    ? d.db.get<{ engagement_id: string; signer_name: string }>(
      'SELECT s.engagement_id, s.signer_name FROM engagement_signatures s JOIN engagements e ON e.id = s.engagement_id WHERE e.business_id = ?',
      [business_id])
    : undefined;
  const engagement_id = signed?.engagement_id ?? null;
  const answered = new Set(engagement_id === null ? [] : d.db.all<{ source: string }>(
    "SELECT DISTINCT source FROM signatory_checks WHERE engagement_id = ? AND result IN ('YES','NO')", [engagement_id]).map((r) => r.source));
  const todo = SIGNATORY_SOURCES.filter((s) => !answered.has(s));
  if (d.outside === undefined) {
    // No way out was handed in, so nothing can be contacted: the same as switched off, and nothing is kept.
    return { engagement_id, outcomes: todo.map((s) => signatoryOutcome(s, notYet(s, gates) ?? 'SWITCHED_OFF')) };
  }
  const o = d.outside;
  const found = (source_id: string): Record<string, unknown> | null =>
    outcomes.find((x) => x.entry.source_id === source_id && x.state === 'FIRED')?.bundle?.facts as Record<string, unknown> | undefined
      ?? heldFields(d.db, business_id, source_id);
  const subject = researchSubject(d.db, business_id);
  const cqcHeld = found('CQC');
  /* Loaded when the check runs, not when this file loads: crm.ts imports this file, and a load-time import back would
     be a cycle that leaves the navigation's gates unset while the app starts. */
  const { claimantTypeForGate } = await import('./crm.ts');
  const checked = await checkSignatory(
    {
      deps: {
        audit: d.audit, now: d.now, transport: o.transport,
        ...(o.limiter === undefined ? {} : { limiter: o.limiter }),
        ...(o.sleep === undefined ? {} : { sleep: o.sleep }),
      },
      actor_id: actor.id, actor_role: actor.role, claim_id: null,
    },
    {
      signer_name: signed?.signer_name ?? null,
      claimant_type: claimantTypeForGate(d.db, business_id).value,
      company_number: subject.company_number ?? text(found('CH_COMPANY')?.['company_number']),
      cqc_location_id: text(cqcHeld?.['cqc_location_id']),
      cqc_provider_id: text(cqcHeld?.['cqc_provider_id']),
    },
    gates, o.secrets, o.switches ?? REGISTER_SWITCHES, todo,
  );
  return { engagement_id, outcomes: checked };
}

/**
 * KEEP ONLY YES OR NO — inside the caller's transaction. One row per register that was asked and got as far as the
 * register, or stopped for a reason worth keeping; an outcome where nothing happened is not written. Returns what it
 * wrote, for the audit rows the caller appends after the transaction.
 */
export function storeSignatoryChecks(d: RunDeps, actor: Actor, business_id: string, run: SignatoryRun, at: string): SignatoryOutcome[] {
  if (run.engagement_id === null) return [];
  const kept = run.outcomes.filter((o) => o.kept);
  for (const o of kept) {
    d.db.run(
      'INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, run.engagement_id, o.source, o.result, o.reason, at, actor.id],
    );
  }
  return kept;
}

/** The audit rows: SIGNATORY_CHECKED, the register and the result only. */
export function auditSignatoryChecks(d: RunDeps, actor: Actor, business_id: string, kept: readonly SignatoryOutcome[], at: string): void {
  for (const o of kept) {
    d.audit.append({
      at, kind: 'SIGNATORY_CHECKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'research', object_id: business_id, detail: { source: o.source, result: o.result },
    });
  }
}

/**
 * THE PANEL'S LINES: the latest kept check for each register, in words; where none is kept, why not, worked out from
 * the gates and switches as they stand now — so an absent row and "not checked" say the same thing.
 */
export function signatoryLines(db: Db, business_id: string, gates: SignatoryGates): SignatoryLine[] {
  return SIGNATORY_SOURCES.map((source) => {
    const row = db.get<{ result: string; reason: string; checked_at: string }>(
      'SELECT result, reason, checked_at FROM signatory_checks WHERE business_id = ? AND source = ? ORDER BY checked_at DESC, rowid DESC LIMIT 1',
      [business_id, source]);
    if (row !== undefined) {
      return { source, result: row.result as SignatoryResult, words: signatoryWords(source, row.reason as SignatoryReason), checked_at: row.checked_at };
    }
    const o = signatoryOutcome(source, notYet(source, gates) ?? 'NOT_RUN_YET');
    return { source, result: o.result, words: o.words, checked_at: null };
  });
}

/**
 * RETRY ONE FAILED SOURCE. The single exception, and it is narrow.
 *
 * It refuses anything that is not in FAILED — including a source that has
 * simply not run, which is the case the brief forbids a per-source control for.
 * So the exception cannot be widened by calling this function with a different
 * argument: the state is checked against the record, not taken from the request.
 *
 * PHASE 146c: the retry runs the source's connector again, through the same `consultAllowed`, under the same gates.
 */
export async function retryFailedSource(
  d: RunDeps, actor: Actor, business_id: string, source_id: string,
): Promise<RunOutcome> {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const panel = sourcesFor(d.db, actor, business_id);
  const s = panel.sources.find((x) => x.source_id === source_id);
  if (s === undefined) {
    return { ok: false, why: 'we do not use that lookup', considered: 0, fired: 0, not_permitted: 0, failed: 0, cost_pence: 0, cost_words: 'Nothing was spent.' };
  }
  if (s.state !== 'FAILED') {
    return {
      ok: false,
      why: 'Only a lookup that did not work can be tried again. ' +
        'For the rest, press “Run the research”. It runs them all at once.',
      considered: 1, fired: 0, not_permitted: 0, failed: 0, cost_pence: 0, cost_words: 'Nothing was spent.',
    };
  }

  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  const resolved = stateUnderGates(s, 'NOT_RUN', free, engagement, lookupsDeclined(d.db, business_id));
  const [o] = await consultAllowed(d, actor, business_id, [{ entry: s, ...resolved }],
    { free_gate_open: free.open, engagement_signed: engagement.signed === true });
  const outcome = o as SourceOutcome;
  const at = d.now();

  d.db.tx(() => {
    storeResearchOutcomes(d, business_id, [outcome], at);
    d.db.run(
      'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
        'not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, actor.id, at, outcome.state === 'FIRED' ? 1 : 0,
       outcome.state === 'NOT_PERMITTED_YET' ? 1 : 0, outcome.state === 'FAILED' ? 1 : 0,
       'RETRY', source_id, outcome.cost_pence],
    );
  });

  d.audit.append({
    at, kind: 'RESEARCH_FIRED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'research', object_id: business_id,
    detail: { retry: source_id, resulting_state: outcome.state },
  });

  return {
    ok: true, why: outcome.detail, considered: 1,
    fired: outcome.state === 'FIRED' ? 1 : 0,
    not_permitted: outcome.state === 'NOT_PERMITTED_YET' ? 1 : 0,
    failed: outcome.state === 'FAILED' ? 1 : 0,
    cost_pence: outcome.cost_pence,
    cost_words: outcome.cost_pence === 0 ? 'Nothing was spent.' : `${pounds(outcome.cost_pence)} was spent, which is what the supplier charged us.`,
  };
}

/**
 * Write a source's state, carrying the provenance shape.
 *
 * PUBLISHER AND LICENCE ARE WRITTEN ON EVERY UPDATE, not only on a fire, so
 * that a row always says which publisher it is about.
 *
 * PHASE 146c: `fired_at` and `retrieved_at` are written for a FIRED lookup only — `fired_at` the moment of this click,
 * `retrieved_at` the moment the connector read the publisher's answer, which `runConnector` took from the clock when
 * it read it. For any other state both are left as they were: nothing has read a value, and filling them with `now()`
 * would invent a retrieval, which is the one thing the source register exists to prevent. `failure_code` is written
 * for a FAILED lookup and cleared for any other.
 */
function upsertSource(
  d: RunDeps, business_id: string, entry: CatalogueEntry,
  state: SourceState, detail: string, at: string,
  read: { readonly retrieved_at: string | null; readonly failure_code: string | null } = { retrieved_at: null, failure_code: null },
): void {
  const fired = state === 'FIRED' && read.retrieved_at !== null;
  const existing = d.db.get<{ id: string; attempts: number }>(
    'SELECT id, attempts FROM research_sources WHERE business_id = ? AND source_id = ?',
    [business_id, entry.source_id],
  );
  if (existing === undefined) {
    d.db.run(
      'INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, detail, ' +
        'publisher, licence_id, retrieved_at, failure_code, attempts) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, entry.source_id, entry.tier, state, fired ? at : null, detail,
       entry.publisher, entry.licence_id, fired ? read.retrieved_at : null,
       state === 'FAILED' ? read.failure_code : null, state === 'NOT_PERMITTED_YET' ? 0 : 1],
    );
    return;
  }
  d.db.run(
    'UPDATE research_sources SET tier = ?, state = ?, detail = ?, publisher = ?, licence_id = ?, attempts = ?, ' +
      'failure_code = ?' + (fired ? ', fired_at = ?, retrieved_at = ?' : '') + ' WHERE id = ?',
    [entry.tier, state, detail, entry.publisher, entry.licence_id,
     existing.attempts + (state === 'NOT_PERMITTED_YET' ? 0 : 1),
     state === 'FAILED' ? read.failure_code : null,
     ...(fired ? [at, read.retrieved_at] : []), existing.id],
  );
}
