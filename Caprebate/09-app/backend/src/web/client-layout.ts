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
import type { QuickAction, SectionContext, SectionSpec } from './components.ts';
import { section } from './components.ts';
import { clientProgress, whyNotMoved } from './tell-and-move.ts';
import { filesButton } from './client-files-pages.ts';
import type { Db } from '../db.ts';

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
 *  own choice kept), and the one just changed opens, as it always has. */
export function tabbed(sections: readonly SectionSpec[], ctx: SectionContext, defaultTab: TabKey, fresh = 0): Safe {
  const by = new Map<TabKey, SectionSpec[]>();
  for (const s of sections) {
    const t = TAB_OF_SECTION[s.id] ?? 'activity';
    by.set(t, [...(by.get(t) ?? []), s]);
  }
  const present = TABS.filter(([k]) => (by.get(k) ?? []).length > 0);
  const chosen = present.some(([k]) => k === defaultTab) ? defaultTab : (present[0]?.[0] ?? 'activity');
  return h`<div class="ctabwrap">
    <nav class="ctabs" aria-label="Parts of this client">${present.map(([k, label]) => h`<a href="#tab-${k}" class="ctab-link ctl-${k}${k === chosen ? ' is-default' : ''}">${label}${k === 'chat' ? newDot(fresh) : raw('')}</a>`)}</nav>
    <div class="ctab-panels">${present.map(([k]) => h`<div class="ctab ct-${k}${k === chosen ? ' is-default' : ''}" id="tab-${k}">${
      (by.get(k) ?? []).map((s) => section(k === 'chat' ? { ...s, open_now: true } : s, ctx))}</div>`)}</div></div>`;
}
