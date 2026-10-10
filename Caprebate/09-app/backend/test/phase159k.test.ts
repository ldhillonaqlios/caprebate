/**
 * PHASE 159k, 10 October 2026 — THE REMAINING MONEY ITEMS: THE SELLER'S ALLOWANCE STATEMENT, AND THREE READINGS.
 *
 * Carried from Phases 159e and 159i. Each test fails on the code before this phase:
 *   item 1   the seller's structures and buildings allowance statement (s.270IA) is a document type with its own receipt
 *            policy (migration 112); receiving one records SBA_STATEMENT_HELD on its claims; it is asked for among a
 *            purchase's documents from 29 October 2018, and required at the data-gathering gate where the claim takes
 *            the structures allowance on a purchase
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import * as D from '../src/web/documents.ts';
import * as F from '../src/web/claim-facts.ts';
import * as MD from '../src/web/mandatory-documents.ts';
import * as P from '../src/web/pipeline.ts';
import { addStaffEvent, eventsOnClaim } from '../src/web/property-events.ts';
import { acceptClientBytes, finishUpload, issuedJob } from '../src/web/uploads.ts';
import { pdfOf } from './document-fixtures.ts';

type Made = Awaited<ReturnType<typeof createApp>>;

async function world() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159k-')) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const j = db.get<{ business_id: string; claim_id: string }>('SELECT business_id, claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL LIMIT 1');
  assert.ok(j);
  const property = db.get<{ p: string }>('SELECT property_id AS p FROM claims WHERE id = ?', [j.claim_id])?.p;
  assert.ok(property);
  const sales: Actor = { id: db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")?.id ?? '', role: 'SALES', business_id: null, disabled: false };
  const deps = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
  return { made, db, j, property, sales, deps };
}

/** One upload through the one handler, steps 1 to 7, linked to the claim. */
async function uploadOnClaim(made: Made, as: Actor, business: string, claim: string, type_code: string): Promise<string> {
  const deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID, store: made.store };
  const started = await D.startDocumentUpload(deps, as, { business_id: business, type_code, logical_document_id: null, request_id: null, claim_id: claim });
  assert.equal(started.ok, true, started.ok ? '' : started.why);
  if (!started.ok) return '';
  const up = { db: made.app.db, store: made.store, now: made.app.now, actor: as.id, newId: randomUUID, audit: made.app.audit };
  const token = new URL(`http://x${started.url}`).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(up, { doc_id: started.doc_id, token, bytes: new Uint8Array(pdfOf([['ALLOWANCE STATEMENT', 'Qualifying expenditure 450,000']])) });
  const job = issuedJob(made.app.db, started.doc_id);
  assert.ok(w.ok && job !== null);
  if (!w.ok || job === null) return '';
  const done = await finishUpload(up, job, w.written_at);
  assert.equal(done.error, undefined, done.error?.code ?? '');
  return started.doc_id;
}

describe('item 1 — the seller’s structures and buildings allowance statement', () => {
  test('a type of its own, bound to its own receipt policy, carrying a value, read by the claim team, RET-7; its policy is fixed', async () => {
    const w = await world();
    try {
      const t = w.db.get<{ handler_type: string; readers: string; carries_value: number; retention_ref: string; active: number }>(
        "SELECT handler_type, readers, carries_value, retention_ref, active FROM document_types WHERE code = 'SBA_ALLOWANCE_STATEMENT'");
      assert.deepEqual(t, { handler_type: 'SBA_ALLOWANCE_STATEMENT', readers: 'CLAIM_TEAM', carries_value: 1, retention_ref: 'RET-7', active: 1 });
      assert.ok(D.receivableTypes(w.db).some((x) => x.code === 'SBA_ALLOWANCE_STATEMENT'), 'it can be asked for and sent');
      assert.throws(() => w.db.run("UPDATE document_types SET handler_type = NULL WHERE code = 'SBA_ALLOWANCE_STATEMENT'"), /fixed/);
    } finally { w.made.close(); }
  });

  test('received on a claim, it records the statement as held — once, by whoever sent it, from their document', async () => {
    const w = await world();
    try {
      const held = () => F.latestFacts(w.db, w.j.claim_id).get('SBA_STATEMENT_HELD');
      assert.equal(held(), undefined);
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.deepEqual([held()?.answer, held()?.value_text, held()?.source_id], ['VALUE', 'YES', 'CLIENT_DOC']);
      assert.match(held()?.note ?? '', /The seller’s allowance statement was received \(version 1\)\./);
      const n = () => w.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_facts WHERE claim_id = ? AND fact_key = 'SBA_STATEMENT_HELD'", [w.j.claim_id])?.n;
      assert.equal(n(), 1);
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.equal(n(), 1, 'a claim that already says yes records nothing again');
      // Another type records nothing.
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'COMPLETION_STATEMENT');
      assert.equal(n(), 1);
    } finally { w.made.close(); }
  });

  test('required at the gate only where the claim takes the structures allowance on a purchase from 29 October 2018', async () => {
    const w = await world();
    try {
      const need = () => MD.mandatoryDocumentNeeds(w.db, P.loadPipelineClaim(w.db, w.j.claim_id)).find((x) => x.what.startsWith('The seller'));
      assert.equal(need()?.met, true);
      assert.match(need()?.why ?? '', /no structures allowance is taken on the purchase/);
      assert.equal(F.recordFact(w.deps, w.sales, w.j.claim_id, { fact_key: 'SBA_QUALIFYING_EXPENDITURE', answer: 'VALUE', value: '450000', source_id: 'CLIENT_DOC', note: null }).ok, true);
      w.db.run("UPDATE properties SET acquisition_date = '2017-06-01' WHERE id = ?", [w.property]);
      assert.equal(need()?.met, true);
      assert.match(need()?.why ?? '', /bought before 29 October 2018/);
      w.db.run("UPDATE properties SET acquisition_date = '2020-06-03' WHERE id = ?", [w.property]);
      assert.equal(need()?.met, false, 'the allowance is taken and no statement is on the claim');
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.equal(need()?.met, true);
    } finally { w.made.close(); }
  });

  test('a purchase from 29 October 2018 lists it among its documents; one before does not', async () => {
    const w = await world();
    try {
      w.db.run('DELETE FROM property_events WHERE property_id = ?', [w.property]);
      const r = addStaffEvent(w.db, randomUUID, w.made.app.now(), w.sales.id, { property_id: w.property, business_id: w.j.business_id }, { kind: 'PURCHASE', date: '06/2020', cost: '540000' });
      assert.equal(r.ok, true);
      const codes = () => eventsOnClaim(w.db, { property_id: w.property, business_id: w.j.business_id, sector: 'gp' })[0]?.documents.map((x) => x.code) ?? [];
      assert.ok(codes().includes('SBA_ALLOWANCE_STATEMENT'));
      w.db.run("UPDATE property_events SET event_date = '2017-06' WHERE property_id = ?", [w.property]);
      assert.equal(codes().includes('SBA_ALLOWANCE_STATEMENT'), false);
    } finally { w.made.close(); }
  });
});
