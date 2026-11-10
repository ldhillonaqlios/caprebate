/**
 * THE INTRODUCERS' SWITCHES AND THE REWARD SETTING'S GATE (Phase 161l1, carved from src/modules/crm/introducers.ts
 * unchanged): the public referral form and the client's own yes to sharing, each its own switch, the gate of the
 * introducer reward setting, and model B's fees as a list (the finance view shows it too). Read by the CRM's introducer screens, the claims' case stamp and the admin's tiles.
 */
import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { formatPence, localStamp } from '../../shared/index.ts';
import { listIntroducerFeesIdIntroducerIdByIntroducerIdOwn, listIntroducerFeesIdIntroducerIdOwn, withClaimRefs } from './data.ts';
import { claimRefsFor } from './claims-port.ts';

type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

/**
 * THE PUBLIC REFERRAL FORM SHIPS OFF. It collects another firm's client's
 * details, so it waits on a published privacy notice that says so. This is its
 * own switch — the free register gate is `CB_REGISTRY.precondition` and governs
 * register lookups, not this — and turning it on is one line, not ours to turn.
 */
export const REFERRAL_FORM: { readonly enabled: boolean; readonly requires: string } = Object.freeze({
  enabled: false,
  requires: 'a published privacy notice, linked from the referral form. It tells a referred client what their firm sent us, ' +
    'why we may keep it, and how to object',
});

export const REWARD_OBJECT = { type: 'introducer_reward' as const, id: 'the-setting' };

/* ------------------------------------------------ the client's own route — CRM 8 of 10 */

/**
 * THE CLIENT GIVES OR WITHDRAWS THE OPT-IN IN THEIR OWN PORTAL, writing the same
 * table under the route CLIENT_PORTAL (migration 017). One consent history, not two.
 *
 * WITHDRAWING IS ALWAYS OPEN: stopping a notice can never be the wrong words. It is
 * offered only while the answer is yes, so a client who was never asked stays no
 * row — and shares nothing.
 *
 * GIVING FROM THE PORTAL IS BUILT AND SHIPS OFF. The words a referred client must be
 * told are not agreed; until they are, a yes is still recorded by staff, who ask.
 */
/* 24 September 2026: ANSWERED AND ON. the owner, Word answer 168 (closed that day): ask the client's
   permission before updating the firm that referred them, with a request from the client's own portal. So giving from
   the portal is switched on; a staff-recorded yes still works beside it, and nothing is shared without a yes. */

export const CLIENT_SHARE_GIVE: { readonly enabled: boolean; readonly requires: string } = Object.freeze({
  enabled: true,
  requires: 'Answered: the client says yes or no in their own portal first.',
});

/**
 * THE GATE OF THE REWARD MODEL, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function rewardModelGate(actor: Actor): void {
  authorise(actor, 'introducer_reward.read', REWARD_OBJECT);
}

export const FEE_STATES: Vocab = Object.freeze({ ACCRUED: 'Accrued', PAID: 'Paid to the firm' });

/* ------------------------------------------------ model B's fees */

export type FeeView = {
  readonly id: string;
  readonly firm: { readonly id: string; readonly name: string };
  readonly claim: { readonly id: string; readonly claim_ref: string };
  readonly amount: string;
  readonly disclosure: { readonly given: boolean; readonly recorded: string | null };
  readonly state: { readonly key: string; readonly label: string };
  readonly payable: boolean;
  readonly paid: string | null;
  readonly may_disclose: boolean;
  readonly may_record_settled: boolean;
};

export type FeeDbRow = {
  id: string; introducer_id: string; firm_name: string; claim_id: string; claim_ref: string; business_id: string; amount_pence: number;
  disclosure_given_at: string | null; discloser: string | null; state: string; paid_at: string | null; payer: string | null;
};

export function feeObj(r: { id: string; business_id: string }): { type: 'introducer_fee'; id: string; business_id: string } {
  return { type: 'introducer_fee', id: r.id, business_id: r.business_id };
}

export function feeList(db: Db, actor: Actor, introducer_id?: string): FeeView[] {
  // Each fee's claim reference is the claims' (asked through the port they fill); a fee whose claim is not there is not listed (Phase 161l2).
  const own = introducer_id === undefined
    ? listIntroducerFeesIdIntroducerIdOwn<FeeDbRow>(db)
    : listIntroducerFeesIdIntroducerIdByIntroducerIdOwn<FeeDbRow>(db, [introducer_id]);
  const rows = withClaimRefs(own, claimRefsFor(db, own.map((r) => r.claim_ref)));
  return rows.filter((r) => can(actor, 'introducer_fee.read', feeObj(r))).map((r) => ({
    id: r.id,
    firm: { id: r.introducer_id, name: r.firm_name },
    claim: { id: r.claim_id, claim_ref: r.claim_ref },
    amount: formatPence(r.amount_pence),
    disclosure: {
      given: r.disclosure_given_at !== null,
      recorded: r.disclosure_given_at === null ? null : `${localStamp(r.disclosure_given_at)}${r.discloser === null ? '' : ` by ${r.discloser}`}`,
    },
    state: { key: r.state, label: words(FEE_STATES, r.state, r.state) },
    // NOTHING IS PAYABLE BEFORE THE DISCLOSURE IS GIVEN.
    payable: r.state === 'ACCRUED' && r.disclosure_given_at !== null,
    paid: r.paid_at === null ? null : `${localStamp(r.paid_at)}${r.payer === null ? '' : ` by ${r.payer}`}`,
    may_disclose: r.disclosure_given_at === null && can(actor, 'introducer_fee.disclose', feeObj(r)),
    may_record_settled: r.state === 'ACCRUED' && r.disclosure_given_at !== null && can(actor, 'introducer_fee.record_settled', feeObj(r)),
  }));
}
