/**
 * THE SURVEYOR PAYLOAD TEST — non-negotiable N1.
 *
 * Not "the estimate is hidden". NOT PRESENT IN THE RESPONSE.
 *
 * The test looks for the estimate three ways, because each on its own can be
 * fooled: by KEY (a field named qualifying_pct), by VALUE (the number 0.3
 * appearing anywhere at any depth, under any name), and by SERIALISING the
 * whole payload and searching the text. A build that renamed the field on the
 * way out would pass the first check and fail the other two.
 *
 * The key and value lists are DERIVED from the estimate object rather than
 * typed out here, so a field added to EstimateOutputs is covered the day it
 * appears instead of the day somebody remembers this file.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AnchorLog, AnchorQuarantine, type EstimateOutputs,
} from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import { assembleSurveyorPayload, quarantinedKeysAndValues, isQuarantinedRole } from '../src/payload.ts';
import { APP_ROLES } from '../src/roles.ts';
import { actor, scalars, keys } from './helpers.ts';

const ESTIMATE: EstimateOutputs = {
  qualifying_expenditure_pence: 30_000_000,
  qualifying_pct: 0.3,
  pool_split_main_pence: 18_000_000,
  pool_split_special_pence: 12_000_000,
  bare_land_pence: 5_000_000,
  multiplier: 0.25,
  indicative_lifetime_saving_pence: 7_500_000,
};

const INPUTS = {
  job_id: 'job-1',
  business_id: 'biz-1',
  business_name: 'Dunmarrow Medical Practice Limited',
  sector: 'gp',
  answers: [
    { ord: 0, question_id: 'Q0', question_text: 'What kind of property?', state: 'ANSWERED', value: 'gp' },
    { ord: 1, question_id: 'Q7', question_text: 'AIA headroom?', state: 'DONT_KNOW', value: null },
    { ord: 2, question_id: 'Q9', question_text: 'Section 198 election?', state: 'SKIPPED', value: null },
  ],
  register_records: [{ source_id: 'EPC', fields: { epc_total_floor_area_m2: 640 } }],
  properties: [{ label: 'main site', postcode: 'ZZ4 4DD' }],
} as const;

function freshQuarantine(): AnchorQuarantine {
  const log = new AnchorLog();
  let n = 0;
  const q = new AnchorQuarantine({
    job_id: 'job-1', estimate: ESTIMATE, log,
    clock: () => new Date(Date.UTC(2026, 8, 8, 12, 0, n++)).toISOString(),
    sealed_by: 'u-SALES',
  });
  q.assignSurveyor('u-SURVEYING', 'u-SALES');
  return q;
}

describe('N1 — our estimate is not in the data a surveyor session receives', () => {
  test('the payload has NO estimate key at all while sealed', () => {
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine());
    assert.equal('estimate' in p, false, 'the key is present — even undefined is present');
    assert.equal(p.estimate, undefined);
  });

  test('no quarantined FIELD NAME appears anywhere in the payload, at any depth', () => {
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine());
    const { keys: bad } = quarantinedKeysAndValues(ESTIMATE);
    const present = [...keys(p)];
    for (const k of bad) assert.equal(present.includes(k), false, `field name '${k}' leaked`);
  });

  test('no quarantined VALUE appears anywhere in the payload, under any name', () => {
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine());
    const { values: bad } = quarantinedKeysAndValues(ESTIMATE);
    const present = [...scalars(p)];
    for (const v of bad) {
      assert.equal(present.includes(v), false, `value ${String(v)} leaked under some other name`);
    }
  });

  test('the SERIALISED payload contains none of the figures as text', () => {
    const json = JSON.stringify(assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine()));
    const { values: bad } = quarantinedKeysAndValues(ESTIMATE);
    for (const v of bad) {
      assert.equal(json.includes(String(v)), false, `'${String(v)}' is in the response text`);
    }
  });

  test('the INPUTS are all still there — withholding them would degrade the work, not protect anything', () => {
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine());
    assert.equal(p.answers.length, 3);
    assert.equal(p.register_records.length, 1);
    assert.equal(p.properties.length, 1);
    assert.equal(p.business_name, INPUTS.business_name);
  });

  test('a skipped question and an "I don\'t know" reach the surveyor as answers, not as blanks', () => {
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, freshQuarantine());
    assert.deepEqual(p.answers.map((a) => a.state), ['ANSWERED', 'DONT_KNOW', 'SKIPPED']);
  });

  test('the refusal is LOGGED — a denied attempt is evidence in its own right', () => {
    const log = new AnchorLog();
    let n = 0;
    const q = new AnchorQuarantine({
      job_id: 'job-1', estimate: ESTIMATE, log,
      clock: () => new Date(Date.UTC(2026, 8, 8, 12, 0, n++)).toISOString(), sealed_by: 'u-SALES',
    });
    q.assignSurveyor('u-SURVEYING', 'u-SALES');
    assembleSurveyorPayload(actor('SURVEYING'), INPUTS, q);
    assert.equal(log.entries().some((e) => e.kind === 'ACCESS_DENIED'), true);
    assert.equal(log.verify().intact, true);
  });

  test('AFTER COMMITMENT the estimate is released — automatically, with nobody to ask', () => {
    const q = freshQuarantine();
    q.commit({
      surveyor_id: 'u-SURVEYING',
      figures: {
        A_qualifying_plant_pence: 25_000_000, B_building_pence: 10_000_000,
        C_bare_land_pence: 4_000_000, qualifying_pct: 0.28,
      },
      method_note: 'measured survey, room schedule and price book',
    });
    const p = assembleSurveyorPayload(actor('SURVEYING'), INPUTS, q);
    assert.equal('estimate' in p, true);
    assert.equal(p.estimate?.qualifying_pct, 0.3);
  });

  test('a NON-quarantined staff role gets the estimate immediately', () => {
    const p = assembleSurveyorPayload(actor('SALES'), INPUTS, freshQuarantine());
    assert.equal(p.estimate?.qualifying_expenditure_pence, 30_000_000);
  });

  test('the quarantined application roles are SURVEYING and — Phase 132e, conservatively — READ_ONLY', () => {
    assert.deepEqual(APP_ROLES.filter(isQuarantinedRole), ['SURVEYING', 'READ_ONLY']); // Phase 132e
  });
});

describe('the payload test can fail — proved, not assumed', () => {
  test('a build-then-strip assembler that forgets one key IS caught by these checks', () => {
    // The failure mode N1 is defending against, written out. If the checks
    // above were weak enough to pass this, they would prove nothing.
    const leaky = {
      ...INPUTS,
      quarantine: { state: 'SEALED', notice: '', released_always: [] },
      // renamed, so a key-only check would miss it
      our_working_number: ESTIMATE.qualifying_pct,
    };
    const { values: bad } = quarantinedKeysAndValues(ESTIMATE);
    const present = [...scalars(leaky)];
    assert.equal(bad.some((v) => present.includes(v)), true, 'the value check failed to notice a renamed leak');
    assert.equal(
      bad.some((v) => JSON.stringify(leaky).includes(String(v))), true,
      'the serialisation check failed to notice a renamed leak',
    );
  });
});
