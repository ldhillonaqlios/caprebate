/**
 * THE SURVEYOR WORKSPACE — routes and rendering. Block F, part two.
 *
 * Same shape as `handleEngaged` and `handleStaff`: returns 'not-mine' for
 * anything it does not own, so the mounting in staff.ts is one line.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED and are not restated:
 * authorise on the object on every request, no route maps a path onto the
 * filesystem, and every response is built with the `h` tagged template.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * `payload.json` IS NOT A CONVENIENCE. IT IS THE PROOF.
 *
 * The done-when for this block is that a surveyor session's RESPONSE BODY
 * contains no estimate output — not hidden, not greyed, NOT PRESENT — and that
 * this is verified by inspecting the payload rather than by reading the code
 * or looking at the screen. A test can only inspect a payload if a payload
 * crosses the wire, so this route serves the assembled object itself, as JSON,
 * to the same actor under the same authorisation as the page.
 *
 * IT SERVES THE OBJECT THE PAGE IS DRAWN FROM. Not a copy, not a summary, not
 * a second assembly of the same idea — `payloadFor` is called by both. A JSON
 * endpoint built separately would prove something about itself and nothing
 * about the screen.
 *
 * WHY THIS MATTERS MORE THAN THE TEST IT ENABLES. This is the most copy-able
 * pattern in the build. A developer who sees an estimate arrive in a response
 * and get hidden by the renderer will build exactly that, everywhere, and
 * every one of those places will be one CSS rule away from a leak. The pattern
 * to copy is the opposite: assemble forwards from what is released, and prove
 * it on the wire.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { breadcrumb, claimRef, dataLink, highlights, recordLayout, recordTabs, sidePanel, type QuickAction } from './components.ts';
import { kpiRow, nobodyBadge, siteOf, stageBadge } from './look.ts';
import { setSubMenu } from './navigation.ts';
import * as S from './surveyor.ts';
import { registerAttribution } from './research.ts';
import { formatPence } from './shown-range.ts';
import { FUNNEL_CEILING, SURVEY_JOB_WORDS as SO_WORDS } from './survey-open.ts';
import { surveyorThreadPanel } from './messages-pages.ts';
import { deskFirstReading } from './desk-first.ts';

export type WebResult = 'handled' | 'not-mine';

export type SurveyorDeps = {
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

/**
 * THE JSON HEADERS ARE THE HTML ONES WITHOUT THE STYLESHEET ALLOWANCE.
 *
 * `nosniff` matters more here than anywhere: a JSON body a browser were
 * allowed to sniff as HTML is a stored cross-site scripting hole, and this
 * body contains the client's own answers verbatim.
 */
const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
});

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleSurveyor(
  d: SurveyorDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const deps: S.Deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  if (path === '/staff/survey' && method === 'GET') {
    html(res, 200, listPage(d, actor, S.surveyorJobs(d.app.db, actor)));
    return 'handled';
  }

  const one = /^\/staff\/survey\/([A-Za-z0-9-]+)$/.exec(path);
  if (one && method === 'GET') {
    S.assertSurveySection(actor);
    const w = S.workspace(deps, actor, one[1] ?? '');
    html(res, 200, workspacePage(d, actor, w,
      url.searchParams.get('done') ?? undefined, url.searchParams.get('room') ?? undefined));
    return 'handled';
  }

  /**
   * THE PAYLOAD, ON THE WIRE.
   *
   * Authorised exactly as the page is — `payloadFor` calls `loadJob`, which
   * calls `authorise` on the specific job — so this is not a back door around
   * the screen's rule. A surveyor reaches it for their own jobs and for no
   * others, and the refusal is the same refusal the page gives.
   */
  const json = /^\/staff\/survey\/([A-Za-z0-9-]+)\/payload\.json$/.exec(path);
  if (json && method === 'GET') {
    S.assertSurveySection(actor);
    const body = S.payloadFor(deps, actor, json[1] ?? '');
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(body, null, 2));
    return 'handled';
  }

  const room = /^\/staff\/survey\/([A-Za-z0-9-]+)\/rooms$/.exec(path);
  if (room && method === 'POST') {
    const id = room[1] ?? '';
    const f = await form(req);
    const r = S.saveRoomCount(deps, actor, id, {
      room_id: f.get('room_id') ?? '', count: f.get('count') ?? '', note: f.get('note') ?? '',
    });
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `/staff/survey/${id}`, r.field);
    redirect(res, `/staff/survey/${id}?room=saved#rooms`);
    return 'handled';
  }

  const commit = /^\/staff\/survey\/([A-Za-z0-9-]+)\/commit$/.exec(path);
  if (commit && method === 'POST') {
    const id = commit[1] ?? '';
    const f = await form(req);
    const r = S.commitFigures(deps, actor, id, {
      a_qualifying_plant: f.get('a_qualifying_plant') ?? '',
      b_building: f.get('b_building') ?? '',
      c_bare_land: f.get('c_bare_land') ?? '',
      qualifying_pct: f.get('qualifying_pct') ?? '',
      method_note: f.get('method_note') ?? '',
      rates: ratesFrom(f),
    });
    if (!r.ok) return d.problem(res, actor, 'Not committed', r.why, `/staff/survey/${id}`, r.field);
    redirect(res, `/staff/survey/${id}?done=committed#figures`);
    return 'handled';
  }

  const amend = /^\/staff\/survey\/([A-Za-z0-9-]+)\/amend$/.exec(path);
  if (amend && method === 'POST') {
    const id = amend[1] ?? '';
    const f = await form(req);
    const r = S.amendFigures(deps, actor, id, {
      a_qualifying_plant: f.get('a_qualifying_plant') ?? '',
      b_building: f.get('b_building') ?? '',
      c_bare_land: f.get('c_bare_land') ?? '',
      qualifying_pct: f.get('qualifying_pct') ?? '',
      method_note: f.get('method_note') ?? '',
      reason: f.get('reason') ?? '',
      rates: ratesFrom(f),
    });
    if (!r.ok) return d.problem(res, actor, 'Not amended', r.why, `/staff/survey/${id}`, r.field);
    redirect(res, `/staff/survey/${id}?done=amended#figures`);
    return 'handled';
  }

  const disclosed = /^\/staff\/survey\/([A-Za-z0-9-]+)\/disclosure$/.exec(path);
  if (disclosed && method === 'POST') {
    const id = disclosed[1] ?? '';
    const f = await form(req);
    const r = S.reportDisclosure(deps, actor, id, f.get('note') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `/staff/survey/${id}`, r.field);
    redirect(res, `/staff/survey/${id}?done=disclosed#figures`);
    return 'handled';
  }

  return 'not-mine';
}

/**
 * The rate fields off the form.
 *
 * THE FIELD LIST COMES FROM THE MODULE, NOT FROM THE FORM. Iterating
 * `RATE_FIELDS` and reading the named input for each means a posted parameter
 * the module does not recognise is never read at all — the alternative, walking
 * the submitted keys, would hand `fieldSpec` whatever a request contained.
 */
function ratesFrom(f: URLSearchParams): S.RateInput[] {
  return S.RATE_FIELD_IDS.map((field_id) => ({
    field_id,
    value: f.get(`rate_${field_id}`) ?? '',
    reason: f.get(`reason_${field_id}`) ?? '',
    reviewed: f.get(`reviewed_${field_id}`) === 'on',
  }));
}

/* ------------------------------------------------------------------ *
 * THE LIST
 * ------------------------------------------------------------------ */

/**
 * UI TIDY PHASE 10, 3 October 2026. Lakhbir opened the wrong one of Dunmarrow's two surveys: each job now names its site
 * and its claim number under the client, and its stage is in its colour. Solid boxes count the jobs, those waiting for
 * the surveyor's figures, those with figures in, and the rooms still to count.
 */
export function jobSite(r: S.JobRow): string {
  return r.property_label === null ? 'no site recorded' : siteOf(r.business_name, r.property_label);
}

/** The client's other survey jobs this login may open. */
export function otherJobs(app: App, actor: Actor, job: S.JobRow): S.JobRow[] {
  return S.surveyorJobs(app.db, actor).filter((j) => j.business_id === job.business_id && j.job_id !== job.job_id);
}

/**
 * THE JOB'S OWN MENU, opening out under Survey jobs (src/web/navigation.ts, `setSubMenu`): the client and site; the job's
 * parts; the survey pack, marked on the pack (UI tidy phase 11); and the client's other jobs by site.
 */
export function setJobMenu(app: App, actor: Actor, job: S.JobRow, current: 'pack' | null): void {
  const chat = surveyorThreadPanel(app.db, actor, job.business_id) !== null;
  const parts: readonly (readonly [string, string])[] = [['property', 'The property'], ['rooms', 'Rooms'], ['rates', 'Rates'], ['evidence', 'Evidence'],
    ['figures', 'Your figures'], ['record', 'The record'], ...(chat ? [['messages', 'Messages'] as const] : [])];
  setSubMenu({
    title: `${job.business_name} — ${jobSite(job)}`,
    items: [...parts.map(([id, label]) => ({ href: `/staff/survey/${job.job_id}#${id}`, label })),
      { href: `/staff/survey/${job.job_id}/pack?ch=4`, label: 'Survey pack', current: current === 'pack' },
      ...otherJobs(app, actor, job).map((o) => ({ href: `/staff/survey/${o.job_id}`, label: `Their other job: ${jobSite(o)}` }))],
  });
}

function listPage(d: SurveyorDeps, actor: Actor, rows: readonly S.JobRow[]): string {
  const sealed = rows.filter((r) => r.state === 'SEALED').length;
  const rooms = rows.reduce((n, r) => n + Math.max(0, r.rooms_total - r.rooms_counted), 0);
  return page({
    title: 'Survey jobs', nav: d.nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><h1>Survey jobs</h1><p class="lede">${rows.length} job${rows.length === 1 ? '' : 's'} you can open · ${sealed} waiting for your figures</p></div></div>
      ${kpiRow([
        { label: 'Jobs open', value: String(rows.length), tone: 'total' },
        { label: 'Waiting for your figures', value: String(sealed), tone: sealed > 0 ? 'warn' : 'plain' },
        { label: 'Figures in', value: String(rows.length - sealed), tone: 'money' },
        { label: 'Rooms still to count', value: String(rooms), tone: 'survey' },
      ])}
      ${rows.length === 0
        ? h`<p class="help">Nothing is assigned to you. A job shows here once the office gives it to you.</p>`
        : h`<div class="tablewrap"><table class="stack jobtable"><thead><tr>
            <th>Client and site</th><th>Sector</th><th>Rooms counted</th><th>Rates recorded</th>
            <th>Your figures</th><th>Assigned to</th><th>Stage</th></tr></thead>
          <tbody>${rows.map((r) => h`<tr>
            <td data-label="Client and site"><a class="rowlink" href="/staff/survey/${r.job_id}">${r.business_name}</a><br><span class="jobsite">${jobSite(r)}</span>${
              r.claim_ref === null ? raw('') : h` ${claimRef(r.claim_ref)}`}</td>
            <td data-label="Sector">${r.sector.replace(/_/g, ' ')}</td>
            <td data-label="Rooms counted">${r.rooms_counted} of ${r.rooms_total}</td>
            <td data-label="Rates recorded">${r.rates_recorded} of ${r.rates_total}</td>
            <td data-label="Your figures">${r.state === 'COMMITTED_AND_RELEASED'
              ? h`<span class="badge b-ok">In</span>${r.committed_at !== null ? h`<br><span class="help">${d.stamp(r.committed_at)}</span>` : raw('')}`
              : h`<span class="badge b-warn">Not yet</span>`}</td>
            <td data-label="Assigned to">${r.surveyor_name ?? nobodyBadge('Nobody yet')}</td>
            <td data-label="Stage">${r.claim_stage_key === null ? h`<span class="help">${r.stage_label}</span>` : stageBadge(r.claim_stage_key, r.stage_label)}</td>
          </tr>`)}</tbody></table></div>`}

      <div class="gate"><strong>Our estimate is not on these pages until your figures are in.</strong>
      It is not hidden on screen — we do not send it to you at all. Once you commit your figures,
      you get it straight away. You do not need to ask anyone.</div>`,
  });
}

/* ------------------------------------------------------------------ *
 * THE WORKSPACE
 * ------------------------------------------------------------------ */

const DONE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  committed:
    'Your figures are saved and our estimate is now shown to you. Both are below. ' +
    'The log shows when it was released.',
  amended:
    'Your change is saved, with your reason. Your first figures are kept as they were, next to it. ' +
    'We compare the two, so we never overwrite the first ones.',
  disclosed:
    'Recorded. This job now reads EXPOSED, not CLEAN. Your rates on it are left out when we ' +
    'tune our own rates. It costs you nothing.',
});

/**
 * PHASE 133b — THE WORKSPACE ON THE RECORD LAYOUT. The six numbered sections become six tabs, in their order, each drawn
 * by the same panel function from the same workspace; "Our estimate" — withheld or released — moves to the right-hand
 * panel, so it is beside every tab rather than above the first. The workspace and its payload are built exactly as before,
 * forwards, before a line of this is drawn: the layout reads the view, it never shapes it.
 *
 * THE HIGHLIGHTS CARRY NO FIGURE. They say whether our estimate is withheld or released — never what it is — and the
 * counts of rooms and rates this job's own tables already show. `payload-proof` is re-run on this page.
 *
 * "YOUR FIGURES" IS THE QUICK ACTION, offered only where section 5 draws a form for this login: commit before, amend
 * after. Recording a room count is offered where section 2 draws its forms.
 */
function workspacePage(
  d: SurveyorDeps, actor: Actor, w: S.Workspace,
  done: string | undefined, room: string | undefined,
): string {
  const committed = w.job.state === 'COMMITTED_AND_RELEASED';
  const released = w.payload.quarantine.state === 'COMMITTED_AND_RELEASED';
  const rates = w.rates.rows.filter((f) => f.recorded !== null).length;
  // 1 Oct 2026: the survey pack — every element, the sums, and the surveyor's stamped changes.
  const packLink: QuickAction = { href: `/staff/survey/${w.job.job_id}/pack?ch=4`, label: 'Open the survey pack' };
  const quick: QuickAction[] = !w.may_commit ? [packLink] : [
    packLink,
    committed
      ? (w.payload.estimate !== undefined ? { href: '#aa', label: 'Amend your figures' } : null)
      : { href: '#figures', label: 'Commit your figures' },
    w.rooms.schedule === null ? null : { href: '#rooms', label: 'Record the room counts' },
    { href: '#dn', label: 'Record what the client told you' },
  ].filter((q): q is QuickAction => q !== null);
  // PHASE 142b: the thread with the client, read only, where the rule admits this login.
  const chat = surveyorThreadPanel(d.app.db, actor, w.job.business_id);
  // UI TIDY PHASE 10: the job names its site and claim; the client's other jobs are a link away; the menu opens out.
  const site = jobSite(w.job);
  const others = otherJobs(d.app, actor, w.job);
  setJobMenu(d.app, actor, w.job, null);
  return page({
    title: w.job.business_name, nav: d.nav(actor), wide: true,
    body: h`
      ${done !== undefined && DONE_WORDS[done] !== undefined
        ? h`<div class="gate">${DONE_WORDS[done]}</div>` : raw('')}
      ${room === 'saved' ? h`<div class="gate">Recorded.</div>` : raw('')}
      ${breadcrumb([{ label: 'Survey jobs', href: '/staff/survey' }, { label: `${w.job.business_name} — ${site}` }])}
      ${highlights('Survey job', w.job.business_name, [
        { label: 'Site', value: site },
        { label: 'Claim', value: w.job.claim_ref ?? 'not yet on a claim' },
        { label: 'Sector', value: w.job.sector.replace(/_/g, ' ') },
        { label: 'Stage', value: w.job.stage_label },
        { label: 'Job opened', value: d.stamp(w.job.created_at) },
        { label: 'Rooms counted', value: w.rooms.schedule === null ? 'no schedule for this sector' : `${w.rooms.counted} of ${w.rooms.rows.length}` },
        { label: 'Rates recorded', value: `${rates} of ${w.rates.rows.length}` },
        { label: 'Your figures', value: committed ? (w.job.committed_at === null ? 'committed' : `committed ${d.stamp(w.job.committed_at)}`) : 'not yet' },
        { label: 'Our estimate', value: released ? 'released' : 'withheld' },
      ], raw(''), h`${site}${w.job.claim_ref === null ? raw('') : h` · ${claimRef(w.job.claim_ref)}`}`)}
      ${others.length === 0 ? raw('') : h`<p class="otherjobs">This client has ${String(others.length + 1)} survey jobs. ${others.length === 1 ? 'The other one' : 'The others'}: ${
        others.map((o, i) => h`${i === 0 ? raw('') : raw(', ')}<a href="/staff/survey/${o.job_id}">${jobSite(o)}</a>${o.claim_ref === null ? raw('') : h` ${claimRef(o.claim_ref)}`}`)}</p>`}
      ${recordLayout(recordTabs([
        { id: 'property', label: 'The property', body: propertyPanel(w) },
        { id: 'rooms', label: 'Rooms', body: roomsPanel(w) },
        { id: 'rates', label: 'Rates', body: ratesPanel(w) },
        { id: 'evidence', label: 'Evidence', body: evidencePanel(w) },
        { id: 'figures', label: 'Your figures', body: figuresPanel(w) },
        { id: 'record', label: 'The record', body: logPanel(d, w) },
        ...(chat === null ? [] : [{ id: 'messages', label: 'Messages', body: chat }]),
      ]), sidePanel(null, quick, quarantinePanel(d, w)))}

      <p><a href="/staff/survey">Back to the job list</a></p>
      ${dataLink(actor, `/staff/survey/${w.job.job_id}/payload.json`)}`,
  });
}

/* --------------------------------------------- the quarantine, said plainly */

function quarantinePanel(d: SurveyorDeps, w: S.Workspace): Safe {
  const released = w.payload.quarantine.state === 'COMMITTED_AND_RELEASED';
  return h`
    <div class="pblock">
      <div class="pnum">Our estimate</div>
      ${released
        ? h`<p><strong>Released.</strong> Your figures were committed
            ${w.job.committed_at !== null ? h`on ${d.stamp(w.job.committed_at)}` : raw('')}
            and our estimate is on the Your figures tab.</p>`
        : h`<p><strong>Withheld.</strong> ${w.payload.quarantine.notice}</p>
           <p class="help">It is not on this page, and it is not in the data we sent you. You can
             check: <a href="/staff/survey/${w.job.job_id}/payload.json">open the data we sent you</a>
             and search it. We do not just hide it on screen — we never send it.</p>`}
      <p class="help">What you always get:
        ${w.payload.quarantine.released_always.join(' · ')}.</p>
      ${(() => {
        // PHASE 153e (Word question 131): the evidence level, worked out from the price paid. The level only.
        const r = deskFirstReading(d.app.db, w.job.job_id);
        return r === null ? raw('') : h`<p><strong>How much evidence:</strong> ${r.level_words}</p>`;
      })()}
    </div>`;
}

/* ------------------------------------------------------------ the property */

function propertyPanel(w: S.Workspace): Safe {
  const p = w.payload;
  return h`
    <h2>The property</h2>
    ${p.properties.length === 0
      ? h`<p class="help">No property has been recorded against this client.</p>`
      : h`<table><thead><tr><th>Site</th><th>Postcode</th></tr></thead>
          <tbody>${[...p.properties].sort((a, b) => Number(b.label === w.job.property_label) - Number(a.label === w.job.property_label)).map((x) => h`<tr${
            x.label === w.job.property_label ? raw(' class="thisjob"') : raw('')}>
            <td>${x.label}${x.label === w.job.property_label ? h` <span class="badge b-ok">This job</span>` : raw('')}</td><td>${x.postcode ?? h`<span class="help">not recorded</span>`}</td>
          </tr>`)}</tbody></table>`}
    <h3>What the client told us</h3>
    <p class="help">${p.answers.length} questions, in the order asked. A skipped question and an
      “I don’t know” are both shown as answers, not as blanks.</p>
    <table><thead><tr><th>#</th><th>Question</th><th>Answer</th></tr></thead>
      <tbody>${p.answers.map((a) => h`<tr>
        <td>${a.ord + 1}</td><td>${a.question_text}</td>
        <td>${a.state === 'ANSWERED'
          ? h`${a.value ?? ''}`
          : h`<em>${a.state === 'DONT_KNOW' ? 'does not know' : 'skipped'}</em>`}</td>
      </tr>`)}</tbody></table>`;
}

/* ------------------------------------------------------- the room schedule */

function roomsPanel(w: S.Workspace): Safe {
  const r = w.rooms;
  if (r.schedule === null) {
    return h`<h2>The room schedule</h2>
      <p class="help">We have no room list for this sector yet. That is a gap in our list, not a
        fact about the building.</p>`;
  }
  return h`
    <h2>The room schedule, and the quantities</h2>
    <p class="help">What scales this sector: <strong>${r.schedule.scales_on}</strong>.
      ${r.counted} of ${r.rows.length} room types counted; ${r.uncounted} not yet.</p>
    ${r.schedule.note !== undefined ? h`<div class="gate">${r.schedule.note}</div>` : raw('')}
    <table><thead><tr>
      <th>Room type</th><th>What a count is measured against</th><th>How many</th>
      <th>Your note</th><th></th></tr></thead>
      <tbody>${r.rows.map((x) => h`<tr>
        <td>${x.label}${x.caveat !== undefined ? h`<br><span class="say">${x.caveat}</span>` : raw('')}</td>
        <td><span class="help">${x.driver}</span></td>
        <td>${x.count === null
          ? h`<span class="help">not counted</span>`
          : h`<strong>${x.count}</strong>`}</td>
        <td>${x.note ?? raw('')}</td>
        <td>${w.may_commit
          ? h`<form method="post" action="/staff/survey/${w.job.job_id}/rooms" class="inline">
              <input type="hidden" name="room_id" value="${x.room_id}">
              <label class="vh" for="c-${x.room_id}">Count for ${x.label}</label>
              <input id="c-${x.room_id}" name="count" inputmode="numeric" size="4"
                value="${x.count === null ? '' : String(x.count)}">
              <label class="vh" for="n-${x.room_id}">Note for ${x.label}</label>
              <input id="n-${x.room_id}" name="note" size="18" value="${x.note ?? ''}">
              <button type="submit">Record</button></form>`
          : raw('')}</td>
      </tr>`)}</tbody></table>
    <div class="gate"><strong>An empty box means “not counted”. It does not mean none.</strong>
      Type 0 where there are none. The two mean different things, and we keep them apart.
      <br>We have no counts of our own for any building — we have not been inside this one.
      Our item list for these rooms (what we think is in each, why, and how sure we are) is
      ${r.source}</div>`;
}

/* ---------------------------------------------------------- the rate library */

function ratesPanel(w: S.Workspace): Safe {
  return h`
    <h2>The rates</h2>
    <p class="help">Ten tracked fields. Whatever you put here becomes <strong>your</strong> figure
      and is offered back to you on your next job in this sector, labelled as yours.</p>
    <div class="gate">${w.rates.no_defaults}</div>
    ${w.rates.context === null
      ? h`<p class="help">We have no rates for this sector.</p>`
      : w.rates.region_derived
        /* THE REGION IS DERIVED FROM THE PROPERTY'S POSTCODE. Phase 110. It is
           named on the screen rather than implied, because a surveyor needs to
           know which of their own past figures they are being shown. */
        ? h`<p class="help">Your figures are offered back to you for
            <strong>${w.rates.context.region}</strong>, worked out from this property’s postcode.
            Figures you gave on jobs in other regions are not offered here.</p>`
        /* AND WHERE IT IS NOT, THE REASON IS ON THE SCREEN AND NOT IN A LOG.
           Four different things can put us here — no postcode, no ingested
           table, a property outside the part of the UK we serve, and the open
           Inner-London question — and they need four different people to do
           four different things. "region-not-captured" told a surveyor none
           of that. */
        : h`<p class="help">Region is <strong>not known for this job</strong>, so your figures are
            offered back from the whole country, not this area. Bear that in mind before you use
            one.<br><span class="say">${w.rates.region_why}</span></p>`}
    <table><thead><tr>
      <th>Field</th><th>Unit</th><th>What we would pre-fill</th><th>Recorded on this job</th>
      </tr></thead>
      <tbody>${w.rates.rows.map((f) => h`<tr>
        <td>${f.field_id.replace(/_/g, ' ')}</td>
        <td>${f.unit}</td>
        <td>${f.blank_control
          /* PHASE 132 — THE BLANK-FIELD CONTROL. No figure and no proposal text: the
             label names whose figure a proposal is, and on a control field there is
             none to name. What the surveyor IS told is that the gap is deliberate,
             which anchors nothing. */
          ? h`<span class="help">blank on this job, on purpose</span><br><span class="say">One field in
              ten is shown with nothing in it, so we can tell whether a figure we show you persuades
              you. Put your own figure in.</span>`
          : f.proposal === null
            ? h`<span class="help">nothing — see above</span>`
            : h`${f.proposal.value}<br><span class="say">${f.proposal.label}</span>`}</td>
        <td>${f.recorded === null
          ? h`<span class="help">not recorded</span>`
          : h`<strong>${f.recorded.value}</strong> <span class="help">${f.recorded.outcome.toLowerCase()}</span>
             ${f.recorded.reason !== null ? h`<br><span class="say">${f.recorded.reason}</span>` : raw('')}`}</td>
      </tr>`)}</tbody></table>
    <p class="help">Give a reason when you change a field by enough to matter. Small changes need
      no reason. If we asked every time, people would just type “n/a”.</p>`;
}

/* -------------------------------------------------------------- the evidence */

function evidencePanel(w: S.Workspace): Safe {
  const e = w.evidence;
  const p = w.payload;
  return h`
    <h2>The evidence</h2>
    <h3>Register data we hold</h3>
    ${p.register_records.length === 0
      ? h`<p class="help">None yet. Register lookups are not allowed yet or not switched on yet,
          so nothing has been looked up.</p>`
      : h`<table><thead><tr><th>Source</th><th>What it gave us</th></tr></thead>
          <tbody>${p.register_records.map((r) => h`<tr>
            <td>${r.source_id}</td>
            <td><span class="say">${fieldList(r.fields)}</span>${registerAttribution(r.source_id) === null ? raw('')
              : h`<p class="help">${registerAttribution(r.source_id)}</p>`}</td>
          </tr>`)}</tbody></table>`}

    <h3>Documents the client uploaded</h3>
    ${e.documents.length === 0
      ? h`<p class="help">None yet.</p>`
      : h`<table><thead><tr>
          <th>File</th><th>Type</th><th>State</th><th>Read, then deleted</th><th>Released from holding</th>
          </tr></thead>
          <tbody>${e.documents.map((x) => h`<tr>
            <td>${x.filename}</td><td>${x.doc_type ?? h`<span class="help">type not known</span>`}</td>
            <td>${x.state}</td>
            <td>${x.strip_recorded_at ?? h`<span class="help">not recorded</span>`}</td>
            <td>${x.quarantine_discharged_at ?? h`<span class="help">not yet</span>`}</td>
          </tr>`)}</tbody></table>`}
    <div class="gate">${e.originals_note}</div>

    <h3>What your pack is still waiting on</h3>
    ${e.missing.length === 0
      ? h`<p class="help">Nothing. Every fact your pack needs is in.</p>`
      : h`<table><thead><tr><th>What is missing</th><th>Why</th><th>Blocks</th></tr></thead>
          <tbody>${e.missing.map((m) => h`<tr>
            <td>${m.question}</td>
            <td><span class="say">${m.why}</span></td>
            <td>${m.blocks === 'BOTH' ? 'both packs' : 'your pack'}${
              m.blocks_by_default ? h`<br><span class="say">shown as holding up both, because we could not
                tell which. Better to show too much than too little.</span>` : raw('')}</td>
          </tr>`)}</tbody></table>`}`;
}

/** Field NAMES from a register record, never a dump of its values. */
function fieldList(fields: unknown): string {
  if (fields === null || typeof fields !== 'object') return 'nothing readable';
  return Object.keys(fields as Record<string, unknown>).join(', ');
}

/* --------------------------------------------------------- your own figures */

/**
 * PHASE 132, 14 SEPTEMBER 2026 — THE "I LOOKED AT THIS FIELD" BOX NO LONGER STARTS TICKED.
 *
 * Ticked by default, it recorded `reviewed` for every field nobody touched, so
 * NOT_REVIEWED could never fire and the instrument's unreviewed rate read zero by
 * construction: the confirmation was the form's, not the surveyor's. A review is
 * now a positive act. An unticked box, and a posted value other than "on" such as
 * "not sure", both read as not reviewed — see `ratesFrom`.
 *
 * A BLANK-CONTROL FIELD IS SERVED EMPTY HERE TOO. `rateLibrary` has already nulled
 * its proposal; the `blank_control` check on the input's value says so where the
 * input is built, so a later change to the proposal cannot put a figure back in it.
 */
function figuresPanel(w: S.Workspace): Safe {
  const committed = w.job.state === 'COMMITTED_AND_RELEASED';
  const est = w.payload.estimate;
  // PHASE 158b: an estimate sealed from the funnel's figure holds no pool split or land value; say so, not "£0".
  const notEstimated = w.estimate_basis === FUNNEL_CEILING;

  return h`
    <h2>Your figures</h2>
    <div class="gate">${w.signature}</div>
    ${committed
      ? h`<p><strong>Committed.</strong> They are locked in the audit log, so no one can change
          them quietly. The log below shows when our estimate was released.</p>`
      : w.may_commit
        ? h`<form method="post" action="/staff/survey/${w.job.job_id}/commit">
            <p><label for="a">Qualifying plant and machinery (£)</label>
              <input id="a" name="a_qualifying_plant" inputmode="decimal" required></p>
            <p><label for="b">Building (£)</label>
              <input id="b" name="b_building" inputmode="decimal" required></p>
            <p><label for="c">Bare land (£)</label>
              <input id="c" name="c_bare_land" inputmode="decimal" required></p>
            <p><label for="pct">Qualifying percentage (0–100)</label>
              <input id="pct" name="qualifying_pct" inputmode="decimal" required></p>

            <h3>The rates, if you are recording them now</h3>
            ${w.rates.rows.map((f) => h`<p>
              <label for="r-${f.field_id}">${f.field_id.replace(/_/g, ' ')} (${f.unit})</label>
              <input id="r-${f.field_id}" name="rate_${f.field_id}" inputmode="decimal"
                value="${f.blank_control || f.proposal === null ? '' : String(f.proposal.value)}">
              <label for="w-${f.field_id}">Why, if you have moved it materially</label>
              <input id="w-${f.field_id}" name="reason_${f.field_id}" size="30">
              <label><input type="checkbox" name="reviewed_${f.field_id}"> I looked at this field</label>
            </p>`)}
            <p class="help">Tick the box for each field you checked. Without it, a figure you
              agreed with looks the same as one you never looked at.</p>

            <p><label for="m">On what basis did you reach these?</label>
              <input id="m" name="method_note" size="60" required></p>
            <p class="help">Required. Without it, your figures prove nothing. We read this back if
              the claim is ever challenged.</p>
            <p><button type="submit">Commit my figures — this releases our estimate to me</button></p>
          </form>`
        : h`<p class="help">This job is not assigned to you, so you cannot commit figures on it.</p>`}

    ${est !== undefined
      ? h`<h3>Our estimate, now released</h3>
         <table><tbody>
           <tr><th>Spend that counts</th><td>${formatPence(est.qualifying_expenditure_pence)}</td></tr>
           <tr><th>Qualifying percentage</th><td>${Math.round(est.qualifying_pct * 1000) / 10}%</td></tr>
           <tr><th>Main pool</th><td>${notEstimated ? SO_WORDS.not_estimated : formatPence(est.pool_split_main_pence)}</td></tr>
           <tr><th>Special rate pool</th><td>${notEstimated ? SO_WORDS.not_estimated : formatPence(est.pool_split_special_pence)}</td></tr>
           <tr><th>Bare land</th><td>${notEstimated ? SO_WORDS.not_estimated : formatPence(est.bare_land_pence)}</td></tr>
         </tbody></table>
         <p class="help">You may change your own figures after seeing this, if it shows a real
           mistake. Every change now needs a reason. Without one, we cannot tell a fix from being
           pulled toward our figure. <strong>Your first figures are kept as they were</strong>;
           the change sits beside them in the log, and we compare the two.</p>
         ${w.may_commit
           ? h`<form method="post" action="/staff/survey/${w.job.job_id}/amend">
               <h4>Amend your figures</h4>
               <p><label for="aa">Qualifying plant and machinery (£)</label>
                 <input id="aa" name="a_qualifying_plant" inputmode="decimal" required></p>
               <p><label for="ab">Building (£)</label>
                 <input id="ab" name="b_building" inputmode="decimal" required></p>
               <p><label for="ac">Bare land (£)</label>
                 <input id="ac" name="c_bare_land" inputmode="decimal" required></p>
               <p><label for="apct">Qualifying percentage (0–100)</label>
                 <input id="apct" name="qualifying_pct" inputmode="decimal" required></p>
               <p><label for="areason">Why are you changing them?</label>
                 <input id="areason" name="reason" size="60" required></p>
               <p><button type="submit">Record the amendment</button></p>
             </form>`
           : raw('')}`
      : raw('')}

    ${w.may_commit
      ? h`<h3>If the client has told you our figure</h3>
         <p class="help">We cannot stop that. A client who saw a range on our website can read it
           out to you on the phone. What we can do is record it. Telling us costs you nothing. It
           marks the job EXPOSED, and your rates on it are left out when we tune our own. That is
           about our data, not about your work.</p>
         <form method="post" action="/staff/survey/${w.job.job_id}/disclosure">
           <p><label for="dn">What were you told, and by whom?</label>
             <input id="dn" name="note" size="60" required></p>
           <p><button type="submit">Record it</button></p>
         </form>`
      : raw('')}`;
}

/* ------------------------------------------------------------------ the log */

function logPanel(d: SurveyorDeps, w: S.Workspace): Safe {
  const p = w.process;
  return h`
    <h2>The record</h2>
    <p class="help">Verdict on this job: <strong>${p.verdict}</strong>.
      Audit log ${p.chain_intact ? 'intact' : h`<strong>BROKEN — an entry has been removed, changed or moved</strong>`}.
      ${p.denied_attempts} attempt${p.denied_attempts === 1 ? '' : 's'} to open the estimate before
      commitment${p.client_disclosures > 0
        ? h`, and ${p.client_disclosures} time${p.client_disclosures === 1 ? '' : 's'} you said the client told you our figure` : raw('')}.</p>
    ${p.drift !== null
      ? h`<p class="help">After release, ${p.drift.amendments} amendment${p.drift.amendments === 1 ? '' : 's'},
          of which ${p.drift.moved_toward_estimate} moved toward our estimate.</p>`
      : raw('')}
    <table><thead><tr><th>#</th><th>What happened</th><th>When</th><th>Who</th></tr></thead>
      <tbody>${p.entries.map((e) => h`<tr>
        <td>${e.seq}</td><td>${e.kind.replace(/_/g, ' ').toLowerCase()}</td>
        <td class="when">${d.stamp(e.at)}</td><td>${e.actor}</td>
      </tr>`)}</tbody></table>
    <div class="gate">Each line above is linked to the one before it in the audit log. We check
      the links from the saved rows. If a line is removed or moved, the log shows as broken. A
      refused attempt is kept too, as evidence.</div>`;
}

/** A hidden label, for the per-row inputs in the room table. */
export const VISUALLY_HIDDEN_CLASS = 'vh';
