/**
 * EVERY RULE IN EVERY REGISTER, for the lock and its test (Phase 161m). The registers chain upwards (each area's
 * rulesThrough<Area>() is its own and every area's below it), so the top one holds them all. The test checks that every
 * logic/rules.ts under src/ is in this chain, so a register added higher up is found the same day.
 */
import { rulesThroughCompliance } from '../../src/modules/compliance/index.ts';
import type { RuleEntry } from '../../src/shared/index.ts';

export function allRules(): readonly RuleEntry[] { return rulesThroughCompliance(); }
