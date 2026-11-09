/**
 * EVENTS (src/core/events.ts; 09-app/docs/ARCHITECTURE.md rule 2): a module tells the modules above it that something
 * happened without importing them. The announcement runs its listeners in the transaction of the change that caused
 * it; the announcement and each hearing go to the audit log; a listener that fails undoes the change.
 * The real listeners (the CRM's) are tested where their changes are: test/crm/pipeline.test.ts (a letter signed) and
 * test/claims/engagement-terms-and-fees.test.ts (an invoice raised, a credit note issued).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Db, migrate } from '../../src/core/db.ts';
import { AuditLog } from '../../src/core/audit.ts';
import { randomUUID } from 'node:crypto';
import { MIGRATIONS_DIR } from '../../src/core/app.ts';
import { announce, listen, listenersOf, EventOutsideTransaction, ListenerFailed } from '../../src/core/events.ts';

function fresh(): { db: Db; audit: AuditLog } {
  const db = new Db(':memory:');
  migrate(db, MIGRATIONS_DIR);
  return { db, audit: new AuditLog(db) };
}
const NOW = (): string => '2026-11-09T12:00:00.000Z';
const kinds = (db: Db): string[] => db.all<{ kind: string }>("SELECT kind FROM audit_log WHERE kind LIKE 'EVENT_%' ORDER BY seq").map((r) => r.kind);
const changed = (db: Db, id: string): number => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM businesses WHERE id = ?', [id])?.n ?? 0;
const change = (db: Db, id: string): void => {
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [id, 'An Invented Limited', 'dental', 'ASSESSMENT_SUBMITTED', NOW()]);
};

test('an announcement outside a transaction is refused, and nothing is written', () => {
  const { db, audit } = fresh();
  try {
    assert.throws(() => announce({ db, audit, now: NOW, actor: null }, 'finance', 'invoice.raised', { invoice_id: 'i-1', kind: 'FEE' }), EventOutsideTransaction);
    assert.deepEqual(kinds(db), []);
  } finally { db.close(); }
});

test('a listener runs in the same transaction, after the change; the announcement and its hearing are in the audit log', () => {
  const { db, audit } = fresh();
  const heard: string[] = [];
  const stop = listen('invoice.raised', 'test', 'note the invoice', (ctx, e) => {
    assert.equal(ctx.db.inTransaction, true);
    assert.equal(changed(ctx.db, 'b-1'), 1, 'the listener ran before the change it follows');
    heard.push(`${e.invoice_id} ${e.kind}`);
  });
  try {
    const n = db.tx(() => { change(db, 'b-1'); return announce({ db, audit, now: NOW, newId: randomUUID, actor: { id: 'u-1', role: 'ACCOUNTING' } }, 'finance', 'invoice.raised', { invoice_id: 'i-1', kind: 'FEE' }); });
    assert.ok(n >= 1);
    assert.deepEqual(heard, ['i-1 FEE']);
    assert.ok(listenersOf('invoice.raised').includes('test: note the invoice'));
    const lines = db.all<{ kind: string; object_id: string; detail: string }>("SELECT kind, object_id, detail FROM audit_log WHERE kind LIKE 'EVENT_%' ORDER BY seq");
    assert.equal(lines[0]?.kind, 'EVENT_ANNOUNCED');
    assert.equal(lines[0]?.object_id, 'invoice.raised');
    assert.equal(JSON.parse(lines[0]?.detail ?? '{}').from, 'finance');
    assert.ok(lines.some((l) => l.kind === 'EVENT_HEARD' && JSON.parse(l.detail).listener === 'note the invoice'));
  } finally { stop(); db.close(); }
});

test('a listener that fails undoes the change that caused it, and its audit lines, and the error names it', () => {
  const { db, audit } = fresh();
  const stop = listen('invoice.raised', 'test', 'always fails', () => { throw new Error('planted failure'); });
  try {
    assert.throws(
      () => db.tx(() => { change(db, 'b-2'); announce({ db, audit, now: NOW, newId: randomUUID, actor: null }, 'finance', 'invoice.raised', { invoice_id: 'i-2', kind: 'FEE' }); }),
      (e: unknown) => e instanceof ListenerFailed && e.listener === 'test: always fails' && /planted failure/.test(e.message),
    );
    assert.equal(changed(db, 'b-2'), 0, 'the change stayed although its listener failed');
    assert.deepEqual(kinds(db), [], 'the announcement was kept for a change that was undone');
  } finally { stop(); db.close(); }
});

test('the same listener registered twice listens once; stopping it removes it', () => {
  let n = 0;
  const a = listen('credit_note.issued', 'test', 'count', () => { n += 1; });
  listen('credit_note.issued', 'test', 'count', () => { n += 1; });
  const { db, audit } = fresh();
  try {
    db.tx(() => announce({ db, audit, now: NOW, newId: randomUUID, actor: null }, 'finance', 'credit_note.issued', { credit_note_id: 'c', invoice_id: 'i', basis: 'CREDIT_IN_FULL' }));
    assert.equal(n, 1);
    a();
    assert.ok(!listenersOf('credit_note.issued').includes('test: count'));
  } finally { a(); db.close(); }
});

test('the core\'s events file imports no module (it sits below them all)', () => {
  const text = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'core', 'events.ts'), 'utf8');
  assert.doesNotMatch(text, /from '\.\.\/(modules|integrations|app)\//);
});
