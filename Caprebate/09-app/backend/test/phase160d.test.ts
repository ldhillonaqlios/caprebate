/**
 * PHASE 160d — NO LONG DASHES IN THE EMAILS, THE LETTER AND REPORTS GOING FORWARD, THE TEXT THE SYSTEM WRITES, AND THE
 * EXPORT'S COLUMN NAMES, 19 October 2026 (src/stubs/email.ts, src/web/letter.ts, src/web/claim-record.ts, src/web/leads.ts,
 * src/web/lists.ts, src/web/booking-invite.ts, src/web/templates.ts, migration 117; the report's versions are in
 * test/survey-report.test.ts).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { outboxTransport } from '../src/stubs/email.ts';
import { plainDashLines } from '../src/web/plain-dashes.ts';
import { loadLetter, letterExists, LETTER_PATH, TEST_LETTER_PATH } from '../src/web/letter.ts';
import { DISPOSAL_TASK_TITLE, DISPOSAL_TASK_TITLE_BEFORE } from '../src/web/claim-record.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
let made: Made;
const DASH = /—/;
let n = 0;
const ids = (): string => `id-160d-${(++n).toString()}`;

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160d-')) });
  await seed(made.app.db, made.app.hasher, made.app.now);
});
after(() => made.close());

describe('Phase 160d: the emails', () => {
  test('a long dash in an email we write becomes plain punctuation, in the subject and the body, line by line', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const r = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: 'Your claim — the next step',
      body: 'Tax return — a document we need\n\nThe survey — booked — is on Tuesday.\nCall us — or write.' });
    assert.ok(r.id !== null);
    const row = made.app.db.get<{ subject: string; body: string }>('SELECT subject, body FROM outbox WHERE id = ?', [r.id]);
    assert.equal(row?.subject, 'Your claim: the next step');
    assert.equal(row?.body, 'Tax return: a document we need\n\nThe survey, booked, is on Tuesday.\nCall us, or write.');
  });

  test('an email a member of staff typed themselves keeps their words', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const r = t.send({ to_email: 'someone@example.com', kind: 'FREE_TYPED', subject: 'Re — Tuesday', body: 'Great — see you then.' });
    const row = made.app.db.get<{ subject: string; body: string }>('SELECT subject, body FROM outbox WHERE id = ?', [r.id]);
    assert.equal(row?.subject, 'Re — Tuesday');
    assert.equal(row?.body, 'Great — see you then.');
  });

  test('after the seed and the steps above, no email the system wrote holds a long dash', () => {
    const rows = made.app.db.all<{ kind: string; subject: string; body: string }>("SELECT kind, subject, body FROM outbox WHERE kind <> 'FREE_TYPED'");
    assert.ok(rows.length > 0);
    for (const r of rows) assert.doesNotMatch(`${r.subject}\n${r.body}`, DASH, `${r.kind}: ${r.subject}`);
  });

  test('a dash in one paragraph never pairs with one in another', () => {
    assert.equal(plainDashLines('First — part one.\nSecond — part two'), 'First: part one.\nSecond: part two');
    assert.equal(plainDashLines('—'), 'None', 'an empty value in a report reads None, not a colon');
  });

  test('the seeded template’s subject lost its long dash (migration 117); the company goes first with a colon', () => {
    assert.equal(made.app.db.get<{ s: string }>("SELECT subject AS s FROM email_templates WHERE id = 'template-next-step'")?.s,
      '{{organisation}}: the next step on your claim');
    assert.match(readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'templates.ts'), 'utf8'), /return subject\.startsWith\(name\) \? subject : `\$\{name\}: \$\{subject\}`;/);
  });
});

describe('Phase 160d: the engagement letter', () => {
  test('the letter is drawn for signing without a long dash; the test copy is still known as the test copy', () => {
    for (const path of [LETTER_PATH, TEST_LETTER_PATH]) {
      if (!letterExists(path)) continue;
      const l = loadLetter({ path });
      assert.ok(l.paragraphs.length > 10, path);
      for (const p of l.paragraphs) assert.doesNotMatch(p.text, DASH, `${path}: ${p.text.slice(0, 80)}`);
    }
    if (letterExists(TEST_LETTER_PATH)) assert.equal(loadLetter({ path: TEST_LETTER_PATH }).test_copy, true);
  });
});

describe('Phase 160d: the text the system writes', () => {
  test('the Disposal Note task is raised without a long dash, and a task raised under the old title is still found', () => {
    assert.doesNotMatch(DISPOSAL_TASK_TITLE, DASH);
    assert.match(DISPOSAL_TASK_TITLE_BEFORE, DASH);
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'claim-record.ts'), 'utf8');
    assert.equal((src.match(/title IN \(\?, \?\)[^\n]*DISPOSAL_TASK_TITLE, DISPOSAL_TASK_TITLE_BEFORE/g) ?? []).length, 2, 'both lookups read the old title too');
  });

  test('no task title the code writes, and no seeded task, holds a long dash', () => {
    for (const f of ['claim-record.ts', 'leads.ts']) {
      const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', f), 'utf8');
      for (const m of src.matchAll(/^\s*title: (['`])([^'`]*)\1/gm)) assert.doesNotMatch(m[2] ?? '', DASH, `${f}: ${m[2]}`);
    }
    const titles = made.app.db.all<{ title: string }>('SELECT title FROM staff_tasks');
    assert.ok(titles.length > 0);
    for (const t of titles) assert.doesNotMatch(t.title, DASH, t.title);
  });
});

describe('Phase 160d: the export and the calendar file', () => {
  test('the claims and leads export’s column names hold no long dash', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'lists.ts'), 'utf8');
    const cols = src.slice(src.indexOf('const CLAIM_COLUMNS'), src.indexOf('export function', src.indexOf('const LEAD_COLUMNS')));
    assert.match(cols, /'Estimated value: the figure shown'/);
    assert.doesNotMatch(cols, DASH);
  });

  test('the video call’s calendar entry says "or in the Zoom app" with a comma', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'booking-invite.ts'), 'utf8');
    assert.match(src, /`, or in the Zoom app: \$\{m\.join_url\}`/);
  });
});
