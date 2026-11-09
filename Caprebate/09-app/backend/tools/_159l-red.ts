import { walkLegalPaths, LEGAL_PATHS_NOW } from '../test/legal-paths-walk.ts';
import { assessLegalUnder, assessLegal } from '../src/modules/survey/pack-legal.ts';
const OFF = { s187a_6b_statements_route: false, fvr_requires_past_owner_claim: false };
const t = new Map<string, number>(); let ex = '';
for (const l of walkLegalPaths('gp', 'company')) {
  const a = new Map(Object.entries(l.answers));
  if (l.level !== 'RED' || assessLegalUnder(OFF, 'gp', a, LEGAL_PATHS_NOW, 'company').verdict.level !== 'AMBER') continue;
  const k = `G11=${String(l.answers['G11'])} G14=${String(l.answers['G14'])} G14v=${String(l.answers['G14v'])} G14sc=${String(l.answers['G14sc'])}`;
  t.set(k, (t.get(k) ?? 0) + 1);
  if (ex === '') ex = assessLegal('gp', a, LEGAL_PATHS_NOW, 'company').verdict.why.join(' | ');
}
console.log([...t].map(([k, n]) => `${k}: ${n}`).join('\n')); console.log('why:', ex.slice(0, 600));
