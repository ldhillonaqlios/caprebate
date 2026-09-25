/**
 * PHASE 151h, 25 September 2026 — THE IDENTITY CHECK SWITCHED ON FOR TESTING, WITH THE PAPERS WAIVED AND SAYING SO.
 *
 * Lakhbir, in chat: "switch it on we are still in a testing enviroment". The switch is on; the two papers (the
 * published privacy notice, clause 7 of the engagement letter) still do NOT name Didit, and the flags that say so stay
 * false; `papers_waived_for_testing` records the decision. What this file proves: it ships on, waived, with a record of
 * who and when; with keys a check is sent and its audit row says it went under the waiver; the screen says "Testing
 * only ... Never check a client"; and the gate still works — take the waiver away with the papers undone and nothing is
 * sent. Recorded answers, INVENTED, no key and no network.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import {
  IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, identityCheckMissing, identityTestingWarning, sentUnderTestingWaiver,
  type IdentityCheckConfig,
} from '../src/connectors/identity-check.ts';
import { identityPanel, sendIdentityCheck } from '../src/web/identity-checks.ts';

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-151h', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151h', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151h00000001' };
const SESSION_OK: Fixture = { status: 201, body: JSON.stringify({ session_id: 'a1b2c3d4-0000-4000-8000-151h00000001', url: 'https://verify.didit.me/en/session/INVENTED151H', status: 'Not Started' }) };
const NOW = '2026-09-25T10:00:00.000Z';

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151h-')), now: () => NOW, sealKey: randomBytes(32) });
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const c = made.app.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM contacts ORDER BY id LIMIT 1')!;
  const audit = (kind: string) => made.app.db.all<{ detail: string }>('SELECT detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  return { app: made.app, admin, c, audit, close: made.close };
}

describe('151h · on for testing, the papers waived — and saying so everywhere it matters', () => {
  test('it ships on, the papers are still NOT named, and the waiver says who decided it and when', () => {
    assert.equal(IDENTITY_CHECK.enabled, true);
    assert.equal(IDENTITY_CHECK.named_in_privacy_notice, false, 'the notice is a draft, not published: the flag must not say otherwise');
    assert.equal(IDENTITY_CHECK.named_in_engagement_letter, false, 'clause 7 names Didit only in a comment: the flag must not say otherwise');
    assert.equal(IDENTITY_CHECK.papers_waived_for_testing, true);
    assert.match(IDENTITY_CHECK.waiver_record ?? '', /Lakhbir Dhillon.*25 September 2026.*testing/);
    assert.equal(sentUnderTestingWaiver(IDENTITY_CHECK), true);
    assert.match(identityTestingWarning(IDENTITY_CHECK) ?? '', /^Testing only\..*Never check a client\.$/);
  });

  test('with its three keys, the shipped configuration sends a check — and the audit row says it went under the waiver', async () => {
    const w = await world();
    try {
      w.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
      w.app.secrets = secretsFromValues(KEYS);
      assert.deepEqual(identityCheckMissing(IDENTITY_CHECK, w.app.secrets), []);
      const r = await sendIdentityCheck({ app: w.app, newId: () => 'idc-151h' }, w.admin,
        { business_id: w.c.business_id, contact_id: w.c.id, cdd_check_id: null, first_name: 'Ada', last_name: 'Invented' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const row = w.audit('IDENTITY_CHECK_SENT')[0];
      assert.ok(row);
      assert.equal((JSON.parse(row.detail) as Record<string, unknown>)['papers_waived_for_testing'], true);
    } finally { w.close(); }
  });

  test('the panel tells the person sending it: testing only, never a client', async () => {
    const w = await world();
    try {
      const html = String(identityPanel(w.app, w.admin, { business_id: w.c.business_id }, [{ id: w.c.id, full_name: 'Invented Person' }]));
      assert.match(html, /id="identity-testing-only"/);
      assert.match(html, /Testing only\./);
      assert.match(html, /Never check a client\./);
      // under the test runner there are no keys, so the panel says what is missing - and never that the switch is off
      assert.match(html, /Not ready\..*keys to the server/s);
      assert.doesNotMatch(html, /Switched off|switch the identity check on/);
    } finally { w.close(); }
  });

  test('THE GATE STILL WORKS: take the waiver away with the papers undone and nothing is sent', async () => {
    const w = await world();
    try {
      w.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
      w.app.secrets = secretsFromValues(KEYS);
      const unwaived: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, papers_waived_for_testing: false, waiver_record: null });
      const r = await sendIdentityCheck({ app: w.app, newId: () => 'idc-151h-x' }, w.admin,
        { business_id: w.c.business_id, contact_id: w.c.id, cdd_check_id: null, first_name: 'Ada', last_name: 'Invented' }, { config: unwaived });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /privacy notice and in the engagement letter/);
      assert.equal(identityTestingWarning(unwaived), null);
      const papersDone: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, named_in_privacy_notice: true, named_in_engagement_letter: true });
      assert.equal(identityTestingWarning(papersDone), null, 'with the papers done, nothing is sent under a waiver and no warning shows');
      assert.equal(sentUnderTestingWaiver(papersDone), false);
    } finally { w.close(); }
  });
});
