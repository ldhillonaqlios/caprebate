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
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { registryGate, REGISTRY } from './engine.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';

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
  // Permitted, and still not run — because the connector does not exist.
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
export function sourcesFor(db: Db, actor: Actor, business_id: string): SourcesPanel {
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
    const resolved = stateUnderGates(entry, current, free, engagement);
    return {
      ...entry,
      state: resolved.state,
      fired_at: row?.fired_at ?? null,
      retrieved_at: row?.retrieved_at ?? null,
      attempts: row?.attempts ?? 0,
      failure_code: row?.failure_code ?? null,
      detail: resolved.state === 'FAILED' && row?.detail ? row.detail : resolved.detail,
      may_retry: resolved.state === 'FAILED',
    };
  });

  return {
    free, engagement, sources,
    outstanding: sources.filter((s) => s.state !== 'FIRED').length,
    would_fire: sources.filter((s) => s.state === 'NOT_RUN' || s.state === 'FAILED').length,
    rate: rateState(db, business_id, actor),
    known_gaps: KNOWN_GAPS,
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
};

export type RunOutcome = {
  readonly ok: boolean;
  readonly why: string;
  readonly considered: number;
  readonly fired: number;
  readonly not_permitted: number;
  readonly failed: number;
};

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
 * WHAT ACTUALLY HAPPENS TODAY: nothing is contacted, because no connector
 * exists. Every permitted source is recorded NOT_RUN with that as the reason.
 * `fired` therefore comes back 0 and the screen says so. A build that wrote
 * FIRED here — with a fabricated timestamp against a call nobody made — would
 * put a false provenance record into a claim file, which is the worst thing
 * this system could do.
 */
export function runResearch(d: RunDeps, actor: Actor, business_id: string): RunOutcome {
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
    return { ok: false, why: rate.why, considered: 0, fired: 0, not_permitted: 0, failed: 0 };
  }

  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  const panel = sourcesFor(d.db, actor, business_id);

  let fired = 0; let notPermitted = 0; let failed = 0;
  const at = d.now();

  d.db.tx(() => {
    for (const s of panel.sources) {
      if (s.state === 'FIRED') continue;
      const resolved = stateUnderGates(s, s.state === 'FAILED' ? 'NOT_RUN' : s.state, free, engagement);
      if (resolved.state === 'NOT_PERMITTED_YET') notPermitted++;
      else if (resolved.state === 'FAILED') failed++;
      // A permitted source stays NOT_RUN. Nothing fires; see the header.
      upsertSource(d, business_id, s, resolved.state, resolved.detail, at);
    }
    d.db.run(
      'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
        'not_permitted, failed, kind, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
      [d.newId(), business_id, actor.id, at, panel.sources.length, fired, notPermitted, failed, 'RUN'],
    );
  });

  d.audit.append({
    at, kind: 'RESEARCH_FIRED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'research', object_id: business_id,
    detail: {
      considered: panel.sources.length, fired, not_permitted: notPermitted,
      free_gate_open: free.open, engagement_signed: engagement.signed,
    },
  });

  return {
    ok: true,
    why: fired === 0
      ? 'Nothing was contacted. Each lookup is either not allowed yet or not switched on yet. ' +
        'No fact was guessed to fill a gap.'
      : `${fired} lookup${fired === 1 ? '' : 's'} made.`,
    considered: panel.sources.length, fired, not_permitted: notPermitted, failed,
  };
}

/**
 * RETRY ONE FAILED SOURCE. The single exception, and it is narrow.
 *
 * It refuses anything that is not in FAILED — including a source that has
 * simply not run, which is the case the brief forbids a per-source control for.
 * So the exception cannot be widened by calling this function with a different
 * argument: the state is checked against the record, not taken from the request.
 */
export function retryFailedSource(
  d: RunDeps, actor: Actor, business_id: string, source_id: string,
): RunOutcome {
  assertResearchSection(actor, 'research.run');
  authorise(actor, 'research.run', { type: 'research', id: business_id, business_id });

  const panel = sourcesFor(d.db, actor, business_id);
  const s = panel.sources.find((x) => x.source_id === source_id);
  if (s === undefined) {
    return { ok: false, why: 'we do not use that lookup', considered: 0, fired: 0, not_permitted: 0, failed: 0 };
  }
  if (s.state !== 'FAILED') {
    return {
      ok: false,
      why: 'Only a lookup that did not work can be tried again. ' +
        'For the rest, press “Run the research”. It runs them all at once.',
      considered: 1, fired: 0, not_permitted: 0, failed: 0,
    };
  }

  const free = freeGate();
  const engagement = assertSignedEngagement(d.db, business_id);
  const resolved = stateUnderGates(s, 'NOT_RUN', free, engagement);
  const at = d.now();

  d.db.tx(() => {
    upsertSource(d, business_id, s, resolved.state, resolved.detail, at);
    d.db.run(
      'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
        'not_permitted, failed, kind, source_id) VALUES (?, ?, ?, ?, 1, 0, ?, 0, ?, ?)',
      [d.newId(), business_id, actor.id, at, resolved.state === 'NOT_PERMITTED_YET' ? 1 : 0,
       'RETRY', source_id],
    );
  });

  d.audit.append({
    at, kind: 'RESEARCH_FIRED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'research', object_id: business_id,
    detail: { retry: source_id, resulting_state: resolved.state },
  });

  return { ok: true, why: resolved.detail, considered: 1, fired: 0, not_permitted: 0, failed: 0 };
}

/**
 * Write a source's state, carrying the provenance shape.
 *
 * PUBLISHER AND LICENCE ARE WRITTEN ON EVERY UPDATE, not only on a fire, so
 * that a row always says which publisher it is about. `retrieved_at` is NOT
 * written here and stays null: it is the moment a publisher's value was read,
 * and nothing has read one. Filling it with `now()` would be inventing a
 * retrieval, which is the one thing the source register exists to prevent.
 */
function upsertSource(
  d: RunDeps, business_id: string, entry: CatalogueEntry,
  state: SourceState, detail: string, at: string,
): void {
  const existing = d.db.get<{ id: string; attempts: number }>(
    'SELECT id, attempts FROM research_sources WHERE business_id = ? AND source_id = ?',
    [business_id, entry.source_id],
  );
  if (existing === undefined) {
    d.db.run(
      'INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, detail, ' +
        'publisher, licence_id, retrieved_at, failure_code, attempts) ' +
        'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?)',
      [d.newId(), business_id, entry.source_id, entry.tier, state, detail,
       entry.publisher, entry.licence_id, state === 'NOT_PERMITTED_YET' ? 0 : 1],
    );
    return;
  }
  d.db.run(
    'UPDATE research_sources SET tier = ?, state = ?, detail = ?, publisher = ?, licence_id = ?, ' +
      'attempts = ? WHERE id = ?',
    [entry.tier, state, detail, entry.publisher, entry.licence_id,
     existing.attempts + (state === 'NOT_PERMITTED_YET' ? 0 : 1), existing.id],
  );
  void at;
}
