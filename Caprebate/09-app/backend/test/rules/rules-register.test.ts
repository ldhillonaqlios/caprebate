/**
 * PHASE 161m, 10 NOVEMBER 2026 — RULES AS VERSIONED DATA (09-app/docs/ARCHITECTURE.md rule 6).
 *
 * Lakhbir, 6 Nov 2026: "make a change on one thing without breaking others". Changing a tax rule must never quietly
 * change a result a client already has. Proven here:
 *   · every area's register (src/<area>/logic/rules.ts) is in the chain, and every rule is well formed, unique, lives
 *     where it says, and names a test that runs it;
 *   · every rule's value is the one pinned for its version in architecture/rules-lock.json; A PLANTED CHANGE TO ONE
 *     RULE'S VALUE WITHOUT A NEW VERSION IS RED, and the record tool refuses it; with a new version, recorded, it is
 *     green, and a result sealed before it is told what changed and why;
 *   · the money readings and the legal readings are read from the registers, not written twice;
 *   · every statement that seals an estimate, an approved pack or an invoice writes its versions, and every caller
 *     passes them; the case stamp carries them too (test/claims/defence-pack-and-case-stamp.test.ts);
 *   · the claim calculator's version moves with it: A PLANTED CALCULATOR CHANGE WITHOUT A NEW VERSION IS RED here as
 *     well as in the engine's own check (09-app/engine/tools/verify-page.cjs section 6);
 *   · Admin's page lists every rule in force, read only, and nobody else may open it.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lockProblems, recordInLock, resultVersions, ruleValueHash, settingsOf, switchEntry, versionChanges, defineRules, raw,
  MONEY_READING_NAMES, SHARED_RULES, RulesRegisterError, type RuleEntry, type RulesLock,
} from '../../src/shared/index.ts';
import { MONEY_READINGS_ON, MONEY_READINGS_OFF } from '../../src/shared/money-readings.ts';
import { LEGAL_READINGS } from '../../src/modules/survey/pack-legal.ts';
import { LEGAL_READING_NAMES, SURVEY_RULES } from '../../src/modules/survey/index.ts';
import { FEE_CLAWBACK } from '../../src/modules/claims/claim-record.ts';
import { positionWords, rulesInForcePage } from '../../src/modules/admin/index.ts';
import { createApp } from '../../src/app/server.ts';
import { allRules } from './all-rules.ts';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const CAPREBATE = join(BACKEND, '..', '..');
const LOCK = JSON.parse(readFileSync(join(BACKEND, 'architecture', 'rules-lock.json'), 'utf8')) as RulesLock;
const RULES = allRules();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
/** A rule with one field replaced. */
const changed = (id: string, patch: Partial<RuleEntry>): RuleEntry[] => RULES.map((r) => (r.id === id ? { ...r, ...patch } : r));

describe('the registers', () => {
  test('every area\'s logic/rules.ts is in the chain the lock and the page read, and every rule in it is there', async () => {
    const files = walk(join(BACKEND, 'src')).filter((f) => f.endsWith(`${join('logic', 'rules.ts')}`)).map((f) => relative(BACKEND, f)).sort();
    assert.ok(files.length >= 9, files.join(', '));
    const ids = new Set(RULES.map((r) => r.id));
    for (const f of files) {
      const m = await import(join(BACKEND, f)) as Record<string, unknown>;
      const own = Object.entries(m).flatMap(([k, v]) => {
        if (Array.isArray(v) && /_RULES$/.test(k)) return v as RuleEntry[];
        if (typeof v === 'function' && /^[a-z]+Rules$/.test(k) && (v as () => unknown).length === 0) return (v as () => RuleEntry[])();
        return [];
      });
      for (const r of own) assert.ok(ids.has(r.id), `${r.id} (${f}) is not in the chain: add its area's rulesThrough to the one above it`);
    }
  });

  test('every rule is well formed: a unique id in its own area, a version from 1, a date, who approves it, where it lives, and the test that runs it', () => {
    assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length, 'an id is used twice');
    for (const r of RULES) {
      assert.ok(r.id.startsWith(`${r.area}.`), r.id);
      assert.ok(Number.isInteger(r.version) && r.version >= 1, r.id);
      assert.match(r.effective_from, /^\d{4}-\d{2}-\d{2}$/, r.id);
      for (const k of ['title', 'approver', 'approval', 'change'] as const) assert.ok(r[k].trim().length > 0, `${r.id}: ${k}`);
      const home = r.home.startsWith('src/') ? join(BACKEND, r.home) : join(CAPREBATE, r.home);
      assert.ok(existsSync(home), `${r.id}: its home ${r.home} does not exist`);
      const t = join(BACKEND, r.tested_in);
      assert.ok(existsSync(t), `${r.id}: its test ${r.tested_in} does not exist`);
      const name = r.id.slice(r.area.length + 1);
      const words = [name, ...name.split('.')].filter((w) => !['money', 'legal', 'rulebook', 'FEE_CONTROLS', 'PICK_SWITCHES'].includes(w) || w === name);
      // A switch is named in its test by its constant (REFERRAL_FORM) or by the option that passes it (referralForm).
      const camel = (w: string) => w.toLowerCase().replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      words.push(...words.filter((w) => /^[A-Z_]+$/.test(w)).map(camel));
      const text = readFileSync(t, 'utf8');
      assert.ok(words.some((w) => text.includes(w)) || (name.startsWith('rulebook.') && text.includes('RULEBOOK_MODULES')),
        `${r.id}: ${r.tested_in} does not name it`);
    }
  });

  test('defineRules refuses a malformed or repeated entry as the area loads', () => {
    const ok = { id: 'x.a', title: 'A', version: 1, effective_from: '2026-11-10', approver: 'Lakhbir', approval: 'Off.', value: false, home: 'h', change: 'c', tested_in: 't' };
    assert.equal(defineRules('x', [ok]).length, 1);
    for (const bad of [{ ...ok, id: 'y.a' }, { ...ok, version: 0 }, { ...ok, version: 1.5 }, { ...ok, effective_from: '10 Nov 2026' }, { ...ok, approver: ' ' }]) {
      assert.throws(() => defineRules('x', [bad]), RulesRegisterError, JSON.stringify(bad));
    }
    assert.throws(() => defineRules('x', [ok, ok]), /twice/);
  });

  test('a switch\'s settings are its position, periods and modes, never its words', () => {
    assert.deepEqual(settingsOf({ enabled: false, question: 'Words?', retention_days: 2557, mode: null, inner: { enabled: true, why: 'x' }, list: ['a'] }),
      { enabled: false, inner: { enabled: true }, mode: null, retention_days: 2557 });
    assert.equal(ruleValueHash({ value: { b: 1, a: true } }), ruleValueHash({ value: { a: true, b: 1 } }), 'key order never moves a fingerprint');
  });
});

describe('the lock: a value changes only with a new version', () => {
  test('every rule\'s value is the one pinned for its version in architecture/rules-lock.json', () => {
    assert.deepEqual(lockProblems(RULES, LOCK), []);
  });

  test('A PLANTED CHANGE TO ONE RULE\'S VALUE WITHOUT A NEW VERSION IS RED, and the record tool refuses it', () => {
    const planted = changed('shared.money.transaction_tax_in_base', { value: { test_system: false, elsewhere: false } });
    const p = lockProblems(planted, LOCK);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0] ?? '', /shared\.money\.transaction_tax_in_base: its value changed but its version \(1\) did not/);
    assert.throws(() => recordInLock(planted, LOCK, '2026-11-11'), /raise the version first/);
    // A switch flipped in its own file is the same: the register reads its position.
    const flipped = changed('claims.FEE_CLAWBACK', { value: settingsOf({ ...FEE_CLAWBACK, enabled: true }) });
    assert.match(lockProblems(flipped, LOCK).join('\n'), /claims\.FEE_CLAWBACK: its value changed but its version \(1\) did not/);
  });

  test('with a new version, a date and a reason it is recorded, and then green; the lock keeps version 1 beside it', () => {
    const v2 = changed('shared.money.transaction_tax_in_base', { value: { test_system: false, elsewhere: false }, version: 2, effective_from: '2026-12-01', change: 'The tax adviser said no (planted).' });
    assert.match(lockProblems(v2, LOCK).join('\n'), /version 2 is not in the lock yet/);
    const next = recordInLock(v2, LOCK, '2026-11-11');
    assert.deepEqual(lockProblems(v2, next), []);
    assert.deepEqual(next.rules['shared.money.transaction_tax_in_base']?.map((x) => x.version), [1, 2]);
    assert.deepEqual(next.rules['shared.money.transaction_tax_in_base']?.[0], LOCK.rules['shared.money.transaction_tax_in_base']?.[0]);
    // Going back, skipping a version, or moving a version's date is red too.
    assert.match(lockProblems(changed('shared.money.transaction_tax_in_base', {}), next).join('\n'), /older than the lock's 2/);
    assert.throws(() => recordInLock(changed('core.DPO_ROLE_SWITCH', { version: 3, value: { enabled: true } }), LOCK, '2026-11-11'), /the next version is 2, not 3/);
    assert.match(lockProblems(changed('core.DPO_ROLE_SWITCH', { effective_from: '2026-01-01' }), LOCK).join('\n'), /a version's date never changes/);
  });

  test('a rule taken out of every register is red until the lock retires it, with the date', () => {
    const without = RULES.filter((r) => r.id !== 'clients.ENQUIRY_RETENTION');
    assert.match(lockProblems(without, LOCK).join('\n'), /clients\.ENQUIRY_RETENTION: in the lock but in no register/);
    assert.deepEqual(lockProblems(without, { ...LOCK, retired: { 'clients.ENQUIRY_RETENTION': '2026-12-01' } }), []);
    assert.match(lockProblems([...RULES, { ...RULES[0]!, id: 'shared.new_one' }], LOCK).join('\n'), /shared\.new_one: not in the lock/);
  });
});

describe('a sealed result keeps the versions it was made with, and is told what changed', () => {
  test('a result sealed before a rule change keeps its versions, and a re-run says what changed and why', () => {
    const sealed = resultVersions(RULES, '0.1.0');
    assert.equal(Object.keys(sealed.rules).length, RULES.length);
    assert.deepEqual(versionChanges(sealed, resultVersions(RULES, '0.1.0'), RULES), [], 'nothing changed');
    const v2 = changed('survey.legal.lease_route', { value: false, version: 2, change: 'The tax adviser read the lease route differently (planted).' });
    const now = resultVersions(v2, '0.2.0');
    assert.deepEqual(sealed.rules['survey.legal.lease_route'], 1, 'the sealed result still says version 1');
    assert.deepEqual(versionChanges(sealed, now, v2), [
      { id: 'engine', title: 'The claim calculator', was: '0.1.0', now: '0.2.0', why: 'The calculator changed; its change log says what and why.' },
      { id: 'survey.legal.lease_route', title: 'A new lease for a premium takes the lease route', was: 'version 1', now: 'version 2', why: 'The tax adviser read the lease route differently (planted).' },
    ]);
    const added = [...RULES, { ...RULES[0]!, id: 'shared.added', title: 'An added rule' }];
    assert.deepEqual(versionChanges(sealed, resultVersions(added, '0.1.0'), added).map((c) => [c.id, c.was, c.why]), [['shared.added', 'not there', 'A rule added since.']]);
    const gone = RULES.filter((r) => r.id !== 'core.DPO_ROLE_SWITCH');
    assert.deepEqual(versionChanges(sealed, resultVersions(gone, '0.1.0'), gone).map((c) => [c.id, c.now]), [['core.DPO_ROLE_SWITCH', 'retired']]);
  });

  test('every statement that seals an estimate, an approved pack or an invoice writes its versions, and every caller passes them', () => {
    const src = walk(join(BACKEND, 'src')).filter((f) => f.endsWith('.ts'));
    let statements = 0;
    for (const f of src) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/INSERT INTO (estimates|survey_pack_approvals|invoices) \(([^)]*)\)/g)) {
        statements += 1;
        assert.match(m[2] ?? '', /\bversions_json\b/, `${relative(BACKEND, f)}: a statement that seals a row of ${m[1]} does not write versions_json`);
      }
      for (const m of text.matchAll(/\b(insertEstimates2?|insertInvoices2?|insertSurveyPackApprovals)\((?:d\.)?db,([\s\S]*?)\]\);/g)) {
        assert.match(m[2] ?? '', /resultVersions\(/, `${relative(BACKEND, f)}: a call of ${m[1]} passes no versions`);
      }
    }
    assert.equal(statements, 5, 'the five statements that seal a result (two estimates, one pack, two invoices)');
  });
});

describe('the readings are read from the registers, not written twice', () => {
  test('the money readings: on on the test system, off elsewhere, as the shared register says', () => {
    for (const name of MONEY_READING_NAMES) {
      const v = SHARED_RULES.find((r) => r.id === `shared.money.${name}`)?.value as { test_system: boolean; elsewhere: boolean };
      assert.equal(MONEY_READINGS_ON[name], v.test_system, name);
      assert.equal(MONEY_READINGS_OFF[name], v.elsewhere, name);
    }
    assert.deepEqual(Object.keys(MONEY_READINGS_ON), [...MONEY_READING_NAMES]);
  });

  test('the legal readings: each one as the survey register says', () => {
    assert.deepEqual(Object.keys(LEGAL_READINGS), [...LEGAL_READING_NAMES]);
    for (const name of LEGAL_READING_NAMES) assert.equal(LEGAL_READINGS[name], SURVEY_RULES.find((r) => r.id === `survey.legal.${name}`)?.value, name);
  });

  test('switchEntry reads a switch where its code lives: its words stay there, its position is pinned here', () => {
    const e = switchEntry({ id: 'claims.X', title: 'X', approver: 'Lakhbir', approval: 'Off.', settings: FEE_CLAWBACK, home: 'h', tested_in: 't' });
    assert.deepEqual(e.value, { enabled: false });
    assert.equal(e.version, 1);
  });
});

describe('the claim calculator\'s version moves with it', () => {
  const require = createRequire(import.meta.url);
  const V = require(join(BACKEND, '..', 'engine', 'tools', 'engine-version.cjs')) as {
    readState(): { pkgVersion: string; versions: { versions: { version: string; calculator_sha256: string }[] }; changelog: string; hash: string };
    versionProblems(s: unknown): string[]; calculatorFiles(): Record<string, string>; calculatorHash(f: Record<string, string>): string;
  };
  test('the engine\'s version is the one recorded for this calculator, and the back end stamps that version', () => {
    const s = V.readState();
    assert.deepEqual(V.versionProblems(s), []);
    assert.equal(resultVersions([]).engine, s.pkgVersion);
  });
  test('A PLANTED CALCULATOR CHANGE WITHOUT A NEW VERSION IS RED', () => {
    const s = V.readState();
    const files = V.calculatorFiles();
    const planted = { ...files, 'shared.js': `${files['shared.js'] ?? ''}\n// planted` };
    assert.match(V.versionProblems({ ...s, hash: V.calculatorHash(planted) }).join('\n'), /the calculator \(src\/calculator\/\) changed but the engine's version \(\S+\) did not/);
  });
});

describe('Admin\'s page of the rules in force', () => {
  test('it lists every rule, with its position, version, date and approver, and changes nothing', () => {
    const html = rulesInForcePage(raw(''));
    for (const r of RULES) {
      assert.ok(html.includes(`id="rule-${r.id}"`), r.id);
    }
    assert.equal((html.match(/<tr id="rule-/g) ?? []).length, RULES.length, 'one row a rule');
    assert.match(html, /<td data-label="From">10 Nov 2026<\/td>/, 'the date each version takes effect from, as a date');
    assert.doesNotMatch(html, /<form|<button|<script/);
    assert.match(html, /This page changes nothing\./);
    assert.doesNotMatch(html, /—/, 'no em dash in the page\'s own words');
  });

  test('positions in words', () => {
    assert.equal(positionWords(true), 'On');
    assert.equal(positionWords({ test_system: true, elsewhere: false }), 'On on the test website, off everywhere else');
    assert.equal(positionWords({ enabled: false, retention_days: 2557 }), 'Off; retention days: 2557');
    assert.equal(positionWords({ file: 'A-v2.md', rulebook_version: 'v2' }), 'Version 2');
  });

  describe('over HTTP', () => {
    let made: Awaited<ReturnType<typeof createApp>>;
    let base = '';
    const jars = new Map<string, string>();
    const PASSWORD = 'a-very-long-development-password';
    const T = '2026-11-10T09:00:00.000Z';
    async function req(who: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: string }> {
      const r = await fetch(`${base}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string> | undefined), cookie: jars.get(who) ?? '' } });
      const set = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      if (set !== '') jars.set(who, set);
      return { status: r.status, body: await r.text() };
    }
    before(async () => {
      made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-rules-')), now: () => T });
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const a = made.server.address();
      base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      const hash = await made.app.hasher.hash(PASSWORD);
      for (const [id, role] of [['u-rules-admin', 'ADMIN'], ['u-rules-sales', 'SALES']] as const) {
        made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
          [id, `${id}@example.invalid`, `${id}@example.invalid`, id, role, hash, T, T]);
        await req(id, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${id}@example.invalid`, password: PASSWORD }).toString() });
      }
    });
    after(() => made.close());

    test('Admin opens it from Settings; Sales is refused', async () => {
      const page = await req('u-rules-admin', '/staff/rules');
      assert.equal(page.status, 200);
      assert.match(page.body, /<h1>Rules in force<\/h1>/);
      assert.ok(page.body.includes('id="rule-shared.money.transaction_tax_in_base"'));
      const settings = await req('u-rules-admin', '/staff/admin');
      assert.match(settings.body, /href="\/staff\/rules"/, settings.body.slice(0, 2000));
      const sales = await req('u-rules-sales', '/staff/rules');
      assert.doesNotMatch(sales.body, /<h1>Rules in force<\/h1>/);
      assert.match(sales.body, /The rules page is for Admin\./);
    });
  });
});
