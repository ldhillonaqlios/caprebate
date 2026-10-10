/**
 * THE SURVEY REPORT, AFTER THE SURVEYOR APPROVES: AN ADVISER SIGNS OFF, THEN THE CLIENT HAS IT. 2 October 2026.
 *
 * Lakhbir, asked how the report travels: "Adviser, then client"; our own adviser's sign-off "Staff record it, as today";
 * the client's accountant by "Email + private sign-off link". The claim's own rule stands: no figure reaches the client
 * before a tax adviser's sign-off is on record (src/web/stages.ts, TAX_ADVISER_SIGNOFF).
 *
 *   SENT FOR SIGN-OFF   Admin or Sales (`email.queue`) emails an approved version to one of the company's accountants or
 *                       advisers (a contact of that type, with an email address), saying how the client gave their
 *                       permission. The email carries the PDF and a private link: 32 random bytes, of which only the
 *                       SHA-256 is kept. The link works for 30 days, and is answered once. Sending follows the same rules
 *                       as every email: the switch, the test website only (src/connectors/place.ts), never to an invented
 *                       address or a company that asked not to be contacted; once sent, the link leaves the outbox.
 *   ANSWERED            Whoever holds the link reads the report and either signs off (their name, their firm — a name
 *                       ending Limited, LLP or plc, as the claim's sign-off requires — and the title they sign under,
 *                       with a tick that they have read it), or sends it back with a reason. Once.
 *   RECORDED            A signed answer is put on the claim as the tax adviser's sign-off by Admin or Sales, through the
 *                       claim's own `recordSignOff` — its rules unchanged (the claim must be with the tax adviser) — so
 *                       the claim's gates read it exactly as before. Our own adviser's sign-off is recorded there as
 *                       today. The figure is the approved version's.
 *   RELEASED            The client sees a version in their portal only once a sign-off FOR THAT VERSION'S FIGURE is on
 *                       the claim, recorded after the version was approved, and only while its fingerprint holds.
 *   TOLD                Admin or Sales sends the client a portal message saying it is there (which emails them, where
 *                       sending is on) — once a version.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { packJob } from './surveyor.ts';
import { approvedVersion, type ApprovalRow, type Snapshot } from './pack-approve.ts';
import { reportModel, reportPdf, longDate, REPORT_TITLE } from './survey-report.ts';
import { freezeReturnContext, returnContext, returnContextFor, returnEntriesCsv } from './return-entries.ts';
import { voidLine } from './valuation-lock.ts';
import { recordSignOff } from './claim-record.ts';
import { postClientMessage } from './messages.ts';
import { localDate } from './localtime.ts';
import { poundsWords } from './pack-sums.ts';

export type SignoffDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string; email: EmailTransport };
export type Result = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

export const LINK_DAYS = 30;
/** A firm's registered name: at least one word, then Limited, Ltd, LLP or plc. "Limited" alone names nobody. */
const FIRM = /^\S.*\s(?:limited|ltd\.?|llp|l\.l\.p\.|plc|p\.l\.c\.)$/i;

export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** The company's accountants and advisers who can be emailed. */
export type Accountant = { readonly id: string; readonly name: string; readonly email: string; readonly type: string };
export function accountantsOf(db: Db, business_id: string): Accountant[] {
  return db.all<Accountant>(
    "SELECT id, full_name AS name, email, contact_type AS type FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT', 'ADVISER') " +
      "AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", [business_id]);
}

export type RequestRow = {
  readonly id: string; readonly approval_id: string; readonly version: number; readonly contact_name: string; readonly to_email: string;
  readonly permission_note: string; readonly sent_by_name: string; readonly sent_at: string; readonly expires_at: string;
  readonly sent: boolean; readonly send_error: string | null;
  readonly answer: null | { readonly id: string; readonly outcome: 'SIGNED' | 'SENT_BACK'; readonly signer_name: string; readonly signer_firm: string | null;
    readonly signer_credential: string | null; readonly reason: string | null; readonly answered_at: string; readonly recorded_signoff: string | null };
};

/** Every sign-off request for a job's pack, newest first, with its answer and whether that is on the claim. */
export function requestsOf(db: Db, job_id: string): RequestRow[] {
  type Raw = Omit<RequestRow, 'answer' | 'sent'> & { sent_at_outbox: string | null; a_id: string | null; outcome: 'SIGNED' | 'SENT_BACK' | null; signer_name: string | null;
    signer_firm: string | null; signer_credential: string | null; reason: string | null; answered_at: string | null; recorded_signoff: string | null };
  return db.all<Raw>(
    'SELECT r.id, r.approval_id, a.version, c.full_name AS contact_name, r.to_email, r.permission_note, u.display_name AS sent_by_name, r.sent_at, r.expires_at, ' +
      'o.sent_at AS sent_at_outbox, o.last_error AS send_error, x.id AS a_id, x.outcome, x.signer_name, x.signer_firm, x.signer_credential, x.reason, x.answered_at, ' +
      'k.signoff_id AS recorded_signoff ' +
      'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN survey_packs p ON p.id = a.pack_id ' +
      'JOIN contacts c ON c.id = r.contact_id JOIN users u ON u.id = r.sent_by JOIN outbox o ON o.id = r.outbox_id ' +
      'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id LEFT JOIN pack_signoff_recorded k ON k.answer_id = x.id ' +
      'WHERE p.job_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', [job_id],
  ).map((r) => ({
    id: r.id, approval_id: r.approval_id, version: r.version, contact_name: r.contact_name, to_email: r.to_email, permission_note: r.permission_note,
    sent_by_name: r.sent_by_name, sent_at: r.sent_at, expires_at: r.expires_at, sent: r.sent_at_outbox !== null, send_error: r.send_error,
    answer: r.a_id === null || r.outcome === null ? null : {
      id: r.a_id, outcome: r.outcome, signer_name: r.signer_name ?? '', signer_firm: r.signer_firm, signer_credential: r.signer_credential,
      reason: r.reason, answered_at: r.answered_at ?? '', recorded_signoff: r.recorded_signoff,
    },
  }));
}

function emailBody(name: string, company: string, s: Snapshot, link: string, expires: string): string {
  return [
    `Dear ${name},`,
    '',
    `${company} has asked us to send you their ${REPORT_TITLE.toLowerCase()}. It is version ${String(s.version)}, approved on ${longDate(s.approved_at)} by ${s.surveyor.name} (RICS no. ${s.surveyor.rics_number}). The PDF is attached.`,
    '',
    `It finds ${poundsWords(s.sums.qualifying_pence)} of spend that qualifies: ${poundsWords(s.sums.main_pool_pence)} in the main pool and ${poundsWords(s.sums.special_pool_pence)} in the special rate pool.`,
    '',
    'Please read it, then sign off the figures, or send it back with your reason, here:',
    link,
    '',
    `The link is for you alone. It works once, until ${longDate(expires)}. Nothing is shown to the client as claimable until a tax adviser has signed off.`,
    '',
    'Cap Rebate',
  ].join('\n');
}

/** Email an approved version to the company's accountant, with the PDF and a private sign-off link. */
export function sendForSignoff(
  d: SignoffDeps, actor: Actor, job_id: string, version: number, f: { contact_id: string; permission: string; origin: string },
): Result & { readonly requested?: boolean } {
  const { job } = packJob(d.db, actor, job_id);
  authorise(actor, 'email.queue', { type: 'email', id: job.business_id, business_id: job.business_id });
  const kept = approvedVersion(d, actor, job_id, version);
  if (kept === null) return { ok: false, why: 'This pack has no approved version with that number.' };
  if (!kept.fingerprint_holds) return { ok: false, why: 'This version’s fingerprint does not match what was approved. Nothing was sent. Tell the office.' };
  const who = accountantsOf(d.db, job.business_id).find((a) => a.id === f.contact_id);
  if (who === undefined) return { ok: false, field: 'contact_id', why: 'Choose one of the company’s accountants or advisers with an email address. Add them as a contact first.' };
  const permission = f.permission.trim().replace(/\s+/g, ' ');
  if (permission === '') return { ok: false, field: 'permission', why: 'Say how the client gave permission to send it to their accountant. For example: by email on 2 October.' };
  if (permission.length > 500) return { ok: false, field: 'permission', why: 'Keep how the client gave permission under 500 characters.' };
  const token = randomBytes(32).toString('base64url');
  const at = d.now();
  const expires = new Date(Date.parse(at) + LINK_DAYS * 86_400_000).toISOString();
  const pdf = reportPdf(reportModel(kept.snapshot, kept.row.fingerprint, returnContextFor(d.db, kept.row.id, job.claim_id, job.business_id)));
  return d.db.tx(() => {
    // PHASE 153b (Word question 121): the return entries for each year, as a spreadsheet, beside the PDF. PHASE 159a
    // (C29): the facts it is made from are kept with the version the first time it is sent, and read from then on.
    const csv = returnEntriesCsv(kept.snapshot, freezeReturnContext(d.db, kept.row.id, returnContext(d.db, job.claim_id, job.business_id), 'SENT_FOR_SIGNOFF', at), kept.row.fingerprint);
    const sent = d.email.send({
      to_email: who.email.trim(), subject: `Survey report to sign off: ${job.business_name}`,
      body: emailBody(who.name, job.business_name, kept.snapshot, `${f.origin}/signoff/${token}`, expires),
      kind: 'REPORT_FOR_SIGNOFF', business_id: job.business_id, contact_id: who.id, written_by: actor.id, claim_id: job.claim_id,
      inline_files: [{ filename: `survey-report-version-${String(version)}.pdf`, content_type: 'application/pdf', bytes: pdf.bytes },
        { filename: `return-entries-version-${String(version)}.csv`, content_type: 'text/csv; charset=utf-8', bytes: new TextEncoder().encode(csv) }],
    });
    if (sent.id === null) return { ok: false as const, why: 'This company asked us not to contact them. Nothing was sent.' };
    const id = d.newId();
    d.db.run('INSERT INTO pack_signoff_requests (id, approval_id, contact_id, to_email, token_sha256, permission_note, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, kept.row.id, who.id, who.email.trim(), hashToken(token), permission, sent.id, actor.id, at, expires]);
    const requested = d.db.get<{ r: number }>('SELECT send_requested AS r FROM outbox WHERE id = ?', [sent.id])?.r === 1;
    d.audit.append({ at, kind: 'REPORT_SENT_FOR_SIGNOFF', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'surveyor_job', object_id: job_id, detail: { request: id, version, contact: who.id, sending: requested } });
    return { ok: true as const, id, requested };
  });
}

/* ================================================================== *
 * THE LINK
 * ================================================================== */

export type LinkView =
  | { readonly state: 'NONE' }
  | { readonly state: 'EXPIRED' }
  | { readonly state: 'ANSWERED'; readonly outcome: 'SIGNED' | 'SENT_BACK'; readonly answered_at: string }
  | { readonly state: 'OPEN'; readonly request_id: string; readonly contact_name: string; readonly company: string; readonly snapshot: Snapshot;
      readonly fingerprint: string; readonly fingerprint_holds: boolean; readonly expires_at: string;
      /** Phase 159a: the approved version the link is for. */
      readonly approval_id: string;
      /** Phase 153b: the job's claim and business, for the return-entries spreadsheet. */
      readonly claim_id: string | null; readonly business_id: string };

/** What a sign-off link opens, by the link alone. Unknown, used and out-of-date links are told apart only in words. */
export function linkView(db: Db, now: string, token: string): LinkView {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: 'NONE' };
  const r = db.get<{ id: string; expires_at: string; name: string; company: string; snapshot_json: string; fingerprint: string;
    outcome: 'SIGNED' | 'SENT_BACK' | null; answered_at: string | null; claim_id: string | null; business_id: string; approval_id: string }>(
    'SELECT r.id, r.approval_id, r.expires_at, c.full_name AS name, b.name AS company, a.snapshot_json, a.fingerprint, x.outcome, x.answered_at, j.claim_id, j.business_id ' +
      'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN contacts c ON c.id = r.contact_id ' +
      'JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN businesses b ON b.id = j.business_id ' +
      'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', [hashToken(token)]);
  if (r === undefined) return { state: 'NONE' };
  if (r.outcome !== null) return { state: 'ANSWERED', outcome: r.outcome, answered_at: r.answered_at ?? '' };
  if (now >= r.expires_at) return { state: 'EXPIRED' };
  return { state: 'OPEN', request_id: r.id, contact_name: r.name, company: r.company, snapshot: JSON.parse(r.snapshot_json) as Snapshot,
    fingerprint: r.fingerprint, fingerprint_holds: createHash('sha256').update(r.snapshot_json, 'utf8').digest('hex') === r.fingerprint, expires_at: r.expires_at,
    claim_id: r.claim_id, business_id: r.business_id, approval_id: r.approval_id };
}

/** The accountant's answer, once: signed, or sent back with a reason. */
export function answerLink(
  d: Omit<SignoffDeps, 'email'>, token: string,
  f: { outcome: string; name: string; firm: string; credential: string; reason: string; read: string },
): Result {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  const name = clean(f.name);
  if (name.length < 2 || name.length > 200) return { ok: false, field: 'name', why: 'Type your full name.' };
  const at = d.now();
  return d.db.tx((): Result => {
    const v = linkView(d.db, at, token);
    if (v.state === 'NONE') return { ok: false, why: 'This link is not one of ours. Ask Cap Rebate for a new one.' };
    if (v.state === 'EXPIRED') return { ok: false, why: 'This link has run out. Ask Cap Rebate for a new one.' };
    if (v.state === 'ANSWERED') return { ok: false, why: 'This link has already been answered. Thank you.' };
    if (!v.fingerprint_holds) return { ok: false, why: 'This report does not match what the surveyor approved, so it cannot be signed off. Tell Cap Rebate.' };
    let row: [string, string | null, string | null, string | null];
    if (f.outcome === 'SIGNED') {
      const firm = clean(f.firm);
      const credential = clean(f.credential);
      if (!FIRM.test(firm) || firm.length > 300) return { ok: false, field: 'firm', why: 'Type your firm’s registered name, ending Limited, LLP or plc.' };
      if (credential.length < 2 || credential.length > 300) return { ok: false, field: 'credential', why: 'Type the title you sign under. For example: Chartered Accountant.' };
      if (f.read !== 'yes') return { ok: false, field: 'read', why: 'Tick to say you have read the report and sign off its figures.' };
      row = ['SIGNED', firm, credential, null];
    } else if (f.outcome === 'SENT_BACK') {
      const reason = f.reason.trim();
      if (reason === '' || reason.length > 2000) return { ok: false, field: 'reason', why: 'Say why you are sending it back, in under 2,000 characters.' };
      row = ['SENT_BACK', null, null, reason];
    } else {
      return { ok: false, why: 'Choose to sign off, or to send it back.' };
    }
    const id = d.newId();
    d.db.run('INSERT INTO pack_signoff_answers (id, request_id, outcome, signer_name, signer_firm, signer_credential, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, v.request_id, row[0], name, row[1], row[2], row[3], at]);
    d.audit.append({ at, kind: 'REPORT_SIGNOFF_ANSWERED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'pack_signoff_request', object_id: v.request_id, detail: { answer: id, outcome: row[0] } });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * ON THE CLAIM, AND TO THE CLIENT
 * ================================================================== */

function pounds(pence: number): string {
  return `${String(Math.floor(pence / 100))}.${String(pence % 100).padStart(2, '0')}`;
}

/** A signed answer put on the claim as the tax adviser's sign-off, through the claim's own rules. Once. */
export function recordAnswer(d: Omit<SignoffDeps, 'email'>, actor: Actor, job_id: string, answer_id: string): Result {
  const { job } = packJob(d.db, actor, job_id);
  const a = requestsOf(d.db, job_id).find((r) => r.answer?.id === answer_id);
  if (a === undefined || a.answer === null) return { ok: false, why: 'That answer is not one of this pack’s.' };
  if (a.answer.outcome !== 'SIGNED') return { ok: false, why: 'That answer sent the report back, so there is nothing to record.' };
  if (a.answer.recorded_signoff !== null) return { ok: false, why: 'That sign-off is already on the claim.' };
  if (job.claim_id === null) return { ok: false, why: 'This survey job is not on a claim, so there is nowhere to record it.' };
  const kept = approvedVersion(d, actor, job_id, a.version);
  if (kept === null || !kept.fingerprint_holds) return { ok: false, why: 'The approved version does not match its fingerprint. Tell the office.' };
  const s = kept.snapshot;
  const ans = a.answer;
  return d.db.tx((): Result => {
    const r = recordSignOff(d, actor, job.claim_id as string, {
      adviser: ans.signer_firm, credential: ans.signer_credential, signed_on: localDate(ans.answered_at),
      scope: `The ${REPORT_TITLE.toLowerCase()}, version ${String(s.version)} (fingerprint ${kept.row.fingerprint}): the spend that qualifies, its two pools and the share of the building.`,
      method_note: `Signed off by ${ans.signer_name} of ${ans.signer_firm ?? ''} through Cap Rebate’s private sign-off link on ${longDate(ans.answered_at)}, after reading the report.`,
      figure: pounds(s.sums.qualifying_pence ?? 0), confirmed_switches: '',
      // PHASE 159a (C4): the sign-off names this version, and is refused if the surveyor has approved a newer one.
      approval_id: kept.row.id,
    });
    if (!r.ok) return r;
    d.db.run('INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', [ans.id, r.id, actor.id, d.now()]);
    return { ok: true, id: r.id };
  });
}

/**
 * The version the client may see: the newest approved version of any of their survey packs for which a sign-off
 * NAMING THAT VERSION is on the claim (PHASE 159a, C4: never one matched by its total), recorded since the valuation was
 * last reopened (src/web/valuation-lock.ts) — and only while its fingerprint holds.
 */
export function releasedVersion(db: Db, business_id: string): { row: ApprovalRow & { job_id: string; claim_id: string }; snapshot: Snapshot } | null {
  const rows = db.all<ApprovalRow & { job_id: string; claim_id: string; snapshot_json: string }>(
    'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json, j.id AS job_id, j.claim_id ' +
      'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN users u ON u.id = a.approved_by ' +
      'WHERE j.business_id = ? AND j.claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
      "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')) " +
      'ORDER BY a.approved_at DESC, a.version DESC', [business_id]);
  for (const r of rows) {
    const since = voidLine(db, r.claim_id);
    if (since !== null && db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tax_adviser_signoffs WHERE approval_id = ? AND recorded_at >= ?', [r.id, since])?.n === 0) continue;
    if (createHash('sha256').update(r.snapshot_json, 'utf8').digest('hex') !== r.fingerprint) continue;
    const { snapshot_json, ...row } = r;
    return { row, snapshot: JSON.parse(snapshot_json) as Snapshot };
  }
  return null;
}

export function toldOf(db: Db, approval_id: string): { told_at: string; told_by_name: string } | null {
  return db.get<{ told_at: string; told_by_name: string }>(
    'SELECT n.told_at, u.display_name AS told_by_name FROM pack_client_notices n JOIN users u ON u.id = n.told_by WHERE n.approval_id = ?', [approval_id]) ?? null;
}

export const TELL_CLIENT_WORDS = 'Your capital allowances survey report is ready. Your surveyor approved it, and a tax adviser has signed off its figures. ' +
  'Open “Your survey report” on your portal home to read it or download the PDF.';

/** Tell the client, by a portal message, that their report is there. Only the released version, once. */
export function tellClient(d: Omit<SignoffDeps, 'email'>, actor: Actor, job_id: string, version: number): Result {
  const { job } = packJob(d.db, actor, job_id);
  const released = releasedVersion(d.db, job.business_id);
  if (released === null || released.row.job_id !== job_id || released.row.version !== version) {
    return { ok: false, why: 'The client cannot see this version yet. A tax adviser’s sign-off for its figure must be on the claim first.' };
  }
  if (toldOf(d.db, released.row.id) !== null) return { ok: false, why: 'The client has already been told about this version.' };
  return d.db.tx((): Result => {
    const m = postClientMessage(d, actor, job.business_id, { body: TELL_CLIENT_WORDS, claim_id: released.row.claim_id });
    if (!m.ok) return m;
    d.db.run('INSERT INTO pack_client_notices (approval_id, message_id, told_by, told_at) VALUES (?, ?, ?, ?)', [released.row.id, m.id, actor.id, d.now()]);
    return { ok: true, id: m.id };
  });
}
