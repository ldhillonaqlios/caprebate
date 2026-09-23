/**
 * THE CLIENTS LIST'S ROUTE AND THE BUSINESS PAGE'S PANELS — routes and rendering. PHASE 135: the list itself is drawn by
 * src/web/client-list.ts, the one list that replaced "Engaged clients" and "Organisations".
 *
 * Same shape as `handleStaff` and `portalRoutes`: it returns 'not-mine' for
 * anything it does not own, so nothing is shadowed by accident and the mounting
 * in staff.ts is one line.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED and are not restated here:
 * authorise on the object on every request, no route maps a path onto the
 * filesystem, and every response is built with the `h` tagged template. The
 * third matters more on this page than anywhere else in the application:
 * INTERNAL NOTES ARE STAFF-SUPPLIED TEXT RENDERED IN A STAFF PAGE, which is
 * exactly where stored cross-site scripting lives. Every note goes through `h`,
 * which escapes anything that is not already Safe, and there is a test that
 * posts a script tag and asserts what comes back is escaped.
 *
 * NOTHING ON THESE PAGES DECIDES ANYTHING. The view models in engaged.ts and
 * research.ts do every authorisation and every derivation; this file draws what
 * they return. A renderer that decided whether to show a figure would be a
 * screen omitting a field, which is presentation and not a control.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { card, highlights, moreDetail, recordLayout, recordTabs, sidePanel, why, type QuickAction } from './components.ts';
import { localStamp } from './localtime.ts';
import { RANGE_QUALIFIER } from './shown-range.ts';
import * as E from './engaged.ts';
import * as R from './research.ts';
import * as A from './approvals.ts';
import { STEP_ANCHOR } from './approvals-pages.ts';
import { clientList, clientListPage, type ClientSort } from './client-list.ts';

export type WebResult = 'handled' | 'not-mine';

export type EngagedDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleEngaged(
  d: EngagedDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const deps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  /* PHASE 135: THE ONE CLIENTS LIST (src/web/client-list.ts), gated as the organisations list was, so the view-only login
     can read it. The engaged-client list it replaced is no longer drawn; `engagedClients` still serves its other readers. */
  if (path === '/staff/clients' && method === 'GET') {
    const sort: ClientSort = url.searchParams.get('sort') === 'name' ? 'name' : 'waiting';
    html(res, 200, clientListPage(d.nav(actor), clientList(db, actor, sort), sort));
    return 'handled';
  }

  /* PHASE 134: GET /staff/clients/:id is the ONE client page, drawn by src/web/client-page.ts, which is mounted first. */

  /* ---- panel 2 · the one button, and the one exception ---- */
  const run = /^\/staff\/clients\/([A-Za-z0-9-]+)\/research$/.exec(path);
  if (run && method === 'POST') {
    const id = run[1] ?? '';
    const r = await R.runResearch({ ...deps, outside: { transport: d.app.outside, secrets: d.app.secrets } }, actor, id);
    if (!r.ok) return d.problem(res, actor, 'Not run', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=research#sources`);
    return 'handled';
  }

  const retry = /^\/staff\/clients\/([A-Za-z0-9-]+)\/research\/retry$/.exec(path);
  if (retry && method === 'POST') {
    const id = retry[1] ?? '';
    const f = await form(req);
    const r = await R.retryFailedSource({ ...deps, outside: { transport: d.app.outside, secrets: d.app.secrets } }, actor, id, f.get('source_id') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not retried', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=retry#sources`);
    return 'handled';
  }

  /* ---- PHASE 139 · checked and approved, and telling the client ---- */
  const checks = /^\/staff\/clients\/([A-Za-z0-9-]+)\/(checks\/approve|checks\/unapprove|steps\/tell|steps\/take-back)$/.exec(path);
  if (checks && method === 'POST') {
    const id = checks[1] ?? '';
    const f = await form(req);
    // Back to the page the form was on. A claim is named by id and must be this company's; anything else is the client page.
    const backClaim = /^claim:([A-Za-z0-9-]+)$/.exec(f.get('back') ?? '')?.[1] ?? null;
    const onClaim = backClaim !== null && db.get<{ id: string }>('SELECT id FROM claims WHERE id = ? AND business_id = ?', [backClaim, id]) !== undefined;
    const page = onClaim ? `/staff/clients/${id}/claims/${backClaim ?? ''}` : `/staff/clients/${id}`;
    // Back to the step the form was in, when it names one in the only shape a step's anchor has. Ids only.
    const at = STEP_ANCHOR.test(f.get('at') ?? '') ? (f.get('at') ?? '') : null;
    const anchor = at !== null ? `#${at}` : onClaim ? '#claim-checks' : '#checks';
    const claim_id = emptyToNull(f.get('claim_id'));
    const which = checks[2];
    const r = which === 'checks/approve' ? A.approveFact(deps, actor, id, { ref: f.get('ref') ?? '', value: f.get('value') })
      : which === 'checks/unapprove' ? A.unapproveFact(deps, actor, id, { ref: f.get('ref') ?? '', reason: f.get('reason') })
        : which === 'steps/tell' ? A.tellClient(deps, actor, id, { step: f.get('step') ?? '', claim_id })
          : A.takeStepBack(deps, actor, id, { step: f.get('step') ?? '', claim_id, reason: f.get('reason') });
    const title = which === 'checks/approve' ? 'Not ticked' : which === 'checks/unapprove' ? 'Tick not taken off'
      : which === 'steps/tell' ? 'The client was not told' : 'Not taken back';
    if (!r.ok) return d.problem(res, actor, title, r.why, `${page}${anchor}`, r.field);
    const saved = which === 'checks/approve' ? 'checked' : which === 'checks/unapprove' ? 'unchecked' : which === 'steps/tell' ? 'told' : 'takenback';
    redirect(res, `${page}?done=${saved}${at === null ? '' : `&step=${at}`}${anchor}`);
    return 'handled';
  }

  /* ---- panel 4 · the two routes ---- */
  const send = /^\/staff\/clients\/([A-Za-z0-9-]+)\/tasks\/send$/.exec(path);
  if (send && method === 'POST') {
    const id = send[1] ?? '';
    const f = await form(req);
    const r = E.sendTaskToPortal(deps, actor, id, {
      fact_id: emptyToNull(f.get('fact_id')),
      question: f.get('question') ?? '',
      why: f.get('why') ?? '',
      holds_up: f.get('holds_up') ?? '',
      due_on: emptyToNull(f.get('due_on')),
      claim_id: emptyToNull(f.get('claim_id')),
    });
    if (!r.ok) return d.problem(res, actor, 'Not sent', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=sent#tasks`);
    return 'handled';
  }

  const answer = /^\/staff\/clients\/([A-Za-z0-9-]+)\/tasks\/answer$/.exec(path);
  if (answer && method === 'POST') {
    const id = answer[1] ?? '';
    const f = await form(req);
    const r = E.answerTaskHere(deps, actor, id, {
      task_id: f.get('task_id') ?? '',
      fact_id: emptyToNull(f.get('fact_id')),
      question: f.get('question') ?? '',
      why: f.get('why') ?? '',
      holds_up: f.get('holds_up') ?? '',
      dont_know: f.get('dont_know') === 'on',
      answer: f.get('answer') ?? '',
    });
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=answered#tasks`);
    return 'handled';
  }

  const withdraw = /^\/staff\/clients\/([A-Za-z0-9-]+)\/tasks\/withdraw$/.exec(path);
  if (withdraw && method === 'POST') {
    const id = withdraw[1] ?? '';
    const f = await form(req);
    const r = E.withdrawTask(deps, actor, id, f.get('task_id') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not withdrawn', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=withdrawn#tasks`);
    return 'handled';
  }

  /* ---- panel 5 · internal notes ---- */
  const note = /^\/staff\/clients\/([A-Za-z0-9-]+)\/notes$/.exec(path);
  if (note && method === 'POST') {
    const id = note[1] ?? '';
    const f = await form(req);
    // PHASE 134: a note belongs to the company, and may say which of its claims it is about.
    const r = E.addNote(deps, actor, id, f.get('body') ?? '', { claim_id: emptyToNull(f.get('claim_id')) });
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/clients/${id}`);
    // PHASE 142: back to the "Team only" chat, where the note now reads as the newest message.
    redirect(res, `/staff/clients/${id}?chat=team&note=saved#chat`);
    return 'handled';
  }

  return 'not-mine';
}

function emptyToNull(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v.trim();
}

/* ------------------------------------------------------------------ *
 * THE BUSINESS PAGE
 * ------------------------------------------------------------------ */

export const DONE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  research: 'The research was run. What it reached is below.',
  retry: 'We tried that lookup again.',
  sent: 'The question is in the client’s portal.',
  answered: 'Recorded — and the file says a member of staff entered it, not the client.',
  withdrawn: 'Withdrawn. The fact it was asking about is back on the missing list, and the record says who took it back.',
  checked: 'Saved. The tick is recorded with your name and the time.',
  unchecked: 'The tick is off. Your reason is kept with it.',
  told: 'Done. The client’s portal now shows this step, with today’s date.',
  takenback: 'Taken back. The client’s portal now says “Being re-checked”.',
});

/**
 * PHASE 133b — THE BUSINESS PAGE ON THE RECORD LAYOUT. The highlights carry what the "Waiting on" block always said; the
 * five numbered panels become five tabs, drawn by the same panel functions from the same two views; the right-hand panel
 * holds "Waiting on" itself and the quick actions. Nothing is read that this page did not read before, and nothing is
 * left out: every panel is on the page, in its tab, whichever tab is showing.
 *
 * A QUICK ACTION IS OFFERED ONLY WHERE ITS CONTROL IS ON THE PAGE for this login: Run the research only when the rate
 * allows it (panel 2 draws the button then), Ask for a missing fact only when something is missing (panel 3 draws the
 * forms then), Add a note only for a login that may read and write notes (panel 5 draws the form then).
 */
export function businessPageHtml(
  d: EngagedDeps, actor: Actor, p: E.BusinessPage, sources: R.SourcesPanel,
  done: string | undefined, note: string | undefined,
): string {
  const waiting = p.row.waiting_on === 'US' ? 'Us' : p.row.waiting_on === 'CLIENT' ? 'The client' : 'Nobody';
  const quick: QuickAction[] = [
    ...(sources.rate.allowed ? [{ href: '#sources', label: 'Run the research' }] : []),
    ...(p.missing.length > 0 ? [{ href: '#missing', label: 'Ask for a missing fact' }] : []),
    ...(p.may_read_notes && p.may_write ? [{ href: '#note', label: 'Add a note' }] : []),
  ];
  return page({
    title: p.business.name, nav: d.nav(actor), wide: true,
    body: h`
      ${done !== undefined && DONE_WORDS[done] !== undefined
        ? h`<div class="gate">${DONE_WORDS[done]}</div>` : raw('')}
      ${note === 'saved' ? h`<div class="gate">Note saved. It is internal and the client cannot see it.</div>` : raw('')}
      ${highlights('Engaged client', p.business.name, [
        { label: 'Sector', value: p.business.sector.replace(/_/g, ' ') },
        { label: 'Stage', value: p.business.stage_label },
        { label: 'Waiting on', value: waiting },
        { label: 'Engagement letter', value: p.row.letter_label },
        { label: 'Research', value: p.row.research_label },
        { label: 'Still missing', value: `${p.row.missing_facts} fact${p.row.missing_facts === 1 ? '' : 's'}` },
      ])}
      ${recordLayout(recordTabs([
        { id: 'answers', label: 'Questions and answers', body: panel1(p) },
        { id: 'sources', label: 'Sources', count: sources.outstanding, body: panel2(p, sources) },
        { id: 'missing', label: 'Still missing', count: p.missing.length, body: panel3(p) },
        { id: 'tasks', label: 'Tasks', count: p.tasks.length, body: panel4(p) },
        { id: 'notes', label: 'Notes', ...(p.may_read_notes ? { count: p.notes.length } : {}), body: panel5(p) },
      ]), sidePanel(null, quick, card('Waiting on', h`
        <p><strong>${waiting}</strong> — ${p.row.waiting_why}</p>
        <p class="help">Engagement letter: ${p.row.letter_label}. Research: ${p.row.research_label}.
          ${p.row.missing_facts} fact${p.row.missing_facts === 1 ? '' : 's'} still missing.
          Accountant pack ${p.row.ready_for_accountant ? 'ready' : 'not ready'};
          surveyor pack ${p.row.ready_for_surveyor ? 'ready' : 'not ready'}.</p>`)))}

      <p><a href="/staff/clients">Back to the list</a></p>`,
  });
}

/* ------------------------------------------ what the client told us
 * PHASE 138: no numbered heading — the section around it names it. The sentences that explained the table sit behind
 * "Why?"; every word of them is still on the page. */

export function panel1(p: E.BusinessPage): Safe {
  const qa = p.qa;
  if (qa.assessment_id === null) {
    return h`<p class="empty">They have not filled in the online questions yet.</p>`;
  }
  return h`
    <div>${qa.rows.length} questions: ${qa.answered} answered, ${qa.dont_know} “I don’t know”, ${qa.skipped} skipped.${
      why('A skipped question is a fact about the claim, not a blank, and “I don’t know” is an answer in its own right. Neither is shown as an empty cell.')}</div>
    <div>The range they were shown:
      ${qa.range === null
        ? h`<span class="help">not shown to you yet — it opens once the surveyor has sent their figures</span>`
        : h`<strong>${qa.range}</strong>`}${why(h`${RANGE_QUALIFIER} It is the same figure the client sees on their own screen.`)}</div>
    <table class="stack"><thead><tr><th>#</th><th>Question</th><th>Answer</th></tr></thead>
      <tbody>${qa.rows.map((x) => h`<tr class="${x.state.toLowerCase()}">
        <td>${x.ord + 1}</td><td data-label="Question">${x.question_text}</td>
        <td data-label="Answer">${x.state === 'ANSWERED' ? h`${x.label}` : h`<em>${x.label}</em>`}</td>
      </tr>`)}</tbody></table>`;
}

/* ------------------------------------------------------- the lookups */

/** PHASE 138: the state of a lookup in plain words. "Fired" and "tier" are gone from what a person reads. */
const STATE_WORDS: Readonly<Record<R.SourceState, string>> = Object.freeze({
  FIRED: 'Looked up',
  NOT_RUN: 'Not run yet',
  FAILED: 'Did not work',
  NOT_PERMITTED_YET: 'Not allowed yet',
});

/** PHASE 146b: the lookups' own switches, in words. Every one is off today. */
function switchWords(rows: readonly R.SourceRow[]): string {
  const on = rows.filter((x) => x.switched_on).length;
  if (on === 0) return 'none is switched on yet, so no lookup is made.';
  return `${on} of ${rows.length} switched on.`;
}

export function panel2(p: E.BusinessPage, s: R.SourcesPanel): Safe {
  return h`
    <ul class="sources-now">
      <li>Free lookups: ${s.free.open ? 'on.' : 'off until our privacy notice is published.'}</li>
      <li>Paid lookups: ${s.engagement.signed
        ? h`on — the engagement letter is signed${s.engagement.signed_at !== null ? h` (${s.engagement.signed_at.slice(0, 10)})` : raw('')}.`
        : 'off until the engagement letter is signed.'}${why(h`A lookup that is not allowed yet is simply not made. Each fact it would give stays on the list as a question, and nothing is guessed. ${
          s.free.open ? raw('') : h`Free lookups wait for this: ${s.free.requires}. Turning them on is a data protection decision, not a button on this page. `}${
          s.engagement.signed ? raw('') : h`Paid lookups: ${s.engagement.why}. We check the signed letter on our system, not on this page.`}`)}</li>
      <li>Each lookup's own switch: ${switchWords(s.sources)}${why(h`A lookup runs only when it is allowed and its own switch is on. The switches are set in the code, not on this page.`)}</li>
    </ul>

    <table class="stack"><thead><tr><th>Where from</th><th>Status</th><th>What happened</th></tr></thead>
      <tbody>${s.sources.map((x) => h`<tr>
        <td>${x.dataset}</td>
        <td data-label="Status">${STATE_WORDS[x.state]}${x.attempts > 1 ? h` <span class="help">(${x.attempts} tries)</span>` : raw('')}</td>
        <td data-label="What happened"><span class="say">${x.detail}</span>${x.may_retry
          ? h` <form method="post" action="/staff/clients/${p.business.id}/research/retry" class="inline">
               <input type="hidden" name="source_id" value="${x.source_id}">
               <button class="linkish" type="submit">Try this one again</button></form>`
          : raw('')}</td>
      </tr>`)}</tbody></table>

    <p class="help">${s.outstanding} of ${s.sources.length} still to do.</p>

    ${s.rate.allowed
      ? h`<form method="post" action="/staff/clients/${p.business.id}/research">
           <button class="cta" type="submit">Run the research</button>
           <span class="help"> Runs everything still to do. Used ${s.rate.used} of ${s.rate.limit} times this hour.</span></form>`
      : h`<div class="stop"><strong>You cannot run it right now.</strong> ${s.rate.why}.</div>`}

    ${moreDetail(h`
      <table class="stack"><thead><tr><th>Where from</th><th>Free or paid</th><th>Switched on</th><th>Publisher</th><th>Licence</th><th>Read on</th></tr></thead>
        <tbody>${s.sources.map((x) => h`<tr><td>${x.dataset}</td>
          <td data-label="Free or paid">${x.tier === 'PAID' ? 'paid' : 'free'}${x.tier_settled ? raw('') : h`<br><span class="say">not sure if free or paid — treated as paid</span>`}</td>
          <td data-label="Switched on">${x.switched_on ? 'yes' : 'not switched on'}</td>
          <td data-label="Publisher">${x.publisher}</td><td data-label="Licence">${x.licence_name}</td>
          <td data-label="Read on" class="when">${x.retrieved_at ?? h`<span class="help">—</span>`}</td></tr>`)}</tbody></table>
      <p class="help">A lookup that has not run has no button of its own: you choose when to run them all, not which ones.
        Only one that did not work can be tried again.</p>
      ${s.known_gaps.map((g) => h`<p class="help"><strong>Not known yet.</strong> ${g}</p>`)}`, 'Every lookup in detail')}`;
}

/* ------------------------------------------------ what is still missing */

const BLOCKS_WORDS: Readonly<Record<E.Blocks, string>> = Object.freeze({
  ACCOUNTANT: 'the accountant pack',
  SURVEYOR: 'the surveyor pack',
  BOTH: 'both packs',
});

/**
 * PHASE 138 — THE WHOLE MISSING LIST, for the Questions section's "More detail". Each fact is ALSO a WE NEED line in the
 * section it belongs to (src/web/client-page.ts); this is where a fact can be answered from a telephone call.
 */
export function panel3(p: E.BusinessPage, claims: readonly { readonly id: string; readonly name: string }[] = []): Safe {
  if (p.missing.length === 0) {
    return h`<p class="help">Nothing is missing. Every fact we ask for is answered.</p>`;
  }
  return h`
    <div class="help">${p.missing.length} still missing.${why('This list is worked out from what the lookups still lack, what the client did not answer, and what the estimate could not confirm. We work this list out from the facts; nobody edits it. An unknown fact is asked, never guessed, and a missing fact is never filled in with the answer that would suit the client.')}</div>
    <table class="stack"><thead><tr>
      <th>What is missing</th><th>Holds up</th><th>Asked?</th><th>Ask for it</th>
    </tr></thead>
    <tbody>${p.missing.map((m) => h`<tr>
      <td>${m.question}<br><span class="help">from ${m.from}</span>${why(m.why)}</td>
      <td data-label="Holds up">${BLOCKS_WORDS[m.blocks]}</td>
      <td data-label="Asked?">${m.has_task
        ? h`${m.task_state === 'ANSWERED' ? h`answered` : h`asked`}`
        : h`<span class="help">not asked</span>`}</td>
      <td data-label="Ask for it">${m.has_task && m.task_state === 'ANSWERED'
        ? h`<span class="help">—</span>`
        : askForms(p.business.id, m, claims)}</td>
    </tr>`)}</tbody></table>`;
}

/** PHASE 138 — THE ONE-PRESS "ASK THE CLIENT" beside a WE NEED line. The same route and the same fields as the full form. */
export function askButton(business_id: string, m: E.MissingFact): Safe {
  return h`<form method="post" action="/staff/clients/${business_id}/tasks/send" class="inline">
      <input type="hidden" name="fact_id" value="${m.fact_id}">
      <input type="hidden" name="question" value="${m.question}">
      <input type="hidden" name="why" value="We need this to finish your claim.">
      <input type="hidden" name="holds_up" value="${BLOCKS_WORDS[m.blocks]}">
      <button class="linkish" type="submit">Ask the client</button></form>`;
}

/**
 * THE TWO ROUTES, SIDE BY SIDE, ON THE FACT ITSELF.
 *
 * They are on the same row and not on two different screens, because the choice
 * is made about ONE fact at the moment a staff member is looking at it: send
 * the question to the client, or write down what they were told on the
 * telephone. Both write the same field. What differs is the record of who
 * entered it, and the file shows that afterwards.
 */
function askForms(business_id: string, m: E.MissingFact, claims: readonly { readonly id: string; readonly name: string }[] = []): Safe {
  const holds = BLOCKS_WORDS[m.blocks];
  return h`
    <form method="post" action="/staff/clients/${business_id}/tasks/send" class="inline">
      <input type="hidden" name="fact_id" value="${m.fact_id}">${claims.length === 0 ? raw('') : h`
      <label class="fl">About which claim? <select name="claim_id"><option value="">The company in general</option>${
        claims.map((c) => h`<option value="${c.id}">${c.name}</option>`)}</select></label>`}
      <input type="hidden" name="question" value="${m.question}">
      <input type="hidden" name="why" value="We need this to finish your claim.">
      <input type="hidden" name="holds_up" value="${holds}">
      <label class="fl">Due, if it is <input name="due_on" type="date"></label>
      <button class="linkish" type="submit">Send to their portal</button>
    </form>
    <details><summary class="linkish">Answer it here</summary>
      <form method="post" action="/staff/clients/${business_id}/tasks/answer">
        <input type="hidden" name="fact_id" value="${m.fact_id}">
        <input type="hidden" name="question" value="${m.question}">
        <input type="hidden" name="holds_up" value="${holds}">
        <input type="hidden" name="why" value="Recorded from a conversation with the client.">
        <label class="fl" for="a-${m.fact_id}">What the client told you</label>
        <input class="fi" id="a-${m.fact_id}" name="answer" type="text">
        <label class="ck"><input type="checkbox" name="dont_know"> They said they do not know</label>
        <button class="cta" type="submit">Record it</button>
        <p class="help">This is recorded as entered by you on the client's behalf. The file will say so.</p>
      </form>
    </details>`;
}

/* ------------------------------------------- the questions we sent */

export function panel4(p: E.BusinessPage): Safe {
  return h`
    ${p.tasks.length === 0
      ? h`<p class="help">Nothing has been asked yet. Press “Ask the client” beside anything under We need.</p>`
      : h`<table class="stack"><thead><tr>
          <th>Question</th><th>Status</th><th>Answer</th><th>Who answered</th><th>Asked by mistake?</th>
          </tr></thead>
        <tbody>${p.tasks.map((t) => h`<tr class="${t.state === 'ANSWERED' && t.answer_state === 'DONT_KNOW' ? 'dont_know' : ''}">
          <td>${t.question}<br><span class="help">holds up ${t.holds_up}</span></td>
          <td data-label="Status">${t.state === 'OPEN' ? 'waiting for the client' : t.state.toLowerCase()}</td>
          <td data-label="Answer">${t.answer_state === 'DONT_KNOW'
            ? h`<em>I don’t know — the client said so</em>`
            : t.answer !== null ? h`${t.answer}` : h`<span class="help">—</span>`}</td>
          <td data-label="Who answered"><span class="say">${t.provenance}</span>${t.answered_at !== null
            ? h`<br><span class="help">${localStamp(t.answered_at)}</span>` : raw('')}${t.withdrawn_at !== null
            ? h`<br><span class="help">${localStamp(t.withdrawn_at)}</span>` : raw('')}</td>
          <td data-label="Asked by mistake?">${withdrawForm(p.business.id, t)}</td>
        </tr>`)}</tbody></table>`}
    <div class="help">${why('An answer the client typed in their portal and one you typed after ringing them are the same fact; the record says which is which and who entered it. Withdrawing is not deleting: it takes back a question asked by mistake, and the fact goes back on the missing list. An answered question cannot be withdrawn — the answer is a fact the client gave us.')}</div>`;
}

/**
 * THE THIRD ROUTE, ON THE QUESTION ITSELF.
 *
 * DRAWN ONLY ON AN OPEN QUESTION, and that is presentation rather than the
 * control: `withdrawTask` reads the row and refuses an answered or an
 * already-withdrawn one whether or not this button was ever rendered. An
 * answered row says why there is nothing to click instead of showing nothing,
 * because a blank cell reads as an oversight.
 */
function withdrawForm(business_id: string, t: E.TaskView): Safe {
  if (t.state === 'WITHDRAWN') {
    return h`<span class="help">withdrawn${t.withdrawn_by_name !== null ? h` by ${t.withdrawn_by_name}` : raw('')}</span>`;
  }
  if (t.state !== 'OPEN') {
    return h`<span class="help">answered — an answer is not withdrawn</span>`;
  }
  return h`
    <form method="post" action="/staff/clients/${business_id}/tasks/withdraw" class="inline">
      <input type="hidden" name="task_id" value="${t.id}">
      <button class="linkish" type="submit">Withdraw — asked in error</button>
    </form>`;
}

/* ------------------------------------------------------ internal notes */

function panel5(p: E.BusinessPage): Safe {
  if (!p.may_read_notes) {
    return h`<div class="help">Your login cannot read internal notes.${why('No other screen will show them to you either.')}</div>`;
  }
  return h`
    <div class="help">Internal only — the client and the surveyor never see these.${why('Their logins are not allowed to read notes at all.')}</div>
    ${p.may_write
      ? h`<form method="post" action="/staff/clients/${p.business.id}/notes">
           <label class="fl" for="note">Add a note</label>
           <textarea class="fi" id="note" name="body" rows="3"></textarea>
           <button class="cta" type="submit">Save note</button>
         </form>`
      : raw('')}
    ${p.notes.length === 0
      ? h`<p class="help">No notes yet.</p>`
      : h`<table class="stack"><thead><tr><th>Note</th><th>Who</th><th>When</th></tr></thead>
        <tbody>${p.notes.map((n) => h`<tr>
          <td>${n.body}</td>
          <td data-label="Who">${n.author_name ?? h`<span class="help">a deleted account</span>`}</td>
          <td data-label="When" class="when">${localStamp(n.created_at)}</td>
        </tr>`)}</tbody></table>`}`;
}
