/**
 * THE LEADS PAGE AS CARDS, IN FOUR SECTIONS — PHASE 137, 21 September 2026.
 *
 * Lakhbir, 18 September 2026: "these should be CTA cards which the user can click on to display the information
 * underneath. A new lead can easily slip out of this whole pile, so it needs to be split up."
 *
 *   New — not contacted yet   status NEW, and the website enquiries nobody has answered. Always first, never folded.
 *                             A card is red once it has waited more than one working day (src/web/working-days.ts —
 *                             the same function Home's New leads row reads, so the two never disagree).
 *   In progress               Contacted and Qualified. Red when the next step is late or there is none — Home's rule.
 *   Later                     Nurture. Red on the same rule as In progress.
 *   Closed                    Converted and Lost. Folded until opened.
 *
 * ORDER IS WAITING TIME, NEVER VALUE. The longest-waiting lead is first in every open section; there is no lead score,
 * because a score built on the estimate would rank the unknowns. No card carries a range or a value.
 *
 * A CARD IS A <details>. The summary is the card; opening it shows the lead's details underneath, in place. The content
 * security policy forbids script, so this is the browser's own open-and-close and it works with none.
 *
 * NOTHING HERE DECIDES ANYTHING. Every card is a lead the store already let this login read (`lead.read`, per lead), its
 * details are the store's own `leadView` for that lead, and every button posts to a route that asks the server again.
 */

import type { Actor } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { plainNeed } from './next-step.ts';
import { ukDatesIn } from './localtime.ts';
import type { LeadListRow } from './lists.ts';
import type { LeadView } from './leads.ts';
import type { EnquiryRow } from './enquiries.ts';
import { PROPERTY_TYPES } from './enquiries.ts';
import { SECTORS } from './leads.ts';
import { dueReading } from './tasks.ts';
import { isLateNewLead, waitedWords, workingDaysSince } from './working-days.ts';

export type LeadSectionKey = 'new' | 'going' | 'later' | 'closed';

/** Which section a lead's status puts it in. A status the list does not know is shown in progress, not hidden. */
export function leadSection(status: string): LeadSectionKey {
  switch (status) {
    case 'NEW': return 'new';
    case 'NURTURE': return 'later';
    case 'CONVERTED': case 'LOST': return 'closed';
    default: return 'going';
  }
}

export const SECTION_TITLES: Readonly<Record<LeadSectionKey, string>> = Object.freeze({
  new: 'New — not contacted yet',
  going: 'In progress',
  later: 'Later',
  closed: 'Closed',
});

export type CardDeps = {
  readonly actor: Actor;
  readonly nowIso: string;
  /** The store's view of one lead, or undefined where it cannot be read. */
  readonly view: (id: string) => LeadView | undefined;
  readonly mayAddTask: boolean;
  readonly mayHandleEnquiries: boolean;
};

/* ================================================================== *
 * ONE CARD
 * ================================================================== */

function line(text: Safe | string, cls = ''): Safe {
  return h`<span class="lc-line${cls === '' ? '' : ` ${cls}`}">${text}</span>`;
}

function opener(): Safe {
  return h`<span class="lc-open" aria-hidden="true"><span class="lc-show">Show details</span><span class="lc-hide">Hide details</span></span>`;
}

type CardFace = { readonly id: string; readonly late: boolean; readonly name: string; readonly lines: readonly Safe[]; readonly body: Safe; readonly after?: Safe; readonly kind?: string };

function cardOf(c: CardFace): Safe {
  return h`<li class="leadcard${c.late ? ' late' : ''}${c.kind === undefined ? '' : ` ${c.kind}`}" id="${c.id}"><details><summary>
    <span class="lc-name">${c.name}</span>${c.lines}${opener()}</summary>
    <div class="lc-body">${c.body}</div></details>${c.after ?? raw('')}</li>`;
}

/** The next step in words, and whether it is late or missing — the same reading as Home's next-actions row. */
function nextStep(r: LeadListRow, nowIso: string): { words: string; late: boolean } {
  if (r.next_action === null) return { words: 'No next step yet', late: true };
  const due = dueReading(r.next_action_due, nowIso);
  return { words: `Next: ${r.next_action}${due.state === 'NO_DUE_DATE' ? '' : ` — ${due.label}`}`, late: due.overdue };
}

function leadFace(r: LeadListRow, d: CardDeps): { late: boolean; lines: Safe[] } {
  const section = leadSection(r.status.key);
  const days = workingDaysSince(r.lead_at, d.nowIso);
  const step = nextStep(r, d.nowIso);
  // New: red after one working day. In progress and Later: red when the next step is late or missing — Home's rule.
  const late = section === 'new' ? isLateNewLead(r.lead_at, d.nowIso) : section === 'closed' ? false : step.late;
  const waited = section === 'new' ? waitedWords(days)
    : section === 'closed' ? `${r.status.label} · came in ${ukDatesIn(r.lead_date)}`
      : days === 0 ? 'Came in today' : `Came in ${days} working ${days === 1 ? 'day' : 'days'} ago`;
  return {
    late,
    lines: [
      line(`${r.sector} · from ${r.source}`),
      line(waited, late && section === 'new' ? 'when' : ''),
      line(r.owner === null ? 'Nobody owns this yet' : `Owner: ${r.owner}`, r.owner === null ? 'nobody' : ''),
      ...(section === 'closed' ? [] : [line(step.words, late && section !== 'new' ? 'when' : '')]),
    ],
  };
}

/* ------------------------------------------------ the details, underneath */

function contactBlock(v: LeadView): Safe {
  const person = v.person === undefined ? raw('')
    : h`<p><strong>${v.person.name}</strong>${v.person.role === null ? raw('') : h`, ${v.person.role}`}${v.person.reach === null ? raw('') : h`<br>${v.person.reach}`}</p>`;
  const channel = v.contact_channel === null ? raw('') : h`<p class="help">${v.contact_channel}</p>`;
  const org = v.organisation.linkable && v.organisation.id !== null
    ? h`<p><a href="/staff/clients/${v.organisation.id}">Open ${v.organisation.name}’s client page</a> for everyone we hold there.</p>` : raw('');
  const empty = v.person === undefined && v.contact_channel === null && org.html === '';
  return h`<div class="lc-part"><h3>How to reach them</h3>${empty ? h`<p class="help">No contact details yet.</p>` : h`${person}${channel}${org}`}</div>`;
}

function assessmentBlock(v: LeadView): Safe {
  return h`<div class="lc-part"><h3>What the assessment captured</h3>${
    v.initial_property_value.length === 0 && v.opportunity_value === undefined ? h`<p class="help">Nothing yet — no assessment was filled in.</p>`
      : h`${v.initial_property_value.length === 0 ? raw('') : h`<dl class="lc-facts">${v.initial_property_value.map((a) => h`<dt>${a.question}</dt><dd>${a.answer}</dd>`)}</dl>`}${
        v.opportunity_value === undefined ? raw('') : h`<p>Range the client was shown: <strong>${v.opportunity_value.shown_range}</strong></p>`}`}</div>`;
}

function checksBlock(v: LeadView): Safe {
  return h`<div class="lc-part"><h3>Before they can be a client</h3>
    <ul class="lc-checks">${v.enquiry.checks.map((c) => h`<li class="${c.passes ? 'yes' : 'no'}"><span class="lc-mark">${c.passes ? 'Yes' : c.recorded?.answer_given === 'NO' ? 'No' : 'Not known'}</span> ${plainNeed(c.label).words}</li>`)}</ul>
    ${v.enquiry.open ? h`<p>Every answer is a yes.</p>` : h`<p class="help">Every answer must be a yes. Not known does not count.</p>`}
    ${v.may_write ? h`<p><a href="/staff/leads/${v.id}#enquiry-gate">Record an answer</a></p>` : raw('')}</div>`;
}

function takeIt(v: LeadView, actor: Actor): Safe {
  if (!v.may_write || v.owner !== null || v.edit === undefined || !v.edit.owners.some((p) => p.id === actor.id)) return raw('');
  return h`<form method="post" action="/staff/leads/${v.id}" class="lc-take"><input type="hidden" name="owner_id" value="${actor.id}">
    <input type="hidden" name="back" value="leads"><button type="submit">Nobody owns this — take it</button></form>`;
}

function actionsBlock(v: LeadView, d: CardDeps): Safe {
  if (!v.may_write || v.edit === undefined) return raw('');
  if (v.owner === null && v.edit.owners.some((p) => p.id === d.actor.id)) {
    return h`<div class="lc-part"><p class="help">Take it first, then log calls and move it on.</p></div>`;
  }
  const edit = v.edit;
  const convert = v.may_convert
    ? h`<details class="lc-act"><summary>Make them a client</summary><form method="post" action="/staff/leads/${v.id}/convert">
        ${v.organisation.id !== null ? raw('') : h`<label>The company the assessment created
          <select name="business_id" required><option value="">Choose</option>
          ${edit.organisations.map((o) => h`<option value="${o.id}">${o.name}</option>`)}</select></label>`}
        ${edit.properties.length === 0 ? raw('') : h`<label>Property
          <select name="property_id"><option value="">The first property</option>
          ${edit.properties.map((p) => h`<option value="${p.id}">${p.label}</option>`)}</select></label>`}
        <p class="help">This opens their claim. The answers are checked again when you press it.</p>
        <button type="submit">Make them a client</button></form></details>`
    : h`<span class="lc-off"><button type="button" disabled>Make them a client</button> <span class="help">${
      v.status.key === 'QUALIFIED' ? 'Every answer must be a yes first.' : 'Every answer must be a yes, then set them to Qualified.'}</span></span>`;
  return h`<div class="lc-part lc-actions"><h3>What next</h3>
    <details class="lc-act"><summary>Log a call</summary><form method="post" action="/staff/leads/${v.id}/call">
      <fieldset><legend>Did you speak to them?</legend>
        <label><input type="radio" name="spoke" value="yes" required> Yes</label>
        <label><input type="radio" name="spoke" value="no"> No answer, or a message left</label></fieldset>
      <label>What was said <textarea name="note" maxlength="2000"></textarea></label>
      <button type="submit">Save the call</button></form></details>
    <span class="lc-off"><button type="button" disabled>Email</button> <span class="help">Coming soon.</span></span>
    ${d.mayAddTask ? h`<details class="lc-act"><summary>Add next action</summary><form method="post" action="/staff/tasks">
      <input type="hidden" name="lead_id" value="${v.id}"><input type="hidden" name="back" value="/staff/leads">
      <input type="hidden" name="owner_id" value="${d.actor.id}">
      <label>What to do next <span class="req">(required)</span> <input name="title" required maxlength="300"></label>
      <label>By when <input name="due_on" type="date"></label>
      <p class="help">It is yours. Change the owner on the task if somebody else will do it.</p>
      <button type="submit">Add it</button></form></details>` : raw('')}
    ${convert}
    ${edit.lost_reasons.length === 0 ? raw('') : h`<details class="lc-act"><summary>Mark as lost</summary><form method="post" action="/staff/leads/${v.id}">
      <input type="hidden" name="status" value="LOST"><input type="hidden" name="back" value="leads">
      <label>Why? <span class="req">(required)</span> <select name="lost_reason" required><option value="">Choose a reason</option>${
        edit.lost_reasons.map((r) => h`<option value="${r.code}">${r.label}</option>`)}</select></label>
      <label>Anything to add <input name="lost_note" maxlength="2000"></label>
      <button type="submit">Mark as lost</button></form></details>`}
  </div>`;
}

function leadBody(r: LeadListRow, v: LeadView | undefined, d: CardDeps): Safe {
  const full = h`<p class="lc-full"><a href="/staff/leads/${r.id}">Open the full page</a></p>`;
  if (v === undefined) return full;
  if (leadSection(r.status.key) === 'closed') {
    return h`${v.lost === null ? raw('') : h`<p>Lost because: ${v.lost.reason ?? 'no reason recorded'}${v.lost.note === null ? raw('') : h` — ${v.lost.note}`}</p>`}${
      v.converted === null ? raw('') : h`<p>Became a client on ${v.converted.at}. <a href="/staff/claims/${v.converted.claim_id}">Open their claim</a></p>`}${full}`;
  }
  return h`<div class="lc-parts">${contactBlock(v)}${assessmentBlock(v)}${checksBlock(v)}</div>${actionsBlock(v, d)}${full}`;
}

export function leadCard(r: LeadListRow, d: CardDeps): Safe {
  const face = leadFace(r, d);
  const v = d.view(r.id);
  return cardOf({
    id: `lead-${r.id}`, late: face.late, name: r.organisation, lines: face.lines, body: leadBody(r, v, d),
    ...(v === undefined ? {} : { after: takeIt(v, d.actor) }),
  });
}

/* ------------------------------------------------ a website enquiry */

/**
 * A WEBSITE ENQUIRY NOBODY HAS ANSWERED, IN THE NEW SECTION. It is not a lead yet — no lead row, no owner, no checks —
 * and only a login that works leads sees it. Its two buttons are the enquiry's own: open it as a lead, or close it.
 */
export function enquiryCard(e: EnquiryRow, d: CardDeps): Safe {
  const days = workingDaysSince(e.created_at, d.nowIso);
  const late = isLateNewLead(e.created_at, d.nowIso);
  const sector = PROPERTY_TYPES[e.property_type];
  return cardOf({
    id: `enquiry-${e.id}`, late, kind: 'enquiry', name: e.firm ?? e.full_name,
    lines: [
      line(`${sector === null || sector === undefined ? e.property_type : (SECTORS[sector] ?? e.property_type)} · from the website form`),
      line(waitedWords(days), late ? 'when' : ''),
      line('Nobody owns this yet', 'nobody'),
      line('Next: reply, then open it as a lead'),
    ],
    body: h`<div class="lc-parts"><div class="lc-part"><h3>How to reach them</h3><p><strong>${e.full_name}</strong><br>${e.email}${
      e.phone === null ? raw('') : h`<br>${e.phone}`}</p><p class="help">They agreed to be contacted about this enquiry. That is not agreement to marketing.</p></div>
      <div class="lc-part"><h3>What they wrote</h3><p>${e.message ?? 'Nothing beyond the form.'}</p><p class="help">Property: ${e.property_type}. Sent ${ukDatesIn(e.created_at)}.</p></div></div>
      <div class="lc-part lc-actions"><h3>What next</h3>
        <form method="post" action="/staff/enquiries/${e.id}/lead" class="inline"><button type="submit">Open as a lead</button></form>
        <form method="post" action="/staff/enquiries/${e.id}/close" class="inline"><input type="hidden" name="back" value="leads"><button class="btn-quiet" type="submit">Close, nothing more needed</button></form></div>`,
  });
}

/* ================================================================== *
 * THE FOUR SECTIONS
 * ================================================================== */

type Item = { readonly at: string; readonly id: string; readonly card: Safe; readonly late: boolean };

function section(key: LeadSectionKey, items: readonly Item[], empty: string, folded: boolean): Safe {
  const title = SECTION_TITLES[key];
  const late = items.filter((x) => x.late).length;
  const head = h`<h2 id="leads-h-${key}"><span>${title}</span> <span class="lc-count">${String(items.length)}</span>${
    late === 0 ? raw('') : h` <span class="lc-latecount">${String(late)} ${key === 'new' ? 'waiting too long' : 'need a next step'}</span>`}</h2>`;
  const list = items.length === 0 ? h`<p class="empty">${empty}</p>` : h`<ul class="leadcards">${items.map((x) => x.card)}</ul>`;
  return folded
    ? h`<section class="leadsec" id="leads-${key}" aria-labelledby="leads-h-${key}"><details class="lc-fold"><summary>${head}</summary>${list}</details></section>`
    : h`<section class="leadsec" id="leads-${key}" aria-labelledby="leads-h-${key}">${head}${list}</section>`;
}

/**
 * EVERY SECTION, IN ORDER. Open sections: the longest-waiting first. Closed: the most recent first. Enquiries go into New
 * only when no filter is applied, since a filter on owner, sector or source is a question about leads.
 */
export function leadSections(rows: readonly LeadListRow[], enquiries: readonly EnquiryRow[], d: CardDeps): Safe {
  const by: Record<LeadSectionKey, Item[]> = { new: [], going: [], later: [], closed: [] };
  for (const r of rows) {
    const face = leadFace(r, d);
    by[leadSection(r.status.key)].push({ at: r.lead_at, id: r.id, late: face.late, card: leadCard(r, d) });
  }
  if (d.mayHandleEnquiries) {
    for (const e of enquiries) by.new.push({ at: e.created_at, id: e.id, late: isLateNewLead(e.created_at, d.nowIso), card: enquiryCard(e, d) });
  }
  const oldest = (a: Item, b: Item): number => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
  for (const k of ['new', 'going', 'later'] as const) by[k].sort(oldest);
  by.closed.sort((a, b) => oldest(b, a));
  return h`${section('new', by.new, 'No new leads. Nothing is waiting for a first call.', false)}${
    section('going', by.going, 'No leads in progress.', false)}${
    section('later', by.later, 'Nothing saved for later.', false)}${
    section('closed', by.closed, 'No closed leads yet.', true)}`;
}
