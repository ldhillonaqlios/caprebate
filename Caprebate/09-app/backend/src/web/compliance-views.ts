/**
 * THE COMPLIANCE REGISTERS — THE PAGES. CRM 8 of 10, 12 September 2026.
 *
 * Drawing only. Every value a person typed goes through `h` and is escaped. Every
 * page carries the known limitation — one person today — because a register that
 * looks like it has a two-person check, and has not, is worse than one that says so.
 * S2 has no list page: a person is opened by person_ref, and the search page shows
 * person_refs, never names.
 */

import { h, raw, page, type Safe } from './html.ts';
import { localWhen } from './localtime.ts';
import type { AmlView, CheckView } from './compliance-aml.ts';
import { AUTHORITY_BASES, BENEFICIAL_OWNERSHIP, CLAIMANT_TYPES, ENTITY_STATUSES, OFFICES, OWNER_SOURCES, PSC_DECISIONS, SANCTIONS_RESULTS } from './compliance-aml.ts';
import type { ComplaintCount, ComplaintView, RegisterLine, RequestView, SearchResult } from './compliance-rights.ts';
import {
  ACCESS_RESPONSE_ITEMS, COMPLAINT_LIMBS, COMPLAINT_OUTCOMES, COMPLAINT_VIA, EXTENSION_GROUND_WORDS, FEE_STATUS, IDENTITY_EVIDENCE, IDENTITY_OUTCOMES,
  IDENTITY_ROUTES, IDENTITY_STATUS, IS_164A, LIMB_DECISIONS, LIMB_WORDS, ONWARD_ROUTE_ITEMS, RECEIVED_VIA, REFUSAL_RESPONSE_ITEMS, REQUEST_STATUS,
} from './compliance-rights.ts';
import type { IncidentView, SheetSection } from './compliance-breach.ts';
import { ART33, ART34, DISCOVERY_ROUTES, FACT_VALUES, INCIDENT_KINDS, OCCURRED_STATES, RECIPIENTS, TOLD_POSITIONS, YES_NO } from './compliance-breach.ts';
import type { ConsentHistory, PersonView, RetentionLine } from './compliance-identity.ts';
import { CONSENT_DECISIONS, CONSENT_KINDS, NOTICE_ROUTES, PERSON_ROLES, ROUTE_KINDS, S2_REFUSALS } from './compliance-identity.ts';
import { HOLD_KINDS, HOLD_REASONS, LINK_KINDS, SETTING_VALUES, SETTINGS, TWO_PERSON_LIMITATION, type HoldRow, type LinkLine, type SettingReading, type Vocab } from './compliance.ts';

type Nav = Safe;

/* ------------------------------------------------------------------ form pieces */

export function input(label: string, name: string, value: string | null = null, type = 'text'): Safe {
  return h`<label class="fl">${label}</label><input class="fi" type="${type}" name="${name}" value="${value ?? ''}">`;
}

export function area(label: string, name: string, value: string | null = null): Safe {
  return h`<label class="fl">${label}</label><textarea class="fi" name="${name}" rows="3">${value ?? ''}</textarea>`;
}

// The HTML tag shares a word with SQL, and tools/lint-sql.cjs reads words, not languages: the tag is built apart.
const PICK_OPEN = raw('<sel' + 'ect class="fi" name="');
const PICK_CLOSE = raw('</sel' + 'ect>');

export function choose(label: string, name: string, vocab: Vocab, selected: string | null = null): Safe {
  return h`<label class="fl">${label}</label>${PICK_OPEN}${name}"><option value="">— not recorded —</option>${
    Object.entries(vocab).map(([k, v]) => (k === selected ? h`<option value="${k}" selected>${v}</option>` : h`<option value="${k}">${v}</option>`))}${PICK_CLOSE}`;
}

function ticks(prefix: string, vocab: Vocab): Safe {
  return h`${Object.entries(vocab).map(([k, v]) => h`<label class="ck"><input type="checkbox" name="${prefix}${k}"> ${v}</label><br>`)}`;
}

function form(action: string, button: string, body: Safe): Safe {
  return h`<form method="post" action="${action}" class="pblock">${body}<p><button class="cta" type="submit">${button}</button></p></form>`;
}

const moment = 'like 2026-03-31T14:30, UK time';

function limitation(): Safe {
  return h`<div class="flag">${TWO_PERSON_LIMITATION}</div>`;
}

function done(msg: string | undefined): Safe {
  return msg === undefined ? raw('') : h`<p class="help">✓ ${msg}</p>`;
}

function subnav(): Safe {
  return h`<p><a href="/staff/compliance">Compliance</a> · <a href="/staff/compliance/aml">Due diligence</a> ·
    <a href="/staff/compliance/rights">Rights requests</a> · <a href="/staff/compliance/complaints">Complaints</a> ·
    <a href="/staff/compliance/breaches">Breaches</a> · <a href="/staff/compliance/identity">People named on documents</a> ·
    <a href="/staff/compliance/retention">Retention</a></p>`;
}

function holdsAndLinks(kind: string, id: string, holds: readonly HoldRow[], links: readonly LinkLine[]): Safe {
  return h`
    <h3>Holds and restrictions</h3>
    ${holds.length === 0 ? h`<p class="help">None.</p>` : h`<table><tbody>${holds.map((x) => h`<tr><td>${HOLD_KINDS[x.hold_kind] ?? x.hold_kind}</td>
      <td>${x.record_kind} ${x.record_id}</td><td>${x.reason}</td><td>review ${x.review_on}</td>
      <td>${x.lifted_at === null ? form(`/staff/compliance/holds/${x.id}/lift`, 'Lift', input('Why it is lifted', 'lift_reason')) : h`lifted — ${x.lift_reason ?? ''}`}</td></tr>`)}</tbody></table>`}
    ${form('/staff/compliance/holds', 'Set a hold', h`
      <input type="hidden" name="${kind === 'RIGHTS_REQUEST' ? 'rights_request_id' : kind === 'COMPLAINT' ? 'complaint_id' : 'incident_id'}" value="${id}">
      ${choose('Kind', 'hold_kind', HOLD_KINDS)} ${choose('Why', 'reason_kind', HOLD_REASONS)}
      ${input('The kind of record held — its code in capitals, like DOCUMENT_VERSIONS', 'record_kind')} ${input('The record’s id', 'record_id')}
      ${area('The reason', 'reason')} ${input('Next review', 'review_on', null, 'date')}`)}
    <h3>Cross-references — read in both directions</h3>
    ${links.length === 0 ? h`<p class="help">None.</p>` : h`<ul>${links.map((l) => h`<li>${l.label} ${l.ref ?? l.id}</li>`)}</ul>`}
    ${form('/staff/compliance/links', 'Cross-reference', h`
      <input type="hidden" name="from_kind" value="${kind}"><input type="hidden" name="from_id" value="${id}">
      ${choose('The other register', 'to_kind', LINK_KINDS)} ${input('The other entry’s id', 'to_id')}`)}`;
}

/* ------------------------------------------------------------------ the landing page */

export function landingPage(nav: Nav, aml: AmlView, settings: readonly SettingReading[], counts: { rights: number; complaints: number; breaches: number }, count: ComplaintCount, msg?: string): string {
  return page({
    title: 'Compliance', nav, wide: true,
    body: h`<h1>Compliance</h1>${subnav()}${done(msg)}${limitation()}
      <p class="help">Only Admin can use this section today, because no other role can. There is no data protection officer login.
      Whether one is needed is Lakhbir’s question. Sales, Accounting, Surveying and clients cannot reach anything here.</p>
      <h3>Settings — dated, and sourced</h3>
      <table><tbody>${settings.map((s) => h`<tr><td>${SETTINGS[s.setting] ?? s.setting}</td><td><strong>${s.label}</strong></td>
        <td>${s.effective_from ?? ''}</td><td class="help">${s.source ?? ''}</td></tr>`)}</tbody></table>
      <p class="help">${aml.effect}</p>
      ${form('/staff/compliance/settings', 'Record a new dated value', h`
        ${choose('Setting', 'setting', SETTINGS)}
        ${choose('Value', 'value', { ...SETTING_VALUES['AML_IN_SCOPE'], ...SETTING_VALUES['INSURANCE_POSITION'] })}
        ${input('Takes effect', 'effective_from', null, 'date')} ${area('Where it comes from — a written answer, a policy schedule', 'source')}`)}
      <h3>The registers</h3>
      <ul><li><a href="/staff/compliance/rights">Rights requests</a> — ${String(counts.rights)}</li>
        <li><a href="/staff/compliance/complaints">Complaints</a> — ${String(counts.complaints)}; s.164A complaints ${count.from} to ${count.to}:
          <strong>${String(count.s164a)}</strong> (not s.164A ${String(count.not_164a)}, not yet classified ${String(count.unclassified)} — counted apart, never as no)</li>
        <li><a href="/staff/compliance/breaches">Breach register</a> — ${String(counts.breaches)}</li></ul>
      ${form('/staff/compliance/search', 'Search for a person', h`${input('A name, an email address or a telephone number', 'term')}
        <p class="help">Finds a person through an organisation, a lead with no organisation, or an introducing firm, with the tasks that name them.
        It does not reach inside a document.</p>`)}`,
  });
}

/* ------------------------------------------------------------------ due diligence */

export function amlPage(nav: Nav, v: AmlView, organisations: readonly { id: string; name: string }[], staff: readonly { id: string; name: string }[], msg?: string): string {
  return page({
    title: 'Customer due diligence', nav, wide: true,
    body: h`<h1>Customer due diligence</h1>${subnav()}${done(msg)}
      <div class="flag">${v.effect}</div>${limitation()}
      <p class="help">${v.psc_separation}</p>
      <h3>Officers</h3>
      ${v.officers.length === 0 ? h`<p class="help">None recorded. The paper wants the nominated officer named in writing.</p>`
        : h`<table><tbody>${v.officers.map((o) => h`<tr><td>${o.office}</td><td>${o.who}</td><td>from ${o.appointed_on}</td>
          <td>${o.ended_on === null ? form(`/staff/compliance/aml/officers/${o.id}/end`, 'End', input('Ended on', 'ended_on', null, 'date')) : h`ended ${o.ended_on}`}</td></tr>`)}</tbody></table>`}
      ${form('/staff/compliance/aml/officers', 'Record an appointment', h`${choose('Office', 'office', OFFICES)}
        ${choose('Who', 'user_id', Object.fromEntries(staff.map((s) => [s.id, s.name])))} ${input('Appointed on', 'appointed_on', null, 'date')}
        ${area('Where it is named in writing', 'source')}`)}
      <h3>The firm-wide risk assessment</h3><p>${v.risk_assessment_reading}</p>
      ${form('/staff/compliance/aml/risk-assessments', 'Record a dated assessment', h`${input('Dated', 'assessed_on', null, 'date')}
        ${input('Where the document is', 'document_ref')} ${area('What it covers — client types, reach, channels, services', 'covers')}
        ${choose('Does it name the contingent fee as a risk factor?', 'contingent_fee_named', { YES: 'Yes', NO: 'No' })}`)}
      <h3>Checks</h3>
      ${v.checks.length === 0 ? h`<p class="help">None.</p>` : h`<table><tbody>${v.checks.map((k) => h`<tr><td><a href="/staff/compliance/aml/checks/${k.id}">${k.organisation}</a></td>
        <td>${k.claimant_type}</td><td>${k.state}</td><td>${k.completed_at ?? ''}</td></tr>`)}</tbody></table>`}
      ${form('/staff/compliance/aml/checks', 'Open a check', h`${choose('Organisation', 'business_id', Object.fromEntries(organisations.map((o) => [o.id, o.name])))}
        ${choose('Kind of claimant — as the position paper lists them', 'claimant_type', CLAIMANT_TYPES)} ${input('If other, what kind', 'claimant_type_note')}`)}`,
  });
}

export function checkPage(nav: Nav, v: CheckView, msg?: string): string {
  const c = v.check;
  const open = c.state === 'IN_PROGRESS';
  return page({
    title: 'A due diligence check', nav, wide: true,
    body: h`<h1>${c.organisation} — ${c.claimant_label}</h1>${subnav()}${done(msg)}${limitation()}
      <p>State: <strong>${c.state}</strong>${c.completed_at === null ? '' : `, finished ${localWhen(c.completed_at)}`}</p>
      <table><tbody>
        <tr><th>Identify</th><td>${v.guide.identify}</td></tr><tr><th>Verify</th><td>${v.guide.verify}</td></tr>
        <tr><th>Beneficial owners</th><td>${v.guide.owners}</td></tr><tr><th>Authority to bind</th><td>${v.guide.authority}</td></tr></tbody></table>
      ${open && v.missing.length > 0 ? h`<p class="help">Still needed before it can finish: ${v.missing.join('; ')}.</p>` : raw('')}
      ${open ? form(`/staff/compliance/aml/checks/${c.id}`, 'Save', h`
        ${area('What was identified', 'identified', c.identified)} ${area('How it was verified', 'verification_method', c.verification_method)}
        ${input('Companies House or Charity Commission number', 'register_ref', c.register_ref)}
        ${choose('Evidence document', 'evidence_document_id', Object.fromEntries(v.documents.map((x) => [x.id, x.label])), c.evidence_document_id)}
        ${choose('Beneficial ownership', 'beneficial_ownership', BENEFICIAL_OWNERSHIP, c.beneficial_ownership)}
        ${choose('Authority to bind', 'authority_basis', AUTHORITY_BASES, c.authority_basis)}
        ${choose('The person with authority', 'authority_contact_id', Object.fromEntries(v.contacts.map((x) => [x.id, x.full_name])), c.authority_contact_id)}
        ${area('The evidence of authority', 'authority_evidence', c.authority_evidence)}
        ${choose('Entity status', 'entity_status', ENTITY_STATUSES, c.entity_status)}
        ${choose('Sanctions screen', 'sanctions_screen', SANCTIONS_RESULTS, c.sanctions_screen)} ${input('Screened on', 'sanctions_screened_on', c.sanctions_screened_on, 'date')}
        <p class="help">${'The position paper sets no risk-rating scale, so none is offered. Words, or nothing.'}</p>
        ${input('Risk rating', 'risk_rating', c.risk_rating)} ${area('Why', 'risk_rating_basis', c.risk_rating_basis)}
        ${input('Checked on', 'checked_on', c.checked_on, 'date')}`) : raw('')}
      <h3>The PSC pull</h3><p>${v.psc_pull.reading}</p>
      ${v.psc_decisions.map((p) => h`<p class="help">${PSC_DECISIONS[p.decision] ?? p.decision}, ${p.decided_on}: ${p.reasoning}</p>`)}
      ${open ? form(`/staff/compliance/aml/checks/${c.id}/psc-decisions`, 'Record a dated decision on the pull', h`
        ${choose('Decision', 'decision', PSC_DECISIONS)} ${area('Why', 'reasoning')} ${input('Decided on', 'decided_on', null, 'date')}`) : raw('')}
      <h3>Beneficial owners</h3>
      ${v.owners.length === 0 ? h`<p class="help">None recorded.</p>` : h`<ul>${v.owners.map((o) => h`<li>${o.contact} — ${o.basis_of_control} (${OWNER_SOURCES[o.identified_from] ?? o.identified_from})</li>`)}</ul>`}
      ${open ? form(`/staff/compliance/aml/checks/${c.id}/owners`, 'Record an owner', h`
        ${choose('Contact', 'contact_id', Object.fromEntries(v.contacts.map((x) => [x.id, x.full_name])))}
        ${input('Ownership or control, as the evidence shows it', 'basis_of_control')} ${choose('Identified from', 'identified_from', OWNER_SOURCES)}
        ${choose('Evidence document', 'evidence_document_id', Object.fromEntries(v.documents.map((x) => [x.id, x.label])))} ${input('Verified how', 'verified_how')}`) : raw('')}
      ${open ? h`${form(`/staff/compliance/aml/checks/${c.id}/complete`, 'Finish the check', raw(''))}
        ${form(`/staff/compliance/aml/checks/${c.id}/withdraw`, 'Withdraw', input('Why', 'withdrawn_reason'))}` : raw('')}
      <h3>Ongoing monitoring</h3>
      ${v.notes.map((n) => h`<p class="help">${n.noted_on}: ${n.note}</p>`)}
      ${form('/staff/compliance/aml/notes', 'Add a note', h`<input type="hidden" name="business_id" value="${c.business_id}"><input type="hidden" name="check_id" value="${c.id}">
        ${input('Dated', 'noted_on', null, 'date')} ${area('Note', 'note')}`)}`,
  });
}

/* ------------------------------------------------------------------ rights requests */

export function rightsListPage(nav: Nav, rows: readonly RegisterLine[], msg?: string): string {
  return page({
    title: 'Rights requests', nav, wide: true,
    body: h`<h1>The rights-request register</h1>${subnav()}${done(msg)}${limitation()}
      <table><thead><tr><th>Ref</th><th>Received</th><th>Rights</th><th>Earliest deadline</th><th>Waiting on</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => h`<tr><td><a href="/staff/compliance/rights/${r.id}">${r.ref}</a></td><td>${r.received}</td><td>${r.limbs}</td>
        <td>${r.next_deadline}</td><td>${r.waiting}</td><td>${r.status}</td></tr>`)}</tbody></table>
      ${form('/staff/compliance/rights', 'Log a request', h`
        ${input(`Received — when Cap Rebate received it, not when it was read (${moment})`, 'received_at')} ${choose('How it arrived', 'received_via', RECEIVED_VIA)}
        ${input('Where exactly', 'received_via_detail')} ${input(`Forwarded (${moment})`, 'forwarded_at')} ${input('Forwarded by', 'forwarded_by')}
        ${area('How they describe themselves, in their words', 'requester_as_described')} ${area('What they asked for, quoted', 'request_verbatim')}
        <label class="fl">The rights it asks for — each has its own deadline</label>
        ${Object.entries(LIMB_WORDS).map(([k, v]) => h`<label class="ck"><input type="checkbox" name="limbs" value="${k}"> ${v}</label> `)}
        ${area('An alternative classification considered and rejected', 'classification_alternatives')}
        ${input('Contact id, if they are one', 'contact_id')} ${input('Lead id, if they asked through one', 'lead_id')}`)}`,
  });
}

export function requestPage(nav: Nav, v: RequestView, msg?: string): string {
  const r = v.request;
  const open = r.status !== 'CLOSED';
  return page({
    title: r.request_ref, nav, wide: true,
    body: h`<h1>${r.request_ref}</h1>${subnav()}${done(msg)}${limitation()}
      <p>Received ${localWhen(r.received_at)} by ${RECEIVED_VIA[r.received_via] ?? r.received_via}. Status <strong>${REQUEST_STATUS[r.status] ?? r.status}</strong>.</p>
      <blockquote>${r.request_verbatim}</blockquote>
      <h3>Deadlines — one row per right</h3>
      ${v.limbs.map((l) => h`<div class="pblock"><p><strong>${l.label}</strong> — decision: ${l.row.decision === null ? 'not yet' : (LIMB_DECISIONS[l.row.decision] ?? l.row.decision)}</p>
        ${l.clock === null ? h`<p class="err">${l.clock_error ?? ''}</p>` : h`
          <ul>${l.clock.working.map((w) => h`<li>${w}</li>`)}</ul>
          ${l.clock.waiting_on.length === 0 ? raw('') : h`<p class="flag">No deadline yet — waiting on: ${l.clock.waiting_on.join('; ')}</p>`}
          <p class="help">Days not counted: ${l.clock.days_not_counted === null ? 'paused' : String(l.clock.days_not_counted)} — ${l.clock.days_not_counted_reason}.
          Extension: ${l.clock.extension_reading}.</p>`}
        ${open ? form(`/staff/compliance/rights/${r.id}/limbs`, `Save the ${l.label} row`, h`<input type="hidden" name="limb" value="${l.row.limb}">
          ${l.row.limb === 'ART_15' ? h`${input(`Clarification asked (${moment})`, 'clarification_requested_at', l.row.clarification_requested_at)}
            ${input(`Clarification received (${moment})`, 'clarification_received_at', l.row.clarification_received_at)}` : h`<p class="help">Article 12A(5)’s pause applies to Article 15 only.</p>`}
          ${input(`Extension notice given (${moment})`, 'extension_notified_at', l.row.extension_notified_at)}
          ${choose('Ground', 'extension_ground', EXTENSION_GROUND_WORDS, l.row.extension_ground)} ${area('The reasons, as given to them', 'extension_reasons', l.row.extension_reasons)}
          ${choose('Decision', 'decision', LIMB_DECISIONS, l.row.decision)} ${area('Why, on these facts, for this person', 'decision_reasoning', l.row.decision_reasoning)}
          ${area('Was the time taken an undue delay?', 'undue_delay_assessment', l.row.undue_delay_assessment)}`) : raw('')}</div>`)}
      ${open ? form(`/staff/compliance/rights/${r.id}/limbs`, 'Add a right', choose('Right', 'limb', LIMB_WORDS)) : raw('')}
      <h3>The request</h3>
      ${open ? form(`/staff/compliance/rights/${r.id}`, 'Save', h`
        ${choose('Identity status', 'identity_status', IDENTITY_STATUS, r.identity_status)} ${choose('Identity route', 'identity_route', IDENTITY_ROUTES, r.identity_route)}
        ${area('The identity standard applied, and why it was proportionate', 'identity_standard_applied', r.identity_standard_applied)}
        ${input(`Identity asked for (${moment})`, 'id_requested_at', r.id_requested_at)} ${input(`Identity received (${moment})`, 'id_received_at', r.id_received_at)}
        ${input(`Identity evidence — ${Object.keys(IDENTITY_EVIDENCE).join(', ')}`, 'identity_evidence', r.identity_evidence === null ? null : (JSON.parse(r.identity_evidence) as string[]).join(','))}
        ${choose('Identity outcome', 'identity_outcome', IDENTITY_OUTCOMES, r.identity_outcome)} ${input('Who granted the authority (Route A only)', 'authority_grantor', r.authority_grantor)}
        ${choose('Fee', 'fee_status', FEE_STATUS, r.fee_status)} ${input(`Fee charged (${moment})`, 'fee_charged_at', r.fee_charged_at)} ${input(`Fee paid (${moment})`, 'fee_paid_at', r.fee_paid_at)}
        ${area('Clarification', 'clarification', r.clarification)} ${area('What was searched — the standing list, anything left out and why', 'search_scope', r.search_scope)}
        ${input('Searched on', 'search_done_on', r.search_done_on, 'date')} ${area('What was found, by store', 'records_found', r.records_found)}
        ${input(`Restricted (${moment})`, 'restriction_applied_at', r.restriction_applied_at)} ${input(`Responded (${moment})`, 'responded_at', r.responded_at)}
        ${input('By what route', 'response_route', r.response_route)} ${area('What happened to the data', 'outcome', r.outcome)}
        ${choose('Status', 'status', { OPEN: 'Open', AWAITING_REQUESTER: 'Awaiting the requester', RESPONDED: 'Responded' }, r.status)}`) : raw('')}
      ${open ? form(`/staff/compliance/rights/${r.id}/close`, 'Close the request', h`
        <p class="help">Tick against the response actually sent. An access response:</p>${ticks('check_', ACCESS_RESPONSE_ITEMS)}
        <p class="help">Any refusal, in whole or part:</p>${ticks('check_', REFUSAL_RESPONSE_ITEMS)}`) : h`<p>Closed ${r.closed_at === null ? '' : localWhen(r.closed_at)}.</p>`}
      <h3>Letters — ${v.draft_note}</h3>
      ${form(`/staff/compliance/rights/${r.id}/letters`, 'Add to emails waiting to send', h`${choose('Letter', 'letter', Object.fromEntries(v.letters.map((x) => [x.kind, x.label])))}
        ${input('Their email address', 'to_email')} ${area('The reasons, in the words sent', 'reasons')} ${input('What we need from them', 'asked')}
        <p class="help">It is saved with the emails waiting to send, marked not sent. It goes nowhere else.</p>`)}
      ${holdsAndLinks('RIGHTS_REQUEST', r.id, v.holds, v.links)}`,
  });
}

export function searchPage(nav: Nav, term: string, s: SearchResult): string {
  return page({
    title: 'Search for a person', nav, wide: true,
    body: h`<h1>Search: ${term}</h1>${subnav()}
      <p class="help">Searched: ${s.scope.join('; ')}.</p><p class="flag">${s.s2_note} <a href="/staff/compliance/identity">Search the names</a>.</p>
      ${s.hits.length === 0 ? h`<p>Nothing found in the stores above.</p>` : h`<table><thead><tr><th>Store</th><th>How</th><th>What</th></tr></thead><tbody>
        ${s.hits.map((x) => h`<tr><td>${x.store}</td><td>${x.how}</td><td>${x.link === null ? x.label : h`<a href="${x.link}">${x.label}</a>`}</td></tr>`)}</tbody></table>`}`,
  });
}

/* ------------------------------------------------------------------ complaints */

export function complaintsListPage(nav: Nav, rows: readonly { id: string; ref: string; received: string; classified: string; ack_deadline: string; ack_in_time: string; status: string }[], msg?: string): string {
  return page({
    title: 'Complaints', nav, wide: true,
    body: h`<h1>The complaints log</h1>${subnav()}${done(msg)}${limitation()}
      <table><thead><tr><th>Ref</th><th>Received</th><th>s.164A?</th><th>Acknowledge by</th><th>In time</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => h`<tr><td><a href="/staff/compliance/complaints/${r.id}">${r.ref}</a></td><td>${r.received}</td><td>${r.classified}</td>
        <td>${r.ack_deadline}</td><td>${r.ack_in_time}</td><td>${r.status}</td></tr>`)}</tbody></table>
      ${form('/staff/compliance/complaints', 'Log a complaint', h`
        ${input(`Received (${moment})`, 'received_at')} ${choose('How it arrived', 'received_via', COMPLAINT_VIA)} ${input('Where exactly', 'received_via_detail')}
        ${area('How they describe themselves', 'complainant_as_described')} ${area('What they said, quoted', 'complaint_verbatim')}
        ${choose('Classify it now, on receipt', 'is_164a', IS_164A)} ${area('Why — and where it is arguable, it is a s.164A complaint', 'classification_reason')}
        ${input('Organisation id, where there is one', 'business_id')} ${input('Claim id, where there is one', 'claim_id')} ${input('Contact id', 'contact_id')}`)}`,
  });
}

export function complaintPage(nav: Nav, v: ComplaintView, msg?: string): string {
  const c = v.complaint;
  const open = c.status !== 'CLOSED';
  return page({
    title: c.complaint_ref, nav, wide: true,
    body: h`<h1>${c.complaint_ref}</h1>${subnav()}${done(msg)}${limitation()}
      <p>Received ${localWhen(c.received_at)}. Status <strong>${c.status}</strong>.</p><blockquote>${c.complaint_verbatim}</blockquote>
      <h3>The thirty days</h3><ul>${v.ack.working.map((w) => h`<li>${w}</li>`)}</ul><p class="help">${v.no_deadline_note}</p>
      <h3>Classification</h3>
      ${c.is_164a === null ? (open ? form(`/staff/compliance/complaints/${c.id}/classify`, 'Classify', h`${choose('Is it a s.164A complaint?', 'is_164a', IS_164A)} ${area('Why', 'classification_reason')}`) : raw(''))
        : h`<p>${IS_164A[c.is_164a] ?? c.is_164a} — ${c.classification_reason ?? ''} (${c.classified_at === null ? '' : localWhen(c.classified_at)}; not revised once made)</p>`}
      ${open ? form(`/staff/compliance/complaints/${c.id}`, 'Save', h`
        ${choose('Limb', 'limb', COMPLAINT_LIMBS, c.limb)} ${area('What they say went wrong', 'alleged_infringement', c.alleged_infringement)}
        ${area('Which part of the law we think it falls under', 'infringement_mapping', c.infringement_mapping)}
        ${input(`Acknowledged (${moment})`, 'acknowledged_at', c.acknowledged_at)} ${input('How', 'acknowledged_route', c.acknowledged_route)}
        ${area('Enquiries made, and why that extent was appropriate', 'enquiries_made', c.enquiries_made)}
        ${choose('Outcome', 'outcome', COMPLAINT_OUTCOMES, c.outcome)} ${area('The route given, if out of scope', 'out_of_scope_route', c.out_of_scope_route)}
        ${area('Why that outcome', 'outcome_reasoning', c.outcome_reasoning)} ${input(`Outcome told (${moment})`, 'outcome_notified_at', c.outcome_notified_at)}
        ${area('Was it an undue delay?', 'undue_delay_assessment', c.undue_delay_assessment)}
        ${input('Decided by — named', 'decided_by', c.decided_by)} ${area('Why someone other than the data protection officer decided', 'decided_by_reason', c.decided_by_reason)}
        ${input('Countersigned by — named', 'countersigned_by', c.countersigned_by)} ${area('The countersigner’s own view, where it differs', 'countersigner_view', c.countersigner_view)}
        ${area('What changed as a result', 'lessons_and_changes', c.lessons_and_changes)}`) : raw('')}
      <h3>Progress told to the complainant</h3>
      ${v.progress.map((p) => h`<p class="help">${p.told_on}: ${p.said}</p>`)}
      ${open ? form(`/staff/compliance/complaints/${c.id}/progress`, 'Record an update', h`${input('Told on', 'told_on', null, 'date')} ${area('What they were told', 'said')}`) : raw('')}
      ${open ? form(`/staff/compliance/complaints/${c.id}/close`, 'Close', h`<p class="help">Tick against the outcome letter actually sent:</p>${ticks('check_', ONWARD_ROUTE_ITEMS)}`) : raw('')}
      <h3>Letters — ${v.draft_note}</h3>
      ${form(`/staff/compliance/complaints/${c.id}/letters`, 'Add to emails waiting to send', h`${choose('Letter', 'letter', Object.fromEntries(v.letters.map((x) => [x.kind, x.label])))}
        ${input('Their email address', 'to_email')} ${input('If they also asked for something to be done: what', 'asked')}`)}
      ${holdsAndLinks('COMPLAINT', c.id, v.holds, v.links)}`,
  });
}

/* ------------------------------------------------------------------ breaches */

export function breachListPage(nav: Nav, rows: readonly { id: string; ref: string; kind: string; aware: string; clock: string; status: string }[], msg?: string): string {
  return page({
    title: 'Breach register', nav, wide: true,
    body: h`<h1>The breach register</h1>${subnav()}${done(msg)}${limitation()}
      <p class="help">Categories and counts, never names. Anybody who had to be identified is in the restricted names annex, which stays where it is.</p>
      <table><thead><tr><th>Ref</th><th>Kind</th><th>Aware</th><th>The 72 hours</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => h`<tr><td><a href="/staff/compliance/breaches/${r.id}">${r.ref}</a></td><td>${r.kind}</td><td>${r.aware}</td><td>${r.clock}</td><td>${r.status}</td></tr>`)}</tbody></table>
      ${form('/staff/compliance/breaches', 'Open an entry', h`
        ${choose('Kind', 'kind', INCIDENT_KINDS)} ${input('Claim id — required for attempted invoice fraud', 'claim_id')} ${input('Date of the attempt', 'fraud_attempted_on', null, 'date')}
        ${input(`Discovered (${moment})`, 'discovered_at')} ${input('Discovered by', 'discovered_by')} ${choose('How', 'discovery_route', DISCOVERY_ROUTES)}
        ${input(`Aware — fix it on the day (${moment})`, 'awareness_at')} ${area('Why that is the moment of awareness', 'awareness_basis')}
        ${choose('When it happened is', 'occurred_state', OCCURRED_STATES)} ${input(`Happened (${moment})`, 'occurred_at')} ${area('The basis, if estimated or unknown', 'occurred_basis')}
        ${area('What happened — never bank details', 'description')}`)}`,
  });
}

export function incidentPage(nav: Nav, v: IncidentView, msg?: string): string {
  const i = v.incident;
  const dc = v.decision;
  const open = i.status !== 'CLOSED';
  return page({
    title: i.incident_ref, nav, wide: true,
    body: h`<h1>${i.incident_ref} — ${i.kind_label}</h1>${subnav()}${done(msg)}${limitation()}
      <p class="flag">${v.clock.label}</p>
      ${i.claim_ref === null ? raw('') : h`<p>Claim ${i.claim_ref}${i.fraud_attempted_on === null ? '' : `, attempt on ${i.fraud_attempted_on}`}.</p>`}
      <p><a href="/staff/compliance/breaches/${i.id}/ico-sheet">The sheet for the Information Commissioner’s Office (from 30 September 2026, the Information Commission). It is a template.</a></p>
      ${v.corrections.map((x) => h`<p class="help">Awareness corrected to ${localWhen(x.corrected_to)}: ${x.reason}</p>`)}
      ${open ? form(`/staff/compliance/breaches/${i.id}/awareness`, 'Record a correction beside the original', h`${input(`Corrected to (${moment})`, 'corrected_to')} ${area('Why', 'reason')}`) : raw('')}
      <h3>The facts</h3>
      ${open ? form(`/staff/compliance/breaches/${i.id}`, 'Save', h`
        ${area('What happened', 'description', i.description)} ${area('People — categories, then a number or range with its basis', 'subject_categories_and_number', i.subject_categories_and_number)}
        ${area('Records — categories and number', 'record_categories_and_number', i.record_categories_and_number)} ${area('Special category data, and how it got there', 'special_category_present', i.special_category_present)}
        ${area('Likely consequences for the people', 'likely_consequences', i.likely_consequences)} ${area('Remedial action', 'remedial_action', i.remedial_action)}
        ${area('Mitigating action', 'mitigating_action', i.mitigating_action)} ${area('Processor involved', 'processor_involved', i.processor_involved)}
        ${input('Annex reference, like ANX-001 — the names stay in the annex', 'annex_ref', i.annex_ref)}
        ${choose('Is it a personal data breach? The data protection officer decides.', 'is_personal_data_breach', YES_NO, i.is_personal_data_breach)}
        ${area('Their reason', 'classification_reason', i.classification_reason)} ${area('What changed as a result', 'lessons_and_changes', i.lessons_and_changes)}`) : raw('')}
      <h3>The decisions</h3>
      ${open ? form(`/staff/compliance/breaches/${i.id}/decision`, 'Save the decision', h`
        ${choose('Article 33', 'art33_decision', ART33, dc?.art33_decision ?? null)} ${area('Reasoning — does the “unlikely to result in a risk” test apply?', 'art33_reasoning', dc?.art33_reasoning ?? null)}
        ${input(`Notified (${moment})`, 'notified_at', dc?.notified_at ?? null)} ${input('To whom', 'notified_recipient', dc?.notified_recipient ?? null)}
        ${area('Reasons for delay, if after 72 hours', 'delay_reasons', dc?.delay_reasons ?? null)}
        ${Object.entries(v.four_facts).map(([k, label]) => choose(label, k, FACT_VALUES, (dc as unknown as Record<string, string | null> | null)?.[k] ?? null))}
        ${choose('Article 34', 'art34_decision', ART34, dc?.art34_decision ?? null)} ${area('Reasoning', 'art34_reasoning', dc?.art34_reasoning ?? null)}
        ${input(`Communicated (${moment})`, 'communicated_at', dc?.communicated_at ?? null)} ${input('How', 'communicated_route', dc?.communicated_route ?? null)}
        ${input('Decided by — named', 'decided_by', dc?.decided_by ?? null)} ${input(`Decided (${moment})`, 'decided_at', dc?.decided_at ?? null)}
        ${choose('The deputy route was used', 'deputy_route_used', { YES: 'Yes', NO: 'No' }, dc === null ? null : dc.deputy_route_used === 1 ? 'YES' : 'NO')}
        ${area('The attempts to reach the data protection officer — what, channel, time', 'dpo_contact_attempts', dc?.dpo_contact_attempts ?? null)}
        ${input('Countersigned by — named', 'countersigned_by', dc?.countersigned_by ?? null)}`) : raw('')}
      <h3>Notification phases</h3>
      ${v.phases.map((p) => h`<p class="help">Phase ${String(p.phase_no)}, ${localWhen(p.sent_at)}: ${p.what_was_sent} — outstanding: ${p.outstanding}</p>`)}
      ${open ? form(`/staff/compliance/breaches/${i.id}/phases`, 'Record a phase', h`${input(`Sent (${moment})`, 'sent_at')} ${area('What was sent', 'what_was_sent')} ${area('What was outstanding, and by when', 'outstanding')}`) : raw('')}
      <h3>Who else was told</h3><p class="help">${v.insurance}</p>
      <table><tbody>${v.told.map((t) => h`<tr><td>${t.label}</td><td>${TOLD_POSITIONS[t.position] ?? t.position}</td><td>${t.told_at === null ? '' : localWhen(t.told_at)}</td><td>${t.note ?? ''}</td></tr>`)}</tbody></table>
      ${open ? form(`/staff/compliance/breaches/${i.id}/told`, 'Record', h`${choose('Who', 'recipient_kind', RECIPIENTS)} ${choose('Position', 'position', TOLD_POSITIONS)}
        ${input(`Told (${moment})`, 'told_at')} ${input('Note', 'note')}`) : raw('')}
      ${open ? form(`/staff/compliance/breaches/${i.id}/close`, 'Close the entry', raw('')) : h`<p>Closed.</p>`}
      ${holdsAndLinks('BREACH', i.id, v.holds, v.links)}`,
  });
}

export function icoSheetPage(nav: Nav, ref: string, sections: readonly SheetSection[], note: string): string {
  return page({
    title: `Answer sheet for the data protection regulator — ${ref}`, nav, wide: true,
    body: h`<h1>The sheet for the Information Commissioner’s Office (from 30 September 2026, the Information Commission) — ${ref}</h1>${subnav()}<p class="flag">${note}</p>
      ${sections.map((s) => h`<h3>${s.title}</h3><table><tbody>${s.lines.map((l) => h`<tr><th>${l.field}</th><td>${l.answer}</td></tr>`)}</tbody></table>`)}`,
  });
}

/* ------------------------------------------------------------------ S2, consent, retention */

export function identityPage(nav: Nav, counts: { people: number; route_a: number; route_b: number; notices: number; exemptions: number; searches: number }, found: readonly { person_ref: string; role: string; doc_id: string }[] | null, msg?: string): string {
  return page({
    title: 'People named on documents', nav, wide: true,
    body: h`<h1>People named on documents</h1>${subnav()}${done(msg)}${limitation()}
      <p class="flag">No list of names. Each person is opened by their reference, and every opening is logged. Every name search is logged, with the words searched.
      Never exported, never in any other search, never used for marketing.</p>
      <p>${String(counts.people)} people — ${String(counts.route_a)} with a contact detail printed, ${String(counts.route_b)} without;
      ${String(counts.notices)} notices sent; ${String(counts.exemptions)} exemptions recorded; ${String(counts.searches)} searches logged.</p>
      <ul>${S2_REFUSALS.map((r) => h`<li class="help">${r}</li>`)}</ul>
      ${form('/staff/compliance/identity/search', 'Search names — every search is logged', input('Part of a name', 'term'))}
      ${found === null ? raw('') : found.length === 0 ? h`<p>No match.</p>` : h`<ul>${found.map((f) => h`<li><a href="/staff/compliance/identity/${f.person_ref}">${f.person_ref}</a> — ${f.role}, document ${f.doc_id}</li>`)}</ul>`}
      ${form('/staff/compliance/identity', 'Record a person printed on a document', h`
        ${input('Document id', 'doc_id')} ${input('Name, as it appears on the document', 'name')} ${choose('Role on the document', 'role', PERSON_ROLES)}
        ${input('Contact route, as printed', 'contact_route')} ${choose('Kind of route', 'contact_route_kind', ROUTE_KINDS)}
        ${choose('The route is printed on the document — nothing looked up', 'route_printed_on_document', { YES: 'Yes, printed on the document' })}`)}`,
  });
}

export function personPage(nav: Nav, p: PersonView, msg?: string): string {
  return page({
    title: p.person_ref, nav, wide: true,
    body: h`<h1>${p.person_ref}</h1>${subnav()}${done(msg)}<p class="flag">This page was opened, and the opening is in the audit log.</p>
      <table><tbody><tr><th>Name, as printed</th><td>${p.name}</td></tr><tr><th>Role</th><td>${p.role}</td></tr>
        <tr><th>Contact route, as printed</th><td>${p.contact_route ?? 'none printed'}</td></tr><tr><th>Route group</th><td>${p.route_group_label}</td></tr>
        <tr><th>Document</th><td>${p.doc_id} (${p.doc_type ?? 'untyped'}), received ${p.received_on}</td></tr>
        <tr><th>Purpose</th><td>${p.purpose}</td></tr><tr><th>Notice</th><td>${p.notice}</td></tr><tr><th>Exemption</th><td>${p.exemption}</td></tr>
        <tr><th>Retention</th><td>${p.retention}</td></tr>
        <tr><th>Rights requests</th><td>${p.rights_requests.map((r) => h`<a href="/staff/compliance/rights/${r.id}">${r.ref}</a> `)}</td></tr>
        <tr><th>Complaints</th><td>${p.complaints.map((r) => h`<a href="/staff/compliance/complaints/${r.id}">${r.ref}</a> `)}</td></tr></tbody></table>
      ${form(`/staff/compliance/identity/${p.person_ref}`, 'Record the notice sent', h`<input type="hidden" name="what" value="NOTICE">
        ${input('Template', 'notice_template')} ${choose('Route', 'notice_route', NOTICE_ROUTES)} ${input('Sent on', 'notice_sent_on', null, 'date')}`)}
      ${form(`/staff/compliance/identity/${p.person_ref}`, 'Record the exemption relied on', h`<input type="hidden" name="what" value="EXEMPTION">
        ${input('Article', 'exemption_article')} ${area('The reason, for this person and this document', 'exemption_reason')}`)}`,
  });
}

/** A consent route code, as words: STAFF_RECORDED reads "Staff recorded". */
function routeWords(route: string): string {
  const w = route.toLowerCase().replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function consentPage(nav: Nav, c: ConsentHistory, msg?: string): string {
  return page({
    title: 'Consent history', nav, wide: true,
    body: h`<h1>Consent history — ${c.contact.full_name}</h1>${subnav()}${done(msg)}${limitation()}<p>${c.contact.organisation ?? ''}</p>
      <table><tbody>${c.current.map((x) => h`<tr><th>${x.kind}</th><td>${x.reading}</td></tr>`)}</tbody></table>
      <h3>Every answer</h3>
      <table><thead><tr><th>When</th><th>What</th><th>Answer</th><th>Words asked</th><th>Route</th><th>Kept in</th></tr></thead><tbody>
      ${c.lines.map((l) => h`<tr><td>${localWhen(l.at)}</td><td>${l.kind.startsWith('SHARE_WITH ') ? `Sharing progress with ${l.kind.slice('SHARE_WITH '.length)}` : (CONSENT_KINDS[l.kind] ?? l.kind)}</td><td>${CONSENT_DECISIONS[l.decision] ?? l.decision}</td><td>${l.wording}</td><td>${routeWords(l.route)}</td><td class="help">${l.source}</td></tr>`)}</tbody></table>
      ${form(`/staff/compliance/consent/${c.contact.id}`, 'Record an answer', h`${choose('Which', 'kind', CONSENT_KINDS)} ${choose('Answer', 'decision', CONSENT_DECISIONS)}
        ${input('The words they were asked — the version', 'wording_version')}`)}`,
  });
}

export function retentionPage(nav: Nav, lines: readonly RetentionLine[]): string {
  return page({
    title: 'Retention', nav, wide: true,
    body: h`<h1>Retention — what is due for deletion</h1>${subnav()}${limitation()}
      <p class="flag">This list deletes nothing. We do not know yet if client folders can be kept out of the host’s backups.
      A file still in a backup has not been deleted. A date is only worked out from a rule the data protection officer has approved. None is approved yet.</p>
      <table><thead><tr><th>Record</th><th>When it is deleted</th><th>Records</th><th>No date yet</th><th>Held</th><th>Past their date</th><th>Deleting</th></tr></thead><tbody>
      ${lines.map((l) => h`<tr><td>${l.label}</td><td>${l.clock}</td><td>${String(l.records)}</td><td>${String(l.unscheduled)}</td><td>${String(l.held)}</td>
        <td>${l.due.length === 0 ? 'none' : l.due.map((x) => `${x.id} (${x.due_on})`).join(', ')}</td><td class="help">${l.delete}</td></tr>`)}</tbody></table>`,
  });
}
