/**
 * THE DEFENCE PACK GENERATOR — BUILT, AND SWITCHED OFF. Phase 132, 14 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, SWITCHED ON
 *
 * It gathers what a defence pack must carry, from the records that sealed each
 * part, into one MANIFEST hashed with SHA-256: the case stamp (src/web/case-stamp.ts),
 * the surveyor's commitment, the sources of the facts the gates read, the
 * reconciliation snapshot, the tax adviser's sign-off record, the s.203 position,
 * the anchor log for the claim's survey jobs, and the issued deliverables with
 * their hashes. A section with nothing sealed to show is MISSING, named, and the
 * manifest is INCOMPLETE. THE MANIFEST IS NOT A PACK AND NOTHING IS ISSUED: the
 * defence pack is still a deliverable recorded in the register, by a person, with
 * the hash of the pack as issued (Developer Spec DS-W10).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * What a defence pack must contain is the Defence Pack Template's to say, and the
 * chartered tax adviser has not signed it off. `DEFENCE_PACK_GENERATOR` ships
 * `enabled: false`; while it is off a request is refused BEFORE anything is read
 * or written, and what it waits on is written in `waits_on`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * N4 — A FACT RECORDED AS NOT KNOWN AND ONE NEVER RECORDED READ IDENTICALLY
 *
 * A section that rests on a claim fact is PRESENT only on a recorded VALUE. An
 * UNKNOWN answer and no answer give the same MISSING section, word for word and
 * with no row cited — so a pack can never be called complete on a fact nobody knows.
 */

import { createHash } from 'node:crypto';
import { _canonical } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { latestFacts } from './claim-facts.ts';
import { commitmentOnClaim, deliverableIssued, latestSignOff, type RecordDeps } from './claim-record.ts';
import { caseStamp, type CaseStamp } from './case-stamp.ts';

export type DefencePackSwitch = { readonly enabled: boolean; readonly waits_on: string };

export const DEFENCE_PACK_GENERATOR: DefencePackSwitch = Object.freeze({
  enabled: false,
  waits_on: 'the chartered tax adviser signing off the Defence Pack Template',
});

export const DEFENCE_PACK_OFF =
  'Building a defence pack is not switched on yet. Nothing was built or saved. It is switched on after ' +
  `${DEFENCE_PACK_GENERATOR.waits_on}.`;

export type SectionKey =
  | 'SURVEYOR_COMMITMENT' | 'SOURCES' | 'RECONCILIATION' | 'SIGNOFF' | 'S203_POSITION' | 'ANCHOR_LOG' | 'DELIVERABLE_HASHES';

/** The sections, in the order a manifest lists them. */
export const DEFENCE_PACK_SECTIONS: Readonly<Record<SectionKey, string>> = Object.freeze({
  SURVEYOR_COMMITMENT: 'The surveyor’s committed figures, locked, with their fingerprint',
  SOURCES: 'Where each fact the claim’s checks use came from',
  RECONCILIATION: 'The reconciliation snapshot',
  SIGNOFF: 'The tax adviser’s sign-off record',
  S203_POSITION: 'The s.203 position',
  ANCHOR_LOG: 'The anchor log for the claim’s survey jobs',
  DELIVERABLE_HASHES: 'The documents we issued, and their fingerprints',
});

/** The facts the gates read and a pack must cite a source for. Each is PRESENT only on a recorded VALUE. */
export const SOURCE_FACTS: readonly string[] = Object.freeze(['ACCOUNTING_PERIOD_START', 'ACCOUNTING_PERIOD_END', 'ELECTION_EXISTS', 'GRANTS_EXIST']);

export type Section = {
  readonly key: SectionKey;
  readonly label: string;
  readonly state: 'PRESENT' | 'MISSING';
  readonly why: string;
  /** What the section cites: ids, kinds and hashes. Never a value, a note or a name. */
  readonly refs: readonly Readonly<Record<string, string | number | null>>[];
};

export type DefencePackManifest = {
  readonly kind: 'DEFENCE_PACK_MANIFEST';
  readonly claim_id: string;
  readonly case_id: string;
  readonly generated_at: string;
  readonly generated_by: string;
  readonly stamp: CaseStamp;
  readonly sections: readonly Section[];
};

export type DefencePackResult =
  | { readonly ok: false; readonly why: string }
  | {
      readonly ok: true;
      readonly state: 'INCOMPLETE' | 'COMPLETE';
      readonly missing: readonly SectionKey[];
      readonly manifest: DefencePackManifest;
      readonly manifest_hash: string;
      readonly issued: false;
      readonly note: string;
    };

export const MANIFEST_NOTE =
  'This is a list of contents, not the pack. Nothing is issued. A person records the pack when it is issued, with its fingerprint.';

function section(key: SectionKey, present: boolean, why: string, refs: Section['refs'] = []): Section {
  return { key, label: DEFENCE_PACK_SECTIONS[key], state: present ? 'PRESENT' : 'MISSING', why, refs };
}

function sha256(v: unknown): string {
  return createHash('sha256').update(_canonical(v)).digest('hex');
}

/**
 * BUILD THE MANIFEST. Refused, with nothing read or written, while the generator is
 * off. On, it reads the sealed records, writes one audit line and nothing else.
 */
export function generateDefencePack(d: RecordDeps, actor: Actor, claim_id: string, sw: DefencePackSwitch = DEFENCE_PACK_GENERATOR): DefencePackResult {
  const c = d.db.get<{ id: string; claim_ref: string; business_id: string }>('SELECT id, claim_ref, business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'defence_pack.generate', { type: 'claim_figures', id: c.id, business_id: c.business_id });
  if (!sw.enabled) return { ok: false, why: DEFENCE_PACK_OFF };

  const sections: Section[] = [];

  const k = commitmentOnClaim(d.db, c.id);
  sections.push(k === undefined
    ? section('SURVEYOR_COMMITMENT', false, 'No surveyor has committed figures on this claim yet.')
    : section('SURVEYOR_COMMITMENT', true, 'the surveyor’s committed figures, locked', [{ commitment: k.id, figures_hash: k.figures_hash }]));

  // SOURCES — a VALUE is cited with its source; UNKNOWN and absent are the same "not known", citing no row.
  const facts = latestFacts(d.db, c.id);
  const cited: Record<string, string | number | null>[] = [];
  const notKnown: string[] = [];
  for (const key of SOURCE_FACTS) {
    const r = facts.get(key);
    if (r === undefined || r.answer !== 'VALUE') notKnown.push(key);
    else cited.push({ fact_key: key, fact: r.id, source_id: r.source_id });
  }
  sections.push(notKnown.length === 0
    ? section('SOURCES', true, 'every fact the checks use is recorded, with where it came from', cited)
    : section('SOURCES', false, `Not known yet. Not known and never asked count the same: ${notKnown.join(', ')}`,
      notKnown.map((key) => ({ fact_key: key, fact: null, source_id: null }))));

  const recon = d.db.get<{ id: string; snapshot_hash: string }>('SELECT id, snapshot_hash FROM claim_reconciliations WHERE claim_id = ?', [c.id]);
  sections.push(recon === undefined
    ? section('RECONCILIATION', false, 'No reconciliation yet. It starts when the first sign-off is recorded.')
    : section('RECONCILIATION', true, 'the reconciliation snapshot, fixed when it opened', [{ reconciliation: recon.id, snapshot_hash: recon.snapshot_hash }]));

  const s = latestSignOff(d.db, c.id);
  sections.push(s === undefined
    ? section('SIGNOFF', false, 'No sign-off is recorded for this claim yet.')
    : section('SIGNOFF', true, 'the tax adviser’s latest sign-off record — a record, not a signature', [{ signoff: s.id, record_hash: s.record_hash }]));

  // S.203 — stated only on a known answer to whether an election affects the property.
  const election = facts.get('ELECTION_EXISTS');
  const answer = election !== undefined && election.answer === 'VALUE' ? (election.value_text ?? null) : null;
  if (answer === 'NO') {
    sections.push(section('S203_POSITION', true, 'No s.198 or s.199 election covers the property, as recorded. So no s.203 notice is needed.',
      [{ fact: election?.id ?? null, source_id: election?.source_id ?? null }]));
  } else if (answer === 'YES') {
    sections.push(deliverableIssued(d.db, c.id, 'S203_NOTIFICATION')
      ? section('S203_POSITION', true, 'An election covers the property. The s.203 notice is issued.', [{ fact: election?.id ?? null, deliverable_kind: 'S203_NOTIFICATION' }])
      : section('S203_POSITION', false, 'An election covers the property. No s.203 notice is issued yet.'));
  } else {
    sections.push(section('S203_POSITION', false,
      'We do not know if an election covers the property. Not known and never asked count the same. So we cannot say where s.203 stands.'));
  }

  const anchorCount = d.db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?)', [c.id])?.n ?? 0;
  const anchorLast = d.db.get<{ seq: number; hash: string }>(
    'SELECT seq, hash FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?) ORDER BY seq DESC LIMIT 1', [c.id]);
  sections.push(anchorLast === undefined
    ? section('ANCHOR_LOG', false, 'No anchor log entry yet for a survey job on this claim.')
    : section('ANCHOR_LOG', true, `${anchorCount} anchor log ${anchorCount === 1 ? 'entry' : 'entries'} for the claim’s survey jobs, the latest added to the audit log`,
      [{ entries: anchorCount, last_seq: anchorLast.seq, last_hash: anchorLast.hash }]));

  const delivered = d.db.all<{ id: string; kind: string; version: number; state: string; content_hash: string | null }>(
    "SELECT id, kind, version, state, content_hash FROM claim_deliverables WHERE claim_id = ? AND state IN ('ISSUED','SUPERSEDED') ORDER BY kind ASC, version ASC",
    [c.id]);
  const unhashed = delivered.filter((x) => x.content_hash === null);
  const reportIssued = delivered.some((x) => x.kind === 'CLIENT_REPORT');
  const refs = delivered.map((x) => ({ deliverable: x.id, deliverable_kind: x.kind, version: x.version, content_hash: x.content_hash }));
  sections.push(!reportIssued
    ? section('DELIVERABLE_HASHES', false, 'No client report is issued on this claim yet.', refs)
    : unhashed.length > 0
      ? section('DELIVERABLE_HASHES', false, `${unhashed.length} issued ${unhashed.length === 1 ? 'document has' : 'documents have'} no fingerprint, so we do not know what was issued`, refs)
      : section('DELIVERABLE_HASHES', true, 'every issued document has a fingerprint of what was issued', refs));

  const at = d.now();
  const manifest: DefencePackManifest = {
    kind: 'DEFENCE_PACK_MANIFEST', claim_id: c.id, case_id: c.claim_ref, generated_at: at, generated_by: actor.id,
    stamp: caseStamp(d.db, c.id), sections,
  };
  const manifest_hash = sha256(manifest);
  const missing = sections.filter((x) => x.state === 'MISSING').map((x) => x.key);
  const state = missing.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
  d.audit.append({
    at, kind: 'DEFENCE_PACK_GENERATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { state, sections_missing: missing.length, manifest_hash, business: c.business_id },
  });
  return { ok: true, state, missing, manifest, manifest_hash, issued: false, note: MANIFEST_NOTE };
}
