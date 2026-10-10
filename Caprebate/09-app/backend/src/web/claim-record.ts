/**
 * THE CLAIM'S FOUR FIGURES, THE TAX ADVISER'S SIGN-OFF, THE RECONCILIATION LOG,
 * THE DELIVERABLES REGISTER AND AFTERCARE — CRM 6 of 10, 11 September 2026.
 *
 * The schema is migration 015; the facts these rest on are src/web/claim-facts.ts;
 * the pages are src/web/claim-record-pages.ts, which decides nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FOUR FIGURES, IN THE ORDER THEY ARE PRODUCED, EACH SEALED AND HASHED WHEN
 * IT IS SET AND NEVER EDITED
 *
 *   A  the indicative estimate      sealed in `estimates` with its hash (002)
 *   B  the researched estimate      NOT_PERMITTED_YET while the register gates are
 *                                   shut — and no column anywhere can hold one
 *   C  the surveyor's committed     sealed in `surveyor_commitments` with its hash
 *      figure                       (006), released under the anchor quarantine
 *   D  the figure the tax adviser   sealed in the sign-off record below, hashed
 *      signed
 *
 * None is copied into a fourth table: each is READ from the record that sealed
 * it. The whole panel is `claim_figures.read` — ADMIN and SALES — and a surveyor
 * never receives it; tools/payload-proof.ts searches for it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SIGN-OFF IS A RECORD, NOT A SIGNATURE. src/stubs/signature.ts executes
 * nothing, and the record says so in its own `kind`. The TAX_ADVISER_SIGNOFF gate
 * and the REPORTS gate read it — only one recorded since the claim last entered
 * TAX_ADVISER_SIGNOFF — and `claims.tax_adviser_signoff_at` is retired: the
 * database refuses any write to it.
 *
 * NO PART OF THIS FILE GENERATES A REPORT (Developer Spec DS-W10). A deliverable is
 * tracked — its state, version, issue date and the document type it is.
 */

import { claimAlive, claimRoutes, legalDeadlineNeed, routesWhy } from './claim-route.ts';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Db } from '../db.ts';
import { _canonical, type AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { OWNER_ROLE_TOKENS, isCompanyOrRoleToken } from './crm.ts';
import { enteredAt, raiseBusinessStage, type Need } from './pipeline.ts';
import { filingRoute } from './client-filing.ts';
import { latestAnswer, returnFilings, returnsOf, type ReturnFiling } from './accountant-confirm.ts';
import { assertSignedEngagement, freeGate } from './research.ts';
import { ctaSwitchReadings } from './engine.ts';
import { packSwitchReadings } from './money-readings.ts';
import { amendmentWindowReading, dateValue, penceValue } from './claim-facts.ts';
import { funnelStateFor } from './funnel-session.ts';
import { loadLetter, type OpenTerm } from './letter.ts';
import { insertTask } from './tasks.ts';
import { NO_RECEIPT_POLICY } from './documents.ts';
import { formatPence, formatShownRange } from './shown-range.ts';
import { localDate, localStamp, ukDate } from './localtime.ts';
import { readEngineVersion, writeCaseStamp } from './case-stamp.ts';
import { latestApprovalOnClaim, laterOf, voidLine } from './valuation-lock.ts';
import { freezeReturnContext, returnContext } from './return-entries.ts';

export type RecordDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type RecordResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string };
export type Fields = Readonly<Record<string, string | null>>;
type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function text(v: string | null | undefined, max: number, what: string): { ok: true; value: string | null } | { ok: false; why: string } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function sha256(v: unknown): string {
  return createHash('sha256').update(_canonical(v)).digest('hex');
}

type ClaimRow = {
  id: string; claim_ref: string; business_id: string; property_id: string | null; assessment_id: string | null;
  stage: string | null; created_at: string;
};

function loadClaim(db: Db, id: string): ClaimRow {
  const c = db.get<ClaimRow>('SELECT id, claim_ref, business_id, property_id, assessment_id, stage, created_at FROM claims WHERE id = ?', [id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

function figuresObj(c: { id: string; business_id: string }): Extract<Obj, { type: 'claim_figures' }> {
  return { type: 'claim_figures', id: c.id, business_id: c.business_id };
}

/* ================================================================== *
 * 1 · THE SIGN-OFF RECORD, AS THE GATES READ IT
 * ================================================================== */

type SignoffRow = {
  id: string; claim_id: string; adviser: string; credential: string; signed_on: string; scope: string; method_note: string;
  switch_readings_json: string; figure_pence: number; commitment_id: string; record_hash: string; recorded_at: string;
  recorder: string | null;
  /** PHASE 159a (C4): the approved version the adviser signed; null on a claim with no approved survey pack. */
  approval_id: string | null;
};

const SIGNOFF_SELECT =
  'SELECT s.id, s.claim_id, s.adviser, s.credential, s.signed_on, s.scope, s.method_note, s.switch_readings_json, s.figure_pence, ' +
  's.commitment_id, s.record_hash, s.recorded_at, u.display_name AS recorder, s.approval_id FROM tax_adviser_signoffs s LEFT JOIN users u ON u.id = s.recorded_by ';

export function latestSignOff(db: Db, claim_id: string): SignoffRow | undefined {
  return db.get<SignoffRow>(`${SIGNOFF_SELECT}WHERE s.claim_id = ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1`, [claim_id]);
}

/**
 * The sign-off record a gate may use: one recorded since the claim last ENTERED TAX_ADVISER_SIGNOFF — and, PHASE 159a,
 * since the valuation was last reopened (src/web/valuation-lock.ts), which sets every earlier sign-off aside.
 */
export function signOffSinceEntry(db: Db, c: { id: string; created_at: string }): SignoffRow | undefined {
  const since = laterOf(enteredAt(db, c, 'TAX_ADVISER_SIGNOFF'), voidLine(db, c.id));
  return db.get<SignoffRow>(
    `${SIGNOFF_SELECT}WHERE s.claim_id = ? AND s.recorded_at >= ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1`, [c.id, since]);
}

/**
 * THE SIGN-OFF NEED. OPEN ONLY ON THE RECORD. No confirmation, no setting, no
 * column and no other record stands in for it — test/claim-record.test.ts writes
 * each of those and asserts the gate stays shut, then writes the record.
 */
export function signOffRecordNeed(db: Db, c: { id: string; created_at: string }): Need {
  const s = signOffSinceEntry(db, c);
  // PHASE 159a (C4): where the claim has an approved survey pack, the sign-off must be of its NEWEST version.
  const latest = latestApprovalOnClaim(db, c.id);
  const stale = s !== undefined && latest !== null && s.approval_id !== latest.id;
  return {
    what: 'The tax adviser’s sign-off is on record',
    met: s !== undefined && !stale,
    why: s === undefined
      ? 'No sign-off is recorded since the claim reached the tax adviser. Nothing else counts in its place.'
      : stale
        ? `the surveyor approved version ${String(latest?.version ?? 0)} after the version the adviser signed. Send version ${String(latest?.version ?? 0)} for sign-off.`
        : `signed off on ${s.signed_on}, recorded ${localStamp(s.recorded_at)}`,
  };
}

/* ================================================================== *
 * 2 · THE FOUR FIGURES
 * ================================================================== */

export type ResearchedReading = { readonly state: 'NOT_PERMITTED_YET' | 'NOT_BUILT'; readonly why: string };

/**
 * B — THE RESEARCHED ESTIMATE. It comes from the post-gate research, which runs
 * only past both register gates. While either is shut it is NOT_PERMITTED_YET,
 * and says which. With both open it is still not shown, because nothing produces
 * one: it says so, rather than showing a blank that looks like a zero.
 */
export function researchedEstimateReading(db: Db, business_id: string): ResearchedReading {
  const free = freeGate();
  const paid = assertSignedEngagement(db, business_id);
  const shut: string[] = [];
  if (!free.open) shut.push('Free lookups are off until our privacy notice is published.');
  if (!paid.signed) shut.push(`Paid lookups wait for the signed engagement letter — ${paid.why}.`);
  if (shut.length > 0) return { state: 'NOT_PERMITTED_YET', why: `Not allowed yet. ${shut.join(' ')}` };
  return { state: 'NOT_BUILT', why: 'Both lookups are allowed, but there is no researched estimate. The research that makes one is not built yet.' };
}

type CommitmentRow = {
  id: string; job_id: string; a_qualifying_plant_pence: number; b_building_pence: number; c_bare_land_pence: number;
  qualifying_pct: number; method_note: string; committed_at: string; figures_hash: string;
};

export function commitmentOnClaim(db: Db, claim_id: string): CommitmentRow | undefined {
  return db.get<CommitmentRow>(
    'SELECT sc.id, sc.job_id, sc.a_qualifying_plant_pence, sc.b_building_pence, sc.c_bare_land_pence, sc.qualifying_pct, ' +
      'sc.method_note, sc.committed_at, sc.figures_hash FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
      'WHERE j.claim_id = ? ORDER BY sc.committed_at DESC LIMIT 1',
    [claim_id]);
}

export type SignoffView = {
  readonly id: string;
  readonly adviser: string;
  readonly credential: string;
  readonly signed_on: string;
  readonly scope: string;
  readonly method_note: string;
  readonly switch_readings: readonly { readonly switch: string; readonly on: boolean }[];
  readonly figure: string;
  readonly against_commitment: string;
  readonly record_hash: string;
  readonly recorded: string;
  readonly notice: string;
};

export const SIGNATURE_NOTICE =
  'Signing online is not switched on yet — this is a record, not a signature. Nothing was signed here.';

/**
 * THE THREE ROLES A SIGN-OFF COULD NAME UNTIL 25 SEPTEMBER 2026 — KEPT ONLY TO READ OLDER RECORDS. Phase 151b: Word
 * answer 169, "May we keep the tax adviser's own name on a claim's sign-off record?", closed 24 September 2026 by the
 * data protection officer's side: "Company name i think is best". So the record keeps the adviser's FIRM — its name as
 * registered, ending Limited, LLP or plc — and neither the person's name nor a role in place of the firm.
 * `recordSignOff` accepts a firm only; a record already written with one of these roles still reads in words.
 */
export const ADVISER_TOKENS: Vocab = Object.freeze({
  CAPREBATE_CTA: 'Cap Rebate’s own chartered tax adviser',
  CLIENT_TAX_ADVISER: 'The client’s own tax adviser',
  CLIENT_ACCOUNTANT: 'The client’s own accountant',
});

/** Shown beside the form. Was the open question's title until Word answer 169 closed it (Phase 151b). */
export const ADVISER_NAME_QUESTION =
  'We keep the adviser’s firm on this record, not the person’s name. Write the firm as registered, ending Limited, LLP or plc.';

function signoffView(s: SignoffRow): SignoffView {
  let readings: { switch: string; on: boolean }[] = [];
  try {
    const parsed = JSON.parse(s.switch_readings_json) as unknown;
    if (Array.isArray(parsed)) {
      readings = parsed.filter((x): x is { switch: string; on: boolean } =>
        typeof x === 'object' && x !== null && typeof (x as { switch?: unknown }).switch === 'string' && typeof (x as { on?: unknown }).on === 'boolean');
    }
  } catch { readings = []; }
  return {
    id: s.id, adviser: ADVISER_TOKENS[s.adviser] ?? s.adviser, credential: s.credential, signed_on: s.signed_on, scope: s.scope,
    method_note: s.method_note, switch_readings: readings, figure: formatPence(s.figure_pence),
    against_commitment: s.commitment_id, record_hash: s.record_hash,
    recorded: `${localStamp(s.recorded_at)} by ${s.recorder ?? 'a former user'}`, notice: SIGNATURE_NOTICE,
  };
}

export type Sealed<T> = ({ readonly state: 'SEALED' } & T) | { readonly state: 'NOT_YET'; readonly why: string };

export type FiguresPanel = {
  readonly order: string;
  readonly a_indicative: Sealed<{
    readonly figure: string; readonly shown_range: string; readonly sealed: string; readonly hash: string;
    readonly estimate: Readonly<Record<string, number>>;
  }>;
  readonly b_researched: ResearchedReading;
  readonly c_surveyor: Sealed<{
    readonly qualifying_plant: string; readonly building: string; readonly bare_land: string; readonly qualifying_pct: string;
    readonly committed: string; readonly hash: string; readonly method_note: string;
  }>;
  readonly d_adviser: Sealed<{ readonly figure: string; readonly signed_on: string; readonly adviser: string; readonly hash: string }>;
  readonly signoff: SignoffView | null;
  readonly claimable_figure: { readonly released: boolean; readonly why: string };
  readonly reconciliation: ReconciliationView | null;
  readonly may_record_signoff: boolean;
  readonly may_reconcile: boolean;
  /** PHASE 160 (job B): where staff record the filing and the claim goes into more than one return, each return. */
  readonly filing_returns: readonly ReturnFiling[] | null;
  readonly signoff_form?: {
    readonly open: boolean;
    readonly why: string;
    readonly switches: readonly { readonly switch: string; readonly on: boolean }[];
    readonly adviser_tokens: Vocab;
    readonly adviser_question: string;
    /** PHASE 159a (C4): the version this form records a sign-off of — the newest approved one — or null where there is none. */
    readonly version: { readonly id: string; readonly version: number; readonly figure: string } | null;
  };
};

export function figuresPanel(db: Db, actor: Actor, claim_id: string, todayIso: string): FiguresPanel {
  const c = loadClaim(db, claim_id);
  authorise(actor, 'claim_figures.read', figuresObj(c));
  const est = c.assessment_id === null ? undefined : db.get<Record<string, number> & { sealed_at: string; estimate_hash: string }>(
    'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, bare_land_pence, multiplier, ' +
      'indicative_lifetime_saving_pence, sealed_at, estimate_hash FROM estimates WHERE assessment_id = ?',
    [c.assessment_id]);
  const range = c.assessment_id === null ? undefined : db.get<{ shown_low_pence: number | null; shown_high_pence: number | null }>(
    'SELECT shown_low_pence, shown_high_pence FROM assessments WHERE id = ?', [c.assessment_id]);
  const k = commitmentOnClaim(db, c.id);
  const s = latestSignOff(db, c.id);
  const released = signOffSinceEntry(db, c);
  const mayRecordSignoff = can(actor, 'tax_signoff.record', figuresObj(c));
  return {
    order: 'The four figures, in the order they are made. A is the first estimate. B is the researched estimate. C is the surveyor’s figure. D is the figure the tax adviser signed. Each is locked when it is set, and never edited.',
    a_indicative: est === undefined
      ? { state: 'NOT_YET', why: c.assessment_id === null ? 'This claim has no assessment, so there is no first estimate.' : 'No estimate is locked for this claim’s assessment yet.' }
      : {
          state: 'SEALED', figure: formatPence(est['qualifying_expenditure_pence'] ?? null),
          shown_range: formatShownRange({ low_pence: range?.shown_low_pence ?? null, high_pence: range?.shown_high_pence ?? null }),
          sealed: localStamp(est.sealed_at), hash: est.estimate_hash,
          estimate: {
            qualifying_expenditure_pence: est['qualifying_expenditure_pence'] ?? 0, qualifying_pct: est['qualifying_pct'] ?? 0,
            pool_split_main_pence: est['pool_split_main_pence'] ?? 0, pool_split_special_pence: est['pool_split_special_pence'] ?? 0,
            bare_land_pence: est['bare_land_pence'] ?? 0, multiplier: est['multiplier'] ?? 0,
            indicative_lifetime_saving_pence: est['indicative_lifetime_saving_pence'] ?? 0,
          },
        },
    b_researched: researchedEstimateReading(db, c.business_id),
    c_surveyor: k === undefined
      ? { state: 'NOT_YET', why: 'No surveyor has committed figures on this claim yet.' }
      : {
          state: 'SEALED', qualifying_plant: formatPence(k.a_qualifying_plant_pence), building: formatPence(k.b_building_pence),
          bare_land: formatPence(k.c_bare_land_pence), qualifying_pct: `${(k.qualifying_pct * 100).toFixed(1)}%`,
          committed: localStamp(k.committed_at), hash: k.figures_hash, method_note: k.method_note,
        },
    d_adviser: s === undefined
      ? { state: 'NOT_YET', why: 'No sign-off is recorded for this claim yet.' }
      : { state: 'SEALED', figure: formatPence(s.figure_pence), signed_on: s.signed_on, adviser: ADVISER_TOKENS[s.adviser] ?? s.adviser, hash: s.record_hash },
    signoff: s === undefined ? null : signoffView(s),
    claimable_figure: released === undefined
      ? { released: false, why: 'No sign-off is recorded since the claim reached the tax adviser. So the client sees no claimable figure yet.' }
      : { released: true, why: 'The tax adviser’s sign-off is recorded.' },
    reconciliation: reconciliationView(db, c.id, todayIso),
    may_record_signoff: mayRecordSignoff,
    may_reconcile: can(actor, 'reconciliation.record', figuresObj(c)),
    filing_returns: accountantFiles(db, c.id) ? null : staffReturnFilings(db, c.id, todayIso),
    ...(mayRecordSignoff ? {
      signoff_form: {
        open: c.stage === 'TAX_ADVISER_SIGNOFF' && k !== undefined,
        why: c.stage !== 'TAX_ADVISER_SIGNOFF' ? 'a sign-off can only be recorded while the claim is with the tax adviser'
          : k === undefined ? 'the surveyor has not committed figures on this claim yet' : '',
        switches: packSwitchReadings(ctaSwitchReadings()), adviser_tokens: ADVISER_TOKENS, adviser_question: ADVISER_NAME_QUESTION,
        version: signoffVersion(db, c.id),
      },
    } : {}),
  };
}

/** PHASE 159a (C4): the newest approved version on the claim, with its figure, for the sign-off form to name. */
function signoffVersion(db: Db, claim_id: string): { id: string; version: number; figure: string } | null {
  const v = latestApprovalOnClaim(db, claim_id);
  if (v === null) return null;
  const f = db.get<{ f: number | null }>("SELECT json_extract(snapshot_json, '$.sums.qualifying_pence') AS f FROM survey_pack_approvals WHERE id = ?", [v.id])?.f ?? null;
  return { id: v.id, version: v.version, figure: formatPence(f) };
}

/* ================================================================== *
 * 3 · RECORDING THE SIGN-OFF — and the reconciliation opens with it
 * ================================================================== */

/**
 * The engine package this build ships, and its version. PHASE 132 MOVED BOTH TO src/web/case-stamp.ts, which stamps the
 * version on every issued deliverable; the reconciliation still reads it here, from there, and the path is re-exported
 * so nothing that named it moves.
 */
export { ENGINE_PACKAGE_PATH } from './case-stamp.ts';

const TRANSACTION_WORDS: Vocab = Object.freeze({
  purchase: 'second-hand purchase', new_build: 'new-build', refurb: 'refurbishment', fit_out: 'fit-out of leased premises',
});

/** The design's transaction type, from the client's own trigger answer where exactly one property was given. Otherwise null. */
function transactionType(db: Db, assessment_id: string | null): string | null {
  if (assessment_id === null) return null;
  const state = funnelStateFor(db, assessment_id);
  const props = Array.isArray(state?.['properties']) ? (state['properties'] as Record<string, unknown>[]) : [];
  if (props.length !== 1) return null;
  const t = props[0]?.['trigger'];
  return typeof t === 'string' && has(TRANSACTION_WORDS, t) ? (TRANSACTION_WORDS[t] ?? null) : null;
}

export function recordSignOff(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const c = loadClaim(d.db, claim_id);
  authorise(actor, 'tax_signoff.record', figuresObj(c));
  if (c.stage !== 'TAX_ADVISER_SIGNOFF') {
    return { ok: false, why: 'A sign-off can only be recorded while the claim is with the tax adviser.' };
  }
  const k = commitmentOnClaim(d.db, c.id);
  if (k === undefined) return { ok: false, why: 'The surveyor has not committed figures on this claim, so there is nothing to sign off.' };
  /* PHASE 159a (C4): THE SIGN-OFF NAMES THE VERSION IT SIGNED — the newest approved version on the claim. One sent for
     sign-off names its own (report-signoff.ts recordAnswer), and is refused if the surveyor has approved a newer one. */
  const latest = latestApprovalOnClaim(d.db, c.id);
  const asked = input['approval_id'] ?? null;
  if (asked !== null && (latest === null || asked !== latest.id)) {
    return { ok: false, why: latest === null
      ? 'That version is not an approved version on this claim.'
      : `The surveyor approved version ${String(latest.version)} after the version this adviser signed. Send version ${String(latest.version)} for sign-off.` };
  }
  const approval_id = latest?.id ?? null;
  // PHASE 159d (C9): a legal check clear only until a deadline that has passed is not signed off.
  const lapse = legalDeadlineNeed(d.db, c, d.now());
  if (!lapse.met) return { ok: false, why: `Not signed off: ${lapse.why}.` };
  const adviser = text(input['adviser'], 300, 'The adviser');
  if (!adviser.ok) return adviser;
  // PHASE 151b, Word answer 169: the FIRM, and only the firm — not a role in its place, and never a person's name.
  if (adviser.value === null || has(ADVISER_TOKENS, adviser.value) || !isCompanyOrRoleToken(adviser.value) || has(OWNER_ROLE_TOKENS, adviser.value)) {
    return {
      ok: false,
      why: 'Record the adviser’s firm, as registered: a name ending Limited, LLP or plc. Not a person’s name.',
    };
  }
  const credential = text(input['credential'], 300, 'The credential');
  if (!credential.ok) return credential;
  if (credential.value === null) return { ok: false, why: 'Write the title the adviser signed under. For example: Chartered Tax Adviser.' };
  const signedOn = dateValue(input['signed_on']);
  if (signedOn === null) return { ok: false, why: 'Write the date the adviser signed off, like 2026-03-31.' };
  if (signedOn > localDate(d.now())) return { ok: false, why: 'A sign-off cannot be dated after today.' };
  const scope = text(input['scope'], 4000, 'The scope');
  if (!scope.ok) return scope;
  if (scope.value === null) return { ok: false, why: 'Say what the adviser signed off — the scope. Without it, the sign-off proves nothing.' };
  const method = text(input['method_note'], 4000, 'The method note');
  if (!method.ok) return method;
  if (method.value === null) return { ok: false, why: 'Say how the adviser reached it — the method note.' };
  const figure = penceValue(input['figure']);
  if (figure === null) {
    return { ok: false, why: 'Write the figure the adviser signed, in pounds, more than £0. A £0 result is a reasoned negative, not a sign-off.' };
  }
  // PHASE 159a (C4): the figure is the version's own. A different figure is a different version: the surveyor approves it first.
  if (approval_id !== null) {
    const vf = d.db.get<{ f: number | null }>("SELECT json_extract(snapshot_json, '$.sums.qualifying_pence') AS f FROM survey_pack_approvals WHERE id = ?", [approval_id])?.f ?? null;
    if (vf !== null && vf !== figure) {
      return { ok: false, why: `The figure signed must be the approved version’s own: ${formatPence(vf)} (version ${String(latest?.version ?? 0)}). A different figure needs the surveyor to approve a new version first.` };
    }
  }
  const known = packSwitchReadings(ctaSwitchReadings()); // PHASE 159j (L14): as the pack the adviser signed read them
  const confirmed = (input['confirmed_switches'] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
  const readings: { switch: string; on: boolean }[] = [];
  for (const name of [...new Set(confirmed)]) {
    const r = known.find((x) => x.switch === name);
    if (r === undefined) return { ok: false, why: `“${name}” is not one of the tax adviser’s switches.` };
    readings.push({ switch: r.switch, on: r.on });
  }
  const id = d.newId();
  const at = d.now();
  const record = {
    id, claim_id: c.id, adviser: adviser.value, credential: credential.value, signed_on: signedOn, scope: scope.value,
    method_note: method.value, switch_readings: readings, figure_pence: figure, commitment_id: k.id,
    kind: 'RECORD_NOT_A_SIGNATURE', recorded_by: actor.id, recorded_at: at,
    ...(approval_id === null ? {} : { approval_id }),
  };
  const hash = sha256(record);
  const opened = d.db.tx(() => {
    d.db.run(
      'INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, ' +
        'figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, c.id, adviser.value, credential.value, signedOn, scope.value, method.value, JSON.stringify(readings), figure, k.id,
        'RECORD_NOT_A_SIGNATURE', hash, actor.id, at, approval_id],
    );
    // PHASE 159a (C29): the signed version's return entries are fixed from here, on the facts as they stand now.
    if (approval_id !== null) freezeReturnContext(d.db, approval_id, returnContext(d.db, c.id, c.business_id), 'SIGNOFF_RECORDED', at);
    return openReconciliation(d, c, { id, figure_pence: figure, signed_on: signedOn, adviser: adviser.value ?? '' }, k, at);
  });
  d.audit.append({
    at, kind: 'TAX_SIGNOFF_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { signoff: id, commitment: k.id, switches_confirmed: readings.length, business: c.business_id, ...(approval_id === null ? {} : { approval: approval_id }) },
  });
  if (opened !== null) {
    d.audit.append({
      at, kind: 'RECONCILIATION_OPENED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { reconciliation: opened, signoff: id, business: c.business_id },
    });
  }
  return { ok: true, id };
}

/**
 * THE RECONCILIATION OPENS WITH THE FIRST SIGN-OFF RECORD. The design opens it
 * when the quote is captured; the quote this build holds is the range the client
 * was shown, which exists from the assessment, so the first moment a case has
 * something to reconcile against is the figure the adviser signed. A later
 * sign-off does not rewrite it: its snapshot is fixed, and the database says so.
 */
function openReconciliation(
  d: RecordDeps, c: ClaimRow, s: { id: string; figure_pence: number; signed_on: string; adviser: string }, k: CommitmentRow, at: string,
): string | null {
  if (d.db.get<{ id: string }>('SELECT id FROM claim_reconciliations WHERE claim_id = ?', [c.id]) !== undefined) return null;
  const sector = d.db.get<{ sector: string }>('SELECT sector FROM businesses WHERE id = ?', [c.business_id])?.sector ?? 'not recorded';
  const est = c.assessment_id === null ? undefined : d.db.get<{ qualifying_expenditure_pence: number; sealed_at: string; estimate_hash: string }>(
    'SELECT qualifying_expenditure_pence, sealed_at, estimate_hash FROM estimates WHERE assessment_id = ?', [c.assessment_id]);
  const range = c.assessment_id === null ? undefined : d.db.get<{ shown_low_pence: number | null; shown_high_pence: number | null }>(
    'SELECT shown_low_pence, shown_high_pence FROM assessments WHERE id = ?', [c.assessment_id]);
  const letter = assertSignedEngagement(d.db, c.business_id);
  const snap = {
    claim_id: c.id, case_id: c.claim_ref, client_sector: sector, transaction_type: transactionType(d.db, c.assessment_id),
    a_value_pence: est?.qualifying_expenditure_pence ?? null, a_range_low_pence: range?.shown_low_pence ?? null,
    a_range_high_pence: range?.shown_high_pence ?? null, a_date_captured: est?.sealed_at ?? null,
    a_estimate_hash: est?.estimate_hash ?? null, a_engine_version: readEngineVersion(),
    b_range_low_pence: range?.shown_low_pence ?? null, b_range_high_pence: range?.shown_high_pence ?? null,
    b_date_captured: letter.signed_at,
    // PHASE 159c (line 8): an assessment from 9 October 2026 stores no low end, because the client saw only "up to £X".
    b_basis: range?.shown_low_pence === null || range?.shown_low_pence === undefined
      ? 'Desk only. The client was shown "up to" this figure before signing the engagement letter, and no low end, so none is kept. The letter gives no figure, so there is no quoted figure, and we do not make up a midpoint'
      : 'Desk only. This is the range the client saw before signing the engagement letter. The letter gives no figure, so there is no quoted figure, and we do not make up a midpoint',
    surveyor_value_pence: k.a_qualifying_plant_pence, surveyor_commitment_id: k.id, surveyor_figures_hash: k.figures_hash,
    c_value_pence: s.figure_pence, c_date_captured: s.signed_on, c_cta_reviewer: s.adviser, c_signoff_id: s.id, opened_at: at,
  };
  const id = d.newId();
  d.db.run(
    'INSERT INTO claim_reconciliations (id, claim_id, case_id, client_sector, transaction_type, a_value_pence, a_range_low_pence, ' +
      'a_range_high_pence, a_date_captured, a_estimate_hash, a_engine_version, b_value_pence, b_range_low_pence, b_range_high_pence, ' +
      'b_date_captured, b_basis, surveyor_value_pence, surveyor_commitment_id, surveyor_figures_hash, c_value_pence, c_date_captured, ' +
      'c_cta_reviewer, c_signoff_id, opened_at, snapshot_hash, status) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN_OUTCOME_PENDING')",
    [id, c.id, snap.case_id, snap.client_sector, snap.transaction_type, snap.a_value_pence, snap.a_range_low_pence, snap.a_range_high_pence,
      snap.a_date_captured, snap.a_estimate_hash, snap.a_engine_version, snap.b_range_low_pence, snap.b_range_high_pence,
      snap.b_date_captured, snap.b_basis, snap.surveyor_value_pence, snap.surveyor_commitment_id, snap.surveyor_figures_hash,
      snap.c_value_pence, snap.c_date_captured, snap.c_cta_reviewer, snap.c_signoff_id, snap.opened_at, sha256(snap)],
  );
  return id;
}

/* ================================================================== *
 * 4 · THE RECONCILIATION LOG
 * ================================================================== */

export const RESOLUTION_PATHS: Vocab = Object.freeze({
  NO_ENQUIRY_WINDOW_LAPSED: 'no enquiry — window lapsed',
  ENQUIRY_AGREED_AS_SUBMITTED: 'enquiry — agreed as submitted',
  ENQUIRY_AGREED_REDUCED: 'enquiry — agreed at reduced figure',
  ENQUIRY_AGREED_INCREASED: 'enquiry — agreed at increased figure',
  WITHDRAWN_NO_CLAIM: 'withdrawn/no claim',
});

/** The design's section 4 taxonomy, in its own words. The tax adviser tags it; staff record the tag. */
export const VARIANCE_CATEGORIES: Vocab = Object.freeze({
  ENGINE_READ: 'Engine under/over-read',
  SCOPE_CHANGE: 'Scope change',
  SURVEY_FINDING: 'Survey finding',
  STATUTORY_ELECTION_CONSTRAINT: 'Statutory/election constraint',
  HMRC_NEGOTIATION: 'HMRC negotiation',
  RATE_LEGISLATION_CHANGE: 'Rate/legislation change',
  CLIENT_WITHDRAWAL: 'Client withdrawal/no claim',
});

/** The design's review threshold on the quote gap. A starting value, "revisit after about 20 cases". */
export const QUOTE_GAP_REVIEW_PCT = 15;

type ReconRow = {
  id: string; case_id: string; client_sector: string; transaction_type: string | null;
  a_value_pence: number | null; a_range_low_pence: number | null; a_range_high_pence: number | null; a_date_captured: string | null;
  a_estimate_hash: string | null; a_engine_version: string | null;
  b_value_pence: number | null; b_range_low_pence: number | null; b_range_high_pence: number | null; b_date_captured: string | null; b_basis: string;
  surveyor_value_pence: number; surveyor_commitment_id: string; surveyor_figures_hash: string;
  c_value_pence: number; c_date_captured: string; c_cta_reviewer: string; c_signoff_id: string;
  opened_at: string; snapshot_hash: string; filed_on: string | null;
  variance_category: string | null; variance_notes: string | null;
  d_value_pence: number | null; d_date_captured: string | null; resolution_path: string | null; hmrc_enquiry_opened: number | null;
  amount_realised_pence: number | null; status: string;
};

export type ReconciliationView = {
  readonly case_id: string;
  readonly client_sector: string;
  readonly transaction_type: string;
  readonly estimate_A_indicative: { readonly value: string; readonly range: string; readonly date_captured: string | null; readonly estimate_hash: string | null; readonly engine_version: string };
  readonly estimate_B_quoted: { readonly value: string; readonly range: string; readonly date_captured: string | null; readonly basis: string };
  readonly surveyor_committed: { readonly value: string; readonly figures_hash: string };
  readonly estimate_C_pre_submission: { readonly value: string; readonly date_captured: string; readonly cta_reviewer: string };
  readonly filed_on: string | null;
  readonly outcome_D: {
    readonly value: string; readonly date_captured: string | null; readonly resolution_path: string;
    readonly hmrc_enquiry_opened: boolean; readonly amount_realised: string;
  } | null;
  readonly variance: {
    readonly quote_gap: string; readonly quote_gap_pct: string; readonly delivery_gap: string; readonly delivery_gap_pct: string;
    readonly variance_category: string | null; readonly variance_notes: string | null;
    readonly review_required: boolean; readonly review_why: string;
  };
  readonly status: string;
  readonly snapshot_hash: string;
  readonly opened: string;
};

function signedPence(p: number): string {
  return p < 0 ? `−${formatPence(-p)}` : formatPence(p);
}

/**
 * THE VARIANCE, READ AND NEVER STORED. The quote gap needs a quoted figure, and
 * the quote this build holds is a range — so the gap is NOT KNOWN, never zero,
 * and a case whose gap is not known goes to the tax adviser's review before it
 * closes, exactly as one over the threshold does.
 */
export function varianceOf(r: {
  b_value_pence: number | null; c_value_pence: number; d_value_pence: number | null; resolution_path: string | null;
}): { quote_gap: number | null; quote_gap_pct: number | null; delivery_gap: number | null; delivery_gap_pct: number | null; review_required: boolean; review_why: string } {
  const d = r.d_value_pence;
  const quote = r.b_value_pence === null || d === null ? null : d - r.b_value_pence;
  const quotePct = quote === null || r.b_value_pence === null || r.b_value_pence === 0 ? null : (quote / r.b_value_pence) * 100;
  const delivery = d === null ? null : d - r.c_value_pence;
  const deliveryPct = delivery === null ? null : (delivery / r.c_value_pence) * 100;
  if (r.resolution_path === 'WITHDRAWN_NO_CLAIM') {
    return { quote_gap: null, quote_gap_pct: null, delivery_gap: null, delivery_gap_pct: null, review_required: true,
      review_why: 'a withdrawn case is left out of the ratios and tracked apart — it is still tagged' };
  }
  if (r.b_value_pence === null) {
    return { quote_gap: null, quote_gap_pct: null, delivery_gap: delivery, delivery_gap_pct: deliveryPct, review_required: true,
      review_why: 'the quote gap is not known, because the quote was a range. So the tax adviser tags the difference before the case closes' };
  }
  const over = quotePct !== null && Math.abs(quotePct) > QUOTE_GAP_REVIEW_PCT;
  return { quote_gap: quote, quote_gap_pct: quotePct, delivery_gap: delivery, delivery_gap_pct: deliveryPct, review_required: over || quotePct === null,
    review_why: over ? `the quote gap is more than ${QUOTE_GAP_REVIEW_PCT}%` : quotePct === null ? 'the quote gap is not known' : 'within the threshold' };
}

export function reconciliationView(db: Db, claim_id: string, _todayIso: string): ReconciliationView | null {
  const r = db.get<ReconRow>('SELECT * FROM claim_reconciliations WHERE claim_id = ?', [claim_id]);
  if (r === undefined) return null;
  const v = varianceOf(r);
  const money = (p: number | null): string => (p === null ? 'not known' : formatPence(p));
  const range = (lo: number | null, hi: number | null): string => formatShownRange({ low_pence: lo, high_pence: hi });
  return {
    case_id: r.case_id, client_sector: r.client_sector.replace(/_/g, ' '), transaction_type: r.transaction_type ?? 'not established',
    estimate_A_indicative: {
      value: money(r.a_value_pence), range: range(r.a_range_low_pence, r.a_range_high_pence),
      date_captured: r.a_date_captured === null ? null : localStamp(r.a_date_captured), estimate_hash: r.a_estimate_hash,
      engine_version: r.a_engine_version ?? 'not known',
    },
    estimate_B_quoted: {
      value: 'no quoted figure — the letter states none', range: range(r.b_range_low_pence, r.b_range_high_pence),
      date_captured: r.b_date_captured === null ? null : localStamp(r.b_date_captured), basis: r.b_basis,
    },
    surveyor_committed: { value: formatPence(r.surveyor_value_pence), figures_hash: r.surveyor_figures_hash },
    estimate_C_pre_submission: { value: formatPence(r.c_value_pence), date_captured: r.c_date_captured, cta_reviewer: ADVISER_TOKENS[r.c_cta_reviewer] ?? r.c_cta_reviewer },
    filed_on: r.filed_on,
    outcome_D: r.resolution_path === null ? null : {
      value: money(r.d_value_pence), date_captured: r.d_date_captured, resolution_path: RESOLUTION_PATHS[r.resolution_path] ?? r.resolution_path,
      hmrc_enquiry_opened: r.hmrc_enquiry_opened === 1, amount_realised: money(r.amount_realised_pence),
    },
    variance: {
      quote_gap: v.quote_gap === null ? 'not known' : signedPence(v.quote_gap),
      quote_gap_pct: v.quote_gap_pct === null ? 'not known' : `${v.quote_gap_pct.toFixed(1)}%`,
      delivery_gap: v.delivery_gap === null ? 'not known until the outcome' : signedPence(v.delivery_gap),
      delivery_gap_pct: v.delivery_gap_pct === null ? 'not known until the outcome' : `${v.delivery_gap_pct.toFixed(1)}%`,
      variance_category: r.variance_category === null ? null : (VARIANCE_CATEGORIES[r.variance_category] ?? r.variance_category),
      variance_notes: r.variance_notes, review_required: v.review_required, review_why: v.review_why,
    },
    status: r.status === 'RECONCILED' ? 'reconciled' : 'open — outcome pending',
    snapshot_hash: r.snapshot_hash, opened: localStamp(r.opened_at),
  };
}

function reconFor(d: RecordDeps, actor: Actor, claim_id: string): { c: ClaimRow; r: ReconRow } {
  const c = loadClaim(d.db, claim_id);
  authorise(actor, 'reconciliation.record', figuresObj(c));
  const r = d.db.get<ReconRow>('SELECT * FROM claim_reconciliations WHERE claim_id = ?', [c.id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return { c, r };
}

function reconAudit(d: RecordDeps, actor: Actor, c: ClaimRow, step: string, at: string): void {
  d.audit.append({
    at, kind: 'RECONCILIATION_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { step, business: c.business_id },
  });
}

/**
 * PHASE 158d (F46): whether the client's accountant files this claim — the Reports route (src/web/client-filing.ts) is
 * ACCOUNTANT. Then the filing date is theirs to give, through their own link (src/web/accountant-confirm.ts).
 */
export function accountantFiles(db: Db, claim_id: string): boolean {
  const c = db.get<{ id: string; business_id: string; created_at: string }>('SELECT id, business_id, created_at FROM claims WHERE id = ?', [claim_id]);
  return c !== undefined && filingRoute(db, c, enteredAt(db, c, 'REPORTS')).route === 'ACCOUNTANT';
}

/**
 * PHASE 160 (the sweep; job B carried by Phase 159l): EACH RETURN, WHERE STAFF RECORD THE FILING. The client has no
 * accountant (src/web/client-filing.ts route CLIENT), so staff record each return's filing (migration 116), as the
 * accountant confirms each by its own link on the other route (accountant-confirm.ts returnFilings). The same reading
 * (Word question 283): a return already due must be recorded as filed; one not yet due is held in aftercare with its
 * due date. A filing recorded before, for the whole claim (the reconciliation's filed_on), counts for the earliest
 * return only. Null where the claim goes into one return or fewer, or its returns are not settled (one date, as before).
 */
export function staffReturnFilings(db: Db, claim_id: string, todayIso: string): ReturnFiling[] | null {
  const returns = returnsOf(db, claim_id, todayIso);
  if (returns === null || returns.length <= 1) return null;
  const today = localDate(todayIso);
  const rows = new Map(db.all<{ period_end: string; filed_on: string }>('SELECT period_end, filed_on FROM claim_return_filings WHERE claim_id = ?', [claim_id])
    .map((x) => [x.period_end, x.filed_on] as const));
  const whole = rows.size === 0 ? db.get<{ filed_on: string | null }>('SELECT filed_on FROM claim_reconciliations WHERE claim_id = ?', [claim_id])?.filed_on ?? null : null;
  return returns.map((r, i): ReturnFiling => {
    const filed = rows.get(r.period_end) ?? (i === 0 ? whole : null);
    const name = `The return for the period ending ${ukDate(r.period_end)} (${r.parts.join('; ')})`;
    if (filed !== null && filed !== undefined) return { ...r, state: 'FILED', filed_on: filed, words: `${name}: filed on ${ukDate(filed)}, as recorded` };
    if (r.due_on !== null && r.due_on > today) {
      return { ...r, state: 'NOT_DUE', filed_on: null, words: `${name}: not due until ${ukDate(r.due_on)}. Held in aftercare: record its filing under Reconciliation once it is filed` };
    }
    return { ...r, state: 'NOT_FILED', filed_on: null, words: `${name}: no filing is recorded. Record it under Reconciliation once the return is filed` };
  });
}

/** THE FILING — the date the return carrying the claim was filed. Once — once per return, where it goes into more than one. */
export function recordFiling(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const { c, r } = reconFor(d, actor, claim_id);
  if (accountantFiles(d.db, c.id)) {
    return { ok: false, why: 'The client’s accountant files this return, so they give the date themselves. Send them the filing link under “The accountant’s confirmations”.' };
  }
  const filed = dateValue(input['filed_on']);
  const each = staffReturnFilings(d.db, c.id, d.now());
  if (each === null && r.filed_on !== null) return { ok: false, why: `The filing is already recorded, on ${r.filed_on}, and does not change.` };
  if (filed === null) return { ok: false, why: 'Write the filing date, like 2026-03-31.' };
  if (filed > localDate(d.now())) return { ok: false, why: 'A return cannot be recorded as filed after today.' };
  const at = d.now();
  if (each !== null) {
    const period = (input['period_end'] ?? '').trim();
    const ret = each.find((x) => x.period_end === period);
    if (ret === undefined) return { ok: false, why: 'This claim goes into more than one tax return. Choose which return was filed.' };
    if (ret.state === 'FILED') return { ok: false, why: `That return's filing is already recorded, on ${ret.filed_on ?? ''}, and does not change.` };
    const id = d.newId();
    d.db.tx(() => {
      d.db.run('INSERT INTO claim_return_filings (id, claim_id, period_end, filed_on, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', [id, c.id, ret.period_end, filed, actor.id, at]);
      // The first return recorded also writes the claim's filing date, so every reader of it finds one.
      if (r.filed_on === null) d.db.run('UPDATE claim_reconciliations SET filed_on = ?, filed_recorded_by = ?, filed_recorded_at = ? WHERE id = ?', [filed, actor.id, at, r.id]);
      reconAudit(d, actor, c, `FILED ${ret.period_end}`, at);
      raiseBusinessStage(d.db, c.business_id, at);
    });
    return { ok: true, id };
  }
  d.db.tx(() => {
    d.db.run('UPDATE claim_reconciliations SET filed_on = ?, filed_recorded_by = ?, filed_recorded_at = ? WHERE id = ?', [filed, actor.id, at, r.id]);
    reconAudit(d, actor, c, 'FILED', at);
    // PHASE 158c (F42): the client's "5 Claim filed" waits for this record; a claim already past Invoice now shows it.
    raiseBusinessStage(d.db, c.business_id, at);
  });
  return { ok: true, id: r.id };
}

/**
 * PHASE 158c (F42, the Friary House run): the claim closed, and the portal said "Claim filed", with no record that the
 * claim was filed. Closing a claim that reached the defence pack needs the filing date on its reconciliation.
 */
export function filingRecordedNeed(db: Db, claim_id: string, todayIso: string = new Date().toISOString()): Need {
  const what = 'The claim’s filing is recorded, with its date';
  // PHASE 158d (F46): where the client's accountant files, the filing is their own answer through their link.
  if (accountantFiles(db, claim_id)) {
    /* PHASE 159l (item 2, L15): a claim whose parts go into more than one return needs each return that is already due
       confirmed filed, by its own link; a return not yet due is held in aftercare with its due date. */
    const each = returnFilings(db, claim_id, todayIso);
    if (each !== null) {
      const due = each.filter((r) => r.state !== 'NOT_DUE');
      const met = due.length > 0 && due.every((r) => r.state === 'FILED');
      return { what: 'Each tax return the claim goes into is filed, or not due yet and held in aftercare', met,
        why: due.length === 0 ? `no return is due yet, so none is filed: ${each.map((r) => r.words).join('; ')}` : each.map((r) => r.words).join('; ') };
    }
    const a = latestAnswer(db, claim_id, 'FILED');
    if (a === null) return { what, met: false, why: 'the client’s accountant has not confirmed the filing yet. Send them the filing link under “The accountant’s confirmations”' };
    return a.outcome === 'CONFIRMED'
      ? { what, met: true, why: `filed on ${a.filed_on ?? ''}, confirmed by ${a.signer_name} of ${a.signer_firm ?? ''}` }
      : { what, met: false, why: `${a.signer_name} said it is not filed: “${a.reason ?? ''}”` };
  }
  const r = db.get<{ filed_on: string | null }>('SELECT filed_on FROM claim_reconciliations WHERE claim_id = ?', [claim_id]);
  if (r === undefined) return { what, met: false, why: 'no figure is signed off on this claim, so there is nothing to record the filing against' };
  // PHASE 160 (job B): where staff record it, each return already due, as on the accountant's route.
  const each = staffReturnFilings(db, claim_id, todayIso);
  if (each !== null) {
    const due = each.filter((x) => x.state !== 'NOT_DUE');
    return { what: 'Each tax return the claim goes into is filed, or not due yet and held in aftercare', met: due.length > 0 && due.every((x) => x.state === 'FILED'),
      why: due.length === 0 ? `no return is due yet, so none is filed: ${each.map((x) => x.words).join('; ')}` : each.map((x) => x.words).join('; ') };
  }
  if (r.filed_on === null) return { what, met: false, why: 'no filing date is recorded. Record it under Reconciliation once the amended return is filed' };
  return { what, met: true, why: `filed on ${r.filed_on}` };
}

/** THE VARIANCE TAG — from the design's taxonomy, tagged by the tax adviser, recorded once. */
export function recordVariance(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const { c, r } = reconFor(d, actor, claim_id);
  if (r.variance_category !== null) return { ok: false, why: 'The variance is already tagged, and the tag does not change.' };
  const cat = input['variance_category'] ?? null;
  if (!has(VARIANCE_CATEGORIES, cat)) return { ok: false, why: 'Choose the kind of difference from the list.' };
  const notes = text(input['variance_notes'], 4000, 'The variance notes');
  if (!notes.ok) return notes;
  const at = d.now();
  d.db.run('UPDATE claim_reconciliations SET variance_category = ?, variance_notes = ?, variance_recorded_by = ?, variance_recorded_at = ? WHERE id = ?',
    [cat, notes.value, actor.id, at, r.id]);
  reconAudit(d, actor, c, 'VARIANCE_TAGGED', at);
  return { ok: true, id: r.id };
}

/**
 * A DAY THE TARGET MONTH DOES NOT HAVE IS THAT MONTH'S LAST DAY. Phase 132, 15 September 2026.
 * It rolled over into the next month: 29 February 2024 plus twelve months read 1 March 2025, and 31 January plus one
 * read 3 March, holding the enquiry window open a day or more too long. The engine's CB_CASH.addMonths was clamped the
 * same way on 14 September. A day the target month has reads exactly as before. Exported for its test alone.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, dd] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + months + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + months, Math.min(dd ?? 1, lastDay)));
  return t.toISOString().slice(0, 10);
}

/**
 * THE OUTCOME — DERIVED, NOT KEYED, WHEREVER THE RECORDS SETTLE IT.
 *
 *   a closed enquiry        agreed as submitted, reduced or increased, at its figure
 *   an open enquiry         no outcome yet — refused
 *   no enquiry              the window lapsed only once twelve months have passed
 *                           since the recorded filing; before that, refused
 *   withdrawn               the one outcome a person states, with no figure
 *
 * The amount realised is recorded where it is known and left blank where it is
 * not; nothing requires a guess. A case whose variance the tax adviser has not
 * tagged does not close.
 */
export function recordOutcome(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const { c, r } = reconFor(d, actor, claim_id);
  if (r.resolution_path !== null) return { ok: false, why: 'The outcome is already recorded, and does not change.' };
  if (r.variance_category === null) {
    return { ok: false, why: 'The tax adviser must tag the difference before the case closes. The quote gap is not known, because the quote was a range.' };
  }
  const rawRealised = input['amount_realised'] ?? null;
  const realised = rawRealised === null || rawRealised.trim() === '' ? null : penceValue(rawRealised);
  if (rawRealised !== null && rawRealised.trim() !== '' && realised === null) return { ok: false, why: 'Write the amount realised in pounds, more than £0 — or leave it blank if it is not known.' };
  const today = localDate(d.now());
  const open = d.db.get<{ id: string }>('SELECT id FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NULL', [c.id]);
  const closed = d.db.get<{ closed_on: string; outcome: string; amended_figure_pence: number | null }>(
    'SELECT closed_on, outcome, amended_figure_pence FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NOT NULL ORDER BY closed_on DESC, rowid DESC LIMIT 1',
    [c.id]);
  let path: string, dValue: number | null, dDate: string | null, enquiry: number;
  if (input['withdrawn'] === 'yes') {
    if (open !== undefined) return { ok: false, why: 'An HMRC enquiry is open on this claim. The outcome is how it closes.' };
    path = 'WITHDRAWN_NO_CLAIM'; dValue = null; dDate = today; enquiry = closed === undefined ? 0 : 1;
  } else if (open !== undefined) {
    return { ok: false, why: 'An HMRC enquiry is open on this claim. The outcome is recorded when it closes.' };
  } else if (closed !== undefined) {
    enquiry = 1; dDate = closed.closed_on;
    if (closed.outcome === 'NO_CHANGE') { path = 'ENQUIRY_AGREED_AS_SUBMITTED'; dValue = r.c_value_pence; }
    else if (closed.outcome === 'AMENDED_DOWN') { path = 'ENQUIRY_AGREED_REDUCED'; dValue = closed.amended_figure_pence; }
    else { path = 'ENQUIRY_AGREED_INCREASED'; dValue = closed.amended_figure_pence; }
  } else {
    if (r.filed_on === null) return { ok: false, why: 'The filing is not recorded, so we cannot know the enquiry window has ended.' };
    const lapses = addMonths(r.filed_on, 12);
    if (today < lapses) return { ok: false, why: `HMRC may still open an enquiry until ${lapses}, twelve months from the filing. So the outcome is not known yet.` };
    path = 'NO_ENQUIRY_WINDOW_LAPSED'; dValue = r.c_value_pence; dDate = lapses; enquiry = 0;
  }
  const at = d.now();
  d.db.run(
    "UPDATE claim_reconciliations SET d_value_pence = ?, d_date_captured = ?, resolution_path = ?, hmrc_enquiry_opened = ?, amount_realised_pence = ?, " +
      "outcome_recorded_by = ?, outcome_recorded_at = ?, status = 'RECONCILED' WHERE id = ?",
    [dValue, dDate, path, enquiry, realised, actor.id, at, r.id]);
  reconAudit(d, actor, c, 'RECONCILED', at);
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 5 · THE DELIVERABLES REGISTER
 * ================================================================== */

export type DeliverableKind = 'CLIENT_REPORT' | 'ACCOUNTANT_COMPUTATION_PACK' | 'REASONED_NEGATIVE' | 'DEFENCE_PACK' | 'S203_NOTIFICATION';

export const DELIVERABLES: Readonly<Record<DeliverableKind, {
  readonly label: string; readonly document_type: string; readonly needs_signoff: boolean; readonly immutable_when_issued: boolean;
}>> = Object.freeze({
  CLIENT_REPORT: { label: 'The client report', document_type: 'CA_REPORT', needs_signoff: true, immutable_when_issued: false },
  ACCOUNTANT_COMPUTATION_PACK: { label: 'The accountant’s computation pack', document_type: 'TAX_COMPUTATION', needs_signoff: true, immutable_when_issued: false },
  REASONED_NEGATIVE: { label: 'The reasoned negative', document_type: 'CLAIM_DOCUMENTATION', needs_signoff: false, immutable_when_issued: false },
  DEFENCE_PACK: { label: 'The defence pack', document_type: 'CLAIM_DOCUMENTATION', needs_signoff: false, immutable_when_issued: true },
  S203_NOTIFICATION: { label: 'The s.203 notification', document_type: 'CORRESPONDENCE', needs_signoff: false, immutable_when_issued: false },
});

const KINDS = Object.keys(DELIVERABLES) as DeliverableKind[];

export const DELIVERABLE_STATES: Vocab = Object.freeze({
  NOT_STARTED: 'Not started', DRAFT: 'Draft', ISSUED: 'Issued', SUPERSEDED: 'Superseded',
});

export const RECEIPT_QUESTION = 'For each new document type, what do we keep when a file comes in? Nobody may upload one until this is decided.';

type DeliverableRow = {
  id: string; claim_id: string; kind: string; version: number; document_type: string; state: string; issued_on: string | null;
  content_hash: string | null; logical_document_id: string | null; created_at: string; updated_at: string;
};

/** PHASE 159a: an issued deliverable counts only if it was issued after the valuation was last reopened (a defence pack). */
export function deliverableIssued(db: Db, claim_id: string, kind: DeliverableKind): boolean {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' AND updated_at >= ?",
    [claim_id, kind, voidLine(db, claim_id) ?? ''])?.n !== 0;
}

export function deliverableIssuedNeed(db: Db, claim_id: string, kind: DeliverableKind): Need {
  const issued = db.get<{ issued_on: string; version: number }>(
    "SELECT issued_on, version FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' AND updated_at >= ? ORDER BY version DESC LIMIT 1",
    [claim_id, kind, voidLine(db, claim_id) ?? '']);
  const def = DELIVERABLES[kind];
  return {
    what: `${def.label} is issued`,
    met: issued !== undefined,
    why: issued === undefined ? `${def.label} is not issued yet. No issued version is recorded.` : `version ${issued.version} issued on ${issued.issued_on}`,
  };
}

export function deliverableObj(db: Db, r: { id: string; claim_id: string; kind: string; state: string }, business_id: string): Extract<Obj, { type: 'deliverable' }> {
  const claim = db.get<{ id: string; created_at: string }>('SELECT id, created_at FROM claims WHERE id = ?', [r.claim_id]);
  return {
    type: 'deliverable', id: r.id, business_id, kind: r.kind, state: r.state,
    figure_released: claim !== undefined && signOffSinceEntry(db, claim) !== undefined,
  };
}

export type DeliverableLine = {
  readonly kind: DeliverableKind;
  readonly label: string;
  readonly state: string;
  readonly state_label: string;
  readonly version: number | null;
  readonly issued_on: string | null;
  readonly content_hash: string | null;
  readonly document_type: string;
  readonly stored: string;
  readonly history: readonly { readonly version: number; readonly state: string; readonly issued_on: string | null }[];
  readonly may_draft: boolean;
  readonly may_issue: boolean;
  readonly refused_why: string | null;
};

export type DeliverablesPanel = {
  readonly lines: readonly DeliverableLine[];
  readonly generation: string;
  readonly may_record: boolean;
};

export function deliverablesPanel(db: Db, actor: Actor, claim_id: string): DeliverablesPanel {
  const c = loadClaim(db, claim_id);
  authorise(actor, 'deliverable.read', { type: 'deliverable', id: c.id, business_id: c.business_id, kind: 'REGISTER', state: 'REGISTER', figure_released: false });
  const mayRecord = can(actor, 'deliverable.record', { type: 'deliverable', id: c.id, business_id: c.business_id, kind: 'REGISTER', state: 'DRAFT', figure_released: false });
  const signed = signOffSinceEntry(db, c) !== undefined;
  const rows = db.all<DeliverableRow>('SELECT * FROM claim_deliverables WHERE claim_id = ? ORDER BY kind ASC, version DESC', [c.id]);
  const types = new Map(db.all<{ code: string; label: string }>('SELECT code, label FROM document_types').map((t) => [t.code, t.label] as const));
  return {
    // PHASE 158c (F36, F38): what is true of each line, not one sentence for all of them.
    generation: 'The client report, the accountant’s pack and the defence pack are made here, from the claim’s own records. The others are documents on the claim, tracked here.',
    may_record: mayRecord,
    lines: KINDS.map((kind) => {
      const def = DELIVERABLES[kind];
      const mine = rows.filter((r) => r.kind === kind);
      const current = mine[0];
      const draft = mine.find((r) => r.state === 'DRAFT');
      const blocked = def.needs_signoff && !signed ? 'a report with a figure cannot be drafted until the tax adviser’s sign-off is recorded' : null;
      return {
        kind, label: def.label,
        state: current?.state ?? 'NOT_STARTED', state_label: DELIVERABLE_STATES[current?.state ?? 'NOT_STARTED'] ?? 'Not started',
        version: current?.version ?? null, issued_on: current?.issued_on ?? null, content_hash: current?.content_hash ?? null,
        document_type: types.get(def.document_type) ?? def.document_type,
        stored: MADE_FROM_REPORT.has(kind)
          ? 'Made here from the survey report the surveyor approved, once a tax adviser has signed off its figure. Its fingerprint is recorded when it is issued.'
          : kind === 'DEFENCE_PACK'
            // PHASE 158d (F47)
            ? 'Made here from the claim’s own records, from the approved report to the filing. Its fingerprint is recorded when it is issued.'
            : `It cannot be stored yet. ${NO_RECEIPT_POLICY} Still to decide: ${RECEIPT_QUESTION}`,
        history: mine.map((r) => ({ version: r.version, state: DELIVERABLE_STATES[r.state] ?? r.state, issued_on: r.issued_on })),
        may_draft: mayRecord && draft === undefined && blocked === null,
        may_issue: mayRecord && draft !== undefined,
        refused_why: blocked,
      };
    }),
  };
}

/**
 * DRAFT A NEW VERSION, OR ISSUE THE DRAFT. Nothing else moves a deliverable.
 * Issuing a new version supersedes the one before it — except the defence pack,
 * whose every issued version stays exactly as issued, with its hash.
 */
/**
 * PHASE 158c (F38, the Friary House run): THE CLIENT REPORT AND THE ACCOUNTANT'S PACK ARE THE APPLICATION'S OWN REPORT.
 * They were issued with a fingerprint staff typed, while the report built from the survey pack (src/web/report-pages.ts)
 * went unread. Now each is issued from the version the client may see - the newest approved version of a survey pack on a
 * job on THIS claim, with a tax adviser's sign-off of that version's figure recorded after it was approved, and its
 * fingerprint holding: report-signoff.ts's `releasedVersion` rule, read here for one claim (an import of that module
 * would loop back to this one). Its fingerprint is the deliverable's.
 */
export const MADE_FROM_REPORT: ReadonlySet<DeliverableKind> = new Set<DeliverableKind>(['CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK']);

/** PHASE 158d (F47): every deliverable the application makes itself; none takes a typed fingerprint. */
export const MADE_HERE: ReadonlySet<DeliverableKind> = new Set<DeliverableKind>([...MADE_FROM_REPORT, 'DEFENCE_PACK']);

/**
 * PHASE 158d (F47, the second Friary House run): THE DEFENCE PACK, MADE FROM THE CLAIM'S OWN RECORDS. It was the last
 * deliverable issued on a SHA-256 staff typed. Now it is the list of what defends the claim, read from rows that never
 * change: the survey report the surveyor approved (released to the client), the tax adviser's sign-off, the client report
 * and the accountant's pack as issued, the client's acceptance of that report, our fee invoice as sent, and the filing.
 * All must be there; otherwise it says which are missing. Its fingerprint is the SHA-256 of the list as kept.
 */
export function defencePackRecords(db: Db, claim_id: string): { ok: true; manifest: Record<string, unknown>; fingerprint: string } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const c = db.get<{ claim_ref: string }>('SELECT claim_ref FROM claims WHERE id = ?', [claim_id]);
  const report = releasedReportFingerprint(db, claim_id);
  if (report === null) missing.push('the survey report the surveyor approved, with its sign-off');
  const since = voidLine(db, claim_id) ?? '';
  const signoff = db.get<{ id: string; record_hash: string; figure_pence: number; signed_on: string }>(
    'SELECT id, record_hash, figure_pence, signed_on FROM tax_adviser_signoffs WHERE claim_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', [claim_id, since]);
  if (signoff === undefined) missing.push('the tax adviser’s sign-off');
  const issued = (kind: string) => db.get<{ version: number; issued_on: string; content_hash: string | null }>(
    "SELECT version, issued_on, content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' ORDER BY version DESC LIMIT 1", [claim_id, kind]);
  const clientReport = issued('CLIENT_REPORT');
  if (clientReport === undefined) missing.push('the client report, issued');
  const pack = issued('ACCOUNTANT_COMPUTATION_PACK');
  if (pack === undefined) missing.push('the accountant’s computation pack, issued');
  const accepted = clientReport?.content_hash == null ? undefined : db.get<{ accepted_at: string; fingerprint: string }>(
    'SELECT accepted_at, fingerprint FROM client_report_acceptances WHERE claim_id = ? AND fingerprint = ? AND accepted_at >= ? ORDER BY accepted_at LIMIT 1', [claim_id, clientReport.content_hash, since]);
  if (accepted === undefined) missing.push('the client’s acceptance of the report');
  const invoice = db.get<{ seq: number | null; sent_on: string | null; fee_pence: number | null }>(
    "SELECT (SELECT n.seq FROM invoice_numbers n WHERE n.invoice_id = i.id AND n.kind = 'INVOICE') AS seq, i.sent_on, i.fee_pence FROM invoices i " +
      "WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status = 'SENT' ORDER BY i.sent_on DESC LIMIT 1", [claim_id]);
  if (invoice === undefined) missing.push('our fee invoice, sent');
  const filed = db.get<{ filed_on: string | null; snapshot_hash: string }>('SELECT filed_on, snapshot_hash FROM claim_reconciliations WHERE claim_id = ?', [claim_id]);
  if (filed?.filed_on == null) missing.push('the filing date');
  if (missing.length > 0 || c === undefined) return { ok: false, missing };
  const manifest: Record<string, unknown> = {
    claim: c.claim_ref,
    survey_report: { fingerprint: report },
    signoff: { id: signoff?.id, record_hash: signoff?.record_hash, figure_pence: signoff?.figure_pence, signed_on: signoff?.signed_on },
    client_report: clientReport, accountant_pack: pack,
    client_acceptance: accepted,
    fee_invoice: invoice,
    filing: { filed_on: filed?.filed_on, reconciliation_snapshot: filed?.snapshot_hash },
  };
  return { ok: true, manifest, fingerprint: createHash('sha256').update(_canonical(manifest), 'utf8').digest('hex') };
}

/** PHASE 159a (C4): the version a sign-off NAMES, recorded since the valuation was last reopened — never one matched by its total. */
export function releasedReportFingerprint(db: Db, claim_id: string): string | null {
  const rows = db.all<{ fingerprint: string; snapshot_json: string }>(
    'SELECT a.fingerprint, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'WHERE j.claim_id = ? AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
      "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence') AND s.recorded_at >= ?) " +
      'ORDER BY a.approved_at DESC, a.version DESC', [claim_id, voidLine(db, claim_id) ?? '']);
  for (const r of rows) {
    if (createHash('sha256').update(r.snapshot_json, 'utf8').digest('hex') === r.fingerprint) return r.fingerprint;
  }
  return null;
}

export function recordDeliverable(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const c = loadClaim(d.db, claim_id);
  const kind = input['kind'] ?? null;
  authorise(actor, 'deliverable.record', { type: 'deliverable', id: c.id, business_id: c.business_id, kind: kind ?? '', state: 'DRAFT', figure_released: false });
  if (kind === null || !Object.hasOwn(DELIVERABLES, kind)) return { ok: false, why: 'Choose one of the five documents.' };
  const def = DELIVERABLES[kind as DeliverableKind];
  const action = input['action'] ?? null;
  const at = d.now();
  if (action === 'DRAFT') {
    if (def.needs_signoff && signOffSinceEntry(d.db, c) === undefined) {
      return { ok: false, why: `${def.label} gives a figure. It cannot be drafted until the tax adviser’s sign-off is recorded.` };
    }
    if (d.db.get<{ id: string }>("SELECT id FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'DRAFT'", [c.id, kind]) !== undefined) {
      return { ok: false, why: `${def.label} already has a draft in progress. Issue it before starting another version.` };
    }
    const next = (d.db.get<{ n: number | null }>('SELECT MAX(version) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = ?', [c.id, kind])?.n ?? 0) + 1;
    const id = d.newId();
    d.db.run(
      'INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, created_by, created_at, updated_by, updated_at) ' +
        "VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)",
      [id, c.id, kind, next, def.document_type, actor.id, at, actor.id, at]);
    d.audit.append({
      at, kind: 'DELIVERABLE_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { deliverable: id, deliverable_kind: kind, version: next, state: 'DRAFT', business: c.business_id },
    });
    return { ok: true, id };
  }
  if (action === 'ISSUE') {
    const draft = d.db.get<DeliverableRow>("SELECT * FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'DRAFT'", [c.id, kind]);
    if (draft === undefined) return { ok: false, why: `${def.label} has no draft to issue.` };
    const issuedOn = dateValue(input['issued_on']);
    if (issuedOn === null) return { ok: false, why: 'Write the issue date, like 2026-03-31.' };
    if (issuedOn > localDate(at)) return { ok: false, why: 'The issue date cannot be after today.' };
    // PHASE 158c (F38): the report and the accountant's pack carry the released version's own fingerprint, never one typed.
    const made = MADE_FROM_REPORT.has(kind as DeliverableKind) ? releasedReportFingerprint(d.db, c.id) : undefined;
    if (made === null) {
      return { ok: false, why: `${def.label} is issued from the survey report the surveyor approved, once a tax adviser has signed off its figure. There is no such version on this claim yet.` };
    }
    // PHASE 158d (F47): the defence pack is made here too, from the claim's own records; its fingerprint is worked out.
    const defence = kind === 'DEFENCE_PACK' ? defencePackRecords(d.db, c.id) : undefined;
    if (defence !== undefined && !defence.ok) {
      return { ok: false, why: `The defence pack is made here from the claim’s own records. Still missing: ${defence.missing.join('; ')}.` };
    }
    const rawHash = defence?.ok === true ? defence.fingerprint : made ?? (input['content_hash'] ?? '').trim().toLowerCase();
    if (rawHash !== '' && !/^[0-9a-f]{64}$/.test(rawHash)) return { ok: false, why: 'The fingerprint of the issued document is 64 characters: 0 to 9 and a to f.' };
    if (kind === 'DEFENCE_PACK' && rawHash === '') {
      return { ok: false, why: 'An issued defence pack never changes, so we record its fingerprint. Give the fingerprint of the pack as issued.' };
    }
    if (def.needs_signoff && signOffSinceEntry(d.db, c) === undefined) {
      return { ok: false, why: `${def.label} gives a figure. It cannot be issued until the tax adviser’s sign-off is recorded.` };
    }
    /*
     * THE CASE STAMP — PHASE 132, 14 SEPTEMBER 2026. EVERY ISSUE, OF EVERY KIND, SEALS WHAT DECIDED THE CASE: the engine
     * version, the rulebook versions, every switch and its position, and the sign-off records with their hashes
     * (src/web/case-stamp.ts). IN THE SAME TRANSACTION, AFTER THE ISSUE, so a stamp that cannot be written takes the issue
     * back with it and an issued deliverable never stands without one. ALWAYS ON: it relieves nothing. A refusal above
     * returns before this and writes no stamp.
     */
    const stamp = d.db.tx(() => {
      if (!def.immutable_when_issued) {
        d.db.run("UPDATE claim_deliverables SET state = 'SUPERSEDED', updated_by = ?, updated_at = ? WHERE claim_id = ? AND kind = ? AND state = 'ISSUED'",
          [actor.id, at, c.id, kind]);
      }
      d.db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = ?, content_hash = ?, updated_by = ?, updated_at = ? WHERE id = ?",
        [issuedOn, rawHash === '' ? null : rawHash, actor.id, at, draft.id]);
      if (defence?.ok === true) {
        d.db.run('INSERT INTO defence_pack_manifests (deliverable_id, claim_id, manifest_json, fingerprint, made_at) VALUES (?, ?, ?, ?, ?)',
          [draft.id, c.id, _canonical(defence.manifest), defence.fingerprint, at]);
      }
      return writeCaseStamp(d.db, { id: d.newId(), claim_id: c.id, deliverable_id: draft.id, stamped_by: actor.id, stamped_at: at });
    });
    d.audit.append({
      at, kind: 'DELIVERABLE_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { deliverable: draft.id, deliverable_kind: kind, version: draft.version, state: 'ISSUED', business: c.business_id },
    });
    d.audit.append({
      at, kind: 'CASE_STAMPED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id,
      detail: {
        stamp: stamp.id, deliverable: draft.id, deliverable_kind: kind, stamp_hash: stamp.stamp_hash,
        cta_switches: stamp.stamp.cta_switches.length, backend_switches: stamp.stamp.backend_switches.length,
        connector_switches: stamp.stamp.connector_switches.length,
        signoffs: stamp.stamp.signoffs.length, business: c.business_id,
      },
    });
    return { ok: true, id: draft.id };
  }
  return { ok: false, why: 'Choose draft or issue.' };
}

export type ClientDeliverable = { readonly label: string; readonly version: number; readonly issued_on: string; readonly note: string };

/**
 * WHAT THE CLIENT'S PORTAL SHOWS FROM THE REGISTER — every deliverable asked of
 * `deliverable.read` on its own. A reasoned negative reaches the client HERE,
 * through its deliverable, and never as a stage the portal invents. No figure is
 * carried: the client report is listed only once its figure is released.
 */
export function clientDeliverables(db: Db, actor: Actor, business_id: string): ClientDeliverable[] {
  return db.all<DeliverableRow>(
    "SELECT cd.* FROM claim_deliverables cd JOIN claims c ON c.id = cd.claim_id WHERE c.business_id = ? AND cd.state = 'ISSUED' ORDER BY cd.issued_on ASC, cd.kind ASC",
    [business_id])
    .filter((r) => can(actor, 'deliverable.read', deliverableObj(db, r, business_id)))
    .map((r) => ({
      label: DELIVERABLES[r.kind as DeliverableKind]?.label ?? r.kind, version: r.version, issued_on: r.issued_on ?? '',
      note: 'Issued to you by Cap Rebate. The document itself cannot be kept in this portal yet, so it reaches you directly from us.',
    }));
}

/* ================================================================== *
 * 6 · AFTERCARE — HMRC ENQUIRIES, CLAUSE 13, AND THE DISPOSAL NOTE
 * ================================================================== */

export const ENQUIRY_OUTCOMES: Vocab = Object.freeze({
  NO_CHANGE: 'Closed with no change — agreed as submitted',
  AMENDED_DOWN: 'Closed with the allowances reduced',
  AMENDED_UP: 'Closed with the allowances increased',
});

export const CLAWBACK_QUESTION = 'If a claim is reduced after we have been paid, do we give the money back?';

/**
 * CLAUSE 13 — THE FEE FOLLOWS THE CORRECTED FIGURE. SHIPPED OFF.
 *
 * The letter's clause 13 now states the rule — a reduced claim is recalculated
 * and the difference credited or refunded — and leaves three terms blank: the
 * trigger, settlements, and the time limit. Built and switched off: while it is
 * off, an enquiry that reduces a claim raises nothing and the audit says why;
 * turned on while clause 13 still carries a blank, it still raises nothing. On,
 * with the clause complete, a reduction raises a finance task for Accounting.
 * Nothing here computes a credit: the fee is Caprebate's own finance.
 */
export type FeeClawbackSwitch = {
  readonly enabled: boolean; readonly clause: string; readonly question: string;
  /** Phase 132e: what Lakhbir decided, recorded. It moves no switch: the trigger and settlement terms are still blank. */
  readonly decided: { readonly refund: 'YES'; readonly time_limit: string; readonly still_open: readonly string[]; readonly source: string };
};

export const FEE_CLAWBACK: FeeClawbackSwitch = Object.freeze({
  enabled: false, clause: 'clause 13 — Fee Adjustment Where a Claim is Reduced', question: CLAWBACK_QUESTION,
  decided: Object.freeze({
    refund: 'YES' as const,
    time_limit: 'for so long as the claim remains open to enquiry',
    still_open: Object.freeze(['the trigger — any reduction, or only one above a threshold', 'whether it applies to a settlement the client accepts']),
    source: 'Lakhbir was asked if we give money back when a claim is reduced after we are paid. He said yes, with no time limit. Clause 13 now says “for so long as the claim remains open to enquiry”.',
  }),
});

export function clauseThirteenBlanks(openTerms?: readonly OpenTerm[]): readonly OpenTerm[] {
  const terms = openTerms ?? loadLetter().openTerms;
  return terms.filter((t) => /^clause 13 —/.test(t.clause));
}

export type ClawbackReading = { readonly applies: boolean; readonly reason: 'SWITCH_OFF' | 'CLAUSE_13_BLANK' | 'APPLIES'; readonly why: string; readonly blanks: readonly string[] };

export function clawbackReading(opts: { gate?: { readonly enabled: boolean }; openTerms?: readonly OpenTerm[] } = {}): ClawbackReading {
  const gate = opts.gate ?? FEE_CLAWBACK;
  const blanks = clauseThirteenBlanks(opts.openTerms).map((t) => t.text);
  if (!gate.enabled) {
    return { applies: false, reason: 'SWITCH_OFF', blanks,
      why: `Switched off. Nothing happens when a claim is reduced until clause 13 is complete. Still to answer: “${CLAWBACK_QUESTION}”` };
  }
  if (blanks.length > 0) {
    return { applies: false, reason: 'CLAUSE_13_BLANK', blanks,
      why: `Switched on, but clause 13 of the engagement letter still has gaps: ${blanks.join(' ')} So nothing happens yet.` };
  }
  return { applies: true, reason: 'APPLIES', blanks, why: 'When a claim is reduced, Accounting gets a task. They work out the fee again on the new figure, under clause 13.' };
}

type EnquiryRow = {
  id: string; opened_on: string; note: string | null; closed_on: string | null; outcome: string | null; amended_figure_pence: number | null;
  opened_recorded_at: string; opener: string | null;
};

export type EnquiryView = {
  readonly id: string; readonly opened_on: string; readonly note: string | null; readonly open: boolean;
  readonly closed_on: string | null; readonly outcome: string | null; readonly amended_figure: string | null; readonly recorded: string;
};

export type AftercarePanel = {
  readonly enquiries: readonly EnquiryView[];
  readonly enquiry_open: boolean;
  readonly correspondence: string;
  readonly clawback: ClawbackReading;
  readonly disposal: { readonly note: string; readonly tasks: readonly { readonly id: string; readonly title: string; readonly status: string }[] };
  /** PHASE 159l (L15): a return the claim goes into that is not due yet, held here with its due date. */
  readonly returns_to_file: readonly ReturnFiling[];
  readonly may_record: boolean;
};

export const DISPOSAL_NOTE_PATH = '08-monday-doc-exports/12830181411__Disposal-note-the-election-the-client-signs-on-a-future-sale.md';
export const DISPOSAL_TASK_TITLE = 'The election on a future sale — read the Disposal Note';

/**
 * PHASE 153d, 4 October 2026 (Word question 23, the director's): THE FIXED DISPOSAL FEE, read from the job cost model
 * (04-phase-work/phase9/caprebate-job-economics.cjs, `disposalFee`), never restated here. Built on our recommendation:
 * a fixed fee for the review and the drafted election, never a percentage of the sale or the election figure. A TEST
 * DEFAULT, NOT AGREED, and every place it is shown says so. The director decides the figure.
 */
export type DisposalFee = { readonly pounds: number; readonly pence: number; readonly words: string; readonly status: string };
export const DISPOSAL_FEE: DisposalFee = (createRequire(import.meta.url)('../../../../04-phase-work/phase9/caprebate-job-economics.cjs') as { disposalFee: () => DisposalFee }).disposalFee();

export function aftercarePanel(db: Db, actor: Actor, claim_id: string, opts: { openTerms?: readonly OpenTerm[]; today?: string } = {}): AftercarePanel {
  const c = loadClaim(db, claim_id);
  authorise(actor, 'claim_facts.read', { type: 'claim_facts', id: c.id, business_id: c.business_id, assigned_surveyor_ids: [] });
  const enquiries = db.all<EnquiryRow>(
    'SELECT e.id, e.opened_on, e.note, e.closed_on, e.outcome, e.amended_figure_pence, e.opened_recorded_at, u.display_name AS opener ' +
      'FROM hmrc_enquiries e LEFT JOIN users u ON u.id = e.opened_by WHERE e.claim_id = ? ORDER BY e.opened_on DESC, e.rowid DESC',
    [c.id]).map((e) => ({
    id: e.id, opened_on: e.opened_on, note: e.note, open: e.closed_on === null, closed_on: e.closed_on,
    outcome: e.outcome === null ? null : (ENQUIRY_OUTCOMES[e.outcome] ?? e.outcome),
    amended_figure: e.amended_figure_pence === null ? null : formatPence(e.amended_figure_pence),
    recorded: `${localStamp(e.opened_recorded_at)} by ${e.opener ?? 'a former user'}`,
  }));
  const tasks = c.property_id === null ? [] : db.all<{ id: string; title: string; status: string }>(
    'SELECT id, title, status FROM staff_tasks WHERE property_id = ? AND title = ? ORDER BY created_at DESC', [c.property_id, DISPOSAL_TASK_TITLE]);
  return {
    enquiries, enquiry_open: enquiries.some((e) => e.open),
    correspondence: `Letters with HMRC are stored as Correspondence. ${NO_RECEIPT_POLICY} Still to decide: ${RECEIPT_QUESTION}`,
    clawback: clawbackReading(opts.openTerms === undefined ? {} : { openTerms: opts.openTerms }),
    disposal: {
      note: `If the property gets a sale date, or a sale is expected, Sales gets a task to read the Disposal Note. Our fee for that work: ${DISPOSAL_FEE.words}`,
      tasks,
    },
    returns_to_file: ((accountantFiles(db, c.id) ? returnFilings : staffReturnFilings)(db, c.id, opts.today ?? new Date().toISOString()) ?? []).filter((r) => r.state === 'NOT_DUE'),
    may_record: can(actor, 'hmrc_enquiry.record', { type: 'hmrc_enquiry', id: c.id, business_id: c.business_id }),
  };
}

export function openEnquiry(d: RecordDeps, actor: Actor, claim_id: string, input: Fields): RecordResult {
  const c = loadClaim(d.db, claim_id);
  authorise(actor, 'hmrc_enquiry.record', { type: 'hmrc_enquiry', id: c.id, business_id: c.business_id });
  const opened = dateValue(input['opened_on']);
  if (opened === null) return { ok: false, why: 'Write the date HMRC opened the enquiry, like 2026-03-31.' };
  if (opened > localDate(d.now())) return { ok: false, why: 'The date the enquiry opened cannot be after today.' };
  if (d.db.get<{ id: string }>('SELECT id FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NULL', [c.id]) !== undefined) {
    return { ok: false, why: 'An enquiry is already open on this claim. Close it first.' };
  }
  const note = text(input['note'], 2000, 'The note');
  if (!note.ok) return note;
  const id = d.newId();
  const at = d.now();
  d.db.run('INSERT INTO hmrc_enquiries (id, claim_id, opened_on, note, opened_by, opened_recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, c.id, opened, note.value, actor.id, at]);
  d.audit.append({
    at, kind: 'HMRC_ENQUIRY_OPENED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { enquiry: id, business: c.business_id },
  });
  return { ok: true, id };
}

/**
 * CLOSE AN ENQUIRY. Where it reduces the allowances below the figure the tax
 * adviser signed, clause 13 is asked — and while its switch is off, or the clause
 * is blank, nothing is raised and the audit records which.
 */
export function closeEnquiry(
  d: RecordDeps, actor: Actor, claim_id: string, enquiry_id: string, input: Fields,
  opts: { gate?: { readonly enabled: boolean }; openTerms?: readonly OpenTerm[] } = {},
): RecordResult {
  const c = loadClaim(d.db, claim_id);
  authorise(actor, 'hmrc_enquiry.record', { type: 'hmrc_enquiry', id: c.id, business_id: c.business_id });
  const e = d.db.get<{ id: string; opened_on: string; closed_on: string | null }>('SELECT id, opened_on, closed_on FROM hmrc_enquiries WHERE id = ? AND claim_id = ?', [enquiry_id, c.id]);
  if (e === undefined) throw new NotFoundAsRefusal();
  if (e.closed_on !== null) return { ok: false, why: 'That enquiry is already closed, and its outcome does not change.' };
  const closedOn = dateValue(input['closed_on']);
  if (closedOn === null) return { ok: false, why: 'Write the date the enquiry closed, like 2026-03-31.' };
  if (closedOn < e.opened_on || closedOn > localDate(d.now())) return { ok: false, why: 'The close date must be on or after the day it opened, and not after today.' };
  const outcome = input['outcome'] ?? null;
  if (!has(ENQUIRY_OUTCOMES, outcome)) return { ok: false, why: 'Choose how the enquiry closed.' };
  const amended = outcome === 'NO_CHANGE' ? null : penceValue(input['amended_figure']);
  if (outcome !== 'NO_CHANGE' && amended === null) return { ok: false, why: 'Write the allowances HMRC agreed, in pounds.' };
  const at = d.now();
  d.db.run('UPDATE hmrc_enquiries SET closed_on = ?, outcome = ?, amended_figure_pence = ?, closed_by = ?, closed_recorded_at = ? WHERE id = ?',
    [closedOn, outcome, amended, actor.id, at, e.id]);
  d.audit.append({
    at, kind: 'HMRC_ENQUIRY_CLOSED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { enquiry: e.id, enquiry_outcome: outcome, business: c.business_id },
  });
  const signed = latestSignOff(d.db, c.id);
  if (outcome === 'AMENDED_DOWN' && signed !== undefined && amended !== null && amended < signed.figure_pence) {
    const reading = clawbackReading(opts);
    if (!reading.applies) {
      d.audit.append({
        at, kind: 'FEE_CLAWBACK_NOT_APPLIED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'claim', object_id: c.id, detail: { enquiry: e.id, reason: reading.reason, business: c.business_id },
      });
    } else {
      insertTask(d.db, d.now, d.newId, {
        title: 'A claim was reduced on enquiry — recalculate the fee under clause 13',
        description: `HMRC reduced the allowances on ${closedOn}. Under clause 13 of the engagement letter, work out the fee again on the new figure. Then credit or refund the difference.`,
        owner_id: null, owner_role: 'ACCOUNTING', due_on: null, priority: null, activity_type: 'TASK',
        business_id: c.business_id, property_id: null, claim_id: c.id, lead_id: null, contact_id: null, fact_id: null,
        recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: actor.id,
      });
    }
  }
  return { ok: true, id: e.id };
}

/**
 * A DISPOSAL DATE SET, OR A SALE IN PROSPECT — A TASK POINTING AT THE DISPOSAL
 * NOTE: the election on a future sale is irrevocable, notified within two years
 * of completion, with a s.203 notice to follow. Waiting with Sales, due on no
 * date. One open task per property: a second change raises nothing more.
 * Called by `updateProperty` in src/web/crm.ts after its write.
 */
export function raiseDisposalTask(
  d: RecordDeps, actor: Actor, property: { id: string; business_id: string }, trigger: 'DISPOSAL_DATE' | 'SALE_IN_PROSPECT',
): string | null {
  const open = d.db.get<{ id: string }>(
    "SELECT id FROM staff_tasks WHERE property_id = ? AND title = ? AND status IN ('OPEN','IN_PROGRESS')", [property.id, DISPOSAL_TASK_TITLE]);
  if (open !== undefined) return null;
  const why = trigger === 'DISPOSAL_DATE' ? 'The property’s sale date was set.' : 'A sale of the property is expected.';
  const id = insertTask(d.db, d.now, d.newId, {
    title: DISPOSAL_TASK_TITLE,
    description: `${why} Read the Disposal Note (${DISPOSAL_NOTE_PATH}) with the client before heads of terms. A s.198 election on the sale ` +
      'cannot be undone. It must be notified to HMRC within two years of completion. It may also start a three-month s.203 clock. ' +
      `Our fee for this work: ${DISPOSAL_FEE.words}`,
    owner_id: null, owner_role: 'SALES', due_on: null, priority: null, activity_type: 'TASK',
    business_id: property.business_id, property_id: property.id, claim_id: null, lead_id: null, contact_id: null, fact_id: null,
    recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: actor.id,
  });
  d.audit.append({
    at: d.now(), kind: 'STAFF_TASK_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'staff_task', object_id: id, detail: { task: id, business: property.business_id, property: property.id, route: 'disposal_note', trigger },
  });
  return id;
}

/* ================================================================== *
 * 7 · THE GATE NEEDS THE WINDOW ADDS
 * ================================================================== */

/**
 * REPORTS — PHASE 159d (C1, L9): EVERY PART OF THE CLAIM HAS A ROUTE, AND ONE IS CLAIMED. It read "the amendment window
 * is open today", so a building bought in 2019 and still owned was turned away, though its spend goes into this year's
 * pool (W2). Now each event on the building takes its route (src/web/claim-route.ts): W1 the window for its own period
 * is open, W2 it is closed but the building is still owned, W3 not owned, or the purchase fails the legal check. The
 * gate passes when every part has a known route and at least one is W1 or W2. NOT_KNOWN passes nothing (N4).
 */
export function reportsWindowNeed(db: Db, c: { id: string; business_id: string; property_id: string | null }, todayIso: string): Need {
  const routes = claimRoutes(db, c, todayIso);
  const { alive, settled } = claimAlive(routes);
  const what = 'Each part of the claim has a route, and at least one goes in';
  if (!settled) return { what, met: false, why: routesWhy(routes) };
  if (!alive) return { what, met: false, why: `nothing is left to claim: ${routesWhy(routes)}` };
  return { what, met: true, why: routesWhy(routes) };
}

/**
 * INVOICE — PHASE 159d: THE RETURN EACH ROUTE NAMES WENT IN, OR CAN STILL GO IN. W1 names the return for the event's own
 * period; W2 names the return of the first open period. Where the filing is recorded, it must fall on or before that
 * return's deadline — a window that closed after the return went in does not stop the fee. Where it is not, that window
 * must be open today. A part with no route passes nothing; a part that is W3 is not claimed and asks nothing.
 */
export function invoiceWindowNeed(db: Db, c: { id: string; business_id: string; property_id: string | null }, todayIso: string): Need {
  const routes = claimRoutes(db, c, todayIso);
  const filed = db.get<{ filed_on: string | null }>('SELECT filed_on FROM claim_reconciliations WHERE claim_id = ?', [c.id])?.filed_on ?? null;
  const what = 'The claim is within the amendment window';
  const live = routes.filter((r) => r.route !== 'W3');
  if (live.length === 0) return { what, met: false, why: `nothing is left to claim: ${routesWhy(routes)}` };
  // A part passes on a filing recorded inside the window of the return its route names — its own (W1), or, through the
  // pool, the first open one (W2) — or, with no filing yet, that window open today. A filing inside a part's own window
  // passes whatever today's route reads: the return went in while it could (the window has closed since).
  const today = localDate(todayIso);
  const ok = (r: (typeof live)[number]): boolean => filed !== null
    ? (r.window.deadline !== null && filed <= r.window.deadline) || (r.route === 'W2' && r.deadline !== null && filed <= r.deadline)
    : (r.route === 'W1' || r.route === 'W2') && r.deadline !== null && today <= r.deadline;
  const say = (r: (typeof live)[number]): string => r.route === 'NOT_KNOWN' && !(filed !== null && r.window.deadline !== null)
    ? `${r.label}: no route yet — ${r.why}`
    : `${r.label}: ${filed !== null ? `filed on ${filed}, ` : ''}${r.route === 'W2' ? 'the first open return' : 'its own return'} can be amended until ${(r.route === 'W2' ? r.deadline : r.window.deadline) ?? 'a date not known'}`;
  const bad = live.filter((r) => !ok(r));
  if (bad.length > 0) return { what, met: false, why: `${bad.map(say).join('; ')}${filed === null ? ' — and no filing is recorded' : ''}` };
  return { what, met: true, why: live.map(say).join('; ') };
}
