/**
 * PHASE 160j — WHAT THE CLIENT SENT, CHECKED, AND A FACT FOUND WHERE IT STANDS, 20 October 2026
 * (src/web/client-checks.ts, migration 119, the routes in src/web/claim-record-pages.ts, the panels in
 * src/web/claim-overview.ts; asking from the overview returns there, src/web/engaged-pages.ts).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import * as D from '../src/web/documents.ts';
import { ASK_AGAIN_DAYS, waitingForCheck } from '../src/web/client-checks.ts';
import { pdfOf } from './document-fixtures.ts';
import type { Actor } from '../src/authz.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string; location: string | null };
type Session = {
  get: (p: string) => Promise<Res>;
  post: (p: string, f: Record<string, string>) => Promise<Res>;
  upload: (p: string, f: Record<string, string>, file: Uint8Array) => Promise<Res>;
};
let made: Made;
let base = '';
let password = '';
let claim = ''; let biz = '';
const sessions = new Map<string, Session>();

async function signIn(who: string): Promise<Session> {
  const had = sessions.get(who);
  if (had !== undefined) return had;
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  const s: Session = {
    get: (p) => req(p),
    post: (p, f) => req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() }),
    upload: (p, f, file) => {
      const b = `----cb160j${randomBytes(8).toString('hex')}`;
      const parts: Buffer[] = [];
      for (const [k, v] of Object.entries(f)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
      parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="floor-plans.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'));
      parts.push(Buffer.from(file), Buffer.from('\r\n'), Buffer.from(`--${b}--\r\n`));
      return req(p, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body: Buffer.concat(parts) });
    },
  };
  const r = await s.post('/login', { email: `${who}@example.invalid`, password });
  assert.equal(r.status, 303, `${who} could not sign in`);
  sessions.set(who, s);
  return s;
}
const block = (html: string): string => /<section class="cov" id="where"[\s\S]*?<details class="cov-gloss">[\s\S]*?<\/details>\s*<\/div>\s*<\/div>\s*<\/section>/.exec(html)?.[0] ?? '';
const needList = (html: string): string => /<section class="cov-col" aria-labelledby="cov-need-h">([\s\S]*?)<\/section>/.exec(block(html))?.[1] ?? '';
const gotList = (html: string): string => /<section class="cov-col" aria-labelledby="cov-got-h">([\s\S]*?)<\/section>/.exec(block(html))?.[1] ?? '';
const userId = (email: string): string => made.app.db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])?.id ?? '';

/** Sales asks the client a question from the overview, and the client answers it in the portal. */
async function clientAnswers(question: string, answer: string): Promise<string> {
  const sales = await signIn('sales');
  const r = await sales.post(`/staff/clients/${biz}/tasks/send`, {
    fact_id: '', claim_id: claim, question, why: 'We need it for the survey.', holds_up: 'this claim', from: 'where',
  });
  assert.equal(r.status, 303);
  assert.equal(r.location, `/staff/claims/${claim}?done=sent#where`, 'asked from the overview, back to the overview');
  const id = made.app.db.get<{ id: string }>('SELECT id FROM client_tasks WHERE question = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', [question])?.id ?? '';
  const client = await signIn('client');
  const a = await client.post(`/portal/tasks/${id}`, { answer });
  assert.ok(a.status === 303 || a.status === 200, `the client could not answer: ${a.status}`);
  assert.equal(made.app.db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [id])?.state, 'ANSWERED');
  return id;
}

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160j-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  password = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
  const cu = made.app.db.get<{ business_id: string }>("SELECT business_id FROM users WHERE email = 'client@example.invalid'");
  assert.ok(cu !== undefined);
  biz = cu.business_id;
  claim = made.app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref LIMIT 1', [biz])?.id ?? '';
  assert.notEqual(claim, '');
});
after(() => made.close());

describe('Phase 160j: what the client sent waits to be checked', () => {
  test('a client’s answer is first in still needed, with what they said, and the two ways to deal with it', async () => {
    const id = await clientAnswers('When was the rear extension finished?', 'Spring 2020');
    const sales = await signIn('sales');
    const list = needList((await sales.get(`/staff/claims/${claim}`)).body);
    const first = /<li class="cov-need cov-([a-z]+)">([\s\S]*?)<\/li>/.exec(list);
    assert.equal(first?.[1], 'tocheck', 'what the client sent comes first');
    assert.match(first?.[2] ?? '', /When was the rear extension finished\?<\/span> <span class="badge b-info">Needs checking<\/span>/);
    assert.match(first?.[2] ?? '', /Sent by Client User in their portal, /);
    assert.match(first?.[2] ?? '', /<strong>What they sent:<\/strong> Spring 2020/);
    assert.match(first?.[2] ?? '', new RegExp(`action="/staff/claims/${claim}/sent/${id}/accept"`));
    assert.match(first?.[2] ?? '', new RegExp(`action="/staff/claims/${claim}/sent/${id}/ask-again"`));
    assert.match(first?.[2] ?? '', /<textarea name="reason" rows="2" maxlength="1000" required><\/textarea>/);
    assert.doesNotMatch(gotList((await sales.get(`/staff/claims/${claim}`)).body), /Spring 2020/, 'not gathered until it is accepted');
  });

  test('accepting it records who and when for good, writes the audit log, and moves it to gathered', async () => {
    const id = made.app.db.get<{ id: string }>("SELECT id FROM client_tasks WHERE question = 'When was the rear extension finished?'")?.id ?? '';
    const sales = await signIn('sales');
    const r = await sales.post(`/staff/claims/${claim}/sent/${id}/accept`, {});
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/claims/${claim}?done=accepted#where`);
    const k = made.app.db.get<{ outcome: string; checked_by: string }>('SELECT outcome, checked_by FROM client_task_checks WHERE task_id = ?', [id]);
    assert.deepEqual({ ...k }, { outcome: 'ACCEPTED', checked_by: userId('sales@example.invalid') });
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLIENT_SENT_ACCEPTED' AND object_id = ?", [id])?.n, 1);
    const page = (await sales.get(`/staff/claims/${claim}?done=accepted`)).body;
    assert.match(page, /<p class="saved" role="status">Accepted\.<\/p>/);
    assert.doesNotMatch(needList(page), /rear extension/);
    const got = gotList(page);
    assert.match(got, /When was the rear extension finished\?[\s\S]*?Spring 2020/);
    assert.match(got, /<dt>Checked and accepted by<\/dt><dd>Sales User, /);
    const again = await sales.post(`/staff/claims/${claim}/sent/${id}/accept`, {});
    assert.notEqual(again.status, 303, 'a check is made once');
    assert.match(again.body, /Someone has already checked this\./);
  });

  test('asking again needs a reason, opens a new question in the portal with it, and is kept and audited', async () => {
    const id = await clientAnswers('How many consulting rooms are there?', 'Lots');
    const sales = await signIn('sales');
    const none = await sales.post(`/staff/claims/${claim}/sent/${id}/ask-again`, { reason: '  ' });
    assert.notEqual(none.status, 303);
    assert.match(none.body, /Say what is wrong, so the client knows what to send\./);
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_task_checks WHERE task_id = ?', [id])?.n, 0);
    const r = await sales.post(`/staff/claims/${claim}/sent/${id}/ask-again`, { reason: 'Please give the number of rooms.' });
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/claims/${claim}?done=asked-again#where`);
    const k = made.app.db.get<{ outcome: string; reason: string; again: string }>('SELECT outcome, reason, asked_again_task_id AS again FROM client_task_checks WHERE task_id = ?', [id]);
    assert.equal(k?.outcome, 'ASKED_AGAIN');
    assert.equal(k?.reason, 'Please give the number of rooms.');
    const t = made.app.db.get<{ state: string; why: string; question: string; due_on: string; claim_id: string }>('SELECT state, why, question, due_on, claim_id FROM client_tasks WHERE id = ?', [k?.again ?? '']);
    assert.deepEqual({ state: t?.state, why: t?.why, question: t?.question, claim_id: t?.claim_id },
      { state: 'OPEN', why: 'Please give the number of rooms.', question: 'How many consulting rooms are there?', claim_id: claim });
    assert.equal(t?.due_on, new Date(Date.parse(made.app.now()) + ASK_AGAIN_DAYS * 86_400_000).toISOString().slice(0, 10));
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLIENT_SENT_ASKED_AGAIN' AND object_id = ?", [id])?.n, 1);
    const portal = (await (await signIn('client')).get('/portal')).body;
    assert.match(portal, /Please give the number of rooms\./, 'the client sees the reason in their portal');
    const page = (await sales.get(`/staff/claims/${claim}`)).body;
    assert.doesNotMatch(gotList(page), /Lots/, 'an answer asked for again is not gathered');
    assert.match(needList(page), /How many consulting rooms are there\?<\/span> <span class="badge b-warn">Asked<\/span>/);
  });

  test('a client’s upload against a request waits too, with a link to the file', async () => {
    const db = made.app.db;
    const r = D.createDocumentRequest({ db, audit: made.app.audit, now: made.app.now, newId: () => randomBytes(16).toString('hex') },
      { id: userId('sales@example.invalid'), role: 'SALES', business_id: null, disabled: false } as Actor,
      { business_id: biz, claim_id: claim, type_code: 'LEASE', why: 'the term', holds_up: 'the survey', due_on: null });
    assert.equal(r.ok, true);
    const sent = await (await signIn('client')).upload('/portal/documents', { request: r.ok ? r.id : '' },
      new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true })));
    assert.equal(sent.status, 303, sent.body);
    const waiting = waitingForCheck(db, biz, claim).find((x) => x.task_id === (r.ok ? r.id : ''));
    assert.ok(waiting !== undefined);
    assert.equal(waiting.kind, 'DOCUMENT');
    assert.notEqual(waiting.logical_document_id, null);
    const list = needList((await (await signIn('sales')).get(`/staff/claims/${claim}`)).body);
    assert.match(list, new RegExp(`<a href="/staff/documents/${waiting.logical_document_id ?? 'x'}">Open the file they uploaded</a>`));
  });

  test('asking again for a document opens a new request of the same kind', async () => {
    const db = made.app.db;
    const t = db.get<{ id: string }>("SELECT id FROM client_tasks WHERE kind = 'DOCUMENT' AND state = 'ANSWERED' AND answered_by_role = 'CLIENT' AND business_id = ? ORDER BY answered_at DESC LIMIT 1", [biz]);
    const r = await (await signIn('sales')).post(`/staff/claims/${claim}/sent/${t?.id ?? ''}/ask-again`, { reason: 'The lease is missing its last page.' });
    assert.equal(r.status, 303, r.body);
    const again = db.get<{ kind: string; requested_type: string; why: string; state: string }>(
      'SELECT kind, requested_type, why, state FROM client_tasks WHERE id = (SELECT asked_again_task_id FROM client_task_checks WHERE task_id = ?)', [t?.id ?? '']);
    assert.deepEqual({ ...again }, { kind: 'DOCUMENT', requested_type: 'LEASE', why: 'The lease is missing its last page.', state: 'OPEN' });
  });

  test('what staff recorded themselves needs no check; a check is never changed or deleted', () => {
    const db = made.app.db;
    db.run("INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, claim_id) " +
      "VALUES ('ct-160j-staff', ?, ?, 'Is the car park theirs?', 'the land', 'this claim', 'ANSWERED', 'ANSWERED', 'Yes', ?, ?, 'STAFF', ?, ?)",
      [biz, userId('sales@example.invalid'), made.app.now(), userId('sales@example.invalid'), made.app.now(), claim]);
    assert.equal(waitingForCheck(db, biz, claim).some((x) => x.task_id === 'ct-160j-staff'), false);
    assert.throws(() => db.run("UPDATE client_task_checks SET outcome = 'ACCEPTED' WHERE outcome = 'ASKED_AGAIN'"), /never edited/);
    assert.throws(() => db.run('DELETE FROM client_task_checks'), /never deleted/);
  });

  test('only Admin and Sales may check: Accounting is refused and nothing is written', async () => {
    const id = await clientAnswers('Who cleans the building?', 'A contractor');
    const acc = await signIn('accounting');
    const r = await acc.post(`/staff/claims/${claim}/sent/${id}/accept`, {});
    assert.notEqual(r.status, 303);
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_task_checks WHERE task_id = ?', [id])?.n, 0);
  });
});

describe('Phase 160j: a fact found where it stands', () => {
  test('each fact still to find has its own box and a way to ask the client; one already asked is not offered twice', async () => {
    const sales = await signIn('sales');
    const list = needList((await sales.get(`/staff/claims/${claim}`)).body);
    const fact = [...list.matchAll(/<li class="cov-need cov-needed">((?:(?!<\/li>)[\s\S])*)<\/li>/g)].find((m) => m[1]?.includes('<summary>Type it in, or ask the client</summary>')) ?? null;
    assert.ok(fact !== null, 'at least one fact to find, with its box');
    const item = fact[0];
    assert.doesNotMatch(item, /—/, 'the question sent to the client has no long dash');
    assert.match(item, /<input type="hidden" name="answer" value="VALUE"><input type="hidden" name="from" value="where">/);
    assert.match(item, /<label>Where did you get this\? <span class="req">\(required\)<\/span> <select name="source_id" required><option value="">Choose one<\/option>/);
    assert.match(item, /<button type="submit">Ask the client in their portal<\/button>/);
    const key = /name="fact_key" value="([A-Z_]+)"/.exec(item)?.[1] ?? '';
    assert.notEqual(key, '');
    const ask = await sales.post(`/staff/clients/${biz}/tasks/send`, { fact_id: `claim_fact.${key}`, claim_id: claim, question: 'Can you tell us this?', why: 'We need this to finish your claim.', holds_up: 'this claim', from: 'where' });
    assert.equal(ask.status, 303);
    assert.doesNotMatch(needList((await sales.get(`/staff/claims/${claim}`)).body), new RegExp(`name="fact_key" value="${key}"`), 'asked, so not offered again');
  });

  test('a fact typed from the line needs its source, is recorded with it, and the page returns to the overview', async () => {
    const sales = await signIn('sales');
    const none = await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'ELECTION_EXISTS', answer: 'VALUE', value: 'NO', source_id: '', note: '', from: 'where' });
    assert.notEqual(none.status, 303);
    const r = await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'ELECTION_EXISTS', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_ANSWER', note: 'Asked on the phone', from: 'where' });
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/claims/${claim}?done=saved#where`);
    const f = made.app.db.get<{ source_id: string; note: string }>("SELECT source_id, note FROM claim_facts WHERE claim_id = ? AND fact_key = 'ELECTION_EXISTS' ORDER BY recorded_at DESC, rowid DESC LIMIT 1", [claim]);
    assert.deepEqual({ ...f }, { source_id: 'CLIENT_ANSWER', note: 'Asked on the phone' });
    const page = (await sales.get(`/staff/claims/${claim}`)).body;
    assert.doesNotMatch(needList(page), /name="fact_key" value="ELECTION_EXISTS"/);
  });

  test('Accounting gets no boxes: the block is not theirs', async () => {
    const page = (await (await signIn('accounting')).get(`/staff/claims/${claim}`)).body;
    assert.doesNotMatch(page, /class="cov-act"/);
  });

  test('no long dash, script or inline style in the block, and the client’s audit log finds the asks', async () => {
    const page = (await (await signIn('sales')).get(`/staff/claims/${claim}`)).body;
    assert.doesNotMatch(block(page), /—|<script|\sstyle=/);
    const r = await (await signIn('admin')).get(`/staff/audit?client=${biz}`);
    assert.match(r.body, /<td>Accepted what the client sent<\/td>/);
    assert.match(r.body, /<td>Asked the client again, saying why<\/td>/);
    assert.match(r.body, /<td>The client sent a document we asked for<\/td>/);
  });
});
