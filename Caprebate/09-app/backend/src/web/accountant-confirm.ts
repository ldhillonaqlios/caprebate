/**
 * THE CLIENT'S ACCOUNTANT CONFIRMS FOR THEMSELVES — Phase 158d, 9 October 2026.
 *
 * The second Friary House run (04-phase-work/sim-2026-10-06, finding F46): two steps were still ticked by Sales for the
 * client's accountant — "The client's accountant confirmed the claim fits the return and the amendment window"
 * (ACCOUNTANT_CONFIRMED_RETURN) and the filing date on the reconciliation — while the same accountant had just signed off
 * the figures through their own private link (src/web/report-signoff.ts). Now each is the accountant's own answer:
 *
 *   SENT     Admin or Sales (`email.queue`, as the sign-off link) emails one of the company's accountants or advisers a
 *            private link: RETURN_FIT at Reports, FILED at Invoice or the defence pack. Only the link's SHA-256 is kept;
 *            it works for 30 days and is answered once (migration 102). It goes as the sign-off link goes — the outbox
 *            kind REPORT_FOR_SIGNOFF, whose link is blanked once sent — under every rule every email follows.
 *   ANSWERED Whoever holds the link answers: confirmed (their name and firm, ending Limited, LLP or plc, and for FILED the
 *            day the amended return was filed), or not confirmed with why. A FILED confirmation is written to the claim's
 *            reconciliation as its filing date, in the same transaction — recorded under the member of staff who sent
 *            the link, and logged as the accountant's answer.
 *   READ     The Reports gate reads a confirmed RETURN_FIT answered since the claim entered Reports
 *            (`accountantFitNeed`); closing a claim at the defence pack reads a confirmed FILED answer
 *            (`filingRecordedNeed` in src/web/claim-record.ts). The staff tick is retired; typing a filing date is
 *            refused where the accountant files. Where the client has no accountant (src/web/client-filing.ts), nothing
 *            here applies and that route is unchanged.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { authorise, type Actor } from '../authz.ts';
import { localDate, ukDate } from './localtime.ts';
// Read inside functions only: pipeline.ts reads this module's need the same way, so the loop is never touched at load.
import { raiseBusinessStage } from './pipeline.ts';

export type ConfirmKind = 'RETURN_FIT' | 'FILED';
export type ConfirmDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string; email: EmailTransport };
export type Result = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
type Need = { readonly what: string; readonly met: boolean; readonly why: string };

export const CONFIRM_LINK_DAYS = 30;
const FIRM = /^\S.*\s(?:limited|ltd\.?|llp|l\.l\.p\.|plc|p\.l\.c\.)$/i;
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** What each link asks, in the accountant's words. Where each may be sent from. */
export const CONFIRM_ASKS: Readonly<Record<ConfirmKind, { readonly ask: string; readonly stages: readonly string[]; readonly subject: string }>> = Object.freeze({
  RETURN_FIT: {
    ask: 'The claim fits the client’s tax return, and it can still go in inside the amendment window.',
    stages: ['REPORTS'],
    subject: 'Please confirm the claim fits the return',
  },
  FILED: {
    ask: 'The amended return carrying this claim has been filed.',
    stages: ['INVOICE', 'DEFENCE_PACK'],
    subject: 'Please confirm the amended return was filed',
  },
});

export const RETURN_FIT_NEED = 'The client’s accountant confirmed, through their own link, that the claim fits the return and the amendment window';

type ClaimRow = { id: string; business_id: string; stage: string | null; claim_ref: string; company: string };
function claimOf(db: Db, claim_id: string): ClaimRow | undefined {
  return db.get<ClaimRow>('SELECT c.id, c.business_id, c.stage, c.claim_ref, b.name AS company FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', [claim_id]);
}

/** The company's accountants and advisers with an email address (as the sign-off link reads them). */
export function accountantContacts(db: Db, business_id: string): { id: string; name: string; email: string }[] {
  return db.all<{ id: string; name: string; email: string }>(
    "SELECT id, full_name AS name, email FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT', 'ADVISER') " +
      "AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", [business_id]);
}

function emailBody(name: string, company: string, ref: string, kind: ConfirmKind, link: string, expires: string): string {
  return [
    `Dear ${name},`,
    '',
    `We are working with ${company} on their capital allowances claim (our reference ${ref}). You signed off its figures, or you look after their tax return.`,
    '',
    'Please tell us, for yourself, whether this is true:',
    CONFIRM_ASKS[kind].ask,
    '',
    kind === 'FILED' ? 'If it is, give us the day it was filed. If not, tell us why.' : 'If it is not, tell us why.',
    link,
    '',
    `The link is for you alone. It works once, until ${ukDate(localDate(expires))}.`,
    '',
    'Cap Rebate',
  ].join('\n');
}

/** Email one of the company's accountants a private link for one confirmation. */
export function sendConfirmRequest(
  d: ConfirmDeps, actor: Actor, claim_id: string, f: { kind: string; contact_id: string; origin: string },
): Result & { readonly requested?: boolean } {
  const c = claimOf(d.db, claim_id);
  if (c === undefined) return { ok: false, why: 'There is no such claim.' };
  authorise(actor, 'email.queue', { type: 'email', id: c.business_id, business_id: c.business_id });
  if (f.kind !== 'RETURN_FIT' && f.kind !== 'FILED') return { ok: false, field: 'kind', why: 'Choose what the accountant is asked to confirm.' };
  const kind: ConfirmKind = f.kind;
  if (!CONFIRM_ASKS[kind].stages.includes(c.stage ?? '')) {
    return { ok: false, why: kind === 'RETURN_FIT'
      ? 'The accountant confirms the claim fits the return while the claim is at Reports.'
      : 'The accountant confirms the filing once the reports are out: at Invoice or the defence pack.' };
  }
  const who = accountantContacts(d.db, c.business_id).find((a) => a.id === f.contact_id);
  if (who === undefined) return { ok: false, field: 'contact_id', why: 'Choose one of the company’s accountants or advisers with an email address. Add them as a contact first.' };
  const token = randomBytes(32).toString('base64url');
  const at = d.now();
  const expires = new Date(Date.parse(at) + CONFIRM_LINK_DAYS * 86_400_000).toISOString();
  return d.db.tx(() => {
    const sent = d.email.send({
      to_email: who.email.trim(), subject: `${CONFIRM_ASKS[kind].subject}: ${c.company}`,
      body: emailBody(who.name, c.company, c.claim_ref, kind, `${f.origin}/confirm/${token}`, expires),
      kind: 'REPORT_FOR_SIGNOFF', business_id: c.business_id, contact_id: who.id, written_by: actor.id, claim_id: c.id,
    });
    if (sent.id === null) return { ok: false as const, why: 'This company asked us not to contact them. Nothing was sent.' };
    const id = d.newId();
    d.db.run('INSERT INTO accountant_confirm_requests (id, claim_id, kind, contact_id, to_email, token_sha256, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, c.id, kind, who.id, who.email.trim(), sha(token), sent.id, actor.id, at, expires]);
    const requested = d.db.get<{ r: number }>('SELECT send_requested AS r FROM outbox WHERE id = ?', [sent.id])?.r === 1;
    d.audit.append({ at, kind: 'ACCOUNTANT_CONFIRM_SENT', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { request: id, confirm: kind, contact: who.id, sending: requested } });
    return { ok: true as const, id, requested };
  });
}

export type ConfirmLinkView =
  | { readonly state: 'NONE' }
  | { readonly state: 'EXPIRED' }
  | { readonly state: 'ANSWERED'; readonly outcome: 'CONFIRMED' | 'NOT_CONFIRMED'; readonly answered_at: string }
  | { readonly state: 'OPEN'; readonly request_id: string; readonly kind: ConfirmKind; readonly contact_name: string; readonly company: string;
      readonly claim_ref: string; readonly expires_at: string };

/** What a confirmation link opens, by the link alone. */
export function confirmLinkView(db: Db, now: string, token: string): ConfirmLinkView {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: 'NONE' };
  const r = db.get<{ id: string; kind: ConfirmKind; expires_at: string; name: string; company: string; claim_ref: string;
    outcome: 'CONFIRMED' | 'NOT_CONFIRMED' | null; answered_at: string | null }>(
    'SELECT r.id, r.kind, r.expires_at, k.full_name AS name, b.name AS company, c.claim_ref, x.outcome, x.answered_at ' +
      'FROM accountant_confirm_requests r JOIN contacts k ON k.id = r.contact_id JOIN claims c ON c.id = r.claim_id JOIN businesses b ON b.id = c.business_id ' +
      'LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', [sha(token)]);
  if (r === undefined) return { state: 'NONE' };
  if (r.outcome !== null) return { state: 'ANSWERED', outcome: r.outcome, answered_at: r.answered_at ?? '' };
  if (now >= r.expires_at) return { state: 'EXPIRED' };
  return { state: 'OPEN', request_id: r.id, kind: r.kind, contact_name: r.name, company: r.company, claim_ref: r.claim_ref, expires_at: r.expires_at };
}

/** The accountant's answer, once. A FILED confirmation becomes the claim's filing date. */
export function answerConfirmLink(
  d: Omit<ConfirmDeps, 'email'>, token: string,
  f: { outcome: string; name: string; firm: string; filed_on: string; reason: string; sure: string },
): Result & { readonly claim_id?: string } {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  const name = clean(f.name);
  if (name.length < 2 || name.length > 200) return { ok: false, field: 'name', why: 'Type your full name.' };
  const at = d.now();
  return d.db.tx((): Result & { readonly claim_id?: string } => {
    const v = confirmLinkView(d.db, at, token);
    if (v.state === 'NONE') return { ok: false, why: 'This link is not one of ours. Ask Cap Rebate for a new one.' };
    if (v.state === 'EXPIRED') return { ok: false, why: 'This link has run out. Ask Cap Rebate for a new one.' };
    if (v.state === 'ANSWERED') return { ok: false, why: 'This link has already been answered. Thank you.' };
    const req = d.db.get<{ claim_id: string; sent_by: string }>('SELECT claim_id, sent_by FROM accountant_confirm_requests WHERE id = ?', [v.request_id]);
    if (req === undefined) return { ok: false, why: 'This link is not one of ours. Ask Cap Rebate for a new one.' };
    let row: [string, string | null, string | null, string | null];
    if (f.outcome === 'CONFIRMED') {
      const firm = clean(f.firm);
      if (!FIRM.test(firm) || firm.length > 300) return { ok: false, field: 'firm', why: 'Type your firm’s registered name, ending Limited, LLP or plc.' };
      if (f.sure !== 'yes') return { ok: false, field: 'sure', why: 'Tick to say this is true.' };
      let filed: string | null = null;
      if (v.kind === 'FILED') {
        filed = /^\d{4}-\d{2}-\d{2}$/.test(f.filed_on.trim()) ? f.filed_on.trim() : null;
        if (filed === null || Number.isNaN(Date.parse(`${filed}T00:00:00Z`))) return { ok: false, field: 'filed_on', why: 'Give the day it was filed.' };
        if (filed > localDate(at)) return { ok: false, field: 'filed_on', why: 'A return cannot have been filed after today.' };
      }
      row = ['CONFIRMED', firm, filed, null];
    } else if (f.outcome === 'NOT_CONFIRMED') {
      const reason = f.reason.trim();
      if (reason === '' || reason.length > 2000) return { ok: false, field: 'reason', why: 'Say why, in under 2,000 characters.' };
      row = ['NOT_CONFIRMED', null, null, reason];
    } else {
      return { ok: false, why: 'Choose to confirm it, or to say it is not so.' };
    }
    const id = d.newId();
    d.db.run('INSERT INTO accountant_confirm_answers (id, request_id, outcome, signer_name, signer_firm, filed_on, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, v.request_id, row[0], name, row[1], row[2], row[3], at]);
    let wrote = false;
    if (row[0] === 'CONFIRMED' && row[2] !== null) {
      const r = d.db.get<{ id: string; filed_on: string | null }>('SELECT id, filed_on FROM claim_reconciliations WHERE claim_id = ?', [req.claim_id]);
      if (r !== undefined && r.filed_on === null) {
        d.db.run('UPDATE claim_reconciliations SET filed_on = ?, filed_recorded_by = ?, filed_recorded_at = ? WHERE id = ?', [row[2], req.sent_by, at, r.id]);
        wrote = true;
        // As a filing staff record does (src/web/claim-record.ts recordFiling): the client's "5 Claim filed" waited for it.
        const b = d.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [req.claim_id]);
        if (b !== undefined) raiseBusinessStage(d.db, b.business_id, at);
      }
    }
    d.audit.append({ at, kind: 'ACCOUNTANT_CONFIRM_ANSWERED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'claim', object_id: req.claim_id, detail: { request: v.request_id, answer: id, confirm: v.kind, outcome: row[0], filing_written: wrote } });
    return { ok: true, id, claim_id: req.claim_id };
  });
}

export type ConfirmRow = {
  readonly id: string; readonly kind: ConfirmKind; readonly contact_name: string; readonly to_email: string; readonly sent_by_name: string;
  readonly sent_at: string; readonly expires_at: string;
  readonly answer: null | { readonly outcome: 'CONFIRMED' | 'NOT_CONFIRMED'; readonly signer_name: string; readonly signer_firm: string | null;
    readonly filed_on: string | null; readonly reason: string | null; readonly answered_at: string };
};

/** Every confirmation link sent on the claim, newest first, with its answer. */
export function confirmRequestsOf(db: Db, claim_id: string): ConfirmRow[] {
  return db.all<{ id: string; kind: ConfirmKind; contact_name: string; to_email: string; sent_by_name: string; sent_at: string; expires_at: string;
    outcome: 'CONFIRMED' | 'NOT_CONFIRMED' | null; signer_name: string | null; signer_firm: string | null; filed_on: string | null; reason: string | null; answered_at: string | null }>(
    'SELECT r.id, r.kind, k.full_name AS contact_name, r.to_email, u.display_name AS sent_by_name, r.sent_at, r.expires_at, ' +
      'x.outcome, x.signer_name, x.signer_firm, x.filed_on, x.reason, x.answered_at FROM accountant_confirm_requests r ' +
      'JOIN contacts k ON k.id = r.contact_id JOIN users u ON u.id = r.sent_by LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id ' +
      'WHERE r.claim_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', [claim_id])
    .map((r) => ({ id: r.id, kind: r.kind, contact_name: r.contact_name, to_email: r.to_email, sent_by_name: r.sent_by_name, sent_at: r.sent_at, expires_at: r.expires_at,
      answer: r.outcome === null ? null : { outcome: r.outcome, signer_name: r.signer_name ?? '', signer_firm: r.signer_firm, filed_on: r.filed_on, reason: r.reason, answered_at: r.answered_at ?? '' } }));
}

/** The newest answer of a kind on the claim, answered on or after `since`. */
export function latestAnswer(db: Db, claim_id: string, kind: ConfirmKind, since = ''): ConfirmRow['answer'] | null {
  return confirmRequestsOf(db, claim_id).filter((r) => r.kind === kind && r.answer !== null && r.answer.answered_at >= since)
    .sort((a, b) => ((a.answer?.answered_at ?? '') < (b.answer?.answered_at ?? '') ? 1 : -1))[0]?.answer ?? null;
}

/** The Reports gate's need, on the accountant route: a confirmed RETURN_FIT answered since the claim entered Reports. */
export function accountantFitNeed(db: Db, claim_id: string, since: string): Need {
  const a = latestAnswer(db, claim_id, 'RETURN_FIT', since);
  if (a === null) {
    return { what: RETURN_FIT_NEED, met: false,
      why: 'the client’s accountant has not answered yet. Send them the link under “The accountant’s confirmations” on this page' };
  }
  return a.outcome === 'CONFIRMED'
    ? { what: RETURN_FIT_NEED, met: true, why: `confirmed by ${a.signer_name} of ${a.signer_firm ?? ''}, ${ukDate(localDate(a.answered_at))}` }
    : { what: RETURN_FIT_NEED, met: false, why: `${a.signer_name} said it does not: “${a.reason ?? ''}”` };
}
