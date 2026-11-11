/**
 * COMPLIANCE'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is). Its one
 * switch, the log of each time client data is shared, keeps its words in src/modules/compliance/disclosure-log.ts.
 */
import { defineRules, switchEntry, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughFinance } from '../../finance/index.ts';
import { DISCLOSURE_LOG } from '../disclosure-log.ts';

export const COMPLIANCE_RULES: readonly RuleEntry[] = defineRules('compliance', [
  switchEntry({ id: 'compliance.DISCLOSURE_LOG', title: 'Log each time client data is shared with someone outside', approver: 'the data protection officer',
    approval: 'Not approved yet: built and switched off until the officer signs off who gets client data (no solicitor since 11 Nov 2026).',
    settings: DISCLOSURE_LOG, home: 'src/modules/compliance/disclosure-log.ts', tested_in: 'test/claims/above-ports.test.ts' }),
]);

/** Compliance's rules, and every area's below it. */
export function rulesThroughCompliance(): readonly RuleEntry[] { return [...rulesThroughFinance(), ...COMPLIANCE_RULES]; }
