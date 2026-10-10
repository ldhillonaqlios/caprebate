/**
 * PHASE 159h (item 6), 10 October 2026 — EVERY PATH THROUGH THE PACK'S LEGAL CHECK, AS A REGRESSION.
 *
 * The stress test of 9 October 2026 walked 20,367 answer paths through `assessLegal` (the claim harness, h6-legal.ts,
 * in OneDrive). This is that walk, kept in the suite: depth-first over the questions the flow asks, every option of the
 * route-deciding questions enumerated in full, and below them a fixed number of seeded random walks, so every later
 * option is reached many times. The same seed gives the same paths. Each complete path's outcome — its level, its cap
 * and its deadline — is recorded in test/fixtures/phase159h/legal-paths-gp-company.txt (`node tools/legal-paths-record.ts`)
 * and test/legal-paths.test.ts checks every one. A change to the law that moves an outcome must be recorded on purpose.
 *
 * Phase 159h added the questions it made route-deciding to the full enumeration: how the property was taken on (G14s),
 * the s.183 election on a new lease (G14s3), and whether a seller was a charity or another body that pays no tax.
 * Phase 159l (item 8) added the two questions the statements route asks (G14ivne, G14st8), which the pack now holds on
 * with the fixed value requirement's reading (pack-legal.ts LEGAL_READINGS #9 and #10), and re-recorded the walk.
 */
import { createHash } from 'node:crypto';
import { assessLegal } from '../src/web/pack-legal.ts';

export const LEGAL_PATHS_NOW = '2026-10-09T09:00:00.000Z';
type Q = { id: string; type: string; optional?: boolean; opts?: readonly (readonly [string, string])[] };
const SKIP = Symbol('skip');
const sfx = (id: string) => id.slice(1); // G14pod -> 14pod

function samples(q: Q, a: Map<string, unknown>): unknown[] {
  const s = sfx(q.id);
  const base: unknown[] = (() => {
    switch (q.type) {
      case 'single': {
        // Pruned where an answer only changes wording, not the verdict, to keep the tree finite (the harness's method).
        const keep: Record<string, string[]> = { '15': ['no'], '14sx': ['s.198', 'unsure'], '14rs': ['split'], '14mp': ['no'],
          '14t': ['none', 'undetermined'], '14pol': ['yes', 'no'], '12': ['nhs', 'developer', 'residential_landlord', 'taxpaying', 'other', 'unsure'],
          '14po': ['sold_market', 'sold_undervalue', 'new_lease_premium', 'unsure'], '14dvs': ['held', 'no', 'unsure'], '14sc': ['all_fixtures', 'listed_items', 'unclear'] };
        const all = (q.opts ?? []).map((o) => o[0]);
        return keep[s] === undefined ? all : all.filter((x) => keep[s]!.includes(x));
      }
      case 'multi':
        if (s === '8') return [['purchase'], ['new_build']];
        if (s === '14c') return [['amount', 'plant', 'land', 'interest', 'utrs', 'both'], ['amount']];
        return [(q.opts ?? []).map((o) => o[0])];
      case 'date': {
        const g9 = [...a.entries()].find(([k]) => sfx(k) === '9d')?.[1] as string | undefined;
        if (s === '9d') return ['2025-06-01', '2019-06-01'];
        if (s === '14d') return [g9 ?? '2025-06-01'];
        if (s === '14n') return g9 === '2019-06-01' ? ['2019-09-01', '2022-09-01'] : ['2025-09-01'];
        if (s === '14pod') return ['2013-06-01', '2019-06-01'];
        if (s === '14ivd') return ['2018-03-01'];
        if (s === '14dvsd') return ['2019-07-01', '2024-07-01'];
        return ['2019-06-01'];
      }
      case 'currency': return s === '14v' ? [60000, 1] : [50000];
      case 'percent': return [50];
      default: return [];
    }
  })();
  return q.optional === true ? [SKIP, ...base] : base;
}

export type LegalLeaf = { readonly key: string; readonly answers: Record<string, unknown>; readonly level: string; readonly cap: number | null; readonly deadline: string | null };

/** Every complete answer path, in a fixed order. */
export function walkLegalPaths(sector = 'gp', claimant = 'company', walks = 4): LegalLeaf[] {
  const FULL = new Set(['8', '8a', '9d', '11', '12', 'C-seller-nontax', '12b', '14', '14s', '14s3', '14po', '14iv', '14pod', '14ivne', '14st8']);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const leaves: LegalLeaf[] = [];
  const seen = new Set<string>();
  const finish = (a: Map<string, unknown>, skipped: Set<string>): void => {
    for (;;) {
      const r = assessLegal(sector, a, LEGAL_PATHS_NOW, claimant);
      const next = (r.asked as Q[]).find((q) => !a.has(q.id) && !skipped.has(q.id));
      if (next === undefined) {
        const key = createHash('sha1').update(JSON.stringify([...a.entries()])).digest('hex').slice(0, 16);
        if (seen.has(key)) return;
        seen.add(key);
        leaves.push({ key, answers: Object.fromEntries(a), level: r.verdict.level, cap: r.verdict.cap_pence, deadline: r.verdict.deadline });
        return;
      }
      const opts = samples(next, a);
      const v = opts[Math.floor(rnd() * opts.length)];
      if (v === SKIP) skipped.add(next.id); else a.set(next.id, v);
    }
  };
  const explore = (a: Map<string, unknown>, skipped: Set<string>): void => {
    const r = assessLegal(sector, a, LEGAL_PATHS_NOW, claimant);
    const next = (r.asked as Q[]).find((q) => !a.has(q.id) && !skipped.has(q.id));
    if (next === undefined) { finish(new Map(a), new Set(skipped)); return; }
    if (!FULL.has(sfx(next.id))) { for (let i = 0; i < walks; i++) finish(new Map(a), new Set(skipped)); return; }
    for (const v of samples(next, a)) {
      if (v === SKIP) { const s2 = new Set(skipped); s2.add(next.id); explore(a, s2); continue; }
      const a2 = new Map(a); a2.set(next.id, v); explore(a2, skipped);
    }
  };
  explore(new Map(), new Set());
  return leaves;
}

/** One line per path: its key, level, cap in pence and deadline. Sorted, so the file diffs line by line. */
export function leafLines(leaves: readonly LegalLeaf[]): string[] {
  return leaves.map((l) => `${l.key} ${l.level} ${l.cap ?? '-'} ${l.deadline ?? '-'}`).sort();
}
