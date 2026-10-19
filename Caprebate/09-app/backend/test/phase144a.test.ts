/**
 * PHASE 144a — PLAIN WORDS BEYOND THE BACK OFFICE'S SCREENS. 22 September 2026.
 *
 * Phase 144 rewrote every back-office and portal screen. This phase takes the same plain words to what Phase 144
 * exempted by name — the admin and user guide and the Help pages built from it, and the public assessment (changed in
 * the site file and in src/web/assessment.ts together) — to words stored in rows by the migrations, and to six small
 * things its crawl found. Words changed; no rule, route, role or store did. These tests prove:
 *   1  the check reads the guide and the Help pages at grade 7 and the assessment at grade 9, and is green on the tree;
 *   2  the assessment's words are the site renderer's words, so the two cannot drift apart again;
 *   3  migration 039 changes a seeded row only while it holds the seeded words;
 *   4  the six small things, and the property page's breadcrumb.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { Db, migrate } from '../src/db.ts';
import { SCREENS, COSMETIC_NOTE } from '../src/web/assessment.ts';
import { FORBIDDEN_SETTINGS, settingLabel } from '../src/web/configuration.ts';
import { feeSwitchesBox } from '../src/web/finance-pages.ts';
import * as P from '../src/web/portal.ts';
import { PLAIN_SWAPS } from '../src/web/voice.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CHECK = join(ROOT, '03-app', 'caprebate-plain-words-check.cjs');
const SITE = join(ROOT, '..', 'Caprebate site.html');
const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

type Res = { status: number; body: string };
type Client = { req(path: string): Promise<Res>; post(path: string, f: Record<string, string>): Promise<Res> };

async function boot(): Promise<{ close(): void; signIn(who: string): Promise<Client>; db: Db }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-144a-')), now: () => '2026-09-22T10:00:00.000Z', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  return {
    close: made.close, db: made.app.db,
    async signIn(who) {
      let cookie = '';
      const c: Client = {
        async req(path, init: RequestInit = {}) {
          const headers = { ...(init.headers as Record<string, string> | undefined) };
          if (cookie !== '') headers['cookie'] = cookie;
          const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
          const set = r.headers.getSetCookie();
          if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
          return { status: r.status, body: await r.text() };
        },
        post(path, f) {
          return (c.req as (p: string, i: RequestInit) => Promise<Res>)(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
        },
      };
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
  };
}

const visible = (html: string): string => html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('1 · the check reads the guide, the Help pages and the assessment', () => {
  test('green on the tree, with nothing exempt that Phase 144a took off the list', () => {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 20).join('\n'));
    const exempt = /exempt by name: (.*);/.exec(r.stdout)?.[1] ?? '';
    assert.equal(/help-content\.ts|assessment\.ts/.test(exempt), false, `still exempt: ${exempt}`);
  });
  test('--guide reads the guide alone, at grade 7', () => {
    const r = spawnSync(process.execPath, [CHECK, '--guide'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout.slice(0, 2000));
    assert.match(r.stdout, /grade 7 in the guide/);
  });
  test('the guide and the Help pages as they were before this phase go RED', () => {
    const r = spawnSync(process.execPath, [CHECK, '--suffix', '.bak-phase144a'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL 09-app\/CAPREBATE-ADMIN-AND-USER-GUIDE\.md:/);
    assert.match(r.stdout, /FAIL src\/web\/help-content\.ts:/);
  });
});

describe('2 · the assessment says what the site says', () => {
  const site = readFileSync(SITE, 'utf8');
  const renderer = site.slice(site.indexOf('function screenQ1()'), site.indexOf('function screenQ1()') + 40000)
    .replace(/\\u2019/g, '’').replace(/&mdash;/g, '—').replace(/<\/?(strong|em)>/g, '');
  test('every heading and help line of the six screens, and the cosmetic-work note, is in the site renderer word for word', () => {
    for (const [id, s] of Object.entries(SCREENS)) {
      assert.ok(renderer.includes(s.heading), `${id}'s heading is not the site's: ${s.heading}`);
      if (s.help !== undefined) assert.ok(renderer.includes(s.help), `${id}'s help is not the site's: ${s.help}`);
    }
    assert.ok(renderer.includes(COSMETIC_NOTE), 'the cosmetic-work note is not the site\'s');
  });
  test('Q1\'s question is unchanged until the tax adviser answers', () => {
    assert.equal(SCREENS.Q1.heading, 'Have you already made a capital allowances claim on the fixtures in this building — the plant, wiring, heating and similar?');
  });
});

describe('3 · migration 039: plain words in seeded rows, only where nobody changed them', () => {
  test('a fresh database reads the new words', () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS);
    const label = db.get<{ label: string }>("SELECT label FROM reason_lists WHERE list = 'CLAIM_EXIT' AND code = 'GRANT_NOT_TRACEABLE'")?.label;
    assert.equal(label, 'A grant or other payment cannot be matched to the items it paid for');
    const title = db.get<{ task_title: string }>("SELECT task_title FROM automation_rules WHERE id = 'rule-committed-valuation'")?.task_title;
    assert.equal(title, "Prepare the valuation from the surveyor's measured record, with a source for every rate");
    const body = db.get<{ body: string }>("SELECT body FROM email_templates WHERE id = 'template-next-step'")?.body ?? '';
    assert.ok(body.endsWith('Cap Rebate'), 'the template signs off Cap Rebate (migration 030)');
    for (const r of db.all<{ label: string }>('SELECT label FROM reason_lists')) {
      for (const [re, word] of PLAIN_SWAPS) assert.equal(new RegExp(re.source, re.flags.replace('g', '')).test(r.label), false, `"${word}" in a reason: ${r.label}`);
    }
  });
  test('a label an administrator edited is left as they wrote it', () => {
    const before = mkdtempSync(join(tmpdir(), 'cb-144a-mig-'));
    const all = readdirSync(MIGRATIONS).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
    mkdirSync(join(before, 'm'));
    for (const f of all.filter((f) => f < '039')) copyFileSync(join(MIGRATIONS, f), join(before, 'm', f));
    const db = new Db(':memory:');
    migrate(db, join(before, 'm'));
    db.run("UPDATE reason_lists SET label = 'Our own words' WHERE list = 'CLAIM_EXIT' AND code = 'GRANT_NOT_TRACEABLE'");
    for (const f of all.filter((f) => f >= '039')) copyFileSync(join(MIGRATIONS, f), join(before, 'm', f));
    migrate(db, join(before, 'm'));
    assert.equal(db.get<{ label: string }>("SELECT label FROM reason_lists WHERE list = 'CLAIM_EXIT' AND code = 'GRANT_NOT_TRACEABLE'")?.label, 'Our own words');
    assert.equal(db.get<{ label: string }>("SELECT label FROM reason_lists WHERE list = 'LEAD_LOST' AND code = 'OWNERSHIP_NOT_DEMONSTRATED'")?.label,
      'The person asking cannot show they own it, or that they may act for the owner');
  });
});

describe('4 · the six small things, and the breadcrumb', () => {
  test('Admin settings names each setting in words; the key is still what the form sends', async () => {
    for (const k of Object.keys(FORBIDDEN_SETTINGS)) {
      const l = settingLabel(k);
      assert.notEqual(l, k);
      assert.equal(/[A-Z]{2,}_[A-Z]/.test(l), false, `${k} reads as a key: ${l}`);
    }
    const w = await boot();
    try {
      const body = (await (await w.signIn('admin')).req('/staff/admin-settings')).body;
      assert.match(body, /<option value="STAGE_GATE:INVOICE">The check at the step/);
      assert.equal(/STAGE_GATE:|FEE_TRIGGER|FREE_REGISTER_GATE/.test(visible(body)), false, 'a raw key is still shown');
    } finally { w.close(); }
  });

  test('the compliance registers name the identity store in words', async () => {
    const w = await boot();
    try {
      const body = (await (await w.signIn('admin')).req('/staff/compliance/identity')).body;
      assert.match(body, /<h1>People named on documents<\/h1>/);
      assert.match(body, /Search names: every search is logged/);
      assert.equal(/\bS2\b/.test(visible(body)), false, 'S2 is still shown');
    } finally { w.close(); }
  });

  test('the fee box reads both switches: its words and its brackets always agree', () => {
    const say = (cap: boolean, warn: boolean, untouched: boolean): string => visible(String(feeSwitchesBox({ cap, warn }, untouched))).replace(/\s+/g, ' ');
    assert.match(say(false, false, true), /both are off \(cap: off; warning: off\)/);
    assert.match(say(false, false, true), /The fee above is not changed by any of this/);
    assert.match(say(true, true, false), /both are on \(cap: on; warning: on\)/);
    assert.match(say(true, false, false), /the cap is on and the warning is off \(cap: on; warning: off\)/);
    assert.match(say(false, true, true), /the warning is on and the cap is off \(cap: off; warning: on\)/);
    assert.equal(/both are off/.test(say(true, false, false)), false);
    assert.equal(/not changed by any of this/.test(say(true, false, false)), false);
  });

  test('the introducer fees page counts three models', async () => {
    const w = await boot();
    try {
      const body = (await (await w.signIn('admin')).req('/staff/introducer-rewards')).body;
      assert.match(body, /Three models are built/);
      assert.match(body, /Model C is a share of the fee we invoice/);
      assert.equal(/Both models are built/.test(body), false);
    } finally { w.close(); }
  });

  test('the portal says the step in words, never its code', () => {
    assert.equal(P.stageInWords(null), 'No step is recorded yet.');
    assert.equal(P.stageInWords('NOT_A_STAGE'), 'Our records show a step we do not recognise.');
    for (const k of ['ENQUIRY', 'INVOICE', 'ON_HOLD', 'CLOSED']) assert.equal(/[A-Z]{2,}_|<code>/.test(P.stageInWords(k)), false, k);
    const router = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'router.ts'), 'utf8');
    assert.equal(router.includes('(Step: <code>${business.stage}</code>)'), false);
  });

  test('P.documentTrace is gone: no route called it', () => {
    assert.equal('documentTrace' in P, false);
  });

  test('the property page names the company once, in the breadcrumb as in the tab title', async () => {
    const w = await boot();
    try {
      const p = w.db.get<{ id: string; label: string; name: string }>(
        "SELECT p.id, p.label, b.name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.label LIKE b.name || ' — %' LIMIT 1");
      assert.ok(p, 'the seed has no property named after its company');
      const body = (await (await w.signIn('sales')).req(`/staff/properties/${p.id}`)).body;
      const crumbs = /<nav class="crumbs"[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
      assert.ok(crumbs.includes(`<span aria-current="page">${p.label.slice(p.name.length + 3)}</span>`), crumbs);
      assert.equal(crumbs.split(p.name.replace(/&/g, '&amp;')).length - 1, 1, `the company is named more than once: ${crumbs}`);
    } finally { w.close(); }
  });
});
