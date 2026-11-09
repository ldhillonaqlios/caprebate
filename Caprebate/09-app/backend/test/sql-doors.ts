/**
 * WHERE A STATEMENT LIVES, AND WHO MAY RUN IT (Phase 161i1, 8 Nov 2026). Since the data files (09-app/docs/ARCHITECTURE.md
 * rule 3), a statement's text sits in its owner's data file and the file that used to run it calls a function there.
 * A test that said "only file X contains this statement" now asks two things: which files hold the text, and which
 * files call a data-file function that runs it. Together they say the same as before: there is still one door.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every .ts file under `root`, relative to it with forward slashes. */
function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) out.push(p.slice(root.length + 1).split('\\').join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/** The data files: each area's data.ts and data-borrowed.ts. */
const DATA_FILE = /(^|\/)data(-borrowed)?\.ts$/;

/**
 * For a statement pattern: `text` is every file under src/ whose text matches it (the data file, and any file that
 * still runs it itself); `callers` is every file outside the data files and the front doors that calls a data-file
 * function whose statement matches it. A front door only re-exports a name, so it is not a caller.
 */
export function statementDoors(src: string, pattern: RegExp): { text: string[]; callers: string[]; functions: string[] } {
  const files = sources(src);
  const text = files.filter((f) => pattern.test(readFileSync(join(src, f), 'utf8')));
  const functions: string[] = [];
  for (const f of files.filter((x) => DATA_FILE.test(x))) {
    const body = readFileSync(join(src, f), 'utf8');
    for (const m of body.matchAll(/export function (\w+)[^\n]*\{\n([\s\S]*?)\n\}/g)) if (pattern.test(m[2] ?? '')) functions.push(m[1] ?? '');
  }
  const named = new RegExp(`\\b(${functions.join('|') || '(?!)'})\\b`);
  const callers = files.filter((f) => !DATA_FILE.test(f) && !/(^|\/)index\.ts$/.test(f) && named.test(readFileSync(join(src, f), 'utf8')));
  return { text, callers, functions };
}
