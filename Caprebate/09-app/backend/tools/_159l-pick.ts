import { walkLegalPaths, LEGAL_PATHS_NOW } from '../test/legal-paths-walk.ts';
import { assessLegalUnder } from '../src/web/pack-legal.ts';
for (const l of walkLegalPaths('gp', 'company')) {
  if (l.answers['G14st8'] !== 'held') continue;
  const a = new Map(Object.entries(l.answers));
  const off = assessLegalUnder({ s187a_6b_statements_route: false, fvr_requires_past_owner_claim: false }, 'gp', a, LEGAL_PATHS_NOW, 'company');
  const on9 = assessLegalUnder({ s187a_6b_statements_route: true, fvr_requires_past_owner_claim: false }, 'gp', a, LEGAL_PATHS_NOW, 'company');
  if (off.verdict.level === 'AMBER' && on9.verdict.level === 'GREEN') { console.log(JSON.stringify(l.answers)); console.log(on9.verdict.why.join(' | ').slice(0, 300)); break; }
}
