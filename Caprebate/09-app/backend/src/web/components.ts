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
        : stage.kind === 'UNKNOWN' ? badge('Stage not known — nobody has given this claim a stage', 'warn') : raw('');
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
    ${tabs.map((t) => h`<section class="tabpanel" id="${t.id}" aria-label="${t.label}">${t.body}</section>`)}</div>`;
  // PHASE 138: no hidden heading any more. Each panel carried a visually hidden <h2> with the tab's name AND the panel's own
  // heading, so a screen reader heard every name twice. The panel is named by aria-label instead.
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
/**
 * PHASE 153 (28 September 2026) - THE PRIVACY NOTICE AT THE ADDRESS QUESTION, BUILT AND SWITCHED OFF.
 * The free register lookups rest on legitimate interests, and CB_REGISTRY.precondition says they wait on "a published
 * privacy notice reachable from the address question". This is that link. It is drawn only while that same switch is
 * on - there is no second gate - and it informs; it asks nothing (no tick box: the basis is legitimate interests, not
 * consent - standing rule 13(b)). The site file's funnel draws the same words (noticeAtAddress, harness Suite Q7).
 */
export function noticeAtAddress(gate: { readonly enabled: boolean }): Safe {
  if (gate.enabled !== true) return raw('');
  return h`<p class="help" id="q2-notice">We check the address against free public records, so we can fill in some answers for you.
    <a href="/notices/" target="_blank" rel="noopener">Our privacy notice</a> says what we look up, why, and your rights.</p>`;
}

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

/* ================================================================== *
 * PHASE 138 — ONE SECTION, COLOURED, THAT OPENS AND CLOSES. 21 September 2026. "Clean-up 5 of 11."
 *
 * Lakhbir, after using the test site: "The sections within the portal when looking at the clients all seem to blur into
 * one. The different sections should be coloured, in collapsible boxes, and when we are working on a particular section
 * it should show what we are working on, what data is needed and where the data is coming from."
 *
 * EVERY SECTION OF THE CLIENT PAGE AND THE CLAIM PAGE IS DRAWN BY `section`: a coloured band down the left edge, an icon
 * and a word saying what kind of section it is (so colour is never the only signal), a heading, a status chip in words,
 * and the same three lines first — WORKING ON, WE NEED, COMING FROM. It is a <details>, so it opens and closes with no
 * script (the Content-Security-Policy allows none). A Done section starts closed and the section being worked on starts
 * open; a person's own choice, kept on the server per person (src/web/sections.ts), wins over both. Nothing about it is
 * ever in the address.
 *
 * LIKE EVERY COMPONENT HERE IT DECIDES NOTHING ABOUT WHO SEES WHAT: the caller passes only what its view already carries.
 * ================================================================== */

export type SectionKind = 'company' | 'property' | 'facts' | 'documents' | 'money' | 'messages';

/** The word and the icon each kind carries beside its colour. The colours are in src/web/assets.ts, from brand tokens. */
export const SECTION_KINDS: Readonly<Record<SectionKind, { readonly word: string; readonly icon: string }>> = Object.freeze({
  company: { word: 'Company', icon: '<path d="M4 21V5h10v16M14 9h6v12M7 8h3M7 12h3M7 16h3M16.5 13h1.5M16.5 17h1.5M2 21h20"/>' },
  property: { word: 'Property', icon: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>' },
  facts: { word: 'Facts and figures', icon: '<path d="M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8 12l2 2 4-4M8 17h8"/>' },
  documents: { word: 'Documents', icon: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6"/>' },
  money: { word: 'Money', icon: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.6A2.5 2.5 0 0 0 10 10v5.5h5.5M8.5 12.5h4"/>' },
  messages: { word: 'Messages', icon: '<path d="M4 5h16v11H9l-5 4z"/>' },
});

export type SectionStatus = 'NOT_STARTED' | 'WORKING' | 'WAITING' | 'DONE';

export const SECTION_STATUS_WORDS: Readonly<Record<SectionStatus, string>> = Object.freeze({
  NOT_STARTED: 'Not started', WORKING: 'Working on it', WAITING: 'Waiting for the client', DONE: 'Done',
});

const STATUS_TONE: Readonly<Record<SectionStatus, Tone>> = Object.freeze({
  NOT_STARTED: 'plain', WORKING: 'info', WAITING: 'warn', DONE: 'ok',
});

/**
 * ONE THING STILL NEEDED. `ask` is the control that asks the client for it (a form that posts to a route which asks the
 * server again), drawn only for a login that may ask; `asked` says a question is already with the client.
 */
export type Need = { readonly label: string; readonly ask?: Safe; readonly asked?: boolean };

export type SectionSpec = {
  /** The key a person's open-or-closed choice is kept under — one of SECTION_KEYS in src/web/sections.ts. */
  readonly key: string;
  /** The anchor. Unique on the page; the old tab ids are kept so every link and redirect still lands. */
  readonly id: string;
  readonly kind: SectionKind;
  readonly heading: string;
  readonly status: SectionStatus;
  /** WORKING ON — what is being done in this section right now, in a short sentence. */
  readonly working: string;
  /** WE NEED — what is still missing; empty says "Nothing from the client". */
  readonly need: readonly Need[];
  /** COMING FROM — where the facts in this section come from. */
  readonly from: readonly string[];
  readonly count?: number;
  readonly body: Safe;
  /** Open whatever the status, because the page was just sent back here after a change in this section. */
  readonly open_now?: boolean;
};

/** What a page passes to every section: the person's own choices, and the page's address for coming back after one. */
export type SectionContext = { readonly prefs: ReadonlyMap<string, boolean>; readonly back: string | null };

/** How many WE NEED lines are shown before the rest fold under "and N more". */
export const NEEDS_SHOWN = 5;

/** Open, or closed, when the page is drawn: a change just made here, then the person's choice, then the status. */
export function sectionOpens(s: Pick<SectionSpec, 'key' | 'status' | 'open_now'>, prefs: ReadonlyMap<string, boolean>): boolean {
  if (s.open_now === true) return true;
  const mine = prefs.get(s.key);
  if (mine !== undefined) return mine;
  return s.status === 'WORKING' || s.status === 'WAITING';
}

function needLine(n: Need): Safe {
  const label = n.label.charAt(0).toUpperCase() + n.label.slice(1);
  return h`<li>${label}${n.asked === true ? h` ${badge('Asked — waiting', 'warn')}` : n.ask === undefined ? raw('') : h` ${n.ask}`}</li>`;
}

export function section(s: SectionSpec, ctx: SectionContext): Safe {
  const k = SECTION_KINDS[s.kind];
  const open = sectionOpens(s, ctx.prefs);
  const mine = ctx.prefs.get(s.key);
  // One line per thing needed: two sources asking the same question are one need (the first, which carries its ask).
  const needs = s.need.filter((n, i) => s.need.findIndex((o) => o.label.trim().toLowerCase() === n.label.trim().toLowerCase()) === i);
  const shown = needs.slice(0, NEEDS_SHOWN);
  const rest = needs.slice(NEEDS_SHOWN);
  const remember = ctx.back === null ? raw('') : h`<form method="post" action="/staff/me/sections" class="secmem">
      <input type="hidden" name="section" value="${s.key}"><input type="hidden" name="back" value="${ctx.back}"><input type="hidden" name="anchor" value="${s.id}">
      ${mine === undefined
        ? h`<span>Next time:</span> <button class="linkish" type="submit" name="open" value="yes">keep this open for me</button>
            · <button class="linkish" type="submit" name="open" value="no">keep this closed for me</button>`
        : h`<span>You keep this ${mine ? 'open' : 'closed'}.</span> <button class="linkish" type="submit" name="open" value="auto">Let the page decide</button>`}
    </form>`;
  return h`<details class="sec sec-${s.kind}" id="${s.id}" data-section="${s.key}"${open ? raw(' open') : raw('')}>
    <summary><span class="secicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${raw(k.icon)}</svg></span>
      <span class="seckind">${k.word}</span>
      <h2>${s.heading}${s.count === undefined ? raw('') : h` <span class="count">${s.count}</span>`}</h2>
      ${badge(SECTION_STATUS_WORDS[s.status], STATUS_TONE[s.status])}</summary>
    <div class="secbody">
      <dl class="three">
        <dt>Working on</dt><dd>${s.working}</dd>
        <dt>We need</dt><dd>${needs.length === 0 ? h`Nothing from the client.`
          : h`<ul class="needs">${shown.map(needLine)}</ul>${rest.length === 0 ? raw('')
            : h`<details class="more"><summary>and ${rest.length} more</summary><ul class="needs">${rest.map(needLine)}</ul></details>`}`}</dd>
        <dt>Coming from</dt><dd>${s.from.length === 0 ? h`Our own records.` : s.from.join(', ')}</dd>
      </dl>
      ${s.body}
      ${remember}
    </div></details>`;
}

/** "MORE DETAIL" — what a person does not need every week, folded under one quiet line. No script. */
export function moreDetail(body: Safe, label = 'More detail'): Safe {
  return h`<details class="more"><summary>${label}</summary><div class="moretext">${body}</div></details>`;
}

/** A section's status from what it still needs: nothing left is Done, everything asked is Waiting, anything unasked is Working. */
export function statusFromNeeds(need: readonly Need[], started: boolean): SectionStatus {
  if (need.length === 0) return started ? 'DONE' : 'NOT_STARTED';
  return need.every((n) => n.asked === true) ? 'WAITING' : 'WORKING';
}
