/**
 * PHASE 142a — THE CHAT FOLLOW-ON. 22 September 2026. Between clean-up 9 and 10 of 11.
 *
 *   1 · MESSAGE_RETENTION, built and switched off: off deletes nothing, in each of its ways; on, it deletes only what is
 *       past its period — the claim file's rule for a company with a claim, a fixed period for one without — writes a
 *       deletion log entry first, audits ids and counts and never the words, and leaves a message's file in Files
 *   2 · NO OTHER PATH CAN DELETE A MESSAGE: the database refuses every delete the job did not log first, and nothing else
 *       in src/ deletes from either thread
 *   3 · new-message alerts, built behind EMAIL_SENDING: off, nothing is queued at all; on, the other side is told a message
 *       is waiting — never the words — with send_requested = 1, and a do-not-contact company is refused
 *   4 · one name for the notes: the claim page and the property page call them "Team only", with a link to the Chat
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import * as M from '../src/web/messages.ts';
import * as IE from '../src/web/inbound-email.ts';
import { addNote } from '../src/web/engaged.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import {
  MESSAGE_RETENTION, MESSAGE_RETENTION_QUESTION, MESSAGE_RETENTION_RECOMMENDED, addMonths, messagesDue, retentionMissing, sweepMessages,
  type MessageRetention,
} from '../src/web/message-retention.ts';
import type { EmailSending } from '../src/stubs/email-provider.ts';
import { pdfOf } from './document-fixtures.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };

function makeClient(base: string): { get(p: string): Promise<Res>; post(p: string, f: Record<string, string>): Promise<Res>; upload(p: string, f: Record<string, string>, file: Uint8Array): Promise<Res> } {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, location: r.headers.get('location'), body: await r.text() };
  };
  return {
    get: (path) => req(path),
    post: (path, fields) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
    upload(path, fields, file) {
      const b = `----cb142a${randomBytes(8).toString('hex')}`;
      const parts: Buffer[] = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
      parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="lease.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'));
      parts.push(Buffer.from(file), Buffer.from('\r\n'), Buffer.from(`--${b}--\r\n`));
      return req(path, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body: Buffer.concat(parts) });
    },
  };
}

type World = {
  made: Made; close(): void; clock: { now: string }; base: string; password: string;
  as(role: string): Actor; client: Actor; corvale: string; dunmarrow: string;
  deps(extra?: Partial<M.MessageDeps>): M.MessageDeps;
  count(sql: string, p?: (string | number | null)[]): number;
};

async function boot(): Promise<World> {
  const clock = { now: '2026-09-21T10:00:00.000Z' };
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-142a-')), now: () => clock.now, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const byRole = (role: string): string => s.users.find((u) => u.role === role)?.id ?? '';
  const clientRow = db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM users WHERE role = 'CLIENT'");
  assert.ok(clientRow);
  return {
    made, close: made.close, clock, base, password: s.password,
    as: (role) => ({ id: byRole(role), role, business_id: role === 'CLIENT' ? clientRow.business_id : null, disabled: false }) as Actor,
    client: { id: clientRow.id, role: 'CLIENT', business_id: clientRow.business_id, disabled: false } as Actor,
    corvale: clientRow.business_id,
    dunmarrow: db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")?.id ?? '',
    deps: (extra = {}) => ({ db, audit: made.app.audit, now: made.app.now, newId: randomUUID, ...extra }),
    count: (sql, p = []) => db.get<{ n: number }>(sql, p)?.n ?? 0,
  };
}

/** A company with no claim, as a website enquiry leaves one. */
function prospect(w: World, name: string): string {
  const id = randomUUID();
  w.made.app.db.run("INSERT INTO businesses (id, name, sector, stage, created_at, client_status) VALUES (?, ?, 'dental', 'ENQUIRY', ?, 'PROSPECT')",
    [id, name, w.clock.now]);
  return id;
}

/** Set a claim's two file dates: its accounting period end, and its client report issued on a day. */
function closeClaimFile(w: World, claim_id: string, period_end: string | 'UNKNOWN', report_on: string | null): void {
  const db = w.made.app.db;
  const admin = w.as('ADMIN').id;
  db.run("INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_date, source_id, recorded_by, recorded_at) VALUES (?, ?, 'ACCOUNTING_PERIOD_END', ?, ?, 'CLIENT_ANSWER', ?, ?)",
    [randomUUID(), claim_id, period_end === 'UNKNOWN' ? 'UNKNOWN' : 'VALUE', period_end === 'UNKNOWN' ? null : period_end, admin, w.clock.now]);
  if (report_on !== null) {
    const id = randomUUID();
    db.run("INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, created_by, created_at, updated_by, updated_at) " +
      "VALUES (?, ?, 'CLIENT_REPORT', (SELECT COUNT(*) + 1 FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT'), 'CA_REPORT', 'DRAFT', NULL, ?, ?, ?, ?)",
    [id, claim_id, claim_id, admin, w.clock.now, admin, w.clock.now]);
    db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = ?, updated_at = ? WHERE id = ?", [report_on, w.clock.now, id]);
  }
}

const ON: MessageRetention = Object.freeze({
  enabled: true, with_claim_years: 6, without_claim_months: 12,
  approved_by: 'the data protection officer', review_ref: 'DPO-REVIEW-142a', question: MESSAGE_RETENTION_QUESTION,
});

const SENDING_ON: EmailSending = Object.freeze({
  enabled: true, provider: 'SMTP', named_in_privacy_notice: true, named_in_engagement_letter: true, mailbox_and_dns_ready: true,
  question: 'Which email service should send our emails from contactus@caprebate.com?',
});
const LOGIN = Object.freeze({ host: 'smtp.example.invalid', port: 465, user: 'contactus@caprebate.com', password: 'x' });

/* ================================================================== *
 * 1 · MESSAGE_RETENTION — BUILT, AND SWITCHED OFF
 * ================================================================== */

describe('1 · the message clean-up job is built and switched off', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('it ships off, in every way, and the case stamp says so', () => {
    assert.equal(MESSAGE_RETENTION.enabled, false);
    assert.equal(MESSAGE_RETENTION.with_claim_years, null);
    assert.equal(MESSAGE_RETENTION.without_claim_months, null);
    assert.equal(MESSAGE_RETENTION.approved_by, null);
    assert.equal(MESSAGE_RETENTION.question, 'How long do we keep client messages and the team chat?');
    assert.deepEqual(MESSAGE_RETENTION_RECOMMENDED, { with_claim_years: 6, without_claim_months: 12 });
    assert.equal(retentionMissing(MESSAGE_RETENTION).length, 3);
    assert.deepEqual(backendSwitchReadings().filter((x) => x.switch === 'MESSAGE_RETENTION'),
      [{ switch: 'MESSAGE_RETENTION', on: false, home: 'src/web/message-retention.ts' }]);
  });

  test('OFF DELETES NOTHING — shipped, and each half-set way — even with every message decades old', () => {
    const d = w.deps();
    const p = prospect(w, 'Oldcastle Dental Limited');
    assert.ok(M.postClientMessage(d, w.as('SALES'), p, { body: 'Phase 142a words kept while off', claim_id: null }).ok);
    assert.ok(addNote(d, w.as('SALES'), p, 'Phase 142a team words kept while off').ok);
    const before = {
      client: w.count('SELECT COUNT(*) AS n FROM client_messages'), team: w.count('SELECT COUNT(*) AS n FROM internal_notes'),
      log: w.count('SELECT COUNT(*) AS n FROM deletion_log'), audit: w.made.app.audit.entries().length,
    };
    w.clock.now = '2060-01-01T10:00:00.000Z';
    for (const cfg of [
      MESSAGE_RETENTION,
      { ...ON, enabled: false },
      { ...ON, with_claim_years: null, without_claim_months: null },
      { ...ON, approved_by: null },
      { ...ON, review_ref: '  ' },
      { ...ON, without_claim_months: 0, with_claim_years: 1.5 },
    ] as MessageRetention[]) {
      assert.deepEqual(messagesDue(w.made.app.db, cfg, w.clock.now), []);
      const r = sweepMessages(d, cfg);
      assert.equal(r.state, 'OFF');
    }
    assert.equal(w.count('SELECT COUNT(*) AS n FROM client_messages'), before.client);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM internal_notes'), before.team);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM deletion_log'), before.log);
    assert.equal(w.made.app.audit.entries().length, before.audit, 'off wrote an audit line');
    w.clock.now = '2026-09-21T10:00:00.000Z';
  });

  test('the calendar: months are added in the calendar, and the end of a month holds', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2027-01-31', 13), '2028-02-29');
    assert.equal(addMonths('2026-10-15', 12), '2027-10-15');
    assert.equal(addMonths('2029-01-31', 72), '2035-01-31');
  });
});

describe('1 · on, it deletes only what is past its period', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('A COMPANY WITH NO CLAIM: twelve months after its last message, on either thread — not a day before', () => {
    const d = w.deps();
    const p = prospect(w, 'Harrowgate Dental Limited');
    w.clock.now = '2026-10-15T09:00:00.000Z';
    const neighbour = prospect(w, 'Neighbour Dental Limited');
    assert.ok(M.postClientMessage(d, w.as('SALES'), neighbour, { body: 'Phase 142a neighbour words', claim_id: null }).ok);
    w.clock.now = '2027-06-01T09:00:00.000Z';
    assert.ok(addNote(d, w.as('SALES'), neighbour, 'Phase 142a neighbour keeps talking').ok);
    w.clock.now = '2026-10-15T09:00:00.000Z';
    const a = M.postClientMessage(d, w.as('SALES'), p, { body: 'Phase 142a first words', claim_id: null });
    assert.ok(a.ok);
    w.clock.now = '2026-11-02T09:00:00.000Z';
    const n = addNote(d, w.as('SALES'), p, 'Phase 142a last team words');
    assert.ok(n.ok);
    // Twelve months from the FIRST message is not enough: the clock runs from the last one, on either thread.
    w.clock.now = '2027-10-20T09:00:00.000Z';
    assert.deepEqual(messagesDue(w.made.app.db, ON, w.clock.now).filter((r) => r.business_id === p), []);
    // The day the period ends is not past it.
    w.clock.now = '2027-11-02T23:00:00.000Z';
    assert.deepEqual(messagesDue(w.made.app.db, ON, w.clock.now).filter((r) => r.business_id === p), []);
    w.clock.now = '2027-11-03T09:00:00.000Z';
    const due = messagesDue(w.made.app.db, ON, w.clock.now).filter((r) => r.business_id === p);
    assert.equal(due.length, 2);
    assert.ok(due.every((r) => r.rule === 'WITHOUT_CLAIM' && r.due_on === '2027-11-02'));

    const r = sweepMessages(d, ON, w.as('ADMIN'));
    assert.equal(r.state, 'RAN');
    assert.equal(w.count('SELECT COUNT(*) AS n FROM client_messages WHERE business_id = ?', [p]), 0);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM internal_notes WHERE business_id = ?', [p]), 0);
    // Every other company's messages are untouched.
    // A company whose last message is newer keeps all of its messages, the old one too.
    assert.equal(w.count('SELECT COUNT(*) AS n FROM client_messages WHERE business_id = ?', [neighbour]), 1, 'the neighbour’s message went too');

    // THE DELETION LOG: one entry per record, its kind and id, never a word; the backup cycle not known, so pending.
    const log = w.made.app.db.all<{ record_kind: string; record_id: string; basis_rule: string; basis_due_on: string; approved_by: string; review_ref: string; backups_pending: number; backup_cycle_days: number | null; stores_json: string; category: string }>(
      "SELECT * FROM deletion_log WHERE basis_rule = 'MSG-RETENTION' ORDER BY record_kind");
    assert.deepEqual(log.map((l) => l.record_kind), ['CLIENT_MESSAGE', 'TEAM_MESSAGE']);
    assert.deepEqual(log.map((l) => l.record_id).sort(), [a.ok ? a.id : '', n.ok ? n.id : ''].sort());
    for (const l of log) {
      assert.equal(l.basis_due_on, '2027-11-02');
      assert.equal(l.approved_by, 'the data protection officer');
      assert.equal(l.review_ref, 'DPO-REVIEW-142a');
      assert.equal(l.backups_pending, 1);
      assert.equal(l.backup_cycle_days, null);
      assert.doesNotMatch(JSON.stringify(l), /Phase 142a/);
    }
    // THE AUDIT: ids and counts, never the words.
    const e = w.made.app.audit.entries().filter((x) => x.kind === 'MESSAGES_DELETED');
    assert.equal(e.length, 1);
    const detail = JSON.stringify(e[0]?.detail);
    assert.match(detail, /"client_messages":1/);
    assert.match(detail, /"team_messages":1/);
    assert.ok(detail.includes(a.ok ? a.id : 'x') && detail.includes(n.ok ? n.id : 'x'));
    assert.doesNotMatch(detail, /Phase 142a|words/);
    assert.equal(w.made.app.audit.verify().intact, true);
  });

  test('A COMPANY WITH A CLAIM FOLLOWS THE CLAIM FILE — and while any claim’s date is not known, nothing on it is due (N4)', () => {
    const d = w.deps();
    const db = w.made.app.db;
    const claims = db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref', [w.dunmarrow]);
    assert.equal(claims.length, 2);
    w.clock.now = '2026-09-22T09:00:00.000Z';
    const m = M.postClientMessage(d, w.as('SALES'), w.dunmarrow, { body: 'Phase 142a claim words', claim_id: null });
    assert.ok(m.ok);
    const far = '2070-01-01T09:00:00.000Z';
    const onDun = (at: string, cfg: MessageRetention = ON) => messagesDue(db, cfg, at).filter((r) => r.business_id === w.dunmarrow);

    // Neither claim has a date: not known is never a pass, however far ahead.
    assert.deepEqual(onDun(far), []);
    // One claim known, the other's period end recorded as UNKNOWN: still nothing.
    closeClaimFile(w, claims[0]?.id ?? '', '2027-03-31', '2027-06-30');
    closeClaimFile(w, claims[1]?.id ?? '', 'UNKNOWN', '2027-06-30');
    assert.deepEqual(onDun(far), []);
    // The second claim's period end becomes known — later than its report, so the period end starts its clock.
    closeClaimFile(w, claims[1]?.id ?? '', '2028-03-31', null);
    // The latest claim governs: 2028-03-31 plus six years.
    assert.deepEqual(onDun('2034-03-31T12:00:00.000Z'), []);
    const due = onDun('2034-04-01T09:00:00.000Z');
    assert.ok(due.length >= 1);
    assert.ok(due.every((r) => r.rule === 'WITH_CLAIM' && r.due_on === '2034-03-31'));
    // The claim rule off: a company with a claim keeps everything.
    assert.deepEqual(onDun('2034-04-01T09:00:00.000Z', { ...ON, with_claim_years: null }), []);

    // A message written after the claim files closed keeps its own twelve months — or all of it, with that rule off.
    w.clock.now = '2034-06-01T09:00:00.000Z';
    const late = M.postClientMessage(d, w.as('SALES'), w.dunmarrow, { body: 'Phase 142a after the file', claim_id: null });
    assert.ok(late.ok);
    const lateDue = onDun('2034-06-02T09:00:00.000Z');
    assert.equal(lateDue.some((r) => late.ok && r.id === late.id), false);
    assert.equal(onDun('2035-06-02T09:00:00.000Z').some((r) => late.ok && r.id === late.id && r.due_on === '2035-06-01'), true);
    assert.equal(onDun('2035-06-02T09:00:00.000Z', { ...ON, without_claim_months: null }).some((r) => late.ok && r.id === late.id), false);
  });

  test('A LIVE LEGAL HOLD on the company keeps every message on it', () => {
    const db = w.made.app.db;
    const p = prospect(w, 'Holdfast Dental Limited');
    w.clock.now = '2026-09-22T09:00:00.000Z';
    assert.ok(M.postClientMessage(w.deps(), w.as('SALES'), p, { body: 'Phase 142a held', claim_id: null }).ok);
    db.run("INSERT INTO legal_holds (id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_by, set_at) VALUES (?, 'LEGAL_HOLD', 'COMPANY', ?, 'DISPUTE', 'A dispute about the fee', '2030-01-01', ?, ?)",
      [randomUUID(), p, w.as('ADMIN').id, w.clock.now]);
    assert.deepEqual(messagesDue(db, ON, '2040-01-01T09:00:00.000Z').filter((r) => r.business_id === p), []);
  });
});

describe('1 · a message’s file stays in Files; an emailed reply goes with its message', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('a file the client sent with a message keeps its own document rules: the message goes, the file stays', async () => {
    const db = w.made.app.db;
    const c = makeClient(w.base);
    assert.equal((await c.post('/login', { email: 'client@example.invalid', password: w.password })).status, 303);
    const type = db.get<{ code: string }>("SELECT code FROM document_types WHERE code = 'LEASE'")?.code ?? 'LEASE';
    const pdf = new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true }));
    const r = await c.upload('/portal/messages', { body: 'Phase 142a here is our lease', type_code: type }, pdf);
    assert.equal(r.status, 303, r.body.slice(0, 400));
    const link = db.get<{ message_id: string; logical_document_id: string }>(
      'SELECT f.message_id, f.logical_document_id FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE m.business_id = ?', [w.corvale]);
    assert.ok(link, 'the file was not linked to the message');
    const claim = db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [w.corvale])?.id ?? '';
    closeClaimFile(w, claim, '2027-03-31', '2027-06-30');
    w.clock.now = '2034-01-01T09:00:00.000Z';
    const s = sweepMessages(w.deps(), ON);
    assert.equal(s.state, 'RAN');
    assert.equal(w.count('SELECT COUNT(*) AS n FROM client_messages WHERE id = ?', [link.message_id]), 0);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM client_message_files WHERE message_id = ?', [link.message_id]), 0);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM logical_documents WHERE id = ?', [link.logical_document_id]), 1, 'the file went with the message');
    assert.equal(w.count('SELECT COUNT(*) AS n FROM documents WHERE logical_document_id = ?', [link.logical_document_id]) >= 1, true);
  });

  test('an emailed reply, filed from the queue, is deleted with its message; one nobody filed goes after twelve months', () => {
    const db = w.made.app.db;
    const p = prospect(w, 'Mailford Dental Limited');
    w.clock.now = '2026-09-22T09:00:00.000Z';
    const queued = (uid: string): string => {
      const id = randomUUID();
      db.run("INSERT INTO inbound_email (id, received_at, mailbox_uid, message_id, from_address, subject, text_body, outcome, queue_reason) VALUES (?, ?, ?, NULL, 'someone@example.invalid', 'Re: your claim', 'Phase 142a emailed words', 'QUEUED', 'NO_MATCH')",
        [id, w.clock.now, uid]);
      db.run("INSERT INTO inbound_email_files (id, inbound_email_id, part_no, content_type, size_bytes) VALUES (?, ?, 1, 'application/pdf', 10)", [randomUUID(), id]);
      return id;
    };
    const filed = queued('9001');
    const loose = queued('9002');
    const f = IE.fileQueued(w.deps(), w.as('SALES'), filed, p);
    assert.ok(f.ok);
    w.clock.now = '2027-09-23T09:00:00.000Z';
    const s = sweepMessages(w.deps(), ON);
    assert.equal(s.state, 'RAN');
    if (s.state === 'RAN') assert.equal(s.emails, 2);
    for (const id of [filed, loose]) {
      assert.equal(w.count('SELECT COUNT(*) AS n FROM inbound_email WHERE id = ?', [id]), 0);
      assert.equal(w.count('SELECT COUNT(*) AS n FROM inbound_email_files WHERE inbound_email_id = ?', [id]), 0);
      assert.equal(w.count("SELECT COUNT(*) AS n FROM deletion_log WHERE record_kind = 'INBOUND_EMAIL' AND record_id = ?", [id]), 1);
    }
    assert.equal(w.count('SELECT COUNT(*) AS n FROM inbound_email_filings'), 0);
    assert.equal(w.count("SELECT COUNT(*) AS n FROM client_messages WHERE body = 'Phase 142a emailed words'"), 0);
  });
});

/* ================================================================== *
 * 2 · NO OTHER PATH CAN DELETE A MESSAGE
 * ================================================================== */

describe('2 · the job is the only path that can delete a message', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('the database refuses every delete the job did not log first — and a log entry under any other rule opens nothing', () => {
    const db = w.made.app.db;
    const d = w.deps();
    const m = M.postClientMessage(d, w.as('SALES'), w.dunmarrow, { body: 'Phase 142a guarded', claim_id: null });
    assert.ok(m.ok);
    const n = addNote(d, w.as('SALES'), w.dunmarrow, 'Phase 142a guarded note');
    assert.ok(n.ok);
    assert.throws(() => db.run('DELETE FROM client_messages WHERE id = ?', [m.ok ? m.id : '']), /never deleted/);
    assert.throws(() => db.run('DELETE FROM internal_notes WHERE id = ?', [n.ok ? n.id : '']), /never deleted/);
    assert.throws(() => db.run('DELETE FROM internal_notes'), /never deleted/);
    // A deletion log entry under another rule is not the job's.
    db.run("INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, executed_at, stores_json, backups_pending) " +
      "VALUES (?, 'CLIENT_MESSAGE', ?, 'x', 'RET-7', NULL, 'someone', 'R', 'someone', ?, '[]', 1)", [`DEL-${randomUUID()}`, m.ok ? m.id : '', w.clock.now]);
    assert.throws(() => db.run('DELETE FROM client_messages WHERE id = ?', [m.ok ? m.id : '']), /never deleted/);
    // An entry for one message opens that message only, never its neighbour.
    db.run("INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, executed_at, stores_json, backups_pending) " +
      "VALUES (?, 'TEAM_MESSAGE', 'not-this-note', 'x', 'MSG-RETENTION', NULL, 'someone', 'R', 'someone', ?, '[]', 1)", [`DEL-${randomUUID()}`, w.clock.now]);
    assert.throws(() => db.run('DELETE FROM internal_notes WHERE id = ?', [n.ok ? n.id : '']), /never deleted/);
    assert.throws(() => db.run('UPDATE client_messages SET body = ? WHERE id = ?', ['changed', m.ok ? m.id : '']), /never edited/);
  });

  test('nothing in src/ but the job deletes from either thread, or from what hangs off a message', () => {
    const root = join(import.meta.dirname, '..', 'src');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts') && /DELETE\s+FROM\s+(client_messages|internal_notes|client_message_files|inbound_email)\b/i.test(readFileSync(p, 'utf8'))) {
          hits.push(p.slice(root.length + 1));
        }
      }
    };
    walk(root);
    assert.deepEqual(hits, ['web/message-retention.ts']);
  });
});

/* ================================================================== *
 * 3 · NEW-MESSAGE ALERTS, BEHIND EMAIL_SENDING
 * ================================================================== */

describe('3 · a new message tells the other side — only while sending is on', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  const notices = (w: World): { to_email: string; subject: string; body: string; send_requested: number; business_id: string | null }[] =>
    w.made.app.db.all("SELECT to_email, subject, body, send_requested, business_id FROM outbox WHERE kind = 'NOTIFICATION' AND subject LIKE '%new message%' ORDER BY created_at");

  test('OFF: nothing is queued at all — not even "saved, not sent"', () => {
    const before = w.count('SELECT COUNT(*) AS n FROM outbox');
    const a = M.postClientMessage(w.deps(), w.client, w.corvale, { body: 'Phase 142a while off', claim_id: null });
    assert.ok(a.ok);
    const b = M.postClientMessage(w.deps(), w.as('SALES'), w.corvale, { body: 'Phase 142a reply while off', claim_id: null });
    assert.ok(b.ok);
    assert.equal(w.count('SELECT COUNT(*) AS n FROM outbox'), before);
    assert.deepEqual(M.alertNewMessage(w.deps(), a.ok ? a.id : ''), { state: 'OFF' });
    // Every condition but the login: still off.
    assert.deepEqual(M.alertNewMessage(w.deps({ sending: SENDING_ON, login: null }), a.ok ? a.id : ''), { state: 'OFF' });
    assert.equal(w.count("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLIENT_MESSAGE_ALERT'"), 0);
  });

  test('ON: the client writes — Sales is told (the company has no owner); we write — the client’s login is told; never the words', () => {
    const on = w.deps({ sending: SENDING_ON, login: LOGIN, origin: 'https://caprebate.example.invalid' });
    const a = M.postClientMessage(on, w.client, w.corvale, { body: 'Phase 142a secret words from the client', claim_id: null });
    assert.ok(a.ok);
    let n = notices(w);
    assert.equal(n.length, 1);
    assert.equal(n[0]?.to_email, 'sales@example.invalid');
    assert.equal(n[0]?.send_requested, 1);
    assert.equal(n[0]?.subject, 'A client has sent a new message', 'the subject carries more than the switch allows');
    assert.match(n[0]?.body ?? '', /https:\/\/caprebate\.example\.invalid\/staff\/clients\/[A-Za-z0-9-]+\?chat=client#chat/);

    const b = M.postClientMessage(on, w.as('SALES'), w.corvale, { body: 'Phase 142a secret words from us', claim_id: null });
    assert.ok(b.ok);
    n = notices(w);
    assert.equal(n.length, 2);
    assert.equal(n[1]?.to_email, 'client@example.invalid');
    assert.equal(n[1]?.subject, 'You have a new message from Cap Rebate');
    assert.match(n[1]?.body ?? '', /waiting for you in your Cap Rebate portal/);
    assert.match(n[1]?.body ?? '', /\/portal\/messages/);
    for (const x of n) assert.doesNotMatch(`${x.subject} ${x.body}`, /secret words|Corvale/, 'an alert carried the words or the name');
    const audit = w.made.app.audit.entries().filter((e) => e.kind === 'CLIENT_MESSAGE_ALERT');
    assert.equal(audit.length, 2);
    for (const e of audit) assert.doesNotMatch(JSON.stringify(e.detail), /secret words|@example\.invalid/);
  });

  test('ON: the company’s owner is told rather than every Sales login', () => {
    const on = w.deps({ sending: SENDING_ON, login: LOGIN });
    const admin = w.as('ADMIN');
    w.made.app.db.run('UPDATE businesses SET owner_id = ? WHERE id = ?', [admin.id, w.corvale]);
    const before = notices(w).length;
    assert.ok(M.postClientMessage(on, w.client, w.corvale, { body: 'Phase 142a to the owner', claim_id: null }).ok);
    const n = notices(w);
    assert.equal(n.length, before + 1);
    assert.equal(n.at(-1)?.to_email, 'admin@example.invalid');
    w.made.app.db.run('UPDATE businesses SET owner_id = NULL WHERE id = ?', [w.corvale]);
  });

  test('ON: a do-not-contact company is refused, as everywhere — the client’s message is kept, and no alert is queued', () => {
    const on = w.deps({ sending: SENDING_ON, login: LOGIN });
    const was = w.made.app.db.get<{ s: string }>('SELECT client_status AS s FROM businesses WHERE id = ?', [w.corvale])?.s ?? '';
    w.made.app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [w.corvale]);
    const before = w.count('SELECT COUNT(*) AS n FROM outbox');
    const a = M.postClientMessage(on, w.client, w.corvale, { body: 'Phase 142a from a do-not-contact company', claim_id: null });
    assert.ok(a.ok, 'a client writing to us is always taken');
    assert.equal(w.count('SELECT COUNT(*) AS n FROM outbox'), before);
    assert.deepEqual(M.alertNewMessage(on, a.ok ? a.id : ''), { state: 'NOT_QUEUED', why: 'DO_NOT_CONTACT' });
    w.made.app.db.run('UPDATE businesses SET client_status = ? WHERE id = ?', [was, w.corvale]);
  });

  test('the words of an alert: the company leads the subject only if the switch says so', () => {
    assert.equal(M.alertWords('STAFF', 'Corvale Supported Living Limited', 'b1', null).subject, 'Corvale Supported Living Limited — a client has sent a new message');
    assert.equal(M.alertWords('CLIENT', null, 'b1', null).body.includes('Sign in to your portal to read it.'), true);
  });
});

/* ================================================================== *
 * 4 · ONE NAME FOR THE NOTES
 * ================================================================== */

describe('4 · the claim page and the property page call the notes "Team only", with a link to the Chat', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('Sales reads "Team only" and a link to the company’s team chat on both pages; each page keeps its own notes', async () => {
    const db = w.made.app.db;
    const claim = db.get<{ id: string; property_id: string }>('SELECT id, property_id FROM claims WHERE business_id = ? ORDER BY claim_ref LIMIT 1', [w.dunmarrow]);
    assert.ok(claim);
    const sales = makeClient(w.base);
    assert.equal((await sales.post('/login', { email: 'sales@example.invalid', password: w.password })).status, 303);
    assert.equal((await sales.post(`/staff/claims/${claim.id}/notes`, { body: 'Phase 142a note on the claim' })).status, 303);
    for (const path of [`/staff/claims/${claim.id}`, `/staff/properties/${claim.property_id}`]) {
      const r = await sales.get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.body, /<div class="pnum">Team only<\/div>/, path);
      assert.doesNotMatch(r.body, /Internal notes — never shown to the client/, path);
      assert.ok(r.body.includes(`href="/staff/clients/${w.dunmarrow}?chat=team#chat"`), `${path}: no link to the team chat`);
    }
    assert.match((await sales.get(`/staff/claims/${claim.id}`)).body, /Phase 142a note on the claim/);
    // The client never sees either.
    const client = makeClient(w.base);
    assert.equal((await client.post('/login', { email: 'client@example.invalid', password: w.password })).status, 303);
    for (const path of ['/portal', '/portal/messages']) {
      const r = await client.get(path);
      assert.doesNotMatch(r.body, /Team only|Phase 142a note on the claim/, path);
    }
  });
});
