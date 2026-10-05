/**
 * RE-SETTING THE SECTOR RANGES FROM FINISHED CLAIMS — PHASE 153e, 4 October 2026 (Word question 138, the surveyor's).
 *
 * The first figure a client sees comes from our sector ranges (CB_BAND in the engine), which we set ourselves and
 * have never checked against a finished job. The answer typed under the question: build the ranges from completed
 * claims and validate them against surveyed results. Built on our recommendation, for the surveyor to check, in the
 * test system: this reads every survey pack the surveyor has APPROVED (its newest version), takes what qualified as a
 * share of the price paid, and proposes a range per sector — and for supported living, per trigger. It PROPOSES; it
 * changes no band. A person changes the engine, with the surveyor's agreement.
 *
 * A range is proposed only once a sector (or trigger) has MIN_CLAIMS finished claims: a placeholder for the surveyor.
 * A claim with no price, or no qualifying figure, is left out and counted (N4).
 */
import type { Db } from '../db.ts';
import { BAND } from './engine.ts';
import { funnelStateFor, sessionFromFunnel } from './funnel-session.ts';

export const MIN_CLAIMS = 5;

export type RangeProposal = {
  readonly sector: string;
  /** Supported living only: the trigger's band key, or 'not known'. */
  readonly trigger: string | null;
  readonly claims: number;
  readonly shares: readonly number[];
  readonly current: readonly [number, number] | null;
  readonly proposed: readonly [number, number] | null;
  readonly words: string;
};

type Snap = { job?: { id?: string; sector?: string }; inputs?: { price_paid_pence?: { value?: number | null } }; sums?: { qualifying_pence?: number | null } };

function slKey(trigger: unknown): string {
  const list: unknown[] = Array.isArray(trigger) ? trigger : [];
  const keys = new Set<string>();
  for (const t of list) {
    const k = t === 'purchase' ? 'purchase' : t === 'new_build' ? 'new_build'
      : t === 'conversion' || t === 'fitout' || t === 'fit_out' || t === 'refurb' ? 'refurb_fitout' : null;
    if (k !== null) keys.add(k);
  }
  return keys.size === 1 ? [...keys][0] as string : 'not known';
}

export function proposeRanges(db: Db, min = MIN_CLAIMS): { proposals: RangeProposal[]; left_out: number } {
  const rows = db.all<{ snapshot_json: string; assessment_id: string | null }>(
    'SELECT a.snapshot_json, j.assessment_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'WHERE a.version = (SELECT MAX(x.version) FROM survey_pack_approvals x WHERE x.pack_id = a.pack_id)');
  const buckets = new Map<string, { sector: string; trigger: string | null; shares: number[] }>();
  let left_out = 0;
  for (const r of rows) {
    let s: Snap;
    try { s = JSON.parse(r.snapshot_json) as Snap; } catch { left_out++; continue; }
    const sector = s.job?.sector;
    const price = s.inputs?.price_paid_pence?.value;
    const q = s.sums?.qualifying_pence;
    if (typeof sector !== 'string' || typeof price !== 'number' || !(price > 0) || typeof q !== 'number' || q < 0) { left_out++; continue; }
    let trigger: string | null = null;
    if (sector === 'supported_living') {
      const state = r.assessment_id === null ? undefined : funnelStateFor(db, r.assessment_id);
      trigger = state === undefined ? 'not known' : slKey((sessionFromFunnel('supported_living', state).session as { trigger?: unknown }).trigger);
    }
    const key = `${sector}|${trigger ?? ''}`;
    const b = buckets.get(key) ?? { sector, trigger, shares: [] };
    b.shares.push(Math.round((q / price) * 10000) / 10000);
    buckets.set(key, b);
  }
  const bands = (BAND as { BANDS?: Record<string, Record<string, [number, number]>> }).BANDS ?? {};
  const proposals = [...buckets.values()].sort((a, b) => `${a.sector}${a.trigger ?? ''}`.localeCompare(`${b.sector}${b.trigger ?? ''}`)).map((b): RangeProposal => {
    const shares = [...b.shares].sort((x, y) => x - y);
    const cur = bands[b.sector]?.[b.trigger !== null && b.trigger !== 'not known' ? b.trigger : 'purchase'] ?? null;
    const enough = shares.length >= min;
    const proposed: [number, number] | null = enough ? [shares[0] as number, shares[shares.length - 1] as number] : null;
    const pct = (x: number) => `${String(Math.round(x * 1000) / 10)}%`;
    return {
      sector: b.sector, trigger: b.trigger, claims: shares.length, shares, current: cur, proposed,
      words: enough
        ? `${String(shares.length)} finished claims qualify ${pct(shares[0] as number)} to ${pct(shares[shares.length - 1] as number)} of the price paid${cur === null ? '' : `; the range today is ${pct(cur[0])} to ${pct(cur[1])}`}. For the surveyor to agree before the engine changes.`
        : `${String(shares.length)} finished claim${shares.length === 1 ? '' : 's'}; ${String(min)} are needed before a range is proposed.`,
    };
  });
  return { proposals, left_out };
}
