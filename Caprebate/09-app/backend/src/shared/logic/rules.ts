/**
 * THE SHARED AREA'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 *
 * THE MONEY READINGS are data here: src/shared/money-readings.ts reads its positions from these entries, so a reading
 * changes in one place, with a new version. Each is ON on the test system (the test website, or a copy started with
 * CAPREBATE_COST_MODEL_TEST=1) and OFF everywhere else, on Lakhbir's word of 29 Sep 2026 ("anything you need signing off
 * we build it, we then ask ... if its viable"), and each waits on the tax adviser's viability answer.
 *
 * Keeping the file a client sent is a switch in src/shared/originals.ts; this register reads its position, so a change
 * to it without a new version here is a red test.
 */
import { defineRules, settingsOf, FIRST_RECORDED, FIRST_RECORDED_ON, type RuleEntry } from '../rules-register.ts';
import { KEEP_ORIGINALS, KEEP_ORIGINALS_TEST_WEBSITE } from '../originals.ts';

const READING = { test_system: true, elsewhere: false } as const;
const FIRST = FIRST_RECORDED_ON;
const FIRST_CHANGE = FIRST_RECORDED;
const ADVISER_TEST = 'Not approved yet. On for testing on Lakhbir\'s word (29 Sep 2026); the tax adviser is asked whether it is viable.';
const MONEY_TESTS = 'test/survey/money-adjustments.test.ts';

const money = (name: string, title: string, tested_in = MONEY_TESTS) => ({
  id: `shared.money.${name}`, title, version: 1, effective_from: FIRST, approver: 'the tax adviser', approval: ADVISER_TEST,
  value: READING, home: 'src/shared/money-readings.ts', change: FIRST_CHANGE, tested_in,
});

/** The eight money readings, in the order src/shared/money-readings.ts lists them. */
export const MONEY_READING_NAMES = Object.freeze(['grant_untraced_full', 'transaction_tax_in_base', 'legal_fees_in_base', 's185_plus_own_s25',
  'vat_shared_with_land', 'long_life_test', 'asbestos_lrr', 's33b_aggregation'] as const);

export const SHARED_RULES: readonly RuleEntry[] = defineRules('shared', [
  money('grant_untraced_full', 'A grant not traced to the items it paid for comes off the claim in full'),
  money('transaction_tax_in_base', 'The stamp duty or land transaction tax paid is part of the price shared out'),
  money('legal_fees_in_base', 'The legal and other buying fees are part of the price shared out'),
  money('s185_plus_own_s25', 'The buyer\'s own work to install plant is claimed on top of the cap'),
  money('vat_shared_with_land', 'VAT that cannot be reclaimed is shared between the land and the building'),
  money('long_life_test', 'Plant expected to last 25 years or more goes to the special rate pool', 'test/claims/seller-allowance-and-long-life.test.ts'),
  money('asbestos_lrr', 'Removing asbestos found when the land was bought is land remediation relief', 'test/claims/seller-allowance-and-long-life.test.ts'),
  money('s33b_aggregation', 'Repairs to an integral feature over half its cost in a year count as capital', 'test/claims/seller-allowance-and-long-life.test.ts'),
  { id: 'shared.KEEP_ORIGINALS', title: 'Keep the file a client uploaded (everywhere but the test website)', version: 1, effective_from: FIRST,
    approver: 'the data protection officer', approval: 'Not approved yet: built and switched off until the officer approves and the privacy notice says so.',
    value: settingsOf(KEEP_ORIGINALS), home: 'src/shared/originals.ts', change: FIRST_CHANGE, tested_in: 'test/portal/client-files.test.ts' },
  { id: 'shared.KEEP_ORIGINALS_TEST_WEBSITE', title: 'Keep the file a client uploaded, on the test website only', version: 1, effective_from: FIRST,
    approver: 'the data protection officer', approval: 'On for the test website on Lakhbir\'s word (24 Sep and 2 Oct 2026), with invented files only.',
    value: settingsOf(KEEP_ORIGINALS_TEST_WEBSITE), home: 'src/shared/originals.ts', change: FIRST_CHANGE, tested_in: 'test/compliance/data-protection-readings.test.ts' },
]);

/** The shared area's rules, and every area's below it (none: shared is the bottom of the order). */
export function rulesThroughShared(): readonly RuleEntry[] { return SHARED_RULES; }
