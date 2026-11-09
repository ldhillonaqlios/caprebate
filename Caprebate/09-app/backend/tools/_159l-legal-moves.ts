// Scratch for Phase 159l item 8: every path of the walk with the readings ON, read again with both OFF and each alone.
import { walkLegalPaths, LEGAL_PATHS_NOW } from '../test/legal-paths-walk.ts';
import { assessLegalUnder } from '../src/modules/survey/pack-legal.ts';
const leaves = walkLegalPaths('gp', 'company');
const rank: Record<string, number> = { RED: 0, AMBER: 1, URGENT: 2, GREEN: 3 };
const tally = new Map<string, number>();
const worse: string[] = [];
const by = { s9: new Map<string, number>(), s10: new Map<string, number>() };
for (const l of leaves) {
  const a = new Map(Object.entries(l.answers));
  const off = assessLegalUnder({ s187a_6b_statements_route: false, fvr_requires_past_owner_claim: false }, 'gp', a, LEGAL_PATHS_NOW, 'company').verdict;
  const only9 = assessLegalUnder({ s187a_6b_statements_route: true, fvr_requires_past_owner_claim: false }, 'gp', a, LEGAL_PATHS_NOW, 'company').verdict;
  const only10 = assessLegalUnder({ s187a_6b_statements_route: false, fvr_requires_past_owner_claim: true }, 'gp', a, LEGAL_PATHS_NOW, 'company').verdict;
  const k = `${off.level}->${l.level}${off.cap_pence === l.cap ? '' : ' (cap moved)'}`;
  tally.set(k, (tally.get(k) ?? 0) + 1);
  if (off.level !== only9.level) { const t = `${off.level}->${only9.level}`; by.s9.set(t, (by.s9.get(t) ?? 0) + 1); }
  if (off.level !== only10.level) { const t = `${off.level}->${only10.level}`; by.s10.set(t, (by.s10.get(t) ?? 0) + 1); }
  if ((rank[l.level] ?? 9) < (rank[off.level] ?? 9) && worse.length < 5) worse.push(`${off.level}->${l.level} ${JSON.stringify(l.answers)}`);
}
console.log('paths', leaves.length);
console.log('OFF -> ON:', [...tally].sort().map(([k, n]) => `${k}: ${n}`).join('\n  '));
console.log('#9 alone:', [...by.s9].map(([k, n]) => `${k}: ${n}`).join(', '));
console.log('#10 alone:', [...by.s10].map(([k, n]) => `${k}: ${n}`).join(', '));
console.log('worse with the readings on (first 5):', worse.length === 0 ? 'none' : '\n' + worse.join('\n'));
