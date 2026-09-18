/**
 * PHASE 132 — LINE 20: A PARTNERSHIP WITH A COMPANY PARTNER IS ON THE COMPANY DATE. 14 September 2026.
 *
 * TMA 1970 s.12ABA(4)(b), verified on legislation.gov.uk the same day: for "a partnership which includes one or more
 * companies" the filing date is the end of the period in s.12AA(5B) or (5C). s.12AA(5B) is the first anniversary of the
 * end of the period, and s.12ABA(2) allows twelve months after the filing date to amend — the company's own 24 months.
 * Against the individual partners' date that is EARLIER for period ends 6 April to 30 January, the same on 31 January,
 * and LATER for 1 February to 5 April. The engine applies it where it is earlier; where it is later it waits on
 * CB_CTA.window_company_member_date (AW-2, PT-Q1), which ships off.
 *
 * WHAT IT PROVES, EACH ONE BOTH WAYS:
 *   the engine bridge   a company and a sole trader read exactly as before (and a 29 February company period end now
 *                       closes on 28 February); a partnership reads the answer it is given
 *   the recorded fact   YES, NO, recorded NOT KNOWN and never recorded — and NOT KNOWN reads exactly as never recorded,
 *                       state, date and words (N4)
 *   the gates           a window open on one filing date and shut on the other passes neither REPORTS nor INVOICE,
 *                       recorded NOT KNOWN or never recorded; the same claim recorded NO passes both (the negative control)
 *   the trigger         migration 024 keeps every key FACTS holds, accepts the new one, and still refuses a key it does not know
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as C from '../src/web/crm.ts';
import * as F from '../src/web/claim-facts.ts';
import * as R from '../src/web/claim-record.ts';
import { factsBlock } from '../src/web/claim-record-pages.ts';
import { amendmentWindow, type EngineWindow } from '../src/web/engine.ts';
import { actor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

type App = Awaited<ReturnType<typeof testApp>>;
type ClaimRef = { id: string; business_id: string; property_id: string | null };

const T0 = '2026-09-08T00:00:00.000Z';
const KEY = 'PARTNERSHIP_HAS_COMPANY_MEMBER';
/** 31 December 2024: the company date is 31 December 2026, the individual date 31 January 2027. This day is between. */
const BETWEEN = '2027-01-15T00:00:00.000Z';

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

let n = 0;
/** A claim at REPORTS for a partnership (or an LLP): the accounting period 1 January to 31 December 2024, bought 1 June 2024. */
function partnershipClaim(app: App, claimant = 'PARTNERSHIP'): ClaimRef {
  n += 1;
  const business = `b-p132-${n}`;
  const property = `p-p132-${n}`;
  const assessment = `a-p132-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Phase 132 Partners ${n}`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
  app.db.run('UPDATE businesses SET claimant_type = ? WHERE id = ?', [claimant, business]);
  app.db.run('UPDATE properties SET acquisition_date = ? WHERE id = ?', ['2024-06-01', property]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'PLANT_AND_MACHINERY',
    stage: 'REPORTS', owner_id: null, surveyor_id: null,
  });
  CF.fact(app, made.id, 'ACCOUNTING_PERIOD_START', '2024-01-01');
  CF.fact(app, made.id, 'ACCOUNTING_PERIOD_END', '2024-12-31');
  return { id: made.id, business_id: business, property_id: property };
}

const pick = (w: EngineWindow): readonly (string | boolean)[] => (w.known ? [w.deadline, w.in_time] : [w.ambiguous === true ? 'ambiguous' : 'unknown']);

describe('Phase 132, line 20 — the amendment window for a partnership with a company partner', () => {
  test('THE ENGINE BRIDGE: a company and a sole trader read exactly as before; a company partner is on the company date where it is earlier and on the individual date where it is later (AW-2 off); a partner not known is open only on both dates', () => {
    assert.deepEqual(amendmentWindow('2024-12-31', 'company', '2026-12-01T00:00:00.000Z'), { known: true, deadline: '2026-12-31', in_time: true });
    assert.deepEqual(amendmentWindow('2024-12-31', 'self_assessment', '2026-12-01T00:00:00.000Z'), { known: true, deadline: '2027-01-31', in_time: true });
    // The defect, fixed live: 29 February plus 24 months is 28 February, not 1 March.
    assert.deepEqual(amendmentWindow('2024-02-29', 'company', '2026-03-01T00:00:00.000Z'), { known: true, deadline: '2026-02-28', in_time: false });
    assert.deepEqual(pick(amendmentWindow('2024-12-31', 'partnership', BETWEEN, true)), ['2026-12-31', false], 'a company partner did not close the window on the company date');
    assert.deepEqual(pick(amendmentWindow('2024-12-31', 'partnership', BETWEEN, false)), ['2027-01-31', true], 'no company partner did not keep the individual date');
    assert.deepEqual(pick(amendmentWindow('2024-12-31', 'partnership', BETWEEN, null)), ['ambiguous'], 'a partner not known was treated as settled between the two dates');
    const ambiguous = amendmentWindow('2024-12-31', 'partnership', BETWEEN, null);
    assert.deepEqual(ambiguous.known ? null : ambiguous.deadlines, { individual: '2027-01-31', company: '2026-12-31' });
    // 31 March 2024, the usual GP year end: the company date (31 March 2026) is LATER, so with AW-2 off the individual date decides.
    assert.deepEqual(pick(amendmentWindow('2024-03-31', 'partnership', '2026-02-15T00:00:00.000Z', true)), ['2026-01-31', false]);
    assert.equal((w => w.known && w.company_date_later_not_applied === true)(amendmentWindow('2024-03-31', 'partnership', '2026-02-15T00:00:00.000Z', true)), true);
    // Not known: open where open on both, closed where closed on both.
    assert.deepEqual(pick(amendmentWindow('2024-12-31', 'partnership', '2026-12-01T00:00:00.000Z', null)), ['2026-12-31', true]);
    assert.deepEqual(pick(amendmentWindow('2024-12-31', 'partnership', '2027-02-01T00:00:00.000Z', null)), ['2027-01-31', false]);
  });

  test('THE RECORDED FACT: YES closes the window on the company date, NO keeps the individual date, and a fact recorded as NOT KNOWN reads exactly as one never recorded — for a partnership and for an LLP (N4)', async () => {
    const app = await testApp();
    try {
      staff(app);
      for (const claimant of ['PARTNERSHIP', 'LLP']) {
        const absent = partnershipClaim(app, claimant);
        const unknownRow = partnershipClaim(app, claimant);
        CF.fact(app, unknownRow.id, KEY, null);
        const yes = partnershipClaim(app, claimant);
        CF.fact(app, yes.id, KEY, 'YES');
        const no = partnershipClaim(app, claimant);
        CF.fact(app, no.id, KEY, 'NO');
        const read = (c: ClaimRef): F.WindowReading => F.amendmentWindowReading(app.db, c, BETWEEN);
        assert.deepEqual([read(yes).state, read(yes).deadline], ['CLOSED', '2026-12-31'], `${claimant}: YES`);
        assert.match(read(yes).assumption ?? '', /s\.12AA\(5B\)/);
        assert.match(read(yes).assumption ?? '', /s\.12AA\(5C\)/);
        assert.deepEqual([read(no).state, read(no).deadline], ['OPEN', '2027-01-31'], `${claimant}: NO`);
        assert.equal(read(absent).state, 'UNKNOWN', `${claimant}: a partner never recorded was a window`);
        assert.match(read(absent).why, /whether any partner or member is a company is not established/);
        assert.deepEqual(read(unknownRow), read(absent), `${claimant}: a fact recorded as NOT KNOWN did not read exactly as one never recorded`);
        // A later NOT KNOWN clears an earlier NO back to exactly the absent reading.
        CF.fact(app, no.id, KEY, null);
        assert.deepEqual(read(no), read(absent), `${claimant}: NOT KNOWN recorded after NO kept the NO`);
      }
      // A company is untouched by the fact, whatever is recorded against it.
      const company = partnershipClaim(app, 'COMPANY');
      const before = F.amendmentWindowReading(app.db, company, BETWEEN);
      CF.fact(app, company.id, KEY, 'NO');
      assert.deepEqual(F.amendmentWindowReading(app.db, company, BETWEEN), before);
      assert.deepEqual([before.state, before.deadline], ['CLOSED', '2026-12-31']);
    } finally { app.close(); }
  });

  test('THE GATES: a window open on the individual date and shut on the company date passes neither REPORTS nor INVOICE — recorded NOT KNOWN, never recorded, or YES; recorded NO it passes both', async () => {
    const app = await testApp();
    try {
      staff(app);
      const absent = partnershipClaim(app);
      const unknownRow = partnershipClaim(app);
      CF.fact(app, unknownRow.id, KEY, null);
      const yes = partnershipClaim(app);
      CF.fact(app, yes.id, KEY, 'YES');
      const no = partnershipClaim(app);
      CF.fact(app, no.id, KEY, 'NO');
      const needs = (c: ClaimRef): readonly boolean[] => [R.reportsWindowNeed(app.db, c, BETWEEN).met, R.invoiceWindowNeed(app.db, c, BETWEEN).met];
      assert.deepEqual(needs(absent), [false, false], 'an ambiguous window never recorded passed a gate');
      assert.deepEqual(needs(unknownRow), [false, false], 'an ambiguous window recorded as NOT KNOWN passed a gate');
      assert.deepEqual(needs(yes), [false, false], 'a window closed on the company date passed a gate');
      assert.deepEqual(needs(no), [true, true], 'the negative control: the individual date, open, did not pass');
    } finally { app.close(); }
  });

  test('MIGRATION 024: the trigger lists every key FACTS holds, accepts PARTNERSHIP_HAS_COMPANY_MEMBER, and still refuses a key it does not know; the store still refuses an answer that is not yes or no', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = partnershipClaim(app);
      const sql = app.db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'claim_facts_key_insert'", [])?.sql ?? '';
      for (const k of Object.keys(F.FACTS)) assert.ok(sql.includes(`'${k}'`), `the trigger does not list ${k}`);
      const insert = (key: string): void => {
        app.db.run(
          'INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), c.id, key, 'VALUE', 'YES', null, null, 'CLIENT_ANSWER', null, 'u-SALES', T0]);
      };
      assert.doesNotThrow(() => insert(KEY));
      assert.throws(() => insert('NOT_A_FACT_THE_CLAIM_CAPTURES'), /not a fact the claim captures/);
      const deps = CF.recordDeps(app);
      assert.equal(F.recordFact(deps, actor('SALES'), c.id, { fact_key: KEY, answer: 'VALUE', value: 'MAYBE', source_id: 'CLIENT_ANSWER' }).ok, false);
      assert.equal(F.recordFact(deps, actor('SALES'), c.id, { fact_key: KEY, answer: 'VALUE', value: 'NO', source_id: 'CLIENT_ANSWER' }).ok, true);
      assert.equal(F.recordFact(deps, actor('SALES'), c.id, { fact_key: KEY, answer: 'UNKNOWN', source_id: 'CLIENT_ANSWER' }).ok, true);
    } finally { app.close(); }
  });

  test('THE FACTS PANEL SHOWS IT (15 September 2026): a partnership’s panel carries the row and says what it does; YES and NO recorded through the facts form’s store read back as recorded; NOT KNOWN reads exactly as never recorded (N4)', async () => {
    const app = await testApp();
    try {
      staff(app);
      const deps = CF.recordDeps(app);
      const sales = actor('SALES');
      const label = F.FACTS[KEY]?.label ?? KEY;
      const choices = F.FACTS[KEY]?.choices ?? {};
      // The fields the facts form posts to /staff/claims/<id>/facts, handed to the store that route calls.
      const post = (c: ClaimRef, fields: Record<string, string>): void => {
        const r = F.recordFact(deps, sales, c.id, { fact_key: KEY, source_id: 'CLIENT_ANSWER', ...fields });
        assert.equal(r.ok, true, r.ok ? '' : r.why);
      };
      const panel = (c: ClaimRef): F.FactsPanel => F.factsPanel(app.db, sales, c.id, BETWEEN);
      const row = (c: ClaimRef): string => {
        const page = factsBlock(c.id, panel(c)).html;
        const at = page.indexOf(`<tr><td>${label}</td>`);
        assert.ok(at >= 0, 'the facts panel has no row for whether a partner or member is a company');
        return page.slice(at, page.indexOf('</tr>', at));
      };
      const valueCell = (tr: string): string => tr.split('</td>')[1] ?? '';
      const stored = (c: ClaimRef): { answer: string; value_text: string | null } | undefined =>
        app.db.get<{ answer: string; value_text: string | null }>('SELECT answer, value_text FROM claim_facts WHERE claim_id = ? AND fact_key = ?', [c.id, KEY]);

      const never = partnershipClaim(app);
      const unknownRow = partnershipClaim(app);
      const yes = partnershipClaim(app);
      const no = partnershipClaim(app, 'LLP');
      post(unknownRow, { answer: 'UNKNOWN' });
      post(yes, { answer: 'VALUE', value: 'YES' });
      post(no, { answer: 'VALUE', value: 'NO' });

      const tr = row(never);
      assert.ok(tr.includes('files on the company deadline where that is earlier'), 'the row does not say a company partner puts the partnership on the company deadline');
      assert.ok(tr.includes('open only if it is open on both dates'), 'the row does not say what not known does');

      assert.deepEqual({ ...stored(yes) }, { answer: 'VALUE', value_text: 'YES' });
      assert.deepEqual({ ...stored(no) }, { answer: 'VALUE', value_text: 'NO' });
      assert.deepEqual({ ...stored(unknownRow) }, { answer: 'UNKNOWN', value_text: null });
      for (const [c, v] of [[yes, 'YES'], [no, 'NO']] as const) {
        const p = panel(c).partnership_company_member;
        assert.deepEqual([p.known, p.value, p.display], [true, v, choices[v]], `${v} does not read as recorded`);
        assert.ok(valueCell(row(c)).includes(choices[v] ?? v), `the row does not show ${v}`);
      }

      // N4: recorded NOT KNOWN and never recorded — the same reading, the same value drawn, the same window. Only the source column differs, as for every fact.
      const a = panel(unknownRow).partnership_company_member;
      const b = panel(never).partnership_company_member;
      assert.equal(a.known, false);
      assert.deepEqual([a.known, a.value, a.display], [b.known, b.value, b.display]);
      assert.equal(valueCell(row(unknownRow)), valueCell(row(never)));
      assert.deepEqual(panel(unknownRow).amendment_window, panel(never).amendment_window);
    } finally { app.close(); }
  });
});
