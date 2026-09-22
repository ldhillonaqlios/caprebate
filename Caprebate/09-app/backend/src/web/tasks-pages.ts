/**
 * THE ROUTES AND PAGES FOR STAFF TASKS, THE ONE-NEXT-ACTION RULE, AUTOMATION
 * RULES AND EMAIL TEMPLATES — and the panels the claim, organisation, property,
 * lead and landing pages draw from them. CRM 3 of 10, 11 September 2026.
 *
 * Same shape as `handleCrm` and `handlePipeline`: it returns 'not-mine' for
 * anything it does not own, so the mounting in staff.ts is one line.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED: authorise on the object on every
 * request, no route maps a path onto the filesystem, and every response is built
 * with the `h` tagged template. A task's title and description, a note, a rule's
 * label and a template's body are STAFF-SUPPLIED TEXT RENDERED IN A STAFF PAGE,
 * and test/tasks.test.ts posts a script tag into them.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/tasks.ts, automation.ts, templates.ts
 * and timeline.ts do every authorisation and every derivation.
 *
 * A `back` FIELD IS NEVER AN OPEN REDIRECT. It is followed only when it is a
 * back-office path made of path segments, and ignored otherwise.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { filterBar, TASK_FILTERS } from './navigation.ts';
import { claimRef, savedMessage, why } from './components.ts';
import * as T from './tasks.ts';
import * as A from './automation.ts';
import * as M from './templates.ts';
import { emailButton } from './free-email-pages.ts';
import { addNote } from './engaged.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import type { Fields } from './crm.ts';
import { taskChoices, type TaskChoices } from './vocabularies.ts';
import { EXITS, PROCEDURE_STAGES } from './stages.ts';
import type { Timeline } from './timeline.ts';

export type WebResult = 'handled' | 'not-mine';

export type TaskPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
});

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

function posted(f: URLSearchParams, names: readonly string[]): Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

/** A back-office path, or the fallback. Never a host, a scheme or a query. */
function backTo(f: URLSearchParams, fallback: string): string {
  const b = (f.get('back') ?? '').trim();
  return /^\/staff(\/[A-Za-z0-9-]+)*$/.test(b) ? b : fallback;
}

const TASK_FIELDS = ['title', 'description', 'owner_id', 'owner_role', 'due_on', 'priority', 'activity_type', 'recurrence',
  'claim_id', 'property_id', 'business_id', 'lead_id', 'contact_id', 'as_next_action'] as const;
const EDIT_FIELDS = ['title', 'description', 'owner_id', 'owner_role', 'due_on', 'priority', 'activity_type', 'recurrence'] as const;
// THE CRM FOLLOW-ON: `request_type` is the document a REQUEST_DOCUMENT rule asks for. The form drew it and this list
// dropped it, so every such rule was refused "Choose the document the rule asks the client for." from the rules screen.
const RULE_FIELDS = ['label', 'trigger_event', 'trigger_stage', 'trigger_activity', 'effect', 'request_type', 'task_title', 'task_description',
  'task_activity_type', 'task_priority', 'due_in_days', 'assign_to', 'assign_role', 'attach_to', 'active'] as const;

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleTasks(
  d: TaskPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const now = d.app.now;
  const deps = { db, audit: d.app.audit, now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  /* -------------------------------------------------------------- tasks */
  if (path === '/staff/tasks/view.json' && method === 'GET') {
    json(res, 200, { mine: T.myWork(db, actor, now()) });
    return 'handled';
  }
  if (path === '/staff/tasks' && method === 'GET') {
    const all = url.searchParams.get('view') === 'all' && T.mayCreateTask(actor) ? T.openTasks(db, actor, now()) : null;
    html(res, 200, tasksListPage(d, actor, T.myWork(db, actor, now()), all, done));
    return 'handled';
  }
  if (path === '/staff/tasks' && method === 'POST') {
    const f = await form(req);
    const back = backTo(f, '/staff/tasks');
    const r = T.createTask(deps, actor, posted(f, TASK_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Task not added', r.why, back, r.field);
    redirect(res, `${back}?done=task`);
    return 'handled';
  }
  const taskStatus = /^\/staff\/tasks\/([A-Za-z0-9-]+)\/status$/.exec(path);
  if (taskStatus && method === 'POST') {
    const id = taskStatus[1] ?? '';
    const f = await form(req);
    const back = backTo(f, `/staff/tasks/${id}`);
    const r = T.setTaskStatus(deps, actor, id, f.get('status'), f.get('reason'));
    if (!r.ok) return d.problem(res, actor, 'Not changed', r.why, back);
    redirect(res, `${back}?done=status`);
    return 'handled';
  }
  const task = /^\/staff\/tasks\/([A-Za-z0-9-]+)$/.exec(path);
  if (task && method === 'GET') {
    html(res, 200, taskDetailPage(d, actor, T.taskPage(db, actor, task[1] ?? '', now()), done));
    return 'handled';
  }
  if (task && method === 'POST') {
    const id = task[1] ?? '';
    const r = T.updateTask(deps, actor, id, posted(await form(req), EDIT_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/tasks/${id}`);
    redirect(res, `/staff/tasks/${id}?done=saved`);
    return 'handled';
  }

  /* ------------------------------------------- a claim's next action, note and email */
  const nextAction = /^\/staff\/claims\/([A-Za-z0-9-]+)\/next-action$/.exec(path);
  if (nextAction && method === 'POST') {
    const id = nextAction[1] ?? '';
    const r = T.setNextAction(deps, actor, id, posted(await form(req), ['task_id', 'title', 'owner_id', 'due_on', 'description']));
    if (!r.ok) return d.problem(res, actor, 'Next action not set', r.why, `/staff/claims/${id}`, r.field);
    redirect(res, `/staff/claims/${id}?done=next-action`);
    return 'handled';
  }
  const claimNote = /^\/staff\/claims\/([A-Za-z0-9-]+)\/notes$/.exec(path);
  if (claimNote && method === 'POST') {
    const id = claimNote[1] ?? '';
    const c = db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [id]);
    if (c === undefined) throw new NotFoundAsRefusal();
    const r = addNote(deps, actor, c.business_id, (await form(req)).get('body') ?? '', { claim_id: id });
    if (!r.ok) return d.problem(res, actor, 'Note not saved', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=note`);
    return 'handled';
  }
  // CRM 9 of 10: A NOTE ON A PROPERTY. `internal_notes.property_id` has existed since migration 012 and `addNote` took it;
  // only the claim page had a route. Asked of `internal_note.write` by `addNote`, as the claim's is.
  const propertyNote = /^\/staff\/properties\/([A-Za-z0-9-]+)\/notes$/.exec(path);
  if (propertyNote && method === 'POST') {
    const id = propertyNote[1] ?? '';
    const p = db.get<{ business_id: string }>('SELECT business_id FROM properties WHERE id = ?', [id]);
    if (p === undefined) throw new NotFoundAsRefusal();
    const r = addNote(deps, actor, p.business_id, (await form(req)).get('body') ?? '', { property_id: id });
    if (!r.ok) return d.problem(res, actor, 'Note not saved', r.why, `/staff/properties/${id}`);
    redirect(res, `/staff/properties/${id}?done=note`);
    return 'handled';
  }
  const email = /^\/staff\/claims\/([A-Za-z0-9-]+)\/email$/.exec(path);
  if (email && method === 'POST') {
    const id = email[1] ?? '';
    const r = M.queueTemplate(deps, actor, id, posted(await form(req), ['template_id', 'contact_id']));
    if (!r.ok) return d.problem(res, actor, 'Not queued', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=${r.gaps.length === 0 ? 'queued' : 'queued-with-gaps'}`);
    return 'handled';
  }

  /* ---------------------------------------------------- the breakers list */
  if (path === '/staff/next-actions' && method === 'GET') {
    html(res, 200, breakersPage(d, actor, T.nextActionBreakers(db, actor, now())));
    return 'handled';
  }

  /* --------------------------------------------------------- automation */
  if (path === '/staff/automation' && method === 'GET') {
    html(res, 200, rulesPageHtml(d, actor, A.rulesPage(db, actor), done));
    return 'handled';
  }
  if (path === '/staff/automation' && method === 'POST') {
    const r = A.createRule(deps, actor, posted(await form(req), RULE_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Rule not added', r.why, '/staff/automation', r.field);
    redirect(res, '/staff/automation?done=rule');
    return 'handled';
  }
  const rule = /^\/staff\/automation\/([A-Za-z0-9-]+)$/.exec(path);
  if (rule && method === 'POST') {
    const r = A.updateRule(deps, actor, rule[1] ?? '', posted(await form(req), RULE_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Rule not saved', r.why, '/staff/automation', r.field);
    redirect(res, '/staff/automation?done=rule');
    return 'handled';
  }

  /* ---------------------------------------------------------- templates */
  if (path === '/staff/templates' && method === 'GET') {
    html(res, 200, templatesPageHtml(d, actor, M.templatesPage(db, actor), done));
    return 'handled';
  }
  if (path === '/staff/templates' && method === 'POST') {
    const r = M.createTemplate(deps, actor, posted(await form(req), ['label', 'subject', 'body', 'active']));
    if (!r.ok) return d.problem(res, actor, 'Template not saved', r.why, '/staff/templates', r.field);
    redirect(res, '/staff/templates?done=template');
    return 'handled';
  }
  const template = /^\/staff\/templates\/([A-Za-z0-9-]+)$/.exec(path);
  if (template && method === 'POST') {
    const r = M.updateTemplate(deps, actor, template[1] ?? '', posted(await form(req), ['label', 'subject', 'body', 'active']));
    if (!r.ok) return d.problem(res, actor, 'Template not saved', r.why, '/staff/templates', r.field);
    redirect(res, '/staff/templates?done=template');
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * PIECES — exported where another page draws them
 * ------------------------------------------------------------------ */

function vocabOptions(vocab: Readonly<Record<string, string>>, current: string | null, blank: string | null): Safe {
  return h`${blank === null ? raw('') : h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>`}${
    Object.entries(vocab).map(([k, label]) => h`<option value="${k}"${k === current ? raw(' selected') : raw('')}>${label}</option>`)}`;
}

function ownerOptions(list: readonly { id: string; name: string; role: string }[], current: string | null, blank: string): Safe {
  return h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>${
    list.map((p) => h`<option value="${p.id}"${p.id === current ? raw(' selected') : raw('')}>${p.name} (${p.role.toLowerCase()})</option>`)}`;
}

function stageOptions(current: string | null): Safe {
  const keys: [string, string][] = [
    ...PROCEDURE_STAGES.map((s): [string, string] => [s.key, s.label]),
    ['CLOSED', 'Closed'], ['ON_HOLD', 'On hold'],
    ...EXITS.map((e): [string, string] => [e.key, `Exit — ${e.label}`]),
  ];
  return h`<option value=""${current === null ? raw(' selected') : raw('')}>any stage</option>${
    keys.map(([k, label]) => h`<option value="${k}"${k === current ? raw(' selected') : raw('')}>${label}</option>`)}`;
}

function saved(msg: string | undefined): Safe {
  if (msg === undefined) return raw('');
  if (msg === 'queued-with-gaps') {
    return savedMessage('Saved to the outbox. It has not been sent. Some merge fields had nothing recorded and show as gaps in square brackets.');
  }
  return savedMessage();
}

/** A due reading, drawn. OVERDUE is loud; no due date says so in words. */
export function dueCell(due: T.DueReading): Safe {
  if (due.overdue) return h`<strong class="overdue">${due.label}</strong>`;
  if (due.state === 'NO_DUE_DATE') return h`<span class="help">${due.label}</span>`;
  return h`${due.label}`;
}

function quickStatus(t: T.TaskView, back: string): Safe {
  if (!t.may_progress) return raw('');
  return h`${t.status.key === 'OPEN' ? h`<form method="post" action="/staff/tasks/${t.id}/status" class="inline">
      <input type="hidden" name="status" value="IN_PROGRESS"><input type="hidden" name="back" value="${back}">
      <button class="linkish" type="submit">Start</button></form>` : raw('')}
    <form method="post" action="/staff/tasks/${t.id}/status" class="inline">
      <input type="hidden" name="status" value="COMPLETED"><input type="hidden" name="back" value="${back}">
      <button class="linkish" type="submit">Complete</button></form>`;
}

export function taskRows(tasks: readonly T.TaskView[], back: string, empty: string): Safe {
  if (tasks.length === 0) return h`<p class="help">${empty}</p>`;
  return h`<table><thead><tr><th>Task</th><th>About</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead>
    <tbody>${tasks.map((t) => h`<tr class="${t.due.overdue ? 'overdue' : ''}">
      <td><a href="/staff/tasks/${t.id}">${t.title}</a>${t.is_next_action ? h`<br><strong>the claim’s next action</strong>` : raw('')}
        <br><span class="help">${t.activity.label} · ${t.origin}</span></td>
      <td>${t.about.length === 0 ? h`<span class="help">—</span>`
        : t.about.map((a) => (a.href === null ? h`${a.label}<br>` : h`<a href="${a.href}">${a.label}</a><br>`))}</td>
      <td>${t.owner.label}</td>
      <td>${dueCell(t.due)}</td>
      <td>${t.status.label}${t.closed === null ? raw('') : h`<br><span class="help">${t.closed}</span>`}</td>
      <td>${quickStatus(t, back)}</td></tr>`)}</tbody></table>`;
}

/** The form that adds a task about something — its subject carried in hidden fields. */
export function newTaskForm(
  choices: TaskChoices,
  subject: Readonly<Record<string, string>>,
  owners: readonly { id: string; name: string; role: string }[],
  back: string,
  heading = 'Add a task',
  contacts: readonly { id: string; name: string }[] = [],
): Safe {
  return h`<details id="add-task"><summary>${heading}</summary><form method="post" action="/staff/tasks">
    ${Object.entries(subject).map(([k, v]) => h`<input type="hidden" name="${k}" value="${v}">`)}
    <input type="hidden" name="back" value="${back}">
    <label>Task <span class="req">(required)</span> <input name="title" required></label>
    <label>Owner <select name="owner_id">${ownerOptions(owners, null, 'Nobody yet. It waits with a team.')}</select></label>
    <label>Due <input name="due_on" type="date"></label>
    <details class="more-options"><summary>More options</summary>
    <label>Description <textarea name="description"></textarea></label>
    <label>Activity <select name="activity_type">${vocabOptions(choices.activity, 'TASK', null)}</select></label>
    ${contacts.length === 0 ? raw('') : h`<label>With a contact
      <select name="contact_id"><option value="">Nobody in particular</option>${
      contacts.map((c) => h`<option value="${c.id}">${c.name}</option>`)}</select></label>`}
    <label>Or the team it waits with <select name="owner_role">${vocabOptions(T.POOL_ROLES, null, 'No team')}</select></label>
    <label>Priority <select name="priority">${vocabOptions(choices.priority, null, 'Not set')}</select></label>
    <label>Repeats on completion <select name="recurrence">${vocabOptions(T.RECURRENCES, null, 'Does not repeat')}</select></label>
    ${Object.hasOwn(subject, 'claim_id') ? h`<label><input type="checkbox" name="as_next_action" value="yes"> Make this the claim’s next action — it needs an owner and a due date</label>` : raw('')}
    </details>
    <div class="help">A task with no due date is allowed.${why('It is shown as having no due date — never as on time.')}</div>
    <button type="submit">Add the task</button></form></details>`;
}

/** THE CLAIM PAGE'S WORK PANEL: the next action, who is waiting, overdue questions, and the tasks. */
export function claimTasksBlock(claim_id: string, p: T.ClaimTaskPanel | undefined, choices: TaskChoices): Safe {
  if (p === undefined) return raw('');
  const na = p.next_action;
  const back = `/staff/claims/${claim_id}`;
  const who = (w: string): string => (w === 'US' ? 'us' : w === 'CLIENT' ? 'the client' : 'nobody');
  return h`<div class="pblock"><div class="pnum">Next action and tasks</div>
    ${!na.required ? h`<p class="help">${na.sentence}</p>`
      : na.breaks !== null ? h`<p class="err"><strong>This claim breaks the one-next-action rule.</strong> ${na.sentence}</p>`
        : h`<p><strong>Next action:</strong> ${na.task?.title ?? ''} — ${na.task?.owner ?? ''}, ${na.task === null ? raw('') : dueCell(na.task.due)}</p>`}
    ${p.waiting === undefined ? raw('') : h`<p class="help">Waiting on ${who(p.waiting.who)} — ${p.waiting.why}. Where both sides are waiting, it reads as ours: the engaged-client list’s own rule.</p>`}
    ${!p.may_set_next_action || p.owner_choices === undefined ? raw('') : h`<details><summary>Set the next action</summary>
      <form method="post" action="/staff/claims/${claim_id}/next-action">
        <label>What happens next <input name="title" required></label>
        <label>Owner <select name="owner_id">${ownerOptions(p.owner_choices, null, 'choose the person')}</select></label>
        <label>Due <input name="due_on" type="date" required></label>
        <button type="submit">Set as the next action</button></form>
      <p class="help">The next action before it stays a task. A move to anything but closed or an exit is refused while the
      claim has no next action with an owner and a due date.</p></details>`}
    ${p.overdue_client_questions === undefined || p.overdue_client_questions.length === 0 ? raw('') : h`
      <p class="err"><strong>Client questions past their due date</strong></p>
      <ul>${p.overdue_client_questions.map((q) => h`<li class="overdue">“${q.question}” — <strong>OVERDUE</strong>, due ${q.due_on}${
        q.sent ? '' : ' — drafted and never put to the client, so this one is ours'}</li>`)}</ul>`}
    ${taskRows(p.tasks, back, 'No task on this claim that you may see.')}
    ${p.may_add_task && p.owner_choices !== undefined ? newTaskForm(choices, { claim_id }, p.owner_choices, back) : raw('')}
  </div>`;
}

/** THE TIMELINE — events only. Internal notes are drawn by `notesBlock`, never here. */
/** PHASE 134: a scope that names a claim ends " · CR-2026-0007"; the reference is drawn as the small grey label. */
function scopeCell(scope: string): Safe {
  const m = / · (CR-[0-9A-Za-z-]+)$/.exec(scope);
  return m === null ? h`${scope}` : h`${scope.slice(0, m.index)} ${claimRef(m[1] ?? '')}`;
}

export function timelineBlock(t: Timeline | undefined, heading = 'Activity timeline'): Safe {
  if (t === undefined) return raw('');
  // PHASE 138: the sentence about what the timeline is read from sits behind "Why?".
  return h`<div class="pblock"><div class="pnum">${heading}</div>
    <div class="help">${why(`${t.read_not_log} Every time is UK time.`)}</div>
    ${t.limited_to === undefined ? raw('') : h`<p class="help"><strong>${t.limited_to}</strong></p>`}
    ${t.events.length === 0 ? h`<p class="help">Nothing is recorded yet that you may see.</p>` : h`<table class="stack">
      <thead><tr><th>When</th><th>What happened</th><th>Who</th><th>Does the client see it?</th><th>Part of</th></tr></thead>
      <tbody>${t.events.map((e) => h`<tr><td class="when">${e.when}</td><td data-label="What happened">${e.what}</td>
        <td data-label="Who">${e.who ?? h`<span class="help">—</span>`}</td>
        <td data-label="Does the client see it?">${e.audience === 'CLIENT_SEES' ? 'yes' : h`<span class="help">staff only</span>`}</td><td data-label="Part of">${scopeCell(e.scope)}</td></tr>`)}</tbody></table>`}
  </div>`;
}

/**
 * INTERNAL NOTES, APART FROM THE TIMELINE — present only where `internal_note.read` put them in.
 * PHASE 142a: ONE NAME FOR THE NOTES. They are the "Team only" thread of the company's Chat (Phase 142), so the claim page
 * and the property page call them that too, with a link to the whole conversation. Each page still shows its own notes —
 * a claim's, or a property's. `chat` is the company's id; with none, the link is not drawn.
 * PHASE 134: a note belongs to the COMPANY. On the company's page it may say which claim it is about — `claims` is the
 * choice, and "The company in general" is the default. The server checks the claim is the company's (`addNote`).
 */
export function notesBlock(
  t: Timeline | undefined, action: string | null, claims: readonly { readonly id: string; readonly name: string }[] = [], chat: string | null = null,
): Safe {
  if (t === undefined || t.internal_notes === undefined) return raw('');
  return h`<div class="pblock"><div class="pnum">Team only</div>
    <p class="teamnote">Only your team sees this. The client never does.</p>
    ${chat === null ? raw('') : h`<p><a href="/staff/clients/${chat}?chat=team#chat">See the whole team chat about this client</a></p>`}
    ${why('These are the team’s notes about this page. They are also on the client’s Chat, under Team only. They are kept apart from the activity timeline, in the data as well as on this page.')}
    ${action === null ? raw('') : h`<form method="post" action="${action}">
      <label>Add a note <textarea name="body" rows="3"></textarea></label>${claims.length === 0 ? raw('') : h`
      <label>About which claim? <select name="claim_id"><option value="">The company in general</option>${
        claims.map((c) => h`<option value="${c.id}">${c.name}</option>`)}</select></label>`}<button type="submit">Save note</button></form>`}
    ${t.internal_notes.length === 0 ? h`<p class="help">No notes yet.</p>` : h`<table class="stack">
      <thead><tr><th>Note</th><th>About</th><th>Who</th><th>When</th></tr></thead>
      <tbody>${t.internal_notes.map((n) => h`<tr><td data-label="Note">${n.body}</td><td data-label="About">${scopeCell(n.about)}</td>
        <td data-label="Who">${n.who ?? h`<span class="help">a deleted account</span>`}</td><td class="when" data-label="When">${n.when}</td></tr>`)}</tbody></table>`}
  </div>`;
}

/**
 * PHASE 141 — EMAIL FROM A CLAIM. The claim page no longer merges a template in place: it opens the company's Email page
 * with this claim already chosen, where the email is typed freely and "Start from a template" fills the boxes. `contacts`
 * is undefined for a login that may not write to the company, and then nothing is drawn.
 */
export function emailBlock(
  business_id: string, claim_id: string,
  contacts: readonly { id: string; name: string; email: string | null }[] | undefined,
): Safe {
  if (contacts === undefined) return raw('');
  return h`<div class="pblock"><div class="pnum">Email</div>
    <p class="filesbtn-row">${emailButton(`/staff/clients/${business_id}/email?claim=${claim_id}`)}</p>
    <p class="help">Write to one of the company’s contacts. It goes on the company’s timeline, marked with this claim.</p></div>`;
}

/** MY TASKS — on the landing page, for every staff role. */
export function myTasksBlock(w: T.MyWork): Safe {
  return h`<div class="pblock"><div class="pnum">My tasks</div>
    ${w.overdue > 0 ? h`<p class="err"><strong>${w.overdue} overdue.</strong></p>` : raw('')}
    ${taskRows(w.tasks, '/staff', 'Nothing is yours or waiting with your team right now.')}
    ${w.client_questions_overdue.length === 0 ? raw('') : h`<p><strong>Questions you put to a client that are past their due date</strong></p>
      <ul>${w.client_questions_overdue.map((q) => h`<li class="overdue"><a href="/staff/clients/${q.business_id}">${q.client}</a>:
        “${q.question}” — <strong>OVERDUE</strong>, due ${q.due_on}</li>`)}</ul>`}
    ${w.document_requests_outstanding.length === 0 ? raw('') : h`<p><strong>Documents you asked a client for that have not arrived</strong></p>
      <ul>${w.document_requests_outstanding.map((r) => h`<li class="${r.due.overdue ? 'overdue' : ''}">${
        r.claim === null ? h`<a href="/staff/clients/${r.business_id}">${r.client}</a>`
          : h`<a href="/staff/claims/${r.claim.id}">${r.claim.name}</a> ${claimRef(r.claim.claim_ref)}`}:
        ${r.type_label} — ${r.due.overdue ? h`<strong>${r.due.label}</strong>` : h`${r.due.label}`}</li>`)}</ul>`}
    ${w.claims_without_next_action.length === 0 ? raw('') : h`<p><strong>Claims you own that break the one-next-action rule</strong></p>
      <ul>${w.claims_without_next_action.map((c) => h`<li><a href="/staff/claims/${c.id}">${c.name}</a> ${claimRef(c.claim_ref)} — ${c.sentence}</li>`)}</ul>`}
    ${w.unowned_claims_breaking.length === 0 ? raw('') : h`<p><strong>Claims nobody owns that break the one-next-action rule</strong></p>
      <ul>${w.unowned_claims_breaking.map((c) => h`<li><a href="/staff/claims/${c.id}">${c.name}</a> ${claimRef(c.claim_ref)} — ${c.sentence}
        <span class="help">— give it an owner, then its next action</span></li>`)}</ul>`}
    ${w.my_claims.length === 0 ? raw('') : h`<p><strong>My claims, their next actions, and who is waiting</strong></p>
      <ul>${w.my_claims.map((c) => h`<li class="${c.overdue ? 'overdue' : ''}"><a href="/staff/claims/${c.id}">${c.name}</a> ${claimRef(c.claim_ref)} — ${c.stage}:
        ${c.overdue ? h`<strong>${c.next_action}</strong>` : h`${c.next_action}`}${c.waiting === null ? raw('')
          : h` <span class="help">— ${c.waiting.who === 'CLIENT' ? 'waiting on the client' : c.waiting.who === 'US' ? 'waiting on us' : 'nobody is waiting'}: ${c.waiting.why}</span>`}</li>`)}</ul>`}
    ${w.questions_waiting.filter((q) => !q.due.overdue).length === 0 ? raw('') : h`<p><strong>Other questions you are waiting on a client to answer</strong></p>
      <ul>${w.questions_waiting.filter((q) => !q.due.overdue).map((q) => h`<li><a href="/staff/clients/${q.business_id}">${q.client}</a>:
        “${q.question}” — ${q.due.label}${q.sent ? raw('') : h` <span class="help">— not yet sent to the client’s portal, so it waits on us</span>`}</li>`)}</ul>`}
    <p class="help"><a href="/staff/tasks">All my tasks</a>. A task waiting with your team shows here until somebody takes it.</p>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * PAGES
 * ------------------------------------------------------------------ */

function tasksListPage(d: TaskPageDeps, actor: Actor, w: T.MyWork, all: readonly T.TaskView[] | null, msg: string | undefined): string {
  return page({
    title: 'Tasks', nav: d.nav(actor), wide: true,
    body: h`<h1>Tasks</h1>${filterBar(actor, TASK_FILTERS, all === null ? '/staff/tasks' : '/staff/tasks?view=all')}${saved(msg)}
      <div class="help">A job a colleague does. A question for the client is on the client's page.${why(h`Overdue is judged against
      today’s date in the UK. A task with no due date is not overdue, and not on time either.`)}</div>
      ${myTasksBlock(w)}
      ${all === null ? raw('') : h`<div class="pblock"><div class="pnum">Every open task</div>${taskRows(all, '/staff/tasks', 'No open task.')}</div>`}`,
  });
}

function taskDetailPage(d: TaskPageDeps, actor: Actor, p: T.TaskPage, msg: string | undefined): string {
  const choices = taskChoices(d.app.db, { activity: p.task.activity.key, priority: p.task.priority.key });
  const t = p.task;
  const back = `/staff/tasks/${t.id}`;
  return page({
    title: t.title, nav: d.nav(actor), wide: true,
    body: h`<h1>${t.title}</h1>${saved(msg)}
      <div class="pblock"><div class="pnum">The task</div><dl>
        <dt>What</dt><dd>${t.description ?? h`<span class="help">no description</span>`}</dd>
        <dt>Activity</dt><dd>${t.activity.label}</dd>
        <dt>About</dt><dd>${t.about.length === 0 ? h`<span class="help">nothing you may open</span>`
          : t.about.map((a) => (a.href === null ? h`${a.label}<br>` : h`<a href="${a.href}">${a.label}</a><br>`))}</dd>
        <dt>Owner</dt><dd>${t.owner.label}</dd>
        <dt>Due</dt><dd>${dueCell(t.due)}</dd>
        <dt>Priority</dt><dd>${t.priority.label}</dd>
        <dt>Repeats</dt><dd>${t.recurrence.label}${t.recurrence.key === null ? raw('') : h`<br><span class="help">completing it creates the next one, once</span>`}</dd>
        <dt>Status</dt><dd>${t.status.label}${t.closed === null ? raw('') : h`<br><span class="help">${t.closed}</span>`}</dd>
        <dt>Created</dt><dd>${t.created} — ${t.origin}</dd>
        ${t.is_next_action ? h`<dt>Next action</dt><dd><strong>This is its claim’s next action.</strong></dd>` : raw('')}
      </dl>
      ${t.may_progress ? h`<p>${quickStatus(t, back)}${t.status.key === 'IN_PROGRESS' ? h`
        <form method="post" action="/staff/tasks/${t.id}/status" class="inline"><input type="hidden" name="status" value="OPEN">
        <input type="hidden" name="back" value="${back}"><button class="linkish" type="submit">Put it back to open</button></form>` : raw('')}</p>` : raw('')}
      </div>
      ${!t.may_write || p.owner_choices === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Change the task</div>
        <form method="post" action="/staff/tasks/${t.id}">
          <label>Task <input name="title" value="${t.title}" required></label>
          <label>Description <textarea name="description">${t.description ?? ''}</textarea></label>
          <label>Activity <select name="activity_type">${vocabOptions(choices.activity, t.activity.key, null)}</select></label>
          <label>Owner <select name="owner_id">${ownerOptions(p.owner_choices, t.owner.id, 'nobody yet — it waits with a team')}</select></label>
          <label>Or the team it waits with <select name="owner_role">${vocabOptions(T.POOL_ROLES, null, 'no team')}</select></label>
          <label>Due <input name="due_on" type="date" value="${t.due_on ?? ''}"></label>
          <label>Priority <select name="priority">${vocabOptions(choices.priority, t.priority.key, 'not set')}</select></label>
          <label>Repeats on completion <select name="recurrence">${vocabOptions(T.RECURRENCES, t.recurrence.key, 'does not repeat')}</select></label>
          <button type="submit">Save</button></form>
        <form method="post" action="/staff/tasks/${t.id}/status">
          <input type="hidden" name="status" value="CANCELLED"><input type="hidden" name="back" value="${back}">
          <label>Cancel it — a task is never deleted, so say why <input name="reason" required></label>
          <button type="submit">Cancel the task</button></form></div>`}`,
  });
}

function breakersPage(d: TaskPageDeps, actor: Actor, b: T.Breakers): string {
  const who = (w: string): string => (w === 'US' ? 'us' : w === 'CLIENT' ? 'the client' : 'nobody');
  const rows = (list: readonly T.BreakerRow[]): Safe => h`<table>
    <thead><tr><th>Company</th><th>Stage</th><th>Claim owner</th><th>The next action</th><th>Waiting on</th><th>Reference</th></tr></thead>
    <tbody>${list.map((r) => h`<tr><td><a href="/staff/claims/${r.id}">${r.client}</a></td><td>${r.stage}</td>
      <td>${r.owner ?? h`<span class="help">nobody yet</span>`}</td>
      <td>${r.reading.breaks !== null ? h`<strong>${r.reading.sentence}</strong>` : r.reading.task === null ? raw('') : h`${r.reading.task.title} — ${dueCell(r.reading.task.due)}`}</td>
      <td>${r.waiting === undefined ? h`<span class="help">—</span>` : h`${who(r.waiting.who)} — ${r.waiting.why}`}</td><td>${claimRef(r.claim_ref)}</td></tr>`)}</tbody></table>`;
  return page({
    title: 'Claims with no next step', nav: d.nav(actor), wide: true,
    body: h`<h1>Tasks</h1>${filterBar(actor, TASK_FILTERS, '/staff/next-actions')}
      <div class="help">Every open claim needs one next step, with an owner and a date. ${b.checked} open claim${b.checked === 1 ? '' : 's'} checked.${
        why(h`A claim that has not closed or left the procedure has exactly one current next action. Where both sides are
        waiting, it counts as ours.`)}</div>
      <div class="pblock"><div class="pnum">No next step, or no owner or date</div>
        ${b.breaking.length === 0 ? h`<p class="help">None.</p>` : rows(b.breaking)}</div>
      <div class="pblock"><div class="pnum">Next step overdue</div>
        ${b.overdue.length === 0 ? h`<p class="help">None.</p>` : rows(b.overdue)}</div>`,
  });
}

function ruleForm(action: string, r: A.RuleView | null, choices: TaskChoices, requestTypes: Readonly<Record<string, string>>): Safe {
  return h`<form method="post" action="${action}">
    <label>Label <input name="label" value="${r?.label ?? ''}" required></label>
    <label>Trigger <select name="trigger_event">${vocabOptions(A.TRIGGERS, r?.trigger.key ?? null, null)}</select></label>
    <label>Stage, for “a claim enters a stage” <select name="trigger_stage">${stageOptions(r?.trigger.stage ?? null)}</select></label>
    <label>Activity, for “a task is completed” <select name="trigger_activity">${vocabOptions(choices.activity, r?.trigger.activity ?? null, 'any activity')}</select></label>
    <label>Effect <select name="effect">${vocabOptions(A.EFFECTS, r?.effect.key ?? null, null)}</select></label>
    <label>Document asked for, for “a document request” <select name="request_type">${vocabOptions(requestTypes, r?.request_type ?? null, 'not a document request')}</select></label>
    <label>Task <input name="task_title" value="${r?.task?.title ?? ''}"></label>
    <label>Task description <textarea name="task_description">${r?.task?.description ?? ''}</textarea></label>
    <label>Task activity <select name="task_activity_type">${vocabOptions(choices.activity, r?.task?.activity ?? 'TASK', null)}</select></label>
    <label>Priority <select name="task_priority">${vocabOptions(choices.priority, r?.task?.priority ?? null, 'not set')}</select></label>
    <label>Due, in days after the event <input name="due_in_days" type="number" min="0" max="365" value="${r?.task?.due_in_days ?? ''}"></label>
    <label>Goes to <select name="assign_to">${vocabOptions(A.ASSIGN, r?.assign.to ?? 'SUBJECT_OWNER', null)}</select></label>
    <label>Team <select name="assign_role">${vocabOptions(T.POOL_ROLES, r?.assign.role ?? null, 'no team')}</select></label>
    <label>Attached to <select name="attach_to">${vocabOptions(A.ATTACH, r?.attach_to.key ?? 'SUBJECT', null)}</select></label>
    <label>Active <select name="active"><option value="yes"${r === null || r.active ? raw(' selected') : raw('')}>yes</option>
      <option value="no"${r !== null && !r.active ? raw(' selected') : raw('')}>no — retired</option></select></label>
    <button type="submit">Save the rule</button></form>`;
}

/**
 * THE REFUSALS, EACH SAID ONCE — the CRM follow-on. Several effects share a reason: sending an email, a text message and a
 * webhook are all "No rule may send anywhere but the outbox.", and the page printed it three times. A reason already said —
 * the same words, or the start of a longer reason shown — is not said again. The store still refuses each effect by name.
 */
export function distinctReasons(list: readonly { readonly key: string; readonly why: string }[]): string[] {
  const out: string[] = [];
  for (const f of list) {
    if (out.some((x) => x.startsWith(f.why))) continue;
    const i = out.findIndex((x) => f.why.startsWith(x));
    if (i >= 0) out[i] = f.why; else out.push(f.why);
  }
  return out;
}

function rulesPageHtml(d: TaskPageDeps, actor: Actor, p: A.RulesPage, msg: string | undefined): string {
  const choices = taskChoices(d.app.db);
  return page({
    title: 'Automation', nav: d.nav(actor), wide: true,
    body: h`<h1>Automation rules</h1>${saved(msg)}
      <p class="help">A trigger and an effect. Every rule that matches an event writes a run — it ran, or it did not and why.
      A notice is written to the outbox and NOT SENT.</p>
      <div class="gate"><strong>What no rule may do.</strong> Each is refused by the store with its reason, not missing from
      a form:<ul>${distinctReasons(p.forbidden).map((why) => h`<li>${why}</li>`)}</ul></div>
      <div class="pblock"><div class="pnum">The rules</div><table>
        <thead><tr><th>Rule</th><th>When</th><th>Does</th><th>Goes to</th><th>Active</th><th>Where it came from</th></tr></thead>
        <tbody>${p.rules.map((r) => h`<tr><td>${r.label}${r.task === null || r.task.title === null ? raw('') : h`<br><span class="help">“${r.task.title}”, due in ${r.task.due_in_days ?? 0} days</span>`}</td>
          <td>${r.trigger.label}</td><td>${r.effect.label}</td><td>${r.assign.label}</td><td>${r.active ? 'yes' : 'retired'}</td>
          <td><span class="help">${r.source}</span></td></tr>
          ${p.may_write ? h`<tr><td colspan="6"><details><summary>Change “${r.label}”</summary>${ruleForm(`/staff/automation/${r.id}`, r, choices, p.request_types)}</details></td></tr>` : raw('')}`)}
        </tbody></table>
      ${p.may_write ? h`<details><summary>Add a rule</summary>${ruleForm('/staff/automation', null, choices, p.request_types)}</details>` : raw('')}</div>
      <div class="pblock"><div class="pnum">What the rules did</div>
        ${p.runs.length === 0 ? h`<p class="help">No rule has run yet.</p>` : h`<table>
          <thead><tr><th>When</th><th>Rule</th><th>Event</th><th>About</th><th>Result</th></tr></thead>
          <tbody>${p.runs.map((r) => h`<tr><td class="when">${r.at}</td><td>${r.rule}</td><td>${r.trigger}</td><td>${r.about}</td>
            <td>${r.ran ? h`ran${r.tasks_created > 0 ? h` — ${r.tasks_created} task${r.tasks_created === 1 ? '' : 's'}` : raw('')}${r.outbox ? ' — a notice queued, not sent' : ''}` : h`<strong>did not run</strong>`}${
              r.reason === null ? raw('') : h`<br><span class="help">${r.reason}</span>`}</td></tr>`)}</tbody></table>`}</div>`,
  });
}

function templatesPageHtml(d: TaskPageDeps, actor: Actor, p: M.TemplatesPage, msg: string | undefined): string {
  const fields = Object.keys(p.merge_fields).map((k) => `{{${k}}}`).join(' ');
  const form = (action: string, t: M.TemplateView | null): Safe => h`<form method="post" action="${action}">
    <label>Label <input name="label" value="${t?.label ?? ''}" required></label>
    <label>Subject <input name="subject" value="${t?.subject ?? ''}" required></label>
    <label>Body <textarea name="body" rows="8" required>${t?.body ?? ''}</textarea></label>
    <label>Active <select name="active"><option value="yes"${t === null || t.active ? raw(' selected') : raw('')}>yes</option>
      <option value="no"${t !== null && !t.active ? raw(' selected') : raw('')}>no — retired</option></select></label>
    <button type="submit">Save the template</button></form>`;
  return page({
    title: 'Email templates', nav: d.nav(actor), wide: true,
    body: h`<h1>Email templates</h1>${saved(msg)}
      <p class="help">The merge fields are ${fields} and no others. A merged value is escaped; a value nobody recorded shows as a
      gap in square brackets. A merged email is written to the outbox and NOT SENT.</p>
      <div class="gate"><strong>Never bank details, never an invoice.</strong> A template carrying either is refused — the invoice
      email waits on the invoice-fraud procedure.</div>
      ${p.templates.map((t) => h`<div class="pblock"><div class="pnum">${t.label}${t.active ? '' : ' — retired'}</div>
        <p><strong>${t.subject}</strong></p><pre>${t.body}</pre><p class="help">changed ${t.updated}</p>
        ${p.may_write ? h`<details><summary>Change it</summary>${form(`/staff/templates/${t.id}`, t)}</details>` : raw('')}</div>`)}
      ${p.may_write ? h`<div class="pblock"><div class="pnum">Add a template</div>${form('/staff/templates', null)}</div>` : raw('')}`,
  });
}
