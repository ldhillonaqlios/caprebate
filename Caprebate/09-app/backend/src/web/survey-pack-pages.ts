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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as P from './survey-pack.ts';
import * as L from './pack-legal.ts';
import * as A from './pack-approve.ts';
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
  const m = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack(\/value|\/line|\/revert|\/remove|\/restore|\/add|\/property|\/legal|\/details|\/approve)?$/.exec(url.pathname);
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
  let r: P.PackResult;
  switch (act) {
    case 'value': r = P.savePackValue(deps, actor, job, { field: f.get('field') ?? '', value: f.get('value') ?? '', reason, seq }); break;
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
  if (q.get('stale') === '1') notes.push(h`<div class="gate" role="alert"><strong>This pack changed since you opened it.</strong> Here it is again with that change. Make yours again if it still applies.</div>`);
  const body = h`
    ${notes}
    <p class="eyebrow">${v.job.business_name} · Survey pack</p>
    ${v.property === null ? propertyChooser(v, ch) : raw('')}
    <div class="pack">
      <nav class="pack-ch" aria-label="The pack's chapters"><p class="pack-ch-h">The pack · ${String(CHAPTERS.length)} chapters</p>
        <ol>${CHAPTERS.map((c) => h`<li><a href="${base(v.job.id)}?ch=${String(c.n)}"${c.n === ch ? raw(' aria-current="page"') : raw('')}${c.built ? raw('') : raw(' class="pk-later"')}>${String(c.n)} · ${c.title}${opened(ready, c.n) ? h` <span class="pk-tick" title="Opened">✓</span>` : raw('')}</a></li>`)}</ol>
        <p class="pk-key"><span class="pk-src pk-ev">Evidence</span> <span class="pk-src pk-dr">Our draft</span> <span class="pk-src pk-sv">The surveyor</span> <span class="pk-src pk-need">needed</span></p>
      </nav>
      <article class="pack-book">
        <h1>${String(chapter.n)} · ${chapter.title}</h1>
        ${ch === 4 ? summaryChapter(v) : ch === 7 ? legalChapter(d, v, lv, ch, q) : ch === 9 ? inputsChapter(d, v, ch, q) : ch === 10 ? elementsChapter(d, v, ch, q)
          : ch === 23 ? signChapter(d, v, ready, q)
          : h`<p class="help">This chapter is filled in at the next stage of the build. For now, the sums are in chapters 4, 9 and 10.</p>`}
      </article>
      <aside class="pack-side">${approveCard(v, ready)}${totalsCard(v)}${legalCard(v, lv)}${changesCard(d, v)}</aside>
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

/** An answer as words: the option's label, a list of labels, a date or an amount. */
function answerWords(q: L.EngineQuestion, value: unknown): string {
  const label = (k: unknown) => q.opts?.find((o) => o[0] === k)?.[1] ?? String(k);
  if (Array.isArray(value)) return value.length === 0 ? 'none of these' : value.map(label).join('; ');
  if (q.type === 'currency' && typeof value === 'number') return poundsWords(Math.round(value * 100));
  if (q.type === 'percent' && typeof value === 'number') return `${String(value)}%`;
  return label(value);
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
        ${a === undefined ? raw('') : h`<p class="pk-q-ans">${answerWords(x, a.value)} <span class="pk-src pk-sv">${a.by_name} · ${d.stamp(a.at)}</span> <span class="help">From: ${a.source_note}</span>
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
  { key: 'details', done: 'The RICS number is on file.' },
  { key: 'estimate', done: 'The job has its locked estimate.' },
]);

function signChapter(d: PackPageDeps, v: P.PackView, r: A.Readiness, q: URLSearchParams): Safe {
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
        ${r.approvals.map((a) => h`<tr><td>${String(a.version)}</td><td>${a.approver_name}</td><td>${d.stamp(a.approved_at)}</td><td class="pk-fp">${a.fingerprint.slice(0, 16)}…</td><td><a href="${base(v.job.id)}/version/${String(a.version)}">Open</a></td></tr>`)}</tbody></table>`}`;
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
      return h`<li>${a.ask} <strong>${lq === undefined ? String(a.value) : answerWords(lq, a.value)}</strong> <span class="help">— ${a.by}, from: ${a.source}</span></li>`;
    })}</ul>`}
    <h2>The surveyor’s changes (${String(x.changes.length)})</h2>
    ${x.changes.length === 0 ? h`<p class="help">None. Every figure is from the evidence or our draft, as marked.</p>`
      : h`<ol class="pk-log">${x.changes.map((c) => h`<li><strong>${c.by_name}</strong> ${c.words}${c.line_label === null ? '' : ` on ${c.line_label}`}. “${c.reason}” <span class="help">${d.stamp(c.at)}</span></li>`)}</ol>`}
    <div class="pk-decl"><h2>The declaration</h2><ol>${x.declaration.map((s) => h`<li>${s}</li>`)}</ol></div>
    <p class="help">${x.automation_note}</p>
    <p><a href="${base(v.job.id)}?ch=23">Back to the pack</a></p>`;
  return page({ title: `Survey pack version ${String(x.version)} · ${x.business.name}`, nav: d.nav(actor), wide: true, body });
}
