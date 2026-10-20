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
import { breadcrumb, claimRef, dataLink, savedMessage } from './components.ts';
import { kpiRow, lateBadge, nobodyBadge } from './look.ts';
import { setSubMenu } from './navigation.ts';
import * as I from './introducers.ts';
import { vocabulary } from './vocabularies.ts';
import { SECTORS } from './leads.ts';
import { STUB_NOTICE } from '../stubs/email.ts';
import { piecesPage } from './upload-pieces.ts';

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
  // PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.
  const pp = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, pp.headers);
  res.end(pp.body);
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
    const open = url.searchParams.get('record') === 'referral' ? 'referral' : url.searchParams.get('add') === 'firm' ? 'firm' : null;
    html(res, 200, listPage(d, actor, I.introducerList(db, actor, d.app.now()), done, open));
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
  // Phase 157: record that the firm signed our introducer terms (migration 094), so it is registered.
  const signed = /^\/staff\/introducers\/([A-Za-z0-9-]+)\/terms-signed$/.exec(path);
  if (signed && method === 'POST') {
    const id = signed[1] ?? '';
    const r = I.recordTermsSigned(deps, actor, id, posted(await form(req), ['signed_on', 'firm_signatory', 'our_signatory']));
    if (!r.ok) return d.problem(res, actor, 'Signature not recorded', r.why, `/staff/introducers/${id}`, r.field);
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
    html(res, 200, firmPage(d, actor, I.introducerView(db, actor, one[1] ?? '', d.app.now()), done, url.searchParams.get('refer') === '1'));
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

/** UI TIDY PHASE 14: where the top's buttons open each form, folded until asked for. */
export const RECORD_REFERRAL_HREF = '/staff/introducers?record=referral#record-referral';
export const ADD_FIRM_HREF = '/staff/introducers?add=firm#add-firm';

/** UI TIDY PHASE 14: the reward model in a word or two, grey while it is off. The full words are on its own page. */
export function rewardBadge(model: string): Safe {
  return model === 'OFF' ? h`<span class="badge b-nodate">Off</span>` : h`<span class="badge b-info">Model ${model.charAt(0)}</span>`;
}

/** UI TIDY PHASE 14: a reading's first part, "none recorded", where the list has no room for why; the firm's page keeps it all. */
export function firstPart(label: string): string {
  return label.split(' — ')[0] ?? label;
}

/** UI TIDY PHASE 14: what a firm sent us, in one cell: "2 leads, 1 claim opened, 0 won", then its reasoned negatives. */
export function sentUs(p: { leads_referred: number; claims_opened: number; claims_won: number; reasoned_negatives: number }): Safe {
  const many = (n: number, one: string, more: string): string => `${String(n)} ${n === 1 ? one : more}`;
  return h`${many(p.leads_referred, 'lead', 'leads')}, ${many(p.claims_opened, 'claim', 'claims')} opened, ${String(p.claims_won)} won<br><span class="help">${many(p.reasoned_negatives, 'reasoned negative', 'reasoned negatives')}</span>`;
}

/** UI TIDY PHASE 14: the counts over the firms a login may read in full. */
export function introducerCounts(rows: readonly I.IntroducerRow[]): { firms: number; leads: number; claims: number; won: number; late: number } {
  const full = rows.filter((r) => r.pipeline !== undefined);
  return {
    firms: rows.length,
    leads: full.reduce((n, r) => n + (r.pipeline?.leads_referred ?? 0), 0),
    claims: full.reduce((n, r) => n + (r.pipeline?.claims_opened ?? 0), 0),
    won: full.reduce((n, r) => n + (r.pipeline?.claims_won ?? 0), 0),
    late: rows.filter((r) => r.details?.next_contact.overdue === true).length,
  };
}

/**
 * UI TIDY PHASE 14 — INTRODUCERS, 3 October 2026. The page opens with what it is, its two buttons (Record a referral,
 * Add a firm) and the reward model as a label; boxes count the firms, what they sent and the firms whose next contact is
 * late. The firms are one table — the contact's last and next in one cell, what the firm sent us in one, the fees
 * invoiced and paid in one — that stacks on a phone; a firm with nobody on it says so in amber, and a late next contact is red. The two forms
 * fold away until a button opens them, or a refusal sends one back with what was typed.
 */
function listPage(d: IntroducerPageDeps, actor: Actor, rows: readonly I.IntroducerRow[], msg: string | undefined, open: 'referral' | 'firm' | null): string {
  const mayWrite = can(actor, 'introducer.write', SECTION_OBJ);
  const mayReward = can(actor, 'introducer_reward.read', { type: 'introducer_reward', id: 'the-setting' });
  const firms = rows.map((r) => ({ id: r.id, name: r.firm_name }));
  const model = I.rewardSetting(d.app.db).model;
  const n = introducerCounts(rows);
  const full = rows.some((r) => r.details !== undefined);
  const money = rows.some((r) => r.money !== undefined);
  setSubMenu({ items: [
    { href: '/staff/introducers#firms', label: 'The firms', ...(rows.length > 0 ? { note: String(rows.length) } : {}) },
    ...(mayWrite ? [{ href: RECORD_REFERRAL_HREF, label: 'Record a referral' }, { href: ADD_FIRM_HREF, label: 'Add a firm' }] : []),
    ...(mayReward ? [{ href: '/staff/introducer-rewards', label: 'The reward model' }] : []),
  ] });
  return page({
    title: 'Introducers', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><h1>Introducers</h1>
        <p class="lede">Firms that refer clients to us — an accountancy practice above all.</p></div>
        ${mayWrite ? h`<p><a class="btn" href="${ADD_FIRM_HREF}">Add a firm</a> <a class="btn btn-primary" href="${RECORD_REFERRAL_HREF}">Record a referral</a></p>` : raw('')}</div>${saved(msg)}
      ${full ? kpiRow([
        { label: 'Firms', value: String(n.firms), tone: 'total', href: '#firms' },
        { label: 'Leads referred', value: String(n.leads), tone: 'win', href: '#firms' },
        { label: 'Claims opened', value: String(n.claims), tone: 'survey', href: '#firms' },
        { label: 'Claims won', value: String(n.won), tone: 'paid', href: '#firms' },
        { label: 'Next contact late', value: String(n.late), tone: n.late > 0 ? 'late' : 'plain', href: '#firms' },
      ]) : raw('')}
      ${mayReward ? h`<p class="rewardline">The reward model: ${rewardBadge(model)} <a href="/staff/introducer-rewards">the reward model and any fees</a></p>` : raw('')}
      <p class="help"><strong>The people at a firm are its contacts, and none of them has a login.</strong> Every figure here
      is worked out fresh from the leads, the claims, the invoices and the tasks. None is stored. A value nobody knows is
      shown as not known, never as £0.</p>

      <h2 id="firms">The firms</h2>
      ${rows.length === 0 ? h`<p class="empty">No introducer is recorded.${mayWrite ? h` <a href="${RECORD_REFERRAL_HREF}">Record a referral</a> — it adds the firm too — or <a href="${ADD_FIRM_HREF}">add a firm</a>.` : raw('')}</p>` : h`<div class="tablewrap"><table class="stack">
        <thead><tr><th>Firm</th>${full ? h`<th>Owner</th><th>Contact</th><th>Sent us</th>` : raw('')}${money ? h`<th>Fees</th>` : raw('')}</tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/introducers/${r.id}">${r.firm_name}</a>${r.details === undefined || r.details.type === 'not recorded' ? raw('') : h`<br><span class="help">${r.details.type}</span>`}${
          r.details?.from_public_form === true ? h`<br><span class="badge b-nobody">from the public form — check it is the firm it says</span>` : raw('')}</td>
          ${!full ? raw('') : r.details === undefined || r.pipeline === undefined ? h`<td colspan="3">—</td>` : h`
          <td data-label="Owner">${r.details.owner === null ? nobodyBadge('Nobody yet') : h`${r.details.owner}`}</td>
          <td data-label="Contact">Last: ${firstPart(r.details.last_contact)}<br>Next: ${r.details.next_contact.overdue ? lateBadge(r.details.next_contact.label) : h`${firstPart(r.details.next_contact.label)}`}</td>
          <td data-label="Sent us">${sentUs(r.pipeline)}</td>`}
          ${!money ? raw('') : h`<td data-label="Fees">${r.money === undefined ? h`<span class="help">not shown to this role</span>` : h`${r.money.fees_invoiced} invoiced<br>${r.money.fees_paid} paid`}</td>`}</tr>`)}</tbody></table></div>`}

      ${!mayWrite ? raw('') : h`<details class="pblock recordlead" id="record-referral"${open === 'referral' ? raw(' open') : raw('')}><summary class="pnum">Record a referral</summary>
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
          <button type="submit">Record the referral</button></form></details>

        <details class="pblock recordlead" id="add-firm"${open === 'firm' ? raw(' open') : raw('')}><summary class="pnum">Add a firm</summary>
        <form method="post" action="/staff/introducers">
          <label>The firm's name <input name="firm_name" required></label>
          <label>Its kind <select name="introducer_type">${options(vocabulary(d.app.db, 'INTRODUCER_TYPE'), null, 'not recorded')}</select></label>
          <label>Relationship started <input name="relationship_started_on" type="date"></label>
          <label>Notes <textarea name="notes"></textarea></label>
          <button type="submit">Add the firm</button></form></details>`}`,
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

function firmPage(d: IntroducerPageDeps, actor: Actor, v: I.IntroducerView, msg: string | undefined, refer = false): string {
  const e = v.edit;
  const contacts = v.contacts ?? [];
  const firmPeople = contacts.map((c) => ({ id: c.id, name: c.full_name }));
  // UI TIDY PHASE 14: the firm's sections open out under Introducers in the left-hand menu.
  setSubMenu({ title: v.firm_name, items: [
    ...(v.details === undefined ? [] : [{ href: '#firm', label: 'The firm' }]),
    { href: '#sent', label: 'What it has sent us' },
    ...(v.referrals === undefined ? [] : [{ href: '#referrals', label: 'Referrals', ...(v.referrals.length > 0 ? { note: String(v.referrals.length) } : {}) }]),
    ...(v.contacts === undefined ? [] : [{ href: '#people', label: 'The people at the firm', ...(contacts.length > 0 ? { note: String(contacts.length) } : {}) }]),
    ...(v.contact_log === undefined ? [] : [{ href: '#contact', label: 'Contact with the firm' }]),
    ...(v.fees === undefined ? [] : [{ href: '#fees', label: 'Fees to this firm' }]),
    ...(e === undefined || v.details === undefined ? [] : [{ href: '#change', label: 'Change the firm' }]),
  ] });
  return page({
    title: v.firm_name, nav: d.nav(actor), wide: true,
    body: h`${breadcrumb([{ label: 'Introducers', href: '/staff/introducers' }, { label: v.firm_name }])}
      <div class="pagehead"><div><h1>${v.firm_name}</h1>
        ${v.details === undefined ? raw('') : h`<p class="lede">${v.details.type.key === null ? raw('') : h`${v.details.type.label} · `}${v.details.owner === null ? nobodyBadge('Nobody yet') : h`Owned by ${v.details.owner.name}`} · Next contact: ${v.details.next_contact.overdue ? lateBadge(v.details.next_contact.label) : h`${firstPart(v.details.next_contact.label)}`}</p>`}</div>
        ${v.referrals !== undefined && e !== undefined ? h`<p><a class="btn btn-primary" href="?refer=1#refer-here">Record a referral</a></p>` : raw('')}</div>${saved(msg)}
      ${v.pipeline === undefined ? raw('') : kpiRow([
        { label: 'Leads referred', value: String(v.pipeline.leads_referred), tone: 'win', href: '#referrals' },
        { label: 'Claims opened', value: String(v.pipeline.claims_opened), tone: 'survey', href: '#referrals' },
        { label: 'Claims won', value: String(v.pipeline.claims_won), tone: 'paid', href: '#referrals' },
        { label: 'Reasoned negatives', value: String(v.pipeline.reasoned_negatives), tone: 'plain', href: '#sent' },
      ])}
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

      ${v.details === undefined ? raw('') : h`<div class="pblock" id="firm"><div class="pnum">The firm</div><dl>
        <dt>Kind</dt><dd>${v.details.type.label}</dd>
        <dt>Relationship owner</dt><dd>${v.details.owner === null ? nobodyBadge('Nobody yet') : h`${v.details.owner.name}`}</dd>
        <dt>Relationship started</dt><dd>${orNot(v.details.relationship_started_on, 'not recorded')}</dd>
        <dt>Last contact</dt><dd>${v.details.last_contact.label}<br><span class="help">read from the contact logged below, never typed</span></dd>
        <dt>Next contact</dt><dd>${v.details.next_contact.overdue ? lateBadge(v.details.next_contact.label) : h`${v.details.next_contact.label}`}</dd>
        <dt>Notes</dt><dd>${orNot(v.details.notes, 'none')}</dd>
        ${v.details.from_public_form ? h`<dt>Recorded by</dt><dd>the public referral form — check it is the firm it says</dd>` : raw('')}
      </dl></div>`}

      <div class="pblock" id="sent"><div class="pnum">What the firm has sent us — worked out, never stored</div>
        ${v.pipeline === undefined ? raw('') : h`<p class="help">The boxes at the top count the leads it referred, the claims opened and won, and the
          reasoned negatives — counted apart from the wins.</p>`}
        ${v.value === undefined ? raw('') : h`<p>Estimated claim value: <strong>${v.value.estimated_allowances}</strong>
          <br><span class="help">${String(v.value.claims_with_estimate)} with an estimate, ${String(v.value.claims_without_estimate)} without — ${v.value.basis}</span></p>`}
        ${v.money === undefined ? raw('') : h`<p>Fees invoiced: <strong>${v.money.fees_invoiced}</strong> · fees paid: <strong>${v.money.fees_paid}</strong>
          <br><span class="help">${String(v.money.invoices_counted)} invoices counted, ${String(v.money.invoices_without_a_fee)} with no fee recorded — ${v.money.basis}</span></p>`}
      </div>

      ${v.referrals === undefined ? raw('') : h`<div class="pblock" id="referrals"><div class="pnum">Referrals</div>
        ${v.referrals.length === 0 ? h`<p class="help">No lead names this firm.</p>` : h`<table>
          <thead><tr><th>Client</th><th>Date</th><th>Lead status</th><th>Claim</th><th>Sharing progress</th></tr></thead>
          <tbody>${v.referrals.map((r) => h`<tr><td><a href="/staff/leads/${r.lead_id}">${r.organisation}</a></td><td>${r.lead_date}</td>
            <td>${r.status}</td><td>${r.claim === null ? h`<span class="help">—</span>` : h`<a href="/staff/claims/${r.claim.id}">Open the claim</a> · ${r.claim.stage} ${claimRef(r.claim.claim_ref)}`}</td>
            <td>${orNot(r.share, 'not shown to this role')}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`<details class="formfold" id="refer-here"${refer ? raw(' open') : raw('')}><summary>Record a referral from this firm</summary><form method="post" action="/staff/introducers/${v.id}/referrals">
          <label>The person referring <select name="contact_id">${people(firmPeople, null, 'somebody not listed — name them')}</select></label>
          <label>Or their name <input name="contact_name"></label>
          <label>Their email <input name="contact_email" type="email"></label>
          ${clientFields()}
          <button type="submit">Record the referral</button></form></details>`}</div>`}

      ${v.contacts === undefined ? raw('') : h`<div class="pblock" id="people"><div class="pnum">The people at the firm</div>
        ${contacts.length === 0 ? h`<p class="help">Nobody at the firm is recorded.</p>` : h`<table>
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Telephone</th><th>Notes</th><th>Receives notices</th></tr></thead>
          <tbody>${contacts.map((c) => h`<tr><td>${c.full_name}</td><td>${orNot(c.job_title, '—')}</td><td>${orNot(c.email, '—')}</td>
            <td>${orNot(c.phone, '—')}</td><td>${orNot(c.notes, '—')}</td><td>${c.receives_notices ? 'yes' : ''}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`<details class="formfold"><summary>Add a person</summary><form method="post" action="/staff/introducers/${v.id}/contacts">
          <label>Name <input name="full_name" required></label><label>Role <input name="job_title"></label>
          <label>Email <input name="email" type="email"></label><label>Telephone <input name="phone"></label>
          <label>Notes <input name="notes"></label><button type="submit">Add the person</button></form></details>`}</div>`}

      ${v.contact_log === undefined ? raw('') : h`<div class="pblock" id="contact"><div class="pnum">Contact with the firm — tasks on the firm</div>
        <p class="help">A call, an email or a meeting is a task, as it is on a client: logged as done, or planned with an owner
        and a date. The last contact and the next are read from these. A planned one is completed on its own task page.</p>
        ${v.contact_log.length === 0 ? h`<p class="help">Nothing is logged or planned.</p>` : h`<table>
          <thead><tr><th>What</th><th>Kind</th><th>With</th><th>Owner</th><th>State</th><th>Note</th></tr></thead>
          <tbody>${v.contact_log.map((t) => h`<tr><td><a href="/staff/tasks/${t.task_id}">${t.what}</a></td>
            <td>${t.kind}${t.reciprocity ? h`<br><span class="help">reward model A</span>` : raw('')}</td>
            <td>${orNot(t.with, 'the firm')}</td><td>${orNot(t.owner, '—')}</td>
            <td>${t.overdue ? lateBadge(t.state) : h`${t.state}`}</td><td>${orNot(t.note, '—')}</td></tr>`)}</tbody></table>`}
        ${e === undefined ? raw('') : h`
          <details class="formfold"><summary>Log contact that has happened</summary><form method="post" action="/staff/introducers/${v.id}/contact-log">
            <label>Kind <select name="kind">${options(e.kinds, null, 'choose')}</select></label>
            <label>What it was <input name="title" required maxlength="300"></label>
            <label>With <select name="contact_id">${people(firmPeople, null, 'the firm')}</select></label>
            <label>Note <input name="note"></label><button type="submit">Log it</button></form></details>
          <details class="formfold"><summary>Plan the next contact</summary><form method="post" action="/staff/introducers/${v.id}/next-contact">
            <label>Kind <select name="kind">${options(e.kinds, null, 'choose')}</select></label>
            <label>What it is <input name="title" required maxlength="300"></label>
            <label>With <select name="contact_id">${people(firmPeople, null, 'the firm')}</select></label>
            <label>Owner <select name="owner_id">${people(e.owners, v.details?.owner?.id ?? null, 'choose')}</select></label>
            <label>Due <input name="due_on" type="date" required></label>
            <label>Note <input name="note"></label><button type="submit">Plan it</button></form></details>
          <p class="help">The reward model is ${v.reward.model.label.toLowerCase()}. Model A must be on to log a CPD session,
          a joint one-pager or faster turnaround.</p>`}</div>`}

      ${v.fees === undefined ? raw('') : h`<div class="pblock" id="fees"><div class="pnum">Fees to this firm under reward model B</div>${feeTable(v.fees)}</div>`}

      ${v.details === undefined ? raw('') : h`<div class="pblock" id="terms"><div class="pnum">Our introducer terms</div>
        <p>${v.details.terms === null
          ? 'Not signed. Until the firm signs our introducer terms it is not a registered introducer, and the 10% share (model C) pays it nothing.'
          : `Signed on ${v.details.terms.signed_on} (terms ${v.details.terms.version}). The firm is a registered introducer.`}</p>
        <p class="help">The terms are a draft until the director agrees them and the solicitor checks them. The 10% share stays off until then.</p>
        ${e === undefined ? raw('') : h`<details class="formfold"><summary>Record that the terms were signed</summary><form method="post" action="/staff/introducers/${v.id}/terms-signed">
          <label>Signed on <input name="signed_on" type="date" required></label>
          <label>Signed for the firm by <input name="firm_signatory" required maxlength="200"></label>
          <label>Signed for us by (a director) <input name="our_signatory" required maxlength="200"></label>
          <button type="submit">Record the signature</button></form></details>`}</div>`}

      ${e === undefined || v.details === undefined ? raw('') : h`<div class="pblock" id="change"><div class="pnum">Change the firm</div>
        <details class="formfold"><summary>Change the firm's details</summary><form method="post" action="/staff/introducers/${v.id}">
          <label>Name <input name="firm_name" value="${v.firm_name}"></label>
          <label>Kind <select name="introducer_type">${options(e.types, v.details.type.key, 'not recorded')}</select></label>
          <label>Relationship owner <select name="owner_id">${people(e.owners, v.details.owner?.id ?? null, 'nobody yet')}</select></label>
          <label>Relationship started <input name="relationship_started_on" type="date" value="${v.details.relationship_started_on ?? ''}"></label>
          <label>Who receives progress notices <select name="notice_contact_id">${people(
            firmPeople, contacts.find((c) => c.receives_notices)?.id ?? null, 'nobody — no notice can be sent')}</select></label>
          <label>Notes <textarea name="notes">${v.details.notes ?? ''}</textarea></label>
          <button type="submit">Save</button></form></details></div>`}

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
