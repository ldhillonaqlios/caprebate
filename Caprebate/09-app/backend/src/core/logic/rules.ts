/**
 * THE CORE'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is). The core
 * holds one switch: a separate data protection officer role. Its words stay in src/core/authz.ts; this pins its position.
 */
import { defineRules, switchEntry, type RuleEntry } from '../../shared/index.ts';
import { rulesThroughShared } from '../../shared/index.ts';
import { DPO_ROLE_SWITCH } from '../authz.ts';

export const CORE_RULES: readonly RuleEntry[] = defineRules('core', [
  switchEntry({ id: 'core.DPO_ROLE_SWITCH', title: 'A separate data protection officer role', approver: 'Lakhbir',
    approval: 'Not decided: built and switched off; the five roles stand until Lakhbir decides.', settings: DPO_ROLE_SWITCH,
    home: 'src/core/authz.ts', tested_in: 'test/compliance/data-protection-switches.test.ts' }),
]);

/** The core's rules, and every area's below it. */
export function rulesThroughCore(): readonly RuleEntry[] { return [...rulesThroughShared(), ...CORE_RULES]; }
