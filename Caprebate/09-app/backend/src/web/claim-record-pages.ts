/**
 * THE CLAIM'S FACTS, FIGURES, SIGN-OFF, DELIVERABLES AND AFTERCARE — ROUTES AND
 * PANELS. CRM 6 of 10, 11 September 2026.
 *
 * Same shape as every other section: `handleClaimRecord` returns 'not-mine' for
 * anything it does not own, and staff.ts mounts it with one line. Every route
 * here is a POST to a claim; the panels are drawn on the claim page by
 * src/web/crm-pages.ts from what src/web/crm.ts put in the claim's view — the
 * same object `view.json` serves, so tools/payload-proof.ts inspects the wire.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/claim-facts.ts and
 * src/web/claim-record.ts authorise every write on the claim and do every
 * derivation. Every staff-supplied value is drawn through `h`, which escapes it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { badge, breadcrumb, claimHref, moreDetail, why } from './components.ts';
import { can } from '../authz.ts';
import { openClaimQuestions, sendTaskToPortal } from './engaged.ts';
import { formatPence } from './shown-range.ts';
import * as F from './claim-facts.ts';
import * as R from './claim-record.ts';
import { recordClientFilingConfirmation } from './client-filing.ts';
import { recordFeeDiscount } from './fee-discounts.ts';
import type { ReleasedFacts } from '../payload.ts';

export type WebResult = 'handled' | 'not-mine';

export type ClaimRecordPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

function posted(f: URLSearchParams, names: readonly string[]): F.Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

const ID = '([A-Za-z0-9-]+)';

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleClaimRecord(
  d: ClaimRecordPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor, form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  if (method !== 'POST') return 'not-mine';
  const path = url.pathname;
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const back = (id: string): string => `/staff/claims/${id}`;
  const finish = (id: string, r: { ok: true } | { ok: false; why: string; field?: string }, title: string, done: string, anchor = ''): 'handled' => {
    // PHASE 133e (D4, continued): where the store named the posted field, the refusal is drawn beside it.
    if (!r.ok) return d.problem(res, actor, title, r.why, `${back(id)}${anchor}`, r.field);
    redirect(res, `${back(id)}?done=${done}${anchor}`);
    return 'handled';
  };

  let m = new RegExp(`^/staff/claims/${ID}/facts$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.recordFact(deps, actor, id, posted(await form(req), ['fact_key', 'answer', 'value', 'source_id', 'note'])), 'Fact not recorded', 'saved');
  }
  // PHASE 143: the grants routes send a person back to the grants section, which opens because it was just changed.
  m = new RegExp(`^/staff/claims/${ID}/grants$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.recordGrant(deps, actor, id, posted(await form(req),
      ['kind', 'payer_class', 'amount', 'amount_basis', 'traced', 'traced_elements', 'element_ids', 'source_id', 'note'])), 'Grant not saved', 'grants', GRANTS_ANCHOR);
  }
  // PHASE 153a: the two grant facts the gate out of valuation reads (src/web/grant-checks.ts), from the grants section,
  // and back to it. Only those two keys: every other fact is recorded on the facts panel, as before.
  m = new RegExp(`^/staff/claims/${ID}/grants/fact$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    const f = posted(await form(req), ['fact_key', 'answer', 'value', 'source_id']);
    if (f['fact_key'] !== 'GRANT_PROVIDER_CHECKED' && f['fact_key'] !== 'GRANT_SPLIT_ADVISER_VIEW') {
      return finish(id, { ok: false, why: 'That is not one of the grant checks.' }, 'Answer not saved', 'grants', GRANTS_ANCHOR);
    }
    return finish(id, F.recordFact(deps, actor, id, f), 'Answer not saved', 'grants', GRANTS_ANCHOR);
  }
  m = new RegExp(`^/staff/claims/${ID}/grants/${ID}/withdraw$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    const f = await form(req);
    return finish(id, F.withdrawGrant(deps, actor, id, m[2] ?? '', f.get('reason')), 'Grant not removed', 'grants', GRANTS_ANCHOR);
  }
  // PHASE 143: "Did anyone else pay for any of this work?" — Yes, No or Not sure, recorded as the same fact as before.
  m = new RegExp(`^/staff/claims/${ID}/grants/answer$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return answerGrantsQuestion(d, deps, res, actor, id, await form(req), finish);
  }
  // PHASE 143: the step-by-step "Add a grant" pages. Every step is a POST, so nothing typed is ever in the address.
  m = new RegExp(`^/staff/claims/${ID}/grants/new$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return grantStepPage(d, res, actor, id, await form(req));
  }
  m = new RegExp(`^/staff/claims/${ID}/owners$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.recordOwner(deps, actor, id, posted(await form(req), ['position', 'owner', 'acquired_on', 'ceased_on', 'claimed', 'source_id'])),
      'Owner not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/owners/${ID}/withdraw$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.withdrawOwner(deps, actor, id, m[2] ?? ''), 'Owner not withdrawn', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/signoff$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    const f = await form(req);
    const fields = { ...posted(f, ['adviser', 'credential', 'signed_on', 'scope', 'method_note', 'figure', 'approval_id']), confirmed_switches: f.getAll('switch').join(',') };
    return finish(id, R.recordSignOff(deps, actor, id, fields), 'Sign-off not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/deliverables$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, R.recordDeliverable(deps, actor, id, posted(await form(req), ['kind', 'action', 'issued_on', 'content_hash'])),
      'Deliverable not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/reconciliation/(filing|variance|outcome)$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    const f = await form(req);
    const r = m[2] === 'filing' ? R.recordFiling(deps, actor, id, posted(f, ['filed_on']))
      : m[2] === 'variance' ? R.recordVariance(deps, actor, id, posted(f, ['variance_category', 'variance_notes']))
        : R.recordOutcome(deps, actor, id, posted(f, ['withdrawn', 'amount_realised']));
    return finish(id, r, 'Reconciliation not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/enquiries$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, R.openEnquiry(deps, actor, id, posted(await form(req), ['opened_on', 'note'])), 'Enquiry not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/enquiries/${ID}/close$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, R.closeEnquiry(deps, actor, id, m[2] ?? '', posted(await form(req), ['closed_on', 'outcome', 'amended_figure'])),
      'Enquiry not closed', 'saved');
  }
  // Phase 132e: the client's own written filing confirmation, where the client has no accountant (src/web/client-filing.ts).
  m = new RegExp(`^/staff/claims/${ID}/client-filing-confirmation$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, recordClientFilingConfirmation(deps, actor, id, posted(await form(req),
      ['no_accountant_or_adviser', 'will_file_amendment', 'last_day_acknowledged', 'last_day_stated', 'remains_responsible', 'written_evidence'])),
      'Client filing confirmation not recorded', 'saved');
  }
  // Phase 132e: a multi-site discount proposed on this claim's fee — recorded, never applied (src/web/fee-discounts.ts).
  m = new RegExp(`^/staff/claims/${ID}/fee-discount$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, recordFeeDiscount(deps, actor, id, posted(await form(req), ['discount_percent', 'reason'])), 'Discount not recorded', 'saved');
  }
  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * THE PANELS
 * ------------------------------------------------------------------ */

/* A ROW MAY CARRY A SENTENCE SAYING WHAT THE FACT DOES — Phase 132, 15 September 2026. Without one it is drawn as before. */
function reading(r: F.FactReading, says?: string): Safe {
  const src = r.source === null ? h`<span class="help">never recorded</span>`
    : h`<span class="help">${r.source.publisher}${r.source.derived ? ' · worked out' : ''} · ${r.source.locator}${
      r.source.recorded_at === null ? '' : ` · ${r.source.recorded_at}`}${r.source.recorded_by === null ? '' : ` by ${r.source.recorded_by}`}</span>`;
  const help = says === undefined ? raw('') : h`<br><span class="help">${says}</span>`;
  return h`<tr><td>${r.label}</td><td>${r.known ? r.display : h`<span class="help">${r.display}</span>`}</td><td>${src}${help}</td></tr>`;
}

function options(vocab: Readonly<Record<string, string>>): Safe[] {
  return Object.entries(vocab).map(([k, v]) => h`<option value="${k}">${v}</option>`);
}

/** The facts panel — for ADMIN and SALES the whole of it; for a surveyor the released inputs alone. */
/** The released facts' names, in words. A key not here is shown by its key, never dropped. */
const RELEASED_FACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  claimant_type: 'The claimant, for tax', jurisdiction: 'Jurisdiction of the property', acquisition_date: 'The acquisition date',
  election_exists: 'A s.198 or s.199 election affects the property', election_section: 'The section it was made under',
  election_notified_on: 'The date it was notified to HMRC', election_elements: 'The fixtures it covers',
  prior_owner_chain: 'The previous owners, in order', grants_exist: 'Did anyone else pay for any of this work?',
  grants_traced: 'Each grant, and whether it is matched to the items it paid for', buyer_alterations: 'The buyer made their own alterations to install plant',
});

/** One released value, in words: a reading's display, a list of rows, or not known — never a raw object. */
function releasedValue(v: unknown): Safe {
  if (Array.isArray(v)) {
    if (v.length === 0) return h`<span class="help">not known</span>`; // PHASE 133c: a deciding fact with nothing recorded is not known, and says so
    return h`<ul>${v.map((row) => h`<li>${Object.values(row as Record<string, unknown>).filter((x) => x !== null && x !== undefined && x !== '').map(String).join(' · ')}</li>`)}</ul>`;
  }
  if (v !== null && typeof v === 'object' && 'display' in v) {
    const r = v as { known?: boolean; display?: unknown };
    return r.known === true ? h`${String(r.display)}` : h`<span class="help">${String(r.display ?? 'not known')}</span>`;
  }
  return h`<span class="help">not known</span>`;
}

export function factsBlock(claim_id: string, facts: F.FactsPanel | ReleasedFacts | undefined): Safe {
  if (facts === undefined) return raw('');
  if ('released_to_surveyor' in facts) {
    // THE CRM FOLLOW-ON: drawn as a table a surveyor reads, not as raw JSON. The same released list, and nothing added.
    return h`<div class="pblock"><p class="help">${facts.notice}</p>
      <table><tbody>${(Object.keys(facts.facts) as (keyof typeof facts.facts)[]).map((k) => h`<tr><th>${RELEASED_FACT_LABELS[k] ?? k}</th><td>${releasedValue(facts.facts[k])}</td></tr>`)}</tbody></table></div>`;
  }
  const p = facts;
  const w = p.amendment_window;
  // PHASE 138: inside the claim page's "The claim's facts" section, which names it; the sentence behind "Why?"; the
  // recording forms behind one fold. PHASE 143 moved grants and contributions out to a section of their own (grantsBlock).
  return h`<div class="pblock">
    <div class="help">${why('We work a fact out from a public record first, and only type it in where nothing gives it. Every value says where it came from. “Not known” and “never recorded” are treated the same, and neither counts in the client’s favour.')}</div>
    <table><tbody>
      ${reading(p.claimant_type)}${reading(p.scottish_taxpayer)}${reading(p.jurisdiction)}${reading(p.acquisition_date)}
      ${reading(p.accounting_period.start)}${reading(p.accounting_period.end)}
      ${reading(p.partnership_company_member, 'Only for a partnership or an LLP. If a partner is a company, the return is due on the company date where that is earlier (TMA 1970 s.12AA(5B)). If this is not known, the window counts as open only if it is open on both dates.')}
      <tr><td>The amendment window</td><td>${w.state === 'UNKNOWN' ? h`<span class="help">${w.why}</span>` : w.why}</td><td><span class="help">${w.assumption ?? 'our amendment window rule'}</span></td></tr>
      ${reading(p.taxable_profit.sufficient_profit)}
      <tr><td>The break-even switch</td><td>${p.taxable_profit.breakeven_switch.on ? 'on' : 'off'}</td><td><span class="help">${p.taxable_profit.breakeven_switch.question}</span></td></tr>
      ${reading(p.allowance_headroom.position)}${reading(p.allowance_headroom.amount)}
      ${reading(p.pool_split.main)}${reading(p.pool_split.special)}
      <tr><td>Workstream</td><td>${p.structures_and_buildings.workstream}</td><td></td></tr>
      ${reading(p.structures_and_buildings.qualifying_expenditure)}
      ${reading(p.election.exists)}${reading(p.election.section)}${reading(p.election.notified_on)}${reading(p.election.value)}${reading(p.election.elements)}
      <tr><td>The election, resolved</td><td>${p.election.resolved.met ? 'resolved' : h`<span class="help">unresolved</span>`}</td><td><span class="help">${p.election.resolved.why}</span></td></tr>
      ${reading(p.acquisition_costs.costs)}${reading(p.acquisition_costs.transaction_tax)}
      <tr><td>${p.acquisition_costs.switch.name}</td><td>${p.acquisition_costs.switch.on ? 'on' : 'off'}</td><td><span class="help">${p.acquisition_costs.switch.says}</span></td></tr>
      ${reading(p.buyer_alterations.made)}${reading(p.buyer_alterations.amount)}
      <tr><td>${p.buyer_alterations.switch.name}</td><td>${p.buyer_alterations.switch.on ? 'on' : 'off'}</td><td><span class="help">${p.buyer_alterations.switch.says}</span></td></tr>
    </tbody></table>
    <h3>Previous owners</h3>
    ${p.election.prior_owner_chain.length === 0 ? h`<p class="help">No owner is recorded.</p>` : h`<table><tbody>${p.election.prior_owner_chain.map((o) => h`<tr>
      <td>${o.position}</td><td>${o.owner}</td><td>${o.acquired_on ?? 'acquired: not known'} – ${o.ceased_on ?? 'ceased: not known'}</td><td>${o.claimed}</td>
      <td>${p.may_record ? h`<form method="post" action="/staff/claims/${claim_id}/owners/${o.id}/withdraw" class="inline"><button type="submit">Withdraw</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
    ${!p.may_record ? raw('') : h`<details id="record-fact"><summary>Record a fact or an owner</summary>
      <form method="post" action="/staff/claims/${claim_id}/facts">
        <label>Fact <select name="fact_key">${Object.entries(F.FACTS).filter(([k]) => k !== 'GRANTS_EXIST').map(([k, v]) => h`<option value="${k}">${v.label}</option>`)}</select></label>
        <label>Answer <select name="answer"><option value="VALUE">This value</option><option value="UNKNOWN">Not known</option></select></label>
        <label>Value <input name="value" placeholder="a date like 2026-03-31, pounds, or a choice like YES"></label>
        <label>Source <select name="source_id">${options(F.CAPTURE_SOURCES)}</select></label>
        <label>Note <input name="note"></label>
        <button type="submit">Record the fact</button></form>
      <form method="post" action="/staff/claims/${claim_id}/owners">
        <label>Position <input name="position" type="number" min="1" max="20"></label>
        <label>Owner — a company or a role, never a person <input name="owner"></label>
        <label>Acquired <input name="acquired_on" type="date"></label>
        <label>Ceased <input name="ceased_on" type="date"></label>
        <label>Claimed <select name="claimed"><option value="UNKNOWN">Not known</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
        <label>Source <select name="source_id">${options(F.CAPTURE_SOURCES)}</select></label>
        <button type="submit">Record the owner</button></form></details>`}
  </div>`;
}

function sealed<T>(s: R.Sealed<T>, draw: (x: T) => Safe): Safe {
  return s.state === 'NOT_YET' ? h`<span class="help">${s.why}</span>` : draw(s as T);
}

/** The four figures, the sign-off record and the reconciliation — `claim_figures.read` alone. */
export function figuresBlock(claim_id: string, p: R.FiguresPanel | undefined): Safe {
  if (p === undefined) return raw('');
  const rec = p.reconciliation;
  const form = p.signoff_form;
  return h`<div class="pblock"><div class="help">${why(p.order)}</div>
    <table><tbody>
      <tr><td>A · the indicative estimate</td><td>${sealed(p.a_indicative, (a) => h`${a.figure} <span class="help">shown as ${a.shown_range} · locked ${a.sealed} · ${a.hash}</span>`)}</td></tr>
      <tr><td>B · the researched estimate</td><td><span class="help">${p.b_researched.state} — ${p.b_researched.why}</span></td></tr>
      <tr><td>C · the surveyor’s committed figure</td><td>${sealed(p.c_surveyor, (c) => h`${c.qualifying_plant} qualifying plant <span class="help">building ${c.building} · land ${c.bare_land} · ${c.qualifying_pct} · committed ${c.committed} · ${c.hash}</span>`)}</td></tr>
      <tr><td>D · the figure the tax adviser signed</td><td>${sealed(p.d_adviser, (x) => h`${x.figure} <span class="help">signed on ${x.signed_on} by ${x.adviser} · ${x.hash}</span>`)}</td></tr>
      <tr><td>A claimable figure to the client</td><td>${p.claimable_figure.released ? 'released' : h`<span class="help">not released — ${p.claimable_figure.why}</span>`}</td></tr>
    </tbody></table>
    ${p.signoff === null ? raw('') : h`<h3>The tax adviser’s sign-off</h3><p class="help">${p.signoff.notice}</p><dl>
      <dt>Adviser</dt><dd>${p.signoff.adviser}, ${p.signoff.credential}</dd><dt>Signed on</dt><dd>${p.signoff.signed_on}</dd>
      <dt>Scope</dt><dd>${p.signoff.scope}</dd><dt>Method</dt><dd>${p.signoff.method_note}</dd>
      <dt>Switch readings confirmed</dt><dd>${p.signoff.switch_readings.length === 0 ? 'none' : p.signoff.switch_readings.map((s) => h`${s.switch}: ${s.on ? 'on' : 'off'}; `)}</dd>
      <dt>Recorded</dt><dd>${p.signoff.recorded} · ${p.signoff.record_hash}</dd></dl>`}
    ${form === undefined ? raw('') : !form.open ? h`<p class="help">Record the sign-off: ${form.why}.</p>` : h`
      <form method="post" action="/staff/claims/${claim_id}/signoff"><h3>Record the tax adviser’s sign-off</h3>
        ${form.version === null ? raw('') : h`<input type="hidden" name="approval_id" value="${form.version.id}">
        <p class="help">This records a sign-off of the survey report, version ${String(form.version.version)}, for ${form.version.figure}. If the adviser read another version, send this one to them first.</p>`}
        <label>The adviser’s firm, as registered <input name="adviser" placeholder="e.g. Example Tax Advisers LLP"></label>
        <label>Credential <input name="credential"></label>
        <label>Signed on <input name="signed_on" type="date"></label>
        <label>Scope <textarea name="scope"></textarea></label>
        <label>Method note <textarea name="method_note"></textarea></label>
        <label>Figure signed (£) <input name="figure"></label>
        <fieldset><legend>Switch readings the adviser confirmed</legend>${form.switches.map((s) => h`<label><input type="checkbox" name="switch" value="${s.switch}"> ${s.switch} (${s.on ? 'on' : 'off'})</label>`)}</fieldset>
        <p class="help">${form.adviser_question}</p>
        <button type="submit">Record the sign-off</button></form>`}
    ${rec === null ? h`<p class="help">The reconciliation starts when the first sign-off is recorded.</p>` : h`<h3>The reconciliation — ${rec.case_id}, ${rec.status}</h3><dl>
      <dt>A indicative</dt><dd>${rec.estimate_A_indicative.value} · ${rec.estimate_A_indicative.range} · engine ${rec.estimate_A_indicative.engine_version}</dd>
      <dt>B quoted</dt><dd>${rec.estimate_B_quoted.value} · ${rec.estimate_B_quoted.range}<br><span class="help">${rec.estimate_B_quoted.basis}</span></dd>
      <dt>The surveyor</dt><dd>${rec.surveyor_committed.value}</dd>
      <dt>C pre-submission</dt><dd>${rec.estimate_C_pre_submission.value} · ${rec.estimate_C_pre_submission.date_captured} · ${rec.estimate_C_pre_submission.cta_reviewer}</dd>
      <dt>Filed</dt><dd>${rec.filed_on ?? 'not recorded'}</dd>
      <dt>D outcome</dt><dd>${rec.outcome_D === null ? 'pending' : h`${rec.outcome_D.value} · ${rec.outcome_D.resolution_path} · realised ${rec.outcome_D.amount_realised}`}</dd>
      <dt>Quote gap</dt><dd>${rec.variance.quote_gap} (${rec.variance.quote_gap_pct})</dd>
      <dt>Delivery gap</dt><dd>${rec.variance.delivery_gap} (${rec.variance.delivery_gap_pct})</dd>
      <dt>Variance</dt><dd>${rec.variance.variance_category ?? 'not tagged'}<br><span class="help">${rec.variance.review_why}</span></dd>
      <dt>Snapshot</dt><dd>${rec.opened} · ${rec.snapshot_hash}</dd></dl>
      ${!p.may_reconcile ? raw('') : h`
        <form method="post" action="/staff/claims/${claim_id}/reconciliation/filing" class="inline"><label>Filed on <input name="filed_on" type="date"></label><button type="submit">Record the filing</button></form>
        <form method="post" action="/staff/claims/${claim_id}/reconciliation/variance" class="inline"><label>Variance <select name="variance_category">${options(R.VARIANCE_CATEGORIES)}</select></label><label>Notes <input name="variance_notes"></label><button type="submit">Record the tag</button></form>
        <form method="post" action="/staff/claims/${claim_id}/reconciliation/outcome" class="inline"><label>Realised (£) <input name="amount_realised"></label><label><input type="checkbox" name="withdrawn" value="yes"> withdrawn</label><button type="submit">Record the outcome</button></form>`}`}
  </div>`;
}

export function deliverablesBlock(claim_id: string, p: R.DeliverablesPanel | undefined): Safe {
  if (p === undefined) return raw('');
  return h`<div class="pblock"><div class="pnum">The deliverables register</div><p class="help">${p.generation}</p>
    <table><thead><tr><th>Deliverable</th><th>State</th><th>Version</th><th>Issued</th><th>Document</th><th></th></tr></thead><tbody>
    ${p.lines.map((l) => h`<tr><td>${l.label}</td><td>${l.state_label}</td><td>${l.version ?? '—'}</td><td>${l.issued_on ?? '—'}${l.content_hash === null ? '' : h`<br><span class="help">${l.content_hash}</span>`}</td>
      <td>${l.document_type}<br><span class="help">${l.stored}</span></td>
      <td>${l.may_draft ? h`<form method="post" action="/staff/claims/${claim_id}/deliverables" class="inline"><input type="hidden" name="kind" value="${l.kind}"><input type="hidden" name="action" value="DRAFT"><button type="submit">Start a draft</button></form>` : raw('')}
        ${l.may_issue ? h`<form method="post" action="/staff/claims/${claim_id}/deliverables" class="inline"><input type="hidden" name="kind" value="${l.kind}"><input type="hidden" name="action" value="ISSUE"><input name="issued_on" type="date">${R.MADE_HERE.has(l.kind) ? raw('') : h`<input name="content_hash" placeholder="SHA-256">`}<button type="submit">Issue</button></form>` : raw('')}
        ${l.refused_why === null ? raw('') : h`<span class="help">${l.refused_why}</span>`}</td></tr>`)}
    </tbody></table></div>`;
}

export function aftercareBlock(claim_id: string, p: R.AftercarePanel | undefined): Safe {
  if (p === undefined) return raw('');
  return h`<div class="pblock">
    <h3>HMRC enquiries</h3>
    ${p.enquiries.length === 0 ? h`<p class="help">No enquiry is recorded.</p>` : h`<table><tbody>${p.enquiries.map((e) => h`<tr>
      <td>opened ${e.opened_on}</td><td>${e.open ? 'open' : h`closed ${e.closed_on ?? ''} — ${e.outcome ?? ''}${e.amended_figure === null ? '' : ` at ${e.amended_figure}`}`}</td><td>${e.note ?? ''}</td>
      <td>${p.may_record && e.open ? h`
        <form method="post" action="/staff/claims/${claim_id}/enquiries/${e.id}/close" class="inline"><input name="closed_on" type="date">
        <label>Outcome <select name="outcome">${options(R.ENQUIRY_OUTCOMES)}</select></label>
        <input name="amended_figure" placeholder="agreed (£)"><button type="submit">Close</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
    ${p.may_record && !p.enquiry_open ? h`<form method="post" action="/staff/claims/${claim_id}/enquiries"><label>Opened on <input name="opened_on" type="date"></label><label>Note <input name="note"></label><button type="submit">Record an enquiry</button></form>` : raw('')}
    <p class="help">${p.correspondence}</p>
    <h3>Clause 13 — the fee on a reduced claim</h3><p class="help">${p.clawback.why}</p>
    <h3>The election on a future sale</h3><p class="help">${p.disposal.note}</p>
    ${p.disposal.tasks.map((t) => h`<p><a href="/staff/tasks/${t.id}">${t.title}</a> — ${t.status.toLowerCase()}</p>`)}
  </div>`;
}

/* ================================================================== *
 * GRANTS AND CONTRIBUTIONS — PHASE 143, 22 September 2026. "Clean-up 10 of 11."
 *
 * Lakhbir, 18 September 2026: "Grants and contributions — this section is a mess, and although great and it works, the
 * UI is terrible." THE SCREEN CHANGED AND NOTHING UNDER IT DID. The same table (claim_grants), the same fact
 * (GRANTS_EXIST), the same two stores (F.recordGrant, F.withdrawGrant) and the same valuation check (F.grantsTraced).
 *
 *   ONE QUESTION FIRST  "Did anyone else pay for any of this work?" — Yes, No or Not sure. Not sure is recorded as not
 *                       known, which never passes (N4), and puts the question to the client.
 *   A CARD PER GRANT    who paid, large; how much; one plain line; where the figure came from; matched or not yet.
 *   TOTALS              in total, matched, not matched yet. An amount not known is counted apart, never as nothing.
 *   ADD, STEP BY STEP   four questions, one per page, then the effect in plain words before anything is saved.
 *   REMOVE              asks why in a pop-up (the popover attribute, so no script), and keeps the record in the history.
 *
 * THE WORDS FOLLOW RULEBOOK F. Money meets spend "to the extent that" it paid for it (s.532), so a grant is matched to
 * the items it paid for — never taken as a share of everything (F-R1, F-R12). Only a public body's money always
 * reduces the claim (F-R8); insurance money after damage does not (F-R7); anyone else's may not (F-R9, F-R10).
 * ================================================================== */

export const GRANTS_ANCHOR = '#claim-grants';
const GRANTS_FACT_ID = 'claim_fact.GRANTS_EXIST';

/** Where a figure came from, in words — the stored keys of F.AMOUNT_BASES, never changed. */
const BASIS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  agreement: 'Figure from the funding agreement', client_estimate: 'Figure from the client’s own estimate',
  inferred: 'Figure from our own working-out', UNKNOWN: 'Where the figure comes from is not known yet',
});

/** Who paid, as the start of a sentence. A class, never a name — the same classes as F.PAYER_CLASSES. */
const PAYER_SUBJECT: Readonly<Record<string, string>> = Object.freeze({
  nhs: 'The NHS', local_authority: 'A local council', homes_england_gla: 'Homes England or the GLA', other_public: 'Another public body',
  landlord_unconnected: 'A landlord', landlord_connected: 'A landlord linked to the client', group_company: 'A company in the client’s group',
  charity: 'A charity', individual: 'A private person', insurer: 'An insurer', UNKNOWN: 'Someone',
});

/** What this money does to the claim, by Rulebook F — before anything is saved, and on every card. */
export function grantEffect(payer_key: string): string {
  if (F.PUBLIC_PAYERS.includes(payer_key)) return 'This will reduce the claim on the items it paid for.';
  if (payer_key === 'insurer') return 'Insurance paid out after damage usually does not cut the claim. Our tax adviser checks.';
  if (payer_key === 'UNKNOWN') return 'This may reduce the claim on the items it paid for. We need to know who paid.';
  return 'This may reduce the claim on the items it paid for. Our tax adviser checks whether it does.';
}

function grantSentence(g: { payer_key: string; amount_pence: number | null; traced_elements: string | null }): string {
  const who = PAYER_SUBJECT[g.payer_key] ?? 'Someone';
  const what = g.traced_elements === null || g.traced_elements.trim() === '' ? 'this work' : g.traced_elements.trim();
  const amount = g.amount_pence === null ? '' : ` ${formatPence(g.amount_pence)}`;
  return `${who} paid${amount} towards ${what}.${g.amount_pence === null ? ' We do not know how much yet.' : ''}`;
}

function matchedChip(traced_key: string): Safe {
  return traced_key === 'YES' ? badge('Matched to the items it paid for', 'ok') : badge('Not matched yet', 'warn');
}

type CardLine = {
  readonly kind: string; readonly payer: string; readonly payer_key: string; readonly amount_pence: number | null;
  readonly amount_basis_key: string; readonly traced_key: string; readonly traced_elements: string | null; readonly told_by: string;
  /** Phase 153a: the fixture-list rows it paid for, by name. */
  readonly element_names: readonly string[];
};

function grantCard(g: CardLine, meta: Safe, actions: Safe, effect = true): Safe {
  return h`<li class="tile gcard${g.traced_key === 'YES' ? ' matched' : ''}">
    <p class="gwho">${PAYER_SUBJECT[g.payer_key] ?? g.payer}</p>
    <p class="gamt">${g.amount_pence === null ? h`<span class="help">Amount not known</span>` : formatPence(g.amount_pence)}</p>
    <p class="gline">${grantSentence(g)}</p>
    <p class="gchips">${matchedChip(g.traced_key)} ${badge(g.kind)}</p>
    ${g.element_names.length === 0 ? raw('') : h`<p class="help">From our list of items: ${g.element_names.join('; ')}</p>`}
    <p class="help">${BASIS_WORDS[g.amount_basis_key] ?? BASIS_WORDS['UNKNOWN']} · ${g.told_by}${meta}</p>
    ${effect ? h`<p class="help">${grantEffect(g.payer_key)}</p>` : raw('')}
    ${actions}</li>`;
}

/** The pop-up that asks why before a grant is removed. The server refuses a removal without a reason, as before. */
function removeGrant(claim_id: string, grant_id: string): Safe {
  const pop = `rm-${grant_id}`;
  return h`<p class="gactions"><button type="button" class="btn-quiet" popovertarget="${pop}">Remove</button></p>
    <div popover id="${pop}" class="gpop" role="dialog" aria-labelledby="${pop}-h">
      <form method="post" action="/staff/claims/${claim_id}/grants/${grant_id}/withdraw">
        <h3 id="${pop}-h">Remove this grant?</h3>
        <p class="help">It stays in the claim’s history, with your reason.</p>
        <label>Why are you removing it? <textarea name="reason" required maxlength="1000"></textarea></label>
        <p class="gpopbtns"><button type="submit">Remove it</button>
          <button type="button" class="btn-quiet" popovertarget="${pop}" popovertargetaction="hide">Keep it</button></p>
      </form></div>`;
}

/** The grants and contributions section's body — ADMIN and SALES, from the same facts panel as before. */
export function grantsBlock(claim_id: string, p: F.FactsPanel, asked: boolean): Safe {
  const g = p.grants;
  const answer = g.exist.known ? g.exist.value : null;
  const answeredNotSure = !g.exist.known && g.exist.source !== null;
  const active = g.lines.filter((l) => l.withdrawn === null);
  const removed = g.lines.filter((l) => l.withdrawn !== null);
  const known = active.filter((l) => l.amount_pence !== null);
  const sum = (xs: readonly F.GrantLine[]): number => xs.reduce((t, l) => t + (l.amount_pence ?? 0), 0);
  const matched = known.filter((l) => l.traced_key === 'YES');
  const unmatched = known.filter((l) => l.traced_key !== 'YES');
  const notKnownMatched = active.filter((l) => l.amount_pence === null && l.traced_key === 'YES').length;
  const notKnownUnmatched = active.filter((l) => l.amount_pence === null && l.traced_key !== 'YES').length;
  const plus = (n: number): Safe => n === 0 ? raw('') : h`<span class="lab">and ${n} with the amount not known</span>`;
  const card = (l: F.GrantLine): CardLine => ({
    kind: l.kind, payer: l.payer, payer_key: l.payer_key, amount_pence: l.amount_pence,
    amount_basis_key: Object.entries(F.AMOUNT_BASES).find(([, v]) => v === l.amount_basis)?.[0] ?? 'UNKNOWN',
    traced_key: l.traced_key, traced_elements: l.traced_elements,
    told_by: l.source.source_id === null ? l.source.publisher : (F.CAPTURE_SOURCES[l.source.source_id] ?? l.source.publisher),
    element_names: l.element_names,
  });
  const said = answer === 'YES' ? badge('Yes', 'info') : answer === 'NO' ? badge('No', 'ok') : answeredNotSure ? badge('Not sure', 'warn') : badge('Not answered yet', 'warn');
  return h`<div class="pblock grants">
    <div class="gask">
      <h3>Did anyone else pay for any of this work?</h3>
      <p>Answer: ${said}${asked ? h` ${badge('Asked the client — waiting', 'warn')}` : raw('')}</p>
      ${!p.may_record ? raw('') : (() => {
        const ask = h`<form method="post" action="/staff/claims/${claim_id}/grants/answer" class="gyesno">
        <label>Who told us? <select name="source_id" required><option value="">Choose one</option>${options(F.CAPTURE_SOURCES)}</select></label>
        <p class="gbtns"><button type="submit" name="answer" value="YES" class="btn-quiet">Yes</button>
          <button type="submit" name="answer" value="NO" class="btn-quiet">No</button>
          <button type="submit" name="answer" value="NOT_SURE" class="btn-quiet">Not sure</button></p></form>`;
        // Unanswered, the three answers are the first thing in the section; once answered, they fold under one line.
        return answer === null && !answeredNotSure ? ask : h`<details class="more"><summary>Change the answer</summary>${ask}</details>`;
      })()}
      <div class="help">Not sure is never taken as No, and it asks the client.${why('Money from someone else counts only for the items it paid for. A loan is not a grant, and nor is regular income such as rent support. Until this is answered, the claim cannot move on from valuation.')}</div>
    </div>
    ${answer === 'NO' && active.length > 0 ? h`<p class="flag">The answer is No, but ${active.length} ${active.length === 1 ? 'grant is' : 'grants are'} still listed. Remove ${active.length === 1 ? 'it' : 'them'}, or change the answer.</p>` : raw('')}
    ${answer === 'YES' && active.length === 0 ? h`<p class="flag">The answer is Yes. Add who paid, below.</p>` : raw('')}
    ${active.length === 0 ? raw('') : h`<div class="stat-row gtotals">
      <div><span class="lab">Grants in total</span><span class="stat">${formatPence(sum(known))}</span>${plus(notKnownMatched + notKnownUnmatched)}</div>
      <div><span class="lab">Matched</span><span class="stat">${formatPence(sum(matched))}</span>${plus(notKnownMatched)}</div>
      <div><span class="lab">Not matched yet</span><span class="stat">${formatPence(sum(unmatched))}</span>${plus(notKnownUnmatched)}</div>
    </div>
    <ul class="tiles gcards">${active.map((l) => grantCard(card(l),
      h` · added ${l.source.recorded_at ?? ''}${l.source.recorded_by === null ? '' : ` by ${l.source.recorded_by}`}`,
      p.may_record ? removeGrant(claim_id, l.id) : raw('')))}</ul>`}
    ${active.length === 0 ? raw('') : grantChecks(claim_id, p)}
    ${!p.may_record ? raw('') : h`<form method="post" action="/staff/claims/${claim_id}/grants/new" class="gadd">
      <input type="hidden" name="go" value="start"><button type="submit">Add a grant or contribution</button></form>`}
    ${removed.length === 0 ? raw('') : moreDetail(h`<ul class="gremoved">${removed.map((l) => h`<li>${grantSentence(l)} <span class="help">Removed ${
      (l.withdrawn ?? '').replace(/^withdrawn /, '')}</span></li>`)}</ul>`, `Removed (${removed.length})`)}
  </div>`;
}

/**
 * PHASE 153a — BEFORE THE CLAIM MOVES ON FROM VALUATION (src/web/grant-checks.ts; Phase 153b lines 12 and 13). Two
 * answers, each Yes or No with who told us: the client has checked with whoever paid; and, where a grant is split in
 * equal share with no papers received, the tax adviser's view on the split — which counts only from the tax adviser.
 */
function grantChecks(claim_id: string, p: F.FactsPanel): Safe {
  const g = p.grants;
  const shown = (r: F.FactReading): Safe => r.known ? badge(r.display, r.value === 'YES' ? 'ok' : 'warn') : badge('Not answered yet', 'warn');
  const ask = (key: string, sources: Readonly<Record<string, string>>): Safe => !p.may_record ? raw('') : h`<form method="post" action="/staff/claims/${claim_id}/grants/fact" class="gyesno">
      <input type="hidden" name="fact_key" value="${key}"><input type="hidden" name="answer" value="VALUE">
      <label>Who told us? <select name="source_id" required><option value="">Choose one</option>${options(sources)}</select></label>
      <p class="gbtns"><button type="submit" name="value" value="YES" class="btn-quiet">Yes</button>
        <button type="submit" name="value" value="NO" class="btn-quiet">No</button></p></form>`;
  const adviserOnly: Readonly<Record<string, string>> = Object.freeze({ CTA: F.CAPTURE_SOURCES['CTA'] ?? 'The tax adviser' });
  return h`<div class="gask">
      <h3>Before the claim moves on</h3>
      <p><strong>Has the client checked with whoever paid that claiming will not make them pay the grant back?</strong> ${shown(g.provider_checked)}</p>
      ${ask('GRANT_PROVIDER_CHECKED', F.CAPTURE_SOURCES)}
      <p><strong>Has the tax adviser given their view on how a grant with no breakdown is split?</strong> ${shown(g.split_view)}</p>
      ${ask('GRANT_SPLIT_ADVISER_VIEW', adviserOnly)}
      <div class="help">Not needed when the grant papers are on the claim.${why(g.switch.says)}</div>
    </div>`;
}

/* ---------------- "Did anyone else pay?" ---------------- */

function answerGrantsQuestion(
  d: ClaimRecordPageDeps, deps: F.FactDeps, res: ServerResponse, actor: Actor, id: string, f: URLSearchParams,
  finish: (id: string, r: { ok: true } | { ok: false; why: string; field?: string }, title: string, done: string, anchor?: string) => 'handled',
): 'handled' {
  const a = f.get('answer');
  const source = (f.get('source_id') ?? '').trim();
  const fields: F.Fields = a === 'YES' || a === 'NO' ? { fact_key: 'GRANTS_EXIST', answer: 'VALUE', value: a, source_id: source === '' ? null : source }
    : { fact_key: 'GRANTS_EXIST', answer: a === 'NOT_SURE' ? 'UNKNOWN' : null, source_id: source === '' ? null : source };
  if (a !== 'YES' && a !== 'NO' && a !== 'NOT_SURE') return finish(id, { ok: false, why: 'Press Yes, No or Not sure.' }, 'Answer not saved', 'grants', GRANTS_ANCHOR);
  const r = F.recordFact(deps, actor, id, fields);
  if (!r.ok) return finish(id, r.field === 'source_id' ? { ok: false, why: 'Say who told us — the client, their document, the surveyor or the tax adviser.', field: 'source_id' } : r,
    'Answer not saved', 'grants', GRANTS_ANCHOR);
  if (a === 'NOT_SURE') {
    // NOT SURE PUTS THE QUESTION TO THE CLIENT — once, and only for a login that may ask (the same check "Ask the client" makes).
    const biz = d.app.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [id])?.business_id ?? '';
    if (can(actor, 'internal_note.write', { type: 'internal_note', id: biz, business_id: biz }) && !openClaimQuestions(d.app.db, actor, biz, id).has(GRANTS_FACT_ID)) {
      const sent = sendTaskToPortal(deps, actor, biz, {
        fact_id: GRANTS_FACT_ID, claim_id: id,
        question: 'Did anyone else pay for any of the work on your building? For example, the NHS, a council, a landlord or an insurer.',
        why: 'Money from someone else can change how much you can claim.', holds_up: 'this claim',
      });
      if (!sent.ok) return d.problem(res, actor, 'Answer saved, question not sent', sent.why, `/staff/claims/${id}${GRANTS_ANCHOR}`);
    }
  }
  return finish(id, { ok: true }, 'Answer not saved', 'grants', GRANTS_ANCHOR);
}

/* ---------------- "Add a grant or contribution", one question per step ---------------- */

const DRAFT_KEYS = ['kind', 'payer_class', 'amount', 'amount_basis', 'source_id', 'traced_elements', 'element_ids', 'note', 'traced'] as const;
type Draft = Record<(typeof DRAFT_KEYS)[number], string>;
const STEP_NAMES = ['Who paid', 'How much', 'What it paid for', 'Matched'] as const;

function draftFrom(f: URLSearchParams): Draft {
  const out = {} as Draft;
  for (const k of DRAFT_KEYS) out[k] = (f.get(k) ?? '').trim();
  // Phase 153a: on the step that asks it, the items ticked; on every other step, the list carried from it.
  if (f.get('step') === '3' && f.get('go') !== 'edit') out.element_ids = f.getAll('element_pick').map((x) => x.trim()).filter((x) => x !== '').join(',');
  return out;
}

/** Everything typed so far rides in the form as hidden fields — never in the address. */
function carry(draft: Draft, except: readonly string[]): Safe {
  return h`${DRAFT_KEYS.filter((k) => !except.includes(k)).map((k) => h`<input type="hidden" name="${k}" value="${draft[k]}">`)}`;
}

function choice(name: string, vocab: Readonly<Record<string, string>>, current: string, words: Readonly<Record<string, string>> = {}): Safe {
  return h`<div class="opts">${Object.entries(vocab).map(([k, v]) => h`<label class="opt${current === k ? ' sel' : ''}"><input type="radio" name="${name}" value="${k}"${
    current === k ? raw(' checked') : raw('')}> ${words[k] ?? v}</label>`)}</div>`;
}

/** Check one step's answers. Null when they are fine; otherwise what to put right, in a sentence. */
function checkStep(step: number, x: Draft): string | null {
  if (step === 1) {
    if (!Object.hasOwn(F.PAYER_CLASSES, x.payer_class)) return 'Choose who paid. If you do not know, choose Not known.';
    if (x.kind !== 'GRANT' && x.kind !== 'CONTRIBUTION') return 'Say whether it was a grant or another payment.';
  }
  if (step === 2) {
    if (x.amount !== '' && F.penceValue(x.amount) === null) return 'Write the amount in pounds, more than nothing — or leave it blank if nobody knows.';
    if (!Object.hasOwn(F.AMOUNT_BASES, x.amount_basis)) return 'Say where the figure comes from. If nobody knows, choose Not known.';
    if (!Object.hasOwn(F.CAPTURE_SOURCES, x.source_id)) return 'Say who told us.';
  }
  if (step === 3 && x.traced_elements.length > 4000) return 'That is too long — keep it under 4,000 characters.';
  if (step === 3) { const ids = F.parseElementIds(x.element_ids); if (!ids.ok) return ids.why; }
  if (step === 4) {
    if (!Object.hasOwn(F.TRACED, x.traced)) return 'Say whether it is matched yet.';
    if (x.element_ids !== '' && x.traced !== 'YES') return 'You chose items from our list, so it is matched. Choose Yes, or go back and clear the items.';
  }
  return null;
}

function grantStepPage(d: ClaimRecordPageDeps, res: ServerResponse, actor: Actor, claim_id: string, f: URLSearchParams): 'handled' {
  const c = F.grantFormClaim(d.app.db, actor, claim_id); // refuses, before anything is drawn, a login that may not record
  const x = draftFrom(f);
  const go = f.get('go') ?? 'start';
  const at = Math.min(5, Math.max(1, Number.parseInt(f.get('step') ?? '1', 10) || 1));
  let step = 1;
  let problem: string | null = null;
  if (go === 'next') {
    problem = checkStep(at, x);
    // A grant is matched only with what it paid for written down (the store refuses it too): back to that step.
    if (problem === null && at === 4 && x.traced === 'YES' && x.traced_elements === '' && x.element_ids === '') {
      step = 3;
      problem = 'To mark it matched, first write what it paid for.';
    } else step = problem === null ? at + 1 : at;
  } else if (go === 'back') step = Math.max(1, at - 1);
  else if (go === 'edit') step = Math.min(4, Math.max(1, Number.parseInt(f.get('to') ?? '1', 10) || 1));
  // A step is reached only with every step before it answered: a hand-made post cannot skip ahead to the check page.
  for (let s = 1; s < step; s += 1) {
    const bad = checkStep(s, x);
    if (bad !== null) { step = s; problem = bad; break; }
  }
  const self = `/staff/claims/${c.id}/grants/new`;
  const progress = step > 4 ? raw('') : h`<ol class="gsteps" aria-label="Steps">${STEP_NAMES.map((n, i) => h`<li${
    i + 1 === step ? raw(' aria-current="step" class="now"') : i + 1 < step ? raw(' class="done"') : raw('')}>${n}</li>`)}</ol>
    <p class="help">Step ${step} of 4</p>`;
  const nav = (backOk: boolean): Safe => h`<p class="gbtns"><button type="submit" name="go" value="next">${step === 4 ? 'Check it' : 'Next'}</button>
    ${backOk ? h`<button type="submit" name="go" value="back" class="btn-quiet" formnovalidate>Back</button>` : raw('')}
    <a href="${claimHref(c.business_id, c.id)}${GRANTS_ANCHOR}">Cancel</a></p>`;
  let body: Safe;
  if (step === 1) {
    body = h`<form method="post" action="${self}" class="gstep"><input type="hidden" name="step" value="1">${carry(x, ['payer_class', 'kind'])}
      <fieldset><legend><h2>Who paid?</h2></legend>${choice('payer_class', F.PAYER_CLASSES, x.payer_class, { individual: 'A private person — we do not write their name' })}</fieldset>
      <fieldset><legend><h2>Was it a grant?</h2></legend>${choice('kind', { GRANT: 'A grant', CONTRIBUTION: 'Another payment towards the work' }, x.kind)}</fieldset>
      <div class="help">${why('A loan is not a grant or a payment towards the work, and nor is regular income such as rent support. Insurance money after damage is added here too — it usually does not reduce the claim.')}</div>
      ${nav(false)}</form>`;
  } else if (step === 2) {
    body = h`<form method="post" action="${self}" class="gstep"><input type="hidden" name="step" value="2">${carry(x, ['amount', 'amount_basis', 'source_id'])}
      <h2>How much did they pay, and how do we know?</h2>
      <label>Amount in pounds <input name="amount" inputmode="decimal" value="${x.amount}"></label>
      <p class="help">Leave it blank if nobody knows yet. It is never taken as nothing.</p>
      <fieldset><legend>Where does the figure come from?</legend>${choice('amount_basis', F.AMOUNT_BASES, x.amount_basis, { inferred: 'Our own working-out', UNKNOWN: 'Not known yet' })}</fieldset>
      <label>Who told us? <select name="source_id" required><option value="">Choose one</option>${Object.entries(F.CAPTURE_SOURCES).map(([k, v]) => h`<option value="${k}"${
        x.source_id === k ? raw(' selected') : raw('')}>${v}</option>`)}</select></label>
      ${nav(true)}</form>`;
  } else if (step === 3) {
    const picked = new Set(x.element_ids.split(',').filter((e) => e !== ''));
    body = h`<form method="post" action="${self}" class="gstep"><input type="hidden" name="step" value="3">${carry(x, ['traced_elements', 'note', 'element_ids'])}
      <h2>What did it pay for?</h2>
      <label>The items it paid for <textarea name="traced_elements" maxlength="4000">${x.traced_elements}</textarea></label>
      <p class="help">For example: the heating, lighting and fire alarm in the new treatment rooms. Leave it blank if you do not know yet.</p>
      <details class="more"${picked.size > 0 ? raw(' open') : raw('')}><summary>Tick the items from our list${picked.size > 0 ? ` (${String(picked.size)} ticked)` : ''}</summary>
        <p class="help">Tick only what the grant letter or agreement shows it paid for. Leave them all clear if you do not know.</p>
        <div class="opts">${F.grantElementChoices(c.sector).map((e) => h`<label class="opt${picked.has(e.id) ? ' sel' : ''}"><input type="checkbox" name="element_pick" value="${e.id}"${
          picked.has(e.id) ? raw(' checked') : raw('')}> ${e.name}</label>`)}</div></details>
      <label>Anything else to note <input name="note" maxlength="2000" value="${x.note}"></label>
      ${nav(true)}</form>`;
  } else if (step === 4) {
    body = h`<form method="post" action="${self}" class="gstep"><input type="hidden" name="step" value="4">${carry(x, ['traced'])}
      <h2>Have you matched it to the items it paid for?</h2>
      ${choice('traced', F.TRACED, x.traced, { YES: 'Yes — matched item by item, from the grant letter or agreement', NO: 'No, not yet', UNKNOWN: 'Not sure' })}
      <div class="help">${why('The claim comes down only on the items the money paid for — never by a share of everything. Until every grant is matched, the claim cannot move on from valuation.')}</div>
      ${nav(true)}</form>`;
  } else {
    const preview: CardLine = {
      kind: x.kind === 'GRANT' ? 'Grant' : 'Contribution', payer: F.PAYER_CLASSES[x.payer_class] ?? '', payer_key: x.payer_class,
      amount_pence: x.amount === '' ? null : F.penceValue(x.amount), amount_basis_key: x.amount_basis, traced_key: x.traced,
      traced_elements: x.traced_elements === '' ? null : x.traced_elements, told_by: F.CAPTURE_SOURCES[x.source_id] ?? '',
      element_names: x.element_ids.split(',').filter((e) => e !== '').map(F.elementName),
    };
    body = h`<h2>Check it, then save</h2>
      <ul class="tiles gcards">${grantCard(preview, raw(''), raw(''), false)}</ul>
      <p class="geffect"><strong>${grantEffect(x.payer_class)}</strong>${x.traced === 'YES' ? raw('') : h` Until it is matched, the claim cannot move on from valuation.`}</p>
      <form method="post" action="/staff/claims/${c.id}/grants">${carry(x, [])}<p class="gbtns"><button type="submit">Save it</button>
        <a href="${claimHref(c.business_id, c.id)}${GRANTS_ANCHOR}">Cancel</a></p></form>
      <form method="post" action="${self}" class="gchange">${carry(x, [])}<input type="hidden" name="go" value="edit"><span class="help">Change:</span>
        ${STEP_NAMES.map((n, i) => h`${i === 0 ? ' ' : ' · '}<button type="submit" name="to" value="${String(i + 1)}" class="linkish">${n.toLowerCase()}</button>`)}</form>`;
  }
  const html = page({
    title: `${c.company} — add a grant or contribution`, nav: d.nav(actor),
    body: h`${breadcrumb([{ label: c.company, href: `/staff/clients/${c.business_id}` }, { label: 'The claim', href: `${claimHref(c.business_id, c.id)}${GRANTS_ANCHOR}` }, { label: 'Add a grant' }])}
      <h1>${c.company}</h1><p class="lede">Add a grant or contribution</p>
      <section class="card gwizard">${progress}${problem === null ? raw('') : h`<p class="flag" role="alert">${problem}</p>`}${body}</section>`,
  });
  res.writeHead(200, { ...HTML_HEADERS, 'cache-control': 'no-store' });
  res.end(html);
  return 'handled';
}
