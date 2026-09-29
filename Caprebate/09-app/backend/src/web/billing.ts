/**
 * THE CLIENTS AREA FOR ACCOUNTING — RAISE, CHASE, RECORD PAYMENT. Phase 151b, 25 September 2026.
 *
 * WHAT WAS DECIDED. Lakhbir, Word answer 40 (closed 24 September 2026): "I think best the accounting team have access to
 * this specific area so they can get notified to raise the invoice and chase, and also update once payment has been
 * received". Closed as: Accounting should see the clients area, so it is told to raise the invoice, chases it and
 * records payment.
 *
 * WHAT WAS ALREADY THERE, AND WHAT WAS NOT. Being told to raise the invoice was built: when a claim reaches the invoice
 * stage, rule-invoice-finance-task gives Accounting a task (migration 012), and the finance page lists every claim
 * waiting to be invoiced. Recording payment was built (recordReceived, src/web/invoices.ts). Two things were missing:
 *   1. THE CLIENTS AREA. The Clients tab was gated on `organisation.read` — the WHOLE client record — which Accounting
 *      does not hold, on purpose (src/authz.ts): the record carries internal notes, the research, the answers the
 *      client gave, and where the client came from. Opening it to Accounting failed fifteen tests that guard exactly
 *      those boundaries. So Accounting gets its own view of the same area, `client_billing.read`: each client's name,
 *      the people to chase and how to reach them, the claims waiting for an invoice, and the invoices with what is
 *      owed, what is overdue and every chase. Nothing else, and nothing it may not already read on the finance page.
 *   2. THE CHASE. Nowhere to record one. `recordChase` records a chase a person made — the day, how, a short note —
 *      authorised as recording money received is (`invoice.record_received`). IT SENDS NOTHING: no rule may chase an
 *      invoice by email while the invoice-fraud procedure is unwritten (src/web/automation.ts, INVOICE_REMINDER).
 *
 * A LOGIN THAT HOLDS THE WHOLE RECORD (Admin, Sales) SEES THE CLIENT PAGE AS BEFORE. This view is drawn only for a
 * login that holds `client_billing.read` and not `organisation.read` — today, Accounting.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { h, page, raw, HTML_HEADERS, type Safe } from './html.ts';
import { localDate } from './localtime.ts';
import { dateField, textField, words, type Fields, type Vocab } from './compliance.ts';
import { claimInvoices, financeDashboard, type ClaimInvoiceView, type ExpectedClaim } from './invoices.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { formatPence } from './shown-range.ts';

export const CHASE_WAYS: Vocab = Object.freeze({
  PHONE: 'A phone call', EMAIL: 'An email', LETTER: 'A letter', IN_PERSON: 'In person',
});

const SECTION = '__clients_billing__';

/** Whether this login reads the billing view of a client — the object test, for one client or the whole area. */
function billingObj(id: string = SECTION): { type: 'business'; id: string } {
  return { type: 'business', id };
}

/** The Clients tab's gate: the whole record (Admin, Sales, read-only) or the billing view of it (Accounting). */
export function clientsAreaGate(actor: Actor): void {
  if (can(actor, 'organisation.read', { type: 'business', id: '__section__' })) return;
  authorise(actor, 'client_billing.read', billingObj());
}

/** Whether to draw the billing view rather than the client record: billing yes, the whole record no. */
export function billingViewFor(actor: Actor, id: string = SECTION): boolean {
  return !can(actor, 'organisation.read', { type: 'business', id }) && can(actor, 'client_billing.read', billingObj(id));
}

export type ChaseLine = { readonly chased_on: string; readonly how: string; readonly note: string | null; readonly by: string };

function chasesOf(db: App['db'], invoice_id: string): ChaseLine[] {
  return db.all<{ chased_on: string; how: string; note: string | null; who: string | null }>(
    'SELECT c.chased_on, c.how, c.note, u.display_name AS who FROM invoice_chases c LEFT JOIN users u ON u.id = c.chased_by ' +
      'WHERE c.invoice_id = ? ORDER BY c.chased_on DESC, c.rowid DESC', [invoice_id])
    .map((c) => ({ chased_on: c.chased_on, how: words(CHASE_WAYS, c.how, c.how), note: c.note, by: c.who ?? 'a former user' }));
}

const OPEN_STATES = new Set(['NOTHING_RECEIVED', 'PART_RECEIVED']);

export type BillingInvoice = ClaimInvoiceView & { readonly chases: readonly ChaseLine[]; readonly open: boolean; readonly may_chase: boolean };

export type BillingClient = {
  readonly id: string;
  readonly name: string;
  readonly contacts: readonly { readonly name: string; readonly role: string | null; readonly email: string | null; readonly phone: string | null }[];
  readonly to_invoice: readonly ExpectedClaim[];
  readonly invoices: readonly BillingInvoice[];
  readonly outstanding: string;
  readonly overdue_count: number;
};

/** Every client with something to invoice or an invoice, for this login. */
export function billingClients(db: App['db'], actor: Actor, nowIso: string): { id: string; name: string; to_invoice: number; open: number; outstanding: string; overdue: number; last_chased: string | null }[] {
  authorise(actor, 'client_billing.read', billingObj());
  const fd = financeDashboard(db, actor, nowIso);
  const bizOfClaim = (claim_id: string): string | undefined => db.get<{ b: string }>('SELECT business_id AS b FROM claims WHERE id = ?', [claim_id])?.b;
  const ids = new Set<string>([...fd.expected.claims.map((e) => bizOfClaim(e.claim_id) ?? ''), ...fd.invoices.map((i) => bizOfClaim(i.claim.id) ?? '')].filter((x) => x !== ''));
  return [...ids].filter((id) => can(actor, 'client_billing.read', billingObj(id))).map((id) => {
    const inv = fd.invoices.filter((i) => bizOfClaim(i.claim.id) === id && i.state.key !== 'CANCELLED');
    const open = inv.filter((i) => OPEN_STATES.has(i.money.state));
    const last = open.map((i) => chasesOf(db, i.id)[0]?.chased_on ?? null).filter((x): x is string => x !== null).sort().at(-1) ?? null;
    return {
      id, name: db.get<{ name: string }>('SELECT name FROM businesses WHERE id = ?', [id])?.name ?? '',
      to_invoice: fd.expected.claims.filter((e) => bizOfClaim(e.claim_id) === id).length,
      open: open.length, outstanding: formatPence(open.reduce((a, i) => a + i.money.outstanding_pence, 0)),
      overdue: open.filter((i) => i.money.overdue).length, last_chased: last,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** One client, as Accounting reads it. A client this login may not read is not found, exactly as a missing one. */
export function billingClient(db: App['db'], actor: Actor, id: string, nowIso: string): BillingClient {
  const b = db.get<{ id: string; name: string }>('SELECT id, name FROM businesses WHERE id = ?', [id]);
  if (b === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'client_billing.read', billingObj(id));
  const fd = financeDashboard(db, actor, nowIso);
  const claims = new Set(db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [id]).map((c) => c.id));
  const invoices = claimInvoices(db, actor, nowIso).filter((i) => claims.has(i.claim.id)).map((i): BillingInvoice => {
    const open = i.state.key !== 'CANCELLED' && OPEN_STATES.has(i.money.state);
    return { ...i, chases: chasesOf(db, i.id), open, may_chase: open && i.may.record_received };
  });
  const open = invoices.filter((i) => i.open);
  return {
    id: b.id, name: b.name,
    contacts: db.all<{ full_name: string; job_role: string | null; email: string | null; phone: string | null }>(
      'SELECT full_name, job_role, email, phone FROM contacts WHERE business_id = ? ORDER BY is_decision_maker DESC, full_name', [id])
      .map((c) => ({ name: c.full_name, role: c.job_role, email: c.email, phone: c.phone })),
    to_invoice: fd.expected.claims.filter((e) => claims.has(e.claim_id)),
    invoices, outstanding: formatPence(open.reduce((a, i) => a + i.money.outstanding_pence, 0)),
    overdue_count: open.filter((i) => i.money.overdue).length,
  };
}

export type ChaseResult = { readonly ok: true; readonly id: string; readonly business_id: string } | { readonly ok: false; readonly why: string };

/**
 * Record one chase of an unpaid invoice. Authorised as recording money received is. Only an invoice that is still
 * owed can be chased, on a day that is not in the future. Sends nothing.
 */
export function recordChase(
  d: { db: App['db']; audit: App['audit']; now: () => string; newId: () => string }, actor: Actor, invoice_id: string, input: Fields,
): ChaseResult {
  const inv = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM invoices WHERE id = ? AND claim_id IS NOT NULL', [invoice_id]);
  if (inv === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'invoice.record_received', { type: 'invoice', id: inv.id, business_id: inv.business_id });
  const view = claimInvoices(d.db, actor, d.now()).find((i) => i.id === inv.id);
  if (view === undefined || view.state.key === 'CANCELLED' || !OPEN_STATES.has(view.money.state)) {
    return { ok: false, why: 'Only an invoice that is still owed can be chased.' };
  }
  const on = dateField(input['chased_on'], 'The day you chased it');
  if (!on.ok) return on;
  const day = on.value ?? localDate(d.now());
  if (day > localDate(d.now())) return { ok: false, why: 'A chase cannot be dated after today.' };
  const how = input['how'] ?? '';
  if (!Object.prototype.hasOwnProperty.call(CHASE_WAYS, how)) return { ok: false, why: 'Say how you chased it: a call, an email, a letter or in person.' };
  const note = textField(input['note'], 500, 'The note');
  if (!note.ok) return note;
  const id = d.newId();
  d.db.run('INSERT INTO invoice_chases (id, invoice_id, chased_on, how, note, chased_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, inv.id, day, how, note.value, actor.id, d.now()]);
  d.audit.append({
    at: d.now(), kind: 'INVOICE_CHASED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'invoice', object_id: inv.id, detail: { chased_on: day, how },
  });
  return { ok: true, id, business_id: inv.business_id };
}

/* ================================================================== *
 * THE SCREENS
 * ================================================================== */

function listPage(nav: Safe, rows: ReturnType<typeof billingClients>): string {
  return page({
    title: 'Clients', nav, wide: true,
    body: h`<h1>Clients</h1>
      <p class="help">Each client with a claim waiting for an invoice, or an invoice. Open one to raise an invoice, chase it or
      record a payment.</p>
      ${rows.length === 0 ? h`<p class="help">No client has anything to invoice yet.</p>` : h`<table><thead><tr><th>Client</th><th>Waiting for an invoice</th>
        <th>Invoices still owed</th><th>Owed</th><th>Overdue</th><th>Last chased</th></tr></thead><tbody>
        ${rows.map((r) => h`<tr><td><a href="/staff/clients/${r.id}">${r.name}</a></td><td>${r.to_invoice}</td><td>${r.open}</td><td>${r.outstanding}</td>
          <td>${r.overdue === 0 ? 'none' : h`<strong>${r.overdue}</strong>`}</td><td>${r.last_chased ?? 'not yet'}</td></tr>`)}</tbody></table>`}`,
  });
}

function chaseForm(i: BillingInvoice, today: string): Safe {
  return h`<form method="post" action="/staff/finance/${i.id}/chase" class="inline-form">
    <label class="fl" for="chase-on-${i.id}">Day you chased it</label><input class="fi" id="chase-on-${i.id}" type="date" name="chased_on" value="${today}">
    <label class="fl" for="chase-how-${i.id}">How</label><select class="fi" id="chase-how-${i.id}" name="how">
      ${Object.entries(CHASE_WAYS).map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select>
    <label class="fl" for="chase-note-${i.id}">Note (optional)</label><input class="fi" id="chase-note-${i.id}" name="note" maxlength="500">
    <button class="cta" type="submit">Record the chase</button></form>`;
}

function clientPage(nav: Safe, v: BillingClient, today: string, done: string | null): string {
  return page({
    title: v.name, nav, wide: true,
    body: h`<h1>${v.name}</h1>
      ${done === 'chased' ? h`<p class="help">✓ The chase is recorded.</p>` : raw('')}
      <p class="help">Owed now: <strong>${v.outstanding}</strong>${v.overdue_count === 0 ? '' : `, with ${v.overdue_count} overdue`}.
      Record a payment on the invoice’s own page.</p>
      <h2>Who to contact</h2>
      ${v.contacts.length === 0 ? h`<p class="help">No contact is recorded. Ask Sales to add one.</p>` : h`<table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead><tbody>
        ${v.contacts.map((c) => h`<tr><td>${c.name}</td><td>${c.role ?? ''}</td><td>${c.email ?? 'not given'}</td><td>${c.phone ?? 'not given'}</td></tr>`)}</tbody></table>`}
      <h2>Waiting for an invoice</h2>
      ${v.to_invoice.length === 0 ? h`<p class="help">No claim is waiting for an invoice.</p>` : h`<ul>${v.to_invoice.map((e) => h`<li>${e.claim_ref}: our fee ${e.expected}.
        ${e.finance_task === null ? '' : `Your task: ${e.finance_task.title} (${e.finance_task.due.label}).`}
        <a href="/staff/finance#to-invoice">Raise it on the finance page</a></li>`)}</ul>`}
      <h2>Invoices</h2>
      ${v.invoices.length === 0 ? h`<p class="help">No invoice yet.</p>` : v.invoices.map((i) => h`<section class="card"><div class="card-h"><h2><a href="/staff/finance/${i.id}">${i.number ?? 'An invoice with no number yet'}</a></h2></div>
        <p>${i.claim.claim_ref} · ${i.money.label} · owed ${i.money.outstanding} · ${i.money.due.label}</p>
        ${i.chases.length === 0 ? h`<p class="help">Not chased yet.</p>` : h`<ul>${i.chases.map((c) => h`<li>${c.chased_on}: ${c.how}, by ${c.by}${c.note === null ? '' : ` — ${c.note}`}</li>`)}</ul>`}
        ${i.may_chase ? chaseForm(i, today) : raw('')}</section>`)}
      <p><a href="/staff/clients">Back to clients</a></p>`,
  });
}

function send(res: ServerResponse, body: string): 'handled' {
  res.writeHead(200, HTML_HEADERS); res.end(body); return 'handled';
}

export async function handleBilling(
  d: { app: App; newId: () => string; nav: (actor: Actor) => Safe; problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string) => 'handled' },
  req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const path = url.pathname;
  const now = d.app.now;
  const chase = /^\/staff\/finance\/([A-Za-z0-9-]+)\/chase$/.exec(path);
  if (chase && method === 'POST') {
    const f = await form(req);
    const fields: Fields = { chased_on: f.get('chased_on'), how: f.get('how'), note: f.get('note') };
    const r = recordChase({ db: d.app.db, audit: d.app.audit, now, newId: d.newId }, actor, chase[1] ?? '', fields);
    if (!r.ok) return d.problem(res, actor, 'Chase not recorded', r.why, `/staff/finance/${chase[1] ?? ''}`);
    res.writeHead(303, { location: billingViewFor(actor, r.business_id) ? `/staff/clients/${r.business_id}?done=chased` : `/staff/finance/${chase[1] ?? ''}?saved=chased`, 'content-type': 'text/plain; charset=utf-8' });
    res.end('');
    return 'handled';
  }
  if (method !== 'GET') return 'not-mine';
  if (path === '/staff/clients' && billingViewFor(actor)) return send(res, listPage(d.nav(actor), billingClients(d.app.db, actor, now())));
  const one = /^\/staff\/clients\/([A-Za-z0-9-]+)$/.exec(path);
  if (one && billingViewFor(actor, one[1] ?? '')) {
    return send(res, clientPage(d.nav(actor), billingClient(d.app.db, actor, one[1] ?? '', now()), localDate(now()), url.searchParams.get('done')));
  }
  return 'not-mine';
}
