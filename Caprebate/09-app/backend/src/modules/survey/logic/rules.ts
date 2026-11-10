/**
 * THE SURVEY'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 *
 * THE LEGAL READINGS are data here: src/modules/survey/pack-legal.ts reads LEGAL_READINGS from these entries, so a
 * reading changes in one place, with a new version. Each is held on for the survey pack's legal check, built on our
 * written recommendation (Lakhbir, 29 Sep 2026: "anything you need signing off we build it"), and each waits on the tax
 * adviser's viability answer. The two engine switches among them (#9 and #10) are the engine's own, held on for the
 * pack's legal check only; the public estimate keeps them off.
 */
import { defineRules, FIRST_RECORDED, FIRST_RECORDED_ON, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughClaims } from '../../claims/index.ts';

const APPROVAL = 'Not approved yet. On for the pack\'s legal check on Lakhbir\'s word (29 Sep 2026); the tax adviser is asked whether it is viable.';
const HOME = 'src/modules/survey/pack-legal.ts';
const TESTS = 'test/claims/legal-check-readings.test.ts';

const reading = (name: string, title: string) => ({
  id: `survey.legal.${name}`, title, version: 1, effective_from: FIRST_RECORDED_ON, approver: 'the tax adviser', approval: APPROVAL,
  value: true, home: HOME, change: FIRST_RECORDED, tested_in: TESTS,
});

/** The six legal readings, in the order pack-legal.ts lists them. */
export const LEGAL_READING_NAMES = Object.freeze(['s35_seller_not_entitled', 'non_taxpayer_seller', 'lease_route', 's185_earlier_cap',
  's187a_6b_statements_route', 'fvr_requires_past_owner_claim'] as const);

export const SURVEY_RULES: readonly RuleEntry[] = defineRules('survey', [
  reading('s35_seller_not_entitled', 'A landlord who let the building as homes could not claim, so we look to an earlier owner'),
  reading('non_taxpayer_seller', 'A seller that pays no UK tax could never claim, so we ask'),
  reading('lease_route', 'A new lease for a premium takes the lease route'),
  reading('s185_earlier_cap', 'The claim is capped at the value fixed when an earlier owner sold on'),
  reading('s187a_6b_statements_route', 'Two written statements fix the value where an owner in between could never claim'),
  reading('fvr_requires_past_owner_claim', 'The fixed value rule bites only where a past owner claimed'),
]);

/** The survey's rules, and every area's below it. */
export function rulesThroughSurvey(): readonly RuleEntry[] { return [...rulesThroughClaims(), ...SURVEY_RULES]; }
