/**
 * THE APPROVE BOX AND THE CLIENT'S STEPS, DRAWN — PHASE 139, 21 September 2026. "Clean-up 6 of 11."
 *
 * Draws what src/web/approvals.ts returns and decides nothing. Staff see it on the client page (the company's step and
 * every claim's) and on a claim's page (that claim's steps); the client sees `clientStepsCard`, which is handed the
 * client's own view and nothing else. The pages run no script, so every tick is a small form with one button.
 */

import { h, raw, type Safe } from './html.ts';
import { badge, claimRef, why, type Tone } from './components.ts';
import { localStamp, ukDate } from './localtime.ts';
import type { ChecksPanel, CheckFact, ClientStep, StepState, StepView } from './approvals.ts';

const STATE_WORDS: Readonly<Record<StepState, readonly [string, Tone]>> = Object.freeze({
  NOTHING_YET: ['Nothing to check yet', 'plain'],
  CHECKING: ['Checking', 'warn'],
  READY_TO_TELL: ['Ready to tell the client', 'info'],
  TOLD: ['Client told', 'ok'],
  RECHECKING: ['Being re-checked', 'warn'],
});

/** Where a form sends the person back to: the client page, or the claim inside it, and the step they were in. Ids only. */
export type Back = { readonly business_id: string; readonly claim_id: string | null; readonly step?: string };

/** A step's anchor: `step-company-company`, or `step-<claim id>-<step>`. The only shape a return address may carry. */
export const STEP_ANCHOR = /^step-(company|[0-9a-f-]{36})-[a-z_]{3,20}$/;

function stepAnchor(s: StepView): string {
  return `step-${s.claim_id ?? 'company'}-${s.key.toLowerCase()}`;
}

function backFields(b: Back): Safe {
  return h`<input type="hidden" name="back" value="${b.claim_id === null ? 'client' : `claim:${b.claim_id}`}">${
    b.step === undefined ? raw('') : h`<input type="hidden" name="at" value="${b.step}">`}`;
}

function valueBox(f: CheckFact): Safe {
  const a = f.as_fact;
  if (a === undefined) return raw('');
  const id = `v-${f.ref.replace(/[^A-Za-z0-9-]/g, '-')}`;
  const box = a.kind === 'choice'
    ? h`
      <select id="${id}" name="value" required><option value="">Choose</option>${a.choices.map((c) => h`<option value="${c.value}"${c.value === a.prefill ? raw(' selected') : raw('')}>${c.label}</option>`)}</select>`
    : a.kind === 'date' ? h`<input id="${id}" name="value" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(a.prefill) ? a.prefill : ''}" required>`
      : h`<input id="${id}" name="value" value="${a.prefill}" required>`;
  return h`<label class="asfact" for="${id}">Record it as${why('The client’s words are shown above. Put them in the form the tax rules need, then tick. Ticking records the fact on the claim, marked “You told us”.')}</label> ${box}`;
}

function factLine(f: CheckFact, b: Back, mayApprove: boolean): Safe {
  const action = `/staff/clients/${b.business_id}/checks`;
  const tick = f.approved !== null
    ? h`<span class="ticked"><span class="box on" aria-hidden="true"></span> Checked and approved
        <span class="help">by ${f.approved.by}, ${localStamp(f.approved.at)}</span></span>
      ${mayApprove ? h`<details class="undo"><summary>Take the tick off</summary>
        <form method="post" action="${action}/unapprove">${backFields(b)}<input type="hidden" name="ref" value="${f.ref}">
          <label>Why? <input name="reason" required maxlength="2000"></label> <button type="submit">Take it off</button></form></details>` : raw('')}`
    : !f.approvable ? h`<span class="help">${f.why_not ?? 'Nothing to check yet.'}</span>`
      : mayApprove ? h`<form method="post" action="${action}/approve" class="tickform">${backFields(b)}<input type="hidden" name="ref" value="${f.ref}">
          ${valueBox(f)}
          <button type="submit" class="tickbox" aria-pressed="false"><span class="box" aria-hidden="true"></span> Checked and approved</button></form>`
        : h`<span class="help">Not checked yet.</span>`;
  return h`<li class="check${f.approved !== null ? ' ok' : ''}">
    <p class="checkwhat"><span class="chip">${f.chip}</span> <strong>${f.label}</strong></p>
    <p class="checkval">${f.value}${f.arrived === null ? raw('') : h` <span class="when">· arrived ${ukDate(f.arrived)}</span>`}</p>
    ${f.attribution ? h`<p class="help">${f.attribution}</p>` : raw('')}
    ${f.untick === null ? raw('') : h`<p class="help">Tick taken off by ${f.untick.by}, ${localStamp(f.untick.at)}: ${f.untick.reason}</p>`}
    <div class="checkdo">${tick}</div></li>`;
}

function stepBlock(s: StepView, back: Back, mayApprove: boolean, openStep: string | undefined): Safe {
  const [words, tone] = STATE_WORDS[s.state];
  const done = s.facts.filter((f) => f.approved !== null).length;
  const action = `/staff/clients/${back.business_id}/steps`;
  const anchor = stepAnchor(s);
  const b: Back = { ...back, step: anchor };
  const ids = h`${backFields(b)}<input type="hidden" name="step" value="${s.key}"><input type="hidden" name="claim_id" value="${s.claim_id ?? ''}">`;
  // The facts fold, so a company with many claims reads as a list of steps. They open for the step just worked in, and
  // wherever there are only a few.
  const openFacts = anchor === openStep || s.facts.length <= 3;
  const toCheck = s.facts.length - done;
  return h`<div class="step step-${s.state.toLowerCase().replace(/_/g, '-')}" id="${anchor}">
    <div class="stephead"><h3>${s.label}</h3> ${badge(words, tone)}</div>
    <p class="help">${s.facts.length === 0 ? 'Nothing has come in for this step yet.'
      : `${done} of ${s.facts.length} checked.`}${s.missing > 0 ? ` ${s.missing} still missing — ask for ${s.missing === 1 ? 'it' : 'them'} under We need.` : ''}</p>
    ${s.told !== null ? h`<p>Told the client on ${ukDate(s.told.at)} <span class="help">by ${s.told.by}</span></p>` : raw('')}
    ${s.taken_back !== null && s.told === null ? h`<p class="help">Taken back on ${ukDate(s.taken_back.at)} by ${s.taken_back.by}: ${s.taken_back.reason}. The client sees “Being re-checked”.</p>` : raw('')}
    ${s.may_tell ? h`<form method="post" action="${action}/tell" class="inline">${ids}<button type="submit" class="cta">Tell the client and move on</button></form>` : raw('')}
    ${s.may_take_back ? h`<details class="undo"><summary>Take this step back</summary>
      <form method="post" action="${action}/take-back">${ids}<label>Why? <input name="reason" required maxlength="2000"></label>
        <button type="submit">Take it back</button></form>
      <p class="help">The client will see “Being re-checked”, never your reason.</p></details>` : raw('')}
    ${s.facts.length === 0 ? raw('') : h`<details class="facts"${openFacts ? raw(' open') : raw('')}><summary>${toCheck > 0 && mayApprove
      ? `Check the ${s.facts.length === 1 ? 'fact' : `${s.facts.length} facts`}` : `See the ${s.facts.length === 1 ? 'fact' : `${s.facts.length} facts`}`}</summary>
      <ul class="checks">${s.facts.map((f) => factLine(f, b, mayApprove))}</ul></details>`}
  </div>`;
}

/** The whole company: its own step, then each claim's. For the client page. */
export function checksBlock(p: ChecksPanel, openStep?: string): Safe {
  const b: Back = { business_id: p.business_id, claim_id: null };
  return h`<div class="checkset">
    ${stepBlock(p.company, b, p.may_approve, openStep)}
    ${p.claims.map((c) => h`<div class="checkclaim"><h3 class="claimhead">${c.name}</h3><p>${claimRef(c.ref)}</p>
      ${c.steps.map((s) => stepBlock(s, b, p.may_approve, openStep))}</div>`)}
    ${p.unmatched.length === 0 ? raw('') : h`<div class="step"><div class="stephead"><h3>Not matched to a claim yet</h3></div>
      <p class="help">These are about a property, but we do not know which claim.${why('They are shown so nothing is hidden. They count towards no step until they can be matched to one property.')}</p>
      <ul class="checks">${p.unmatched.map((f) => factLine(f, b, p.may_approve))}</ul></div>`}
    <div class="help">${why('Tick a fact once you have checked it. When every fact in a step is ticked and nothing is missing, press “Tell the client”. Their portal then shows the step as done, with the date — never a figure, a value or anything internal. Only Admin can take a step back.')}</div>
  </div>`;
}

/** One claim's steps. For the claim page. */
export function claimChecksBlock(p: ChecksPanel, claim_id: string, openStep?: string): Safe {
  const c = p.claims.find((x) => x.id === claim_id);
  if (c === undefined) return raw('');
  const b: Back = { business_id: p.business_id, claim_id };
  return h`<div class="checkset">${c.steps.map((s) => stepBlock(s, b, p.may_approve, openStep))}
    <p><a href="/staff/clients/${p.business_id}#checks">See the company’s own step</a></p></div>`;
}

/** How far a set of steps has got, for a section's WORKING ON line. */
export function checksSummary(steps: readonly StepView[]): { status: 'NOT_STARTED' | 'WORKING' | 'WAITING' | 'DONE'; working: string; count: number } {
  const ready = steps.filter((s) => s.state === 'READY_TO_TELL').length;
  const told = steps.filter((s) => s.state === 'TOLD').length;
  const checking = steps.filter((s) => s.state === 'CHECKING' || s.state === 'RECHECKING').length;
  if (ready > 0) return { status: 'WORKING', working: `${ready} step${ready === 1 ? ' is' : 's are'} ready. Press “Tell the client”.`, count: ready };
  if (checking > 0) return { status: 'WORKING', working: `Checking ${checking} step${checking === 1 ? '' : 's'}. Tick each fact once checked.`, count: checking };
  if (told > 0) return { status: told === steps.length ? 'DONE' : 'WORKING', working: `The client has been told ${told} step${told === 1 ? '' : 's'}.`, count: 0 };
  return { status: 'NOT_STARTED', working: 'Nothing has come in to check yet.', count: 0 };
}

/* ------------------------------------------------------------------ the client's own card */

function clientLine(s: ClientStep): Safe {
  return h`<li class="${s.state === 'DONE' ? 'done' : 'rechecking'}">${s.state === 'DONE'
    ? h`<span aria-hidden="true">✓</span> ${s.words} <span class="help">— ${ukDate(s.on)}</span>`
    : h`<span aria-hidden="true">↻</span> ${s.words} <span class="help">— since ${ukDate(s.on)}</span>`}</li>`;
}

/**
 * "WHAT CAP REBATE HAS DONE", ON THE PORTAL. Handed the client's steps and the names of the client's own claims —
 * nothing else — so it cannot draw a fact, a figure or a reason: it has none.
 */
export function clientStepsCard(steps: readonly ClientStep[], claims: readonly { readonly id: string; readonly name: string }[], only?: string): Safe {
  const company = steps.filter((s) => s.claim_id === null);
  const groups = claims.filter((c) => only === undefined || c.id === only)
    .map((c) => ({ c, list: steps.filter((s) => s.claim_id === c.id) })).filter((g) => g.list.length > 0);
  const shown = (only === undefined ? company.length : 0) + groups.reduce((n, g) => n + g.list.length, 0);
  return h`<section class="card" id="done-so-far"><div class="card-h"><h2>What Cap Rebate has done</h2></div>
    ${shown === 0 ? h`<p class="help">Nothing yet. We will tick each step off here as we finish it.</p>` : h`
      ${only !== undefined || company.length === 0 ? raw('') : h`<ul class="donelist">${company.map(clientLine)}</ul>`}
      ${groups.map((g) => h`${only === undefined ? h`<h3 class="doneclaim">${g.c.name}</h3>` : raw('')}<ul class="donelist">${g.list.map(clientLine)}</ul>`)}`}
  </section>`;
}
