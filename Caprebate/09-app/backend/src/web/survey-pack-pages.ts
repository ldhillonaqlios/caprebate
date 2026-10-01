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
 *
 * Every number on these pages says where it came from: the evidence, our draft, or the surveyor's own name. Every form
 * carries the pack's counter (`seq`), so a change from an out-of-date page is refused, never applied blind.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as P from './survey-pack.ts';
import { percentWords, poundsWords, quantityWords, type Source, type Valued } from './pack-sums.ts';

export type PackPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

/** The report's 23 chapters, in the report template's order (surveyor-valuation-report-template-v2.md). */
export const CHAPTERS: readonly { readonly n: number; readonly title: string; readonly built: boolean }[] = Object.freeze([
  { n: 1, title: 'Report and property', built: false }, { n: 2, title: 'Your inspection', built: false },
  { n: 3, title: 'Purpose and basis', built: false }, { n: 4, title: 'Summary', built: true },
  { n: 5, title: 'The building', built: false }, { n: 6, title: 'Room schedule', built: false },
  { n: 7, title: 'Ownership', built: false }, { n: 8, title: 'Dwellings', built: false },
  { n: 9, title: 'Price, land and floor area', built: true }, { n: 10, title: 'Rebuild cost and split', built: true },
  { n: 11, title: 'Bare land', built: false }, { n: 12, title: 'Fixtures, item by item', built: false },
  { n: 13, title: 'Pools', built: false }, { n: 14, title: 'Qualifying share', built: false },
  { n: 15, title: 'Grants and VAT', built: false }, { n: 16, title: 'Leaseback', built: false },
  { n: 17, title: 'Structures allowance', built: false }, { n: 18, title: 'Other reliefs', built: false },
  { n: 19, title: 'Judgement calls', built: false }, { n: 20, title: 'Repairs or capital', built: false },
  { n: 21, title: 'Limits', built: false }, { n: 22, title: 'Findings', built: false }, { n: 23, title: 'Sign', built: false },
]);

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

const base = (job: string) => `/staff/survey/${job}/pack`;

export async function handleSurveyPack(
  d: PackPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const m = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack(\/value|\/line|\/revert|\/remove|\/restore|\/add|\/property)?$/.exec(url.pathname);
  if (m === null) return 'not-mine';
  const job = m[1] ?? '';
  const act = m[2]?.slice(1);
  const deps: P.PackDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  if (act === undefined && method === 'GET') {
    const v = P.packView(deps, actor, job);
    const ch = Number(url.searchParams.get('ch') ?? '10');
    res.writeHead(200, HTML_HEADERS);
    res.end(packPage(d, actor, v, CHAPTERS.some((c) => c.n === ch) ? ch : 10, url.searchParams));
    return 'handled';
  }
  if (act === undefined || method !== 'POST') return 'not-mine';

  const f = await form(req);
  const ch = /^\d{1,2}$/.test(f.get('ch') ?? '') ? f.get('ch') as string : '10';
  const back = (extra = '') => `${base(job)}?ch=${ch}${extra}`;
  const seq = f.get('seq') ?? '';
  const reason = f.get('reason') ?? '';
  const line = f.get('line') ?? '';
  let r: P.PackResult;
  switch (act) {
    case 'value': r = P.savePackValue(deps, actor, job, { field: f.get('field') ?? '', value: f.get('value') ?? '', reason, seq }); break;
    case 'line': r = P.saveLine(deps, actor, job, { line, qty: f.get('qty') ?? '', rate: f.get('rate') ?? '', qpct: f.get('qpct') ?? '', pool: f.get('pool') ?? '', reason, seq }); break;
    case 'revert': r = P.revertLine(deps, actor, job, { line, reason, seq }); break;
    case 'remove': r = P.setLineRemoved(deps, actor, job, { line, reason, seq }, true); break;
    case 'restore': r = P.setLineRemoved(deps, actor, job, { line, reason, seq }, false); break;
    case 'add': r = P.addLine(deps, actor, job, { label: f.get('label') ?? '', unit: f.get('unit') ?? '', qty: f.get('qty') ?? '', rate: f.get('rate') ?? '', qpct: f.get('qpct') ?? '', pool: f.get('pool') ?? '', reason, seq }); break;
    default: r = P.choosePackProperty(deps, actor, job, f.get('property_id') ?? '');
  }
  if (!r.ok && r.stale === true) { redirect(res, back('&stale=1')); return 'handled'; }
  if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, back(line === '' ? '' : `&edit=${encodeURIComponent(line)}#l-${line}`), r.field);
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

function packPage(d: PackPageDeps, actor: Actor, v: P.PackView, ch: number, q: URLSearchParams): string {
  const s = v.sums;
  const chapter = CHAPTERS.find((c) => c.n === ch) ?? CHAPTERS[9]!;
  const notes: Safe[] = [];
  if (q.get('done') === 'saved') notes.push(h`<div class="gate" role="status">Saved, under your name. Every total follows.</div>`);
  if (q.get('stale') === '1') notes.push(h`<div class="gate" role="alert"><strong>This pack changed since you opened it.</strong> Here it is again with that change. Make yours again if it still applies.</div>`);
  const body = h`
    ${notes}
    <p class="eyebrow">${v.job.business_name} · Survey pack</p>
    ${v.property === null ? propertyChooser(v, ch) : raw('')}
    <div class="pack">
      <nav class="pack-ch" aria-label="The pack's chapters"><p class="pack-ch-h">The pack · ${String(CHAPTERS.length)} chapters</p>
        <ol>${CHAPTERS.map((c) => h`<li><a href="${base(v.job.id)}?ch=${String(c.n)}"${c.n === ch ? raw(' aria-current="page"') : raw('')}${c.built ? raw('') : raw(' class="pk-later"')}>${String(c.n)} · ${c.title}</a></li>`)}</ol>
        <p class="pk-key"><span class="pk-src pk-ev">Evidence</span> <span class="pk-src pk-dr">Our draft</span> <span class="pk-src pk-sv">The surveyor</span> <span class="pk-src pk-need">needed</span></p>
      </nav>
      <article class="pack-book">
        <h1>${String(chapter.n)} · ${chapter.title}</h1>
        ${ch === 4 ? summaryChapter(v) : ch === 9 ? inputsChapter(d, v, ch, q) : ch === 10 ? elementsChapter(d, v, ch, q)
          : h`<p class="help">This chapter is filled in at the next stage of the build. For now, the sums are in chapters 4, 9 and 10.</p>`}
      </article>
      <aside class="pack-side">${totalsCard(v)}${changesCard(d, v)}</aside>
    </div>
    <p><a href="/staff/survey/${v.job.id}">Back to the survey job</a></p>`;
  void actor;
  return page({ title: `Survey pack · ${v.job.business_name}`, nav: d.nav(actor), wide: true, body });
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
      <div>Less bare land<b>${i.land_pence.value === null ? '—' : `− ${PENCE(i.land_pence.value)}`}</b><span>Chapter 9</span></div>
      <div>The building<b>${PENCE(s.building_price_pence)}</b><span>price less land</span></div>
      <div>Rebuild cost today<b>${PENCE(s.rebuild_pence)}</b><span>floor area × rate</span></div>
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
    ${s.needed.length === 0 ? raw('') : h`<h2>Still needed (${String(s.needed.length)})</h2>
      <p class="help">There is no total until every value is in. We never fill a gap with a guess.</p>
      <ul class="pk-needed">${s.needed.slice(0, 60).map((n) => h`<li><a href="${base(v.job.id)}?ch=${n.where === 'INPUT' ? '9' : '10'}${n.line_id === null ? '' : `&edit=${encodeURIComponent(n.line_id)}#l-${n.line_id}`}">${n.words}</a></li>`)}</ul>
      ${s.needed.length > 60 ? h`<p class="help">… and ${String(s.needed.length - 60)} more.</p>` : raw('')}`}`;
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
    ${v.inputs.building_rate_pence.value === null ? h`<p class="help">The whole-building rate comes from BCIS. Until BCIS is bought, the surveyor types it, and it is theirs.</p>` : raw('')}`;
}

/* ------------------------------------------------------------ chapter 10 */

function elementsChapter(d: PackPageDeps, v: P.PackView, ch: number, q: URLSearchParams): Safe {
  const editing = q.get('edit');
  const sumOf = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  const live = v.lines.filter((l) => !l.removed);
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
      <td>${l.label}<br><span class="help">${l.element_id ?? 'Added'}${l.unit === '' ? '' : ` · ${l.unit}`}${judgement ? ' · a judgement call' : ''}</span>
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
