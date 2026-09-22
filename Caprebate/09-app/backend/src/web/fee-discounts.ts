/**
 * A MULTI-SITE DISCOUNT — ENTERED, RECORDED, AND NEVER APPLIED AUTOMATICALLY.
 *                                                  Phase 132e, 16 September 2026
 *
 * The fee is a flat 3% of the allowances identified, and "A further multi-site
 * discount can be applied depending on site/opportunities" (Lakhbir). The engine
 * holds the discount as discretionary with two named nulls — the largest
 * discount and who approves it — and they are asked, never invented here.
 *
 * SO A DISCOUNT A PERSON ENTERS IS A RECORD AND NOTHING MORE: how much (a share
 * of our fee), why, who and when, with an audit line that names none of the
 * reason's words. It is read back as AWAITING the decision on the largest
 * discount and the approver. No invoice reads this module; `computeFee` in
 * src/web/fee-controls.ts never sees it; no ceiling is checked because none is
 * decided, and nothing is refused for want of one.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { multiSiteDiscount } from './engine.ts';
import { localStamp } from './localtime.ts';

export type FeeDiscountDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type FeeDiscountView = {
  readonly id: string;
  readonly discount: string;
  readonly reason: string;
  readonly recorded: string;
  /** Always AWAITING while the engine's largest discount or approver is a null — which is how it ships. */
  readonly state: 'AWAITING_CEILING_AND_APPROVER' | 'DECISION_RECORDED_NOT_APPLIED';
  readonly applied: false;
  readonly says: string;
};

function claimObj(c: { id: string; business_id: string }): { type: 'claim'; id: string; business_id: string; assigned_surveyor_ids: readonly string[] } {
  return { type: 'claim', id: c.id, business_id: c.business_id, assigned_surveyor_ids: [] };
}

export function discountState(): { state: FeeDiscountView['state']; says: string } {
  const m = multiSiteDiscount();
  if (m.largest_discount === null || m.approved_by === null) {
    return {
      state: 'AWAITING_CEILING_AND_APPROVER',
      says: `Recorded, not applied. It awaits the decision on ${m.asked} — neither is decided, so no discount is taken off any fee.`,
    };
  }
  return { state: 'DECISION_RECORDED_NOT_APPLIED', says: 'Recorded, not applied. The system never takes a discount off a fee.' };
}

export function recordFeeDiscount(
  d: FeeDiscountDeps, actor: Actor, claim_id: string, input: Readonly<Record<string, string | null | undefined>>,
): { ok: true; id: string } | { ok: false; why: string } {
  const c = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) {
    authorise(actor, 'fee_discount.record', claimObj({ id: claim_id, business_id: '' }));
    return { ok: false, why: 'not found' };
  }
  authorise(actor, 'fee_discount.record', claimObj(c));
  const raw = (input['discount_percent'] ?? '').replace(/[%\s]/g, '');
  const pct = raw === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { ok: false, why: 'Give the discount as a share of our fee, as a percentage above 0 and no more than 100.' };
  }
  const bp = Math.round(pct * 100);
  if (bp < 1) return { ok: false, why: 'That discount rounds to nothing.' };
  const reason = (input['reason'] ?? '').trim();
  if (reason.length < 2 || reason.length > 2000) return { ok: false, why: 'Say why — which sites or which opportunity — in up to 2,000 characters.' };
  const id = d.newId();
  const at = d.now();
  d.db.run('INSERT INTO fee_discounts (id, claim_id, business_id, discount_bp, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, c.business_id, bp, reason, actor.id, at]);
  d.audit.append({
    at, kind: 'FEE_DISCOUNT_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id,
    // The share and the state — never the reason's words.
    detail: { business: c.business_id, discount_bp: bp, state: discountState().state, applied: false },
  });
  return { ok: true, id };
}

export function discountsFor(db: Db, actor: Actor, claim_id: string): readonly FeeDiscountView[] {
  const c = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined || !can(actor, 'fee_discount.read', claimObj(c))) return [];
  const st = discountState();
  return db.all<{ id: string; discount_bp: number; reason: string; recorded_at: string; who: string | null }>(
    'SELECT f.id, f.discount_bp, f.reason, f.recorded_at, u.display_name AS who FROM fee_discounts f LEFT JOIN users u ON u.id = f.recorded_by ' +
      'WHERE f.claim_id = ? ORDER BY f.recorded_at DESC, f.rowid DESC', [c.id],
  ).map((r) => ({
    id: r.id, discount: `${r.discount_bp / 100}% of our fee`, reason: r.reason,
    recorded: `${localStamp(r.recorded_at)}${r.who === null ? '' : ` by ${r.who}`}`,
    state: st.state, applied: false, says: st.says,
  }));
}
