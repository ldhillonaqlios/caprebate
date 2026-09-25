/**
 * THE ROLE EDITOR'S SCREENS — /staff/admin/roles. Phase 151b, 25 September 2026.
 *
 * Phase 151 built the role editor itself (src/web/role-editor.ts: makeRole, changeRole, retireRole, every step in the
 * audit log) and its hard limits (src/custom-roles.ts, roleRefusal), and left them with no screen. This is the screen.
 * NOTHING HERE DECIDES ANYTHING: every write goes through the editor, which authorises `role.manage` (the super admin's
 * alone, and never given to a made role) and refuses with roleRefusal's own sentence, shown here word for word.
 *
 *   GET  /staff/admin/roles                 every role the super admin made, live first: what it can do, who has it
 *   GET  /staff/admin/roles/new             make one: a name, and each thing it can see or do as a plain choice
 *   POST /staff/admin/roles                 makeRole
 *   GET  /staff/admin/roles/{role}          change one: the same choices, with what it has now chosen
 *   POST /staff/admin/roles/{role}          changeRole — everybody holding it signs in again
 *   POST /staff/admin/roles/{role}/retire   retireRole — only once nobody holds it
 *
 * EACH CHOICE IS ONE THING THE BACK OFFICE DOES, IN WORDS, GROUPED BY AREA, AND EACH IS BORROWED FROM A BUILT-IN ROLE:
 * "Record a payment received — like Accounting". A made role can only ever do what a built-in role already does, with
 * that role's own test on each object (src/custom-roles.ts). So for each thing the screen offers only the built-in
 * roles that do it, and "No". Things no staff role does, and the things only the super admin may do, are not offered.
 *
 * EVERY REGISTERED ACTION HAS WORDS HERE, OR IS NAMED AS NEVER OFFERED. test/phase151b.test.ts fails on a new action with
 * no words, so a new right cannot reach this screen as a code word.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { builtInHolds, type Actor } from '../authz.ts';
import { BORROWABLE_ROLES, NEVER_GRANTED, type BorrowableRole } from '../custom-roles.ts';
import { h, page, raw, type Safe, HTML_HEADERS } from './html.ts';
import { changeRole, listMadeRoles, makeRole, retireRole } from './role-editor.ts';

export type RoleEditorPageDeps = {
  readonly app: App;
  readonly nav: (actor: Actor) => Safe;
  readonly problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

export const ROLE_WORDS: Readonly<Record<BorrowableRole, string>> = Object.freeze({
  ADMIN: 'Admin', SALES: 'Sales', ACCOUNTING: 'Accounting', SURVEYING: 'Surveying',
});

/** The areas, in the order the screen shows them. */
export const AREAS: readonly string[] = Object.freeze([
  'Getting in', 'Your own account', 'Enquiries and leads', 'The calendar', 'Clients and properties', 'Claims',
  'The claim’s facts and figures', 'Lookups', 'Tasks and automation', 'Talking to the client', 'Files',
  'Surveys', 'Money', 'Firms that send us clients', 'Registers and records', 'Lists and settings',
]);

/** Every action the back office knows, as [area, the thing it lets a person do]. */
export const ACTION_WORDS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  'backoffice.enter': ['Getting in', 'Open the back office'],
  'dashboard.enter': ['Getting in', 'Open the dashboard'],
  'document_centre.enter': ['Getting in', 'Open the document centre'],
  'user.read_self': ['Your own account', 'See their own account'],
  'user.change_own_password': ['Your own account', 'Change their own password'],
  'user.change_own_profile': ['Your own account', 'Change their own name and details'],
  'user.set_photo': ['Your own account', 'Set their own photo'],
  'working_time.write': ['Your own account', 'Set working hours'],
  'working_time.read': ['Your own account', 'See working hours'],
  'assessment.read': ['Enquiries and leads', 'Read an online assessment'],
  'answer.read': ['Enquiries and leads', 'Read the answers a client gave'],
  'lead.read': ['Enquiries and leads', 'See leads'],
  'lead.write': ['Enquiries and leads', 'Change a lead'],
  'lead.convert': ['Enquiries and leads', 'Turn a lead into a client'],
  'pipeline.read': ['Enquiries and leads', 'See the pipeline'],
  'booking.read': ['The calendar', 'See the calendar and bookings'],
  'booking.write': ['The calendar', 'Book or move a call'],
  'booking.move_own': ['The calendar', 'Move their own booking'],
  'business.read': ['Clients and properties', 'See a client’s name'],
  'organisation.read': ['Clients and properties', 'See the clients area and a client’s record'],
  'client_billing.read': ['Clients and properties', 'See the clients area for billing: who to chase and what is owed'],
  'organisation.write': ['Clients and properties', 'Change a client’s record'],
  'contact.read': ['Clients and properties', 'See a client’s contacts'],
  'contact.write': ['Clients and properties', 'Add or change a contact'],
  'property.enter': ['Clients and properties', 'Open the properties area'],
  'property.read': ['Clients and properties', 'See a property'],
  'property.write': ['Clients and properties', 'Add or change a property'],
  'engagement.read': ['Clients and properties', 'See where the engagement letter is'],
  'claim.enter': ['Claims', 'Open the claims area'],
  'claim.read': ['Claims', 'See a claim'],
  'claim.read_value': ['Claims', 'See what a claim is worth'],
  'claim.create': ['Claims', 'Open a new claim'],
  'claim.write': ['Claims', 'Change a claim'],
  'claim.progress_read': ['Claims', 'See how far a claim has got'],
  'claim.move': ['Claims', 'Move a claim to its next stage'],
  'claim.reopen': ['Claims', 'Reopen a claim'],
  'claim_team.write': ['Claims', 'Add or remove people on a claim’s team'],
  'timeline.read': ['Claims', 'See a claim’s history'],
  'estimate.read': ['The claim’s facts and figures', 'See our first estimate'],
  'claim_facts.read': ['The claim’s facts and figures', 'See the claim’s facts'],
  'claim_facts.read_released': ['The claim’s facts and figures', 'See the facts given to the surveyor after they sign off'],
  'claim_facts.record': ['The claim’s facts and figures', 'Record a claim fact'],
  'claim_figures.read': ['The claim’s facts and figures', 'See the four figures'],
  'tax_signoff.record': ['The claim’s facts and figures', 'Record the tax adviser’s sign-off'],
  'reconciliation.record': ['The claim’s facts and figures', 'Record how the figures compare'],
  'deliverable.read': ['The claim’s facts and figures', 'See the reports and letters we send'],
  'deliverable.record': ['The claim’s facts and figures', 'Record a report or letter we send'],
  'hmrc_enquiry.record': ['The claim’s facts and figures', 'Record an HMRC enquiry'],
  'client_filing.record': ['The claim’s facts and figures', 'Record that the claim was filed'],
  'defence_pack.generate': ['The claim’s facts and figures', 'Make the pack we keep in case HMRC asks'],
  'research.run': ['Lookups', 'Run the lookups'],
  'research.read': ['Lookups', 'See what the lookups found'],
  'register_record.read': ['Lookups', 'See a public register’s record'],
  'fact.approve': ['Lookups', 'Tick a fact as checked'],
  'staff_task.read': ['Tasks and automation', 'See tasks'],
  'staff_task.create': ['Tasks and automation', 'Create a task'],
  'staff_task.write': ['Tasks and automation', 'Change a task'],
  'staff_task.progress': ['Tasks and automation', 'Mark progress on a task'],
  'automation_rule.read': ['Tasks and automation', 'See the automation rules'],
  'automation_rule.write': ['Tasks and automation', 'Change the automation rules'],
  'client_step.tell': ['Talking to the client', 'Tell the client a step is done'],
  'client_step.take_back': ['Talking to the client', 'Take back a step told to the client'],
  'client_step.read': ['Talking to the client', 'See the client’s steps'],
  'internal_note.read': ['Talking to the client', 'Read internal notes'],
  'internal_note.write': ['Talking to the client', 'Write an internal note'],
  'client_message.read': ['Talking to the client', 'Read the chat with a client'],
  'client_message.write': ['Talking to the client', 'Write to a client on the chat'],
  'inbound_email.read': ['Talking to the client', 'Read emails that came in'],
  'inbound_email.file': ['Talking to the client', 'File an email that came in'],
  'email.queue': ['Talking to the client', 'Email a client'],
  'email_template.read': ['Talking to the client', 'See the email wording'],
  'email_template.write': ['Talking to the client', 'Change the email wording'],
  'document.read': ['Files', 'Open a file'],
  'document.read_original': ['Files', 'Open a kept original file'],
  'document.upload': ['Files', 'Upload a file'],
  'document.link': ['Files', 'Link a file to a claim or property'],
  'document.show_to_client': ['Files', 'Show a file to the client'],
  'document.vouch': ['Files', 'Say whether a name in a file is a company'],
  'document_type.read': ['Files', 'See the kinds of document we ask for'],
  'document_type.write': ['Files', 'Change the kinds of document we ask for'],
  'document_request.read': ['Files', 'See what we asked the client to send'],
  'document_request.create': ['Files', 'Ask the client for a file'],
  'document_request.withdraw': ['Files', 'Withdraw a request for a file'],
  'surveyor_job.enter': ['Surveys', 'Open the survey area'],
  'surveyor_job.read': ['Surveys', 'See a survey job'],
  'surveyor_job.commit': ['Surveys', 'Sign off a survey'],
  'surveyor_job.assign': ['Surveys', 'Give a survey job to a surveyor'],
  'invoice.read': ['Money', 'See invoices'],
  'invoice.write': ['Money', 'Change an invoice'],
  'invoice.raise': ['Money', 'Raise an invoice'],
  'invoice.credit': ['Money', 'Credit an invoice'],
  'invoice.record_received': ['Money', 'Record a payment received, and chase one'],
  'finance_setting.write': ['Money', 'Change the money settings'],
  'fee_discount.read': ['Money', 'See a fee discount'],
  'fee_discount.record': ['Money', 'Record a fee discount'],
  'introducer.enter': ['Firms that send us clients', 'Open the introducers area'],
  'introducer.read': ['Firms that send us clients', 'See a firm that sends us clients'],
  'introducer.read_value': ['Firms that send us clients', 'See what their clients’ claims are worth'],
  'introducer.read_money': ['Firms that send us clients', 'See what we owe or paid a firm'],
  'introducer.write': ['Firms that send us clients', 'Add or change a firm'],
  'introducer.merge': ['Firms that send us clients', 'Join two records of one firm'],
  'share_consent.read': ['Firms that send us clients', 'See what a client lets us share'],
  'share_consent.record': ['Firms that send us clients', 'Record what a client lets us share'],
  'share_consent.client_record': ['Firms that send us clients', 'Give or refuse sharing, as the client'],
  'introducer_reward.read': ['Firms that send us clients', 'See the introducer fees'],
  'introducer_reward.switch': ['Firms that send us clients', 'Change how introducer fees work'],
  'introducer_fee.read': ['Firms that send us clients', 'See the fee owed to a firm'],
  'introducer_fee.disclose': ['Firms that send us clients', 'Tell the client about an introducer fee'],
  'introducer_fee.record_settled': ['Firms that send us clients', 'Record an introducer fee as paid'],
  'compliance.read': ['Registers and records', 'See the compliance registers'],
  'compliance.write': ['Registers and records', 'Change the compliance registers'],
  'compliance.identity_read': ['Registers and records', 'See people named in documents'],
  'compliance.identity_write': ['Registers and records', 'Record people named in documents'],
  'disclosure.read': ['Registers and records', 'See what we shared and with whom'],
  'disclosure.record': ['Registers and records', 'Record something we shared'],
  'audit.read': ['Registers and records', 'Read the audit log'],
  'list.export': ['Lists and settings', 'Download a list'],
  'saved_view.write': ['Lists and settings', 'Save a filtered list'],
  'saved_view.share': ['Lists and settings', 'Share a saved list'],
  'configuration.read': ['Lists and settings', 'See the switches'],
  'configuration.write': ['Lists and settings', 'Change the switches'],
});

/** The staff roles that do this thing today — the only ones a made role may borrow it from. */
export function lenders(action: string): BorrowableRole[] {
  return BORROWABLE_ROLES.filter((r) => builtInHolds(action, r));
}

/** What the screen offers: every action with words, that some staff role does, and that is not the super admin's alone. */
export function offered(): { area: string; items: { action: string; label: string; from: BorrowableRole[] }[] }[] {
  return AREAS.map((area) => ({
    area,
    items: Object.entries(ACTION_WORDS)
      .filter(([action, [a]]) => a === area && !NEVER_GRANTED.includes(action) && lenders(action).length > 0)
      .map(([action, [, label]]) => ({ action, label, from: lenders(action) })),
  })).filter((g) => g.items.length > 0);
}

/** The form's choices, read back: one field per action, `g:<action>`, holding a staff role or nothing. */
export function grantsFromForm(f: URLSearchParams): { action: string; as_role: string }[] {
  const out: { action: string; as_role: string }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith('g:') || v === '') continue;
    out.push({ action: k.slice(2), as_role: v });
  }
  return out;
}

function choices(chosen: ReadonlyMap<string, string>): Safe {
  return h`${offered().map((g) => h`<fieldset class="role-area"><legend>${g.area}</legend>
    ${g.items.map((i) => h`<div class="role-choice"><span class="role-thing">${i.label}</span>
      <label class="opt"><input type="radio" name="g:${i.action}" value=""${chosen.has(i.action) ? raw('') : raw(' checked')}> No</label>
      ${i.from.map((r) => h`<label class="opt"><input type="radio" name="g:${i.action}" value="${r}"${chosen.get(i.action) === r ? raw(' checked') : raw('')}> Like ${ROLE_WORDS[r]}</label>`)}
    </div>`)}</fieldset>`)}`;
}

const EXPLAIN = h`<p class="help">Each thing a role can do is borrowed from one of our own roles. It works exactly as it does
  for that role. So “Like Surveying” for “See a survey job” means only the jobs given to that person.</p>
  <p class="help">Some things are never offered. Only the super admin can add people, give roles or make roles. A role
  that can survey can never see our estimate or what a claim is worth.</p>`;

function listPage(nav: Safe, rows: ReturnType<typeof listMadeRoles>, done: string | null): string {
  return page({
    title: 'Roles', nav, wide: true,
    body: h`<h1>Roles you have made</h1>
      ${done === null ? raw('') : h`<p class="help">✓ ${done === 'retired' ? 'The role is retired.' : 'Saved.'}</p>`}
      <p class="help">Our own roles — Admin, Sales, Accounting and Surveying — cannot be changed here. Make a new role
      when somebody needs a mix of them.</p>
      <p><a class="cta" href="/staff/admin/roles/new">Make a role</a></p>
      ${rows.length === 0 ? h`<p class="help">You have not made a role yet.</p>` : h`<table><thead><tr><th>Role</th><th>What it can do</th><th>People</th><th>State</th></tr></thead><tbody>
        ${rows.map((r) => h`<tr><td>${r.retired ? r.name : h`<a href="/staff/admin/roles/${r.key}">${r.name}</a>`}</td>
          <td>${r.grants.length} ${r.grants.length === 1 ? 'thing' : 'things'}</td><td>${r.holders}</td><td>${r.retired ? 'retired' : 'in use'}</td></tr>`)}</tbody></table>`}
      <p><a href="/staff/users">Back to users and roles</a></p>`,
  });
}

function makePage(nav: Safe): string {
  return page({
    title: 'Make a role', nav, wide: true,
    body: h`<h1>Make a role</h1>${EXPLAIN}
      <form method="post" action="/staff/admin/roles">
        <label class="fl" for="role-name">The role’s name</label><input class="fi" id="role-name" name="name" maxlength="60" required>
        ${choices(new Map([['backoffice.enter', 'SALES']]))}
        <button class="cta" type="submit">Make the role</button></form>
      <p><a href="/staff/admin/roles">Back to roles</a></p>`,
  });
}

function changePage(nav: Safe, r: ReturnType<typeof listMadeRoles>[number]): string {
  return page({
    title: `Change ${r.name}`, nav, wide: true,
    body: h`<h1>Change the role: ${r.name}</h1>${EXPLAIN}
      <p class="help">${r.holders === 0 ? 'Nobody has this role yet.' : `${r.holders === 1 ? 'One person has' : `${r.holders} people have`} this role. They sign in again after a change.`}</p>
      <form method="post" action="/staff/admin/roles/${r.key}">
        ${choices(new Map(r.grants.map((g) => [g.action, g.as_role])))}
        <button class="cta" type="submit">Save the role</button></form>
      <form method="post" action="/staff/admin/roles/${r.key}/retire">
        <p class="help">A retired role can no longer be given to anybody. It is kept, so the audit log still makes sense.</p>
        <button class="linkish" type="submit">Retire this role</button></form>
      <p><a href="/staff/admin/roles">Back to roles</a></p>`,
  });
}

function html(res: ServerResponse, body: string): 'handled' {
  res.writeHead(200, HTML_HEADERS); res.end(body); return 'handled';
}
function redirect(res: ServerResponse, to: string): 'handled' {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' }); res.end(''); return 'handled';
}

export async function handleRoleEditor(
  d: RoleEditorPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const path = url.pathname;
  if (path !== '/staff/admin/roles' && !path.startsWith('/staff/admin/roles/')) return 'not-mine';
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now };
  const nav = d.nav(actor);
  if (path === '/staff/admin/roles' && method === 'GET') return html(res, listPage(nav, listMadeRoles(d.app.db, actor), url.searchParams.get('done')));
  if (path === '/staff/admin/roles/new' && method === 'GET') {
    listMadeRoles(d.app.db, actor); // the same gate as the list: role.manage
    return html(res, makePage(nav));
  }
  if (path === '/staff/admin/roles' && method === 'POST') {
    const f = await form(req);
    const r = makeRole(deps, actor, { name: f.get('name') ?? '', grants: grantsFromForm(f) });
    return r.ok ? redirect(res, '/staff/admin/roles?done=saved') : d.problem(res, actor, 'Role not made', r.why, '/staff/admin/roles/new');
  }
  const one = /^\/staff\/admin\/roles\/(ROLE_[A-Z0-9_]+)(\/retire)?$/.exec(path);
  if (one === null) return 'not-mine';
  const key = one[1] ?? '';
  if (one[2] === undefined && method === 'GET') {
    const r = listMadeRoles(d.app.db, actor).find((x) => x.key === key && !x.retired);
    if (r === undefined) return d.problem(res, actor, 'No such role', 'There is no role like that to change. It may have been retired.', '/staff/admin/roles');
    return html(res, changePage(nav, r));
  }
  if (method !== 'POST') return 'not-mine';
  if (one[2] === '/retire') {
    const r = retireRole(deps, actor, key);
    return r.ok ? redirect(res, '/staff/admin/roles?done=retired') : d.problem(res, actor, 'Role not retired', r.why, `/staff/admin/roles/${key}`);
  }
  const r = changeRole(deps, actor, key, { grants: grantsFromForm(await form(req)) });
  return r.ok ? redirect(res, '/staff/admin/roles?done=saved') : d.problem(res, actor, 'Role not changed', r.why, `/staff/admin/roles/${key}`);
}

/** The made roles a person may be given, for the users page: live ones only, by their own name. */
export function madeRoleChoices(app: App, actor: Actor): { key: string; name: string }[] {
  try {
    return listMadeRoles(app.db, actor).filter((r) => !r.retired).map((r) => ({ key: r.key, name: r.name }));
  } catch { return []; }
}
