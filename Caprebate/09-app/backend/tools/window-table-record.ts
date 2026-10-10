/**
 * PHASE 159j (item 1): RECORD THE AMENDMENT WINDOW FOR EVERY CLAIMANT TYPE, YEAR END AND PURCHASE YEAR. Run from
 * 09-app/backend:
 *   node tools/window-table-record.ts
 * It builds the table (test/stress-window-walk.ts) and writes test/fixtures/phase159j/window-table.csv. Run it only when
 * a change to the window is meant to move rows, and read the diff before committing it: every changed line is a claim
 * whose window now opens or closes differently.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WINDOW_HEADER, windowTable } from '../test/stress-window-walk.ts';

mkdirSync(fileURLToPath(new URL('../test/fixtures/phase159j/', import.meta.url)), { recursive: true });
const out = fileURLToPath(new URL('../test/fixtures/phase159j/window-table.csv', import.meta.url));
const rows = await windowTable();
writeFileSync(out, [WINDOW_HEADER, ...rows].join('\n') + '\n');
const tally = new Map<string, number>();
for (const r of rows) { const s = r.split(',')[5] ?? '?'; tally.set(s, (tally.get(s) ?? 0) + 1); }
console.log(`${String(rows.length)} rows recorded in ${out}: ${[...tally].map(([k, n]) => `${k} ${String(n)}`).join(', ')}`);
