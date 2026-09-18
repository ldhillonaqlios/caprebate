/**
 * THE ONE CLIENT PAGE — Phase 134, 18 September 2026. "Back office and portal clean-up, 1 of 11."
 *
 * Lakhbir, after using the test site: "There is too much of an emphasis on the CR number - the main focus point should
 * be the company name", and "think about one business with multiple claims - all communication needs to be under one
 * client's portal and dashboard".
 *
 * UNTIL TODAY ONE COMPANY HAD TWO PAGES ON THE SAME ID: the engaged-client page at /staff/clients/:id (its questions,
 * research, missing facts and notes) and the organisation page at /staff/organisations/:id (its contacts, properties,
 * documents, tasks and timeline). This file draws ONE page at /staff/clients/:id with everything both carried:
 *
 *   the heading     the trading name, and the legal name underneath in small text
 *   Claims          one tile per claim — property and town, stage, next action, the reference as a small grey label —
 *                   each opening the claim INSIDE this page, at /staff/clients/:id/claims/:claim, under a breadcrumb
 *   Timeline        ONE timeline for the company, every claim's events in it, each saying which claim it is about; the
 *                   internal notes beside it, each note optionally tagged with a claim
 *   the rest        contacts, properties, documents, the details; and for a login that works the research, the questions
 *                   put to the client, what is still missing, their answers and the research
 *
 * /staff/organisations/:id is kept alive and redirects here (src/web/crm-pages.ts), after asking exactly what it asked.
 *
 * NOTHING HERE DECIDES WHO SEES WHAT. Each half is built only where its own gate says yes — the organisation's record by
 * `organisation.read` (src/web/crm.ts), the research half by the engaged-clients section's `research.read`
 * (src/web/engaged.ts) — and each view is authorised on the object inside its own store. A login that passes neither is
 * refused by the organisation's own read, as /staff/organisations/:id refused it. Internal notes come only through the
 * timeline's `internal_note.read`, so a client, a surveyor and the view-only login never receive one.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Actor } from '../authz.ts';
import { can } from '../authz.ts';
import { h, raw, page, HTML_HEADERS } from './html.ts';
import { card, claimName, highlights, recordLayout, recordTabs, savedMessage, sidePanel, type QuickAction, type RecordTab } from './components.ts';
import * as C from './crm.ts';
import * as E from './engaged.ts';
import * as R from './research.ts';
import { assertClientsSection } from './engaged.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { opens } from './navigation.ts';
import { timelineIfPermitted } from './timeline.ts';
import { mayCreateTask, taskOwnerChoices } from './tasks.ts';
import { notesBlock, timelineBlock } from './tasks-pages.ts';
import { claimTilesFor, organisationSections, renderClaim, type CrmPageDeps } from './crm-pages.ts';
import { businessPageHtml, DONE_WORDS, panel1, panel2, panel3, panel4 } from './engaged-pages.ts';

export type WebResult = 'handled' | 'not-mine';

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

export async function handleClientPage(
  d: CrmPageDeps, _req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
): Promise<WebResult> {
  if (method !== 'GET') return 'not-mine';
  const path = url.pathname;
  const db = d.app.db;

  /* ---- a claim, inside its company's page ---- */
  const inside = /^\/staff\/clients\/([A-Za-z0-9-]+)\/claims\/([A-Za-z0-9-]+)$/.exec(path);
  if (inside) {
    const v = C.claimView(db, actor, inside[2] ?? '', { now: d.app.now() });
    // A claim addressed under a company that is not its own is not found, exactly as a claim that does not exist.
    if (v.client.business_id !== (inside[1] ?? '')) throw new NotFoundAsRefusal();
    html(res, 200, renderClaim(d, actor, v, url.searchParams.get('done') ?? undefined));
    return 'handled';
  }

  /* ---- the company ---- */
  const one = /^\/staff\/clients\/([A-Za-z0-9-]+)$/.exec(path);
  if (!one) return 'not-mine';
  const id = one[1] ?? '';
  const mayOrg = opens(actor, C.assertOrganisationSection) && can(actor, 'organisation.read', { type: 'business', id });
  const mayWork = opens(actor, assertClientsSection);
  const done = url.searchParams.get('done') ?? undefined;
  const note = url.searchParams.get('note') ?? undefined;

  if (!mayOrg && mayWork) {
    // No login is on the research half and off the organisation today; if one ever is, it gets the research half alone.
    html(res, 200, businessPageHtml(d, actor, E.businessPage(db, actor, id), R.sourcesFor(db, actor, id), done, note));
    return 'handled';
  }
  // A login on neither is refused by the organisation's own read, as /staff/organisations/:id refused it.
  const org = C.organisationView(db, actor, id);
  const work = mayWork ? { page: E.businessPage(db, actor, id), sources: R.sourcesFor(db, actor, id) } : null;
  html(res, 200, clientPage(d, actor, org, work, done, note));
  return 'handled';
}

/** The words shown after a change. Each is said once, at the top of the page. */
const SAVED: Readonly<Record<string, string>> = Object.freeze({
  saved: 'Saved.', contact: 'The contact is saved.', task: 'The task is saved.',
});

function clientPage(
  d: CrmPageDeps, actor: Actor, org: C.OrganisationView,
  work: { page: E.BusinessPage; sources: R.SourcesPanel } | null,
  done: string | undefined, note: string | undefined,
): string {
  const db = d.app.db;
  const owners = mayCreateTask(actor) ? taskOwnerChoices(db) : null;
  const mayNote = can(actor, 'internal_note.write', { type: 'internal_note', id: org.id, business_id: org.id });
  const s = organisationSections(d, actor, org, { owners, may_note: mayNote });
  const timeline = timelineIfPermitted(db, actor, { kind: 'organisation', id: org.id });
  const claimChoices = org.claims.map((c) => ({ id: c.id, name: `${claimName(org.trading_name, c.property)} (${c.claim_ref})` }));
  const p = work?.page ?? null;
  const waiting = p === null ? null : p.row.waiting_on === 'US' ? 'Us' : p.row.waiting_on === 'CLIENT' ? 'The client' : 'Nobody';

  const tabs: RecordTab[] = [
    { id: 'activity', label: 'Timeline', body: h`${s.tasks}
      ${timelineBlock(timeline, `Everything with ${org.trading_name}`)}
      <div id="company-notes">${notesBlock(timeline, mayNote ? `/staff/clients/${org.id}/notes` : null, claimChoices)}</div>` },
    ...(p === null || work === null ? [] : [
      { id: 'tasks', label: 'Questions to the client', count: p.tasks.length, body: panel4(p) },
      { id: 'missing', label: 'Still missing', count: p.missing.length, body: panel3(p, claimChoices) },
      { id: 'answers', label: 'Their answers', body: panel1(p) },
      { id: 'sources', label: 'Research', count: work.sources.outstanding, body: panel2(p, work.sources) },
    ]),
    { id: 'contacts', label: 'Contacts', ...(s.contact_count === undefined ? {} : { count: s.contact_count }), body: s.contacts },
    { id: 'properties', label: 'Properties', count: org.properties.length, body: s.properties },
    { id: 'documents', label: 'Documents', body: s.documents },
    { id: 'details', label: 'Details', body: s.details },
  ];
  const quick: QuickAction[] = [
    ...s.quick,
    ...(work !== null && work.sources.rate.allowed ? [{ href: '#sources', label: 'Run the research' }] : []),
    ...(p !== null && p.missing.length > 0 ? [{ href: '#missing', label: 'Ask the client for something' }] : []),
  ];
  const legal = org.legal_name.value !== null && org.legal_name.value !== org.trading_name ? org.legal_name.display : null;

  return page({
    title: org.trading_name, nav: d.nav(actor), wide: true,
    body: h`
      ${done !== undefined && DONE_WORDS[done] !== undefined ? h`<div class="gate">${DONE_WORDS[done]}</div>`
        : done !== undefined && SAVED[done] !== undefined ? savedMessage(SAVED[done]) : raw('')}
      ${note === 'saved' ? savedMessage('Note saved. The client cannot see it.') : raw('')}
      ${highlights('Client', org.trading_name, [
        { label: 'Claims', value: String(org.claims.length) },
        { label: 'Status', value: org.client_status.label },
        { label: 'Owner', value: org.owner?.name ?? 'nobody yet' },
        waiting === null ? null : { label: 'Waiting on', value: waiting },
        p === null ? null : { label: 'Engagement letter', value: p.row.letter_label },
      ], raw(''), legal === null ? raw('') : h`${legal}`)}
      ${card('Claims', claimTilesFor(org.claims, 'No claim yet. Open one from a property.', org.trading_name), { count: org.claims.length, id: 'claims' })}
      ${recordLayout(recordTabs(tabs), sidePanel(null, quick, p === null ? raw('') : card('Waiting on', h`
        <p><strong>${waiting ?? ''}</strong> — ${p.row.waiting_why}</p>`)))}
      <p><a href="${work === null ? '/staff/organisations' : '/staff/clients'}">Back to the list</a></p>`,
  });
}
