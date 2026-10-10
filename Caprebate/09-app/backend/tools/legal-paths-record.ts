/**
 * PHASE 159h (item 6): RECORD THE LEGAL CHECK'S EXPECTED OUTCOME ON EVERY PATH. Run from 09-app/backend:
 *   node tools/legal-paths-record.ts
 * It walks every path (test/legal-paths-walk.ts) and writes test/fixtures/phase159h/legal-paths-gp-company.txt. Run it
 * only when a change to the law is meant to move outcomes, and read the diff before committing it: every changed line
 * is a claim whose legal check now reads differently.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leafLines, walkLegalPaths } from '../test/legal-paths-walk.ts';

const out = fileURLToPath(new URL('../test/fixtures/phase159h/legal-paths-gp-company.txt', import.meta.url));
mkdirSync(fileURLToPath(new URL('../test/fixtures/phase159h/', import.meta.url)), { recursive: true });
const leaves = walkLegalPaths('gp', 'company');
writeFileSync(out, leafLines(leaves).join('\n') + '\n');
const tally = new Map<string, number>();
for (const l of leaves) tally.set(l.level, (tally.get(l.level) ?? 0) + 1);
console.log(`${leaves.length} paths recorded in ${out}: ${['GREEN', 'URGENT', 'AMBER', 'RED'].map((x) => `${x} ${tally.get(x) ?? 0}`).join(', ')}`);
