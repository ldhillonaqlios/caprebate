/**
 * THE BREACH REGISTER. CRM 8 of 10, 12 September 2026.
 *
 * Built to the Personal Data Breach Register and Incident Response Procedure
 * (08-monday-doc-exports/12927581028) — Table A the facts, Table B the decisions,
 * the closure test at its 3.8, the deputy route of its ADDENDUM 3 — and the ICO
 * breach report pre-filled answer sheet (12927942615), which is a TEMPLATE here:
 * a page drawn from the entry and the standing answers, never stored, never sent.
 *
 * CATEGORIES AND COUNTS, NEVER NAMES. Somebody who had to be identified is in the
 * restricted names annex, which stays where it is; the entry carries its
 * `annex_ref` and nothing else. NEVER BANK DETAILS either — refused in words by
 * migration 017 and in shapes here.
 *
 * TWO KINDS. A security incident; and ATTEMPTED INVOICE FRAUD, which SOP 9's draft
 * procedure treats as an incident decided under this procedure — the claim and the
 * date, and whether it is a personal data breach is the data protection officer's
 * classification, left open until given. Until it is, no Article 33 clock is
 * presented as running or as not running: the page says the classification awaits.
 *
 * THE 72 HOURS ARE READ from awareness, fixed on the day. A correction is a row
 * beside it. THE FOUR ARTICLE 34 FACTS feed the limbs they decide: UNKNOWN and
 * never recorded both refuse 34(3)(a) and 34(3)(b) (N4).
 *
 * NO POLICY IN FORCE IS A RECORDED VALUE. The insurer row of every new entry is
 * written as NO_POLICY_IN_FORCE while that is the dated insurance position, and
 * the database refuses to record an insurer as told on silence.
 */

import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import { carriesBankDetails } from './templates.ts';
import {
  assertComplianceRead, assertComplianceWrite, dateField, has, holdsForEntry, linksFor, momentField, nextRef, NotFoundAsRefusal,
  record, requiredText, settingReading, textField, TWO_PERSON_LIMITATION, ukDay, vocabField, words,
  type Check, type ComplianceDeps, type Fields, type HoldRow, type LinkLine, type Vocab, type WriteResult,
} from './compliance.ts';
import { localWhen } from './localtime.ts';

class Refusal extends Error {}

function check<T>(c: Check<T>): T {
  if (!c.ok) throw new Refusal(c.why);
  return c.value;
}

function guarded(fn: () => WriteResult): WriteResult {
  try { return fn(); } catch (e) {
    if (e instanceof Refusal) return { ok: false, why: e.message };
    if (e instanceof NotFoundAsRefusal) throw e;
    if (e instanceof Error && /constraint|RAISE|E_[A-Z_]+|append-only|kept|fixed|never|refus|needs/i.test(e.message)) {
      return { ok: false, why: `Not recorded: ${e.message.replace(/^E_[A-Z_]+: /, '').replace(/^.*constraint failed: /, 'a required field is missing or out of range: ')}` };
    }
    throw e;
  }
}

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

export const INCIDENT_KINDS: Vocab = Object.freeze({
  SECURITY_INCIDENT: 'A security incident affecting personal data',
  ATTEMPTED_INVOICE_FRAUD: 'Attempted invoice fraud — a client told to pay somewhere else',
});
export const DISCOVERY_ROUTES: Vocab = Object.freeze({
  PROCESSOR: 'A processor told us', CLIENT: 'A client told us', DATA_SUBJECT: 'A data subject told us', ALERT: 'An alert',
  ROUTINE_REVIEW: 'A routine review', NOTICED: 'Somebody noticed',
});
export const OCCURRED_STATES: Vocab = Object.freeze({ KNOWN: 'Known', ESTIMATED: 'Estimated', UNKNOWN: 'Unknown' });
export const YES_NO: Vocab = Object.freeze({ YES: 'Yes', NO: 'No' });
export const ART33: Vocab = Object.freeze({ NOTIFIED: 'Notified', NOT_NOTIFIED: 'Not notified', NOTIFIED_IN_PHASES: 'Notified in phases' });
export const ART34: Vocab = Object.freeze({
  COMMUNICATED: 'Communicated to the individuals',
  NOT_COMMUNICATED_NOT_HIGH_RISK: 'Not communicated — not likely to be high risk',
  NOT_COMMUNICATED_34_3_A: 'Not communicated — 34(3)(a), the data was unintelligible',
  NOT_COMMUNICATED_34_3_B: 'Not communicated — 34(3)(b), the risk is no longer likely',
  PUBLIC_COMMUNICATION_34_3_C: 'A public communication — 34(3)(c)',
});
export const FACT_VALUES: Vocab = Object.freeze({ YES: 'Yes', NO: 'No', UNKNOWN: 'Unknown' });
export const FOUR_FACTS: Vocab = Object.freeze({
  fact_device_encrypted: 'Was the device or store encrypted?',
  fact_backup_restored: 'Did the backup restore?',
  fact_recipient_confirmed_deletion: 'Did the recipient confirm deletion?',
  fact_route_to_individual: 'Does a route to the individual exist?',
});
export const RECIPIENTS: Vocab = Object.freeze({
  INDIVIDUALS: 'The affected individuals', ART19_RECIPIENTS: 'Recipients under Article 19', INSURER: 'The insurer', NCSC: 'The NCSC',
  ACTION_FRAUD_OR_POLICE: 'Report Fraud / Action Fraud, or the police', PROCESSOR: 'Processors and suppliers', CLIENT: 'The client whose matter it is',
});
export const TOLD_POSITIONS: Vocab = Object.freeze({ TOLD: 'Told', NOT_TOLD: 'Not told', NOT_APPLICABLE: 'Not applicable', NO_POLICY_IN_FORCE: 'No policy in force' });

const TEXT_FIELDS = ['description', 'subject_categories_and_number', 'record_categories_and_number', 'special_category_present', 'likely_consequences',
  'remedial_action', 'mitigating_action', 'processor_involved', 'lessons_and_changes', 'occurred_basis', 'classification_reason'] as const;

function noBankDetails(values: readonly (string | null)[]): Check<true> {
  for (const v of values) {
    if (v === null) continue;
    const what = carriesBankDetails(v);
    if (what !== null) return { ok: false, why: `The breach register never records bank details, and this carries ${what}. Describe what happened without it.` };
  }
  return { ok: true, value: true };
}

/* ================================================================== *
 * 2 · TABLE A — THE FACTS
 * ================================================================== */

type IncidentRow = {
  id: string; incident_ref: string; kind: string; is_personal_data_breach: string | null; classification_reason: string | null;
  business_id: string | null; claim_id: string | null; fraud_attempted_on: string | null; discovered_at: string; discovered_by: string;
  discovery_route: string; awareness_at: string; awareness_basis: string; occurred_state: string; occurred_at: string | null;
  occurred_basis: string | null; description: string; subject_categories_and_number: string | null; record_categories_and_number: string | null;
  special_category_present: string | null; likely_consequences: string | null; remedial_action: string | null; mitigating_action: string | null;
  processor_involved: string | null; annex_ref: string | null; status: string; lessons_and_changes: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
};

function loadIncident(db: Db, id: string): IncidentRow {
  const r = db.get<IncidentRow>('SELECT * FROM breach_incidents WHERE id = ?', [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

export function openIncident(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const kind = input['kind'] ?? null;
    if (!has(INCIDENT_KINDS, kind)) return { ok: false, why: 'Choose the kind of incident.' };
    let business_id: string | null = null;
    let claim_id: string | null = check(textField(input['claim_id'], 100, 'The claim'));
    if (claim_id !== null) {
      business_id = d.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim_id])?.business_id ?? null;
      if (business_id === null) return { ok: false, why: 'That claim was not found.' };
    }
    const fraudOn = check(dateField(input['fraud_attempted_on'], 'The date of the attempt'));
    if (kind === 'ATTEMPTED_INVOICE_FRAUD' && (claim_id === null || fraudOn === null)) {
      return { ok: false, why: 'Attempted invoice fraud is recorded with the claim and the date of the attempt — and never the bank details.' };
    }
    if (kind !== 'ATTEMPTED_INVOICE_FRAUD' && fraudOn !== null) claim_id = claim_id ?? null;
    const discovered = check(momentField(input['discovered_at'], 'When it was discovered'));
    if (discovered === null) return { ok: false, why: 'Give the date and time it was discovered.' };
    const awareness = check(momentField(input['awareness_at'], 'When Cap Rebate became aware'));
    if (awareness === null) return { ok: false, why: 'Awareness is never unknown: the 72 hours run from it. Fix it on the day, before investigating.' };
    const basis = check(requiredText(input['awareness_basis'], 2000, 'Why that is the moment of awareness'));
    const route = input['discovery_route'] ?? null;
    if (!has(DISCOVERY_ROUTES, route)) return { ok: false, why: 'Say how it was found out.' };
    const by = check(requiredText(input['discovered_by'], 200, 'Who discovered it'));
    const occurred_state = input['occurred_state'] ?? 'UNKNOWN';
    if (!has(OCCURRED_STATES, occurred_state)) return { ok: false, why: 'Say whether when it happened is known, estimated or unknown.' };
    const occurred_at = check(momentField(input['occurred_at'], 'When it happened'));
    const occurred_basis = check(textField(input['occurred_basis'], 2000, 'The basis for when it happened'));
    if (occurred_state === 'KNOWN' && occurred_at === null) return { ok: false, why: 'Give when it happened, or say it is estimated or unknown.' };
    if (occurred_state !== 'KNOWN' && occurred_basis === null) return { ok: false, why: 'An estimate or an unknown carries its reason — a blank is not an answer.' };
    const description = check(requiredText(input['description'], 4000, 'What happened'));
    check(noBankDetails([description, occurred_basis, basis]));
    const id = d.newId();
    const at = d.now();
    const ref = d.db.tx(() => {
      const r = nextRef(d.db, 'PDB');
      d.db.run(
        'INSERT INTO breach_incidents (id, incident_ref, kind, business_id, claim_id, fraud_attempted_on, discovered_at, discovered_by, discovery_route, ' +
          'awareness_at, awareness_basis, occurred_state, occurred_at, occurred_basis, description, status, recorded_by, created_at, updated_at) ' +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)",
        [id, r, kind, business_id, claim_id, fraudOn, discovered, by, route, awareness, basis, occurred_state, occurred_at, occurred_basis, description, actor.id, at, at]);
      if (settingReading(d.db, 'INSURANCE_POSITION', at).value !== 'POLICY_IN_FORCE') {
        d.db.run(
          "INSERT INTO breach_other_notifications (id, incident_id, recipient_kind, position, told_at, note, recorded_by, recorded_at) VALUES (?, ?, 'INSURER', 'NO_POLICY_IN_FORCE', NULL, ?, ?, ?)",
          [d.newId(), id, 'Recorded when the entry was opened, from the dated insurance position.', actor.id, at]);
      }
      return r;
    });
    record(d, actor, 'BREACH_OPENED', 'ALLOWED', 'breach_incident', id, { ref, kind, claim: claim_id });
    return { ok: true, id };
  });
}

export function updateIncident(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'A closed breach entry is kept as it was.' };
    const cur = i as unknown as Record<string, string | null>;
    const next: Record<string, string | null> = {};
    for (const k of TEXT_FIELDS) next[k] = Object.hasOwn(input, k) ? check(textField(input[k], 4000, k.replace(/_/g, ' '))) : (cur[k] ?? null);
    if (next['description'] === null) return { ok: false, why: 'What happened cannot be blank.' };
    next['is_personal_data_breach'] = Object.hasOwn(input, 'is_personal_data_breach')
      ? check(vocabField(input['is_personal_data_breach'], YES_NO, 'Whether it is a personal data breach')) : i.is_personal_data_breach;
    if (next['is_personal_data_breach'] !== null && next['classification_reason'] === null) {
      return { ok: false, why: 'Give the reason too. It is the data protection officer’s decision, in their words.' };
    }
    const annex = Object.hasOwn(input, 'annex_ref') ? check(textField(input['annex_ref'], 20, 'The annex reference')) : i.annex_ref;
    if (annex !== null && !/^ANX-\d{3,}$/.test(annex)) return { ok: false, why: 'An annex reference looks like ANX-001. The names stay in the restricted annex, never here.' };
    check(noBankDetails(TEXT_FIELDS.map((k) => next[k] ?? null)));
    d.db.run(
      'UPDATE breach_incidents SET description = ?, subject_categories_and_number = ?, record_categories_and_number = ?, special_category_present = ?, ' +
        'likely_consequences = ?, remedial_action = ?, mitigating_action = ?, processor_involved = ?, lessons_and_changes = ?, occurred_basis = ?, ' +
        'classification_reason = ?, is_personal_data_breach = ?, annex_ref = ?, updated_at = ? WHERE id = ?',
      [next['description'] ?? null, next['subject_categories_and_number'] ?? null, next['record_categories_and_number'] ?? null, next['special_category_present'] ?? null,
        next['likely_consequences'] ?? null, next['remedial_action'] ?? null, next['mitigating_action'] ?? null, next['processor_involved'] ?? null,
        next['lessons_and_changes'] ?? null, next['occurred_basis'] ?? null, next['classification_reason'] ?? null, next['is_personal_data_breach'] ?? null,
        annex, d.now(), id]);
    record(d, actor, 'BREACH_UPDATED', 'ALLOWED', 'breach_incident', id, {
      ref: i.incident_ref, fields: [...TEXT_FIELDS, 'is_personal_data_breach'].filter((k) => next[k] !== (cur[k] ?? null)),
    });
    return { ok: true, id };
  });
}

export function correctAwareness(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'A closed breach entry is kept as it was.' };
    const to = check(momentField(input['corrected_to'], 'The corrected moment of awareness'));
    if (to === null) return { ok: false, why: 'Give the corrected moment.' };
    const reason = check(requiredText(input['reason'], 2000, 'Why it is corrected'));
    const cid = d.newId();
    d.db.run('INSERT INTO breach_awareness_corrections (id, incident_id, corrected_to, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
      [cid, id, to, reason, actor.id, d.now()]);
    record(d, actor, 'BREACH_AWARENESS_CORRECTED', 'ALLOWED', 'breach_incident', id, { ref: i.incident_ref, correction: cid });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * 3 · TABLE B — THE DECISIONS
 * ================================================================== */

type DecisionRow = {
  id: string; incident_id: string; art33_decision: string | null; art33_reasoning: string | null; notified_at: string | null;
  notified_recipient: string | null; delay_reasons: string | null; art34_decision: string | null; art34_reasoning: string | null;
  communicated_at: string | null; communicated_route: string | null; fact_device_encrypted: string | null; fact_backup_restored: string | null;
  fact_recipient_confirmed_deletion: string | null; fact_route_to_individual: string | null; decided_by: string | null; decided_at: string | null;
  deputy_route_used: number; dpo_contact_attempts: string | null; countersigned_by: string | null;
};

/** The 72 calendar hours from awareness. */
export function deadline72h(awareness_at: string): string {
  return new Date(Date.parse(awareness_at) + 72 * 3_600_000).toISOString();
}

export function recordDecision(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'A closed breach entry is kept as it was.' };
    const existing = d.db.get<DecisionRow>('SELECT * FROM breach_decisions WHERE incident_id = ?', [id]);
    const cur = (existing ?? { deputy_route_used: 0 }) as unknown as Record<string, string | number | null>;
    const text = (k: string, max: number, what: string): string | null => (Object.hasOwn(input, k) ? check(textField(input[k], max, what)) : ((cur[k] as string | null | undefined) ?? null));
    const moment = (k: string, what: string): string | null => (Object.hasOwn(input, k) ? check(momentField(input[k], what)) : ((cur[k] as string | null | undefined) ?? null));
    const vocab = (k: string, v: Vocab, what: string): string | null => (Object.hasOwn(input, k) ? check(vocabField(input[k], v, what)) : ((cur[k] as string | null | undefined) ?? null));
    const n = {
      art33_decision: vocab('art33_decision', ART33, 'The Article 33 decision'), art33_reasoning: text('art33_reasoning', 8000, 'The Article 33 reasoning'),
      notified_at: moment('notified_at', 'When the Information Commissioner (from 30 September 2026, the Information Commission) was notified'), notified_recipient: text('notified_recipient', 300, 'Who was notified'),
      delay_reasons: text('delay_reasons', 4000, 'The reasons for the delay'),
      art34_decision: vocab('art34_decision', ART34, 'The Article 34 decision'), art34_reasoning: text('art34_reasoning', 8000, 'The Article 34 reasoning'),
      communicated_at: moment('communicated_at', 'When the individuals were told'), communicated_route: text('communicated_route', 500, 'How they were told'),
      fact_device_encrypted: vocab('fact_device_encrypted', FACT_VALUES, 'Encryption'), fact_backup_restored: vocab('fact_backup_restored', FACT_VALUES, 'The backup'),
      fact_recipient_confirmed_deletion: vocab('fact_recipient_confirmed_deletion', FACT_VALUES, 'Confirmed deletion'),
      fact_route_to_individual: vocab('fact_route_to_individual', FACT_VALUES, 'A route to the individual'),
      decided_by: text('decided_by', 200, 'Who decided'), decided_at: moment('decided_at', 'When it was decided'),
      deputy_route_used: Object.hasOwn(input, 'deputy_route_used') ? (input['deputy_route_used'] === 'YES' ? 1 : 0) : Number(cur['deputy_route_used'] ?? 0),
      dpo_contact_attempts: text('dpo_contact_attempts', 4000, 'The attempts to reach the data protection officer'),
      countersigned_by: text('countersigned_by', 200, 'Who countersigned'),
    };
    if (n.art33_decision !== null && (n.art33_reasoning === null || n.decided_by === null || n.decided_at === null)) {
      return { ok: false, why: 'An Article 33 decision needs its reasoning, who decided, and when. Say whether the “unlikely to result in a risk” test applies.' };
    }
    if (n.art34_decision !== null && n.art34_reasoning === null) return { ok: false, why: 'An Article 34 decision needs its reasoning. This applies even if Article 33 was not notified.' };
    if (n.art34_decision === 'NOT_COMMUNICATED_34_3_A' && n.fact_device_encrypted !== 'YES') {
      return { ok: false, why: 'Article 34(3)(a) needs the data to have been unreadable to anyone not allowed to see it. So encryption must be recorded as YES. Unknown or not recorded does not pass.' };
    }
    if (n.art34_decision === 'NOT_COMMUNICATED_34_3_B' && n.fact_recipient_confirmed_deletion !== 'YES') {
      return { ok: false, why: 'Article 34(3)(b) needs the recipient’s deletion to be confirmed. Record it as YES. Unknown or not recorded does not pass.' };
    }
    if (n.art33_decision === 'NOTIFIED' && (n.notified_at === null || n.notified_recipient === null)) return { ok: false, why: 'A notification carries when and to whom.' };
    if (n.notified_at !== null && n.notified_at > deadline72h(i.awareness_at) && n.delay_reasons === null) {
      return { ok: false, why: 'The notification came more than 72 hours after we became aware. You must give the reasons for the delay.' };
    }
    if (n.deputy_route_used === 1 && n.dpo_contact_attempts === null) {
      return { ok: false, why: 'The deputy can decide only once the attempts to reach the data protection officer are logged.' };
    }
    const at = d.now();
    const values = [n.art33_decision, n.art33_reasoning, n.notified_at, n.notified_recipient, n.delay_reasons, n.art34_decision, n.art34_reasoning,
      n.communicated_at, n.communicated_route, n.fact_device_encrypted, n.fact_backup_restored, n.fact_recipient_confirmed_deletion,
      n.fact_route_to_individual, n.decided_by, n.decided_at, n.deputy_route_used, n.dpo_contact_attempts, n.countersigned_by];
    d.db.tx(() => {
      if (existing === undefined) {
        d.db.run(
          'INSERT INTO breach_decisions (art33_decision, art33_reasoning, notified_at, notified_recipient, delay_reasons, art34_decision, art34_reasoning, ' +
            'communicated_at, communicated_route, fact_device_encrypted, fact_backup_restored, fact_recipient_confirmed_deletion, fact_route_to_individual, ' +
            'decided_by, decided_at, deputy_route_used, dpo_contact_attempts, countersigned_by, id, incident_id, recorded_by, created_at, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [...values, d.newId(), id, actor.id, at, at]);
      } else {
        d.db.run(
          'UPDATE breach_decisions SET art33_decision = ?, art33_reasoning = ?, notified_at = ?, notified_recipient = ?, delay_reasons = ?, art34_decision = ?, ' +
            'art34_reasoning = ?, communicated_at = ?, communicated_route = ?, fact_device_encrypted = ?, fact_backup_restored = ?, ' +
            'fact_recipient_confirmed_deletion = ?, fact_route_to_individual = ?, decided_by = ?, decided_at = ?, deputy_route_used = ?, ' +
            'dpo_contact_attempts = ?, countersigned_by = ?, updated_at = ? WHERE id = ?',
          [...values, at, existing.id]);
      }
      if (n.art33_decision !== null && n.art34_decision !== null) {
        d.db.run("UPDATE breach_incidents SET status = 'NOTIFICATION_DECIDED', updated_at = ? WHERE id = ? AND status = 'OPEN'", [at, id]);
      }
    });
    record(d, actor, 'BREACH_DECISION_RECORDED', 'ALLOWED', 'breach_incident', id, {
      ref: i.incident_ref, art33: n.art33_decision, art34: n.art34_decision, deputy_route: n.deputy_route_used === 1,
    });
    return { ok: true, id };
  });
}

export function recordPhase(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'A closed breach entry is kept as it was.' };
    const sent = check(momentField(input['sent_at'], 'When the phase was sent'));
    if (sent === null) return { ok: false, why: 'Give when the phase was sent.' };
    const what = check(requiredText(input['what_was_sent'], 4000, 'What was sent'));
    const outstanding = check(requiredText(input['outstanding'], 4000, 'What was still outstanding, and by when'));
    check(noBankDetails([what, outstanding]));
    const n = (d.db.get<{ n: number }>('SELECT COALESCE(MAX(phase_no), 0) + 1 AS n FROM breach_notification_phases WHERE incident_id = ?', [id])?.n) ?? 1;
    const pid = d.newId();
    d.db.run('INSERT INTO breach_notification_phases (id, incident_id, phase_no, sent_at, what_was_sent, outstanding, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [pid, id, n, sent, what, outstanding, actor.id, d.now()]);
    record(d, actor, 'BREACH_PHASE_RECORDED', 'ALLOWED', 'breach_incident', id, { ref: i.incident_ref, phase: n });
    return { ok: true, id };
  });
}

export function recordTold(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'A closed breach entry is kept as it was.' };
    const kind = input['recipient_kind'] ?? null;
    if (!has(RECIPIENTS, kind)) return { ok: false, why: 'Choose who this is about.' };
    const position = input['position'] ?? null;
    if (!has(TOLD_POSITIONS, position)) return { ok: false, why: 'Say whether they were told.' };
    if (position === 'NO_POLICY_IN_FORCE' && kind !== 'INSURER') return { ok: false, why: '“No policy in force” is the insurer’s row only.' };
    if (kind === 'INSURER' && position !== 'NO_POLICY_IN_FORCE' && settingReading(d.db, 'INSURANCE_POSITION', d.now()).value !== 'POLICY_IN_FORCE') {
      return { ok: false, why: 'No insurance policy is recorded. So the insurer row says “No policy in force”. Record the policy in the settings first.' };
    }
    const told = check(momentField(input['told_at'], 'When they were told'));
    if ((position === 'TOLD') !== (told !== null)) return { ok: false, why: position === 'TOLD' ? 'Give when they were told.' : 'A time is given only for somebody told.' };
    const note = check(textField(input['note'], 2000, 'The note'));
    check(noBankDetails([note]));
    const existing = d.db.get<{ id: string }>('SELECT id FROM breach_other_notifications WHERE incident_id = ? AND recipient_kind = ?', [id, kind]);
    const at = d.now();
    if (existing === undefined) {
      d.db.run('INSERT INTO breach_other_notifications (id, incident_id, recipient_kind, position, told_at, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [d.newId(), id, kind, position, told, note, actor.id, at]);
    } else {
      d.db.run('UPDATE breach_other_notifications SET position = ?, told_at = ?, note = ?, recorded_by = ?, recorded_at = ? WHERE id = ?',
        [position, told, note, actor.id, at, existing.id]);
    }
    record(d, actor, 'BREACH_NOTIFICATION_RECORDED', 'ALLOWED', 'breach_incident', id, { ref: i.incident_ref, recipient: kind, position });
    return { ok: true, id };
  });
}

export function closeIncident(d: ComplianceDeps, actor: Actor, id: string): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const i = loadIncident(d.db, id);
    if (i.status === 'CLOSED') return { ok: false, why: 'This entry is closed already.' };
    const dec = d.db.get<DecisionRow>('SELECT * FROM breach_decisions WHERE incident_id = ?', [id]);
    const missing: string[] = [];
    if (i.kind === 'ATTEMPTED_INVOICE_FRAUD' && i.is_personal_data_breach === null) {
      missing.push('the classification, from the data protection officer');
    }
    if (i.is_personal_data_breach !== 'NO') {
      if (dec?.art33_decision === null || dec === undefined) missing.push('the Article 33 decision, reasoned');
      if (dec?.art34_decision === null || dec === undefined) missing.push('the Article 34 decision, reasoned');
      if (dec !== undefined && dec.art33_decision !== null && dec.countersigned_by === null) missing.push('the countersignature, on a decision to report or not to');
      if (dec?.art33_decision === 'NOTIFIED_IN_PHASES'
        && (d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM breach_notification_phases WHERE incident_id = ?', [id])?.n ?? 0) === 0) {
        missing.push('the notification phases');
      }
    }
    if (i.remedial_action === null) missing.push('the remedial action, or the outstanding items with an owner and a date');
    if (i.lessons_and_changes === null) missing.push('what changed as a result, including that nothing needed to');
    if (missing.length > 0) return { ok: false, why: `Not closed — it still needs ${missing.join('; ')}. Notification alone does not close an entry.` };
    const at = d.now();
    d.db.run("UPDATE breach_incidents SET status = 'CLOSED', closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?", [at, actor.id, at, id]);
    record(d, actor, 'BREACH_CLOSED', 'ALLOWED', 'breach_incident', id, { ref: i.incident_ref });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * 4 · THE VIEWS
 * ================================================================== */

export type ClockReading = { readonly deadline: string | null; readonly label: string };

export function article33Reading(i: IncidentRow, dec: DecisionRow | undefined, corrections: readonly { corrected_to: string }[], nowIso: string): ClockReading {
  if (i.is_personal_data_breach === 'NO') return { deadline: null, label: 'Classified as not a personal data breach — no Article 33 clock.' };
  if (i.kind === 'ATTEMPTED_INVOICE_FRAUD' && i.is_personal_data_breach === null) {
    return {
      deadline: deadline72h(i.awareness_at),
      label: `Is this a personal data breach? The data protection officer has not classified it yet. If it is, the 72 hours from awareness end ${localWhen(deadline72h(i.awareness_at))} — so ask now.`,
    };
  }
  const latest = corrections.length === 0 ? null : (corrections[corrections.length - 1]?.corrected_to ?? null);
  const dl = deadline72h(i.awareness_at);
  const left = (Date.parse(dl) - Date.parse(nowIso)) / 3_600_000;
  const state = dec?.art33_decision != null ? `decided: ${words(ART33, dec.art33_decision, dec.art33_decision)}` : left > 0 ? `${Math.floor(left)} hours left` : 'PASSED WITH NO DECISION RECORDED';
  return {
    deadline: dl,
    label: `72 calendar hours from awareness (${localWhen(i.awareness_at)}) end ${localWhen(dl)} — ${state}.` +
      (latest === null ? '' : ` Awareness was later corrected to ${localWhen(latest)}; the original stands beside it and the earlier reading is worked to.`),
  };
}

export type IncidentView = {
  readonly incident: IncidentRow & { kind_label: string; claim_ref: string | null };
  readonly clock: ClockReading;
  readonly corrections: readonly { corrected_to: string; reason: string; recorded_at: string }[];
  readonly decision: DecisionRow | null;
  readonly phases: readonly { phase_no: number; sent_at: string; what_was_sent: string; outstanding: string }[];
  readonly told: readonly { recipient_kind: string; label: string; position: string; told_at: string | null; note: string | null }[];
  readonly insurance: string;
  readonly links: readonly LinkLine[];
  readonly holds: readonly HoldRow[];
  readonly limitation: string;
  readonly four_facts: Vocab;
};

export function incidentView(db: Db, actor: Actor, id: string, nowIso: string): IncidentView {
  assertComplianceRead(actor);
  const i = loadIncident(db, id);
  const corrections = db.all<{ corrected_to: string; reason: string; recorded_at: string }>(
    'SELECT corrected_to, reason, recorded_at FROM breach_awareness_corrections WHERE incident_id = ? ORDER BY rowid', [id]);
  const dec = db.get<DecisionRow>('SELECT * FROM breach_decisions WHERE incident_id = ?', [id]);
  const ins = settingReading(db, 'INSURANCE_POSITION', nowIso);
  return {
    incident: {
      ...i, kind_label: words(INCIDENT_KINDS, i.kind, i.kind),
      claim_ref: i.claim_id === null ? null : (db.get<{ claim_ref: string }>('SELECT claim_ref FROM claims WHERE id = ?', [i.claim_id])?.claim_ref ?? null),
    },
    clock: article33Reading(i, dec, corrections, nowIso),
    corrections, decision: dec ?? null,
    phases: db.all<{ phase_no: number; sent_at: string; what_was_sent: string; outstanding: string }>(
      'SELECT phase_no, sent_at, what_was_sent, outstanding FROM breach_notification_phases WHERE incident_id = ? ORDER BY phase_no', [id]),
    told: db.all<{ recipient_kind: string; position: string; told_at: string | null; note: string | null }>(
      'SELECT recipient_kind, position, told_at, note FROM breach_other_notifications WHERE incident_id = ? ORDER BY recipient_kind', [id])
      .map((t) => ({ ...t, label: words(RECIPIENTS, t.recipient_kind, t.recipient_kind) })),
    insurance: ins.value === null ? 'The insurance position is not recorded. We never record an insurer as told just because nothing was said.'
      : `${ins.label}, from ${ins.effective_from ?? ''}. Source: ${ins.source ?? ''}`,
    links: linksFor(db, 'BREACH', id), holds: holdsForEntry(db, 'incident_id', id), limitation: TWO_PERSON_LIMITATION, four_facts: FOUR_FACTS,
  };
}

export function breachRegister(db: Db, actor: Actor, nowIso: string): { id: string; ref: string; kind: string; aware: string; clock: string; status: string }[] {
  assertComplianceRead(actor);
  return db.all<IncidentRow>('SELECT * FROM breach_incidents ORDER BY awareness_at DESC LIMIT 500').map((i) => {
    const dec = db.get<DecisionRow>('SELECT * FROM breach_decisions WHERE incident_id = ?', [i.id]);
    return {
      id: i.id, ref: i.incident_ref, kind: words(INCIDENT_KINDS, i.kind, i.kind), aware: localWhen(i.awareness_at),
      clock: i.status === 'CLOSED' ? 'closed' : article33Reading(i, dec, [], nowIso).label, status: i.status,
    };
  });
}

/* ------------------------------------------------ the regulator’s answer sheet — a template (dual wording, Phase 132f: the Information Commissioner (from 30 September 2026, the Information Commission)) */

export type SheetLine = { readonly field: string; readonly answer: string };
export type SheetSection = { readonly title: string; readonly lines: readonly SheetLine[] };

const NOT_SET = (why: string): string => `NOT SET — ${why}`;

export const STANDING_MEASURES: readonly SheetLine[] = Object.freeze([
  { field: 'Document store', answer: 'OneDrive / Microsoft 365 — state as it is on the day' },
  { field: 'Second independent backup', answer: 'NOT CONFIRMED — state as it is on the day' },
  { field: 'Restore tested', answer: 'NEVER TESTED — state as it is on the day' },
  { field: 'Device encryption', answer: 'NOT ESTABLISHED — state as it is on the day' },
  { field: 'Document-store access logging', answer: 'NOT ESTABLISHED — state as it is on the day' },
  { field: 'Monitored data protection address', answer: 'NOT SET — state as it is on the day' },
  { field: 'MFA / Cyber Essentials', answer: 'Readiness pack drafted; not implemented — state as it is on the day' },
]);

export function icoAnswerSheet(db: Db, actor: Actor, id: string, nowIso: string): { ref: string; sections: readonly SheetSection[]; note: string } {
  const v = incidentView(db, actor, id, nowIso);
  const i = v.incident;
  const dec = v.decision;
  const blank = (x: string | null, why: string): string => x ?? NOT_SET(why);
  return {
    ref: i.incident_ref,
    note: 'A TEMPLATE, drawn from this entry and our standing answers. It is not stored and not sent. You can not save part of the form for the Information Commissioner\'s Office (from 30 September 2026, the Information Commission). ' +
      'Do not open the form until every line below is true on the day. Name the regulator as the form does on the day.',
    sections: [
      { title: '1 · Who is reporting', lines: [
        { field: 'Organisation name', answer: 'CAP REBATE LTD, trading as Cap Rebate — the controller' },
        { field: 'Company number', answer: '17307313. Registered office: 1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA' },
        { field: 'Our ref with the Information Commissioner\'s Office (from 30 September 2026, the Information Commission)', answer: NOT_SET('not yet registered — say so') },
        { field: 'Sector', answer: 'Professional services — tax and property consultancy. Not healthcare: no patient data is held' },
      ] },
      { title: '2 · What has happened', lines: [
        { field: 'Kind', answer: i.kind_label },
        { field: 'What happened', answer: i.description },
        { field: 'People: categories and approximate number', answer: blank(i.subject_categories_and_number, 'categories first, then a number or a range with its basis') },
        { field: 'Records: categories and approximate number', answer: blank(i.record_categories_and_number, 'not yet established — say so') },
        { field: 'Special category data', answer: blank(i.special_category_present, 'check — do not repeat “none” without checking the documents involved') },
      ] },
      { title: '3 · When and how you found out', lines: [
        { field: 'Discovered', answer: `${localWhen(i.discovered_at)}, by ${i.discovered_by} (${words(DISCOVERY_ROUTES, i.discovery_route, i.discovery_route)})` },
        { field: 'Became aware — the clock start, to the hour', answer: `${localWhen(i.awareness_at)}. ${i.awareness_basis}` },
        { field: 'When it happened', answer: i.occurred_state === 'KNOWN' && i.occurred_at !== null ? localWhen(i.occurred_at) : `${i.occurred_state}: ${i.occurred_basis ?? ''}` },
        { field: 'The 72 hours', answer: v.clock.label },
      ] },
      { title: '4 · The people affected', lines: [
        { field: 'Likely consequences for them', answer: blank(i.likely_consequences, '“none” needs its reason') },
        { field: 'Who they can be', answer: 'Clients and their named contacts. People with significant control. Individual proprietors. Neither of those two has had contact with Cap Rebate. People named in documents clients uploaded. Professionals in a live matter' },
        { field: 'Telling them (Article 34)', answer: dec?.art34_decision == null ? NOT_SET('decide, even if the decision is “not yet”') : `${words(ART34, dec.art34_decision, dec.art34_decision)} — ${dec.art34_reasoning ?? ''}` },
      ] },
      { title: '5 · What you are doing', lines: [
        { field: 'Remedial action', answer: blank(i.remedial_action, 'not yet recorded') },
        { field: 'Mitigating action', answer: blank(i.mitigating_action, 'not yet recorded') },
        ...STANDING_MEASURES,
      ] },
      { title: '6 · Who to contact, and who else you have told', lines: [
        { field: 'Named contact', answer: 'Sadique Maskeen, Data Protection Officer. If he cannot be reached: the breach deputy, Lakhbir Dhillon. Confirm on the day' },
        { field: 'Email', answer: NOT_SET('no data protection mailbox is watched yet. Give an address that someone actually reads, and say which it is') },
        { field: 'Telephone', answer: NOT_SET('to confirm') },
        { field: 'Data protection officer', answer: 'Designated, but the appointment is not in effect. Say so plainly. Do not give them as the data protection officer contact' },
        { field: 'Decision', answer: dec?.art33_decision == null ? NOT_SET('the Article 33 decision and its reasoning') : `${words(ART33, dec.art33_decision, dec.art33_decision)} — ${dec.art33_reasoning ?? ''}` },
        ...v.told.map((t) => ({ field: t.label, answer: `${words(TOLD_POSITIONS, t.position, t.position)}${t.told_at === null ? '' : `, ${localWhen(t.told_at)}`}` })),
        { field: 'Insurance', answer: v.insurance },
      ] },
    ],
  };
}

/** Days are UK days; exported for the retention list. */
export function closedDay(i: { closed_at: string | null }): string | null {
  return i.closed_at === null ? null : ukDay(i.closed_at);
}
