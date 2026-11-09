import { walkLegalPaths, LEGAL_PATHS_NOW } from '../test/legal-paths-walk.ts';
import { assessLegalUnder, assessLegal } from '../src/modules/survey/pack-legal.ts';
const OFF = { s187a_6b_statements_route: false, fvr_requires_past_owner_claim: false };
let n = 0;
for (const l of walkLegalPaths('gp', 'company')) {
  const a = new Map(Object.entries(l.answers));
  if (l.level !== 'RED' || l.answers['G14'] === 'held') continue;
  const off = assessLegalUnder(OFF, 'gp', a, LEGAL_PATHS_NOW, 'company').verdict;
  if (off.level !== 'AMBER') continue;
  console.log(JSON.stringify(l.answers)); console.log(' OFF:', off.headline, '|', off.why.join(' | ').slice(0, 400)); console.log(' ON :', assessLegal('gp', a, LEGAL_PATHS_NOW, 'company').verdict.why.join(' | ').slice(0, 500));
  if (++n >= 2) break;
}
