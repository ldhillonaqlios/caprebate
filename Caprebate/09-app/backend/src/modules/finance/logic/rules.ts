/**
 * FINANCE'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 *
 * EMPTY IN CODE, ON PURPOSE. Finance's rules (the VAT registration threshold, where the warning starts, our VAT
 * position) are already dated settings in its own table, finance_settings, each with the date it takes effect from
 * and its source (src/modules/finance/vat.ts), and every invoice records the setting it was raised under
 * (invoices.vat_setting_id). The fee rate is the claims' (src/modules/claims/fee-controls.ts). A rule that finance
 * comes to hold in code goes here, as an entry.
 */
import { defineRules, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughSurvey } from '../../survey/index.ts';

export const FINANCE_RULES: readonly RuleEntry[] = defineRules('finance', []);

/** Finance's rules, and every area's below it. */
export function rulesThroughFinance(): readonly RuleEntry[] { return [...rulesThroughSurvey(), ...FINANCE_RULES]; }
