/**
 * THE SURVEY PACK'S PAGES — chapters on the left, the book in the middle, the totals and the changes on the right.
 * 1 October 2026; the layout Lakhbir approved as a mock-up that day.
 *
 *   GET  /staff/survey/{job}/pack?ch=10[&edit=LINE|&add=1]    a chapter (an edit form opens in place, no script)
 *   POST /staff/survey/{job}/pack/value      one of the four values that belong to the whole pack
 *   POST /staff/survey/{job}/pack/line       a line's how much, rate, share and pool
 *   POST /staff/survey/{job}/pack/revert     our draft back on a line
 *   POST /staff/survey/{job}/pack/remove     take a line out
 *   POST /staff/survey/{job}/pack/restore    put it back
 *   POST /staff/survey/{job}/pack/add        add a line
 *   POST /staff/survey/{job}/pack/property   say which property the pack is for
 *   POST /staff/survey/{job}/pack/legal      answer one of the legal check's questions (chapter 7)
 *   POST /staff/survey/{job}/pack/details    the surveyor's RICS number and firm (chapter 23)
 *   POST /staff/survey/{job}/pack/approve    the one click: approve this exact state of the pack (chapter 23)
 *   GET  /staff/survey/{job}/pack/version/N  an approved version, exactly as it was approved, and whether its fingerprint holds
 *
 * Opening a chapter is recorded for the assigned surveyor: the Approve button stays grey until every built chapter
 * has been opened (src/web/pack-approve.ts).
 *
 * Every number on these pages says where it came from: the evidence, our draft, or the surveyor's own name. Every form
 * carries the pack's counter (`seq`), so a change from an out-of-date page is refused, never applied blind.
 */
import { VAT_POSITION_WORDS } from './pack-vat.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as P from './survey-pack.ts';
import * as L from './pack-legal.ts';
import * as A from './pack-approve.ts';
import { sendPanel } from './report-pages.ts';
import { inspectionChapter, lineEvidence } from './evidence-pages.ts';
import { basisOf, evidenceByLine } from './survey-evidence.ts';
import { findingSeen } from './finding-source.ts';
import { fetchSitePlan, pickWords, sitePlanOf, sitePlanSvg } from './site-plan.ts';
import { percentWords, poundsWords, quantityWords, type Source, type Valued } from './pack-sums.ts';

export type PackPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

export { CHAPTERS } from './pack-chapters.ts';
import { CHAPTERS } from './pack-chapters.ts';
import * as S from './surveyor.ts';
import { jobSite, setJobMenu } from './surveyor-pages.ts';
import { lateBadge, siteOf } from './look.ts';
import { PAYER_CLASSES } from './claim-facts.ts';
import { deskFirstReading } from './desk-first.ts';
import { roomsFor } from './rooms.ts';
import { REPORT_ASSUMPTIONS } from './report-assumptions.ts';
import { TEST_DEFAULT_WORDS } from './pack-lines.ts';
import { packSheet, SHEET_CHAPTERS, type SheetRow } from './pack-sheets.ts';
import { INCLUDES_WORDS } from './pack-cost-model.ts';
import { savePackWords, WORD_FIELDS } from './pack-words.ts';

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

const base = (job: string) => `/staff/survey/${job}/pack`;

export async function handleSurveyPack(
  d: PackPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const deps: P.PackDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const vm = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack\/version\/(\d{1,6})$/.exec(url.pathname);
  if (vm !== null) {
    if (method !== 'GET') return 'not-mine';
    const job = vm[1] ?? '';
    const v = P.packView(deps, actor, job);
    const kept = A.approvedVersion(deps, actor, job, Number(vm[2]));
    if (kept === null) return d.problem(res, actor, 'No such version', 'This pack has no approved version with that number.', `${base(job)}?ch=23`);
    res.writeHead(200, HTML_HEADERS);
    res.end(versionPage(d, actor, v, kept));
    return 'handled';
  }
  const m = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack(\/value|\/extra|\/line|\/revert|\/remove|\/restore|\/add|\/property|\/legal|\/details|\/approve|\/site-plan|\/words)?$/.exec(url.pathname);
  if (m === null) return 'not-mine';
  const job = m[1] ?? '';
  const act = m[2]?.slice(1);

  if (act === undefined && method === 'GET') {
    const v = P.packView(deps, actor, job);
    const asked = Number(url.searchParams.get('ch') ?? '10');
    const ch = CHAPTERS.some((c) => c.n === asked) ? asked : 10;
    const lv = L.legalView(deps, actor, job);
    // Opening the chapter is what counts towards approval — only the assigned surveyor's, and only a built chapter.
    if (CHAPTERS.find((c) => c.n === ch)?.built === true) A.recordRead(deps, actor, job, ch, lv.seq);
    const ready = A.readiness(deps, actor, job, v, lv);
    res.writeHead(200, HTML_HEADERS);
    res.end(packPage(d, actor, v, lv, ready, ch, url.searchParams));
    return 'handled';
  }
  if (act === undefined || method !== 'POST') return 'not-mine';

  const f = await form(req);
  const ch = /^\d{1,2}$/.test(f.get('ch') ?? '') ? f.get('ch') as string : '10';
  const back = (extra = '') => `${base(job)}?ch=${ch}${extra}`;
  const seq = f.get('seq') ?? '';
  const reason = f.get('reason') ?? '';
  const line = f.get('line') ?? '';
  if (act === 'approve') {
    const r = A.approvePack(deps, actor, job, { seq, legal_seq: f.get('legal_seq') ?? '' });
    if (!r.ok && r.stale === true) { redirect(res, `${base(job)}?ch=23&stale=1`); return 'handled'; }
    if (!r.ok) return d.problem(res, actor, 'Not approved', r.why, `${base(job)}?ch=23`);
    redirect(res, `${base(job)}?ch=23&done=approved&v=${String(r.version ?? '')}`);
    return 'handled';
  }
  if (act === 'site-plan') {
    // 2 Oct 2026, stage 6: the site plan for the report's cover, from Ordnance Survey's free maps (src/web/site-plan.ts).
    const r = await fetchSitePlan({ db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId, transport: d.app.outside, secrets: d.app.secrets }, actor, job);
    if (!r.ok) return d.problem(res, actor, 'No site plan', r.why, `${base(job)}?ch=9#site-plan`);
    redirect(res, `${base(job)}?ch=9&done=plan#site-plan`);
    return 'handled';
  }
  let r: P.PackResult;
  switch (act) {
    case 'value': r = P.savePackValue(deps, actor, job, { field: f.get('field') ?? '', value: f.get('value') ?? '', reason, seq }); break;
    case 'extra': r = P.savePackExtra(deps, actor, job, { field: f.get('field') ?? '', value: f.get('value') ?? '', reason, seq }); break;
    // PHASE 153g: the surveyor's own words in chapters 5, 8, 11, 14, 16, 19, 20 and 22 (src/web/pack-words.ts).
    case 'words': r = savePackWords(deps, actor, job, { field: f.get('field') ?? '', words: f.get('words') ?? '', reason, seq }); break;
    case 'line': r = P.saveLine(deps, actor, job, { line, qty: f.get('qty') ?? '', rate: f.get('rate') ?? '', qpct: f.get('qpct') ?? '', pool: f.get('pool') ?? '', reason, seq }); break;
    case 'revert': r = P.revertLine(deps, actor, job, { line, reason, seq }); break;
    case 'remove': r = P.setLineRemoved(deps, actor, job, { line, reason, seq }, true); break;
    case 'restore': r = P.setLineRemoved(deps, actor, job, { line, reason, seq }, false); break;
    case 'add': r = P.addLine(deps, actor, job, { label: f.get('label') ?? '', unit: f.get('unit') ?? '', qty: f.get('qty') ?? '', rate: f.get('rate') ?? '', qpct: f.get('qpct') ?? '', pool: f.get('pool') ?? '', reason, seq }); break;
    case 'details': r = A.saveDetails(deps, actor, job, { rics_number: f.get('rics_number') ?? '', firm: f.get('firm') ?? '' }); break;
    case 'legal': r = L.answerLegal(deps, actor, job, { question: f.get('question') ?? '', values: f.getAll('answer'), source: f.get('source') ?? '', seq }); break;
    default: r = P.choosePackProperty(deps, actor, job, f.get('property_id') ?? '');
  }
  if (!r.ok && r.stale === true) { redirect(res, back('&stale=1')); return 'handled'; }
  if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, act === 'details' ? `${base(job)}?ch=23&details=1#details` : back(line === '' ? '' : `&edit=${encodeURIComponent(line)}#l-${line}`), r.field);
  redirect(res, back(`&done=saved${line === '' ? '' : `#l-${line}`}`));
  return 'handled';
}

/* ================================================================== *
 * THE PAGE
 * ================================================================== */

/** A value's source, as a small label: the evidence, our draft, or the surveyor's name and time. */
function sourceTag(d: PackPageDeps, s: Source | null, short = false): Safe {
  if (s === null) return h`<span class="pk-src pk-need">needed</span>`;
  if (s.kind === 'EVIDENCE') return h`<span class="pk-src pk-ev">${short ? 'Evidence' : s.text}</span>`;
  if (s.kind === 'DRAFT') return h`<span class="pk-src pk-dr">Our draft</span>`;
  // In a table cell, the surveyor's name; the time is in the list of changes beside it.
  return h`<span class="pk-src pk-sv">${s.by_name ?? s.text}${short || s.at === null || s.at === undefined ? '' : ` · ${d.stamp(s.at)}`}</span>`;
}

function valueCell(d: PackPageDeps, v: Valued, words: (n: number | null) => string): Safe {
  return h`<td class="n">${v.value === null ? h`<span class="pk-gap">—</span>` : words(v.value)}<br>${sourceTag(d, v.source, true)}</td>`;
}

const PENCE = (n: number | null) => poundsWords(n);
const QTY = (n: number | null) => quantityWords(n);
const PCT = (n: number | null) => percentWords(n);

function hidden(v: P.PackView, ch: number): Safe {
  return h`<input type="hidden" name="seq" value="${String(v.seq)}"><input type="hidden" name="ch" value="${String(ch)}">`;
}

function packPage(d: PackPageDeps, actor: Actor, v: P.PackView, lv: L.LegalView, ready: A.Readiness, ch: number, q: URLSearchParams): string {
  const s = v.sums;
  const chapter = CHAPTERS.find((c) => c.n === ch) ?? CHAPTERS[9]!;
  const notes: Safe[] = [];
  if (q.get('done') === 'approved') notes.push(h`<div class="gate" role="status">Approved. The report is kept exactly as it stands, with its fingerprint.</div>`);
  if (q.get('done') === 'saved') notes.push(h`<div class="gate" role="status">Saved, under your name. Every total follows.</div>`);
  if (q.get('done') === 'plan') notes.push(h`<div class="gate" role="status">Site plan fetched. It goes on the report’s cover when you approve.</div>`);
  if (q.get('stale') === '1') notes.push(h`<div class="gate" role="alert"><strong>This pack changed since you opened it.</strong> Here it is again with that change. Make yours again if it still applies.</div>`);
  const body = h`
    ${notes}
    ${packHead(d.app, actor, v, ch)}
    ${v.property === null ? propertyChooser(v, ch) : raw('')}
    <div class="pack">
      <nav class="pack-ch" aria-label="The pack's chapters"><p class="pack-ch-h">The pack · ${String(CHAPTERS.length)} chapters</p>
        <ol>${CHAPTERS.map((c) => h`<li><a href="${base(v.job.id)}?ch=${String(c.n)}"${c.n === ch ? raw(' aria-current="page"') : raw('')}${c.built ? raw('') : raw(' class="pk-later"')}>${String(c.n)} · ${c.title}${opened(ready, c.n) ? h` <span class="pk-tick" title="Opened">✓</span>` : raw('')}</a></li>`)}</ol>
        <p class="pk-key"><span class="pk-src pk-ev">Evidence</span> <span class="pk-src pk-dr">Our draft</span> <span class="pk-src pk-sv">The surveyor</span> <span class="pk-src pk-need">needed</span></p>
      </nav>
      <article class="pack-book">
        <h1>${String(chapter.n)} · ${chapter.title}</h1>
        ${ch === 4 ? summaryChapter(v) : ch === 7 ? legalChapter(d, v, lv, ch, q) : ch === 9 ? inputsChapter(d, v, ch, q) : ch === 10 ? elementsChapter(d, v, ch, q)
          : ch === 15 ? h`${grantsChapter(v)}${vatSection(d, v, ch)}`
          : ch === 2 ? inspectionChapter(d.app, actor, v.job.id, q)
          : ch === 23 ? signChapter(d, actor, v, ready, q)
          : ch === 1 ? reportChapter(d, actor, v) : ch === 3 ? purposeChapter(d, v) : ch === 6 ? roomsChapter(d, v)
          : ch === 12 ? itemsChapter(d, v) : ch === 13 ? poolsChapter(v) : ch === 21 ? limitsChapter()
          : SHEET_CHAPTERS.includes(ch) ? sheetChapter(d, v, ch)
          : h`<p class="help">This chapter is filled in at the next stage of the build. For now, the sums are in chapters 4, 9 and 10.</p>`}
      </article>
      <aside class="pack-side">${approveCard(v, ready)}${totalsCard(v)}${legalCard(v, lv)}${changesCard(d, v)}</aside>
    </div>
    <p><a href="/staff/survey/${v.job.id}">Back to the survey job</a></p>`;
  const job = S.surveyorJobs(d.app.db, actor).find((j) => j.job_id === v.job.id);
  if (job !== undefined) setJobMenu(d.app, actor, job, 'pack');
  return page({ title: `Survey pack · ${v.job.business_name}`, nav: d.nav(actor), wide: true, body });
}

/**
 * UI TIDY PHASE 11, 3 October 2026 — WHICH PACK THIS IS. Lakhbir: "The survey pack doesn't say which of a client's surveys
 * you are looking at. Dunmarrow has two, and I opened the wrong one first." A dark band names the client and the site (the
 * pack's own property, else its claim's), the claim number and postcode, which of the client's survey jobs it is, and a
 * button to each of the others' packs, at the same chapter.
 */
function packHead(app: App, actor: Actor, v: P.PackView, ch: number): Safe {
  const all = S.surveyorJobs(app.db, actor).filter((j) => j.business_id === v.job.business_id)
    .sort((a, b) => (a.claim_ref ?? '').localeCompare(b.claim_ref ?? '') || a.job_id.localeCompare(b.job_id));
  const job = all.find((j) => j.job_id === v.job.id);
  const site = v.property !== null ? siteOf(v.job.business_name, v.property.label) : job === undefined ? 'no site recorded' : jobSite(job);
  const postcode = v.property?.postcode ?? job?.property_postcode ?? null;
  const n = all.findIndex((j) => j.job_id === v.job.id);
  const facts = [job?.claim_ref ?? null, postcode, all.length > 1 && n >= 0 ? `survey job ${String(n + 1)} of ${String(all.length)} for this client` : null]
    .filter((x): x is string => x !== null);
  return h`<section class="packhead" aria-label="Which survey pack this is"><div>
      <p class="packhead-kind">Survey pack</p>
      <p class="packhead-title">${v.job.business_name} — ${site}</p>
      <p class="packhead-facts">${facts.join(' · ')}</p></div>
    ${all.filter((j) => j.job_id !== v.job.id).map((o) => h`<a class="packhead-switch" href="${base(o.job_id)}?ch=${String(ch)}">Switch to ${jobSite(o)}</a>`)}</section>`;
}

function propertyChooser(v: P.PackView, ch: number): Safe {
  if (v.property_choices.length === 0) return h`<div class="gate" role="alert">This company has no property on file. Add one before the pack can be filled in.</div>`;
  if (!v.may_edit) return h`<div class="gate" role="alert">The company has more than one property. The surveyor says which one this pack is for.</div>`;
  return h`<form method="post" action="${base(v.job.id)}/property" class="gate pk-choose">${hidden(v, ch)}
    <label for="pk-prop"><strong>Which property is this pack for?</strong> The company has more than one.</label>
    <select id="pk-prop" name="property_id" class="fi">${v.property_choices.map((p) => h`<option value="${p.id}">${p.label}${p.postcode === null ? '' : `, ${p.postcode}`}</option>`)}</select>
    <button class="cta" type="submit">This one</button></form>`;
}

/* ------------------------------------------------------------ chapter 4 */

function summaryChapter(v: P.PackView): Safe {
  const s = v.sums;
  const i = v.inputs;
  const mainPct = s.qualifying_pence === null || s.qualifying_pence === 0 || s.main_pool_pence === null ? null : Math.round((s.main_pool_pence * 100) / s.qualifying_pence);
  return h`
    <p class="lede">How the price paid becomes the spend that qualifies. Each box comes from the chapters after it.</p>
    <div class="pathway">
      <div>Price paid<b>${PENCE(i.price_paid_pence.value)}</b><span>Chapter 9</span></div>
      ${v.vat.counted_pence === 0 ? raw('') : h`<div>Plus VAT not reclaimed<b>+ ${PENCE(v.vat.counted_pence)}</b><span>Chapter 15</span></div>`}
      <div>Less bare land<b>${i.land_pence.value === null ? '—' : `− ${PENCE(i.land_pence.value)}`}</b><span>Chapter 9</span></div>
      <div>The building<b>${PENCE(s.building_price_pence)}</b><span>price less land</span></div>
      <div>Rebuild cost today<b>${PENCE(s.rebuild_pence)}</b><span>floor area × rate</span></div>
      ${v.grants.list.length === 0 ? raw('') : h`<div>Less grants<b>${v.grants.reading.reduction_pence === null ? '—' : `− ${PENCE(v.grants.reading.reduction_pence)}`}</b><span>Chapter 15</span></div>`}
      <div class="pathway-end">Spend that qualifies<b>${PENCE(s.qualifying_pence)}</b><span>${s.share_bp === null ? 'not worked out yet' : `${PCT(s.share_bp)} of the building`}</span></div>
    </div>
    ${mainPct === null ? raw('') : h`<p><strong>Where it sits.</strong> Main pool ${PENCE(s.main_pool_pence)} (${String(mainPct)}%) · Special rate pool ${PENCE(s.special_pool_pence)} (${String(100 - mainPct)}%)</p>
      <div class="pk-bar" role="img" aria-label="Main pool ${String(mainPct)} per cent, special rate pool ${String(100 - mainPct)} per cent"><span class="pk-bar-mp pk-w${String(Math.round(mainPct / 5) * 5)}"></span><span class="pk-bar-sr"></span></div>`}
    ${neededList(v)}`;
}

function neededList(v: P.PackView): Safe {
  const s = v.sums;
  if (s.complete) return h`<p class="gate"><strong>Every value is in.</strong> The sums are complete.</p>`;
  return h`
    ${s.problems.map((p) => h`<p class="gate pk-problem" role="alert"><strong>Check this.</strong> ${p.words}</p>`)}
    ${s.needed.length === 0 ? raw('') : neededGroups(v)}`;
}

/**
 * UI TIDY PHASE 11: STILL NEEDED, IN GROUPS. Forty-one links in two columns was a wall. The values of chapter 9 are few
 * and listed; the lines of chapter 10 are counted, with one link to the chapter; every one is still listed, one per line,
 * behind "Show all".
 */
function neededGroups(v: P.PackView): Safe {
  const s = v.sums;
  const link = (n: (typeof s.needed)[number]): string => n.where === 'GRANT' ? `${base(v.job.id)}?ch=15`
    : `${base(v.job.id)}?ch=${n.where === 'INPUT' ? '9' : '10'}${n.line_id === null ? '' : `&edit=${encodeURIComponent(n.line_id)}#l-${n.line_id}`}`;
  const inputs = s.needed.filter((n) => n.where === 'INPUT');
  const lines = s.needed.filter((n) => n.where === 'LINE');
  const grants = s.needed.filter((n) => n.where === 'GRANT');
  return h`<h2>Still needed: ${String(s.needed.length)}</h2>
      <p class="help">There is no total until every value is in. We never fill a gap with a guess.</p>
      <table class="pk-table pk-groups"><thead><tr><th>What is missing</th><th>How many</th><th></th></tr></thead><tbody>
        ${inputs.length === 0 ? raw('') : h`<tr><td>Price, land and floor area<br><span class="help">${inputs.map((n) => n.words).join(' ')}</span></td><td>${lateBadge(String(inputs.length))}</td><td><a href="${base(v.job.id)}?ch=9">Go to chapter 9</a></td></tr>`}
        ${lines.length === 0 ? raw('') : h`<tr><td>Rebuild cost and split, line by line<br><span class="help">How much, the rate, and for some the pool.</span></td><td>${lateBadge(String(lines.length))}</td><td><a href="${base(v.job.id)}?ch=10">Go to chapter 10</a></td></tr>`}
        ${grants.length === 0 ? raw('') : h`<tr><td>Grants on the claim<br><span class="help">How much each grant paid. It is recorded on the claim, not here.</span></td><td>${lateBadge(String(grants.length))}</td><td><a href="${base(v.job.id)}?ch=15">Go to chapter 15</a></td></tr>`}
      </tbody></table>
      <details class="morelist"><summary>Show all ${String(s.needed.length)}, one per line</summary>
        <ul class="pk-needed">${s.needed.slice(0, 60).map((n) => h`<li><a href="${link(n)}">${n.words}</a></li>`)}</ul>
        ${s.needed.length > 60 ? h`<p class="help">… and ${String(s.needed.length - 60)} more.</p>` : raw('')}</details>`;
}

/* ------------------------------------------------------------ PHASE 153f: chapters 1, 3, 6, 12, 13 and 21 */

const SECTOR_WORDS: Readonly<Record<string, string>> = Object.freeze({
  care_homes: 'Care home', dental: 'Dental practice', supported_living: 'Supported living', gp: 'GP surgery', private_hospital: 'Private hospital or clinic',
});

/** Chapter 1 — who the report is for and which property. Nothing typed here: it comes from the claim and the job. */
export function reportChapter(d: PackPageDeps, actor: Actor, v: P.PackView): Safe {
  const job = S.surveyorJobs(d.app.db, actor).find((j) => j.job_id === v.job.id);
  const plan = sitePlanOf(d.app.db, v.job.id);
  const row = (k: string, val: string | null) => h`<tr><th scope="row">${k}</th><td>${val === null || val === '' ? h`<span class="pk-src pk-need">not on file</span>` : val}</td></tr>`;
  return h`<p class="lede">Who the report is for, and which property. It comes from the claim and the survey job.</p>
    <table class="pk-table"><tbody>
      ${row('Client', v.job.business_name)}
      ${row('Property', v.property === null ? null : v.property.label)}
      ${row('Postcode', v.property?.postcode ?? job?.property_postcode ?? null)}
      ${row('Kind of property', SECTOR_WORDS[v.job.sector] ?? v.job.sector)}
      ${row('Claim reference', job?.claim_ref ?? null)}
      ${row('Surveyor', v.job.surveyor_name)}
    </tbody></table>
    ${plan === null ? h`<p class="help">No site plan yet. Get it in chapter 9; it goes on the report’s cover.</p>`
      : h`<div class="rp-plan">${sitePlanSvg(plan, `Site plan round ${plan.postcode}`)}<p class="help">${pickWords(plan)} ${plan.attribution}. Not the legal boundary of the site.</p></div>`}`;
}

/** Chapter 3 — what the report is for, and the basis it was made on (Phase 153e lines 1 to 3: the evidence level). */
export function purposeChapter(d: PackPageDeps, v: P.PackView): Safe {
  const b = basisOf(d.app.db, v.job.id);
  const level = deskFirstReading(d.app.db, v.job.id);
  return h`<p class="lede">What the report is for, and what it rests on.</p>
    <p><strong>The report.</strong> A capital allowances valuation report. Until you sign it, it is a working draft, not tax advice.</p>
    <p><strong>Its purpose.</strong> To find the spend on plant and machinery that qualifies for a capital allowances claim on this property. The price paid is split in a just and reasonable way (section 562 of the Capital Allowances Act 2001).</p>
    <p><strong>How you inspected.</strong> ${b === null ? h`<span class="pk-src pk-need">not recorded</span> Say it in chapter 2.` : h`${b.words}${b.note === null ? '' : `: ${b.note}`} <span class="help">(${b.by_name})</span>`}</p>
    <p><strong>How much evidence this job needs.</strong> ${level === null ? 'Not worked out yet.' : level.level_words}</p>
    <p class="help">The standard assumptions are in chapter 21. Write any special assumption, and why, in chapter 21 when it is built; for now, in your notes.</p>`;
}

/** Chapter 6 — the room counts recorded on the job (they size the per-room lines of chapter 10), and what each room is. */
export function roomsChapter(d: PackPageDeps, v: P.PackView): Safe {
  const r = roomsFor(v.job.sector);
  if (r === null) return h`<p class="help">This kind of property has no room list.</p>`;
  const counts = new Map(d.app.db.all<{ room_id: string; room_count: number | null }>(
    'SELECT room_id, room_count FROM surveyor_room_counts WHERE job_id = ?', [v.job.id]).map((x) => [x.room_id, x.room_count] as const));
  const missing = r.rooms.filter((x) => (counts.get(x.room_id) ?? null) === null).length;
  return h`<p class="lede">The rooms, counted. A count sizes every line of chapter 10 that is counted per room. This sector scales on ${r.scales_on}.</p>
    ${missing === 0 ? raw('') : h`<p class="gate" role="note">${String(missing)} of ${String(r.rooms.length)} rooms not counted yet. Count them on <a href="/staff/survey/${v.job.id}">the survey job</a>.</p>`}
    <table class="pk-table"><thead><tr><th>Room</th><th>How it is counted</th><th>Count</th></tr></thead><tbody>
      ${r.rooms.map((x) => { const c = counts.get(x.room_id) ?? null; return h`<tr><td>${x.label}${x.caveat === undefined ? '' : h`<br><span class="help">${x.caveat}</span>`}</td><td>${x.driver}</td><td>${c === null ? h`<span class="pk-src pk-need">not counted</span>` : String(c)}</td></tr>`; })}
    </tbody></table>
    ${r.note === undefined ? raw('') : h`<p class="help">${r.note}</p>`}`;
}

/** Chapter 12 — every fixture, item by item: its pool, its share, our default where it is one, and how it was seen. */
export function itemsChapter(d: PackPageDeps, v: P.PackView): Safe {
  const evidence = evidenceByLine(d.app.db, v.job.id);
  const basis = basisOf(d.app.db, v.job.id)?.basis ?? null;
  const live = v.lines.filter((l) => !l.removed);
  const out = v.lines.filter((l) => l.removed);
  return h`<p class="lede">Every fixture, item by item. Chapter 10 is where you change one; this is how the report lists them.</p>
    <table class="pk-table"><thead><tr><th>Item</th><th>Pool</th><th>Share that qualifies</th><th>Seen</th></tr></thead><tbody>
      ${live.map((l) => h`<tr><td>${l.label}${l.template === null || !l.template.authority.includes(TEST_DEFAULT_WORDS) ? raw('') : h`<br><span class="help">${l.template.authority.slice(l.template.authority.indexOf(TEST_DEFAULT_WORDS))}</span>`}</td>
        <td>${l.pool === null ? h`<span class="pk-src pk-need">not decided</span>` : POOL_WORDS[l.pool] ?? l.pool}</td>
        <td>${l.qpct_bp.value === null ? h`<span class="pk-src pk-need">needed</span>` : PCT(l.qpct_bp.value)}</td>
        <td>${findingSeen(basis, l, evidence.get(l.element_id ?? '')?.count ?? 0)}</td></tr>`)}
    </tbody></table>
    ${out.length === 0 ? raw('') : h`<p class="help">Taken out, so not in the report: ${out.map((l) => l.label).join(', ')}.</p>`}`;
}

const POOL_WORDS: Readonly<Record<string, string>> = Object.freeze({ MP: 'Main pool', SR: 'Special rate pool' });

/** Chapter 13 — the two pools: what is in each, from chapter 10's lines. Nothing is counted until it is complete. */
export function poolsChapter(v: P.PackView): Safe {
  const sum = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  const group = (pool: string | null) => v.lines.filter((l) => !l.removed && l.pool === pool);
  const total = (ls: readonly P.ViewLine[]) => { let t = 0; for (const l of ls) { const q = sum.get(l.id)?.qualifying_pence ?? null; if (q === null) return null; t += q; } return t; };
  const undecided = group(null);
  return h`<p class="lede">Where the spend that qualifies sits: the main pool, or the special rate pool.</p>
    <table class="pk-table"><thead><tr><th>Pool</th><th>Items</th><th>Qualifying spend</th></tr></thead><tbody>
      ${(['MP', 'SR'] as const).map((p) => { const ls = group(p); const t = total(ls); return h`<tr><td>${POOL_WORDS[p]!}</td><td>${String(ls.length)}</td><td>${t === null ? h`<span class="pk-src pk-need">not complete</span>` : PENCE(t)}</td></tr>`; })}
    </tbody></table>
    ${v.sums.qualifying_pence === null ? h`<p class="help">The pools are final only when every value is in (chapter 4 lists what is missing).</p>`
      : h`<p><strong>After the price is shared out:</strong> main pool ${PENCE(v.sums.main_pool_pence)} · special rate pool ${PENCE(v.sums.special_pool_pence)}.</p>`}
    ${undecided.length === 0 ? raw('') : h`<p class="gate" role="note">${String(undecided.length)} item${undecided.length === 1 ? '' : 's'} with no pool yet: ${undecided.map((l) => l.label).join(', ')}. Decide each in chapter 10.</p>`}`;
}

/** Chapter 21 — the report's limits and standard assumptions, with the planning assumption (Phase 153e line 11). */
export function limitsChapter(): Safe {
  return h`<p class="lede">What the report does not cover, and what it assumes. Test wording, for you to approve.</p>
    <ul>
      <li><strong>Scope.</strong> This report is for capital allowances only. It is not a market valuation or a survey of the building’s condition. It is not for a loan or for insurance.</li>
      <li><strong>Basis.</strong> A just and reasonable split of the price paid (section 562). The plant is valued at what it would cost to replace. The rest goes to the building and the bare land.</li>
      <li><strong>Standard assumptions.</strong> Title is good. No undisclosed rights or covenants change the value. The land is not contaminated beyond anything stated. What the client and their advisers told us is accurate and complete.</li>
      ${REPORT_ASSUMPTIONS.map((a) => h`<li><strong>Planning.</strong> ${a}</li>`)}
      <li><strong>Reliance.</strong> Prepared for the client and their advisers only. Nobody else may rely on it.</li>
      <li><strong>Not tax advice.</strong> The claim itself is the tax adviser’s.</li>
    </ul>
    <p class="help">Write any special assumption in your notes for now. Do the same for a limit on what you could inspect, or anything you were asked to leave out.</p>`;
}

/* ------------------------------------------------------------ PHASE 153g: the other ten chapters */

const FROM_CLASS: Readonly<Record<string, string>> = Object.freeze({ 'the surveyor': 'pk-sv', 'the pack': 'pk-dr', 'worked out': 'pk-dr', 'fixed wording': 'pk-dr', 'the cost model (test)': 'pk-dr' });

/**
 * PHASE 153g — chapters 5, 8, 11, 14, 16, 17, 18, 19, 20 and 22, from one reading (src/web/pack-sheets.ts): each row
 * says where it comes from, and a row with nothing behind it says so in words. The surveyor's words are each a form, kept
 * with a reason under their name; Admin and Sales read them.
 */
export function sheetChapter(d: PackPageDeps, v: P.PackView, ch: number): Safe {
  const s = packSheet(d.app.db, v, ch);
  if (s === null) return raw('');
  const cell = (r: SheetRow) => r.value === null
    ? h`<span class="pk-src pk-need">${r.missing}</span>`
    : h`${r.value} <span class="pk-src ${FROM_CLASS[r.from] ?? 'pk-ev'}">${r.from === 'the surveyor' && r.by !== undefined ? r.by : r.from}</span>`;
  return h`<p class="lede">${s.lede}</p>
    ${s.applies ? raw('') : h`<p class="gate" role="note">${s.not_applies_words ?? ''}</p>`}
    ${s.rows.length === 0 ? raw('') : h`<table class="pk-table"><tbody>${s.rows.map((r) => h`<tr><th scope="row">${r.label}</th><td>${cell(r)}</td></tr>`)}</tbody></table>`}
    ${s.items.length === 0 ? (s.n === 19 ? h`<p class="help">No item in this pack is marked as a judgement call.</p>` : raw(''))
      : h`<h2>Items that are judgement calls (${String(s.items.length)})</h2><ul class="pk-needed">${s.items.map((i) => h`<li><strong>${i.label}</strong><br><span class="help">${i.detail}</span></li>`)}</ul>`}
    ${!v.may_edit || v.property === null ? raw('') : s.words.map((f) => {
      const w = WORD_FIELDS[f];
      const now = s.rows.find((r) => r.label === w.label)?.value ?? '';
      return h`<form method="post" action="${base(v.job.id)}/words" class="pblock" id="w-${f}">${hidden(v, ch)}<input type="hidden" name="field" value="${f}">
        <label class="fl" for="w-${f}-t">${w.label}</label><p class="help">${w.ask}</p>
        <textarea class="fi" id="w-${f}-t" name="words" rows="3" maxlength="4000">${now}</textarea>
        <label class="fl" for="w-${f}-r">Why</label><input class="fi" id="w-${f}-r" name="reason" maxlength="500" required>
        <button class="btn-quiet" type="submit">Save</button></form>`;
    })}
    ${(ch === 11 || ch === 14) ? costForms(v, ch) : raw('')}`;
}

/**
 * PHASE 157a — the cost model's values (src/web/pack-cost-model.ts): chapter 11's valuation date, chapter 14's
 * insurance figure, its date, and what each figure includes. Each the surveyor's, with a reason; empty clears it.
 */
function costForms(v: P.PackView, ch: number): Safe {
  const note = h`<p class="help">These readings are test placeholders for you to check. They change no figure in the pack, and they are not in the approved version or the client’s report.</p>`;
  if (!v.may_edit || v.property === null) return note;
  const dateForm = (field: P.CostField, label: string, help: string) => h`<form method="post" action="${base(v.job.id)}/extra" class="pblock" id="c-${field}">${hidden(v, ch)}<input type="hidden" name="field" value="${field}">
      <label class="fl" for="c-${field}-v">${label}</label><p class="help">${help}</p>
      <input class="fi" type="date" id="c-${field}-v" name="value" value="${P.packDateIso(v.cost[field].value) ?? ''}">
      <label class="fl" for="c-${field}-r">Why</label><input class="fi" id="c-${field}-r" name="reason" maxlength="500" required>
      <button class="btn-quiet" type="submit">Save</button></form>`;
  const incForm = (field: P.CostField, label: string) => h`<form method="post" action="${base(v.job.id)}/extra" class="pblock" id="c-${field}">${hidden(v, ch)}<input type="hidden" name="field" value="${field}">
      <label class="fl" for="c-${field}-v">${label}</label><p class="help">Does it include demolition, fees and site costs? Pick the ones it does.</p>
      <select class="fi" id="c-${field}-v" name="value"><option value="">Not recorded</option>${INCLUDES_WORDS.map((w, i) => h`<option value="${String(i)}"${v.cost[field].value === i ? raw(' selected') : raw('')}>${w}</option>`)}</select>
      <label class="fl" for="c-${field}-r">Why</label><input class="fi" id="c-${field}-r" name="reason" maxlength="500" required>
      <button class="btn-quiet" type="submit">Save</button></form>`;
  if (ch === 11) return h`${note}${dateForm('valuation_date', 'Valuation date', 'The date the rebuild cost in chapter 10 is priced at. The index runs from this date back to the purchase date.')}`;
  const ins = v.cost.insurance.value;
  return h`${note}<details class="pk-add"><summary>Record the insurance figure</summary>
    <form method="post" action="${base(v.job.id)}/extra" class="pblock" id="c-insurance">${hidden(v, ch)}<input type="hidden" name="field" value="insurance">
      <label class="fl" for="c-insurance-v">Insurance rebuild figure, in pounds</label><p class="help">The rebuild figure on the insurance schedule. Empty clears it.</p>
      <input class="fi" id="c-insurance-v" name="value" inputmode="decimal" value="${ins === null ? '' : String(ins / 100)}">
      <label class="fl" for="c-insurance-r">Why</label><input class="fi" id="c-insurance-r" name="reason" maxlength="500" required>
      <button class="btn-quiet" type="submit">Save</button></form>
    ${dateForm('insurance_date', 'Date of the insurance figure', 'The date the insurer’s figure was set, from the schedule.')}
    ${incForm('insurance_includes', 'What the insurance figure includes')}
    ${incForm('rebuild_includes', 'What our rebuild cost includes')}</details>`;
}

/* ------------------------------------------------------------ chapter 15: grants and VAT */

const ROUTE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  ITEMS: 'Off the items it paid for', EQUAL_SHARE: 'Off every item, in equal share', NOT_TAKEN_OFF: 'Not taken off',
});

/**
 * PHASE 153a, 4 October 2026 — F-15's remainder. The claim's grants, read from the claim record, and what each takes off
 * (src/web/pack-grants.ts). Nothing is typed here: a grant is recorded, matched and removed on the claim, by Sales or
 * Admin, so the surveyor sees what the claim holds and the figure it gives. VAT is not in the pack yet.
 */
export function grantsChapter(v: P.PackView): Safe {
  const g = v.grants;
  const r = g.reading;
  const effect = new Map(r.effects.map((e) => [e.grant_id, e] as const));
  const lineLabel = new Map(v.lines.map((l) => [l.id, l.label] as const));
  const how = g.switches.element_trace
    ? 'A grant matched to rows of our fixture list comes off only those items. A grant not matched to rows comes off every item in equal share.'
    : 'Every grant comes off every item in equal share: the grant as a share of the price paid. Taking a grant off only the items it paid for is built, and switched off until the tax adviser says it is right.';
  return h`
    <p class="lede">Money from someone else — the NHS, a council, a landlord — reduces the spend it paid for. Insurance money after damage does not.</p>
    <p>${how}</p>
    ${g.amounts_shown ? raw('') : h`<p class="help">What each grant paid is held by the office, not shown here. The totals below are the pack’s own, and they are in the figures you approve.</p>`}
    ${g.claim_id === null ? h`<p class="gate">This survey job is on no claim, so there are no grants to read. Grants are recorded on the claim.</p>`
      : g.list.length === 0 ? h`<p class="gate">No grant is recorded on the claim. If anyone else paid for any of the work, it is recorded on the claim, and comes off here.</p>`
      : h`<table class="pk-table"><thead><tr><th scope="col">Who paid</th><th scope="col" class="n">How much</th><th scope="col">What it paid for</th><th scope="col">How it comes off</th><th scope="col" class="n">Takes off</th></tr></thead>
        <tbody>${g.list.map((x) => {
          const e = effect.get(x.id);
          const met = (e?.line_ids ?? []).map((id) => lineLabel.get(id) ?? id);
          return h`<tr><td>${PAYER_CLASSES[x.payer_class] ?? 'Not known'}<br><span class="help">${x.kind === 'GRANT' ? 'A grant' : 'A payment towards the work'}</span></td>
            <td class="n">${x.amount_pence === null ? h`<span class="pk-gap">not known</span>` : g.amounts_shown ? PENCE(x.amount_pence) : h`<span class="help">Held by the office</span>`}</td>
            <td>${x.element_names.length > 0 ? x.element_names.join('; ') : x.traced === 'YES' ? 'Matched in words only' : 'Not matched yet'}</td>
            <td>${ROUTE_WORDS[e?.route ?? ''] ?? '—'}<br><span class="help">${e?.words ?? ''}${met.length === 0 ? '' : ` Lines: ${met.join('; ')}.`}</span></td>
            <td class="n">${e?.reduction_pence === null || e === undefined || !g.amounts_shown ? '—' : PENCE(e.reduction_pence)}</td></tr>`;
        })}</tbody>
        <tbody><tr class="pk-tot"><th scope="row">Before grants</th><td></td><td></td><td></td><td class="n">${PENCE(r.before.qualifying_pence)}</td></tr>
          <tr class="pk-tot"><th scope="row">Less grants</th><td></td><td></td><td></td><td class="n">${r.reduction_pence === null ? '—' : `− ${PENCE(r.reduction_pence)}`}</td></tr>
          <tr class="pk-tot"><th scope="row">Spend that qualifies</th><td></td><td></td><td></td><td class="n">${PENCE(v.sums.qualifying_pence)}</td></tr></tbody></table>
        ${r.reduction_pence === null ? h`<p class="gate" role="alert">There is no total until every grant’s amount is known, and the rest of the pack is complete. Record the amount on the claim.</p>` : raw('')}`}
`;
}

/**
 * PHASE 153e — CHAPTER 15'S VAT HALF (src/web/pack-vat.ts; Module 00 C23). The surveyor records whether the client could
 * reclaim the VAT, and the VAT not reclaimed, each with a reason. Only "exempt" adds it to the price paid; partly exempt
 * waits for the tax adviser; not known adds nothing (N4).
 */
function vatSection(d: PackPageDeps, v: P.PackView, ch: number): Safe {
  const t = v.vat;
  const opt = (k: string, w: string) => h`<option value="${k}"${t.position_source !== null && t.position === k ? raw(' selected') : raw('')}>${w}</option>`;
  return h`<h2>VAT</h2>
    <p class="lede">VAT the client paid and could not reclaim is part of what they spent, so it is added to the price before it is shared out. Healthcare is mostly VAT-exempt.</p>
    <table class="pk-table"><tbody>
      <tr><th scope="row">Could the client reclaim the VAT?</th><td>${t.position_source === null ? h`<span class="pk-src pk-need">not recorded</span>` : h`${VAT_POSITION_WORDS[t.position]} ${sourceTag(d, t.position_source, true)}`}</td></tr>
      <tr><th scope="row">VAT not reclaimed</th><td>${t.amount_pence === null ? h`<span class="pk-src pk-need">not recorded</span>` : h`${PENCE(t.amount_pence)} ${sourceTag(d, t.amount_source, true)}`}</td></tr>
      <tr><th scope="row">Added to the price</th><td class="n">${PENCE(t.counted_pence)}</td></tr>
    </tbody></table>
    <p class="help">${t.words}</p>
    ${!v.may_edit || v.property === null ? raw('') : h`<details class="pk-add"><summary>Record the VAT position</summary>
      <form method="post" action="${base(v.job.id)}/extra">${hidden(v, ch)}<input type="hidden" name="field" value="vat_position"><div class="pk-fields">
        <label>Could the client reclaim it?
<select class="fi" name="value"><option value="">Not recorded</option>${opt('RECLAIMS', VAT_POSITION_WORDS.RECLAIMS)}${opt('EXEMPT', VAT_POSITION_WORDS.EXEMPT)}${opt('PARTLY_EXEMPT', VAT_POSITION_WORDS.PARTLY_EXEMPT)}${opt('NOT_KNOWN', VAT_POSITION_WORDS.NOT_KNOWN)}</select></label>
        <label>Why <input class="fi" name="reason" maxlength="500" required placeholder="For example: their VAT return shows no VAT reclaimed"></label></div>
        <button class="cta" type="submit">Save</button></form>
      <form method="post" action="${base(v.job.id)}/extra">${hidden(v, ch)}<input type="hidden" name="field" value="vat"><div class="pk-fields">
        <label>VAT not reclaimed, in pounds <input class="fi" name="value" inputmode="decimal" value="${t.amount_pence === null ? '' : String(t.amount_pence / 100)}"></label>
        <label>Why <input class="fi" name="reason" maxlength="500" required placeholder="For example: the VAT on the purchase invoice"></label></div>
        <button class="cta" type="submit">Save</button></form></details>`}`;
}

/* ------------------------------------------------------------ chapter 7 */

const LEVEL_WORDS: Readonly<Record<L.Level, string>> = Object.freeze({
  GREEN: 'Clear', URGENT: 'Clear, with a deadline', AMBER: 'Not settled yet', RED: 'Fails',
});

function legalCard(v: P.PackView, lv: L.LegalView): Safe {
  const allows = L.legalAllows(lv.verdict, v.sums.qualifying_pence);
  return h`<section class="pk-card"><h2>The legal check</h2>
    <p><span class="pk-lv pk-lv-${lv.verdict.level.toLowerCase()}">${LEVEL_WORDS[lv.verdict.level]}</span></p>
    <p class="help"><a href="${base(v.job.id)}?ch=7">${allows.ok ? 'It does not stop approval.' : 'It stops approval until it is settled.'}</a></p></section>`;
}

function questionForm(v: P.PackView, lv: L.LegalView, q: L.EngineQuestion, ch: number): Safe {
  const now = lv.answers.get(q.id)?.value;
  const field = q.type === 'single'
    ? h`
<select class="fi" name="answer" id="lq-${q.id}"><option value=""${now === undefined ? raw(' selected') : raw('')}>Choose…</option>${(q.opts ?? []).map((o) => h`<option value="${o[0]}"${now === o[0] ? raw(' selected') : raw('')}>${o[1]}</option>`)}</select>`
    : q.type === 'multi'
      ? h`<span class="pk-multi">${(q.opts ?? []).map((o) => h`<label><input type="checkbox" name="answer" value="${o[0]}"${Array.isArray(now) && now.includes(o[0]) ? raw(' checked') : raw('')}> ${o[1]}</label>`)}</span>`
      : q.type === 'date'
        ? h`<input class="fi" type="date" name="answer" id="lq-${q.id}" value="${typeof now === 'string' ? now : ''}">`
        : h`<input class="fi" name="answer" id="lq-${q.id}" inputmode="decimal" autocomplete="off" value="${typeof now === 'number' ? String(now) : ''}">`;
  return h`<form method="post" action="${base(v.job.id)}/legal" class="pk-q-form"><input type="hidden" name="seq" value="${String(lv.seq)}"><input type="hidden" name="ch" value="${String(ch)}"><input type="hidden" name="question" value="${q.id}">
    <div class="pk-fields"><label for="lq-${q.id}">${q.type === 'currency' ? 'Amount in pounds' : q.type === 'date' ? 'Date' : 'Answer'}</label>${field}
      <label>Where did this come from? <input class="fi pk-why" name="source" maxlength="300" required placeholder="For example: the election notice, the CPSE replies, the client"></label></div>
    <div class="sendrow"><button class="cta" type="submit">Save the answer</button>${now === undefined ? raw('') : h`<a href="${base(v.job.id)}?ch=7#lq-row-${q.id}">Cancel</a>`}</div></form>`;
}

function legalChapter(d: PackPageDeps, v: P.PackView, lv: L.LegalView, ch: number, q: URLSearchParams): Safe {
  const verdict = lv.verdict;
  const allows = L.legalAllows(verdict, v.sums.qualifying_pence);
  const open = q.get('q');
  const unanswered = new Set(lv.unanswered.map((x) => x.id));
  return h`
    <p class="lede">Can the client claim on these fixtures at all? When a building is bought, the claim may be worth nothing. It depends on what the seller did. The usual fix is a section 198 election, made within two years. These are our engine’s own questions and rules. Each answer says who gave it and where it came from.</p>
    <div class="pk-verdict pk-lv-${verdict.level.toLowerCase()}" role="status">
      <p class="pk-verdict-h"><strong>${LEVEL_WORDS[verdict.level]}.</strong> ${verdict.headline}</p>
      ${verdict.why.length === 0 ? raw('') : h`<p class="help">Why, in the engine’s words:</p><ul>${verdict.why.map((w) => h`<li>${w}</li>`)}</ul>`}
      ${verdict.actions.length === 0 ? raw('') : h`<p class="help">What to do:</p><ul>${verdict.actions.map((w) => h`<li>${w}</li>`)}</ul>`}
      ${verdict.cap_pence === null ? raw('') : h`<p><strong>Capped.</strong> The claim on the fixtures cannot be more than ${poundsWords(verdict.cap_pence)}, ${verdict.cap_words ?? ''}. The pack’s figure is ${poundsWords(v.sums.qualifying_pence)}.</p>`}
      <p><strong>${allows.ok ? 'This does not stop approval.' : 'This stops approval.'}</strong>${allows.ok || allows.why === verdict.headline ? raw('') : h` ${allows.why}`}</p>
    </div>
    <h2>The questions (${String(lv.asked.length)})</h2>
    <p class="help">Only the questions the answers so far lead to are shown. “Not sure” is an answer, and it is never a pass.</p>
    <ol class="pk-qs">${lv.asked.map((x) => {
      const a = lv.answers.get(x.id);
      // Every question not yet answered has its form open, the optional ones too; an answered one opens on "Change".
      const editing = lv.may_answer && (a === undefined || open === x.id);
      return h`<li id="lq-row-${x.id}" class="${a === undefined ? 'pk-q pk-q-open' : 'pk-q'}">
        <p class="pk-q-ask"><strong>${x.ask}</strong>${x.optional === true ? h` <span class="help">(you do not have to)</span>` : raw('')}</p>
        ${x.help === undefined ? raw('') : h`<p class="help">${x.help}</p>`}
        ${a === undefined ? raw('') : h`<p class="pk-q-ans">${L.answerWords(x, a.value)} <span class="pk-src pk-sv">${a.by_name} · ${d.stamp(a.at)}</span> <span class="help">From: ${a.source_note}</span>
          ${lv.may_answer && open !== x.id ? h` <a href="${base(v.job.id)}?ch=7&q=${x.id}#lq-row-${x.id}">Change</a>` : raw('')}</p>`}
        ${editing ? questionForm(v, lv, x, ch) : raw('')}</li>`;
    })}</ol>
    ${lv.not_asked_now.length === 0 ? raw('') : h`<h2>Answers no longer asked (${String(lv.not_asked_now.length)})</h2>
      <p class="help">An earlier answer changed, so these questions are not asked now. They are kept, and not used.</p>
      <ul>${lv.not_asked_now.map((a) => h`<li>${lv.questions.find((x) => x.id === a.question_id)?.ask ?? a.question_id} — ${a.by_name}</li>`)}</ul>`}
    ${lv.may_answer ? raw('') : h`<p class="help">The assigned surveyor, Sales or Admin answer these.</p>`}`;
}

/* ------------------------------------------------------------ chapter 9 */

const INPUT_WORDS: Readonly<Record<P.PackInputField, { words: (n: number | null) => string; hint: string; key: 'price_paid_pence' | 'land_pence' | 'gia_milli_m2' | 'building_rate_pence' }>> = Object.freeze({
  price_paid: { words: PENCE, hint: 'In pounds, for example 1050000.', key: 'price_paid_pence' },
  land: { words: PENCE, hint: 'In pounds. The land as if it had no building on it.', key: 'land_pence' },
  gia: { words: (n) => (n === null ? '—' : `${QTY(n)} m²`), hint: 'Square metres, for example 640.', key: 'gia_milli_m2' },
  building_rate: { words: (n) => (n === null ? '—' : `${PENCE(n)} a m²`), hint: 'Pounds a square metre, for example 1847.50.', key: 'building_rate_pence' },
});

function inputsChapter(d: PackPageDeps, v: P.PackView, ch: number, q: URLSearchParams): Safe {
  const editing = q.get('edit');
  return h`
    <p class="lede">The four values the split rests on. The price and the land come from the purchase. The floor area and the whole-building rate give the rebuild cost.</p>
    <table class="pk-table"><thead><tr><th>Value</th><th class="n">Now</th><th>Where it came from</th><th></th></tr></thead><tbody>
    ${P.PACK_INPUT_FIELDS.map((field) => {
      const w = INPUT_WORDS[field];
      const val = v.inputs[w.key];
      const open = editing === field && v.may_edit && v.property !== null;
      return h`<tr id="l-${field}"><th scope="row">${P.INPUT_LABEL[field]}</th>
        <td class="n">${w.words(val.value)}</td><td>${sourceTag(d, val.source)}${val.source?.reason === undefined || val.source.reason === null ? raw('') : h`<br><span class="help">“${val.source.reason}”</span>`}</td>
        <td>${v.may_edit && v.property !== null && !open ? h`<a href="${base(v.job.id)}?ch=9&edit=${field}#l-${field}">Change</a>` : raw('')}</td></tr>
        ${open ? h`<tr class="pk-edit"><td colspan="4"><form method="post" action="${base(v.job.id)}/value">${hidden(v, ch)}<input type="hidden" name="field" value="${field}">
          <div class="pk-fields"><label>New value <input class="fi" name="value" inputmode="decimal" autocomplete="off" value="${val.value === null ? '' : w.words(val.value).replace(/[£,]| a m²| m²/g, '')}"></label>
          <label>Why are you changing it? <input class="fi pk-why" name="reason" maxlength="500" required></label></div>
          <p class="help">${w.hint} Leave it empty to put our figure back.</p>
          <div class="sendrow"><button class="cta" type="submit">Save — every total follows</button><a href="${base(v.job.id)}?ch=9#l-${field}">Cancel</a></div></form></td></tr>` : raw('')}`;
    })}</tbody></table>
    ${v.inputs.building_rate_pence.value === null ? h`<p class="help">The whole-building rate comes from BCIS. Until BCIS is bought, the surveyor types it, and it is theirs.</p>` : raw('')}
    ${v.job.sector === 'supported_living' ? sharedAreaBlock(d, v, ch) : raw('')}
    ${sitePlanPanel(d, v, ch)}`;
}

/**
 * PHASE 153e (Word question 133): supported living's shared areas, measured from the floor plans. The common-parts
 * rows are drafted from it; with none, a flat 25% of the floor area, labelled as the fallback it is.
 */
function sharedAreaBlock(d: PackPageDeps, v: P.PackView, ch: number): Safe {
  const s = v.shared_area;
  return h`<h2>Shared areas, from the floor plans</h2>
    <p class="help">The common parts are measured from the floor plans where we have them. Without them, we use a flat 25% of the floor area. That share is not checked against real jobs.</p>
    <p>${s.value === null ? h`<span class="pk-src pk-need">not measured</span> · ${P.SHARED_FALLBACK_WORDS}` : h`${QTY(s.value)} m² ${sourceTag(d, s.source, true)}`}</p>
    ${!v.may_edit || v.property === null ? raw('') : h`<form method="post" action="${base(v.job.id)}/extra">${hidden(v, ch)}<input type="hidden" name="field" value="shared_area"><div class="pk-fields">
      <label>Shared areas, in m² <input class="fi" name="value" inputmode="decimal" value="${s.value === null ? '' : String(s.value / 1000)}"></label>
      <label>Why <input class="fi" name="reason" maxlength="500" required placeholder="For example: the corridors, lounge and staff rooms on the floor plans"></label></div>
      <button class="cta" type="submit">Save</button></form>`}`;
}

/** 2 Oct 2026, stage 6: the site plan for the report's cover. Fetched with one button; the newest is shown. */
function sitePlanPanel(d: PackPageDeps, v: P.PackView, ch: number): Safe {
  const plan = sitePlanOf(d.app.db, v.job.id);
  return h`<section class="pk-card" id="site-plan"><h2>Site plan for the report</h2>
    ${plan === null
      ? h`<p>No site plan yet. We draw it from Ordnance Survey’s free maps, round the property’s postcode. It shows buildings only, never the site’s legal boundary.</p>`
      : h`<div class="rp-plan">${sitePlanSvg(plan, `Site plan round ${plan.postcode}`)}<div><p>${pickWords(plan)} Placed by the postcode ${plan.postcode}. Fetched ${d.stamp(plan.fetched_at)}.</p>
        <p class="help">If the dark building is the wrong one, check the property’s postcode, then get it again. The plan goes on the report’s cover as it stands when you approve. ${plan.attribution}.</p></div></div>`}
    ${v.may_edit ? h`<form method="post" action="${base(v.job.id)}/site-plan">${hidden(v, ch)}<button class="${plan === null ? 'cta' : 'btn-quiet'}" type="submit">${plan === null ? 'Get the site plan' : 'Get it again'}</button></form>` : raw('')}
  </section>`;
}

/* ------------------------------------------------------------ chapter 10 */

function elementsChapter(d: PackPageDeps, v: P.PackView, ch: number, q: URLSearchParams): Safe {
  const editing = q.get('edit');
  const sumOf = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  const live = v.lines.filter((l) => !l.removed);
  // 2 Oct 2026: each line's photos from the client (src/web/survey-evidence.ts).
  const evidence = evidenceByLine(d.app.db, v.job.id);
  // PHASE 153e (Word question 150): each line says whether it was seen on site or comes from documents.
  const basis = basisOf(d.app.db, v.job.id)?.basis ?? null;
  const groups: { title: string; lines: P.ViewLine[] }[] = [
    { title: 'Special rate pool — integral features', lines: live.filter((l) => l.pool === 'SR' && l.added === null) },
    { title: 'Main pool — plant and machinery', lines: live.filter((l) => l.pool === 'MP' && l.added === null) },
    { title: 'Pool still to decide', lines: live.filter((l) => l.pool === null && l.added === null) },
    { title: 'Lines the surveyor added', lines: live.filter((l) => l.added !== null) },
  ];
  const out = v.lines.filter((l) => l.removed);
  const row = (l: P.ViewLine): Safe => {
    const sum = sumOf.get(l.id);
    const open = editing === l.id && v.may_edit && v.property !== null;
    const judgement = l.template !== null && /CONTESTED|JUDGEMENT/.test(l.template.status);
    return h`<tr id="l-${l.id}"${l.qty_milli.source?.kind === 'SURVEYOR' || l.rate_pence.source?.kind === 'SURVEYOR' ? raw(' class="pk-mine"') : raw('')}>
      <td>${l.label}<br><span class="help">${l.element_id ?? 'Added'}${l.unit === '' ? '' : ` · ${l.unit}`}${judgement ? ' · a judgement call' : ''} · ${findingSeen(basis, l, evidence.get(l.element_id ?? '')?.count ?? 0)}</span>${evidence.has(l.element_id ?? '') ? h`<br>${lineEvidence(evidence, v.job.id, l.element_id)}` : raw('')}
        ${l.added === null ? raw('') : h`<br><span class="help">Added by ${l.added.by_name}: “${l.added.reason}”</span>`}</td>
      ${valueCell(d, l.qty_milli, QTY)}${valueCell(d, l.rate_pence, PENCE)}
      <td class="n">${PENCE(sum?.cost_pence ?? null)}</td>
      ${valueCell(d, l.qpct_bp, PCT)}
      <td class="n">${PENCE(sum?.qualifying_pence ?? null)}</td>
      <td>${l.pool === null ? h`<span class="pk-src pk-need">needed</span>` : h`<span class="pool pool-${l.pool.toLowerCase()}">${l.pool === 'MP' ? 'Main' : 'Special'}</span><br>${sourceTag(d, l.pool_source, true)}`}</td>
      <td>${v.may_edit && v.property !== null && !open ? h`<a href="${base(v.job.id)}?ch=10&edit=${encodeURIComponent(l.id)}#l-${l.id}">Edit</a>` : raw('')}</td></tr>
      ${open ? editRow(v, l, ch) : raw('')}`;
  };
  return h`
    <p class="lede">Every element that may qualify, from our fixture list. Each line's rebuild cost is how much × the rate. The share that qualifies gives its qualifying cost. Change any number, or take a line out, and every total follows.</p>
    <div class="pk-scroll"><table class="pk-table pk-lines"><thead><tr><th>Element</th><th class="n">How much</th><th class="n">Rate</th><th class="n">Rebuild cost</th><th class="n">Qualifies</th><th class="n">Qualifying cost</th><th>Pool</th><th></th></tr></thead>
    ${groups.filter((g) => g.lines.length > 0).map((g) => h`<tbody><tr class="pk-grp"><th colspan="8" scope="rowgroup">${g.title}</th></tr>${g.lines.map(row)}</tbody>`)}
    <tbody><tr class="pk-tot"><th scope="row">Total</th><td></td><td></td><td class="n">${PENCE(v.sums.elements_cost_pence)}</td><td></td><td class="n">${PENCE(v.sums.elements_qualifying_pence)}</td><td></td><td></td></tr></tbody></table></div>
    <p class="help">The totals here count only the lines with every value in. Chapter 4 shows the full split once nothing is missing.</p>
    ${v.may_edit && v.property !== null ? addForm(v, ch, q.get('add') === '1') : raw('')}
    ${out.length === 0 ? raw('') : h`<h2>Taken out (${String(out.length)})</h2><ul class="pk-out">${out.map((l) => h`<li id="l-${l.id}">${l.label}${l.removed_source === null ? raw('') : h` — ${l.removed_source.by_name ?? ''}: “${l.removed_source.reason ?? ''}”`}
      ${v.may_edit ? h` <form method="post" action="${base(v.job.id)}/restore" class="inline">${hidden(v, ch)}<input type="hidden" name="line" value="${l.id}"><label class="vh" for="rr-${l.id}">Why put it back?</label><input id="rr-${l.id}" class="fi pk-why-s" name="reason" maxlength="500" required placeholder="Why put it back?"><button class="btn-quiet" type="submit">Put it back</button></form>` : raw('')}</li>`)}</ul>`}`;
}

function editRow(v: P.PackView, l: P.ViewLine, ch: number): Safe {
  const fid = `f-${l.id}`;
  const val = (x: Valued, w: (n: number | null) => string) => (x.value === null ? '' : w(x.value).replace(/[£,%]/g, ''));
  return h`<tr class="pk-edit"><td colspan="8">
    <form id="${fid}" method="post" action="${base(v.job.id)}/line">${hidden(v, ch)}<input type="hidden" name="line" value="${l.id}">
      <div class="pk-fields">
        <label>How much (${l.unit}) <input class="fi" name="qty" inputmode="decimal" autocomplete="off" value="${val(l.qty_milli, QTY)}"></label>
        <label>Rate, £ a unit <input class="fi" name="rate" inputmode="decimal" autocomplete="off" value="${val(l.rate_pence, PENCE)}"></label>
        <label>Share that qualifies, % <input class="fi" name="qpct" inputmode="decimal" autocomplete="off" value="${val(l.qpct_bp, PCT)}"></label>
        <label>Pool
<select class="fi" name="pool"><option value=""${l.pool === null ? raw(' selected') : raw('')}>Not decided</option><option value="MP"${l.pool === 'MP' ? raw(' selected') : raw('')}>Main pool</option><option value="SR"${l.pool === 'SR' ? raw(' selected') : raw('')}>Special rate pool</option></select></label>
      </div>
      <label class="pk-why-l">Why are you changing it? <input class="fi pk-why" name="reason" maxlength="500" required></label>
      <p class="help">What you type is stamped with your name and kept. Our draft stays in the record beside it.</p>
      <div class="sendrow"><button class="cta" type="submit">Save — every total follows</button><a href="${base(v.job.id)}?ch=10#l-${l.id}">Cancel</a></div>
    </form>
    <div class="pk-side-forms">
      <form method="post" action="${base(v.job.id)}/remove" class="inline">${hidden(v, ch)}<input type="hidden" name="line" value="${l.id}">
        <label class="vh" for="rm-${l.id}">Why take it out?</label><input id="rm-${l.id}" class="fi pk-why-s" name="reason" maxlength="500" required placeholder="Why take it out? For example: not in this building">
        <button class="btn-quiet pk-danger" type="submit">Take this line out</button></form>
      ${l.template === null ? raw('') : h`<form method="post" action="${base(v.job.id)}/revert" class="inline">${hidden(v, ch)}<input type="hidden" name="line" value="${l.id}">
        <label class="vh" for="rv-${l.id}">Why put our draft back?</label><input id="rv-${l.id}" class="fi pk-why-s" name="reason" maxlength="500" required placeholder="Why put our draft back?">
        <button class="btn-quiet" type="submit">Put our draft back</button></form>`}
    </div></td></tr>`;
}

function addForm(v: P.PackView, ch: number, open: boolean): Safe {
  if (!open) return h`<p><a href="${base(v.job.id)}?ch=10&add=1#add">Add a line</a> — for something in this building that our list does not have.</p>`;
  return h`<form id="add" method="post" action="${base(v.job.id)}/add" class="pk-add">${hidden(v, ch)}<h2>Add a line</h2>
    <div class="pk-fields">
      <label>What is it? <input class="fi" name="label" maxlength="200" required></label>
      <label>Counted in <input class="fi" name="unit" maxlength="40" required placeholder="number, m², metres"></label>
      <label>How much <input class="fi" name="qty" inputmode="decimal" autocomplete="off"></label>
      <label>Rate, £ a unit <input class="fi" name="rate" inputmode="decimal" autocomplete="off"></label>
      <label>Share that qualifies, % <input class="fi" name="qpct" inputmode="decimal" autocomplete="off"></label>
      <label>Pool
<select class="fi" name="pool"><option value="">Not decided</option><option value="MP">Main pool</option><option value="SR">Special rate pool</option></select></label>
    </div>
    <label class="pk-why-l">Why add it? <input class="fi pk-why" name="reason" maxlength="500" required></label>
    <div class="sendrow"><button class="cta" type="submit">Add the line</button><a href="${base(v.job.id)}?ch=10">Cancel</a></div></form>`;
}

/* ------------------------------------------------------------ the right-hand side */

function totalsCard(v: P.PackView): Safe {
  const s = v.sums;
  return h`<section class="pk-card"><h2>The pack’s totals</h2>
    <dl class="pk-dl">
      ${v.grants.list.length === 0 ? raw('') : h`<div><dt>Before grants</dt><dd>${PENCE(v.grants.reading.before.qualifying_pence)}</dd></div>
      <div><dt>Less grants</dt><dd>${v.grants.reading.reduction_pence === null ? '—' : `− ${PENCE(v.grants.reading.reduction_pence)}`}</dd></div>`}
      <div><dt>Spend that qualifies</dt><dd>${PENCE(s.qualifying_pence)}</dd></div>
      <div><dt>Main pool</dt><dd>${PENCE(s.main_pool_pence)}</dd></div>
      <div><dt>Special rate pool</dt><dd>${PENCE(s.special_pool_pence)}</dd></div>
      <div><dt>Share of the building</dt><dd>${PCT(s.share_bp)}</dd></div>
    </dl>
    ${s.complete ? h`<p class="help">Every value is in.</p>`
      : h`<p class="help"><a href="${base(v.job.id)}?ch=4">${String(s.needed.length)} value${s.needed.length === 1 ? '' : 's'} still needed${s.problems.length > 0 ? `, and ${String(s.problems.length)} to check` : ''}</a>. No total until then.</p>`}
  </section>`;
}

function changesCard(d: PackPageDeps, v: P.PackView): Safe {
  return h`<section class="pk-card"><h2>The surveyor’s changes (${String(v.changes.length)})</h2>
    ${v.changes.length === 0 ? h`<p class="help">None yet. Each change shows here with the surveyor’s name, the time and their reason.</p>`
      : h`<ol class="pk-log">${v.changes.slice(0, 12).map((c) => h`<li><strong>${c.by_name}</strong> ${c.words}${c.line_label === null ? raw('') : h` on <a href="${base(v.job.id)}?ch=10#l-${c.line_key ?? ''}">${c.line_label}</a>`}. “${c.reason}” <span class="help">${d.stamp(c.at)}</span></li>`)}</ol>`}
  </section>`;
}

/* ------------------------------------------------------------ chapter 23: sign */

/** Whether the surveyor has opened a chapter that must be opened before approval. */
function opened(r: A.Readiness, n: number): boolean {
  return r.must_read.includes(n) && !r.unread.includes(n);
}

/** Each thing approval needs, in the order a surveyor would put them right: ticked, or what is missing. */
const CHECKS: readonly { key: string; done: string }[] = Object.freeze([
  { key: 'surveyor', done: 'A surveyor is assigned.' },
  { key: 'property', done: 'The pack says which property it is for.' },
  { key: 'sums', done: 'Every value is in. The sums are complete.' },
  { key: 'legal', done: 'The legal check allows it.' },
  { key: 'read', done: 'Every chapter has been opened.' },
  { key: 'basis', done: 'You have said how you inspected.' },
  { key: 'details', done: 'The RICS number is on file.' },
  { key: 'estimate', done: 'The job has its locked estimate.' },
]);

function signChapter(d: PackPageDeps, actor: Actor, v: P.PackView, r: A.Readiness, q: URLSearchParams): Safe {
  const blocked = new Map(r.blockers.map((b) => [b.key, b] as const));
  const editDetails = r.may_approve && (r.details === null || q.get('details') === '1');
  return h`
    <p class="lede">Read the pack, then approve it with one click. The button stays grey until every line below is ticked, like reading terms before you accept them.</p>
    ${r.current === null ? raw('') : h`<div class="pk-approved" role="status"><strong>This version is approved: version ${String(r.current.version)}</strong>, by ${r.current.approver_name}, ${d.stamp(r.current.approved_at)}. <a href="${base(v.job.id)}/version/${String(r.current.version)}">See it as approved</a>. Change anything in the pack to approve a new version.</div>`}
    <ul class="pk-checks">${CHECKS.map((c) => {
      const b = blocked.get(c.key);
      return b === undefined ? h`<li class="pk-ok">✓ ${c.done}</li>`
        : h`<li>✗ ${b.words}${b.href === null ? raw('') : h` <a href="${b.href}">Put it right</a>`}</li>`;
    })}</ul>
    <h2 id="details">The surveyor</h2>
    <p>${v.job.surveyor_name ?? 'Nobody is assigned yet.'}${r.details === null ? raw('') : h` · RICS number ${r.details.rics_number}${r.details.firm === null ? '' : ` · ${r.details.firm}`}`}
      ${r.may_approve && !editDetails ? h` <a href="${base(v.job.id)}?ch=23&details=1#details">Change</a>` : raw('')}</p>
    ${editDetails ? h`<form method="post" action="${base(v.job.id)}/details" class="pk-add"><input type="hidden" name="ch" value="23">
      <div class="pk-fields"><label>Your RICS membership number <input class="fi" name="rics_number" inputmode="numeric" autocomplete="off" maxlength="12" required value="${r.details?.rics_number ?? ''}"></label>
        <label>Your firm (if any) <input class="fi" name="firm" maxlength="200" value="${r.details?.firm ?? ''}"></label></div>
      <p class="help">These go on every report you approve, with your name. You give them once.</p>
      <div class="sendrow"><button class="cta" type="submit">Save my details</button>${r.details === null ? raw('') : h`<a href="${base(v.job.id)}?ch=23#details">Cancel</a>`}</div></form>` : raw('')}
    <div class="pk-decl"><h2>The declaration</h2><p>By approving, the surveyor signs this:</p>
      <ol>${A.DECLARATION.map((x) => h`<li>${x}</li>`)}</ol>
      <p class="help">And this note goes at the end of the report: “${A.AUTOMATION_NOTE}”</p></div>
    ${r.may_approve ? h`<form method="post" action="${base(v.job.id)}/approve" class="pk-approve"><input type="hidden" name="seq" value="${String(r.pack_seq)}"><input type="hidden" name="legal_seq" value="${String(r.legal_seq)}"><input type="hidden" name="ch" value="23">
      <button class="cta" type="submit"${r.ready ? raw('') : raw(' disabled')}>Approve and sign this report</button>
      <p class="help">${r.ready ? 'One click. The report is then kept as it stands, with your name, RICS number and a fingerprint. Your figures go to the claim.' : 'The button turns on when every line above is ticked.'}</p></form>`
      : h`<p class="help">Only the assigned surveyor${v.job.surveyor_name === null ? '' : `, ${v.job.surveyor_name},`} approves this pack.</p>`}
    <h2>Approved versions (${String(r.approvals.length)})</h2>
    ${r.approvals.length === 0 ? h`<p class="help">None yet. Each approval is kept for ever. A later change makes a new version and leaves the old one as it was.</p>`
      : h`<table class="pk-table"><thead><tr><th>Version</th><th>Approved by</th><th>When</th><th>Fingerprint</th><th></th></tr></thead><tbody>
        ${r.approvals.map((a) => h`<tr><td>${String(a.version)}</td><td>${a.approver_name}</td><td>${d.stamp(a.approved_at)}</td><td class="pk-fp">${a.fingerprint.slice(0, 16)}…</td><td><a href="${base(v.job.id)}/version/${String(a.version)}">Open</a> · <a href="${base(v.job.id)}/version/${String(a.version)}/report">The client’s report</a></td></tr>`)}</tbody></table>`}
    ${sendPanel(d, actor, v, r, q)}`;
}

function approveCard(v: P.PackView, r: A.Readiness): Safe {
  const left = r.blockers.filter((b) => b.key !== 'approved').length;
  return h`<section class="pk-card"><h2>Approval</h2>
    <p>${r.current !== null ? h`<span class="pk-lv pk-lv-green">Approved · version ${String(r.current.version)}</span>`
      : left === 0 ? h`<span class="pk-lv pk-lv-green">Ready to approve</span>`
        : h`<span class="pk-lv pk-lv-amber">${String(left)} thing${left === 1 ? '' : 's'} first</span>`}</p>
    <p class="help">Chapters opened: ${String(r.must_read.length - r.unread.length)} of ${String(r.must_read.length)}. <a href="${base(v.job.id)}?ch=23">Go to Sign</a></p></section>`;
}

/* ------------------------------------------------------------ an approved version */

function versionPage(d: PackPageDeps, actor: Actor, v: P.PackView, kept: NonNullable<ReturnType<typeof A.approvedVersion>>): string {
  const x = kept.snapshot;
  const live = x.lines.filter((l) => !l.removed);
  const out = x.lines.filter((l) => l.removed);
  const body = h`
    <p class="eyebrow">${x.business.name} · Survey pack</p>
    <h1>Version ${String(x.version)}, as approved</h1>
    ${kept.fingerprint_holds
      ? h`<div class="pk-approved" role="status"><strong>The fingerprint holds.</strong> This is exactly what was approved. Nothing in it has changed since.</div>`
      : h`<div class="pk-fp-bad" role="alert"><strong>The fingerprint does not match.</strong> This copy is not what was approved. Do not rely on it, and tell the office.</div>`}
    <p>Approved by <strong>${x.surveyor.name}</strong>, RICS number ${x.surveyor.rics_number}${x.surveyor.firm === null ? '' : `, ${x.surveyor.firm}`}, ${d.stamp(x.approved_at)}.</p>
    <p class="help">Fingerprint: <span class="pk-fp">${kept.row.fingerprint}</span></p>
    <p>Property: ${x.property === null ? '—' : `${x.property.label}${x.property.postcode === null ? '' : `, ${x.property.postcode}`}`}</p>
    <h2>The sums</h2>
    <dl class="pk-dl">
      <div><dt>Price paid</dt><dd>${PENCE(x.inputs.price_paid_pence.value)}</dd></div>
      <div><dt>Bare land</dt><dd>${PENCE(x.inputs.land_pence.value)}</dd></div>
      <div><dt>The building</dt><dd>${PENCE(x.sums.building_price_pence)}</dd></div>
      <div><dt>Rebuild cost today</dt><dd>${PENCE(x.sums.rebuild_pence)}</dd></div>
      <div><dt>Spend that qualifies</dt><dd>${PENCE(x.sums.qualifying_pence)}</dd></div>
      <div><dt>Main pool</dt><dd>${PENCE(x.sums.main_pool_pence)}</dd></div>
      <div><dt>Special rate pool</dt><dd>${PENCE(x.sums.special_pool_pence)}</dd></div>
      <div><dt>Share of the building</dt><dd>${PCT(x.sums.share_bp)}</dd></div>
    </dl>
    <h2>The elements (${String(live.length)})</h2>
    <div class="pk-scroll"><table class="pk-table pk-lines"><thead><tr><th>Element</th><th class="n">How much</th><th class="n">Rate</th><th class="n">Rebuild cost</th><th class="n">Qualifies</th><th class="n">Qualifying cost</th><th>Pool</th></tr></thead><tbody>
      ${live.map((l) => h`<tr><td>${l.label}<br><span class="help">${l.element_id ?? 'Added'}${l.unit === '' ? '' : ` · ${l.unit}`}</span></td>
        ${valueCell(d, l.qty_milli, QTY)}${valueCell(d, l.rate_pence, PENCE)}<td class="n">${PENCE(l.cost_pence)}</td>${valueCell(d, l.qpct_bp, PCT)}<td class="n">${PENCE(l.qualifying_pence)}</td>
        <td>${l.pool === null ? '—' : l.pool === 'MP' ? 'Main' : 'Special'}</td></tr>`)}
      <tr class="pk-tot"><th scope="row">Total</th><td></td><td></td><td class="n">${PENCE(x.sums.elements_cost_pence)}</td><td></td><td class="n">${PENCE(x.sums.elements_qualifying_pence)}</td><td></td></tr></tbody></table></div>
    ${out.length === 0 ? raw('') : h`<p class="help">Taken out: ${out.map((l) => l.label).join('; ')}.</p>`}
    <h2>The legal check</h2>
    <p><span class="pk-lv pk-lv-${x.legal.verdict.level.toLowerCase()}">${LEVEL_WORDS[x.legal.verdict.level]}</span> ${x.legal.verdict.headline}</p>
    ${x.legal.answers.length === 0 ? raw('') : h`<ul>${x.legal.answers.map((a) => {
      const lq = L.legalQuestions(x.job.sector).find((y) => y.id === a.question_id);
      return h`<li>${a.ask} <strong>${lq === undefined ? String(a.value) : L.answerWords(lq, a.value)}</strong> <span class="help">— ${a.by}, from: ${a.source}</span></li>`;
    })}</ul>`}
    <h2>The surveyor’s changes (${String(x.changes.length)})</h2>
    ${x.changes.length === 0 ? h`<p class="help">None. Every figure is from the evidence or our draft, as marked.</p>`
      : h`<ol class="pk-log">${x.changes.map((c) => h`<li><strong>${c.by_name}</strong> ${c.words}${c.line_label === null ? '' : ` on ${c.line_label}`}. “${c.reason}” <span class="help">${d.stamp(c.at)}</span></li>`)}</ol>`}
    <div class="pk-decl"><h2>The declaration</h2><ol>${x.declaration.map((s) => h`<li>${s}</li>`)}</ol></div>
    <p class="help">${x.automation_note}</p>
    <p><a href="${base(v.job.id)}/version/${String(x.version)}/report">The client’s report</a> · <a href="${base(v.job.id)}/version/${String(x.version)}/report.pdf">its PDF</a> · <a href="${base(v.job.id)}?ch=23">Back to the pack</a></p>`;
  return page({ title: `Survey pack version ${String(x.version)} · ${x.business.name}`, nav: d.nav(actor), wide: true, body });
}
