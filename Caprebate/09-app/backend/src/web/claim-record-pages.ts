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
import { h, raw, type Safe } from './html.ts';
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
  const finish = (id: string, r: { ok: true } | { ok: false; why: string; field?: string }, title: string, done: string): 'handled' => {
    // PHASE 133e (D4, continued): where the store named the posted field, the refusal is drawn beside it.
    if (!r.ok) return d.problem(res, actor, title, r.why, back(id), r.field);
    redirect(res, `${back(id)}?done=${done}`);
    return 'handled';
  };

  let m = new RegExp(`^/staff/claims/${ID}/facts$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.recordFact(deps, actor, id, posted(await form(req), ['fact_key', 'answer', 'value', 'source_id', 'note'])), 'Fact not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/grants$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    return finish(id, F.recordGrant(deps, actor, id, posted(await form(req),
      ['kind', 'payer_class', 'amount', 'amount_basis', 'traced', 'traced_elements', 'source_id', 'note'])), 'Grant not recorded', 'saved');
  }
  m = new RegExp(`^/staff/claims/${ID}/grants/${ID}/withdraw$`).exec(path);
  if (m) {
    const id = m[1] ?? '';
    const f = await form(req);
    return finish(id, F.withdrawGrant(deps, actor, id, m[2] ?? '', f.get('reason')), 'Grant not withdrawn', 'saved');
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
    const fields = { ...posted(f, ['adviser', 'credential', 'signed_on', 'scope', 'method_note', 'figure']), confirmed_switches: f.getAll('switch').join(',') };
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
    : h`<span class="help">${r.source.publisher}${r.source.prov === null ? '' : ` · ${r.source.prov}`}${r.source.derived ? ' · derived' : ''} · ${r.source.locator}${
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
  prior_owner_chain: 'The chain of previous owners', grants_exist: 'A grant or contribution met any of the spend',
  grants_traced: 'Each grant or contribution, and whether it is traced', buyer_alterations: 'The buyer made their own alterations to install plant',
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
    return h`<div class="pblock"><div class="pnum">The claim’s facts</div><p class="help">${facts.notice}</p>
      <table><tbody>${(Object.keys(facts.facts) as (keyof typeof facts.facts)[]).map((k) => h`<tr><th>${RELEASED_FACT_LABELS[k] ?? k}</th><td>${releasedValue(facts.facts[k])}</td></tr>`)}</tbody></table></div>`;
  }
  const p = facts;
  const w = p.amendment_window;
  return h`<div class="pblock"><div class="pnum">The claim’s capital allowances facts</div>
    <p class="help">Derived first, recorded only where nothing derives it. Every value says where it came from. Not known and never recorded read the same, and neither opens a gate.</p>
    <table><tbody>
      ${reading(p.claimant_type)}${reading(p.scottish_taxpayer)}${reading(p.jurisdiction)}${reading(p.acquisition_date)}
      ${reading(p.accounting_period.start)}${reading(p.accounting_period.end)}
      ${reading(p.partnership_company_member, 'Read for a partnership or an LLP alone. A partnership with a company partner files on the company deadline where that is earlier (TMA 1970 s.12AA(5B)); not known treats the window as open only if it is open on both dates.')}
      <tr><td>The amendment window</td><td>${w.state === 'UNKNOWN' ? h`<span class="help">${w.why}</span>` : w.why}</td><td><span class="help">${w.assumption ?? 'the engine’s amendment window rule'}</span></td></tr>
      ${reading(p.taxable_profit.sufficient_profit)}
      <tr><td>The break-even switch</td><td>${p.taxable_profit.breakeven_switch.on ? 'on' : 'off'}</td><td><span class="help">${p.taxable_profit.breakeven_switch.question}</span></td></tr>
      ${reading(p.allowance_headroom.position)}${reading(p.allowance_headroom.amount)}
      ${reading(p.pool_split.main)}${reading(p.pool_split.special)}
      <tr><td>Workstream</td><td>${p.structures_and_buildings.workstream}</td><td></td></tr>
      ${reading(p.structures_and_buildings.qualifying_expenditure)}
      ${reading(p.election.exists)}${reading(p.election.section)}${reading(p.election.notified_on)}${reading(p.election.value)}${reading(p.election.elements)}
      <tr><td>The election, resolved</td><td>${p.election.resolved.met ? 'resolved' : h`<span class="help">unresolved</span>`}</td><td><span class="help">${p.election.resolved.why}</span></td></tr>
      ${reading(p.grants.exist)}
      <tr><td>Every grant traced</td><td>${p.grants.traced.met ? 'yes' : h`<span class="help">not yet</span>`}</td><td><span class="help">${p.grants.traced.why}</span></td></tr>
      ${reading(p.acquisition_costs.costs)}${reading(p.acquisition_costs.transaction_tax)}
      <tr><td>${p.acquisition_costs.switch.name}</td><td>${p.acquisition_costs.switch.on ? 'on' : 'off'}</td><td><span class="help">${p.acquisition_costs.switch.says}</span></td></tr>
      ${reading(p.buyer_alterations.made)}${reading(p.buyer_alterations.amount)}
      <tr><td>${p.buyer_alterations.switch.name}</td><td>${p.buyer_alterations.switch.on ? 'on' : 'off'}</td><td><span class="help">${p.buyer_alterations.switch.says}</span></td></tr>
    </tbody></table>
    <h3>The prior owner chain</h3>
    ${p.election.prior_owner_chain.length === 0 ? h`<p class="help">No owner is recorded.</p>` : h`<table><tbody>${p.election.prior_owner_chain.map((o) => h`<tr>
      <td>${o.position}</td><td>${o.owner}</td><td>${o.acquired_on ?? 'acquired: not known'} – ${o.ceased_on ?? 'ceased: not known'}</td><td>${o.claimed}</td>
      <td>${p.may_record ? h`<form method="post" action="/staff/claims/${claim_id}/owners/${o.id}/withdraw" class="inline"><button type="submit">Withdraw</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
    <h3>Grants and contributions</h3>
    ${p.grants.lines.length === 0 ? h`<p class="help">None is recorded.</p>` : h`<table><tbody>${p.grants.lines.map((g) => h`<tr>
      <td>${g.kind}</td><td>${g.payer}</td><td>${g.amount} <span class="help">(${g.amount_basis})</span></td><td>${g.traced}${g.traced_elements === null ? '' : ` — ${g.traced_elements}`}</td>
      <td>${g.withdrawn ?? (p.may_record ? h`<form method="post" action="/staff/claims/${claim_id}/grants/${g.id}/withdraw" class="inline"><input name="reason" placeholder="why"><button type="submit">Withdraw</button></form>` : raw(''))}</td></tr>`)}</tbody></table>`}
    ${!p.may_record ? raw('') : h`
      <form method="post" action="/staff/claims/${claim_id}/facts">
        <label>Fact <select name="fact_key">${Object.entries(F.FACTS).map(([k, v]) => h`<option value="${k}">${v.label}</option>`)}</select></label>
        <label>Answer <select name="answer"><option value="VALUE">This value</option><option value="UNKNOWN">Not known</option></select></label>
        <label>Value <input name="value" placeholder="a date YYYY-MM-DD, pounds, or the choice’s key"></label>
        <label>Source <select name="source_id">${options(F.CAPTURE_SOURCES)}</select></label>
        <label>Note <input name="note"></label>
        <button type="submit">Record the fact</button></form>
      <form method="post" action="/staff/claims/${claim_id}/grants">
        <label>Kind <select name="kind"><option value="GRANT">Grant</option><option value="CONTRIBUTION">Contribution</option></select></label>
        <label>Payer <select name="payer_class">${options(F.PAYER_CLASSES)}</select></label>
        <label>Amount (£) <input name="amount"></label>
        <label>Amount from <select name="amount_basis">${options(F.AMOUNT_BASES)}</select></label>
        <label>Traced <select name="traced">${options(F.TRACED)}</select></label>
        <label>Cost elements <input name="traced_elements"></label>
        <label>Source <select name="source_id">${options(F.CAPTURE_SOURCES)}</select></label>
        <button type="submit">Record the grant</button></form>
      <form method="post" action="/staff/claims/${claim_id}/owners">
        <label>Position <input name="position" type="number" min="1" max="20"></label>
        <label>Owner — a company or a role, never a person <input name="owner"></label>
        <label>Acquired <input name="acquired_on" type="date"></label>
        <label>Ceased <input name="ceased_on" type="date"></label>
        <label>Claimed <select name="claimed"><option value="UNKNOWN">Not known</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
        <label>Source <select name="source_id">${options(F.CAPTURE_SOURCES)}</select></label>
        <button type="submit">Record the owner</button></form>`}
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
  return h`<div class="pblock"><div class="pnum">The four figures</div><p class="help">${p.order}</p>
    <table><tbody>
      <tr><td>A · the indicative estimate</td><td>${sealed(p.a_indicative, (a) => h`${a.figure} <span class="help">shown as ${a.shown_range} · sealed ${a.sealed} · ${a.hash}</span>`)}</td></tr>
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
        <label>Adviser — a firm, or <select name="adviser"><option value="">(type a firm instead)</option>${options(form.adviser_tokens)}</select></label>
        <label>Credential <input name="credential"></label>
        <label>Signed on <input name="signed_on" type="date"></label>
        <label>Scope <textarea name="scope"></textarea></label>
        <label>Method note <textarea name="method_note"></textarea></label>
        <label>Figure signed (£) <input name="figure"></label>
        <fieldset><legend>Switch readings the adviser confirmed</legend>${form.switches.map((s) => h`<label><input type="checkbox" name="switch" value="${s.switch}"> ${s.switch} (${s.on ? 'on' : 'off'})</label>`)}</fieldset>
        <p class="help">${form.adviser_question}</p>
        <button type="submit">Record the sign-off</button></form>`}
    ${rec === null ? h`<p class="help">The reconciliation opens with the first sign-off record.</p>` : h`<h3>The reconciliation — ${rec.case_id}, ${rec.status}</h3><dl>
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
        ${l.may_issue ? h`<form method="post" action="/staff/claims/${claim_id}/deliverables" class="inline"><input type="hidden" name="kind" value="${l.kind}"><input type="hidden" name="action" value="ISSUE"><input name="issued_on" type="date"><input name="content_hash" placeholder="SHA-256"><button type="submit">Issue</button></form>` : raw('')}
        ${l.refused_why === null ? raw('') : h`<span class="help">${l.refused_why}</span>`}</td></tr>`)}
    </tbody></table></div>`;
}

export function aftercareBlock(claim_id: string, p: R.AftercarePanel | undefined): Safe {
  if (p === undefined) return raw('');
  return h`<div class="pblock"><div class="pnum">Aftercare</div>
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
