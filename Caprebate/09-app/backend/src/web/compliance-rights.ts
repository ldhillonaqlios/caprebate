/**
 * THE RIGHTS-REQUEST REGISTER, THE COMPLAINTS LOG, THEIR LETTERS AND THE SEARCH.
 * CRM 8 of 10, 12 September 2026.
 *
 * Built to the Rights-Request Register, Complaints Log and s.164A pack
 * (08-monday-doc-exports/12927908435) and the Retention and Rights-Request
 * Operating Procedure (12818099921), section 5.
 *
 * TABLE A IS THE REQUEST; TABLE B IS ONE ROW PER LIMB. The Article 12A deadlines
 * are READ, per limb, by src/web/compliance-clock.ts from the inputs recorded
 * here — never stored, and never one date for a letter that engages two rights.
 *
 * THE COMPLAINTS LOG IS COUNTABLE (s.164B): classified on receipt, never revised
 * once classified, and an unclassified complaint is counted apart — never as no.
 * The thirty-day acknowledgement deadline is read, and nothing moves it.
 *
 * A LETTER REACHES THE OUTBOX AND NOWHERE ELSE. Every letter is a DRAFT, not
 * approved, is refused if it carries a word that would tip somebody off, and is
 * written as a COMPLIANCE_LETTER row the outbox marks not sent.
 *
 * THE SEARCH FINDS A PERSON WHEREVER THIS APPLICATION HOLDS THEM — through an
 * organisation, through a lead with no organisation, and at an introducing firm,
 * with the tasks that name them — and never reaches inside a document: a person
 * printed on one is in S2, searched separately and logged there.
 */

import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import { outboxTransport } from '../stubs/email.ts';
import { tipsOff } from './templates.ts';
import {
  ClockInputError, LIMB_LABELS, LIMBS, EXTENSION_GROUNDS, acknowledgementClock, limbClock,
  type AckClock, type Limb, type LimbClock, type LimbClockInput,
} from './compliance-clock.ts';
import {
  assertComplianceRead, assertComplianceWrite, dateField, has, holdsForEntry, linksFor, momentField, nextRef, NotFoundAsRefusal,
  record, requiredText, textField, TWO_PERSON_LIMITATION, ukDay, vocabField, words,
  type Check, type ComplianceDeps, type Fields, type HoldRow, type LinkLine, type Vocab, type WriteResult,
} from './compliance.ts';

class Refusal extends Error {}

function check<T>(c: Check<T>): T {
  if (!c.ok) throw new Refusal(c.why);
  return c.value;
}

function guarded(fn: () => WriteResult): WriteResult {
  try { return fn(); } catch (e) {
    if (e instanceof Refusal || e instanceof ClockInputError) return { ok: false, why: e.message };
    if (e instanceof NotFoundAsRefusal) throw e;
    if (e instanceof Error && /constraint|RAISE|append-only|refus|kept|fixed|never|closes|needs/i.test(e.message)) {
      return { ok: false, why: `Not recorded: ${e.message.replace(/^.*constraint failed: /, 'a required field is missing or out of range: ')}` };
    }
    throw e;
  }
}

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

export const RECEIVED_VIA: Vocab = Object.freeze({
  DEDICATED_ADDRESS: 'The dedicated address', FORM: 'The form on the public page', POST: 'Post', VERBAL: 'Verbally', ELSEWHERE: 'Somewhere else',
});
export const LIMB_WORDS: Vocab = LIMB_LABELS;
export const IDENTITY_STATUS: Vocab = Object.freeze({ NOT_REQUIRED: 'Not required', REQUESTED: 'Requested', CONFIRMED: 'Confirmed', NOT_CONFIRMED: 'Not confirmed' });
export const IDENTITY_ROUTES: Vocab = Object.freeze({ A: 'Route A — a representative of an organisation', B: 'Route B — a private individual', NOT_REQUIRED: 'Not required — the answer discloses nothing' });
export const IDENTITY_EVIDENCE: Vocab = Object.freeze({
  ACCOUNT_AUTH: 'Account authentication', ORG_AUTHORITY: 'Organisation authority', CORROBORATING_FACT: 'A corroborating fact',
  OUT_OF_BAND: 'An out-of-band code', NARROWER_DISCLOSURE: 'A narrower disclosure', NONE: 'None',
});
export const IDENTITY_OUTCOMES: Vocab = Object.freeze({ CONFIRMED: 'Confirmed', NARROWED: 'Narrowed', NOT_CONFIRMED: 'Not confirmed', NOT_REQUIRED: 'Not required' });
export const FEE_STATUS: Vocab = Object.freeze({
  NOT_CHARGED: 'Not charged', CHARGED_12_5_A: 'Charged under Art 12(5)(a)', REFUSED_12_5_B: 'Refused under Art 12(5)(b)',
});
export const EXTENSION_GROUND_WORDS: Vocab = Object.freeze({ COMPLEXITY: 'The complexity of the requests', NUMBER: 'The number of the requests' });
export const LIMB_DECISIONS: Vocab = Object.freeze({ GRANTED: 'Granted', PARTLY_GRANTED: 'Partly granted', REFUSED: 'Refused' });
export const REQUEST_STATUS: Vocab = Object.freeze({ OPEN: 'Open', AWAITING_REQUESTER: 'Awaiting the requester', RESPONDED: 'Responded', CLOSED: 'Closed' });

/** What an access response must say, and what any refusal must — pack 2.3, `response_content_check`. */
export const ACCESS_RESPONSE_ITEMS: Vocab = Object.freeze({
  DATA: 'The personal data', PURPOSES: 'The purposes', RECIPIENTS: 'The recipients', RETENTION: 'The retention period or the criteria for it',
  SOURCE: 'The source, and that it was publicly accessible', RIGHTS: 'The rights, including the right to object',
  S164A: 'The right to complain to Cap Rebate — s.164A, Art 15(1)(ea)', S165: 'The right to complain to the Information Commissioner (from 30 September 2026, the Information Commission) — s.165, Art 15(1)(f)',
});
export const REFUSAL_RESPONSE_ITEMS: Vocab = Object.freeze({
  REASONS: 'The reasons', S164A: 'The right to complain to Cap Rebate — s.164A', S165: 'The right to complain to the Information Commissioner (from 30 September 2026, the Information Commission) — s.165',
  JUDICIAL: 'The possibility of seeking a judicial remedy',
});

export const COMPLAINT_VIA: Vocab = Object.freeze({
  FORM: 'The form', DEDICATED_ADDRESS: 'The dedicated address', POST: 'Post', VERBAL: 'Verbally', ELSEWHERE: 'Somewhere else',
});
export const IS_164A: Vocab = Object.freeze({ YES: 'Yes — a s.164A complaint', NO: 'No — not a s.164A complaint', BOTH: 'Both — also a service complaint' });
export const COMPLAINT_LIMBS: Vocab = Object.freeze({ UK_GDPR: 'UK GDPR', PART_3: 'DPA 2018 Part 3' });
export const COMPLAINT_OUTCOMES: Vocab = Object.freeze({
  UPHELD: 'Upheld', PARTLY_UPHELD: 'Partly upheld', NOT_UPHELD: 'Not upheld', WITHDRAWN: 'Withdrawn', OUT_OF_SCOPE_ROUTE_GIVEN: 'Out of scope — route given',
});
export const ONWARD_ROUTE_ITEMS: Vocab = Object.freeze({
  S164A: 'The s.164A right to complain to Cap Rebate', S165: 'The s.165 right to complain to the Information Commissioner (from 30 September 2026, the Information Commission)', JUDICIAL: 'The availability of a judicial remedy',
});

/* ================================================================== *
 * 2 · THE LETTERS — drafts, to the outbox and nowhere else
 * ================================================================== */

/**
 * Pack 5.7, the onward route, as it must be stated — in every refusal and every access response.
 *
 * DRAFT 15 September 2026 (Phase 132c), FOR THE DATA PROTECTION OFFICER: the regulator named both ways. Copied by
 * Phase 132f (16 September 2026) from 03-app/caprebate-notices-page.html, where the dated dual wording is Block A's
 * and the option 2 and 3 text below is Block F's, word for word: S.I. 2026/1015 reg 2(c) moves the functions to the
 * Information Commission on 30 September 2026 and s.118 abolishes the office of Information Commissioner, so "the
 * Information Commissioner" alone is wrong from that day. Not approved; shortening it after that date is the officer's.
 */
export const ONWARD_ROUTE_TEXT = [
  'If you are not satisfied',
  '',
  'You have three separate options, and you do not have to use them in order.',
  '',
  '1. Complain to us. You have a right to complain to us about how we have handled your personal data — section 164A of the Data Protection Act 2018. We will confirm we have received it within 30 days, look into it, and tell you the outcome. You can use our complaint form, or just write to us.',
  '',
  '2. Complain to the data protection regulator. You have a right to complain to the Information Commissioner (from 30 September 2026, the Information Commission) — section 165 of the Data Protection Act 2018. You do not have to complain to us first, and you do not have to wait for us to finish. The regulator must look into it to the extent appropriate, keep you informed of progress, tell you the outcome, and tell you about your rights under section 166 of that Act — which let you apply to the Tribunal if the regulator does not deal with your complaint. The regulator\'s contact details are at ico.org.uk, and the helpline is 0303 123 1113.',
  '',
  '3. Go to court. You can also take your own case to court. A court can order us to do something, or to stop doing something (section 167 of the Data Protection Act 2018), and can award compensation — which can include compensation for distress (section 168 of that Act, with Article 82 of the UK GDPR). This is your right and it does not depend on what we or the regulator decide.',
].join('\n');

export type LetterKind =
  | 'COMPLAINT_ACKNOWLEDGEMENT' | 'COMPLAINT_OUTCOME'
  | 'RR_IDENTITY_REQUEST' | 'RR_EXTENSION_NOTICE' | 'RR_REFUSAL' | 'RR_ACCESS_COVER' | 'RR_OBJECTION_DECISION';

export const LETTERS: Readonly<Record<LetterKind, { readonly label: string; readonly register: 'RIGHTS_REQUEST' | 'COMPLAINT'; readonly source: string }>> = Object.freeze({
  COMPLAINT_ACKNOWLEDGEMENT: { label: 'Acknowledge a complaint (s.164A(3))', register: 'COMPLAINT', source: 'pack 4.7' },
  COMPLAINT_OUTCOME: { label: 'Tell the complainant the outcome, with the three onward routes (s.164A(4)(b))', register: 'COMPLAINT', source: 'pack 3.4, 5.7' },
  RR_IDENTITY_REQUEST: { label: 'Ask for identity information (Art 12(6)(a))', register: 'RIGHTS_REQUEST', source: 'Retention Procedure 5.5' },
  RR_EXTENSION_NOTICE: { label: 'Give notice of an extension, with the reasons (Art 12A(3), (4))', register: 'RIGHTS_REQUEST', source: 'pack 2.5.5, Trap 3' },
  RR_REFUSAL: { label: 'Refuse, with reasons and the three onward routes (Art 12(4))', register: 'RIGHTS_REQUEST', source: 'pack 5.7' },
  RR_ACCESS_COVER: { label: 'Cover an access response, with both complaint rights (Art 15(1)(ea), (f))', register: 'RIGHTS_REQUEST', source: 'pack 1.4, 5.7' },
  RR_OBJECTION_DECISION: { label: 'Decide an objection, on the person’s own situation, with the onward routes (Art 21(1), 12(4))', register: 'RIGHTS_REQUEST', source: 'pack 2.3, 5.7' },
});

export const LETTER_DRAFT_NOTE = 'DRAFT — NOT APPROVED. The wording is the pack’s and the procedure’s; nobody has signed it.';

function letterBody(kind: LetterKind, ref: string, receivedDay: string, extra: { reasons: string | null; asked: string | null }): { subject: string; body: string } {
  const sign = ['', 'Cap Rebate'];
  switch (kind) {
    case 'COMPLAINT_ACKNOWLEDGEMENT':
      return {
        subject: `We have received your complaint — ${ref}`,
        body: [
          'Thank you — we have received your complaint.', '',
          `We received it on ${receivedDay}. Your reference is ${ref}. Please quote it if you contact us again.`, '',
          'The person who handles data protection matters for Cap Rebate is dealing with it. We will look into what you have told us and write to you with the outcome. If it is going to take us a while, we will keep you updated rather than leave you waiting.', '',
          ...(extra.asked === null ? [] : [`You also asked us to ${extra.asked}. We are treating that as a separate request about your data. It has its own timescale. We will normally answer it within one month. We will tell you if we need longer, and why.`, '']),
          'If at any point you are not satisfied with how we are handling this, you do not have to wait for us to finish. You can complain to the Information Commissioner (from 30 September 2026, the Information Commission) — their details are at ico.org.uk.', // DRAFT (Phase 132c wording, Block A), for the data protection officer
          ...sign,
        ].join('\n'),
      };
    case 'RR_IDENTITY_REQUEST':
      return {
        subject: `Your request ${ref} — one thing we need before we can answer`,
        body: [
          `We received your request on ${receivedDay}. Your reference is ${ref}.`, '',
          'Before we can tell you what we hold, we need to be sure we are answering the right person. ' +
            (extra.asked === null ? 'Please tell us the one thing below.' : `Please tell us: ${extra.asked}`), '',
          'We ask this once. When we have it, we will answer within one month of receiving it, and we will tell you if we need longer and why.',
          ...sign,
        ].join('\n'),
      };
    case 'RR_EXTENSION_NOTICE':
      return {
        subject: `Your request ${ref} — we need longer, and why`,
        body: [
          `We received your request on ${receivedDay}. Your reference is ${ref}.`, '',
          'We need up to two further months to answer it. The reasons are:', '', extra.reasons ?? '', '',
          'We will answer sooner if we can.', '', ONWARD_ROUTE_TEXT, ...sign,
        ].join('\n'),
      };
    case 'RR_REFUSAL':
      return {
        subject: `Your request ${ref} — our answer`,
        body: [
          `We received your request on ${receivedDay}. Your reference is ${ref}.`, '',
          'We are not taking the action you asked for. Our reasons are:', '', extra.reasons ?? '', '', ONWARD_ROUTE_TEXT, ...sign,
        ].join('\n'),
      };
    case 'COMPLAINT_OUTCOME':
      return {
        subject: `Your complaint ${ref} — the outcome`,
        body: [
          `We received your complaint on ${receivedDay}. Your reference is ${ref}.`, '',
          'We have looked into what you told us. The outcome, and why:', '', extra.reasons ?? '', '',
          ONWARD_ROUTE_TEXT, ...sign,
        ].join('\n'),
      };
    case 'RR_OBJECTION_DECISION':
      return {
        subject: `Your objection ${ref} — our decision`,
        body: [
          `We received your objection on ${receivedDay}. Your reference is ${ref}.`, '',
          'You objected to our using your personal data. We have looked at your own situation, as the law requires, and this is our decision and why:', '',
          extra.reasons ?? '', '', ONWARD_ROUTE_TEXT, ...sign,
        ].join('\n'),
      };
    case 'RR_ACCESS_COVER':
      return {
        subject: `Your request ${ref} — what we hold about you`,
        body: [
          `We received your request on ${receivedDay}. Your reference is ${ref}.`, '',
          'With this letter is what we hold about you: the data itself, why we hold it, who it has gone to, how long we keep it and the criteria for that, where it came from, and your rights — including your right to object to our using it.', '',
          ONWARD_ROUTE_TEXT, ...sign,
        ].join('\n'),
      };
  }
}

/** The letter as it would be queued — so the page shows exactly what goes to the outbox. */
export function draftLetter(db: Db, actor: Actor, kind: LetterKind, entry_id: string, extra: { reasons: string | null; asked: string | null }): { subject: string; body: string; business_id: string | null } {
  assertComplianceRead(actor);
  const spec = LETTERS[kind];
  const row = spec.register === 'COMPLAINT'
    ? db.get<{ ref: string; received_at: string; business_id: string | null }>('SELECT complaint_ref AS ref, received_at, business_id FROM complaints WHERE id = ?', [entry_id])
    : db.get<{ ref: string; received_at: string; business_id: string | null }>(
      'SELECT r.request_ref AS ref, r.received_at, c.business_id FROM rights_requests r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.id = ?', [entry_id]);
  if (row === undefined) throw new NotFoundAsRefusal();
  return { ...letterBody(kind, row.ref, ukDay(row.received_at), extra), business_id: row.business_id };
}

export function queueLetter(d: ComplianceDeps, actor: Actor, entry_id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const kind = input['letter'] ?? null;
    if (kind === null || !Object.hasOwn(LETTERS, kind)) return { ok: false, why: 'Choose the letter.' };
    const k = kind as LetterKind;
    const to = check(requiredText(input['to_email'], 254, 'The address to reply to'));
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return { ok: false, why: 'That is not an email address. For a letter by post, print it from this page.' };
    const reasons = check(textField(input['reasons'], 4000, 'The reasons'));
    const asked = check(textField(input['asked'], 1000, 'What was asked'));
    if ((k === 'RR_EXTENSION_NOTICE' || k === 'RR_REFUSAL' || k === 'RR_OBJECTION_DECISION' || k === 'COMPLAINT_OUTCOME') && reasons === null) {
      return { ok: false, why: 'This letter must state the reasons, in the words sent to the person.' };
    }
    const letter = draftLetter(d.db, actor, k, entry_id, { reasons, asked });
    const tip = tipsOff(`${letter.subject}\n${letter.body}`);
    if (tip !== null) return { ok: false, why: `A letter may not carry ${tip}.` };
    const sent = outboxTransport(d.db, d.newId, d.now).send({ to_email: to, subject: letter.subject, body: letter.body, kind: 'COMPLIANCE_LETTER', business_id: letter.business_id });
    if (sent.id === null) {
      record(d, actor, 'COMPLIANCE_LETTER_QUEUED', 'REFUSED', LETTERS[k].register === 'COMPLAINT' ? 'complaint' : 'rights_request', entry_id, { letter: k, reason: sent.refused });
      return { ok: false, why: 'It was not added to the emails waiting to send: the organisation is marked do not contact. Send it by post.' };
    }
    record(d, actor, 'COMPLIANCE_LETTER_QUEUED', 'ALLOWED', LETTERS[k].register === 'COMPLAINT' ? 'complaint' : 'rights_request', entry_id, { letter: k, outbox: sent.id });
    return { ok: true, id: sent.id };
  });
}

/* ================================================================== *
 * 3 · THE RIGHTS-REQUEST REGISTER
 * ================================================================== */

type RequestRow = {
  id: string; request_ref: string; received_at: string; received_via: string; received_via_detail: string | null; forwarded_at: string | null;
  forwarded_by: string | null; requester_as_described: string | null; request_verbatim: string; contact_id: string | null; lead_id: string | null;
  person_ref: string | null; classification_alternatives: string | null; identity_status: string | null; identity_route: string | null;
  identity_standard_applied: string | null; identity_evidence: string | null; identity_outcome: string | null; authority_grantor: string | null;
  id_requested_at: string | null; id_received_at: string | null; fee_status: string; fee_charged_at: string | null; fee_paid_at: string | null;
  clarification: string | null; search_scope: string | null; search_done_on: string | null; records_found: string | null;
  restriction_applied_at: string | null; responded_at: string | null; response_route: string | null; response_content_check: string | null;
  outcome: string | null; status: string; closed_at: string | null; created_at: string; updated_at: string;
};

type LimbRow = {
  id: string; request_id: string; limb: string; clarification_requested_at: string | null; clarification_received_at: string | null;
  extension_notified_at: string | null; extension_ground: string | null; extension_reasons: string | null; decision: string | null;
  decision_reasoning: string | null; undue_delay_assessment: string | null;
};

const REQUEST_SELECT = 'SELECT * FROM rights_requests ';
const LIMB_SELECT =
  'SELECT id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, ' +
  'extension_reasons, decision, decision_reasoning, undue_delay_assessment FROM rights_request_limbs ';

function loadRequest(db: Db, id: string): RequestRow {
  const r = db.get<RequestRow>(`${REQUEST_SELECT}WHERE id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

function day(iso: string | null): string | null {
  return iso === null ? null : ukDay(iso);
}

export function clockInput(r: RequestRow, l: LimbRow, respondedOverride?: string | null): LimbClockInput {
  return {
    limb: l.limb as Limb, receipt: ukDay(r.received_at),
    id_requested: day(r.id_requested_at), id_received: day(r.id_received_at),
    fee_charged: day(r.fee_charged_at), fee_paid: day(r.fee_paid_at),
    clarification_requested: day(l.clarification_requested_at), clarification_received: day(l.clarification_received_at),
    extension_notified: day(l.extension_notified_at),
    extension_ground: l.extension_ground === 'COMPLEXITY' || l.extension_ground === 'NUMBER' ? l.extension_ground : null,
    extension_reasons: l.extension_reasons,
    responded: respondedOverride === undefined ? day(r.responded_at) : respondedOverride,
  };
}

function limbList(v: string | null | undefined): Check<Limb[]> {
  const parts = (v ?? '').split(/[\s,]+/).filter((x) => x !== '');
  if (parts.length === 0) return { ok: false, why: 'Classify the request: at least one right it engages.' };
  const out: Limb[] = [];
  for (const p of parts) {
    if (!(LIMBS as readonly string[]).includes(p)) return { ok: false, why: `“${p}” is not a right this register records.` };
    if (!out.includes(p as Limb)) out.push(p as Limb);
  }
  return { ok: true, value: out };
}

export function logRequest(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const received = check(momentField(input['received_at'], 'When it was received'));
    if (received === null) return { ok: false, why: 'When it was received is never unknown: the clock starts there. Give the date and time Cap Rebate received it.' };
    const via = input['received_via'] ?? null;
    if (!has(RECEIVED_VIA, via)) return { ok: false, why: 'Say how it arrived — a request is valid however it arrives.' };
    const verbatim = check(requiredText(input['request_verbatim'], 20000, 'What was asked, in their own words'));
    const limbs = check(limbList(input['limbs']));
    const contact_id = check(textField(input['contact_id'], 100, 'The contact'));
    if (contact_id !== null && d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ?', [contact_id]) === undefined) return { ok: false, why: 'That contact was not found.' };
    const lead_id = check(textField(input['lead_id'], 100, 'The lead'));
    if (lead_id !== null && d.db.get<{ id: string }>('SELECT id FROM leads WHERE id = ?', [lead_id]) === undefined) return { ok: false, why: 'That lead was not found.' };
    const forwarded = check(momentField(input['forwarded_at'], 'When it was forwarded'));
    const id = d.newId();
    const at = d.now();
    const ref = d.db.tx(() => {
      const r = nextRef(d.db, 'RR');
      d.db.run(
        'INSERT INTO rights_requests (id, request_ref, received_at, received_via, received_via_detail, forwarded_at, forwarded_by, requester_as_described, ' +
          "request_verbatim, contact_id, lead_id, classification_alternatives, status, recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)",
        [id, r, received, via, check(textField(input['received_via_detail'], 500, 'Where it arrived')), forwarded,
          check(textField(input['forwarded_by'], 200, 'Who forwarded it')), check(textField(input['requester_as_described'], 2000, 'How they describe themselves')),
          verbatim, contact_id, lead_id, check(textField(input['classification_alternatives'], 2000, 'The alternative considered')), actor.id, at, at]);
      for (const limb of limbs) {
        d.db.run('INSERT INTO rights_request_limbs (id, request_id, limb, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [d.newId(), id, limb, at, at]);
      }
      return r;
    });
    record(d, actor, 'RIGHTS_REQUEST_LOGGED', 'ALLOWED', 'rights_request', id, { ref, via, limbs });
    return { ok: true, id };
  });
}

const REQUEST_TEXT: readonly (readonly [string, number, string])[] = [
  ['requester_as_described', 2000, 'How they describe themselves'], ['classification_alternatives', 2000, 'The alternative considered'],
  ['identity_standard_applied', 2000, 'The identity standard applied'], ['authority_grantor', 300, 'Who granted the authority'],
  ['clarification', 2000, 'The clarification'], ['search_scope', 4000, 'What was searched'], ['records_found', 4000, 'What was found'],
  ['response_route', 300, 'How the response went'], ['outcome', 2000, 'What happened to the data'], ['received_via_detail', 500, 'Where it arrived'],
  ['forwarded_by', 200, 'Who forwarded it'],
];
const REQUEST_MOMENTS: readonly (readonly [string, string])[] = [
  ['forwarded_at', 'When it was forwarded'], ['id_requested_at', 'When identity was asked for'], ['id_received_at', 'When identity arrived'],
  ['fee_charged_at', 'When a fee was charged'], ['fee_paid_at', 'When the fee was paid'], ['restriction_applied_at', 'When the records were restricted'],
  ['responded_at', 'When the response was sent'],
];

export function updateRequest(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const r = loadRequest(d.db, id);
    if (r.status === 'CLOSED') return { ok: false, why: 'A closed request is kept as it was.' };
    const next: Record<string, string | null> = {};
    const cur = r as unknown as Record<string, string | null>;
    for (const [k, max, what] of REQUEST_TEXT) next[k] = Object.hasOwn(input, k) ? check(textField(input[k], max, what)) : (cur[k] ?? null);
    for (const [k, what] of REQUEST_MOMENTS) next[k] = Object.hasOwn(input, k) ? check(momentField(input[k], what)) : (cur[k] ?? null);
    const vocab = (k: string, v: Vocab, what: string): string | null => (Object.hasOwn(input, k) ? check(vocabField(input[k], v, what)) : (cur[k] ?? null));
    next['identity_status'] = vocab('identity_status', IDENTITY_STATUS, 'The identity status');
    next['identity_route'] = vocab('identity_route', IDENTITY_ROUTES, 'The identity route');
    next['identity_outcome'] = vocab('identity_outcome', IDENTITY_OUTCOMES, 'The identity outcome');
    next['status'] = Object.hasOwn(input, 'status') ? check(vocabField(input['status'], REQUEST_STATUS, 'The status')) : r.status;
    if (next['status'] === 'CLOSED' || next['status'] === null) return { ok: false, why: 'A request is closed by the closing form, which checks the response.' };
    const fee = Object.hasOwn(input, 'fee_status') ? check(vocabField(input['fee_status'], FEE_STATUS, 'The fee status')) : r.fee_status;
    const evidence = Object.hasOwn(input, 'identity_evidence') ? (input['identity_evidence'] ?? '').split(/[\s,]+/).filter((x) => x !== '') : null;
    if (evidence !== null && evidence.some((e) => !has(IDENTITY_EVIDENCE, e))) return { ok: false, why: 'The identity evidence is not one of the kinds the procedure lists.' };
    const search = Object.hasOwn(input, 'search_done_on') ? check(dateField(input['search_done_on'], 'The date of the search')) : r.search_done_on;
    if (next['identity_route'] !== 'A' && next['authority_grantor'] !== null) return { ok: false, why: 'Who granted the authority is recorded on Route A only, and left empty otherwise.' };
    const probe = limbClockProbe(d.db, r, next);
    if (probe !== null) return { ok: false, why: probe };
    const changed = [...REQUEST_TEXT.map((x) => x[0]), ...REQUEST_MOMENTS.map((x) => x[0]), 'identity_status', 'identity_route', 'identity_outcome', 'status']
      .filter((k) => next[k] !== (cur[k] ?? null));
    d.db.run(
      'UPDATE rights_requests SET requester_as_described = ?, classification_alternatives = ?, identity_standard_applied = ?, authority_grantor = ?, ' +
        'clarification = ?, search_scope = ?, records_found = ?, response_route = ?, outcome = ?, received_via_detail = ?, forwarded_by = ?, ' +
        'forwarded_at = ?, id_requested_at = ?, id_received_at = ?, fee_charged_at = ?, fee_paid_at = ?, restriction_applied_at = ?, responded_at = ?, ' +
        'identity_status = ?, identity_route = ?, identity_outcome = ?, identity_evidence = ?, fee_status = ?, search_done_on = ?, status = ?, updated_at = ? WHERE id = ?',
      [next['requester_as_described'] ?? null, next['classification_alternatives'] ?? null, next['identity_standard_applied'] ?? null, next['authority_grantor'] ?? null,
        next['clarification'] ?? null, next['search_scope'] ?? null, next['records_found'] ?? null, next['response_route'] ?? null, next['outcome'] ?? null,
        next['received_via_detail'] ?? null, next['forwarded_by'] ?? null, next['forwarded_at'] ?? null, next['id_requested_at'] ?? null,
        next['id_received_at'] ?? null, next['fee_charged_at'] ?? null, next['fee_paid_at'] ?? null, next['restriction_applied_at'] ?? null,
        next['responded_at'] ?? null, next['identity_status'] ?? null, next['identity_route'] ?? null, next['identity_outcome'] ?? null,
        evidence === null ? r.identity_evidence : JSON.stringify(evidence), fee, search, next['status'] ?? r.status, d.now(), id]);
    record(d, actor, 'RIGHTS_REQUEST_UPDATED', 'ALLOWED', 'rights_request', id, { ref: r.request_ref, fields: changed });
    return { ok: true, id };
  });
}

/** Every limb's clock must still be computable from what the request now says — a date the Article cannot produce is refused. */
function limbClockProbe(db: Db, r: RequestRow, next: Record<string, string | null>): string | null {
  const merged = { ...r, ...next } as RequestRow;
  for (const l of db.all<LimbRow>(`${LIMB_SELECT}WHERE request_id = ?`, [r.id])) {
    try { limbClock(clockInput(merged, l)); } catch (e) { if (e instanceof ClockInputError || e instanceof RangeError) return e.message; throw e; }
  }
  return null;
}

export function recordLimb(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const r = loadRequest(d.db, id);
    if (r.status === 'CLOSED') return { ok: false, why: 'A closed request is kept as it was.' };
    const limb = input['limb'] ?? null;
    if (limb === null || !(LIMBS as readonly string[]).includes(limb)) return { ok: false, why: 'Choose the right this is about.' };
    const existing = d.db.get<LimbRow>(`${LIMB_SELECT}WHERE request_id = ? AND limb = ?`, [id, limb]);
    const cur = (existing ?? {}) as Record<string, string | null>;
    const moment = (k: string, what: string): string | null => (Object.hasOwn(input, k) ? check(momentField(input[k], what)) : (cur[k] ?? null));
    const text = (k: string, max: number, what: string): string | null => (Object.hasOwn(input, k) ? check(textField(input[k], max, what)) : (cur[k] ?? null));
    const next: LimbRow = {
      id: existing?.id ?? d.newId(), request_id: id, limb,
      clarification_requested_at: moment('clarification_requested_at', 'When clarification was asked for'),
      clarification_received_at: moment('clarification_received_at', 'When clarification arrived'),
      extension_notified_at: moment('extension_notified_at', 'When notice of the extension was given'),
      extension_ground: Object.hasOwn(input, 'extension_ground') ? check(vocabField(input['extension_ground'], EXTENSION_GROUND_WORDS, 'The ground')) : (cur['extension_ground'] ?? null),
      extension_reasons: text('extension_reasons', 4000, 'The reasons given'),
      decision: Object.hasOwn(input, 'decision') ? check(vocabField(input['decision'], LIMB_DECISIONS, 'The decision')) : (cur['decision'] ?? null),
      decision_reasoning: text('decision_reasoning', 8000, 'Why'),
      undue_delay_assessment: text('undue_delay_assessment', 2000, 'The undue-delay assessment'),
    };
    if (next.decision !== null && next.decision_reasoning === null) return { ok: false, why: 'Give the reasoning. A decision with no reasons does not count.' };
    limbClock(clockInput(r, next));
    const at = d.now();
    if (existing === undefined) {
      d.db.run(
        'INSERT INTO rights_request_limbs (id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, ' +
          'extension_reasons, decision, decision_reasoning, undue_delay_assessment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [next.id, id, limb, next.clarification_requested_at, next.clarification_received_at, next.extension_notified_at, next.extension_ground,
          next.extension_reasons, next.decision, next.decision_reasoning, next.undue_delay_assessment, at, at]);
    } else {
      d.db.run(
        'UPDATE rights_request_limbs SET clarification_requested_at = ?, clarification_received_at = ?, extension_notified_at = ?, extension_ground = ?, ' +
          'extension_reasons = ?, decision = ?, decision_reasoning = ?, undue_delay_assessment = ?, updated_at = ? WHERE id = ?',
        [next.clarification_requested_at, next.clarification_received_at, next.extension_notified_at, next.extension_ground, next.extension_reasons,
          next.decision, next.decision_reasoning, next.undue_delay_assessment, at, next.id]);
    }
    record(d, actor, 'RIGHTS_REQUEST_LIMB_RECORDED', 'ALLOWED', 'rights_request', id, { ref: r.request_ref, limb, decision: next.decision });
    return { ok: true, id };
  });
}

function checklist(input: Fields, items: Vocab): Record<string, boolean> {
  return Object.fromEntries(Object.keys(items).map((k) => [k, input[`check_${k}`] === 'on' || input[`check_${k}`] === 'YES']));
}

export function closeRequest(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const r = loadRequest(d.db, id);
    if (r.status === 'CLOSED') return { ok: false, why: 'This request is closed already.' };
    const limbs = d.db.all<LimbRow>(`${LIMB_SELECT}WHERE request_id = ?`, [id]);
    const missing: string[] = [];
    if (r.responded_at === null) missing.push('when the response was sent');
    if (r.search_scope === null) missing.push('what was searched — “nothing found” with no search is not an answer');
    for (const l of limbs) {
      if (l.decision === null) missing.push(`a decision on the ${LIMB_WORDS[l.limb] ?? l.limb} limb`);
      if (l.undue_delay_assessment === null) missing.push(`an undue-delay assessment on the ${LIMB_WORDS[l.limb] ?? l.limb} limb`);
    }
    const access = limbs.some((l) => l.limb === 'ART_15' && (l.decision === 'GRANTED' || l.decision === 'PARTLY_GRANTED'));
    const refusal = limbs.some((l) => l.decision === 'REFUSED' || l.decision === 'PARTLY_GRANTED');
    const content: Record<string, Record<string, boolean>> = {};
    if (access) content['access'] = checklist(input, ACCESS_RESPONSE_ITEMS);
    if (refusal) content['refusal'] = checklist(input, REFUSAL_RESPONSE_ITEMS);
    for (const [part, items] of Object.entries(content)) {
      const vocab = part === 'access' ? ACCESS_RESPONSE_ITEMS : REFUSAL_RESPONSE_ITEMS;
      for (const [k, ticked] of Object.entries(items)) if (!ticked) missing.push(`the response to state: ${vocab[k] ?? k}`);
    }
    if (missing.length > 0) return { ok: false, why: `Not closed — it still needs ${missing.join('; ')}.` };
    const at = d.now();
    d.db.run("UPDATE rights_requests SET status = 'CLOSED', response_content_check = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify({ checked_at: at, ...content }), at, actor.id, at, id]);
    record(d, actor, 'RIGHTS_REQUEST_CLOSED', 'ALLOWED', 'rights_request', id, { ref: r.request_ref });
    return { ok: true, id };
  });
}

export type LimbView = { readonly row: LimbRow; readonly label: string; readonly clock: LimbClock | null; readonly clock_error: string | null };

export type RequestView = {
  readonly request: RequestRow;
  readonly limbs: readonly LimbView[];
  readonly links: readonly LinkLine[];
  readonly holds: readonly HoldRow[];
  readonly limitation: string;
  readonly letters: readonly { kind: string; label: string }[];
  readonly draft_note: string;
};

function limbViews(db: Db, r: RequestRow): LimbView[] {
  return db.all<LimbRow>(`${LIMB_SELECT}WHERE request_id = ? ORDER BY limb`, [r.id]).map((l) => {
    try { return { row: l, label: LIMB_WORDS[l.limb] ?? l.limb, clock: limbClock(clockInput(r, l)), clock_error: null }; } catch (e) {
      return { row: l, label: LIMB_WORDS[l.limb] ?? l.limb, clock: null, clock_error: (e as Error).message };
    }
  });
}

export function requestView(db: Db, actor: Actor, id: string): RequestView {
  assertComplianceRead(actor);
  const r = loadRequest(db, id);
  return {
    request: r, limbs: limbViews(db, r), links: linksFor(db, 'RIGHTS_REQUEST', id), holds: holdsForEntry(db, 'rights_request_id', id),
    limitation: TWO_PERSON_LIMITATION, draft_note: LETTER_DRAFT_NOTE,
    letters: Object.entries(LETTERS).filter(([, v]) => v.register === 'RIGHTS_REQUEST').map(([kind, v]) => ({ kind, label: v.label })),
  };
}

export type RegisterLine = { id: string; ref: string; received: string; status: string; limbs: string; next_deadline: string; waiting: string };

export function rightsRegister(db: Db, actor: Actor): RegisterLine[] {
  assertComplianceRead(actor);
  return db.all<RequestRow>(`${REQUEST_SELECT}ORDER BY received_at DESC LIMIT 500`).map((r) => {
    const views = limbViews(db, r);
    const ends = views.map((v) => v.clock?.applicable_period_end?.end ?? null).filter((x): x is string => x !== null).sort();
    const waits = views.flatMap((v) => v.clock?.waiting_on ?? (v.clock_error === null ? [] : [v.clock_error]));
    return {
      id: r.id, ref: r.request_ref, received: ukDay(r.received_at), status: words(REQUEST_STATUS, r.status, r.status),
      limbs: views.map((v) => v.label).join(', '),
      next_deadline: r.status === 'CLOSED' ? 'closed' : (ends[0] ?? 'none computable yet'),
      waiting: waits.join('; '),
    };
  });
}

/* ================================================================== *
 * 4 · THE COMPLAINTS LOG
 * ================================================================== */

type ComplaintRow = {
  id: string; complaint_ref: string; received_at: string; received_via: string; received_via_detail: string | null; forwarded_at: string | null;
  forwarded_by: string | null; complainant_as_described: string | null; complaint_verbatim: string; business_id: string | null; claim_id: string | null;
  contact_id: string | null; person_ref: string | null; is_164a: string | null; classification_reason: string | null; classified_at: string | null;
  limb: string | null; alleged_infringement: string | null; infringement_mapping: string | null; acknowledged_at: string | null;
  acknowledged_route: string | null; enquiries_made: string | null; outcome: string | null; out_of_scope_route: string | null;
  outcome_reasoning: string | null; outcome_notified_at: string | null; undue_delay_assessment: string | null; onward_route_given: string | null;
  decided_by: string | null; decided_by_reason: string | null; countersigned_by: string | null; countersigner_view: string | null;
  lessons_and_changes: string | null; status: string; closed_at: string | null; created_at: string; updated_at: string;
};

function loadComplaint(db: Db, id: string): ComplaintRow {
  const r = db.get<ComplaintRow>('SELECT * FROM complaints WHERE id = ?', [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

function classify(input: Fields): Check<{ is_164a: string; reason: string } | null> {
  const v = input['is_164a'] ?? null;
  if (v === null || v.trim() === '') return { ok: true, value: null };
  if (!has(IS_164A, v)) return { ok: false, why: 'The classification is yes, no or both.' };
  const reason = textField(input['classification_reason'], 2000, 'The reason for the classification');
  if (!reason.ok) return reason;
  if (reason.value === null) return { ok: false, why: 'A classification carries its reason, dated — it is what makes the log countable.' };
  return { ok: true, value: { is_164a: v, reason: reason.value } };
}

export function logComplaint(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const received = check(momentField(input['received_at'], 'When it was received'));
    if (received === null) return { ok: false, why: 'When it was received is never unknown: the thirty days run from it.' };
    const via = input['received_via'] ?? null;
    if (!has(COMPLAINT_VIA, via)) return { ok: false, why: 'Say how it arrived — a complaint counts however it arrives.' };
    const verbatim = check(requiredText(input['complaint_verbatim'], 20000, 'What they said, in their own words'));
    const business_id = check(textField(input['business_id'], 100, 'The organisation'));
    const claim_id = check(textField(input['claim_id'], 100, 'The claim'));
    if (business_id !== null && d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [business_id]) === undefined) return { ok: false, why: 'That organisation was not found.' };
    if (claim_id !== null && (business_id === null || d.db.get<{ id: string }>('SELECT id FROM claims WHERE id = ? AND business_id = ?', [claim_id, business_id]) === undefined)) {
      return { ok: false, why: 'The claim must be one of the organisation’s.' };
    }
    const contact_id = check(textField(input['contact_id'], 100, 'The contact'));
    if (contact_id !== null && d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ?', [contact_id]) === undefined) return { ok: false, why: 'That contact was not found.' };
    const cls = check(classify(input));
    const id = d.newId();
    const at = d.now();
    const ref = d.db.tx(() => {
      const r = nextRef(d.db, 'CP');
      d.db.run(
        'INSERT INTO complaints (id, complaint_ref, received_at, received_via, received_via_detail, forwarded_at, forwarded_by, complainant_as_described, ' +
          'complaint_verbatim, business_id, claim_id, contact_id, is_164a, classification_reason, classified_at, classified_by, status, recorded_by, created_at, updated_at) ' +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)",
        [id, r, received, via, check(textField(input['received_via_detail'], 500, 'Where it arrived')), check(momentField(input['forwarded_at'], 'When it was forwarded')),
          check(textField(input['forwarded_by'], 200, 'Who forwarded it')), check(textField(input['complainant_as_described'], 2000, 'How they describe themselves')),
          verbatim, business_id, claim_id, contact_id, cls?.is_164a ?? null, cls?.reason ?? null, cls === null ? null : at, cls === null ? null : actor.id,
          actor.id, at, at]);
      return r;
    });
    record(d, actor, 'COMPLAINT_LOGGED', 'ALLOWED', 'complaint', id, { ref, via, classified: cls?.is_164a ?? 'NOT_YET' });
    return { ok: true, id };
  });
}

export function classifyComplaint(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadComplaint(d.db, id);
    if (c.is_164a !== null) return { ok: false, why: 'This complaint was classified when it arrived. A classification is never changed once made.' };
    const cls = check(classify(input));
    if (cls === null) return { ok: false, why: 'Choose the classification.' };
    const at = d.now();
    d.db.run('UPDATE complaints SET is_164a = ?, classification_reason = ?, classified_at = ?, classified_by = ?, updated_at = ? WHERE id = ?',
      [cls.is_164a, cls.reason, at, actor.id, at, id]);
    record(d, actor, 'COMPLAINT_CLASSIFIED', 'ALLOWED', 'complaint', id, { ref: c.complaint_ref, is_164a: cls.is_164a });
    return { ok: true, id };
  });
}

const COMPLAINT_TEXT: readonly (readonly [string, number, string])[] = [
  ['alleged_infringement', 4000, 'What they say went wrong'], ['infringement_mapping', 2000, 'Our mapping to a provision'],
  ['acknowledged_route', 300, 'How the acknowledgement went'], ['enquiries_made', 8000, 'What was looked into, and why that extent'],
  ['out_of_scope_route', 2000, 'The route given'], ['outcome_reasoning', 8000, 'Why that outcome'], ['undue_delay_assessment', 2000, 'The undue-delay assessment'],
  ['decided_by', 200, 'Who decided'], ['decided_by_reason', 2000, 'Why somebody other than the DPO decided'], ['countersigned_by', 200, 'Who countersigned'],
  ['countersigner_view', 4000, 'The countersigner’s own view'], ['lessons_and_changes', 4000, 'What changed as a result'],
];

export function updateComplaint(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadComplaint(d.db, id);
    if (c.status === 'CLOSED') return { ok: false, why: 'A closed complaint is kept as it was.' };
    const cur = c as unknown as Record<string, string | null>;
    const next: Record<string, string | null> = {};
    for (const [k, max, what] of COMPLAINT_TEXT) next[k] = Object.hasOwn(input, k) ? check(textField(input[k], max, what)) : (cur[k] ?? null);
    next['acknowledged_at'] = Object.hasOwn(input, 'acknowledged_at') ? check(momentField(input['acknowledged_at'], 'When it was acknowledged')) : c.acknowledged_at;
    next['outcome_notified_at'] = Object.hasOwn(input, 'outcome_notified_at') ? check(momentField(input['outcome_notified_at'], 'When the outcome was told')) : c.outcome_notified_at;
    next['limb'] = Object.hasOwn(input, 'limb') ? check(vocabField(input['limb'], COMPLAINT_LIMBS, 'The limb')) : c.limb;
    next['outcome'] = Object.hasOwn(input, 'outcome') ? check(vocabField(input['outcome'], COMPLAINT_OUTCOMES, 'The outcome')) : c.outcome;
    if (next['outcome'] === 'OUT_OF_SCOPE_ROUTE_GIVEN' && (c.is_164a !== 'NO' || next['out_of_scope_route'] === null)) {
      return { ok: false, why: 'Out of scope is available only for a complaint classified as not a s.164A complaint, and needs the route given.' };
    }
    if (next['acknowledged_at'] !== null && next['acknowledged_at'] < c.received_at) return { ok: false, why: 'It cannot have been acknowledged before it was received.' };
    const status = next['outcome_notified_at'] !== null ? 'OUTCOME_NOTIFIED' : next['acknowledged_at'] !== null ? 'ACKNOWLEDGED' : 'OPEN';
    d.db.run(
      'UPDATE complaints SET alleged_infringement = ?, infringement_mapping = ?, acknowledged_route = ?, enquiries_made = ?, out_of_scope_route = ?, ' +
        'outcome_reasoning = ?, undue_delay_assessment = ?, decided_by = ?, decided_by_reason = ?, countersigned_by = ?, countersigner_view = ?, ' +
        'lessons_and_changes = ?, acknowledged_at = ?, outcome_notified_at = ?, limb = ?, outcome = ?, status = ?, updated_at = ? WHERE id = ?',
      [next['alleged_infringement'] ?? null, next['infringement_mapping'] ?? null, next['acknowledged_route'] ?? null, next['enquiries_made'] ?? null,
        next['out_of_scope_route'] ?? null, next['outcome_reasoning'] ?? null, next['undue_delay_assessment'] ?? null, next['decided_by'] ?? null,
        next['decided_by_reason'] ?? null, next['countersigned_by'] ?? null, next['countersigner_view'] ?? null, next['lessons_and_changes'] ?? null,
        next['acknowledged_at'] ?? null, next['outcome_notified_at'] ?? null, next['limb'] ?? null, next['outcome'] ?? null, status, d.now(), id]);
    record(d, actor, 'COMPLAINT_UPDATED', 'ALLOWED', 'complaint', id, {
      ref: c.complaint_ref, fields: Object.keys(next).filter((k) => next[k] !== (cur[k] ?? null)), outcome: next['outcome'] ?? null,
    });
    return { ok: true, id };
  });
}

export function addProgressUpdate(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadComplaint(d.db, id);
    if (c.status === 'CLOSED') return { ok: false, why: 'A closed complaint is kept as it was.' };
    const on = check(dateField(input['told_on'], 'The date they were told'));
    if (on === null) return { ok: false, why: 'Date the update.' };
    const said = check(requiredText(input['said'], 4000, 'What they were told'));
    const pid = d.newId();
    d.db.run('INSERT INTO complaint_progress_updates (id, complaint_id, told_on, said, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', [pid, id, on, said, actor.id, d.now()]);
    record(d, actor, 'COMPLAINT_PROGRESS_RECORDED', 'ALLOWED', 'complaint', id, { ref: c.complaint_ref, told_on: on });
    return { ok: true, id };
  });
}

export function closeComplaint(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadComplaint(d.db, id);
    if (c.status === 'CLOSED') return { ok: false, why: 'This complaint is closed already.' };
    const routes = checklist(input, ONWARD_ROUTE_ITEMS);
    const missing: string[] = [];
    if (c.is_164a === null) missing.push('its classification');
    if (c.acknowledged_at === null) missing.push('the acknowledgement, or the record that it was not acknowledged in time');
    if (c.outcome === null) missing.push('the outcome');
    if (c.outcome_reasoning === null) missing.push('the reasoning for the outcome');
    if (c.outcome_notified_at === null) missing.push('when the complainant was told the outcome — an outcome they have not been told is not an outcome');
    if (c.undue_delay_assessment === null) missing.push('the undue-delay assessment');
    if (c.lessons_and_changes === null) missing.push('what changed as a result, including that nothing needed to');
    if (c.decided_by === null) missing.push('who decided');
    for (const [k, ticked] of Object.entries(routes)) if (!ticked) missing.push(`the outcome letter to give: ${ONWARD_ROUTE_ITEMS[k] ?? k}`);
    if (missing.length > 0) return { ok: false, why: `Not closed — it still needs ${missing.join('; ')}.` };
    const at = d.now();
    d.db.run("UPDATE complaints SET status = 'CLOSED', onward_route_given = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify({ checked_at: at, ...routes }), at, actor.id, at, id]);
    record(d, actor, 'COMPLAINT_CLOSED', 'ALLOWED', 'complaint', id, { ref: c.complaint_ref });
    return { ok: true, id };
  });
}

export type ComplaintView = {
  readonly complaint: ComplaintRow;
  readonly ack: AckClock;
  readonly progress: readonly { told_on: string; said: string }[];
  readonly links: readonly LinkLine[];
  readonly holds: readonly HoldRow[];
  readonly limitation: string;
  readonly letters: readonly { kind: string; label: string }[];
  readonly draft_note: string;
  readonly no_deadline_note: string;
};

export function complaintView(db: Db, actor: Actor, id: string): ComplaintView {
  assertComplianceRead(actor);
  const c = loadComplaint(db, id);
  return {
    complaint: c, ack: acknowledgementClock(ukDay(c.received_at), day(c.acknowledged_at)),
    progress: db.all<{ told_on: string; said: string }>('SELECT told_on, said FROM complaint_progress_updates WHERE complaint_id = ? ORDER BY told_on', [id]),
    links: linksFor(db, 'COMPLAINT', id), holds: holdsForEntry(db, 'complaint_id', id), limitation: TWO_PERSON_LIMITATION,
    letters: Object.entries(LETTERS).filter(([, v]) => v.register === 'COMPLAINT').map(([kind, v]) => ({ kind, label: v.label })),
    draft_note: LETTER_DRAFT_NOTE,
    no_deadline_note: 'There is no fixed last day for the answer. The law says “without undue delay” (s.164A(4)). The progress updates and the undue-delay assessment show we met it.',
  };
}

export function complaintsLog(db: Db, actor: Actor): { id: string; ref: string; received: string; classified: string; ack_deadline: string; ack_in_time: string; status: string }[] {
  assertComplianceRead(actor);
  return db.all<ComplaintRow>('SELECT * FROM complaints ORDER BY received_at DESC LIMIT 500').map((c) => {
    const ack = acknowledgementClock(ukDay(c.received_at), day(c.acknowledged_at));
    return {
      id: c.id, ref: c.complaint_ref, received: ukDay(c.received_at), classified: c.is_164a === null ? 'NOT CLASSIFIED' : words(IS_164A, c.is_164a, c.is_164a),
      ack_deadline: ack.acknowledgement_deadline, ack_in_time: ack.ack_in_time ?? 'not acknowledged yet', status: c.status,
    };
  });
}

export type ComplaintCount = { from: string; to: string; s164a: number; not_164a: number; unclassified: number; definition: string };

/** THE s.164B COUNT: complaints received in the period classified YES or BOTH. An unclassified complaint is counted apart, never as no. */
export function complaintCount(db: Db, actor: Actor, from: string, to: string): ComplaintCount {
  assertComplianceRead(actor);
  const rows = db.all<{ received_at: string; is_164a: string | null }>('SELECT received_at, is_164a FROM complaints');
  const inside = rows.filter((r) => ukDay(r.received_at) >= from && ukDay(r.received_at) <= to);
  return {
    from, to,
    s164a: inside.filter((r) => r.is_164a === 'YES' || r.is_164a === 'BOTH').length,
    not_164a: inside.filter((r) => r.is_164a === 'NO').length,
    unclassified: inside.filter((r) => r.is_164a === null).length,
    definition: 'A s.164A complaint is one classified as YES or BOTH when it arrived. It is counted by the UK day it was received.',
  };
}

/* ================================================================== *
 * 5 · THE SEARCH — a person, wherever this application holds them
 * ================================================================== */

export type SearchHit = { readonly store: string; readonly how: string; readonly id: string; readonly label: string; readonly link: string | null };
export type SearchResult = { readonly hits: readonly SearchHit[]; readonly scope: readonly string[]; readonly s2_note: string };

export const SEARCH_SCOPE: readonly string[] = Object.freeze([
  'contacts on an organisation', 'contacts on a lead with no organisation', 'people at an introducing firm',
  'staff tasks naming a contact found', 'document requests to an organisation found', 'client logins',
  'the share-progress and consent answers of anyone found', 'the rights-request register', 'the complaints log',
]);

export function searchPerson(d: ComplianceDeps, actor: Actor, term: string): SearchResult {
  assertComplianceRead(actor);
  const t = term.trim().toLowerCase();
  if (t.length < 2) return { hits: [], scope: SEARCH_SCOPE, s2_note: S2_NOTE };
  const escaped = t.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = ['%', escaped, '%'].join('');
  const db = d.db;
  const hits: SearchHit[] = [];
  const contacts = db.all<{ id: string; full_name: string; business_id: string | null; lead_id: string | null; introducer_id: string | null; org: string | null }>(
    "SELECT c.id, c.full_name, c.business_id, c.lead_id, c.introducer_id, COALESCE(b.name, l.prospect_organisation, i.firm_name) AS org FROM contacts c " +
      'LEFT JOIN businesses b ON b.id = c.business_id LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN introducers i ON i.id = c.introducer_id ' +
      "WHERE lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.phone, '')) LIKE ? ESCAPE '\\' LIMIT 200",
    [pattern, pattern, pattern]);
  for (const c of contacts) {
    const how = c.introducer_id !== null ? 'at an introducing firm' : c.business_id !== null ? 'through an organisation' : 'through a lead with no organisation';
    hits.push({ store: 'contacts', how, id: c.id, label: `${c.full_name} — ${c.org ?? ''}`, link: `/staff/compliance/consent/${c.id}` });
    for (const task of db.all<{ id: string; title: string }>('SELECT id, title FROM staff_tasks WHERE contact_id = ?', [c.id])) {
      hits.push({ store: 'staff_tasks', how: 'a task naming them', id: task.id, label: task.title, link: `/staff/tasks/${task.id}` });
    }
    if (c.business_id !== null) {
      for (const r of db.all<{ id: string; requested_type: string | null }>("SELECT id, requested_type FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT'", [c.business_id])) {
        hits.push({ store: 'client_tasks', how: 'a document request to their organisation', id: r.id, label: r.requested_type ?? 'a document', link: null });
      }
    }
    for (const s of db.all<{ id: string; decision: string }>(
      'SELECT id, decision FROM introducer_share_consents WHERE (business_id IS NOT NULL AND business_id = ?) OR (lead_id IS NOT NULL AND lead_id = ?)', [c.business_id, c.lead_id])) {
      hits.push({ store: 'introducer_share_consents', how: 'a share-progress answer for their organisation or lead', id: s.id, label: s.decision, link: null });
    }
    for (const e of db.all<{ id: string; kind: string; decision: string }>('SELECT id, kind, decision FROM consent_answers WHERE contact_id = ?', [c.id])) {
      hits.push({ store: 'consent_answers', how: 'a consent answer', id: e.id, label: `${e.kind} ${e.decision}`, link: `/staff/compliance/consent/${c.id}` });
    }
  }
  for (const u of db.all<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM users WHERE role = 'CLIENT' AND (lower(display_name) LIKE ? ESCAPE '\\' OR email_canonical LIKE ? ESCAPE '\\') LIMIT 100", [pattern, pattern])) {
    hits.push({ store: 'users', how: 'a client login', id: u.id, label: u.display_name, link: null });
  }
  for (const r of db.all<{ id: string; request_ref: string }>(
    "SELECT id, request_ref FROM rights_requests WHERE lower(COALESCE(requester_as_described, '')) LIKE ? ESCAPE '\\' OR lower(request_verbatim) LIKE ? ESCAPE '\\' LIMIT 100", [pattern, pattern])) {
    hits.push({ store: 'rights_requests', how: 'an earlier request', id: r.id, label: r.request_ref, link: `/staff/compliance/rights/${r.id}` });
  }
  for (const c of db.all<{ id: string; complaint_ref: string }>(
    "SELECT id, complaint_ref FROM complaints WHERE lower(COALESCE(complainant_as_described, '')) LIKE ? ESCAPE '\\' OR lower(complaint_verbatim) LIKE ? ESCAPE '\\' LIMIT 100", [pattern, pattern])) {
    hits.push({ store: 'complaints', how: 'a complaint', id: c.id, label: c.complaint_ref, link: `/staff/compliance/complaints/${c.id}` });
  }
  const counts: Record<string, number> = {};
  for (const h of hits) counts[h.store] = (counts[h.store] ?? 0) + 1;
  record(d, actor, 'RIGHTS_SEARCH_RUN', 'ALLOWED', 'compliance', 'rights-search', { counts, total: hits.length });
  return { hits, scope: SEARCH_SCOPE, s2_note: S2_NOTE };
}

export const S2_NOTE =
  'This search does not reach inside a document. A person printed on one is in S2, the identity store — searched separately, where every search is logged.';
