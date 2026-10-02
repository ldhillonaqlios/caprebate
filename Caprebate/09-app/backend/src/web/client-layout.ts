/**
 * THE CLIENT PAGE, LAID OUT AGAIN — 30 September 2026.
 *
 * Lakhbir: "the whole interfact for a client needs to be designed - theres too much going on and its hard to find
 * things". Agreed in the chat from a drawn layout ("Yes, build it"). Nothing is removed; everything is regrouped:
 *
 *   THE HEADER        the company, its owner and who we wait on; the client's six steps as a bar (the names the portal
 *                     reads); and three actions — Chat (every message with them, and a box to write), Log a call, Files —
 *                     with the rest under "More".
 *   THE NEXT STEP     the one step that is ready to tell the client, with its checked facts and where each came from, and
 *                     "Tell the client and move on" (src/web/tell-and-move.ts). When none is ready, what the next step is
 *                     still waiting for. Where a claim could not move on, why.
 *   THE LOOKUPS       every lookup and its state at a glance — done and when, failed, waiting, not switched on, not run.
 *   THE TABS          Chat, Claims, Properties, Questions, People, Checks, Files, Activity: the page's sections, grouped.
 *
 * TABS WITHOUT A SCRIPT (the back office's security policy allows none): every section is still in the page, and a tab is
 * shown by CSS `:target` — a link to a tab, or to anything inside one (#questions, #sources, #chat), opens that tab. With
 * no target, the tab the server chose shows.
 */

import { h, raw, type Safe } from './html.ts';
import { localStamp } from './localtime.ts';
import type { ChecksPanel, StepView } from './approvals.ts';
import type { SourcesPanel } from './research.ts';
import type { QuickAction, SectionContext, SectionSpec, SectionStatus } from './components.ts';
import { section, SECTION_STATUS_WORDS } from './components.ts';
import { clientProgress, whyNotMoved } from './tell-and-move.ts';
import { filesButton } from './client-files-pages.ts';
import type { Db } from '../db.ts';
import type { ClaimSummary } from './crm.ts';
import { claimHref, claimRef, propertyIn } from './components.ts';
import { dueReading } from './localtime.ts';
import { groupBand, lateBadge, noDateBadge, stageGroupOf } from './look.ts';
import { setSubMenu } from './navigation.ts';

export type TabKey = 'chat' | 'claims' | 'properties' | 'questions' | 'people' | 'checks' | 'files' | 'activity';

/** Which tab each section lives in. A section not named here goes under Activity, so nothing is ever lost. */
export const TAB_OF_SECTION: Readonly<Record<string, TabKey>> = Object.freeze({
  chat: 'chat', claims: 'claims', properties: 'properties', questions: 'questions', answers: 'questions',
  details: 'people', contacts: 'people', identity: 'people', checks: 'checks', sources: 'checks', documents: 'files',
  activity: 'activity',
});

export const TABS: readonly (readonly [TabKey, string])[] = Object.freeze([
  ['chat', 'Communication'], ['claims', 'Claims'], ['properties', 'Properties'], ['questions', 'Questions'], ['people', 'People'],
  ['checks', 'Checks'], ['files', 'Files'], ['activity', 'Activity'],
]);

/** The client's six steps as a bar, the current one marked. */
export function progressBar(db: Db, business_id: string): Safe {
  const p = clientProgress(db, business_id);
  return h`<ol class="cprogress" aria-label="Where this client is">${p.steps.map((name, i) => h`<li class="${i < p.at ? 'done' : i === p.at ? 'now' : 'todo'}"${
    i === p.at ? raw(' aria-current="step"') : raw('')}><span class="bar"></span><span class="name">${name}</span></li>`)}</ol>`;
}

/** 1 Oct 2026: the red dot — messages from the client this person has not read, in words for a screen reader. */
export function newDot(n: number): Safe {
  if (n <= 0) return raw('');
  return h` <span class="newdot" aria-label="${n === 1 ? '1 new message' : `${String(n)} new messages`}" title="New from the client">${String(n)}</span>`;
}

/** Chat, Log a call, Files — and the rest under "More". */
export function headerActions(business_id: string, fileCount: number, mayChat: boolean, quick: readonly QuickAction[], fresh = 0): Safe {
  const call = quick.find((q) => /^Log a call/.test(q.label));
  const more = quick.filter((q) => q !== call && !/^(Email the client|Chat)$/.test(q.label));
  return h`<div class="cactions">
    ${mayChat ? h`<a class="cta chatbtn" href="/staff/clients/${business_id}?chat=all#chat">Communication${newDot(fresh)}</a>` : raw('')}
    ${call === undefined ? raw('') : h`<a class="btn" href="${call.href}">Log a call</a>`}
    ${filesButton(business_id, fileCount)}
    ${more.length === 0 ? raw('') : h`<details class="cmore"><summary>More</summary><ul>${more.map((q) => h`<li><a href="${q.href}">${q.label}</a></li>`)}</ul></details>`}
  </div>`;
}

/** Every step, in the order a client goes through them, each with the name of the claim it belongs to. */
function orderedSteps(c: ChecksPanel): (StepView & { readonly claim_name: string | null })[] {
  return [{ ...c.company, claim_name: null }, ...c.claims.flatMap((cl) => cl.steps.map((s) => ({ ...s, claim_name: cl.name })))];
}

/** The next step: ready to tell, or what it still waits for; and any claim whose stage is told but has not moved on. */
export function nextStepCard(db: Db, c: ChecksPanel | null, todayIso: string): Safe {
  if (c === null) return raw('');
  const steps = orderedSteps(c);
  const ready = steps.find((s) => s.state === 'READY_TO_TELL' && s.may_tell);
  // Ready to tell first; then a step with facts waiting to be ticked; then the first not yet told.
  const next = ready ?? steps.find((s) => s.state === 'CHECKING' || s.state === 'RECHECKING') ?? steps.find((s) => s.state !== 'TOLD');
  const blocks = c.claims.map((cl) => ({ name: cl.name, why: whyNotMoved(db, c, cl.id, todayIso) })).filter((b) => b.why !== null);
  const anchor = (s: StepView): string => `step-${s.claim_id ?? 'company'}-${s.key.toLowerCase()}`;
  const body = next === undefined ? h`<p class="cnext-title">Every step so far is told</p><p class="help">The client’s portal shows each one, with its date.</p>`
    : h`<p class="cnext-title">${next.label}${next.claim_name === null ? '' : h` <span class="help">· ${next.claim_name}</span>`}</p>
      ${next.facts.length === 0 ? h`<p class="help">Nothing has come in for this step yet.</p>`
        : h`<ul class="cfacts">${next.facts.slice(0, 6).map((f) => h`<li class="${f.approved !== null ? 'ok' : 'todo'}"><span aria-hidden="true">${f.approved !== null ? '✓' : '○'}</span> ${f.label} <span class="chip">${f.chip}</span></li>`)}${
          next.facts.length > 6 ? h`<li class="help">and ${String(next.facts.length - 6)} more</li>` : raw('')}</ul>`}
      ${ready !== undefined
        ? h`<form method="post" action="/staff/clients/${c.business_id}/steps/tell">
            <input type="hidden" name="back" value="client"><input type="hidden" name="at" value="${anchor(ready)}">
            <input type="hidden" name="step" value="${ready.key}"><input type="hidden" name="claim_id" value="${ready.claim_id ?? ''}">
            <button type="submit" class="cta">Tell the client and move on</button></form>
          <p class="help">Their portal shows it with today’s date and we email them. Where this finishes a claim’s stage, the claim moves on — through its usual checks.</p>`
        : h`<p class="help">${next.facts.length - next.facts.filter((f) => f.approved !== null).length > 0 ? `${String(next.facts.length - next.facts.filter((f) => f.approved !== null).length)} to tick. ` : ''}${
          next.missing > 0 ? `${String(next.missing)} still missing. ` : ''}<a href="#${anchor(next)}">Open the checks</a></p>`}`;
  return h`<section class="cnext" aria-labelledby="cnext-h"><p class="eyebrow" id="cnext-h">Next step</p>${body}
    ${blocks.length === 0 ? raw('') : h`<div class="cblocks">${blocks.map((b) => h`<p><strong>${b.name}:</strong> ${b.why ?? ''}</p>`)}</div>`}</section>`;
}

const STATE_WORDS: Readonly<Record<string, string>> = { FIRED: 'Done', FAILED: 'Failed', NOT_RUN: 'Not run yet', NOT_PERMITTED_YET: 'Waiting' };

/** A lookup's state in words, and its group on the card. */
function lookupWords(r: SourcesPanel['sources'][number], nowIso: string): { group: string; words: string } {
  if (r.state === 'FIRED') return { group: 'Done', words: `Done · ${r.fired_at === null ? '' : localStamp(r.fired_at, nowIso)}` };
  if (r.state === 'NOT_RUN' && !r.switched_on) return { group: 'Not switched on', words: 'Not switched on' };
  const w = STATE_WORDS[r.state] ?? r.state;
  return { group: w, words: w };
}

/** Every lookup and where it stands, at a glance: how many in each state, each lookup under it. The full panel, with its
 *  button and costs, is under Checks. */
export function lookupsCard(src: SourcesPanel | null, nowIso: string): Safe {
  if (src === null) return raw('');
  const rows = src.sources.map((r) => ({ r, ...lookupWords(r, nowIso) }));
  const done = rows.filter((x) => x.r.state === 'FIRED').length;
  const order = ['Failed', 'Done', 'Waiting', 'Not run yet', 'Not switched on'];
  const groups = order.map((g) => ({ g, items: rows.filter((x) => x.group === g) })).filter((x) => x.items.length > 0);
  return h`<section class="clookups" aria-labelledby="clookups-h">
    <p class="eyebrow" id="clookups-h">Lookups <span class="help">${String(done)} of ${String(rows.length)} done</span></p>
    <p class="lk-summary">${groups.map((x) => h`<span class="lk lk-g-${x.g.toLowerCase().replace(/\s+/g, '-')}">${x.g} ${String(x.items.length)}</span>`)}</p>
    <details class="lk-list"><summary>See each lookup</summary>
      <ul>${rows.map((x) => h`<li><span>${x.r.publisher}<span class="help"> · ${x.r.dataset}</span></span> <span class="lk lk-${x.r.state.toLowerCase().replace(/_/g, '-')}${x.group === 'Not switched on' ? ' lk-off' : ''}">${x.words}</span></li>`)}</ul></details>
    <p><a href="#sources">${src.outstanding > 0 && src.rate.allowed ? 'Run the research' : 'Open the lookups'}</a></p></section>`;
}

/** The sections, in their tabs. Inside a tab each keeps its own open-or-closed rule (work open, done folded, the person's
 *  own choice kept), and the one just changed opens, as it always has.
 *
 *  UI TIDY PHASE 8, 3 October 2026 — AN OVERVIEW FIRST. With no tab asked for (`defaultTab` null: a plain visit, no change
 *  just made), no part is open: the page shows one line per part — its name, where it stands, what is happening, its
 *  count — each a link that opens it, as the left-hand menu's entries do. A part opened says how to get back to them all.
 *  After a change, or with a step asked for, the part it was made in opens, as before. Every section is still in the page.
 */
export function tabbed(sections: readonly SectionSpec[], ctx: SectionContext, defaultTab: TabKey | null, fresh = 0): Safe {
  const by = new Map<TabKey, SectionSpec[]>();
  for (const s of sections) {
    const t = TAB_OF_SECTION[s.id] ?? 'activity';
    by.set(t, [...(by.get(t) ?? []), s]);
  }
  const present = TABS.filter(([k]) => (by.get(k) ?? []).length > 0);
  const chosen: TabKey | null = defaultTab === null ? null : present.some(([k]) => k === defaultTab) ? defaultTab : (present[0]?.[0] ?? 'activity');
  const back = ctx.back === null ? raw('') : h`<p class="ctab-back"><a href="${ctx.back}">Every part of this client</a></p>`;
  return h`<div class="ctabwrap">
    <nav class="ctabs" aria-label="Parts of this client">${present.map(([k, label]) => h`<a href="#tab-${k}" class="ctab-link ctl-${k}${k === chosen ? ' is-default' : ''}">${label}${k === 'chat' ? newDot(fresh) : raw('')}</a>`)}</nav>
    ${chosen === null ? partsList(present, by, fresh) : raw('')}
    <div class="ctab-panels">${present.map(([k]) => h`<div class="ctab ct-${k}${k === chosen ? ' is-default' : ''}" id="tab-${k}">${back}${
      (by.get(k) ?? []).map((s) => section(k === 'chat' ? { ...s, open_now: true } : s, ctx))}</div>`)}</div></div>`;
}

const PART_TONE: Readonly<Record<SectionStatus, string>> = Object.freeze({ NOT_STARTED: '', WORKING: ' b-info', WAITING: ' b-warn', DONE: ' b-ok' });
const PART_ORDER: readonly SectionStatus[] = ['WAITING', 'WORKING', 'NOT_STARTED', 'DONE'];

/** One line per part: the most pressing of its sections' states, the first of their "working on" lines, their count. */
function partsList(present: readonly (readonly [TabKey, string])[], by: ReadonlyMap<TabKey, readonly SectionSpec[]>, fresh: number): Safe {
  return h`<ul class="cparts" aria-label="Every part of this client">${present.map(([k, label]) => {
    const secs = by.get(k) ?? [];
    const status = PART_ORDER.find((st) => secs.some((s) => s.status === st)) ?? 'NOT_STARTED';
    const lead = secs.find((s) => s.status === status) ?? secs[0];
    const count = secs.reduce((n, s) => n + (s.count ?? 0), 0);
    return h`<li><a class="cpart" href="#tab-${k}"><span class="cpart-name">${label}${k === 'chat' ? newDot(fresh) : raw('')}${
      count > 0 ? h` <span class="cpart-count">${String(count)}</span>` : raw('')}</span><span class="badge${PART_TONE[status]}">${SECTION_STATUS_WORDS[status]}</span><span class="cpart-what">${lead?.working ?? ''}</span></a></li>`;
  })}</ul>`;
}

/* ================================================================== *
 * UI TIDY PHASE 7, 3 October 2026 — EACH CLAIM IN ITS OWN BOX, AND THE CLIENT'S OWN MENU
 * ================================================================== */

/** "3 days late", "Due today", "No date" — a next step's date as the label the Pipeline uses. */
function dueLabel(due: string | null, nowIso: string): Safe {
  if (due === null) return noDateBadge('No date');
  const r = dueReading(due, nowIso);
  if (r.overdue) { const n = /^(\d+)/.exec(r.words)?.[1] ?? ''; return lateBadge(`${n} ${n === '1' ? 'day' : 'days'} late`); }
  return h`<span class="badge">${r.words === '' ? r.date : r.words}</span>`;
}

/**
 * THE CLAIMS AT THE TOP. Lakhbir opened the wrong one of a client's two claims: each is now a box of its own, headed by its
 * stage in its group's colour and "Claim 1 of 2", named by its site (the company is the page), its number in grey, and its
 * next step in a dark box with when it is due. The box opens the claim inside this page. The id is the old Claims
 * section's, so every link to #claims still lands here.
 */
export function claimBoxes(company: string, claims: readonly ClaimSummary[], nowIso: string): Safe {
  if (claims.length === 0) return h`<section class="claimboxes" id="claims" aria-label="Claims"><p class="empty">No claim yet. Open one from a property.</p></section>`;
  return h`<section class="claimboxes" id="claims" aria-label="Claims">${claims.map((c, i) => {
    const site = propertyIn(company, c.property) ?? 'no property recorded';
    return h`<article class="claimbox">${groupBand(stageGroupOf(c.stage_key), `Claim ${String(i + 1)} of ${String(claims.length)} · ${c.stage}`)}
      <div class="claimbox-body"><h2 class="claimbox-site"><a href="${claimHref(c.business_id, c.id)}">${site}</a></h2>
        <p class="help">${claimRef(c.claim_ref)}${c.town === null ? '' : ` · ${c.town}`}${c.value?.established === true ? ` · range shown ${c.value.shown_range}` : ''}</p>
        <div class="nextbox"><p class="nextbox-h"><span>Next step</span>${c.next_action === null ? raw('') : dueLabel(c.next_action_due, nowIso)}</p>
          <p class="nextbox-t">${c.next_action ?? 'No next step yet — open the claim to set one'}</p></div>
        <p class="claimbox-go"><a class="btn" href="${claimHref(c.business_id, c.id)}">Open the claim</a></p></div></article>`;
  })}</section>`;
}

/** The parts of this page that have something in them, in the tabs' order. */
export function presentTabs(sections: readonly { readonly id: string }[]): (readonly [TabKey, string])[] {
  const used = new Set(sections.map((s) => TAB_OF_SECTION[s.id] ?? 'activity'));
  return TABS.filter(([k]) => used.has(k));
}

/**
 * THE CLIENT'S OWN MENU, opening out under Clients in the left-hand menu (src/web/navigation.ts, `setSubMenu`): the
 * client's name; Overview; each claim by its site and stage (never its number, which is never a link's words — Phase
 * 134) with its next step's lateness; then the page's parts. `current` is the claim open, or null on the company's page.
 */
export function setClientMenu(business_id: string, company: string, claims: readonly ClaimSummary[], parts: readonly (readonly [TabKey, string])[],
  current: string | null, nowIso: string): void {
  const base = `/staff/clients/${business_id}`;
  setSubMenu({
    title: company,
    items: [
      { href: base, label: 'Overview', current: current === null },
      ...claims.map((c) => {
        const r = dueReading(c.next_action_due, nowIso);
        const n = /^(\d+)/.exec(r.words)?.[1] ?? '';
        const late = c.next_action !== null && r.overdue ? `${n} ${n === '1' ? 'day' : 'days'} late` : undefined;
        return { href: claimHref(business_id, c.id), label: `${propertyIn(company, c.property) ?? 'claim'} · ${c.stage}`,
          ...(late === undefined ? {} : { note: late }), current: current === c.id };
      }),
      ...parts.filter(([k]) => k !== 'claims').map(([k, label]) => ({ href: `${base}#tab-${k}`, label })),
    ],
  });
}
