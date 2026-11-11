/**
 * COMPLIANCE'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is). Its
 * switch, the log of each time client data is shared, keeps its words in src/modules/compliance/disclosure-log.ts; who
 * may be sent the online identity check (Phase 161m1) keeps its words in src/modules/compliance/identity-who.ts.
 */
import { defineRules, switchEntry, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughFinance } from '../../finance/index.ts';
import { DISCLOSURE_LOG } from '../disclosure-log.ts';
import { IDENTITY_WHO_RULE } from '../identity-who.ts';

export const COMPLIANCE_RULES: readonly RuleEntry[] = defineRules('compliance', [
  switchEntry({ id: 'compliance.DISCLOSURE_LOG', title: 'Log each time client data is shared with someone outside', approver: 'the data protection officer',
    approval: 'Not approved yet: built and switched off until the officer signs off who gets client data (no solicitor since 11 Nov 2026).',
    settings: DISCLOSURE_LOG, home: 'src/modules/compliance/disclosure-log.ts', tested_in: 'test/claims/above-ports.test.ts' }),
  // Phase 161m1: who may be sent the online identity check, by the kind of client; an Admin may bypass it once, with a reason
  switchEntry({ id: 'compliance.IDENTITY_CHECK_WHO', title: 'Who may be sent the online identity check: a director or an owner', approver: 'Lakhbir',
    approval: 'Lakhbir, 11 Nov 2026: "ensure the person who is performing the ID check is the director or owner, admin can bypass".',
    settings: IDENTITY_WHO_RULE, home: 'src/modules/compliance/identity-who.ts', tested_in: 'test/compliance/identity-check-who.test.ts',
    effective_from: '2026-11-11', change: 'New in Phase 161m1: a director or an owner of the client as we hold them, in their own name; an Admin may send it to someone else for one check, with a reason in the audit log.' }),
]);

/** Compliance's rules, and every area's below it. */
export function rulesThroughCompliance(): readonly RuleEntry[] { return [...rulesThroughFinance(), ...COMPLIANCE_RULES]; }
