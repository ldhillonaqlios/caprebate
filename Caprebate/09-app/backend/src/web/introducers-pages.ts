/**
 * INTRODUCERS, THE REFERRAL CHANNEL AND THE REWARD MODEL — THE ROUTES AND THE
 * PAGES. CRM 5 of 10, 11 September 2026.
 *
 * Same shape as src/web/pipeline-pages.ts: it returns 'not-mine' for anything it
 * does not own, so the mounting in staff.ts is one line.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/introducers.ts authorises every read and
 * write on the specific object, asks the opt-in before a notice is queued and
 * reads clause 1 of the letter before the reward model moves; this file draws
 * what it returns and posts what a person asked for. Every value a person or the
 * public form supplied — a firm's name, a note, a person's name — goes through
 * `h` and is escaped on output.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { claimRef, dataLink, savedMessage } from './components.ts';
import * as I from './introducers.ts';
import { vocabulary } from './vocabularies.ts';
import { SECTORS } from './leads.ts';
import { STUB_NOTICE } from '../stubs/email.ts';

export type WebResult = 'handled' | 'not-mine';

export type IntroducerPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
});

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

function posted(f: URLSearchParams, names: readonly string[]): I.Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

const FIRM_FIELDS = ['firm_name', 'introducer_type', 'owner_id', 'relationship_started_on', 'notes', 'notice_contact_id'] as const;
const PERSON_FIELDS = ['full_name', 'job_title', 'email', 'phone', 'notes'] as const;
const CONTACT_TASK_FIELDS = ['kind', 'title', 'note', 'contact_id', 'owner_id', 'due_on'] as const;
const REFERRAL_FIELDS = ['introducer_id', 'firm_name', 'introducer_type', 'contact_id', 'contact_name', 'contact_email', 'contact_phone',
  'prospect_organisation', 'prospect_sector', 'prospect_postcode', 'prospect_event', 'prospect_event_year'] as const;
const SECTION_OBJ = { type: 'introducer' as const, id: '__introducer_section__' };

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleIntroducers(
  d: IntroducerPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const deps: I.IntroducerDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  if (path === '/staff/introducers' && method === 'GET') {
    html(res, 200, listPage(d, actor, I.introducerList(db, actor, d.app.now()), done));
    return 'handled';
  }
  if (path === '/staff/introducers' && method === 'POST') {
    const r = I.createIntroducer(deps, actor, posted(await form(req), FIRM_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Introducer not recorded', r.why, '/staff/introducers', r.field);
    redirect(res, `/staff/introducers/${r.id}?done=created`);
    return 'handled';
  }
  if (path === '/staff/referrals' && method === 'POST') {
    const r = I.intakeReferral(deps, actor, posted(await form(req), REFERRAL_FIELDS), 'STAFF');
    if (!r.ok) return d.problem(res, actor, 'Referral not recorded', r.why, '/staff/introducers', r.field);
    redirect(res, `/staff/leads/${r.id}?done=created`);
    return 'handled';
  }

  const oneJson = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (oneJson && method === 'GET') {
    json(res, 200, I.introducerView(db, actor, oneJson[1] ?? '', d.app.now()));
    return 'handled';
  }
  const contacts = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/contacts$/.exec(path);
  if (contacts && method === 'POST') {
    const id = contacts[1] ?? '';
    const r = I.addIntroducerContact(deps, actor, id, posted(await form(req), PERSON_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Person not recorded', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${id}?done=saved`);
    return 'handled';
  }
  const contact = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/contacts\/([A-Za-z0-9-]+)$/.exec(path);
  if (contact && method === 'POST') {
    const id = contact[1] ?? '';
    const r = I.updateIntroducerContact(deps, actor, id, contact[2] ?? '', posted(await form(req), PERSON_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${id}?done=saved`);
    return 'handled';
  }
  const logged = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/contact-log$/.exec(path);
  if (logged && method === 'POST') {
    const id = logged[1] ?? '';
    const r = I.logContact(deps, actor, id, posted(await form(req), CONTACT_TASK_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not logged', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${id}?done=saved`);
    return 'handled';
  }
  const planned = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/next-contact$/.exec(path);
  if (planned && method === 'POST') {
    const id = planned[1] ?? '';
    const r = I.planContact(deps, actor, id, posted(await form(req), CONTACT_TASK_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not planned', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${id}?done=saved`);
    return 'handled';
  }
  const referrals = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/referrals$/.exec(path);
  if (referrals && method === 'POST') {
    const id = referrals[1] ?? '';
    const fields = posted(await form(req), REFERRAL_FIELDS.filter((k) => k !== 'introducer_id' && k !== 'firm_name' && k !== 'introducer_type'));
    const r = I.intakeReferral(deps, actor, { ...fields, introducer_id: id }, 'STAFF');
    if (!r.ok) return d.problem(res, actor, 'Referral not recorded', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/leads/${r.id}?done=created`);
    return 'handled';
  }
  // CRM 9 of 10: MERGE A FIRM onto the one already recorded — ADMIN alone, through `mergeIntroducer`.
  const merge = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/merge$/.exec(path);
  if (merge && method === 'POST') {
    const id = merge[1] ?? '';
    const r = I.mergeIntroducer(deps, actor, id, posted(await form(req), ['into_id', 'reason']));
    if (!r.ok) return d.problem(res, actor, 'Not merged', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${r.id}?done=merged`);
    return 'handled';
  }
  const one = /^\/staff\/introducers\/([A-Za-z0-9-]+)$/.exec(path);
  if (one && method === 'GET') {
    html(res, 200, firmPage(d, actor, I.introducerView(db, actor, one[1] ?? '', d.app.now()), done));
    return 'handled';
  }
  if (one && method === 'POST') {
    const id = one[1] ?? '';
    const r = I.updateIntroducer(deps, actor, id, posted(await form(req), FIRM_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/introducers/${id}`, r.field);
    redirect(res, `/staff/introducers/${id}?done=saved`);
    return 'handled';
  }

  const share = /^\/staff\/leads\/([A-Za-z0-9-]+)\/share-progress$/.exec(path);
  if (share && method === 'POST') {
    const id = share[1] ?? '';
    const r = I.recordShareConsent(deps, actor, id, posted(await form(req), ['decision', 'wording_version']));
    if (!r.ok) return d.problem(res, actor, 'Answer not recorded', r.why, `/staff/leads/${id}`, r.field);
    redirect(res, `/staff/leads/${id}?done=saved`);
    return 'handled';
  }

  if (path === '/staff/introducer-rewards/view.json' && method === 'GET') {
    json(res, 200, I.rewardView(db, actor));
    return 'handled';
  }
  if (path === '/staff/introducer-rewards' && method === 'GET') {
    html(res, 200, rewardPage(d, actor, I.rewardView(db, actor), done));
    return 'handled';
  }
  if (path === '/staff/introducer-rewards' && method === 'POST') {
    const r = I.setRewardModel(deps, actor, posted(await form(req), ['model', 'fee_pounds']));
    if (!r.ok) return d.problem(res, actor, 'The reward model did not change', r.why, '/staff/introducer-rewards', r.field);
    redirect(res, '/staff/introducer-rewards?done=saved');
    return 'handled';
  }
  const disclose = /^\/staff\/introducer-fees\/([A-Za-z0-9-]+)\/disclosure$/.exec(path);
  if (disclose && method === 'POST') {
    const r = I.recordFeeDisclosure(deps, actor, disclose[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, '/staff/introducer-rewards', r.field);
    redirect(res, '/staff/introducer-rewards?done=saved');
    return 'handled';
  }
  const settled = /^\/staff\/introducer-fees\/([A-Za-z0-9-]+)\/settled$/.exec(path);
  if (settled && method === 'POST') {
    const r = I.recordFeeSettled(deps, actor, settled[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, '/staff/introducer-rewards', r.field);
    redirect(res, '/staff/introducer-rewards?done=saved');
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * PIECES
 * ------------------------------------------------------------------ */

function options(vocab: Readonly<Record<string, string>>, current: string | null, blank: string | null): Safe {
  return h`${blank === null ? raw('') : h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>`}${
    Object.entries(vocab).map(([k, label]) => h`<option value="${k}"${k === current ? raw(' selected') : raw('')}>${label}</option>`)}`;
}

function people(list: readonly { id: string; name: string }[], current: string | null, blank: string): Safe {
  return h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>${
    list.map((p) => h`<option value="${p.id}"${p.id === current ? raw(' selected') : raw('')}>${p.name}</option>`)}`;
}

function orNot(v: string | null | undefined, none: string): Safe {
  return v === null || v === undefined || v === '' ? h`<span class="help">${none}</span>` : h`${v}`;
}

function saved(msg: string | undefined): Safe {
  return msg === undefined ? raw('') : savedMessage();
}

/** The fields a referral carries about the client's business, on every staff intake form. */
function clientFields(): Safe {
  return h`<label>The client business's name <input name="prospect_organisation" required></label>
    <label>Its sector <select name="prospect_sector">${options(SECTORS, null, 'not known')}</select></label>
    <label>The property's postcode, or its first half <input name="prospect_postcode" maxlength="10"></label>
    <label>What happened at the property <select name="prospect_event">${options(I.PROSPECT_EVENTS, null, 'not known')}</select></label>
    <label>In which year <input name="prospect_event_year" inputmode="numeric" maxlength="4"></label>`;
}

/* ------------------------------------------------------------------ *
 * THE LIST
 * ------------------------------------------------------------------ */

function listPage(d: IntroducerPageDeps, actor: Actor, rows: readonly I.IntroducerRow[], msg: string | undefined): string {
  const mayWrite = can(actor, 'introducer.write', SECTION_OBJ);
  const mayReward = can(actor, 'introducer_reward.read', { type: 'introducer_reward', id: 'the-setting' });
  const firms = rows.map((r) => ({ id: r.id, name: r.firm_name }));
  const model = I.rewardSetting(d.app.db).model;
  return page({
    title: 'Introducers', nav: d.nav(actor), wide: true,
    body: h`<h1>Introducers</h1>${saved(msg)}
      <p class="help">A firm that refers clients to us — an accountancy practice above all. <strong>The people at a firm
      are its contacts, and none of them has a login.</strong> Every figure here is worked out fresh from the leads, the
      claims, the invoices and the tasks. None is stored. A value nobody knows is shown as
      not known, never as £0.</p>
      ${mayReward ? h`<p>The reward model: <strong>${I.REWARD_MODELS[model] ?? model}</strong> —
        <a href="/staff/introducer-rewards">the reward model and any fees</a></p>` : raw('')}
      ${rows.length === 0 ? h`<p class="help">No introducer is recorded.</p>` : h`<table>
        <thead><tr><th>Firm</th><th>Kind</th><th>Owner</th><th>Last contact</th><th>Next contact</th><th>Leads referred</th>
        <th>Claims opened</th><th>Won</th><th>Reasoned negatives</th><th>Fees invoiced</th><th>Fees paid</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/introducers/${r.id}">${r.firm_name}</a>${
          r.details?.from_public_form === true ? h`<br><span class="help">from the public form — check it is the firm it says</span>` : raw('')}</td>
          <td>${r.details === undefined ? raw('—') : h`${r.details.type}`}</td>
          <td>${r.details === undefined ? raw('—') : orNot(r.details.owner, 'nobody yet')}</td>
          <td>${r.details === undefined ? raw('—') : h`${r.details.last_contact}`}</td>
          <td>${r.details === undefined ? raw('—') : r.details.next_contact.overdue ? h`<strong>${r.details.next_contact.label}</strong>` : h`${r.details.next_contact.label}`}</td>
          <td>${r.pipeline === undefined ? raw('—') : h`${String(r.pipeline.leads_referred)}`}</td>
          <td>${r.pipeline === undefined ? raw('—') : h`${String(r.pipeline.claims_opened)}`}</td>
          <td>${r.pipeline === undefined ? raw('—') : h`${String(r.pipeline.claims_won)}`}</td>
          <td>${r.pipeline === undefined ? raw('—') : h`${String(r.pipeline.reasoned_negatives)}`}</td>
          <td>${r.money === undefined ? h`<span class="help">not shown to this role</span>` : h`${r.money.fees_invoiced}`}</td>
          <td>${r.money === undefined ? h`<span class="help">not shown to this role</span>` : h`${r.money.fees_paid}`}</td></tr>`)}</tbody></table>`}

      ${!mayWrite ? raw('') : h`<div class="pblock"><div class="pnum">Record a referral</div>
        <p class="help">This makes a lead, with the firm as its introducer. The lead holds the client business's name and
        sector, but no people. The person referring is saved as a contact at the firm. The client's own people are added
        later, at the assessment.</p>
        <form method="post" action="/staff/referrals">
          <label>A firm already recorded <select name="introducer_id">${people(firms, null, 'none — name it below')}</select></label>
          <label>Or the firm's name <input name="firm_name"></label>
          <label>Its kind <select name="introducer_type">${options(vocabulary(d.app.db, 'INTRODUCER_TYPE'), null, 'not recorded')}</select></label>
          <label>The person referring <input name="contact_name"></label>
          <label>Their email <input name="contact_email" type="email"></label>
          <label>Their telephone <input name="contact_phone"></label>
          ${clientFields()}
          <button type="submit">Record the referral</button></form></div>

        <div class="pblock"><div class="pnum">Add a firm</div>
        <form method="post" action="/staff/introducers">
          <label>The firm's name <input name="firm_name" required></label>
          <label>Its kind <select name="introducer_type">${options(vocabulary(d.app.db, 'INTRODUCER_TYPE'), null, 'not recorded')}</select></label>
          <label>Relationship started <input name="relationship_started_on" type="date"></label>
          <label>Notes <textarea name="notes"></textarea></label>
          <button type="submit">Add the firm</button></form></div>`}`,
  });
}

/* ------------------------------------------------------------------ *
 * ONE FIRM
 * ------------------------------------------------------------------ */

function feeTable(fees: readonly I.FeeView[]): Safe {
  return fees.length === 0 ? h`<p class="help">No fee has accrued to any firm.</p>` : h`<table>
    <thead><tr><th>Firm</th><th>Claim</th><th>Amount</th><th>Disclosure to the client</th><th>State</th><th></th></tr></thead>
    <tbody>${fees.map((f) => h`<tr><td>${f.firm.name}</td><td>${claimRef(f.claim.claim_ref)}</td><td>${f.amount}</td>
      <td>${f.disclosure.given ? h`given — ${f.disclosure.recorded ?? ''}` : h`<strong>not recorded — nothing is payable</strong>`}</td>
      <td>${f.state.label}${f.paid === null ? raw('') : h`<br><span class="help">${f.paid}</span>`}${f.payable ? h`<br>payable` : raw('')}</td>
      <td>${f.may_disclose ? h`<form method="post" action="/staff/introducer-fees/${f.id}/disclosure" class="inline"><button type="submit">Record the disclosure as given</button></form>` : raw('')}
        ${f.may_record_settled ? h`<form method="post" action="/staff/introducer-fees/${f.id}/settled" class="inline"><button type="submit">Record it paid to the firm</button></form>` : raw('')}</td></tr>`)}</tbody></table>`;
}

function firmPage(d: IntroducerPageDeps, actor: Actor, v: I.IntroducerView, msg: string | undefined): string {
  const e = v.edit;
  const contacts = v.contacts ?? [];
  const firmPeople = contacts.map((c) => ({ id: c.id, name: c.full_name }));
  return page({
    title: v.firm_name, nav: d.nav(actor), wide: true,
    body: h`<h1>${v.firm_name}</h1>${saved(msg)}
      <p class="help">A firm that refers clients to us. Nobody here has a login. The firm hears nothing about a client's claim
      unless that client has said yes to sharing progress.</p>
      ${v.merged_into === undefined || v.merged_into === null ? raw('') : h`<div class="gate"><strong>Merged</strong> onto <a href="/staff/introducers/${v.merged_into.id}">${v.merged_into.name}</a>
        on ${v.merged_into.at}. Its leads, its people and its open tasks moved there; its closed tasks, any client’s answer on sharing
        progress and every notice stay here, as they were recorded.</div>`}
      ${v.merge === undefined || v.merge.choices.length === 0 ? raw('') : h`<div class="pblock"><div class="pnum">Merge this firm onto the one it really is</div>
        <p class="help">For a firm the public referral form made that is a firm already recorded. Its leads, people and open tasks move;
        a client’s yes to sharing progress with this firm does not become a yes to the other, and no fee is ever moved.</p>
        <form method="post" action="/staff/introducers/${v.id}/merge">
          <label>The firm it really is
            <select name="into_id">${v.merge.choices.map((c) => h`<option value="${c.id}">${c.name}</option>`)}</select></label>
          <label>Why these are the same firm <input name="reason" required maxlength="1000"></label>
          <button type="submit">Merge</button></form></div>`}

      ${v.details === undefined ? raw('') : h`<div class="pblock"><div class="pnum">The firm</div><dl>
        <dt>Kind</dt><dd>${v.details.type.label}</dd>
        <dt>Relationship owner</dt><dd>${orNot(v.details.owner?.name, 'nobody yet')}</dd>
        <dt>Relationship started</dt><dd>${orNot(v.details.relationship_started_on, 'not recorded')}</dd>
        <dt>Last contact</dt><dd>${v.details.last_contact.label}<br><span class="help">read from the contact logged below, never typed</span></dd>
        <dt>Next contact</dt><dd>${v.details.next_contact.overdue ? h`<strong>${v.details.next_contact.label}</strong>` : h`${v.details.next_contact.label}`}</dd>
        <dt>Notes</dt><dd>${orNot(v.details.notes, 'none')}</dd>
        ${v.details.from_public_form ? h`<dt>Recorded by</dt><dd>the public referral form — check it is the firm it says</dd>` : raw('')}
      </dl></div>`}

      <div class="pblock"><div class="pnum">What the firm has sent us — worked out, never stored</div>
        ${v.pipeline === undefined ? raw('') : h`<dl>
          <dt>Leads referred</dt><dd>${String(v.pipeline.leads_referred)}</dd>
          <dt>Claims opened</dt><dd>${String(v.pipeline.claims_opened)}</dd>
          <dt>Claims won</dt><dd>${String(v.pipeline.claims_won)}</dd>
          <dt>Reasoned negatives</dt><dd>${String(v.pipeline.reasoned_negatives)} <span class="help">— counted apart from the wins</span></dd></dl>`}
        ${v.value === undefined ? raw('') : h`<p>Estimated claim value: <strong>${v.value.estimated_allowances}</strong>
          <br><span class="help">${String(v.value.claims_with_estimate)} with an estimate, ${String(v.value.claims_without_estimate)} without — ${v.value.basis}</span></p>`}
        ${v.money === undefined ? raw('') : h`<p>Fees invoiced: <strong>${v.money.fees_invoiced}</strong> · fees paid: <strong>${v.money.fees_paid}</strong>
          <br><span class="help">${String(v.money.invoices_counted)} invoices counted, ${String(v.money.invoices_without_a_fee)} with no fee recorded — ${v.money.basis}</span></p>`}
      </div>

      ${v.referrals === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Referrals</div>
        ${v.referrals.length === 0 ? h`<p class="help">No lead names this firm.</p>` : h`<table>
          <thead><tr><th>Client</th><th>Date</th><th>Lead status</th><th>Claim</th><th>Sharing progress</th></tr></thead>
          <tbody>${v.referrals.map((r) => h`<tr><td><a href="/staff/leads/${r.lead_id}">${r.organisation}</a></td><td>${r.lead_date}</td>
            <td>${r.status}</td><td>${r.claim === null ? h`<span class="help">—</span>` : h`<a href="/staff/claims/${r.claim.id}">Open the claim</a> · ${r.claim.stage} ${claimRef(r.claim.claim_ref)}`}</td>
            <td>${orNot(r.share, 'not shown to this role')}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`<form method="post" action="/staff/introducers/${v.id}/referrals">
          <p class="help">A referral from this firm.</p>
          <label>The person referring <select name="contact_id">${people(firmPeople, null, 'somebody not listed — name them')}</select></label>
          <label>Or their name <input name="contact_name"></label>
          <label>Their email <input name="contact_email" type="email"></label>
          ${clientFields()}
          <button type="submit">Record the referral</button></form>`}</div>`}

      ${v.contacts === undefined ? raw('') : h`<div class="pblock"><div class="pnum">The people at the firm</div>
        ${contacts.length === 0 ? h`<p class="help">Nobody at the firm is recorded.</p>` : h`<table>
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Telephone</th><th>Notes</th><th>Receives notices</th></tr></thead>
          <tbody>${contacts.map((c) => h`<tr><td>${c.full_name}</td><td>${orNot(c.job_title, '—')}</td><td>${orNot(c.email, '—')}</td>
            <td>${orNot(c.phone, '—')}</td><td>${orNot(c.notes, '—')}</td><td>${c.receives_notices ? 'yes' : ''}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`<form method="post" action="/staff/introducers/${v.id}/contacts">
          <label>Name <input name="full_name" required></label><label>Role <input name="job_title"></label>
          <label>Email <input name="email" type="email"></label><label>Telephone <input name="phone"></label>
          <label>Notes <input name="notes"></label><button type="submit">Add the person</button></form>`}</div>`}

      ${v.contact_log === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Contact with the firm — tasks on the firm</div>
        <p class="help">A call, an email or a meeting is a task, as it is on a client: logged as done, or planned with an owner
        and a date. The last contact and the next are read from these. A planned one is completed on its own task page.</p>
        ${v.contact_log.length === 0 ? h`<p class="help">Nothing is logged or planned.</p>` : h`<table>
          <thead><tr><th>What</th><th>Kind</th><th>With</th><th>Owner</th><th>State</th><th>Note</th></tr></thead>
          <tbody>${v.contact_log.map((t) => h`<tr><td><a href="/staff/tasks/${t.task_id}">${t.what}</a></td>
            <td>${t.kind}${t.reciprocity ? h`<br><span class="help">reward model A</span>` : raw('')}</td>
            <td>${orNot(t.with, 'the firm')}</td><td>${orNot(t.owner, '—')}</td>
            <td>${t.overdue ? h`<strong>${t.state}</strong>` : h`${t.state}`}</td><td>${orNot(t.note, '—')}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`
          <form method="post" action="/staff/introducers/${v.id}/contact-log">
            <p class="help">Log contact that has happened.</p>
            <label>Kind <select name="kind">${options(e.kinds, null, 'choose')}</select></label>
            <label>What it was <input name="title" required maxlength="300"></label>
            <label>With <select name="contact_id">${people(firmPeople, null, 'the firm')}</select></label>
            <label>Note <input name="note"></label><button type="submit">Log it</button></form>
          <form method="post" action="/staff/introducers/${v.id}/next-contact">
            <p class="help">Plan the next contact.</p>
            <label>Kind <select name="kind">${options(e.kinds, null, 'choose')}</select></label>
            <label>What it is <input name="title" required maxlength="300"></label>
            <label>With <select name="contact_id">${people(firmPeople, null, 'the firm')}</select></label>
            <label>Owner <select name="owner_id">${people(e.owners, v.details?.owner?.id ?? null, 'choose')}</select></label>
            <label>Due <input name="due_on" type="date" required></label>
            <label>Note <input name="note"></label><button type="submit">Plan it</button></form>
          <p class="help">The reward model is ${v.reward.model.label.toLowerCase()}. Model A must be on to log a CPD session,
          a joint one-pager or faster turnaround.</p>`}</div>`}

      ${v.fees === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Fees to this firm under reward model B</div>${feeTable(v.fees)}</div>`}

      ${e === undefined || v.details === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Change the firm</div>
        <form method="post" action="/staff/introducers/${v.id}">
          <label>Name <input name="firm_name" value="${v.firm_name}"></label>
          <label>Kind <select name="introducer_type">${options(e.types, v.details.type.key, 'not recorded')}</select></label>
          <label>Relationship owner <select name="owner_id">${people(e.owners, v.details.owner?.id ?? null, 'nobody yet')}</select></label>
          <label>Relationship started <input name="relationship_started_on" type="date" value="${v.details.relationship_started_on ?? ''}"></label>
          <label>Who receives progress notices <select name="notice_contact_id">${people(
            firmPeople, contacts.find((c) => c.receives_notices)?.id ?? null, 'nobody — no notice can be sent')}</select></label>
          <label>Notes <textarea name="notes">${v.details.notes ?? ''}</textarea></label>
          <button type="submit">Save</button></form></div>`}

      ${dataLink(actor, `/staff/introducers/${v.id}/view.json`)}`,
  });
}

/* ------------------------------------------------------------------ *
 * THE REWARD MODEL
 * ------------------------------------------------------------------ */

function rewardPage(d: IntroducerPageDeps, actor: Actor, v: I.RewardView, msg: string | undefined): string {
  return page({
    title: 'The introducer reward model', nav: d.nav(actor), wide: true,
    body: h`<h1>The introducer reward model</h1>${saved(msg)}
      <p>It is <strong>${v.model.label}</strong>${v.fee === null ? raw('') : h`, at ${v.fee} per successful claim`}.
        ${v.changed === null ? h`<span class="help">It has never been changed.</span>` : h`<span class="help">Last changed ${v.changed}.</span>`}</p>
      <div class="gate"><strong>Three models are built. The reward starts as Off.</strong> Our referral network paper says: no cash to accountants.
        That is model A, where we give the firm something back. Model B is a fixed fee for each successful claim. It is paid
        to the firm, never to a person. Model C is a share of the fee we invoice. It is paid to a registered accountancy
        firm that referred the claim. Nothing is paid until we record that the client was told about it. Which one, if any,
        is for Lakhbir to decide: “${v.question}”</div>
      ${v.clause_one_blanks.length === 0 ? h`<p class="help">Clause 1 of the engagement letter has no blank left.</p>`
        : h`<p><strong>This cannot be switched on while clause 1 of the engagement letter is blank.</strong> It still reads:</p>
          <ul>${v.clause_one_blanks.map((t) => h`<li><q class="letter-quote">${t}</q></li>`)}</ul>`}
      ${!v.may_switch ? raw('') : h`<div class="pblock"><div class="pnum">Switch it</div>
        <form method="post" action="/staff/introducer-rewards">
          <label>Model <select name="model">${options(v.models, v.model.key, null)}</select></label>
          <label>Model B's fee per successful claim, in pounds <input name="fee_pounds" inputmode="decimal"></label>
          <button type="submit">Save</button></form></div>`}
      ${v.fees === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Fees to introducers</div>${feeTable(v.fees)}</div>`}
      ${dataLink(actor, '/staff/introducer-rewards/view.json')}`,
  });
}

/* ------------------------------------------------------------------ *
 * ON A LEAD'S PAGE — drawn by src/web/pipeline-pages.ts
 * ------------------------------------------------------------------ */

export function referralBlock(lead_id: string, r: I.LeadReferral | null): Safe {
  if (r === null) return raw('');
  const s = r.share;
  return h`<div class="pblock"><div class="pnum">The introducer, and sharing progress with it</div>
    <p>Referred by ${r.introducer.linkable ? h`<a href="/staff/introducers/${r.introducer.id}">${r.introducer.name}</a>` : h`${r.introducer.name}`}.</p>
    ${s === undefined ? raw('') : h`
      <p>Does the client want progress shared with the firm? <strong>${s.label}</strong></p>
      <p class="help">We ask the client, because it is their claim. Until they say yes, nothing about the claim is
      sent to the firm. Never asked counts the same as no.</p>
      ${!s.may_record ? raw('') : h`<form method="post" action="/staff/leads/${lead_id}/share-progress">
        <p>Read the client these words, then record what they said:</p>
        <blockquote>${s.current_wording.words}</blockquote>
        <input type="hidden" name="wording_version" value="${s.current_wording.version}">
        <label>Their answer <select name="decision">${options(s.decisions, null, 'choose — nothing is assumed')}</select></label>
        <button type="submit">Record the answer</button></form>`}
      <h3>Notices to the firm</h3>
      ${(r.notices ?? []).length === 0 ? h`<p class="help">None has fallen due.</p>` : h`<table>
        <thead><tr><th>When</th><th>Notice</th><th>What happened</th></tr></thead>
        <tbody>${(r.notices ?? []).map((n) => h`<tr><td>${n.at}</td><td>${n.notice}</td><td>${n.outcome}</td></tr>`)}</tbody></table>`}
      <p class="help">${STUB_NOTICE}</p>`}</div>`;
}
