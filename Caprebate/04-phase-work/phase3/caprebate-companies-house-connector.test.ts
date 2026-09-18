/**
 * Caprebate — Companies House connector tests: sameIndividual(). Board item 12830181797.
 * Phase 132, 14 September 2026.
 * Run:  node --test caprebate-companies-house-connector.test.ts
 *
 * Safeguard S5: an uncorroborated person match is surfaced to a person, never acted
 * on. Every test that turns on "not known" asserts BOTH an answer of "not sure" and
 * an answer never recorded, and asserts they give the same result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  sameIndividual, knownMonthYear, SAME_INDIVIDUAL,
  type PscPersonForMatch, type SameIndividualSwitches,
} from './caprebate-companies-house-connector.ts';

const ON: SameIndividualSwitches = { enabled: true };
const person = (psc_name: unknown, dob_month_year: unknown): PscPersonForMatch => ({ psc_name, dob_month_year });

/* An invented name: no real individual is described. */
const A = person('Invented Placeholder Person', { month: 3, year: 1971 });
const B = person('  invented   placeholder PERSON ', { month: 3, year: 1971 });

test('C1 switch on: the same normalised name and the same month and year corroborate', () => {
  const r = sameIndividual(A, B, ON);
  assert.deepEqual(r, { corroborated: true, status: 'CORROBORATED', surface_to_person: false });
});

test('C2 a different birth month does not corroborate, and is surfaced to a person', () => {
  const r = sameIndividual(A, person('Invented Placeholder Person', { month: 4, year: 1971 }), ON);
  assert.equal(r.corroborated, false);
  assert.equal(r.status, 'UNCORROBORATED');
  assert.equal(r.surface_to_person, true);
});

test('C3 a null date of birth on either side does not corroborate, and is surfaced', () => {
  for (const [a, b] of [[person('Invented Placeholder Person', null), B], [A, person('Invented Placeholder Person', null)]] as const) {
    const r = sameIndividual(a, b, ON);
    assert.equal(r.corroborated, false);
    assert.equal(r.status, 'UNCORROBORATED');
    assert.equal(r.surface_to_person, true);
  }
});

test('C4 N4: a "not sure" month and an absent month give deep-equal results, on side a and on side b, and neither corroborates', () => {
  const notSure = person('Invented Placeholder Person', { month: 'not sure', year: 1971 });
  const absent = person('Invented Placeholder Person', { year: 1971 });
  const wholeNotSure = person('Invented Placeholder Person', 'not sure');
  const wholeAbsent = person('Invented Placeholder Person', undefined);

  // side a
  const aNotSure = sameIndividual(notSure, B, ON);
  const aAbsent = sameIndividual(absent, B, ON);
  assert.deepEqual(aNotSure, aAbsent);
  assert.equal(aNotSure.corroborated, false);
  assert.equal(aNotSure.surface_to_person, true);
  assert.deepEqual(sameIndividual(wholeNotSure, B, ON), sameIndividual(wholeAbsent, B, ON));

  // side b
  const bNotSure = sameIndividual(A, notSure, ON);
  const bAbsent = sameIndividual(A, absent, ON);
  assert.deepEqual(bNotSure, bAbsent);
  assert.equal(bAbsent.corroborated, false);
  assert.equal(bAbsent.surface_to_person, true);
  assert.deepEqual(sameIndividual(A, wholeNotSure, ON), sameIndividual(A, wholeAbsent, ON));

  // and the reader itself: every "I don't know" spelling is the same null as absent
  for (const v of [undefined, null, '', 'not sure', 'unsure', 'dont_know', { month: 3 }, { year: 1971 }, { month: 'not sure', year: 1971 }]) {
    assert.equal(knownMonthYear(v), null, `${JSON.stringify(v)} read as a known month and year`);
  }
});

test('C5 a year with no month does not corroborate', () => {
  const r = sameIndividual(person('Invented Placeholder Person', { year: 1971 }), person('Invented Placeholder Person', { year: 1971 }), ON);
  assert.equal(r.corroborated, false);
  assert.equal(r.status, 'UNCORROBORATED');
  assert.equal(r.surface_to_person, true);
});

test('C6 a different name with the same month and year is NAME_DIFFERS, and does not corroborate', () => {
  const r = sameIndividual(A, person('Another Invented Person', { month: 3, year: 1971 }), ON);
  assert.deepEqual(r, { corroborated: false, status: 'NAME_DIFFERS', surface_to_person: false });
});

test('C7 as shipped the switch is off: C1\'s own pair does not corroborate, and is surfaced', () => {
  assert.equal(SAME_INDIVIDUAL.enabled, false);
  assert.equal(Object.isFrozen(SAME_INDIVIDUAL), true);
  const r = sameIndividual(A, B);
  assert.deepEqual(r, { corroborated: false, status: 'SWITCHED_OFF', surface_to_person: true });
});

test('C8 an extra day-of-birth property changes nothing, in either direction', () => {
  const withDayA = person('Invented Placeholder Person', { month: 3, year: 1971, day: 9 });
  const withDayB = person('Invented Placeholder Person', { month: 3, year: 1971, day: 22 });
  assert.deepEqual(sameIndividual(withDayA, withDayB, ON), sameIndividual(A, B, ON));
  const diffMonth = person('Invented Placeholder Person', { month: 4, year: 1971, day: 9 });
  assert.deepEqual(sameIndividual(withDayA, diffMonth, ON), sameIndividual(A, person('Invented Placeholder Person', { month: 4, year: 1971 }), ON));
  assert.deepEqual(knownMonthYear({ month: 3, year: 1971, day: 9 }), { month: 3, year: 1971 });
});

test('C9 no live path imports the module: back-end src, the 03-app harness files and non-test phase3 files', () => {
  const HERE = import.meta.dirname;
  const ROOT = join(HERE, '..', '..');
  const NEEDLE = /caprebate-companies-house-connector/;
  const hits: string[] = [];

  const walk = (dir: string, keep: (f: string) => boolean): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, keep); continue; }
      if (keep(e.name) && NEEDLE.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };

  walk(join(ROOT, '09-app', 'backend', 'src'), (f) => f.endsWith('.ts') && !f.includes('.bak-'));
  const app03 = join(ROOT, '03-app');
  if (existsSync(app03)) {
    for (const f of readdirSync(app03)) {
      if (f.endsWith('.cjs') && NEEDLE.test(readFileSync(join(app03, f), 'utf8'))) hits.push(join(app03, f));
    }
  }
  for (const f of readdirSync(HERE)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f.includes('.bak-')) continue;
    if (f === 'caprebate-companies-house-connector.ts') continue;
    if (NEEDLE.test(readFileSync(join(HERE, f), 'utf8'))) hits.push(join(HERE, f));
  }

  assert.deepEqual(hits, [], `a live path imports the connector: ${hits.join(', ')}`);
  // The scan is real: it does find the test file that imports it.
  assert.equal(NEEDLE.test(readFileSync(join(HERE, 'caprebate-companies-house-connector.test.ts'), 'utf8')), true);
});
