/**
 * THE ASSESSMENT'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 *
 * The assessment runs the claim calculator (09-app/engine), whose own switches (CB_CTA) are versioned with the engine's
 * version: a change to any of them is a change to the calculator, and the engine's check refuses one without a new
 * version (09-app/engine/tools/verify-page.cjs). So they are not entries here. The funnel's own switch is.
 */
import { defineRules, switchEntry, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughClients } from '../../clients/index.ts';
import { FUNNEL_SWITCHES } from '../funnel-session.ts';

export const ASSESSMENT_RULES: readonly RuleEntry[] = defineRules('assessment', [
  switchEntry({ id: 'assessment.FUNNEL_SWITCHES.breakeven_is_insufficient_profit', title: 'A business that broke even is read as not having enough profit',
    approver: 'the tax adviser', approval: 'Not approved yet: built and switched off; the answer is asked.',
    settings: FUNNEL_SWITCHES, home: 'src/modules/assessment/funnel-session.ts', tested_in: 'test/claims/engaged-clients.test.ts' }),
]);

/** The assessment's rules, and every area's below it. */
export function rulesThroughAssessment(): readonly RuleEntry[] { return [...rulesThroughClients(), ...ASSESSMENT_RULES]; }
