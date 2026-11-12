/**
 * THE ONLINE IDENTITY CHECK, WIRED IN — SENDING ONE, AND RECEIVING THE SIGNED RESULT.
 *
 * WHAT WAS DECIDED. the owner chose Veriff, and switched
 * to Didit, which is free for 500 checks a month. Identity is checked whether or
 * not money-laundering supervision applies (Word question 10, recorded, the owner in chat: "we still
 * check for identity"), so NOTHING HERE READS AML_IN_SCOPE: a check can be sent for any client, from the client's own
 * record or from an open customer due diligence check.
 *
 * THE CONNECTOR IS src/integrations/connectors/identity-check.ts, and it decides whether anything leaves this server:
 * `startIdentityCheck` refuses before any call while `identityCheckMissing` lists anything — the service named in the
 * privacy notice and in clause 7 of the engagement letter, its three entries in the key file, and the IDENTITY_CHECK switch,
 * which ships false. OFF, A PERSON WHO PRESSES "SEND" IS TOLD, IN WORDS, WHAT IS STILL MISSING, AND NOTHING IS SENT.
 * This file adds no second switch and no second gate.
 *
 *   sendIdentityCheck      compliance.write only (Admin today). The contact being checked must be a contact of the
 *                          organisation; a due diligence check it is sent from must be that organisation's and open.
 *                          AND A DIRECTOR OR AN OWNER OF IT, as we already hold them (Phase 161m1, Lakhbir, 11 Nov 2026:
 *                          "ensure the person who is performing the ID check is the director or owner, admin can
 *                          bypass"): the rule, and which kind of client asks for which role, is identity-who.ts
 *                          `mayBeChecked`; the name typed as on their ID must be the contact's name too. Anyone else is
 *                          REFUSED, audited as IDENTITY_CHECK_NOT_SENT with the rule's code, and told why and how to go
 *                          on. AN ADMIN (the role ADMIN itself, never a role that borrows compliance.write) MAY SEND IT
 *                          ANYWAY, FOR THIS ONE CHECK, WITH A REASON: none, or one the audit chain's screen refuses, and
 *                          nothing is sent. The reason goes on the chain as IDENTITY_CHECK_RULE_BYPASSED (who, which
 *                          rule, the reason, the check), as a take-back's reason does, and the SENT row says
 *                          `rule_bypassed`. A bypass asked for someone who meets the rule is not one, and is not recorded.
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
import type { App } from '../../core/app.ts';
import type { Actor } from '../../core/index.ts';
import { can, screenDetail } from '../../core/index.ts';
import { clientKindOf, howToGoOnWords, mayBeChecked, roleWords, whoMayBeCheckedWords } from './identity-who.ts';
import { getBusinessesClaimantTypeById } from '../clients/index.ts';
import { h, raw, type Safe } from '../../shared/index.ts';
import { localWhen } from '../../shared/index.ts';
import { record, userNames, type ComplianceDeps } from './compliance.ts';
import { assertComplianceRead, assertComplianceWrite, complianceObj } from './compliance.permissions.ts';
import { isReachable } from '../clients/index.ts';
import {
  IDENTITY_CHECK, IDENTITY_PROVIDER_NAME, identityCheckMissing, identityResultCopy, identityTestingWarning, readIdentityDecision,
  sentUnderTestingWaiver, startIdentityCheck, type IdentityCheckConfig, type IdentityOutcome, type IdentitySignature,
} from '../../integrations/index.ts';
import { getBusinessesIdById, getContactsIdEmailByIdBusinessId, listContactsIdByBusinessId } from '../clients/index.ts';
import { getBusinessesIdNameById, getContactsIdBusinessIdById4 } from '../clients/index.ts';
import { brandedEmail, type EmailContent } from '../../integrations/index.ts';
import { getAuditLogCountByKindObjectIdOnce } from '../../core/index.ts';
import { getIdentityChecksContactIdById } from './data.ts';
import { getCddChecksStateByIdBusinessId, getCddChecksStateVerificationMethodById, getIdentityCheckResultsOutcomeReceivedAtByIdentityCheckId, getIdentityChecksIdBusinessIdBySessionId, getIdentityChecksIdBySessionId, insertIdentityCheckResults, insertIdentityChecks, updateCddChecksVerificationMethodUpdatedAtById } from './data.ts';
import { listIdentityChecksIdContactByBusinessId, listIdentityChecksIdContactByCddCheckId } from './data.ts';

/** Where the service sends its result: set as the webhook address in Didit's console. Mounted in src/app/router.ts, outside the login. */
export const IDENTITY_HOOK_PATH = '/hooks/identity-check';
/** The headers the service signs its result with (Didit's own names for them), as Node lower-cases them. */
export const IDENTITY_SIGNATURE_HEADERS = Object.freeze({ v2: 'x-signature-v2', raw: 'x-signature', timestamp: 'x-timestamp' } as const);
/** A result is a small JSON body. Anything larger is refused before it is read. */
export const IDENTITY_HOOK_MAX_BYTES = 64 * 1024;

export type IdentityDeps = {
  readonly app: App; readonly newId: () => string;
  /** The website's public address, for the emails' links and logo (Phase 161m2). Absent: CAPREBATE_PUBLIC_ORIGIN. */
  readonly origin?: string;
};

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
  /** An Admin sending it to someone who is not a director or an owner: for this check only, with the reason. */
  readonly bypass?: { readonly reason: string } | null;
  /** Phase 161m2: also email the link to the person (id-check), when they are a director or an owner the rule allows. */
  readonly email_link?: boolean;
};
export type SendResult =
  | { readonly ok: true; readonly id: string; readonly link: string; readonly email?: IdEmailOutcome }
  | { readonly ok: false; readonly why: string };
/** Whether the link was emailed to the person, and, where it was not, why, in words staff read. */
export type IdEmailOutcome = { readonly queued: boolean; readonly why: string | null };

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
  const business = getBusinessesIdById<{ id: string }>(db, [input.business_id]);
  if (business === undefined) return { ok: false, why: 'Choose the organisation.' };
  const contact = getContactsIdEmailByIdBusinessId<{ id: string; email: string | null; phone: string | null }>(db, [input.contact_id, input.business_id]);
  if (contact === undefined) return { ok: false, why: 'Choose the person to be checked. They must be a contact of this organisation.' };
  // We send the link to the person, so we must be able to reach them
  if (!isReachable(contact)) return { ok: false, why: UNREACHABLE_CONTACT_WORDS };
  if (input.cdd_check_id !== null) {
    const c = getCddChecksStateByIdBusinessId<{ state: string }>(db, [input.cdd_check_id, input.business_id]);
    if (c === undefined) return { ok: false, why: 'That due diligence check is not one of this organisation’s.' };
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'That due diligence check is finished or withdrawn. Send it from the client’s page instead.' };
  }
  // A director or an owner of the client, as we hold them, in their own name; or an Admin's reasoned bypass
  const who = mayBeChecked(db, input.business_id, input.contact_id, { first_name: input.first_name, last_name: input.last_name });
  let bypassed: { readonly rule: string; readonly reason: string } | null = null;
  if (!who.ok) {
    const refuse = (code: string, why: string): SendResult => {
      record(cd, actor, 'IDENTITY_CHECK_NOT_SENT', 'REFUSED', 'business', input.business_id, { contact: input.contact_id, cdd_check: input.cdd_check_id, why: code });
      return { ok: false, why: `Not sent. ${why}` };
    };
    const isAdmin = actor.role === 'ADMIN';
    if (who.code === 'NOT_A_CONTACT') return refuse(who.code, who.why);
    if (input.bypass === undefined || input.bypass === null) return refuse(who.code, `${who.why} ${isAdmin ? ADMIN_MAY_BYPASS_WORDS : ASK_AN_ADMIN_WORDS}`);
    if (!isAdmin) return refuse('BYPASS_NOT_ADMIN', `${who.why} ${ONLY_ADMIN_BYPASSES_WORDS}`);
    const reason = bypassReason(input.bypass.reason);
    if (!reason.ok) return refuse('BYPASS_WITHOUT_REASON', reason.why);
    bypassed = { rule: who.code, reason: reason.reason };
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
  insertIdentityChecks(db, [id, input.business_id, input.contact_id, input.cdd_check_id, 'DIDIT', out.session_id, out.link, actor.id, d.app.now()]);
  if (bypassed !== null) {
    record(cd, actor, 'IDENTITY_CHECK_RULE_BYPASSED', 'ALLOWED', 'identity_check', id, {
      business: input.business_id, contact: input.contact_id, rule: bypassed.rule, reason: bypassed.reason,
    });
  }
  record(cd, actor, 'IDENTITY_CHECK_SENT', 'ALLOWED', 'identity_check', id, {
    business: input.business_id, contact: input.contact_id, cdd_check: input.cdd_check_id,
    // A check sent before the papers name the service says so, in the row that records it
    ...(sentUnderTestingWaiver(opts.config ?? IDENTITY_CHECK) ? { papers_waived_for_testing: true } : {}),
    // And one an Admin sent to someone who is not a director or an owner, with the reason in the row before it
    ...(bypassed === null ? {} : { rule_bypassed: bypassed.rule }),
  });
  if (input.email_link !== true) return { ok: true, id, link: out.link };
  return { ok: true, id, link: out.link, email: emailIdentityCheck(d, actor, id, bypassed !== null) };
}

/** Said when the link was not emailed, so staff pass it on themselves. */
export const ID_EMAIL_WORDS = Object.freeze({
  bypassed: 'The link was not emailed: it goes by email only to a director or an owner our rule allows. Give them the link yourself.',
  no_email: 'The link was not emailed: we have no email address for them. Give them the link yourself.',
  refused: 'The link was not emailed: this client asked us not to contact them.',
});

/** THE ID-CHECK EMAIL (Phase 161m2, emails.py "id-check", the approved words), carrying the service's own link. */
export function idCheckEmail(organisation: string, checkLink: string): EmailContent {
  return {
    subject: 'Your identity check for Cap Rebate',
    preheader: 'A quick check on your phone, done by our provider Didit.',
    heading: 'Please complete your identity check',
    blocks: [
      `Before we start work for ${organisation}, we need to confirm who we are working with. The law expects us to do this.`,
      `The check is done by **${IDENTITY_PROVIDER_NAME}**, our identity-check provider. It takes about three minutes on your phone:`,
      { kind: 'bullets', items: ['a photo of your passport or driving licence;', `a short selfie video, so ${IDENTITY_PROVIDER_NAME} can match it to the photo.`] },
      `The link below is just for you. Our privacy policy explains what ${IDENTITY_PROVIDER_NAME} receives and how long it is kept.`,
    ],
    button: { label: 'Start the check', href: checkLink },
    sign: 'The Cap Rebate team',
    security: true,
  };
}

/** THE ID-CHECK-DONE EMAIL (emails.py "id-check-done", the approved words). */
export function idCheckDoneEmail(firstName: string, portalLink: string): EmailContent {
  return {
    subject: 'Your identity check is complete',
    preheader: 'Thank you. There is nothing more you need to do for this step.',
    heading: 'Your identity check is complete',
    blocks: [
      `Thank you, ${firstName}. Your identity check is complete and there is nothing more you need to do for this step.`,
      'Next, we will ask for the documents we need. You will see the list in your portal.',
    ],
    button: { label: 'Open your portal', href: portalLink },
    sign: 'The Cap Rebate team',
  };
}

/** A contact's first name, from the name we hold ("Ivy Inventedperson", or "Inventedperson, Ivy"). */
export function firstNameOf(full_name: string): string {
  const t = full_name.replace(/\s+/g, ' ').trim();
  const given = t.includes(',') ? (t.split(',')[1] ?? '').trim() : t;
  return given.split(' ')[0] || t;
}

const publicOrigin = (given?: string | null): string => (given ?? process.env.CAPREBATE_PUBLIC_ORIGIN ?? '').trim().replace(/\/+$/, '');

/**
 * EMAIL ONE CHECK'S LINK TO THE PERSON BEING CHECKED (id-check): only where they meet the rule (a director or an
 * owner, identity-who.ts); a check an Admin sent anyway is not emailed, and staff are told to pass the link on. To the
 * contact's own email address; the outbox refuses a do-not-contact client as everywhere. IDENTITY_CHECK_EMAILED records
 * it, with the outcome.
 */
function emailIdentityCheck(d: IdentityDeps, actor: Actor, check_id: string, bypassed: boolean): IdEmailOutcome {
  const db = d.app.db;
  const cd: ComplianceDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const c = getIdentityChecksContactIdById<{ id: string; business_id: string; contact_id: string; link: string }>(db, [check_id]);
  const person = c === undefined ? undefined : getContactsIdBusinessIdById4<{ email: string | null }>(db, [c.contact_id]);
  const b = c === undefined ? undefined : getBusinessesIdNameById<{ id: string; name: string }>(db, [c.business_id]);
  const to = (person?.email ?? '').trim();
  const say = (queued: boolean, why: string | null, code: string): IdEmailOutcome => {
    record(cd, actor, 'IDENTITY_CHECK_EMAILED', queued ? 'ALLOWED' : 'REFUSED', 'identity_check', check_id, { business: c?.business_id ?? null, contact: c?.contact_id ?? null, outcome: code });
    return { queued, why };
  };
  if (bypassed) return say(false, ID_EMAIL_WORDS.bypassed, 'RULE_BYPASSED');
  if (c === undefined || b === undefined || to === '') return say(false, ID_EMAIL_WORDS.no_email, 'NO_EMAIL');
  const e = brandedEmail(idCheckEmail(b.name, c.link), { publicOrigin: publicOrigin(d.origin) });
  const r = d.app.email.send({ to_email: to, subject: e.subject, body: e.text, html: e.html, kind: 'NOTIFICATION', business_id: b.id, contact_id: c.contact_id });
  return r.refused === null ? say(true, null, 'QUEUED') : say(false, ID_EMAIL_WORDS.refused, r.refused);
}

/**
 * A PASS IS TOLD TO THE PERSON, ONCE (id-check-done): the first PASS on a check emails the contact it was sent to,
 * and IDENTITY_CHECK_DONE_EMAILED records it, so a second pass on the same check never emails again. A contact with no
 * email address is not emailed. The outbox refuses a do-not-contact client as everywhere.
 */
function tellPassed(app: App, cd: ComplianceDeps, check_id: string, origin: string | null): void {
  if ((getAuditLogCountByKindObjectIdOnce<{ n: number }>(app.db, ['IDENTITY_CHECK_DONE_EMAILED', check_id])?.n ?? 0) > 0) return;
  const c = getIdentityChecksContactIdById<{ id: string; business_id: string; contact_id: string }>(app.db, [check_id]);
  if (c === undefined) return;
  const person = getContactsIdBusinessIdById4<{ email: string | null; full_name: string }>(app.db, [c.contact_id]);
  const to = (person?.email ?? '').trim();
  if (person === undefined || to === '') return;
  const o = publicOrigin(origin);
  const e = brandedEmail(idCheckDoneEmail(firstNameOf(person.full_name), `${o}/portal`), { publicOrigin: o });
  const r = app.email.send({ to_email: to, subject: e.subject, body: e.text, html: e.html, kind: 'NOTIFICATION', business_id: c.business_id, contact_id: c.contact_id });
  record(cd, null, 'IDENTITY_CHECK_DONE_EMAILED', r.refused === null ? 'ALLOWED' : 'REFUSED', 'identity_check', check_id, { business: c.business_id, contact: c.contact_id, outcome: r.refused ?? 'QUEUED' });
}

/** Said to an Admin when the person is not a director or an owner. */
export const ADMIN_MAY_BYPASS_WORDS = 'As an Admin, you can send it anyway for this one check: tick “Send it anyway” and say why.';
/** Said to anyone else. */
export const ASK_AN_ADMIN_WORDS = 'Or ask an Admin to send it anyway, with a reason.';
/** Said to someone who is not an Admin and asked to send it anyway. */
export const ONLY_ADMIN_BYPASSES_WORDS = 'Only an Admin can send it anyway. Ask an Admin, with your reason.';

/**
 * THE BYPASS'S REASON, in the Admin's own words. Required, trimmed, at most 2000 characters, as a take-back's reason is
 * (src/modules/claims/take-back.ts `takeBackReason`). It goes on the audit chain, so it must pass the chain's screen:
 * an email address or a supplier key is refused here, before anything is sent.
 */
export function bypassReason(v: string | null | undefined): { ok: true; reason: string } | { ok: false; why: string } {
  const t = (v ?? '').trim().slice(0, 2000);
  if (t === '') return { ok: false, why: 'Say why you are sending it to someone who is not a director or an owner. The reason is kept in the audit log.' };
  try { screenDetail({ reason: t }); } catch {
    return { ok: false, why: 'Leave email addresses and codes out of the reason. Say why in your own words.' };
  }
  return { ok: true, reason: t };
}

/**
 * — SAYING SO, WHEN THIS SERVER FORGETS.
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
  if (app.db.kind !== 'memory') return null;
  return app.storageWhy === undefined ? FORGETFUL_DATABASE_WORDS : `${FORGETFUL_DATABASE_WORDS} ${storageReason(app.storageWhy)}`;
}

/** The reason the server gave at start-up, as one sentence. It never holds an address or a token. */
export function storageReason(why: string): string {
  const t = why.trim().replace(/[.\s]+$/, '');
  return `Why: ${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

export type ReceiveResult = { readonly status: 200 | 401 | 404; readonly outcome: IdentityOutcome | null; readonly note?: string };

/**
 * One result from the service. Believed only when a signature holds and it is fresh; refused and audited otherwise,
 * with nothing written. A signed result for a session we never sent is refused the same way. A signed word that the
 * check is still under way, or about something else, is acknowledged and not kept. The row it writes is our copy.
 */
export function receiveIdentityResult(app: App, newId: () => string, rawBody: string, sig: IdentitySignature, origin: string | null = null): ReceiveResult {
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
    const known = getIdentityChecksIdBySessionId<{ id: string }>(app.db, [read.session_id]);
    if (known === undefined) return noCheckToMatch(app, cd);
    record(cd, null, 'IDENTITY_RESULT_NOT_KEPT', 'ALLOWED', 'identity_check', known.id, { why: 'the check is still under way', status: read.status });
    return { status: 200, outcome: null };
  }
  const check = getIdentityChecksIdBusinessIdBySessionId<{ id: string; business_id: string; cdd_check_id: string | null }>(app.db, [read.session_id]);
  if (check === undefined || (read.check_ref !== null && read.check_ref !== check.id)) return noCheckToMatch(app, cd);
  const at = app.now();
  insertIdentityCheckResults(app.db, [newId(), check.id, read.outcome, read.status.slice(0, 80), read.decided_at, at,
      createHash('sha256').update(rawBody, 'utf8').digest('hex'), JSON.stringify(identityResultCopy(rawBody))]);
  record(cd, null, 'IDENTITY_RESULT_RECEIVED', 'ALLOWED', 'identity_check', check.id, { business: check.business_id, outcome: read.outcome, status: read.status });
  if (read.outcome === 'PASS' && check.cdd_check_id !== null) recordPassAsEvidence(cd, check.cdd_check_id, (read.decided_at ?? at).slice(0, 10));
  if (read.outcome === 'PASS') tellPassed(app, cd, check.id, origin);
  return { status: 200, outcome: read.outcome };
}

/**
 * A signed result that names no check we sent: REFUSED, AUDITED, NOTHING WRITTEN, and never matched to the nearest check.
 * On a database in memory the refusal also says why that may be, and what to do.
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
  const c = getCddChecksStateVerificationMethodById<{ state: string; verification_method: string | null }>(cd.db, [cdd_check_id]);
  if (c === undefined || c.state !== 'IN_PROGRESS' || c.verification_method !== null) return;
  updateCddChecksVerificationMethodUpdatedAtById(cd.db, [passEvidenceSentence(day), cd.now(), cdd_check_id]);
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
  const sent = where.cdd_check_id !== undefined
    ? listIdentityChecksIdContactByCddCheckId<{ id: string; contact: string; sent_at: string; link: string; cdd_check_id: string | null; sent_by: string }>(db, [where.cdd_check_id])
    : listIdentityChecksIdContactByBusinessId<{ id: string; contact: string; sent_at: string; link: string; cdd_check_id: string | null; sent_by: string }>(db, [where.business_id ?? '']);
  // Who sent each, by name (the users are the core's); a sender who is gone reads as nobody.
  const names = userNames(db, sent.map((r) => r.sent_by));
  const rows = sent.map((r) => ({ ...r, who: names.get(r.sent_by) ?? null }));
  return rows.map((r) => {
    const latest = getIdentityCheckResultsOutcomeReceivedAtByIdentityCheckId<{ outcome: IdentityOutcome; received_at: string }>(db, [r.id]);
    return {
      id: r.id, contact: r.contact, sent_at: r.sent_at, sent: `${localWhen(r.sent_at)} by ${r.who ?? 'a former user'}`, link: r.link,
      outcome: latest?.outcome ?? null, outcome_words: latest === undefined ? 'No result yet' : OUTCOME_WORDS[latest.outcome],
      result_at: latest?.received_at ?? null, from_cdd: r.cdd_check_id,
    };
  });
}

/**
 *: a client with no contacts showed no form and said nothing, so nobody could tell
 * how to send a check. A check goes only to a contact of the client, so the panel says so,
 * with a link to the form that adds one.
 */
export const NO_CONTACTS_WORDS = 'A check goes to a contact of this client. Add the person as a contact first, then come back here to send it.';
/** A check goes only to a contact with an email address or a telephone number. */
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
  // Only a contact we can reach is offered; the rest are named, with what to add
  const reachableIds = new Set(listContactsIdByBusinessId<{ id: string }>(app.db, [where.business_id]).map((r) => r.id));
  const offered = contacts.filter((c) => reachableIds.has(c.id));
  const unreachable = contacts.filter((c) => !reachableIds.has(c.id));
  // Phase 161m1: who of them we hold as a director or an owner (identity-who.ts), and who not
  const kind = clientKindOf(getBusinessesClaimantTypeById<{ claimant_type: string | null }>(app.db, [where.business_id])?.claimant_type);
  const roles = new Map(offered.map((c) => [c.id, mayBeChecked(app.db, where.business_id, c.id, null)]));
  const notOneOfThem = offered.filter((c) => roles.get(c.id)?.ok !== true);
  const isAdmin = actor.role === 'ADMIN';
  const action = where.cdd_check_id !== undefined ? `/staff/compliance/aml/checks/${where.cdd_check_id}/identity` : '/staff/compliance/identity-checks';
  return h`<div id="identity-check">
    <p class="help">We send the person a link. They photograph their ID and take a selfie on their phone, and ${IDENTITY_PROVIDER_NAME} tells us the result. Their photographs never come to us.</p>
    <p class="help" id="identity-by-didit">When you give them the link, tell them the check is done for us by ${IDENTITY_PROVIDER_NAME}.</p>
    <p class="help" id="identity-who">${whoMayBeCheckedWords(kind)}</p>
    ${ready.on ? raw('') : h`<p class="help"><strong>Not ready.</strong> Nothing is sent until these are done: ${ready.missing.join(' ')}</p>`}
    ${testing === null ? raw('') : h`<p class="err" id="identity-testing-only"><strong>${testing}</strong></p>`}
    ${forgetful === null ? raw('') : h`<p class="help" id="identity-forgetful-database"><strong>Records kept in memory.</strong> ${forgetful}</p>`}
    ${lines.length === 0 ? h`<p class="help">No identity check has been sent.</p>` : h`<table><thead><tr><th>Person</th><th>Sent</th><th>Result</th><th>Link for the client</th></tr></thead><tbody>
      ${lines.map((l) => h`<tr><td>${l.contact}</td><td>${l.sent}</td><td>${l.outcome_words}${l.result_at === null ? '' : `, ${localWhen(l.result_at)}`}</td><td><a href="${l.link}">Their link</a></td></tr>`)}</tbody></table>`}
    ${mayWrite && contacts.length === 0 ? h`<p class="help" id="identity-no-contacts"><strong>Nobody to check yet.</strong> ${NO_CONTACTS_WORDS} <a href="/staff/clients/${where.business_id}#contacts">Add a contact</a></p>` : raw('')}
    ${mayWrite && unreachable.length > 0 ? h`<p class="help" id="identity-unreachable"><strong>${offered.length === 0 ? 'Nobody we can reach yet.' : 'Not offered:'}</strong> ${unreachable.map((c) => c.full_name).join(', ')} ${unreachable.length === 1 ? 'has' : 'have'} no email address or telephone number. <a href="/staff/clients/${where.business_id}#contacts">Add them to the contact details</a></p>` : raw('')}
    ${mayWrite && notOneOfThem.length > 0 ? h`<p class="help" id="identity-not-director-or-owner"><strong>Not a director or an owner on our records:</strong> ${notOneOfThem.map((c) => c.full_name).join(', ')}. A check to them is refused. ${howToGoOnWords(kind)} ${isAdmin ? 'As an Admin, you can send one anyway, with a reason.' : ASK_AN_ADMIN_WORDS}</p>` : raw('')}
    ${!mayWrite || offered.length === 0 ? raw('') : h`<form method="post" action="${action}">
      <input type="hidden" name="business_id" value="${where.business_id}">
      <label class="fl" for="idc-contact">Who to check</label>
      <select class="fi" id="idc-contact" name="contact_id">${offered.map((c) => { const r = roles.get(c.id); return h`<option value="${c.id}">${c.full_name}${r?.ok === true ? ` (${roleWords(r.role)})` : ''}</option>`; })}</select>
      <label class="fl" for="idc-first">First name, as on their ID</label><input class="fi" id="idc-first" name="first_name" required>
      <label class="fl" for="idc-last">Last name, as on their ID</label><input class="fi" id="idc-last" name="last_name" required>
      ${isAdmin ? h`<label class="fl" for="idc-bypass"><input type="checkbox" id="idc-bypass" name="bypass" value="yes"> Send it anyway, even though our rule refuses it. Admin only, for this one check.</label>
      <label class="fl" for="idc-bypass-reason">Why, if you send it anyway. This is kept in the audit log.</label><textarea class="fi" id="idc-bypass-reason" name="bypass_reason" maxlength="2000"></textarea>` : raw('')}
      <label class="fl" for="idc-email"><input type="checkbox" id="idc-email" name="email_link" value="yes" checked> Email the link to them. Only to a director or an owner our rule allows.</label>
      <button class="cta" type="submit">Send an identity check</button></form>`}
  </div>`;
}
