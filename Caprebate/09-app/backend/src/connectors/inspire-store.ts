/**
 * ONE FILE A COUNCIL A MONTH — KEEPING HM LAND REGISTRY'S LAND BOUNDARY FILES ON OUR OWN SERVER. Phase 151a.
 *
 * HM Land Registry republishes the INSPIRE Index Polygons "on the first Sunday of each month" (SUPPLIER_DOCS,
 * HMLR_INSPIRE), one file per council. So one download serves every property in that council until the next
 * release, and this store keeps it: KEYED BY COUNCIL AND RELEASE MONTH, and KEPT NO LONGER THAN THE LICENCE ROW'S
 * cache_max_age_days (35, in the source register's HMLR_INSPIRE licence), counted from the day it was downloaded.
 *
 * WHERE. A directory named by CAPREBATE_INSPIRE_STORE_DIR, OUTSIDE THE REPOSITORY. A directory inside the git working
 * copy is refused, so a council's file can never be committed by accident (it is also far too large). Absent, nothing
 * is kept and every lookup downloads its council's file afresh — slower, never wrong.
 *
 * WHAT IS KEPT. The .zip exactly as downloaded, and beside it a small note: when it was downloaded, its size and its
 * SHA-256. A file whose bytes no longer match its note, whose note cannot be read, or that is past its days, is
 * deleted and treated as not kept. The polygons are never unpacked into the store and nothing about a client or a
 * property is written here — only the council's name, which is also the file's published name.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LICENCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';
import { INSPIRE_AUTHORITY_FILES } from './inspire-authorities.ts';

/** The licence row's limit, read from the register rather than restated. Refuses to load if the row is missing. */
export const INSPIRE_KEEP_DAYS: number = (() => {
  const d = LICENCES.find((l) => l.licence_id === 'HMLR_INSPIRE')?.cache_max_age_days;
  if (typeof d !== 'number' || !(d > 0)) throw new Error('The HMLR_INSPIRE licence row has no cache_max_age_days.');
  return d;
})();

const DAY_MS = 86_400_000;

/**
 * The release a date falls in: the month whose first Sunday is on or before it, as "YYYY-MM". Before the first Sunday
 * of a month, the previous month's release is still the latest. UTC throughout.
 */
export function inspireReleaseOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  let y = d.getUTCFullYear(); let m = d.getUTCMonth();
  const firstSunday = (yy: number, mm: number): number => {
    const dow = new Date(Date.UTC(yy, mm, 1)).getUTCDay();
    return Date.UTC(yy, mm, 1 + ((7 - dow) % 7));
  };
  if (d.getTime() < firstSunday(y, m)) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The git working copy this code sits in: the folder above Caprebate/ (src/connectors -> backend -> 09-app -> Caprebate -> Development). */
const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

export type InspireFileStore = {
  readonly dir: string;
  /** The kept file for this council and release, or null. Deletes what it finds expired or damaged. */
  get(file: string, release: string, now: string): Buffer | null;
  put(file: string, release: string, bytes: Buffer, now: string): void;
  /** Deletes every kept file past its days. Returns how many were deleted. */
  sweep(now: string): number;
};

type Note = { readonly downloaded_at: string; readonly bytes: number; readonly sha256: string };

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const RELEASE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A store in `dir`. Refuses a directory inside the repository. `repository` is for tests only. */
export function inspireFileStore(dir: string, opts: { readonly repository?: string } = {}): InspireFileStore {
  if (!isAbsolute(dir)) throw new Error('The land boundary store must be named by a full path.');
  const repo = opts.repository ?? REPOSITORY;
  const repoReal = existsSync(repo) ? realpathSync(repo) : repo;
  const refuse = (): never => {
    throw new Error('The land boundary store may not be inside the repository: a council\'s file must never reach git.');
  };
  // Checked before anything is created, and again once the path is real, so a link into the repository is caught too.
  if (inside(resolve(dir), repo) || inside(resolve(dir), repoReal)) refuse();
  mkdirSync(dir, { recursive: true });
  const real = realpathSync(dir);
  if (inside(real, repoReal)) refuse();
  const safe = (file: string, release: string): { zip: string; note: string } => {
    if (!INSPIRE_AUTHORITY_FILES.includes(file)) throw new Error('That council is not in HM Land Registry\'s published list.');
    if (!RELEASE_RE.test(release)) throw new Error('A release is written YYYY-MM.');
    const folder = join(real, file);
    return { zip: join(folder, `${release}.zip`), note: join(folder, `${release}.json`) };
  };
  const drop = (p: { zip: string; note: string }): void => { rmSync(p.zip, { force: true }); rmSync(p.note, { force: true }); };
  const expired = (n: Note, now: string): boolean => Date.parse(now) - Date.parse(n.downloaded_at) > INSPIRE_KEEP_DAYS * DAY_MS;

  const readNote = (p: string): Note | null => {
    try {
      const n = JSON.parse(readFileSync(p, 'utf8')) as Note;
      return typeof n.downloaded_at === 'string' && !Number.isNaN(Date.parse(n.downloaded_at)) && typeof n.sha256 === 'string' ? n : null;
    } catch { return null; }
  };

  return {
    dir: real,
    get(file, release, now) {
      const p = safe(file, release);
      if (!existsSync(p.zip)) { rmSync(p.note, { force: true }); return null; }
      const note = readNote(p.note);
      if (note === null || expired(note, now)) { drop(p); return null; }
      const bytes = readFileSync(p.zip);
      if (bytes.length !== note.bytes || sha(bytes) !== note.sha256) { drop(p); return null; }
      return bytes;
    },
    put(file, release, bytes, now) {
      const p = safe(file, release);
      const folder = dirname(p.zip);
      mkdirSync(folder, { recursive: true });
      // One release a council: an older one is replaced, not kept beside it.
      for (const name of readdirSync(folder)) if (!name.startsWith(`${release}.`)) rmSync(join(folder, name), { force: true });
      writeFileSync(p.zip, bytes);
      writeFileSync(p.note, JSON.stringify({ downloaded_at: now, bytes: bytes.length, sha256: sha(bytes) } satisfies Note));
    },
    sweep(now) {
      let n = 0;
      for (const council of readdirSync(real)) {
        const folder = join(real, council);
        if (!statSync(folder).isDirectory()) continue;
        for (const name of readdirSync(folder)) {
          if (!name.endsWith('.zip')) continue;
          const release = name.slice(0, -4);
          const p = { zip: join(folder, name), note: join(folder, `${release}.json`) };
          const note = readNote(p.note);
          if (note === null || expired(note, now)) { drop(p); n++; }
        }
      }
      return n;
    },
  };
}

/** The store named by CAPREBATE_INSPIRE_STORE_DIR, or null — the shipped state. */
export function inspireStoreFromEnv(env: Record<string, string | undefined> = process.env): InspireFileStore | null {
  const dir = env['CAPREBATE_INSPIRE_STORE_DIR'];
  if (dir === undefined || dir.trim() === '') return null;
  return inspireFileStore(dir.endsWith(sep) ? dir.slice(0, -1) : dir);
}
