/**
 * COMPLIANCE'S LAST BORROWED STATEMENTS, SPLIT (Phase 161l2). The money-laundering register, a check's beneficial owners,
 * the identity checks and a rights request's letter each joined compliance's rows to the client record's contacts or
 * organisations (src/modules/clients/, below compliance). Each now reads compliance's own rows and asks the client record
 * for the name. The retention list's counts of the client record's kinds moved to the client record (its door).
 * Each pin keeps the old statement word for word (test/split-pins.ts) and expects the same rows on a seeded database
 * with awkward rows added: a contact or organisation that is not there, equal sort keys, a request with no person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from '../../src/core/index.ts';
import * as DATA from '../../src/modules/compliance/data.ts';
import { countClientRecordKind } from '../../src/modules/clients/index.ts';
import { looseSeededDb, pinAll, put } from '../split-pins.ts';

interface World { db: Db; biz: string; biz2: string }
let world: Promise<World> | null = null;
function theWorld(): Promise<World> {
  world ??= (async () => {
    const db = await looseSeededDb();
    const [biz, biz2] = db.all<{ id: string }>('SELECT id FROM businesses ORDER BY id LIMIT 2').map((r) => r.id) as [string, string];
    const t = (n: number): string => `2026-10-0${n}T09:00:00.000Z`;
    put(db, 'contacts', { id: 'ct-p1', business_id: biz, full_name: 'Pat One' });
    put(db, 'contacts', { id: 'ct-p2', business_id: biz2, full_name: 'Pat Two' });
    put(db, 'contacts', { id: 'ct-p3', business_id: null, full_name: 'Pat Lead' });
    // checks: on two organisations, one not there, two made at the same moment
    put(db, 'cdd_checks', { id: 'k-1', business_id: biz, claimant_type: 'LIMITED_COMPANY', state: 'IN_PROGRESS', created_at: t(1) });
    put(db, 'cdd_checks', { id: 'k-2', business_id: biz2, claimant_type: 'SOLE_TRADER', state: 'COMPLETE', created_at: t(2), completed_at: t(3) });
    put(db, 'cdd_checks', { id: 'k-3', business_id: 'biz-none', claimant_type: 'LIMITED_COMPANY', state: 'IN_PROGRESS', created_at: t(2) });
    put(db, 'cdd_checks', { id: 'k-4', business_id: biz, claimant_type: 'LIMITED_COMPANY', state: 'IN_PROGRESS', created_at: t(2) });
    // owners: a known contact, one not there, two recorded at the same moment
    put(db, 'cdd_beneficial_owners', { id: 'bo-1', check_id: 'k-1', contact_id: 'ct-p1', recorded_at: t(1) });
    put(db, 'cdd_beneficial_owners', { id: 'bo-2', check_id: 'k-1', contact_id: 'ct-none', recorded_at: t(2) });
    put(db, 'cdd_beneficial_owners', { id: 'bo-3', check_id: 'k-1', contact_id: 'ct-p3', recorded_at: t(1) });
    // identity checks: known contacts, one not there, equal sending moments
    put(db, 'identity_checks', { id: 'i-1', business_id: biz, contact_id: 'ct-p1', cdd_check_id: 'k-1', sent_at: t(1) });
    put(db, 'identity_checks', { id: 'i-2', business_id: biz, contact_id: 'ct-none', cdd_check_id: 'k-1', sent_at: t(1) });
    put(db, 'identity_checks', { id: 'i-3', business_id: biz, contact_id: 'ct-p2', cdd_check_id: null, sent_at: t(1) });
    put(db, 'identity_checks', { id: 'i-4', business_id: biz2, contact_id: 'ct-p2', cdd_check_id: 'k-2', sent_at: t(2) });
    // rights requests: from a client's person, a prospect's person, a person not there, and nobody
    put(db, 'rights_requests', { id: 'rr-1', request_ref: 'RR-1', contact_id: 'ct-p1', received_at: t(1) });
    put(db, 'rights_requests', { id: 'rr-2', request_ref: 'RR-2', contact_id: 'ct-p3', received_at: t(2) });
    put(db, 'rights_requests', { id: 'rr-3', request_ref: 'RR-3', contact_id: 'ct-none', received_at: t(3) });
    put(db, 'rights_requests', { id: 'rr-4', request_ref: 'RR-4', contact_id: null, received_at: t(4) });
    return { db, biz, biz2 };
  })();
  return world;
}

pinAll<World>('161l2 compliance', theWorld, (w) => [
  {
    name: 'listCddBeneficialOwnersIdContactIdByCheckId',
    old: 'SELECT o.id, o.contact_id, c.full_name AS contact, o.basis_of_control, o.identified_from, o.psc_decision_id, o.verified_how ' +
      'FROM cdd_beneficial_owners o JOIN contacts c ON c.id = o.contact_id WHERE o.check_id = ? ORDER BY o.recorded_at',
    call: DATA.listCddBeneficialOwnersIdContactIdByCheckId, params: [['k-1'], ['k-2'], ['k-none']], atLeast: 2,
  },
  {
    name: 'listCddChecksIdBusinessId',
    old: 'SELECT k.id, k.business_id, b.name AS organisation, k.claimant_type, k.state, k.completed_at FROM cdd_checks k JOIN businesses b ON b.id = k.business_id ' +
      'ORDER BY k.created_at DESC LIMIT 500',
    call: DATA.listCddChecksIdBusinessId, params: [[]], atLeast: 3,
  },
  {
    name: 'listIdentityChecksIdContactByBusinessId',
    old: 'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, i.sent_by FROM identity_checks i ' +
      'JOIN contacts c ON c.id = i.contact_id WHERE i.business_id = ? ORDER BY i.sent_at DESC',
    call: DATA.listIdentityChecksIdContactByBusinessId, params: [[w.biz], [w.biz2], ['biz-none']], atLeast: 3,
  },
  {
    name: 'listIdentityChecksIdContactByCddCheckId',
    old: 'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, i.sent_by FROM identity_checks i ' +
      'JOIN contacts c ON c.id = i.contact_id WHERE i.cdd_check_id = ? ORDER BY i.sent_at DESC',
    call: DATA.listIdentityChecksIdContactByCddCheckId, params: [['k-1'], ['k-2'], ['k-none']], atLeast: 2,
  },
  {
    name: 'getRightsRequestsRefReceivedAtById', get: true,
    old: 'SELECT r.request_ref AS ref, r.received_at, c.business_id FROM rights_requests r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.id = ?',
    call: DATA.getRightsRequestsRefReceivedAtById, params: [['rr-1'], ['rr-2'], ['rr-3'], ['rr-4'], ['rr-none']], atLeast: 4,
  },
]);

/* The retention list's counts of the client record's kinds, text unchanged, now asked of the client record's door. */
const RECORD_KIND_STATEMENTS_BEFORE: Readonly<Record<string, string>> = {
  LEADS_NEVER_CONVERTED: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'",
  LEAD_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL',
  STAFF_TASKS: 'SELECT COUNT(*) AS n FROM staff_tasks',
  LEAD_FOLLOW_UP_TASKS: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'",
  AUTOMATION_RUNS: 'SELECT COUNT(*) AS n FROM automation_runs',
  INTRODUCERS: 'SELECT COUNT(*) AS n FROM introducers',
  INTRODUCER_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL',
  SHARE_CONSENTS: 'SELECT COUNT(*) AS n FROM introducer_share_consents',
  INTRODUCER_NOTICES: 'SELECT COUNT(*) AS n FROM introducer_notices',
  CLIENT_MESSAGE: 'SELECT COUNT(*) AS n FROM client_messages',
  TEAM_MESSAGE: 'SELECT COUNT(*) AS n FROM internal_notes',
};
test('161l2 compliance: the client record counts each of its kinds as the borrowed statements did, and no other kind', async () => {
  const { db } = await theWorld();
  for (const [kind, sql] of Object.entries(RECORD_KIND_STATEMENTS_BEFORE)) assert.deepEqual(countClientRecordKind(db, kind), db.get(sql), kind);
  assert.equal(countClientRecordKind(db, 'CDD_RECORDS'), undefined, "compliance's own kind is not the client record's");
  assert.equal(countClientRecordKind(db, 'NO_SUCH_KIND'), undefined);
});
