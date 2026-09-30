/**
 * "TELL THE CLIENT AND MOVE ON" — 30 September 2026.
 *
 * Lakhbir: "we then need a CTA next to where it says 'tell the client' when this is clicked the stage moves along and it
 * then notifies the client on their portal and email to let them know that Cap rebate has collected this information and
 * we are moving on to the next phase". Asked how the stage should move, Lakhbir chose "Move it when allowed": through the
 * usual checks, and if one blocks, the client is still told and staff see what is stopping the move.
 *
 * ONE PRESS, THREE THINGS, IN THIS ORDER:
 *   1 · TOLD. `tellClient` (src/web/approvals.ts), unchanged: only a complete step, only once. The portal's "What Cap
 *       Rebate has done" card shows it with the date — never a fact, a value or a figure.
 *   2 · EMAILED. One email to the company's address (else its first contact with one): what we have done, and, where a
 *       claim moved, the next phase in the client's own step names; and the portal's address. Sent when email sending is
 *       on, saved to the outbox either way. Never a fact, a value, a figure or a name of a register.
 *   3 · MOVED, WHEN ALLOWED. A step sits on one or more of the ten stages (StepDef.procedure). When every step on a
 *       claim's CURRENT stage has been told, the claim moves forward one stage through `moveClaim` — the same gate, the
 *       same next-action rule, the same audit as the Move button. A step for an earlier or later stage moves nothing. A
 *       refusal stops nothing: the client was told, and the refusal's words are kept for the page (`whyNotMoved`).
 * Nothing here moves a claim that its own checks would not let a person move.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { Actor } from '../authz.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { checksPanel, stepDef, tellClient, type ChecksPanel, type StepView } from './approvals.ts';
import { gateOut, loadPipelineClaim, moveClaim } from './pipeline.ts';
import { claimStage, clientStageFor, nextProcedureKey, STAGES, type ProcedureKey } from './stages.ts';
import { PROPOSED_STEP_NAMES } from './portal-steps.ts';
import { localStamp } from './localtime.ts';

export type TellDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string; email: EmailTransport };

export type Moved = { readonly claim_id: string; readonly to: string };
export type Stayed = { readonly claim_id: string; readonly why: string };
export type TellOutcome =
  | { readonly ok: true; readonly emailed: boolean; readonly moved: readonly Moved[]; readonly stayed: readonly Stayed[] }
  | { readonly ok: false; readonly why: string; readonly field?: string };

/** A client-facing step name, without its number: "We research your property". */
function clientStepName(procedureKey: string): string | null {
  const k = clientStageFor(procedureKey);
  if (k === null) return null;
  return PROPOSED_STEP_NAMES[k].replace(/^\d+\s+/, '');
}

/** The steps that sit on a stage, for one claim: the company's step and that claim's own. */
function stepsOnStage(p: ChecksPanel, claim_id: string, stage: ProcedureKey): StepView[] {
  const own = p.claims.find((c) => c.id === claim_id)?.steps ?? [];
  return [p.company, ...own].filter((s) => stepDef(s.key)?.procedure.includes(stage) === true);
}

export function tellAndMoveOn(
  d: TellDeps, actor: Actor, business_id: string, input: { step: string; claim_id?: string | null }, origin: string,
): TellOutcome {
  const told = tellClient(d, actor, business_id, input);
  if (!told.ok) return told;
  const def = stepDef(input.step);
  const today = d.now().slice(0, 10);
  const p = checksPanel(d.db, actor, business_id, today);
  const claims = input.claim_id !== null && input.claim_id !== undefined ? [input.claim_id]
    : d.db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY created_at, id', [business_id]).map((r) => r.id);
  const moved: Moved[] = [];
  const stayed: Stayed[] = [];
  for (const id of claims) {
    const pc = loadPipelineClaim(d.db, id);
    const st = claimStage(pc.stage);
    if (st.kind !== 'PROCEDURE' || def === undefined || !def.procedure.includes(st.key)) continue;
    const waiting = stepsOnStage(p, id, st.key).filter((s) => s.state !== 'TOLD');
    if (waiting.length > 0) {
      stayed.push({ claim_id: id, why: `Still to tell the client: ${waiting.map((s) => s.label.toLowerCase()).join(', ')}.` });
      continue;
    }
    const to = nextProcedureKey(st.key);
    try {
      const r = moveClaim(d, actor, id, { kind: 'FORWARD', to, reason: `Moved on when the client was told: ${def.told}.` });
      if (r.ok) moved.push({ claim_id: id, to }); else stayed.push({ claim_id: id, why: r.why });
    } catch {
      // A login that may tell the client but not move a claim: the client is told; a colleague who moves claims moves it.
      stayed.push({ claim_id: id, why: 'Your login cannot move claims. Ask a colleague who can to move it on from the claim.' });
    }
  }
  // The email: what we did, and where a claim moved, what comes next. Only to an address the company gave us.
  const to = d.db.get<{ e: string | null }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [business_id])?.e
    ?? d.db.get<{ e: string | null }>("SELECT email AS e FROM contacts WHERE business_id = ? AND email IS NOT NULL AND trim(email) <> '' ORDER BY created_at, id LIMIT 1", [business_id])?.e
    ?? null;
  let emailed = false;
  if (to !== null && def !== undefined) {
    const next = moved.map((m) => clientStepName(m.to)).find((x) => x !== null) ?? null;
    const sent = d.email.send({
      to_email: to, kind: 'NOTIFICATION', business_id,
      subject: 'Cap Rebate news: ' + def.told.replace(/^Cap Rebate has /, 'we have '),
      body: `${def.told}. (${localStamp(d.now(), d.now())})\n\n` +
        (next === null ? '' : `We are now moving on to the next phase: ${next}.\n\n`) +
        `You can follow your claim, step by step, in your portal: ${origin.replace(/\/+$/, '')}/portal\n\n` +
        'Cap Rebate',
    });
    emailed = sent.refused === null;
  }
  return { ok: true, emailed, moved, stayed };
}

/**
 * WHY A CLAIM HAS NOT MOVED ON, for the page: every step on its current stage is told, but it is still there. The gate's
 * own words when it is shut; otherwise the next-action rule (a move needs one with an owner and a due date). Null when
 * a step on the stage is still to tell (that is the next step, not a block), or the claim is not in the procedure.
 */
export function whyNotMoved(db: Db, p: ChecksPanel, claim_id: string, todayIso: string): string | null {
  const pc = loadPipelineClaim(db, claim_id);
  const st = claimStage(pc.stage);
  if (st.kind !== 'PROCEDURE') return null;
  const on = stepsOnStage(p, claim_id, st.key);
  if (on.length === 0 || on.some((s) => s.state !== 'TOLD')) return null;
  const g = gateOut(db, pc, st.key, { today: todayIso });
  if (!g.open) return `It stays at ${st.label} until: ${g.needs.filter((n) => !n.met).map((n) => n.what).join('; ')}.`;
  return `It stays at ${st.label}: give the claim a next action with an owner and a due date, then move it on from the claim.`;
}

/** The six steps as the client reads them, and which one the company is at. */
export function clientProgress(db: Db, business_id: string): { readonly steps: readonly string[]; readonly at: number } {
  const stage = db.get<{ s: string | null }>('SELECT stage AS s FROM businesses WHERE id = ?', [business_id])?.s ?? null;
  return {
    steps: STAGES.map((s) => PROPOSED_STEP_NAMES[s.key].replace(/^\d+\s+/, '')),
    at: Math.max(0, STAGES.findIndex((s) => s.key === stage)),
  };
}
