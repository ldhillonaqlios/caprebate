/**
 * ONE SET OF COMPONENTS — PHASE 133a, 17 September 2026.
 *
 * The building blocks every redesigned screen draws with: a card, a badge, an empty state, a highlights panel, the
 * stage bar, record tabs, the record layout with its right-hand panel, and the pipeline board. Every one is built with
 * `h`, so every value is escaped on output, and every visual is a class in the one served stylesheet — there is no
 * style attribute and no script anywhere in this file.
 *
 * WHAT A COMPONENT NEVER DOES: read the database, or decide what a login may see. It draws what the caller's view
 * already carries, and a field the view does not carry is simply not drawn.
 */

import { h, raw, type Safe } from './html.ts';
import { plainNeed } from './next-step.ts';
import type { Actor } from '../authz.ts';

export type Tone = 'ok' | 'warn' | 'stop' | 'info' | 'plain';

/** A badge ALWAYS carries words; the tone only repeats them. */
export function badge(words: string, tone: Tone = 'plain'): Safe {
  return h`<span class="badge${tone === 'plain' ? '' : ` b-${tone}`}">${words}</span>`;
}

export function card(heading: string, body: Safe | readonly Safe[], opts: { count?: string | number; id?: string; href?: string } = {}): Safe {
  const head = opts.href === undefined ? h`${heading}` : h`<a href="${opts.href}">${heading}</a>`;
  return h`<section class="card"${opts.id === undefined ? raw('') : h` id="${opts.id}"`}><div class="card-h"><h2>${head}</h2>${
    opts.count === undefined ? raw('') : h`<span class="count">${opts.count}</span>`}</div>${body}</section>`;
}

export function emptyState(sentence: string, action?: { href: string; label: string }): Safe {
  return h`<p class="empty">${sentence}${action === undefined ? raw('') : h` <a href="${action.href}">${action.label}</a>`}</p>`;
}

export type Highlight = { readonly label: string; readonly value: Safe | string };

/**
 * THE HIGHLIGHTS PANEL: the record type, its name, and the key fields — only those the caller's view carries.
 * PHASE 134: `sub` is one small line under the name — a company's legal name, a claim's property and reference.
 */
export function highlights(kind: string, title: Safe | string, fields: readonly (Highlight | null)[], after: Safe = raw(''), sub: Safe = raw('')): Safe {
  const shown = fields.filter((f): f is Highlight => f !== null);
  return h`<header class="highlights"><p class="eyebrow">${kind}</p><h1>${title}</h1>${sub.html === '' ? raw('') : h`<p class="subhead">${sub}</p>`}
    ${shown.length === 0 ? raw('') : h`<dl class="hl">${shown.map((f) => h`<div><dt>${f.label}</dt><dd>${f.value}</dd></div>`)}</dl>`}${after}</header>`;
}

/* ================================================================== *
 * PHASE 134 — THE CLIENT IS THE COMPANY. 18 September 2026.
 *
 * A claim is named for a person by its COMPANY, then its PROPERTY. The claim reference (CR-2026-0001) is a small grey
 * label beside it: never a heading, never the first column, never the words of a link. Every screen that names a claim
 * draws it through these, and test/phase134.test.ts reads every staff screen's HTML to hold that.
 * ================================================================== */

/** The claim reference, as a small grey label. */
export function claimRef(ref: string): Safe {
  return h`<span class="claimref">${ref}</span>`;
}

/**
 * A claim's name in words: "Elverton Private Hospital Limited — outpatient annexe". A property recorded with the company's
 * name already in front of it ("Elverton Private Hospital Limited — main site") is not given the name twice.
 */
export function claimName(company: string, property: string | null | undefined): string {
  if (property === null || property === undefined || property.trim() === '') return `${company} — claim`;
  return property.startsWith(company) ? property : `${company} — ${property}`;
}

/**
 * A property's name INSIDE its company's frame — a tile, a breadcrumb — where the company is already said. A label
 * recorded as "Elverton Private Hospital Limited — main site" reads "main site" there.
 */
export function propertyIn(company: string, property: string | null): string | null {
  if (property === null) return null;
  const prefix = `${company} — `;
  return property.startsWith(prefix) && property.length > prefix.length ? property.slice(prefix.length) : property;
}

/** A link to a claim: the company and the property are the words; the reference follows it, in grey. */
export function claimLink(href: string, company: string, property: string | null | undefined, ref: string): Safe {
  return h`<a href="${href}">${claimName(company, property)}</a> ${claimRef(ref)}`;
}

/** Where a claim opens inside its company's page. */
export function claimHref(business_id: string, claim_id: string): string {
  return `/staff/clients/${business_id}/claims/${claim_id}`;
}

/** "Company > Claim": the company is always the frame. The company is a link only for a login that may open its page. */
export function breadcrumb(parts: readonly { readonly label: string; readonly href?: string | null }[]): Safe {
  return h`<nav class="crumbs" aria-label="Where you are"><ol>${parts.map((p, i) => i === parts.length - 1
    ? h`<li><span aria-current="page">${p.label}</span></li>`
    : h`<li>${p.href === undefined || p.href === null ? h`${p.label}` : h`<a href="${p.href}">${p.label}</a>`}</li>`)}</ol></nav>`;
}

export type ClaimTile = {
  readonly href: string | null;
  readonly property: string | null;
  readonly town: string | null;
  readonly stage: string;
  readonly next_action: string | null;
  readonly next_due?: string | null;
  readonly ref: string;
};

/** ONE TILE PER CLAIM: the property and its town, the stage, the next action, and the reference in grey. */
export function claimTiles(tiles: readonly ClaimTile[], empty: string): Safe {
  if (tiles.length === 0) return h`<p class="empty">${empty}</p>`;
  return h`<ul class="tiles">${tiles.map((t) => {
    const name = t.property === null || t.property.trim() === '' ? 'No property recorded' : t.property;
    return h`<li class="tile">
      <p class="tilename">${t.href === null ? h`${name}` : h`<a href="${t.href}">${name}</a>`}</p>
      ${t.town === null || t.town.trim() === '' ? raw('') : h`<p class="help">${t.town}</p>`}
      <p>${badge(t.stage, 'info')}</p>
      <p class="tilenext">${t.next_action === null ? h`<span class="help">No next action yet</span>`
        : h`Next: ${t.next_action}${t.next_due === undefined || t.next_due === null || t.next_due === '' ? raw('') : h` <span class="help">— ${t.next_due}</span>`}`}</p>
      <p>${claimRef(t.ref)}</p></li>`;
  })}</ul>`;
}

/**
 * THE CLAIM'S STAGE BAR — the operating procedure's ten stages, then Closed.
 *
 * IT DRAWS THE CLAIM VIEW'S OWN READING AND DECIDES NOTHING. `stage` and `steps` are `pipeline.stage` and
 * `pipeline.steps` from the claim's view (src/web/pipeline.ts), which read the claim's stored `stage`: each step is done,
 * current, exited or to do there, and this only draws it. A claim on hold shows the stage it returns to as current and a
 * badge saying it is on hold; a claim that left the procedure marks where it left, with a badge naming the exit; a
 * closed claim has every step done. An unrecognised stage has no steps, and the bar says so (N4: never a
 * favourable-looking default).
 *
 * `gate` is the gate out of the current stage, where the view carries one (only for a login that works the pipeline).
 * The words are in the markup for a screen reader ("done", "current stage", "to do"); the shape and colour repeat them.
 */
export function claimStageBar(
  stage: { readonly key: string | null; readonly kind: string; readonly label: string },
  steps: readonly { readonly key: string; readonly label: string; readonly state: string }[],
  gate?: { readonly label: string; readonly open: boolean; readonly needs: readonly { readonly met: boolean; readonly what: string }[] },
): Safe {
  const note = stage.kind === 'ON_HOLD' ? badge('On hold', 'warn')
    : stage.kind === 'EXIT' ? badge(`Left the procedure: ${stage.label}`, 'stop')
      : stage.kind === 'CLOSED' ? badge('Closed', 'ok')
        : stage.kind === 'UNKNOWN' ? badge('Stage not recognised — nobody has placed this claim in the procedure', 'warn') : raw('');
  const missing = gate?.needs.find((n) => !n.met);
  // PHASE 133c — "A STOP IS INFORMATION, NOT A FAILURE" (brand book slide 49). A gate that is not yet open reads "Not ready
  // yet" in a neutral badge, never "shut" in red; the first thing still needed is said in plain words (src/web/next-step.ts).
  const plain = missing === undefined ? undefined : plainNeed(missing.what).words;
  return h`<nav class="stagebar" aria-label="The claim's stage in the operating procedure">${steps.length === 0 ? raw('') : h`<ol>${steps.map((s) =>
    s.state === 'current' ? h`<li class="current" aria-current="step" data-stage="${s.key}"><span class="vh">Current stage: </span>${s.label}</li>`
      : s.state === 'exited' ? h`<li class="current" aria-current="step" data-stage="${s.key}"><span class="vh">Left the procedure at: </span>${s.label}</li>`
        : s.state === 'done' ? h`<li class="done" data-stage="${s.key}"><span class="vh">Done: </span>${s.label}</li>`
          : h`<li class="todo" data-stage="${s.key}"><span class="vh">To do: </span>${s.label}</li>`)}</ol>`}
    <p class="gateline"><span>Stage: <strong>${stage.label}</strong></span>${note}${gate === undefined ? raw('')
      : h`<span>Moving on from ${gate.label}: ${gate.open ? badge('Ready', 'ok') : badge('Not ready yet')}${plain === undefined ? raw('')
        : h` <span class="help">Still needed: ${plain}</span>`}</span>`}</p></nav>`;
}

/** THE CLIENT'S STAGE BAR — the six client-facing steps the portal already reads, never the ten staff stages. */
export function clientStageBar(steps: readonly { readonly label: string; readonly state: string }[]): Safe {
  return h`<nav class="stagebar" aria-label="Where your claim is"><ol>${steps.map((s) => s.state === 'current'
    ? h`<li class="current" aria-current="step"><span class="vh">You are here: </span>${s.label}</li>`
    : s.state === 'done' ? h`<li class="done"><span class="vh">Done: </span>${s.label}</li>`
      : h`<li class="todo"><span class="vh">Still to come: </span>${s.label}</li>`)}</ol></nav>`;
}

/**
 * A TAB'S id IS ITS ANCHOR. The four record pages use details, related and activity; Phase 133b's screens name their own
 * (a business page's sources, a survey job's figures, finance's VAT). An id must be unique on its page and must not be an
 * id a form field already uses — the phase133b test opens every tab link and finds its panel.
 */
export type RecordTab = { readonly id: string; readonly label: string; readonly count?: number; readonly body: Safe };

/** How many tabs or sections the stylesheet can mark as current, by position (src/web/assets.ts). */
export const MAX_TABS = 24;

/**
 * RECORD TABS THAT NEED NO SCRIPT. Each tab is a link to its panel's anchor; the stylesheet shows the targeted panel and
 * shows the first when none is targeted. Without CSS, or in a browser without `:has()`, all panels show one after the
 * other with their headings — so nothing on the page is ever unreachable.
 */
export function recordTabs(tabs: readonly RecordTab[]): Safe {
  if (tabs.length > MAX_TABS) throw new Error(`recordTabs: ${tabs.length} tabs, and the stylesheet marks at most ${MAX_TABS}`);
  return h`<div class="tabset"><ul class="rtabs">${tabs.map((t) => h`<li><a href="#${t.id}">${t.label}${
    t.count === undefined ? raw('') : h`<span class="count">${t.count}</span>`}</a></li>`)}</ul>
    ${tabs.map((t) => h`<section class="tabpanel" id="${t.id}"><h2 class="panelhead">${t.label}</h2>${t.body}</section>`)}</div>`;
}

/**
 * A SETTINGS SCREEN'S LEFT-HAND SECTION LIST — PHASE 133b. The same mechanism as the record tabs, drawn as a list down the
 * left: each entry links to its section's anchor, the stylesheet shows the targeted section and the first when none is.
 * Without CSS, or without `:has()`, every section shows one after the other under its own heading, so a browser's find
 * still reaches every row. Below 960 px the list sits above the sections.
 */
export function sectionList(label: string, sections: readonly RecordTab[]): Safe {
  if (sections.length > MAX_TABS) throw new Error(`sectionList: ${sections.length} sections, and the stylesheet marks at most ${MAX_TABS}`);
  return h`<div class="tabset seclayout"><nav class="seclist" aria-label="${label}"><ul class="rtabs vtabs">${sections.map((t) => h`<li><a href="#${t.id}">${t.label}${
    t.count === undefined ? raw('') : h`<span class="count">${t.count}</span>`}</a></li>`)}</ul></nav>
    <div class="secpanels">${sections.map((t) => h`<section class="tabpanel card" id="${t.id}"><h2 class="sechead">${t.label}</h2>${t.body}</section>`)}</div></div>`;
}

export type QuickAction = { readonly href: string; readonly label: string };

/**
 * The right-hand panel: PHASE 133c puts the next STEP first where the page has one (a claim's move, a lead's checks), then
 * the next action, then quick actions. A quick action is passed only when its form is on the page.
 */
export function sidePanel(next: Safe | null, actions: readonly QuickAction[], extra: Safe = raw(''), step: Safe = raw('')): Safe {
  return h`<aside class="side" aria-label="Next step, next action and quick actions">
    ${step}
    ${next === null ? raw('') : card('Next action', next)}
    ${actions.length === 0 ? raw('') : card('Quick actions', h`<ul class="quick">${actions.map((a) => h`<li><a href="${a.href}">${a.label}</a></li>`)}</ul>`)}
    ${extra}</aside>`;
}

export function recordLayout(main: Safe, side: Safe): Safe {
  return h`<div class="record"><div class="main">${main}</div>${side}</div>`;
}

/* ================================================================== *
 * PHASE 133c — A NEW USER CAN USE IT. 17 September 2026.
 * ================================================================== */

/**
 * "WHY?" — THE EXPLANATION BEHIND A SMALL TOGGLE. A field keeps one short label and one short value; the sentence that
 * used to sit under it moves in here. It is a <details>, so it needs no script, and with the stylesheet off it reads as
 * the sentence it always was. Nothing is removed: the words are still on the page.
 */
export function why(text: Safe | string): Safe {
  return h`<details class="why"><summary>Why?</summary><span class="whytext">${text}</span></details>`;
}

/**
 * A FIELD THAT IS SHOWN ONLY WHEN IT HAS A VALUE (B3). `value` null, undefined or '' is an EMPTY ROW and is not drawn.
 * `keep: true` is for an answer that is "not known" and decides something — the enquiry checks and the claim's facts —
 * which is an answer, not an empty row, and is always drawn.
 */
export type Field = { readonly label: string; readonly value: Safe | string | null | undefined; readonly why?: Safe | string; readonly keep?: boolean };

/**
 * THE WORDS A STORE USES FOR "NOTHING HERE". A value that reads only one of these is an empty row. "Not known" is NOT
 * in this list: where it is an answer that decides something, the caller keeps the row.
 */
export const EMPTY_WORDS: readonly string[] = Object.freeze([
  'not recorded', 'none recorded', 'not on hold', 'not lost', 'nobody yet', 'none named', 'not set', 'none', '—',
]);

export function isEmptyValue(v: Safe | string | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  const text = (typeof v === 'string' ? v : v.html).replace(/<[^>]*>/g, '').trim().toLowerCase();
  return text === '' || EMPTY_WORDS.includes(text);
}

/** The fields that have a value, as a definition list; and, where any were hidden and a form exists, one link to it. */
export function fields(rows: readonly (Field | null)[], add?: { href: string; label?: string }): Safe {
  const shown = rows.filter((r): r is Field => r !== null && (r.keep === true || !isEmptyValue(r.value)));
  const hidden = rows.filter((r) => r !== null && r.keep !== true && isEmptyValue(r.value)).length;
  return h`${shown.length === 0 ? raw('') : h`<dl>${shown.map((r) => h`<dt>${r.label}</dt><dd>${r.value ?? ''}${r.why === undefined ? raw('') : why(r.why)}</dd>`)}</dl>`}${
    hidden > 0 && add !== undefined ? h`<p><a href="${add.href}">${add.label ?? 'Add missing details'}</a></p>` : raw('')}`;
}

/**
 * THE NAME A PERSON READS, IN WORDS QUOTED FROM A PROJECT DOCUMENT. src/web/stages.ts quotes the operating procedure
 * verbatim, and test/pipeline.test.ts proves it against the procedure's file, so the words stay "Caprebate" there. Where
 * a screen shows them, they are shown with the brand's name, "Cap Rebate" (brand book slide 1). A file name is left alone.
 */
export function brandName(text: string): string {
  return text.replace(/Caprebate(?![-\w]*\.(?:md|html|docx|cjs|ts|csv))(?![-\w])/g, 'Cap Rebate');
}

/** After a save: a clear message at the top of the page. `role="status"` so a screen reader hears it. */
export function savedMessage(words = 'Saved.'): Safe {
  return h`<p class="saved" role="status">${words}</p>`;
}

/**
 * "THE DATA THIS PAGE WAS BUILT FROM" IS A DEVELOPER'S LINK (B8), shown to Admin only. The address itself is unchanged
 * and still answers every login that could open it before — this hides a link, it refuses nothing.
 */
export function dataLink(actor: Actor, href: string): Safe {
  return actor.role === 'ADMIN' ? h`<p class="help"><a href="${href}">The data this page was built from</a></p>` : raw('');
}

/**
 * THE NEXT STEP, FIRST (B2). Either "Next step: Move to <stage>" as the button that makes the move, or "Not ready yet"
 * with the first thing still needed in plain words and the one action that fixes it. The server asks the gate again on
 * the move, whatever this card shows.
 */
export function nextStepCard(step:
  | { readonly kind: 'move'; readonly action: string; readonly to: string; readonly label: string; readonly hidden?: Readonly<Record<string, string>> }
  | { readonly kind: 'wait'; readonly needed: string; readonly fix: { readonly href: string; readonly label: string } | null; readonly more: string }
  | { readonly kind: 'go'; readonly words: string; readonly href: string; readonly label: string }
  | { readonly kind: 'none'; readonly words: string }): Safe {
  if (step.kind === 'go') {
    return h`<section class="card nextstep"><div class="card-h"><h2>Next step</h2></div><p>${step.words}</p>
      <p><a class="btn btn-primary" href="${step.href}">${step.label}</a></p></section>`;
  }
  if (step.kind === 'move') {
    return h`<section class="card nextstep"><div class="card-h"><h2>Next step</h2></div>
      <form method="post" action="${step.action}"><input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${step.to}">${
        Object.entries(step.hidden ?? {}).map(([k, v]) => h`<input type="hidden" name="${k}" value="${v}">`)}
        <button type="submit">Move to ${step.label}</button></form></section>`;
  }
  if (step.kind === 'wait') {
    return h`<section class="card nextstep"><div class="card-h"><h2>Next step</h2></div>
      <p>${badge('Not ready yet')}</p><p class="needed">${step.needed}</p>
      ${step.fix === null ? raw('') : h`<p><a class="btn btn-primary" href="${step.fix.href}">${step.fix.label}</a></p>`}
      <p><a href="${step.more}">See everything this stage needs</a></p></section>`;
  }
  return h`<section class="card nextstep"><div class="card-h"><h2>Next step</h2></div><p>${step.words}</p></section>`;
}

export type Job = { readonly href: string; readonly label: string };

/**
 * THE WELCOME CARD (B5). Shown on Home to a login that has not dismissed it: that login's three most frequent jobs as
 * buttons, and a button that dismisses it for good. The dismissal is stored on the user and audited
 * (src/web/welcome.ts); the card never comes back once it is gone.
 */
export function welcomeCard(jobs: readonly Job[], dismissAction: string): Safe {
  return h`<section class="card welcome" aria-labelledby="welcome-h"><div class="card-h"><h2 id="welcome-h">Welcome to Cap Rebate</h2></div>
    <p>What you will do most here:</p>
    <p class="jobs">${jobs.map((j) => h`<a class="btn btn-primary" href="${j.href}">${j.label}</a>`)}</p>
    <p class="help">The Help link at the top of every page opens the training for the screen you are on.</p>
    <form method="post" action="${dismissAction}"><button type="submit" class="btn-quiet">Hide this welcome</button></form></section>`;
}
