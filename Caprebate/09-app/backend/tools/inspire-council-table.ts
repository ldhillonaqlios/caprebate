/**
 * REBUILDS THE COUNCIL TABLE in src/connectors/inspire-councils.ts from ONS's published list. Phase 151a.
 *
 *   node tools/inspire-council-table.ts <ons-list.json>           prints what it would write, and every problem
 *   node tools/inspire-council-table.ts <ons-list.json> --write   rewrites the generated rows
 *
 * <ons-list.json> is the answer of the ONS feature service named in ONS_LAD_LIST.service, asked for every row
 * (query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2000&f=json), saved OUTSIDE the repository.
 * This tool makes no network call. It keeps the England and Wales rows (codes beginning E and W), pairs each with
 * HM Land Registry's file by the rule and the named pairs, and REFUSES (exit 1) if any council or any file is left
 * unpaired or paired twice — a changed list is a person's job to read, never this tool's to guess.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSPIRE_AUTHORITY_FILES } from '../src/connectors/inspire-authorities.ts';
import { fileForOnsName, NAMED_PAIRS, type InspireCouncil } from '../src/connectors/inspire-councils.ts';

const [path, flag] = process.argv.slice(2);
if (path === undefined) {
  console.error('usage: node tools/inspire-council-table.ts <ons-list.json> [--write]');
  process.exit(2);
}
const data = JSON.parse(readFileSync(path, 'utf8')) as { features?: { attributes: Record<string, unknown> }[] };
const rows = (data.features ?? []).map((f) => f.attributes);
const codeKey = Object.keys(rows[0] ?? {}).find((k) => /^LAD\d\dCD$/i.test(k));
const nameKey = Object.keys(rows[0] ?? {}).find((k) => /^LAD\d\dNM$/i.test(k));
if (codeKey === undefined || nameKey === undefined) {
  console.error('The file does not have a LADnnCD and a LADnnNM column. Nothing written.');
  process.exit(1);
}
const lads = rows
  .map((r) => ({ code: String(r[codeKey]), name: String(r[nameKey]) }))
  .filter((r) => /^[EW]\d{8}$/.test(r.code));

const problems: string[] = [];
const out: InspireCouncil[] = [];
const named = new Map(NAMED_PAIRS.map((p) => [p.lad_code, p]));
for (const l of lads) {
  const pair = named.get(l.code);
  if (pair !== undefined) {
    if (!INSPIRE_AUTHORITY_FILES.includes(pair.file)) problems.push(`${l.code}: named file ${pair.file} is not in HM Land Registry's list`);
    if (fileForOnsName(l.name).length !== 0) problems.push(`${l.code} ${l.name}: named by hand, but the rule now pairs it`);
    out.push({ lad_code: l.code, ons_name: l.name, file: pair.file });
    continue;
  }
  const hits = fileForOnsName(l.name);
  if (hits.length !== 1) { problems.push(`${l.code} ${l.name}: the rule found ${hits.length} files (${hits.join(', ')})`); continue; }
  out.push({ lad_code: l.code, ons_name: l.name, file: hits[0] as string });
}
for (const p of NAMED_PAIRS) if (!lads.some((l) => l.code === p.lad_code)) problems.push(`${p.lad_code}: named by hand, but not in the ONS list`);
const seen = new Map<string, string>();
for (const r of out) {
  if (seen.has(r.file)) problems.push(`${r.file}: paired with both ${seen.get(r.file)} and ${r.lad_code}`);
  seen.set(r.file, r.lad_code);
}
for (const f of INSPIRE_AUTHORITY_FILES) if (!seen.has(f)) problems.push(`${f}: no council paired with it`);

out.sort((a, b) => a.lad_code.localeCompare(b.lad_code));
console.log(`${lads.length} England and Wales councils in the ONS list; ${INSPIRE_AUTHORITY_FILES.length} files; ${out.length} paired; ${problems.length} problems.`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
if (problems.length > 0) process.exit(1);

if (flag === '--write') {
  const file = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'connectors', 'inspire-councils.ts');
  const src = readFileSync(file, 'utf8');
  const body = out.map((r) => `  { lad_code: ${JSON.stringify(r.lad_code)}, ons_name: ${JSON.stringify(r.ons_name)}, file: ${JSON.stringify(r.file)} },`).join('\n');
  const next = src.replace(
    /(export const INSPIRE_COUNCILS: readonly InspireCouncil\[\] = Object\.freeze\(\[\n)[\s\S]*?(\]\);\n\/\* END GENERATED ROWS \*\/)/,
    `$1${body}\n$2`,
  );
  if (next === src && !src.includes(body)) { console.error('Could not find the generated rows to replace. Nothing written.'); process.exit(1); }
  writeFileSync(file, next);
  console.log(`Wrote ${out.length} rows.`);
}
