/**
 * THE ONLINE IDENTITY CHECK, WIRED IN — SENDING ONE, AND RECEIVING THE SIGNED RESULT. Phase 151b, 25 September 2026.
 *
 * WHAT WAS DECIDED. Lakhbir chose Veriff (Word question 225, closed 24 September 2026), and on 25 September 2026 switched
 * to Didit, which is free for 500 checks a month (Phase 151f; the reasons are in the connector). Identity is checked whether or
 * not money-laundering supervision applies (Word question 10, recorded 24 September 2026, Lakhbir in chat: "we still
 * check for identity"), so NOTHING HERE READS AML_IN_SCOPE: a check can be sent for any client, from the client's own
 * record or from an open customer due diligence check.
 *
 * THE CONNECTOR IS src/connectors/identity-check.ts (Phase 151), and it decides whether anything leaves this server:
 * `startIdentityCheck` refuses before any call while `identityCheckMissing` lists anything — the service named in the
 * privacy notice and in clause 7 of the engagement letter, its three entries in the key file, and the IDENTITY_CHECK switch,
 * which ships false. OFF, A PERSON WHO PRESSES "SEND" IS TOLD, IN WORDS, WHAT IS STILL MISSING, AND NOTHING IS SENT.
 * This file adds no second switch and no second gate.
 *
 *   sendIdentityCheck      compliance.write only (Admin today). The contact being checked must be a contact of the
 *                          organisation; a due diligence check it is sent from must be that organisation's and open.
 *                          The first and last name go to the service in the call and nowhere else — not in a row, not
 *                          in the audit log. What is kept is migration 047's identity_checks row: whose check, from
 *                          where, the service's session id and the link the client follows, who sent it and when.
 *   receiveIdentityResult  the route the service calls, POST /hooks/identity-check, with no login (the service has
 *                          none; the address is set in Didit's console). The body is believed only when a signature
 *                          holds and it is under five minutes old (`readIdentityDecision`): A BAD OR MISSING SIGNATURE,
 *                          OR A STALE ONE, IS REFUSED, AUDITED AS IDENTITY_RESULT_REFUSED, AND NOTHING IS WRITTEN. A
 *                          signed word that the check is still under way, or about something other than a check's
 *                          status, is acknowledged and not kept (IDENTITY_RESULT_NOT_KEPT): it is not a result.
 *                          So is a signed result for a session we never sent. A result that holds is kept as OUR OWN
 *                          COPY (identity_check_results, append-only: the decision's fields, the SHA-256 of the exact
 *                          body, never a name, a document number or an image — `identityResultCopy`), because the
 *                          service keeps its copy for a short time only and the money-laundering rules ask a firm to
 *                          keep its evidence for five years.
 *   A PASS IS EVIDENCE OF HOW IDENTITY WAS VERIFIED. When the latest result on a check sent from an OPEN due diligence
 *                          check is PASS and that check's "How it was verified" is still empty, it is filled in with a
 *                          dated sentence naming the service, and CDD_CHECK_UPDATED says so. A person still finishes
 *                          the check (`completeCheck`), as before; a PASS never finishes anything on its own.
 *
 * N4. An unknown status is REFER, never PASS (the connector). A check with no result yet reads "no result yet" — never
 * as a pass and never as a failure.
 */

import { createHash } from 'node:crypto';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { can } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { localWhen } from './localtime.ts';
import { assertComplianceRead, assertComplianceWrite, complianceObj, record, type ComplianceDeps } from './compliance.ts';
import { isReachable } from './crm.ts';
import {
  IDENTITY_CHECK, IDENTITY_PROVIDER_NAME, identityCheckMissing, identityResultCopy, identityTestingWarning, readIdentityDecision,
  sentUnderTestingWaiver, startIdentityCheck, type IdentityCheckConfig, type IdentityOutcome, type IdentitySignature,
} from '../connectors/identity-check.ts';

/** Where the service sends its result: set as the webhook address in Didit's console. Mounted in src/web/router.ts, outside the login. */
export const IDENTITY_HOOK_PATH = '/hooks/identity-check';
/** The headers the service signs its result with (Didit's own names for them), as Node lower-cases them. */
export const IDENTITY_SIGNATURE_HEADERS = Object.freeze({ v2: 'x-signature-v2', raw: 'x-signature', timestamp: 'x-timestamp' } as const);
/** A result is a small JSON body. Anything larger is refused before it is read. */
export const IDENTITY_HOOK_MAX_BYTES = 64 * 1024;

export type IdentityDeps = { readonly app: App; readonly newId: () => string };

export const OUTCOME_WORDS: Readonly<Record<IdentityOutcome, string>> = Object.freeze({
  PASS: 'Passed',
  FAIL: 'Failed',
  REFER: 'A person must look at it',
  NOT_COMPLETED: 'The client did not finish it',
});

/** Whether a check can be sent today, and if not, what is missing — the connector's own list, in its own words. */
export function identityCheckReadiness(app: App, config: IdentityCheckConfig = IDENTITY_CHECK): { readonly on: boolean; readonly missing: readonly string[] } {
  const missing = identityCheckMissing(config, app.secrets);
  return { on: missing.length === 0, missing };
}

export type SendInput = {
  readonly business_id: string;
  readonly contact_id: string;
  readonly cdd_check_id: string | null;
  readonly first_name: string;
  readonly last_name: string;
};
export type SendResult = { readonly ok: true; readonly id: string; readonly link: string } | { readonly ok: false; readonly why: string };

/**
 * Send one identity check. compliance.write only. OFF AS SHIPPED: the connector refuses before any call, and the person
 * is told what is missing. `opts` is for tests only — a configuration switched on.
 */
export async function sendIdentityCheck(
  d: IdentityDeps, actor: Actor, input: SendInput, opts: { readonly config?: IdentityCheckConfig } = {},
): Promise<SendResult> {
  assertComplianceWrite(actor);
  const db = d.app.db;
  const cd: ComplianceDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const business = db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [input.business_id]);
  if (business === undefined) return { ok: false, why: 'Choose the organisation.' };
  const contact = db.get<{ id: string; email: string | null; phone: string | null }>(
    'SELECT id, email, phone FROM contacts WHERE id = ? AND business_id = ?', [input.contact_id, input.business_id]);
  if (contact === undefined) return { ok: false, why: 'Choose the person to be checked. They must be a contact of this organisation.' };
  // PHASE 151e (line 6): we send the link to the person, so we must be able to reach them (Lakhbir, 28 Sep 2026)
  if (!isReachable(contact)) return { ok: false, why: UNREACHABLE_CONTACT_WORDS };
  if (input.cdd_check_id !== null) {
    const c = db.get<{ state: string }>('SELECT state FROM cdd_checks WHERE id = ? AND business_id = ?', [input.cdd_check_id, input.business_id]);
    if (c === undefined) return { ok: false, why: 'That due diligence check is not one of this organisation’s.' };
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'That due diligence check is finished or withdrawn. Send it from the client’s page instead.' };
  }
  const id = d.newId();
  const out = await startIdentityCheck({
    first_name: input.first_name, last_name: input.last_name, check_ref: id,
    actor_id: actor.id, actor_role: actor.role,
    deps: { audit: d.app.audit, now: d.app.now, transport: d.app.outside },
    secrets: d.app.secrets,
    ...(opts.config === undefined ? {} : { config: opts.config }),
  });
  if (out.state === 'NOT_SENT') {
    record(cd, actor, 'IDENTITY_CHECK_NOT_SENT', 'REFUSED', 'business', input.business_id, { contact: input.contact_id, cdd_check: input.cdd_check_id, why: out.why });
    return { ok: false, why: `Not sent. ${out.why}` };
  }
  db.run(
    'INSERT INTO identity_checks (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.business_id, input.contact_id, input.cdd_check_id, 'DIDIT', out.session_id, out.link, actor.id, d.app.now()]);
  record(cd, actor, 'IDENTITY_CHECK_SENT', 'ALLOWED', 'identity_check', id, {
    business: input.business_id, contact: input.contact_id, cdd_check: input.cdd_check_id,
    // Phase 151h: a check sent before the papers name the service says so, in the row that records it
    ...(sentUnderTestingWaiver(opts.config ?? IDENTITY_CHECK) ? { papers_waived_for_testing: true } : {}),
  });
  return { ok: true, id, link: out.link };
}

/**
 * PHASE 151e (line 4), 27 September 2026 — SAYING SO, WHEN THIS SERVER FORGETS.
 *
 * On a database in memory (the test website until it is given a lasting one, and the demo), a check is kept only by the
 * copy of the server that sent it. A restart forgets it, and on Vercel a second copy never saw it. A result that arrives
 * at such a copy finds no check and is REFUSED, exactly as before: it is never matched to the nearest. These words say
 * that, and what to do. They come from `app.db.kind`, the server's own knowledge of its database, and from nothing a
 * page or a request can set. On a file or a remote database they are null and nothing is shown.
 */
export const FORGETFUL_DATABASE_WORDS =
  'This website keeps its records in memory only. It forgets them when it restarts, and more than one copy of it can run at once. ' +
  'So a result can reach a copy that never saw the check. That copy turns the result away, and it does not show here. ' +
  'If no result shows a few minutes after the person has finished, send the check again.';
/** Said with a refused result when this server keeps its records in memory: in the audit log and in the answer to the service. */
export const FORGOTTEN_CHECK_WORDS =
  'This server keeps its records in memory only. The check may have been sent from a copy that has forgotten it. Send the check again.';

export function forgetfulDatabaseWarning(app: App): string | null {
  return app.db.kind === 'memory' ? FORGETFUL_DATABASE_WORDS : null;
}

export type ReceiveResult = { readonly status: 200 | 401 | 404; readonly outcome: IdentityOutcome | null; readonly note?: string };

/**
 * One result from the service. Believed only when a signature holds and it is fresh; refused and audited otherwise,
 * with nothing written. A signed result for a session we never sent is refused the same way. A signed word that the
 * check is still under way, or about something else, is acknowledged and not kept. The row it writes is our copy.
 */
export function receiveIdentityResult(app: App, newId: () => string, rawBody: string, sig: IdentitySignature): ReceiveResult {
  const cd: ComplianceDeps = { db: app.db, audit: app.audit, now: app.now, newId };
  const read = readIdentityDecision(rawBody, sig, app.secrets, Date.parse(app.now()));
  if (read.state === 'REFUSED') {
    record(cd, null, 'IDENTITY_RESULT_REFUSED', 'REFUSED', 'identity_check', 'unknown', { why: read.why });
    return { status: 401, outcome: null };
  }
  if (read.state === 'IGNORED') {
    record(cd, null, 'IDENTITY_RESULT_NOT_KEPT', 'ALLOWED', 'identity_check', 'unknown', { why: read.why });
    return { status: 200, outcome: null };
  }
  if (read.state === 'UNDER_WAY') {
    const known = app.db.get<{ id: string }>('SELECT id FROM identity_checks WHERE session_id = ?', [read.session_id]);
    if (known === undefined) return noCheckToMatch(app, cd);
    record(cd, null, 'IDENTITY_RESULT_NOT_KEPT', 'ALLOWED', 'identity_check', known.id, { why: 'the check is still under way', status: read.status });
    return { status: 200, outcome: null };
  }
  const check = app.db.get<{ id: string; business_id: string; cdd_check_id: string | null }>(
    'SELECT id, business_id, cdd_check_id FROM identity_checks WHERE session_id = ?', [read.session_id]);
  if (check === undefined || (read.check_ref !== null && read.check_ref !== check.id)) return noCheckToMatch(app, cd);
  const at = app.now();
  app.db.run(
    'INSERT INTO identity_check_results (id, identity_check_id, outcome, provider_status, decided_at, received_at, body_sha256, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), check.id, read.outcome, read.status.slice(0, 80), read.decided_at, at,
      createHash('sha256').update(rawBody, 'utf8').digest('hex'), JSON.stringify(identityResultCopy(rawBody))]);
  record(cd, null, 'IDENTITY_RESULT_RECEIVED', 'ALLOWED', 'identity_check', check.id, { business: check.business_id, outcome: read.outcome, status: read.status });
  if (read.outcome === 'PASS' && check.cdd_check_id !== null) recordPassAsEvidence(cd, check.cdd_check_id, (read.decided_at ?? at).slice(0, 10));
  return { status: 200, outcome: read.outcome };
}

/**
 * A signed result that names no check we sent: REFUSED, AUDITED, NOTHING WRITTEN, and never matched to the nearest check.
 * On a database in memory the refusal also says why that may be, and what to do (Phase 151e, line 4).
 */
function noCheckToMatch(app: App, cd: ComplianceDeps): ReceiveResult {
  const forgetful = forgetfulDatabaseWarning(app) !== null;
  record(cd, null, 'IDENTITY_RESULT_REFUSED', 'REFUSED', 'identity_check', 'unknown', {
    why: 'the result names no check we sent',
    ...(forgetful ? { database: 'in memory', what_to_do: FORGOTTEN_CHECK_WORDS } : {}),
  });
  return { status: 404, outcome: null, ...(forgetful ? { note: FORGOTTEN_CHECK_WORDS } : {}) };
}

/** The sentence a PASS writes into an open check's "How it was verified", when that is still empty. */
export function passEvidenceSentence(day: string): string {
  return `Online identity check with ${IDENTITY_PROVIDER_NAME}: passed on ${day}. Our copy of the result is kept with the check.`;
}

function recordPassAsEvidence(cd: ComplianceDeps, cdd_check_id: string, day: string): void {
  const c = cd.db.get<{ state: string; verification_method: string | null }>('SELECT state, verification_method FROM cdd_checks WHERE id = ?', [cdd_check_id]);
  if (c === undefined || c.state !== 'IN_PROGRESS' || c.verification_method !== null) return;
  cd.db.run('UPDATE cdd_checks SET verification_method = ?, updated_at = ? WHERE id = ?', [passEvidenceSentence(day), cd.now(), cdd_check_id]);
  record(cd, null, 'CDD_CHECK_UPDATED', 'ALLOWED', 'cdd_check', cdd_check_id, { fields: ['verification_method'], because: 'IDENTITY_CHECK_PASSED' });
}

/** Whether a due diligence check has an identity check whose latest result is a PASS. */
export function identityPassed(db: App['db'], cdd_check_id: string): boolean {
  return identityChecks(db, { cdd_check_id }).some((c) => c.outcome === 'PASS');
}

export type IdentityCheckLine = {
  readonly id: string; readonly contact: string; readonly sent: string; readonly sent_at: string; readonly link: string;
  readonly outcome: IdentityOutcome | null; readonly outcome_words: string; readonly result_at: string | null; readonly from_cdd: string | null;
};

/** The checks sent for an organisation or from one due diligence check, each with its LATEST result — read, not stored. */
export function identityChecks(db: App['db'], where: { readonly business_id?: string; readonly cdd_check_id?: string }): IdentityCheckLine[] {
  const rows = where.cdd_check_id !== undefined
    ? db.all<{ id: string; contact: string; sent_at: string; link: string; cdd_check_id: string | null; who: string | null }>(
      'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
        'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.cdd_check_id = ? ORDER BY i.sent_at DESC', [where.cdd_check_id])
    : db.all<{ id: string; contact: string; sent_at: string; link: string; cdd_check_id: string | null; who: string | null }>(
      'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
        'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.business_id = ? ORDER BY i.sent_at DESC', [where.business_id ?? '']);
  return rows.map((r) => {
    const latest = db.get<{ outcome: IdentityOutcome; received_at: string }>(
      'SELECT outcome, received_at FROM identity_check_results WHERE identity_check_id = ? ORDER BY received_at DESC, rowid DESC LIMIT 1', [r.id]);
    return {
      id: r.id, contact: r.contact, sent_at: r.sent_at, sent: `${localWhen(r.sent_at)} by ${r.who ?? 'a former user'}`, link: r.link,
      outcome: latest?.outcome ?? null, outcome_words: latest === undefined ? 'No result yet' : OUTCOME_WORDS[latest.outcome],
      result_at: latest?.received_at ?? null, from_cdd: r.cdd_check_id,
    };
  });
}

/**
 * PHASE 151e (line 5), 27 September 2026: a client with no contacts showed no form and said nothing, so nobody could tell
 * how to send a check (Lakhbir, 25 September 2026). A check goes only to a contact of the client, so the panel says so,
 * with a link to the form that adds one.
 */
export const NO_CONTACTS_WORDS = 'A check goes to a contact of this client. Add the person as a contact first, then come back here to send it.';
/** PHASE 151e (line 6): a check goes only to a contact with an email address or a telephone number. */
export const UNREACHABLE_CONTACT_WORDS =
  'We cannot reach this person. Add their email address or telephone number to their contact details first, then send the check.';

/**
 * THE PANEL, on the client's page and on a due diligence check. Shown to a person who may read the registers
 * (compliance.read); the form only to one who may write them (compliance.write). Off, the form still shows — and the
 * panel says, in the connector's own words, what must happen before anything is sent.
 */
export function identityPanel(app: App, actor: Actor, where: { readonly business_id: string; readonly cdd_check_id?: string },
  contacts: readonly { readonly id: string; readonly full_name: string }[]): Safe {
  if (!can(actor, 'compliance.read', complianceObj())) return raw('');
  assertComplianceRead(actor);
  const lines = identityChecks(app.db, where.cdd_check_id !== undefined ? { cdd_check_id: where.cdd_check_id } : { business_id: where.business_id });
  const ready = identityCheckReadiness(app);
  const testing = identityTestingWarning(IDENTITY_CHECK);
  const forgetful = forgetfulDatabaseWarning(app);
  const mayWrite = can(actor, 'compliance.write', complianceObj());
  // PHASE 151e (line 6): only a contact we can reach is offered; the rest are named, with what to add
  const reachableIds = new Set(app.db.all<{ id: string }>(
    "SELECT id FROM contacts WHERE business_id = ? AND (TRIM(COALESCE(email, '')) <> '' OR TRIM(COALESCE(phone, '')) <> '')", [where.business_id]).map((r) => r.id));
  const offered = contacts.filter((c) => reachableIds.has(c.id));
  const unreachable = contacts.filter((c) => !reachableIds.has(c.id));
  const action = where.cdd_check_id !== undefined ? `/staff/compliance/aml/checks/${where.cdd_check_id}/identity` : '/staff/compliance/identity-checks';
  return h`<div id="identity-check">
    <p class="help">We send the person a link. They photograph their ID and take a selfie on their phone, and ${IDENTITY_PROVIDER_NAME} tells us the result. Their photographs never come to us.</p>
    ${ready.on ? raw('') : h`<p class="help"><strong>Not ready.</strong> Nothing is sent until these are done: ${ready.missing.join(' ')}</p>`}
    ${testing === null ? raw('') : h`<p class="err" id="identity-testing-only"><strong>${testing}</strong></p>`}
    ${forgetful === null ? raw('') : h`<p class="help" id="identity-forgetful-database"><strong>Records kept in memory.</strong> ${forgetful}</p>`}
    ${lines.length === 0 ? h`<p class="help">No identity check has been sent.</p>` : h`<table><thead><tr><th>Person</th><th>Sent</th><th>Result</th><th>Link for the client</th></tr></thead><tbody>
      ${lines.map((l) => h`<tr><td>${l.contact}</td><td>${l.sent}</td><td>${l.outcome_words}${l.result_at === null ? '' : `, ${localWhen(l.result_at)}`}</td><td><a href="${l.link}">Their link</a></td></tr>`)}</tbody></table>`}
    ${mayWrite && contacts.length === 0 ? h`<p class="help" id="identity-no-contacts"><strong>Nobody to check yet.</strong> ${NO_CONTACTS_WORDS} <a href="/staff/clients/${where.business_id}#contacts">Add a contact</a></p>` : raw('')}
    ${mayWrite && unreachable.length > 0 ? h`<p class="help" id="identity-unreachable"><strong>${offered.length === 0 ? 'Nobody we can reach yet.' : 'Not offered:'}</strong> ${unreachable.map((c) => c.full_name).join(', ')} ${unreachable.length === 1 ? 'has' : 'have'} no email address or telephone number. <a href="/staff/clients/${where.business_id}#contacts">Add them to the contact details</a></p>` : raw('')}
    ${!mayWrite || offered.length === 0 ? raw('') : h`<form method="post" action="${action}">
      <input type="hidden" name="business_id" value="${where.business_id}">
      <label class="fl" for="idc-contact">Who to check</label>
      <select class="fi" id="idc-contact" name="contact_id">${offered.map((c) => h`<option value="${c.id}">${c.full_name}</option>`)}</select>
      <label class="fl" for="idc-first">First name, as on their ID</label><input class="fi" id="idc-first" name="first_name" required>
      <label class="fl" for="idc-last">Last name, as on their ID</label><input class="fi" id="idc-last" name="last_name" required>
      <button class="cta" type="submit">Send an identity check</button></form>`}
  </div>`;
}
