/**
 * PHASE 132 — THE RETENTION ROWS READ AGAINST THE RETENTION DETERMINATIONS. 14 September 2026.
 *
 * Retention Determinations (board item 12945903194), sections 2.3, 3.3, 4.3, 11, 12.2–12.6 and 13.2. Each row's
 * period, state and trigger is read against the value the determinations set. NONE IS APPROVED — approval is the
 * data protection officer's — and where they leave a question open, the row says it is open rather than deciding it.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { APP_ROLES } from '../src/roles.ts';
import * as S from '../src/web/compliance-identity.ts';
import { actor, testApp } from './helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const ADMIN = actor('ADMIN');

type Row = { ref: string; section: string; period_years: number; trigger: readonly RegExp[]; open: RegExp | null };

/** What the determinations set. Drafted and derived both read DERIVED_NOT_APPROVED; none is set. */
const DETERMINATIONS: readonly Row[] = [
  { ref: 'RET-1', section: '12.2, 12.6, 13.2', period_years: 6, trigger: [/claim_period_end/, /return_filed_at/, /enquiry_closed_at/, /where later/], open: /discovery windows/ },
  { ref: 'RET-2', section: '12.3', period_years: 0, trigger: [/nil/, /tax records’ period/], open: /discovery windows/ },
  { ref: 'RET-3', section: '12.4', period_years: 6, trigger: [/verified_at/, /last backup copy’s expiry/], open: null },
  { ref: 'RET-4', section: '12.5', period_years: 6, trigger: [/responded_at/, /RET-6/], open: null },
  { ref: 'RET-5', section: '2.3', period_years: 6, trigger: [/closed_at/], open: null },
  { ref: 'RET-6', section: '3.3', period_years: 6, trigger: [/final response/], open: null },
  { ref: 'RET-7', section: '4.3, 11, 13.2', period_years: 6, trigger: [/claim_period_end/, /report_delivered_at/], open: /which one wins/ },
];

describe('RETENTION ROWS — each read against the determinations, none approved, the open questions left open', () => {
  test('RET-1 to RET-7: the period and trigger the determinations set, DERIVED_NOT_APPROVED, and never clocked from receipt', () => {
    for (const d of DETERMINATIONS) {
      const p = S.RETENTION_PARAMETERS[d.ref];
      assert.ok(p !== undefined, `${d.ref} is missing`);
      assert.equal(p.period_years, d.period_years, `${d.ref}: the period section ${d.section} sets`);
      assert.equal(p.state, 'DERIVED_NOT_APPROVED', `${d.ref}: drafted or derived (section ${d.section}), not approved and not unset`);
      for (const t of d.trigger) assert.match(p.trigger, t, `${d.ref}: the trigger section ${d.section} names`);
      assert.doesNotMatch(p.trigger.replace(/never received_at/, ''), /received_at/, `${d.ref} is clocked from receipt`);
      if (d.open === null) assert.equal(p.open, undefined, `${d.ref} carries an open question the determinations do not`);
      else assert.match(p.open ?? '', d.open, `${d.ref}: the question section ${d.section} leaves open is not stated`);
    }
    assert.ok(Object.values(S.RETENTION_PARAMETERS).every((p) => p.state !== 'APPROVED'), 'a period is approved in code');
    assert.match(S.RETENTION_PARAMETERS['RET-1']?.owner ?? '', /tax adviser/);
  });

  test('the rights-request register and the register records: drafted, not approved, no date, and the discovery-window question shown open', async () => {
    const a = await testApp();
    try {
      for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
        a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
          [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'fake$x', T0, T0]);
      }
      const lines = S.retentionList({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, ADMIN, a.now());
      for (const [kind, ref] of [['RIGHTS_REQUESTS', 'RET-4'], ['REGISTER_RECORDS', 'RET-1']] as const) {
        const line = lines.find((l) => l.kind === kind);
        assert.equal(line?.ref, ref, kind);
        assert.equal(line?.state, 'DERIVED_NOT_APPROVED', kind);
        assert.deepEqual(line?.due, [], kind);
        assert.match(line?.clock ?? '', /^Six years from .*Worked out by us — not yet approved by the data protection officer\. Drafted, not signed yet\. No deletion date set yet\./, kind);
        assert.doesNotMatch(line?.clock ?? '', /not set|UNSET/, `${kind} still says unset`);
      }
      assert.match(lines.find((l) => l.kind === 'REGISTER_RECORDS')?.clock ?? '', /Still to be decided by the data protection officer: Should tax records be kept for HMRC’s discovery windows/);
      assert.match(lines.find((l) => l.kind === 'DOCUMENT_VERSIONS')?.clock ?? '', /Still to be decided by the data protection officer: Where two deletion dates apply to a client’s file, which one wins\?/);
    } finally { a.close(); }
  });
});
