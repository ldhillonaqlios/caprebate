/**
 * THE ENGAGED-CLIENT LIST AND THE BUSINESS PAGE — routes and rendering.
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
import { card, highlights, recordLayout, recordTabs, sidePanel, type QuickAction } from './components.ts';
import { localStamp } from './localtime.ts';
import { RANGE_QUALIFIER } from './shown-range.ts';
import * as E from './engaged.ts';
import * as R from './research.ts';

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

  if (path === '/staff/clients' && method === 'GET') {
    const sort = url.searchParams.get('sort') ?? 'waiting';
    html(res, 200, listPage(d, actor, E.engagedClients(db, actor), sort));
    return 'handled';
  }

  /* PHASE 134: GET /staff/clients/:id is the ONE client page, drawn by src/web/client-page.ts, which is mounted first. */

  /* ---- panel 2 · the one button, and the one exception ---- */
  const run = /^\/staff\/clients\/([A-Za-z0-9-]+)\/research$/.exec(path);
  if (run && method === 'POST') {
    const id = run[1] ?? '';
    const r = R.runResearch(deps, actor, id);
    if (!r.ok) return d.problem(res, actor, 'Not run', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=research#sources`);
    return 'handled';
  }

  const retry = /^\/staff\/clients\/([A-Za-z0-9-]+)\/research\/retry$/.exec(path);
  if (retry && method === 'POST') {
    const id = retry[1] ?? '';
    const f = await form(req);
    const r = R.retryFailedSource(deps, actor, id, f.get('source_id') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not retried', r.why, `/staff/clients/${id}`);
    redirect(res, `/staff/clients/${id}?done=retry#sources`);
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
    redirect(res, `/staff/clients/${id}?note=saved#activity`);
    return 'handled';
  }

  return 'not-mine';
}

function emptyToNull(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v.trim();
}

/* ------------------------------------------------------------------ *
 * THE LIST
 * ------------------------------------------------------------------ */

/**
 * SORTABLE, AND THE DEFAULT SORT IS THE POINT OF THE SCREEN.
 *
 * "Waiting on" first, so the queue a person works down is the queue of things
 * they can act on. The other orders are there because a staff member asking
 * "who has not signed" and a staff member asking "whose research is stalled"
 * are asking different questions of the same list.
 *
 * SORTED IN CODE, NEVER IN SQL FROM A REQUEST VALUE. The parameter names a key
 * in a table below; it never reaches an ORDER BY. That is not a performance
 * decision — a sort key taken from a query string and concatenated into SQL is
 * the classic injection that parameterised queries do not protect against,
 * because an ORDER BY clause cannot be parameterised.
 */
const SORTS: Readonly<Record<string, { label: string; cmp: (a: E.ClientRow, b: E.ClientRow) => number }>> =
  Object.freeze({
    waiting: {
      label: 'Who it is waiting on',
      cmp: (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    },
    name: { label: 'Business name', cmp: (a, b) => a.name.localeCompare(b.name) },
    letter: {
      label: 'Engagement letter',
      cmp: (a, b) => LETTER_ORDER.indexOf(a.letter_state) - LETTER_ORDER.indexOf(b.letter_state)
        || a.name.localeCompare(b.name),
    },
    research: {
      label: 'Research',
      cmp: (a, b) => RESEARCH_ORDER.indexOf(a.research) - RESEARCH_ORDER.indexOf(b.research)
        || a.name.localeCompare(b.name),
    },
    missing: { label: 'Facts still missing', cmp: (a, b) => b.missing_facts - a.missing_facts || a.name.localeCompare(b.name) },
  });

const LETTER_ORDER = ['NONE', 'NOT_SENT', 'SENT', 'VIEWED', 'SIGNED'];
const RESEARCH_ORDER: E.ResearchProgress[] = ['NOT_RUN', 'PART_RUN', 'COMPLETE'];

/** Ours first, then the client's, then the finished ones. */
function rank(r: E.ClientRow): number {
  return r.waiting_on === 'US' ? 0 : r.waiting_on === 'CLIENT' ? 1 : 2;
}

function waitingCell(r: E.ClientRow): Safe {
  if (r.waiting_on === 'US') {
    return h`<strong>Us</strong><br><span class="say">${r.waiting_why}</span>`;
  }
  if (r.waiting_on === 'CLIENT') {
    return h`The client<br><span class="say">${r.waiting_why}</span>`;
  }
  return h`<span class="help">Nobody</span><br><span class="say">${r.waiting_why}</span>`;
}

function yesNo(ready: boolean): Safe {
  return ready ? h`ready` : h`<span class="help">not yet</span>`;
}

function listPage(d: EngagedDeps, actor: Actor, rows: readonly E.ClientRow[], sort: string): string {
  const chosen = Object.prototype.hasOwnProperty.call(SORTS, sort) ? sort : 'waiting';
  const sorted = [...rows].sort(SORTS[chosen]!.cmp);
  const ours = sorted.filter((r) => r.waiting_on === 'US').length;
  const theirs = sorted.filter((r) => r.waiting_on === 'CLIENT').length;

  return page({
    title: 'Engaged clients', nav: d.nav(actor), wide: true,
    body: h`
      <h1>Engaged clients</h1>
      <p class="help">${sorted.length} in the pipeline.
        <strong>${ours} waiting on us</strong>, ${theirs} waiting on the client,
        ${sorted.length - ours - theirs} on neither.</p>
      <p class="help">Sort by:
        ${Object.entries(SORTS).map(([key, s]) => h`${key === chosen
          ? h`<strong>${s.label}</strong>`
          : h`<a href="/staff/clients?sort=${key}">${s.label}</a>`} · `)}</p>

      ${sorted.length === 0
        ? h`<p class="help">Nobody has come through the assessment yet.</p>`
        : h`<table><thead><tr>
            <th>Business</th><th>Waiting on</th><th>Engagement letter</th><th>Research</th>
            <th>With the client</th><th>Still missing</th><th>Accountant pack</th>
            <th>Surveyor pack</th><th>Stage</th></tr></thead>
          <tbody>${sorted.map((r) => h`<tr>
            <td><a href="/staff/clients/${r.business_id}">${r.name}</a><br>
              <span class="help">${r.sector.replace(/_/g, ' ')}</span></td>
            <td>${waitingCell(r)}</td>
            <td>${r.letter_label}</td>
            <td>${r.research_label}</td>
            <td>${r.tasks_sent === 0
              ? h`<span class="help">nothing</span>`
              : h`${r.tasks_sent} question${r.tasks_sent === 1 ? '' : 's'}`}${
                r.tasks_open > r.tasks_sent
                  ? h`<br><span class="say">${r.tasks_open - r.tasks_sent} drafted, not sent</span>`
                  : raw('')}</td>
            <td>${r.missing_facts}</td>
            <td>${yesNo(r.ready_for_accountant)}</td>
            <td>${yesNo(r.ready_for_surveyor)}</td>
            <td>${r.done ? h`done` : h`<span class="help">${r.stage_label}</span>`}</td>
          </tr>`)}</tbody></table>`}

      <div class="gate"><strong>“Waiting on” is not the stage.</strong> The stage is how far a claim has
      got; this column is who is holding it up, and the two routinely disagree — a signed engagement
      with three unanswered questions is waiting on the client, not on us. A question drafted here and
      never sent to the client's portal counts as <strong>ours</strong>: nobody has asked them anything
      yet.</div>`,
  });
}

/* ------------------------------------------------------------------ *
 * THE BUSINESS PAGE
 * ------------------------------------------------------------------ */

export const DONE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  research: 'The research was run. What it reached is below.',
  retry: 'That source was retried.',
  sent: 'The question is in the client’s portal.',
  answered: 'Recorded — and the file says a member of staff entered it, not the client.',
  withdrawn: 'Withdrawn. The fact it was asking about is back on the missing list, and the record says who took it back.',
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

/* -------------------------------------------------- 1 · questions */

export function panel1(p: E.BusinessPage): Safe {
  const qa = p.qa;
  if (qa.assessment_id === null) {
    return h`<h2>1 · Questions and answers</h2>
      <p class="help">This client has not completed an assessment, so there is nothing they have told us yet.</p>`;
  }
  return h`
    <h2>1 · Questions and answers</h2>
    <p class="help">${qa.rows.length} questions, in the order asked — ${qa.answered} answered,
      ${qa.dont_know} answered “I don’t know”, ${qa.skipped} skipped.
      <strong>A skipped question is a fact about the claim, not a blank</strong>, and “I don’t know”
      is an answer in its own right. Neither is shown as an empty cell.</p>
    <p class="help">Range shown to the client:
      ${qa.range === null
        ? h`<span class="help">withheld — our estimate is not released to this role until the survey is committed</span>`
        : h`<strong>${qa.range}</strong>`}</p>
    <table><thead><tr><th>#</th><th>Question</th><th>Answer</th></tr></thead>
      <tbody>${qa.rows.map((x) => h`<tr class="${x.state.toLowerCase()}">
        <td>${x.ord + 1}</td><td>${x.question_text}</td>
        <td>${x.state === 'ANSWERED' ? h`${x.label}` : h`<em>${x.label}</em>`}</td>
      </tr>`)}</tbody></table>
    <div class="gate">${RANGE_QUALIFIER} The figure above is read from the one column the client's own
    screen reads, so the two views of it cannot differ.</div>`;
}

/* ---------------------------------------------------- 2 · sources */

const STATE_WORDS: Readonly<Record<R.SourceState, string>> = Object.freeze({
  FIRED: 'fired',
  NOT_RUN: 'not run',
  FAILED: 'failed',
  NOT_PERMITTED_YET: 'not permitted yet',
});

export function panel2(p: E.BusinessPage, s: R.SourcesPanel): Safe {
  return h`
    <h2>2 · Sources — what has fired and what has not</h2>

    <div class="flag">
      <strong>Two gates, and both are shut.</strong>
      <p><strong>Free sources</strong> wait on the published privacy notice.
        ${s.free.open
          ? h`The notice is published and the gate is open.`
          : h`It is not published: <em>${s.free.requires}</em>. That switch lives in the engine and
             turning it on is a data protection decision, not a screen control — there is nothing on
             this page that can open it.`}</p>
      <p><strong>Paid sources</strong> wait on a signed engagement, checked on the server against the
        record — never in this page. ${s.engagement.signed
          ? h`It is signed${s.engagement.signed_at !== null ? h`, on ${s.engagement.signed_at.slice(0, 10)}` : raw('')}.`
          : h`Today: ${s.engagement.why}.`}</p>
      <p><strong>Nothing refuses and nothing throws.</strong> A source that may not be consulted is
        simply not consulted, and every fact it would have supplied stays on the list below as a
        question. No estimate fails, no screen errors, and nothing is guessed to stand in.</p>
    </div>

    <table><thead><tr>
      <th>Source</th><th>Tier</th><th>State</th><th>Publisher</th><th>Licence</th>
      <th>Retrieved</th><th>Why</th></tr></thead>
      <tbody>${s.sources.map((x) => h`<tr>
        <td>${x.dataset}<br><span class="help">${x.source_id}</span></td>
        <td>${x.tier === 'PAID' ? h`paid` : h`free`}${x.tier_settled
          ? raw('')
          : h`<br><span class="say">tier not settled — treated as paid</span>`}</td>
        <td>${STATE_WORDS[x.state]}${x.attempts > 0 ? h`<br><span class="say">${x.attempts} attempt${x.attempts === 1 ? '' : 's'}</span>` : raw('')}</td>
        <td>${x.publisher}</td>
        <td>${x.licence_name}</td>
        <td class="when">${x.retrieved_at ?? h`<span class="help">—</span>`}</td>
        <td><span class="say">${x.detail}</span>${x.may_retry
          ? h`<form method="post" action="/staff/clients/${p.business.id}/research/retry" class="inline">
               <input type="hidden" name="source_id" value="${x.source_id}">
               <button class="linkish" type="submit">Retry this one</button></form>`
          : raw('')}</td>
      </tr>`)}</tbody></table>

    <p class="help">${s.outstanding} of ${s.sources.length} outstanding.
      A source that has simply not run has <strong>no button of its own</strong>: the operator picks
      the moment, not the calls. Only a source that <em>failed</em> can be retried, because retrying a
      failure is not choosing which sources to consult.</p>

    ${s.rate.allowed
      ? h`<form method="post" action="/staff/clients/${p.business.id}/research">
           <button class="cta" type="submit">Run the research</button>
           <span class="help"> — fires everything outstanding. Run ${s.rate.used} of
           ${s.rate.limit} times for this client in the last hour.</span></form>`
      : h`<div class="stop"><strong>Cannot run the research right now.</strong> ${s.rate.why}.</div>`}

    ${s.known_gaps.map((g) => h`<div class="gate"><strong>Known gap.</strong> ${g}</div>`)}`;
}

/* -------------------------------------------------- 3 · missing */

const BLOCKS_WORDS: Readonly<Record<E.Blocks, string>> = Object.freeze({
  ACCOUNTANT: 'the accountant pack',
  SURVEYOR: 'the surveyor pack',
  BOTH: 'both packs',
});

export function panel3(p: E.BusinessPage, claims: readonly { readonly id: string; readonly name: string }[] = []): Safe {
  if (p.missing.length === 0) {
    return h`<h2>3 · What is still missing</h2>
      <p class="help">Nothing. Every fact the engine asks for is answered.</p>`;
  }
  return h`
    <h2>3 · What is still missing</h2>
    <p class="help">${p.missing.length} outstanding.
      <strong>This list is derived, not maintained.</strong> It is what the register layer says it
      still has to ask for, plus every question the client did not answer, plus every cash gate the
      engine reports as not established. Nothing here is a hand-written checklist, so nothing here can
      drift out of step with the engine.</p>
    <table><thead><tr>
      <th>What is missing</th><th>Blocks</th><th>Why</th><th>Asked?</th><th>Ask for it</th>
    </tr></thead>
    <tbody>${p.missing.map((m) => h`<tr>
      <td>${m.question}<br><span class="help">${m.origin} · ${m.fact_id}</span></td>
      <td>${BLOCKS_WORDS[m.blocks]}${m.blocks_by_default
        ? h`<br><span class="say">nothing recognised this fact, so it is listed against both</span>`
        : raw('')}</td>
      <td><span class="say">${m.why}</span></td>
      <td>${m.has_task
        ? h`${m.task_state === 'ANSWERED' ? h`answered` : h`asked`}`
        : h`<span class="help">not asked</span>`}</td>
      <td>${m.has_task && m.task_state === 'ANSWERED'
        ? h`<span class="help">—</span>`
        : askForms(p.business.id, m, claims)}</td>
    </tr>`)}</tbody></table>
    <div class="gate"><strong>An unknown fact is asked, never guessed.</strong> Nothing on this page
    fills a gap with a plausible default, and nothing routes a missing fact to the answer that would
    suit the client. That is non-negotiable N4, and it is why this list is long rather than short.</div>`;
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

/* ---------------------------------------------------- 4 · tasks */

export function panel4(p: E.BusinessPage): Safe {
  return h`
    <h2>4 · Tasks</h2>
    ${p.tasks.length === 0
      ? h`<p class="help">Nothing has been asked yet. Use the two controls on the Still missing tab.</p>`
      : h`<table><thead><tr>
          <th>Question</th><th>State</th><th>Answer</th><th>How we came to hold it</th><th>Asked in error?</th>
          </tr></thead>
        <tbody>${p.tasks.map((t) => h`<tr class="${t.state === 'ANSWERED' && t.answer_state === 'DONT_KNOW' ? 'dont_know' : ''}">
          <td>${t.question}<br><span class="help">holds up ${t.holds_up}</span></td>
          <td>${t.state.toLowerCase()}</td>
          <td>${t.answer_state === 'DONT_KNOW'
            ? h`<em>I don’t know — the client said so</em>`
            : t.answer !== null ? h`${t.answer}` : h`<span class="help">—</span>`}</td>
          <td><span class="say">${t.provenance}</span>${t.answered_at !== null
            ? h`<br><span class="help">${localStamp(t.answered_at)}</span>` : raw('')}${t.withdrawn_at !== null
            ? h`<br><span class="help">${localStamp(t.withdrawn_at)}</span>` : raw('')}</td>
          <td>${withdrawForm(p.business.id, t)}</td>
        </tr>`)}</tbody></table>`}
    <div class="gate"><strong>Both routes write the same field.</strong> An answer the client typed in
    their portal and an answer a staff member typed after telephoning them are the same fact, and the
    record says which is which and who entered it. That difference is provenance, and provenance is
    the discipline this whole system rests on.</div>
    <div class="gate"><strong>Withdrawing is not deleting.</strong> It takes back a question that
    should not have been asked, and the fact it was asking about goes straight back onto the Still missing tab as
    not asked. An answered question cannot be withdrawn — the answer is a fact the client gave us
    — and the refusal is on the record, not on whether a button was drawn.</div>`;
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

/* ---------------------------------------------------- 5 · notes */

function panel5(p: E.BusinessPage): Safe {
  if (!p.may_read_notes) {
    return h`<h2>5 · Internal notes</h2>
      <div class="gate">Your role cannot read internal notes. This is not a hidden panel — the rule
      that refuses it is the same one the store asks before it reads, so there is nothing here that a
      different screen would show you.</div>`;
  }
  return h`
    <h2>5 · Internal notes</h2>
    <p class="help">Internal only. A note here cannot reach the client's portal or a surveyor's
      session — not because no screen draws it, but because the rule that decides who may read a note
      lists neither of them.</p>
    ${p.may_write
      ? h`<form method="post" action="/staff/clients/${p.business.id}/notes">
           <label class="fl" for="note">Add a note</label>
           <textarea class="fi" id="note" name="body" rows="3"></textarea>
           <button class="cta" type="submit">Save note</button>
         </form>`
      : raw('')}
    ${p.notes.length === 0
      ? h`<p class="help">No notes yet.</p>`
      : h`<table><thead><tr><th>Note</th><th>Who</th><th>When</th></tr></thead>
        <tbody>${p.notes.map((n) => h`<tr>
          <td>${n.body}</td>
          <td>${n.author_name ?? h`<span class="help">a deleted account</span>`}</td>
          <td class="when">${localStamp(n.created_at)}</td>
        </tr>`)}</tbody></table>`}`;
}
