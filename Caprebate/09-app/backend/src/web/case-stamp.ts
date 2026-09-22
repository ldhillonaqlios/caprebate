/**
 * THE CASE STAMP — WHAT DECIDED A SEALED CASE, WRITTEN WHEN A DELIVERABLE IS ISSUED.
 * Phase 132, 14 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 *
 * A claim is defended years after it is filed, by which time the engine, the
 * rulebooks and the switches will all have moved. Before this phase the engine
 * version was kept in one place — the reconciliation's `a_engine_version` — the
 * sign-off kept only the CTA switches its adviser confirmed, and nothing kept the
 * rulebook versions, the free register gate or a single back-end switch. So a
 * question from HMRC in 2031 — "on what rules was this computed?" — had no record
 * to answer it from.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT A STAMP HOLDS, AND WHEN
 *
 * One row in `claim_version_stamps` (migration 022) per ISSUED deliverable of
 * every kind, written by `recordDeliverable` in the same transaction that issues
 * it: the engine version (NULL reads "not known", never a default), the rulebook
 * module versions, EVERY CB_CTA switch and its position, the free register gate,
 * every back-end switch and its position, each sign-off record with its hash, the
 * estimate's hash and the head of the anchor log. Hashed, and never changed.
 *
 * ALWAYS ON. It is record-keeping and relieves nothing, so there is no switch to
 * wait on — a stamp that could be turned off would be a record that could be
 * missing for no reason anybody wrote down.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE COUNTS ARE DERIVED, NEVER QUOTED
 *
 * The CTA switches are `ctaSwitchReadings()`, which reads every boolean on CB_CTA.
 * The back-end switches are listed by name below, and test/phase132-records.test.ts
 * greps src/ for every frozen `enabled:` switch and fails if one is not listed
 * here — so a switch added later is either stamped or a red test.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db.ts';
import { _canonical } from '../audit.ts';
import { DPO_ROLE_SWITCH } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { ctaSwitchReadings, registryGate } from './engine.ts';
import { DISCLOSURE_LOG } from './disclosure-log.ts';
import { CLIENT_SHARE_GIVE, REFERRAL_FORM } from './introducers.ts';
import { CONVEYANCING_STRIP } from './conveyancing-strip.ts';
import { FEE_CONTROLS } from './fee-controls.ts';
import { MANDATORY_DOCUMENTS } from './mandatory-documents.ts';
import { KEEP_ORIGINALS } from './originals.ts';
import { MESSAGE_RETENTION } from './message-retention.ts';
import { EMAIL_SENDING } from '../stubs/email-provider.ts';
import { ENGAGEMENT_SIGNING } from './signing.ts';
import { INBOUND_EMAIL } from '../stubs/email-inbound.ts';
import { FEE_CLAWBACK } from './claim-record.ts';
import { DEFENCE_PACK_GENERATOR } from './defence-pack.ts';
import { ALLOWANCE_PROFIT_COMPARISON } from './allowance-profit-comparison.ts';
import { FUNNEL_SWITCHES } from './funnel-session.ts';

function sha256(v: unknown): string {
  return createHash('sha256').update(_canonical(v)).digest('hex');
}

/* ================================================================== *
 * 1 · THE ENGINE VERSION
 * ================================================================== */

/** The engine package this build ships — a file of the build, as the engagement letter is (src/web/letter.ts), never a request path. */
export const ENGINE_PACKAGE_PATH = join(import.meta.dirname, '..', '..', '..', 'engine', 'package.json');

let engineVersion: string | null | undefined;

/** The engine package's own `version`, or null where it states none. Moved here from src/web/claim-record.ts by Phase 132. */
export function readEngineVersion(): string | null {
  if (engineVersion !== undefined) return engineVersion;
  try {
    const p = JSON.parse(readFileSync(ENGINE_PACKAGE_PATH, 'utf8')) as { version?: unknown };
    engineVersion = typeof p.version === 'string' ? p.version : null;
  } catch { engineVersion = null; }
  return engineVersion;
}

/* ================================================================== *
 * 2 · THE RULEBOOK MODULES
 * ================================================================== */

export type RulebookModule = {
  readonly module: string;
  readonly version: string;
  readonly file: string;
  readonly board_item: string;
  readonly monday_doc: string | null;
};

/**
 * THE ELEVEN RULEBOOK FILES, AS 01-rulebooks/README.md LISTS THEM.
 *
 * THE FILENAME IS THE ONLY CARRIER OF A RULEBOOK'S VERSION. No rulebook states
 * its version in a field, no manifest lists them and the engine does not know
 * them: the `-v1` or `-v2` at the end of the file's name is all there is. So this
 * list is those names, as the README gives them, and the test reads the README
 * and fails the day the two disagree. A rulebook re-issued as v3 is a new line
 * here, and every case stamped before it still says v2.
 */
export const RULEBOOK_MODULES: readonly RulebookModule[] = Object.freeze([
  { module: 'A', version: 'v2', file: 'Caprebate-Statutory-Rules-Register-A-Claim-Timing-v2.md', board_item: '12830178875', monday_doc: null },
  { module: 'B', version: 'v2', file: 'Caprebate-Entitlement-Branch-Truth-Table-B-v2.md', board_item: '12830182172', monday_doc: null },
  { module: 'C', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-C-Elections-v1.md', board_item: '12841288962', monday_doc: null },
  { module: 'D', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-D-What-Qualifies-As-Plant-v1.md', board_item: '12851645135', monday_doc: null },
  { module: 'E', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-E-Dwelling-House-v1.md', board_item: '12910751557', monday_doc: null },
  { module: 'F', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-F-Contributions-And-Grants-v1.md', board_item: '12910769642', monday_doc: null },
  { module: 'G', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-G-Repairs-vs-Capital-v1.md', board_item: '12830061107', monday_doc: '18427873138' },
  { module: 'H', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-H-Land-Remediation-Relief-v1.md', board_item: '12830043662', monday_doc: '18427873476' },
  { module: 'I', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-I-Rates-And-Reliefs-Table-v1.md', board_item: '12830060773', monday_doc: '18427874000' },
  { module: 'I-ADDENDUM-1', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-I-Addendum-1-Scottish-Income-Tax-v1.md', board_item: '12889350666', monday_doc: '18428034700' },
  { module: 'A-ADDENDUM-1', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-A-Addendum-1-Two-Year-Fixed-Value-Window-v1.md', board_item: '12921255840', monday_doc: '18428623683' },
].map((m) => Object.freeze(m)));

/* ================================================================== *
 * 3 · EVERY SWITCH
 * ================================================================== */

export type BackendSwitchReading = { readonly switch: string; readonly on: boolean; readonly home: string };

/**
 * EVERY BACK-END SWITCH, BY NAME, WITH ITS POSITION AS THIS BUILD SHIPS IT.
 *
 *   DISCLOSURE_LOG               the per-disclosure log                          src/web/disclosure-log.ts
 *   DPO_ROLE_SWITCH              a data protection officer role                  src/authz.ts
 *   FEE_CLAWBACK                 clause 13 — the fee follows a reduced claim     src/web/claim-record.ts
 *   REFERRAL_FORM                the public referral form                        src/web/introducers.ts
 *   CLIENT_SHARE_GIVE            a client giving the share-progress answer       src/web/introducers.ts
 *   CONVEYANCING_STRIP           company names kept on conveyancing uploads      src/web/conveyancing-strip.ts
 *   FEE_CONTROLS.above_benefit   the fee above the benefit                       src/web/fee-controls.ts
 *   FEE_CONTROLS.break_and_abort the break and abort fees                        src/web/fee-controls.ts
 *   MANDATORY_DOCUMENTS          the documents a gate requires                   src/web/mandatory-documents.ts
 *   KEEP_ORIGINALS               keeping the file a client sent (Phase 140)      src/web/originals.ts
 *   EMAIL_SENDING                sending email from contactus@ (Phase 141)       src/stubs/email-provider.ts
 *   INBOUND_EMAIL                reading replies to contactus@ (Phase 142)       src/stubs/email-inbound.ts
 *   ENGAGEMENT_SIGNING           the built-in letter signature (Phase 146f)      src/web/signing.ts
 *   MESSAGE_RETENTION            the message clean-up job (Phase 142a)           src/web/message-retention.ts
 *   DEFENCE_PACK_GENERATOR       the defence pack manifest                       src/web/defence-pack.ts
 *   ALLOWANCE_PROFIT_COMPARISON  the with-and-without allowance and profit run   src/web/allowance-profit-comparison.ts
 *   FUNNEL_SWITCHES.breakeven_is_insufficient_profit
 *                                break-even read as insufficient profit          src/web/funnel-session.ts
 *
 * FEE_CONTROLS.minimum_fee left this list in Phase 132e (16 September 2026): the minimum fee is decided none, and the
 * control is retired — MINIMUM_FEE_DECISION in src/web/fee-controls.ts records it.
 *
 * ALLOWANCE_PROFIT_COMPARISON was added by another Phase 132 workstream while this
 * list was being written; the grep test found it the same day, which is what it is for.
 * The funnel's switch is not an `enabled` flag, so the grep cannot see it: it is
 * stamped by its own key, and the test counts FUNNEL_SWITCHES's booleans.
 *
 * READ WHEN ASKED, NOT WHEN THIS FILE LOADS: src/web/claim-record.ts and
 * src/web/defence-pack.ts import this file, and it imports them, so nothing here
 * touches their exports until a stamp is taken.
 */
export function backendSwitchReadings(): readonly BackendSwitchReading[] {
  return [
    { switch: 'DISCLOSURE_LOG', on: DISCLOSURE_LOG.enabled, home: 'src/web/disclosure-log.ts' },
    { switch: 'DPO_ROLE_SWITCH', on: DPO_ROLE_SWITCH.enabled, home: 'src/authz.ts' },
    { switch: 'FEE_CLAWBACK', on: FEE_CLAWBACK.enabled, home: 'src/web/claim-record.ts' },
    { switch: 'REFERRAL_FORM', on: REFERRAL_FORM.enabled, home: 'src/web/introducers.ts' },
    { switch: 'CLIENT_SHARE_GIVE', on: CLIENT_SHARE_GIVE.enabled, home: 'src/web/introducers.ts' },
    { switch: 'CONVEYANCING_STRIP', on: CONVEYANCING_STRIP.enabled, home: 'src/web/conveyancing-strip.ts' },
    { switch: 'FEE_CONTROLS.above_benefit', on: FEE_CONTROLS.above_benefit.enabled, home: 'src/web/fee-controls.ts' },
    { switch: 'FEE_CONTROLS.break_and_abort', on: FEE_CONTROLS.break_and_abort.enabled, home: 'src/web/fee-controls.ts' },
    { switch: 'MANDATORY_DOCUMENTS', on: MANDATORY_DOCUMENTS.enabled, home: 'src/web/mandatory-documents.ts' },
    { switch: 'KEEP_ORIGINALS', on: KEEP_ORIGINALS.enabled, home: 'src/web/originals.ts' },
    { switch: 'EMAIL_SENDING', on: EMAIL_SENDING.enabled, home: 'src/stubs/email-provider.ts' },
    { switch: 'INBOUND_EMAIL', on: INBOUND_EMAIL.enabled, home: 'src/stubs/email-inbound.ts' },
    { switch: 'ENGAGEMENT_SIGNING', on: ENGAGEMENT_SIGNING.enabled, home: 'src/web/signing.ts' },
    { switch: 'MESSAGE_RETENTION', on: MESSAGE_RETENTION.enabled, home: 'src/web/message-retention.ts' },
    { switch: 'DEFENCE_PACK_GENERATOR', on: DEFENCE_PACK_GENERATOR.enabled, home: 'src/web/defence-pack.ts' },
    { switch: 'ALLOWANCE_PROFIT_COMPARISON', on: ALLOWANCE_PROFIT_COMPARISON.enabled, home: 'src/web/allowance-profit-comparison.ts' },
    { switch: 'FUNNEL_SWITCHES.breakeven_is_insufficient_profit', on: FUNNEL_SWITCHES.breakeven_is_insufficient_profit, home: 'src/web/funnel-session.ts' },
  ];
}

/* ================================================================== *
 * 4 · THE STAMP
 * ================================================================== */

export type CaseStamp = {
  readonly claim_id: string;
  readonly engine_version: string | null;
  readonly engine_version_reading: string;
  readonly rulebook_modules: readonly RulebookModule[];
  readonly cta_switches: readonly { readonly switch: string; readonly on: boolean }[];
  readonly registry_free_enabled: boolean;
  readonly backend_switches: readonly BackendSwitchReading[];
  readonly signoffs: readonly { readonly id: string; readonly record_hash: string }[];
  readonly estimate_hash: string | null;
  readonly anchor_log_head_hash: string | null;
};

/**
 * WHAT DECIDED THIS CLAIM, AS OF NOW. Read, never stored — `writeCaseStamp`
 * below is what seals it. The anchor log's head is the head of the WHOLE chain at
 * the moment of the stamp, not one job's: it fixes everything written before it.
 */
export function caseStamp(db: Db, claim_id: string): CaseStamp {
  const c = db.get<{ id: string; assessment_id: string | null }>('SELECT id, assessment_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  const engine = readEngineVersion();
  const estimate = c.assessment_id === null ? undefined
    : db.get<{ estimate_hash: string }>('SELECT estimate_hash FROM estimates WHERE assessment_id = ?', [c.assessment_id]);
  return {
    claim_id: c.id,
    engine_version: engine,
    engine_version_reading: engine ?? 'not known',
    rulebook_modules: RULEBOOK_MODULES,
    cta_switches: ctaSwitchReadings(),
    registry_free_enabled: registryGate().enabled,
    backend_switches: backendSwitchReadings(),
    signoffs: db.all<{ id: string; record_hash: string }>(
      'SELECT id, record_hash FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at ASC, rowid ASC', [c.id]),
    estimate_hash: estimate?.estimate_hash ?? null,
    anchor_log_head_hash: db.get<{ hash: string }>('SELECT hash FROM anchor_log ORDER BY seq DESC LIMIT 1')?.hash ?? null,
  };
}

/** The row's own fields, as the hash covers them. test/phase132-records.test.ts recomputes it from the stored row. */
export function stampHashInput(r: {
  id: string; claim_id: string; deliverable_id: string; engine_version: string | null; rulebook_modules: unknown;
  switch_readings: unknown; signoff_refs: unknown; estimate_hash: string | null; anchor_log_head_hash: string | null;
  stamped_by: string; stamped_at: string;
}): Record<string, unknown> {
  return {
    id: r.id, claim_id: r.claim_id, deliverable_id: r.deliverable_id, engine_version: r.engine_version,
    rulebook_modules: r.rulebook_modules, switch_readings: r.switch_readings, signoff_refs: r.signoff_refs,
    estimate_hash: r.estimate_hash, anchor_log_head_hash: r.anchor_log_head_hash, stamped_by: r.stamped_by, stamped_at: r.stamped_at,
  };
}

/**
 * SEAL THE STAMP FOR ONE ISSUED DELIVERABLE. Called inside the transaction that
 * issues it, after the deliverable is ISSUED — migration 022's trigger refuses a
 * stamp for anything else — so a stamp that cannot be written takes the issue
 * back with it.
 */
export function writeCaseStamp(
  db: Db, input: { id: string; claim_id: string; deliverable_id: string; stamped_by: string; stamped_at: string },
): { readonly id: string; readonly stamp_hash: string; readonly stamp: CaseStamp } {
  const stamp = caseStamp(db, input.claim_id);
  const switch_readings = { cta: stamp.cta_switches, registry_free_enabled: stamp.registry_free_enabled, backend: stamp.backend_switches };
  const row = {
    ...input, engine_version: stamp.engine_version, rulebook_modules: stamp.rulebook_modules, switch_readings,
    signoff_refs: stamp.signoffs, estimate_hash: stamp.estimate_hash, anchor_log_head_hash: stamp.anchor_log_head_hash,
  };
  const stamp_hash = sha256(stampHashInput(row));
  db.run(
    'INSERT INTO claim_version_stamps (id, claim_id, deliverable_id, engine_version, rulebook_modules_json, switch_readings_json, ' +
      'signoff_refs_json, estimate_hash, anchor_log_head_hash, stamp_hash, stamped_by, stamped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [input.id, input.claim_id, input.deliverable_id, stamp.engine_version, JSON.stringify(stamp.rulebook_modules), JSON.stringify(switch_readings),
      JSON.stringify(stamp.signoffs), stamp.estimate_hash, stamp.anchor_log_head_hash, stamp_hash, input.stamped_by, input.stamped_at],
  );
  return { id: input.id, stamp_hash, stamp };
}
