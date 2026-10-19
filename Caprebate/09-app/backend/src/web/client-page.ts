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
 *   Timeline        ONE timeline for the company, every claim's events in it, each saying which claim it is about
 *   Chat            PHASE 142: two tabs — "Team only", which is the internal notes as a conversation, each message
 *                   optionally tagged with a claim, and "With the client", the thread the client reads in the portal
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
import { mayReadQueue, readRepliesIfDue } from './inbound-email.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { breadcrumb, claimName, moreDetail, recordLayout, savedMessage, section, sidePanel, statusFromNeeds, type Need, type QuickAction, type SectionContext, type SectionSpec } from './components.ts';
import { sectionPrefs } from './sections.ts';
import * as C from './crm.ts';
import * as E from './engaged.ts';
import * as R from './research.ts';
import { assertClientsSection } from './engaged.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { opens } from './navigation.ts';
import { timelineIfPermitted } from './timeline.ts';
import { mayCreateTask, taskOwnerChoices } from './tasks.ts';
import { timelineBlock } from './tasks-pages.ts';
import { communicationPanel } from './communication.ts';
import * as M from './messages.ts';
import { organisationSections, renderClaim, type CrmPageDeps } from './crm-pages.ts';
import { askButton, businessPageHtml, DONE_WORDS, panel1, panel2, panel3, panel4 } from './engaged-pages.ts';
import { checksPanelIfPermitted } from './approvals.ts';
import { checksBlock, checksSummary, STEP_ANCHOR } from './approvals-pages.ts';
import { clientFolder } from './documents.ts';
import { letterState, letterSteps } from './engagement-send.ts';
import { filesButton, folderTiles } from './client-files-pages.ts';
import { emailButton } from './free-email-pages.ts';
import { identityChecks, identityPanel } from './identity-checks.ts';
import { IDENTITY_PROVIDER_NAME } from '../connectors/identity-check.ts';
import { complianceObj } from './compliance.ts';
import { claimBoxes, headerActions, lookupsCard, nextStepCard, presentTabs, progressBar, setClientMenu, tabbed, TAB_OF_SECTION, type TabKey } from './client-layout.ts';
import { piecesPage } from './upload-pieces.ts';

export type WebResult = 'handled' | 'not-mine';

function html(res: ServerResponse, status: number, body: string): void {
  // PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.
  const pp = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, pp.headers);
  res.end(pp.body);
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
    // UI tidy phase 7: the client's own menu, with this claim marked — for a login that may read the company.
    if (opens(actor, C.assertOrganisationSection) && can(actor, 'organisation.read', { type: 'business', id: v.client.business_id })) {
      const org = C.organisationView(db, actor, v.client.business_id);
      setClientMenu(org.id, org.trading_name, org.claims, [], v.id, d.app.now());
    }
    html(res, 200, renderClaim(d, actor, v, url.searchParams.get('done') ?? undefined, url.searchParams.get('step') ?? undefined));
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
  // 30 Sep 2026: "Everything" reads new email replies first (at most every two minutes), for those who may read them.
  // 1 Oct 2026: every visit to a client's page does, so a reply is there (and its red dot) wherever staff look.
  if (mayReadQueue(actor)) await readRepliesIfDue(d.app);
  html(res, 200, clientPage(d, actor, org, work, done, note, url.searchParams.get('step') ?? undefined, url.searchParams.get('chat'), {
    via: url.searchParams.get('via'), thread: url.searchParams.get('thread'), contact: url.searchParams.get('contact'),
    show: url.searchParams.get('show'), search: url.searchParams.get('q'),
  }));
  return 'handled';
}

/** UI tidy phase 7: the client's status in its colour, as the Clients list draws it. */
function clientStatusBadge(key: string | null, label: string): Safe {
  const tone = key === 'ACTIVE' ? ' b-ok' : key === 'PROSPECT' ? ' b-info' : key === 'DO_NOT_CONTACT' ? ' b-late' : '';
  return h`<span class="badge${tone}">${label}</span>`;
}

/** The words shown after a change. Each is said once, at the top of the page. */
const SAVED: Readonly<Record<string, string>> = Object.freeze({
  saved: 'Saved.', contact: 'The contact is saved.', task: 'The task is saved.',
  'identity-sent': 'The identity check was sent. Give the person their link, in Identity check below.',
  // PHASE 157c (F21)
  'letter-sent': 'The engagement letter is sent. The client is emailed a link to read and sign it in their portal.',
  'letter-resent': 'The link to the engagement letter is sent again.',
  'letter-signers': 'Who must sign the letter is saved.',
});

/**
 * PHASE 138 — WHICH SECTION A CHANGE WAS MADE IN. After a save the page is drawn again with `?done=`; the section the
 * change was made in opens, whatever the person keeps, so they see what they just did.
 */
const OPEN_AFTER: Readonly<Record<string, string>> = Object.freeze({
  saved: 'details', contact: 'contacts', task: 'activity', research: 'sources', retry: 'sources',
  // PHASE 157c (the Friary House run, F11): the "Run the research" links open the Lookups section; "#sources" alone
  // pointed into a closed tab and showed nothing.
  lookups: 'sources',
  'letter-sent': 'letter', 'letter-resent': 'letter', 'letter-signers': 'letter', letter: 'letter',
  sent: 'questions', answered: 'questions', withdrawn: 'questions',
  checked: 'checks', unchecked: 'checks', told: 'checks', takenback: 'checks',
  'identity-sent': 'identity',
});

/** Where each fact comes from, once each, in the order first met. */
function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/**
 * THE ONE CLIENT PAGE, PHASE 138: THE COMPANY'S SECTIONS, COLOURED, EACH OPENING AND CLOSING. What every section shows is
 * the bloat cut in the Developer Spec (B5/B6). Each section is built only from a view this page already asked for, and
 * only where that view exists — nothing here widens what a login may read.
 */
function clientPage(
  d: CrmPageDeps, actor: Actor, org: C.OrganisationView,
  work: { page: E.BusinessPage; sources: R.SourcesPanel } | null,
  done: string | undefined, note: string | undefined, step?: string, chat: string | null = null,
  comm: { via: string | null; thread: string | null; contact: string | null; show: string | null; search: string | null } = { via: null, thread: null, contact: null, show: null, search: null },
): string {
  const db = d.app.db;
  const owners = mayCreateTask(actor) ? taskOwnerChoices(db) : null;
  const mayNote = can(actor, 'internal_note.write', { type: 'internal_note', id: org.id, business_id: org.id });
  const s = organisationSections(d, actor, org, { owners, may_note: mayNote });
  const timeline = timelineIfPermitted(db, actor, { kind: 'organisation', id: org.id });
  const claimChoices = org.claims.map((c) => ({ id: c.id, name: `${claimName(org.trading_name, c.property)} (${c.claim_ref})` }));
  const p = work?.page ?? null;
  const waiting = p === null ? null : p.row.waiting_on === 'US' ? 'Us' : p.row.waiting_on === 'CLIENT' ? 'The client' : 'Nobody';
  const ctx: SectionContext = { prefs: sectionPrefs(db, actor), back: `/staff/clients/${org.id}` };
  // PHASE 141: THE EMAIL BUTTON, beside Files, for a login that may write to the company — Admin and Sales.
  const mayEmail = can(actor, 'email.queue', { type: 'email', id: org.id, business_id: org.id });
  // PHASE 142: a note saved, a message sent, or a chat tab pressed opens the Chat section.
  const openNow = note === 'saved' || done === 'message' || done === 'saved-file' || chat !== null ? 'chat'
    : done === undefined ? undefined : done.startsWith('told') ? 'checks' : OPEN_AFTER[done];

  /* WE NEED: every missing fact, in the section it belongs to, with the one-press ask where this login may ask. */
  const needsFor = (where: E.MissingFact['section']): Need[] => (p === null ? [] : p.missing.filter((m) => m.section === where).map((m) => ({
    label: m.question,
    ...(m.has_task ? { asked: true } : p.may_write ? { ask: askButton(org.id, m) } : {}),
  })));
  const fromFor = (where: E.MissingFact['section']): string[] => (p === null ? [] : p.missing.filter((m) => m.section === where).map((m) => m.from));

  const sections: SectionSpec[] = [];
  // UI TIDY PHASE 7: the claims are boxes at the top of the page (claimBoxes), no longer a section in a tab.

  /* PHASE 139: WHERE EACH FACT CAME FROM, THE APPROVE BOX, AND TELLING THE CLIENT. Only for a login that checks facts. */
  const checks = checksPanelIfPermitted(db, actor, org.id, d.app.now().slice(0, 10));
  if (checks !== null) {
    const all = [checks.company, ...checks.claims.flatMap((c) => c.steps)];
    const sum = checksSummary(all);
    sections.push({
      key: 'client.checks', id: 'checks', kind: 'facts', heading: 'Check and tell the client',
      ...(sum.count > 0 ? { count: sum.count } : {}),
      status: sum.status, working: sum.working, need: [],
      from: unique([...all.flatMap((s) => s.facts.map((f) => f.chip)), ...checks.unmatched.map((f) => f.chip)]),
      body: checksBlock(checks, step !== undefined && STEP_ANCHOR.test(step) ? step : undefined),
    });
  }

  if (p !== null && work !== null) {
    const need = needsFor('facts');
    const packs = p.row.ready_for_accountant && p.row.ready_for_surveyor ? 'Both packs are ready.'
      : `Getting ${!p.row.ready_for_accountant && !p.row.ready_for_surveyor ? 'the accountant pack and the surveyor pack'
        : !p.row.ready_for_accountant ? 'the accountant pack' : 'the surveyor pack'} ready.`;
    sections.push({
      key: 'client.questions', id: 'questions', kind: 'facts', heading: 'Questions for the client', count: p.tasks.length,
      status: statusFromNeeds(need, p.tasks.length > 0 || p.qa.assessment_id !== null),
      working: `${packs} ${p.row.waiting_why.charAt(0).toUpperCase()}${p.row.waiting_why.slice(1)}.`,
      need, from: unique(['the client', ...fromFor('facts')]),
      body: h`<div id="tasks">${panel4(p)}</div>
        <div id="missing">${moreDetail(panel3(p, claimChoices), `Everything still missing (${p.missing.length}), and answer one from a call`)}</div>`,
    });
  }

  /* PHASE 142: CHAT — "Team only" (the company's notes, as a conversation) and "With the client" (the portal's Messages),
     two tabs, each with its unread number. Drawn only for a login that may read one of the two. */
  /* 1 OCT 2026: CHAT BECOMES COMMUNICATION (src/web/communication.ts) — one form to write any way, beside the whole
     conversation. The routes that wrote before still do, and say what they did here. */
  const oldDone: Readonly<Record<string, string>> = { message: 'sent-portal', whatsapp: 'sent-whatsapp', 'whatsapp-opening': 'sent-opening' };
  const chatNow = communicationPanel({ app: d.app }, actor, org.id, {
    ...comm, opened: chat !== null,
    done: note === 'saved' ? 'sent-team' : done === undefined ? null : (oldDone[done] ?? done),
  });
  // 1 Oct 2026: the red dot on Chat — counted after the chat was drawn, so what this visit opened is already read.
  const fresh = M.newFromClient(db, actor, org.id);
  if (chatNow !== null) {
    const waitingOnUs = M.clientMessagesWaiting(db, actor, d.app.now()).find((w) => w.business_id === org.id);
    sections.push({
      key: 'client.chat', id: 'chat', kind: 'messages', heading: 'Communication',
      ...(chatNow.unread > 0 ? { count: chatNow.unread } : {}),
      // "Waiting" on a section means waiting for the CLIENT; a client waiting for US is work, so it reads "Working on it".
      status: waitingOnUs !== undefined || chatNow.unread > 0 || chatNow.started ? 'WORKING' : 'NOT_STARTED',
      working: waitingOnUs !== undefined ? 'The client is waiting for a reply.' : chatNow.unread > 0 ? 'There are new messages to read.' : 'Write to them any way, or to your team; log a call; start or book a Zoom call.',
      need: [], from: ['your team', 'the client'],
      // The notes' old anchor is kept, so every link to #company-notes still lands on the team's chat.
      body: h`<div id="company-notes">${chatNow.body}</div>`,
    });
  }

  const openQuestions = p?.tasks.filter((t) => t.state === 'OPEN').length ?? 0;
  sections.push({
    key: 'client.activity', id: 'activity', kind: 'messages', heading: 'Activity',
    status: openQuestions > 0 ? 'WAITING' : (timeline?.events.length ?? 0) > 0 ? 'WORKING' : 'NOT_STARTED',
    working: openQuestions > 0 ? `${openQuestions} question${openQuestions === 1 ? '' : 's'} waiting for the client’s answer.`
      : 'Keeping a record of every call, email and message.',
    need: [], from: ['you and your team', 'the client'],
    body: h`${s.tasks}
      ${timelineBlock(timeline, `Everything with ${org.trading_name}`)}`,
  });

  const companyNeed = needsFor('company');
  sections.push({
    key: 'client.company', id: 'details', kind: 'company', heading: 'The company',
    status: statusFromNeeds(companyNeed, true),
    working: companyNeed.length > 0 ? 'Checking the company’s details.' : 'Nothing right now — the company’s details are in.',
    need: companyNeed, from: unique(['Companies House', 'the client', ...fromFor('company')]), body: s.details,
  });

  /* PHASE 151e (line 6): a client with no contact we can reach is flagged here until it has one. "We must get contact
     details, it is a non negotiable" (Lakhbir, 28 September 2026). */
  const reachable = C.reachableContacts(db, org.id);
  const contactNeed: Need[] = reachable > 0 ? [] : [{ label: 'An email address or a telephone number for someone at this client' }];
  sections.push({
    key: 'client.contacts', id: 'contacts', kind: 'company', heading: 'Contacts',
    ...(s.contact_count === undefined ? {} : { count: s.contact_count }),
    status: statusFromNeeds(contactNeed, (s.contact_count ?? 0) > 0),
    working: reachable > 0 ? 'Nothing right now.'
      : (s.contact_count ?? 0) > 0 ? 'Nobody here has an email address or a telephone number yet. Add one.' : 'Nobody is recorded yet. Add a contact.',
    need: contactNeed, from: ['the client'],
    body: reachable > 0 ? s.contacts
      : h`<p class="err" id="no-way-to-reach"><strong>Required.</strong> ${C.NO_WAY_TO_REACH_WORDS}</p>${s.contacts}`,
  });

  /* PHASE 151b: THE ONLINE IDENTITY CHECK, for a login that keeps the registers (compliance.read; sending is
     compliance.write). Sent from here or from an open due diligence check, and switched off with IDENTITY_CHECK. */
  if (can(actor, 'compliance.read', complianceObj())) {
    const idLines = identityChecks(db, { business_id: org.id });
    const passed = idLines.some((l) => l.outcome === 'PASS');
    sections.push({
      key: 'client.identity', id: 'identity', kind: 'company', heading: 'Identity check', count: idLines.length,
      status: passed ? 'DONE' : idLines.length > 0 ? 'WAITING' : 'NOT_STARTED',
      working: passed ? 'Nothing right now.' : idLines.length > 0 ? 'Waiting for the result.' : 'No identity check has been sent.',
      need: [], from: [IDENTITY_PROVIDER_NAME],
      body: identityPanel(d.app, actor, { business_id: org.id },
        db.all<{ id: string; full_name: string }>('SELECT id, full_name FROM contacts WHERE business_id = ? ORDER BY full_name', [org.id])),
    });
  }

  const propertyNeed = needsFor('property');
  sections.push({
    key: 'client.properties', id: 'properties', kind: 'property', heading: 'Properties', count: org.properties.length,
    status: statusFromNeeds(propertyNeed, org.properties.length > 0),
    working: propertyNeed.length > 0 ? 'Finding the facts about the building.'
      : org.properties.length === 0 ? 'No property yet. Add one.' : 'Nothing right now.',
    need: propertyNeed,
    from: unique(['the EPC register', 'HM Land Registry', 'the care regulator', 'the client', ...fromFor('property')]),
    body: s.properties,
  });

  if (work !== null) {
    const src = work.sources;
    const looked = src.sources.some((x) => x.state === 'FIRED');
    sections.push({
      key: 'client.sources', id: 'sources', kind: 'facts', heading: 'Lookups', count: src.outstanding,
      status: src.outstanding === 0 ? 'DONE' : looked ? 'WORKING' : 'NOT_STARTED',
      working: src.outstanding === 0 ? 'Every lookup is done.'
        : `${src.outstanding} lookup${src.outstanding === 1 ? '' : 's'} still to do.${src.rate.allowed ? '' : ' They cannot be run right now.'}`,
      need: [], from: unique(src.sources.map((x) => x.publisher)), body: panel2(work.page, src),
    });
  }

  if (p !== null) {
    const answered = p.qa.assessment_id !== null;
    sections.push({
      key: 'client.answers', id: 'answers', kind: 'facts', heading: 'What the client told us',
      status: answered ? 'DONE' : 'WAITING',
      working: answered ? 'Nothing — their answers are in.' : 'Waiting for them to fill in the online questions.',
      need: [], from: ['the client’s online questions'], body: panel1(p),
    });
  }

  /* PHASE 157c (the Friary House run, F21): THE ENGAGEMENT LETTER — its steps, the button that sends it, and the signed
     copy once there is one. Only for a login that may read the letter (Admin, Sales). */
  if (can(actor, 'engagement.read', { type: 'engagement', id: org.id, business_id: org.id })) {
    const ls = letterState(db, org.id);
    // PHASE 157d: the client's logins, for "Who must sign".
    const clientLogins = db.all<{ id: string; name: string; email: string }>("SELECT id, display_name AS name, email FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL ORDER BY created_at ASC, id ASC", [org.id]);
    const maySend = can(actor, 'engagement.send', { type: 'engagement', id: org.id, business_id: org.id }) && ls.state !== 'SIGNED';
    sections.push({
      key: 'client.letter', id: 'letter', kind: 'documents', heading: 'Engagement letter',
      status: ls.state === 'SIGNED' ? 'DONE' : ls.state === 'NONE' || ls.state === 'NOT_SENT' ? 'NOT_STARTED' : 'WAITING',
      working: ls.state === 'SIGNED' ? 'Nothing: the letter is signed.' : ls.state === 'NONE' || ls.state === 'NOT_SENT' ? 'Not sent yet.' : 'Waiting for the client to sign it.',
      need: ls.state === 'SIGNED' ? [] : [{ label: ls.state === 'NONE' || ls.state === 'NOT_SENT' ? 'Send the engagement letter' : 'The client to sign the letter' }],
      from: ['Cap Rebate', 'the client'],
      body: h`<ul class="plain">${letterSteps(ls).map((w) => h`<li>${w}</li>`)}</ul>
        ${ls.copy ? h`<p><a class="btn" href="/staff/clients/${org.id}/engagement/signed.pdf">Download the signed copy</a> <span class="help">The letter, the signature page and the certificate of completion, as one PDF.</span></p>` : raw('')}
        ${!maySend ? raw('') : ls.logins === 0 ? h`<p class="help">The client has no login yet, so the letter cannot be sent. They can create one from the thank-you page after the assessment.</p>`
          : h`<form method="post" action="/staff/clients/${org.id}/engagement/send"><button class="cta" type="submit">${ls.state === 'NONE' || ls.state === 'NOT_SENT' ? 'Prepare and send the engagement letter' : 'Send the link again'}</button>
            <span class="help">The client is emailed a link to read and sign it in their portal.</span></form>`}
        ${!maySend || ls.prepared_at === null || ls.signed_by.length > 0 || clientLogins.length < 2 ? raw('') : h`
          <form method="post" action="/staff/clients/${org.id}/engagement/signers" class="signers">
            <fieldset><legend>Who must sign</legend>
            <p class="help">Tick the one or two people who must sign, for example a partnership's two partners. With two ticked, the letter is signed only when both have signed. With none ticked, any one of them may sign.</p>
            ${clientLogins.map((u) => h`<label class="ck"><input type="checkbox" name="signer" value="${u.id}"${ls.named.some((n) => n.user_id === u.id) ? raw(' checked') : raw('')}> ${u.name} <span class="help">${u.email}</span></label>`)}
            <button class="btn-quiet" type="submit">Save who must sign</button></fieldset></form>`}`,
    });
  }

  /* PHASE 140: THE COMPANY'S FILES, AS FOLDERS. The same folders the Files page draws, each a tile that opens it there. */
  const folder = clientFolder({ db, now: d.app.now }, actor, org);
  const waitingFiles = folder.asked?.length ?? 0;
  sections.push({
    key: 'client.documents', id: 'documents', kind: 'documents', heading: 'Files',
    count: folder.files.length,
    status: waitingFiles > 0 ? 'WAITING' : folder.files.length > 0 ? 'DONE' : 'NOT_STARTED',
    working: waitingFiles > 0 ? `Waiting for ${waitingFiles} ${waitingFiles === 1 ? 'file' : 'files'} from the client.`
      : folder.files.length > 0 ? 'Nothing right now.' : 'No file yet.',
    need: [], from: ['the client', 'Cap Rebate'], body: folderTiles(folder),
  });

  // 30 Sep 2026: "Email the client" became Chat, in the header — every message with them, and a box to write.
  const quick: QuickAction[] = [
    ...s.quick,
    ...(mayEmail ? [{ href: `/staff/clients/${org.id}/email`, label: 'Write an email' }] : []),
    ...(work !== null && work.sources.rate.allowed ? [{ href: `/staff/clients/${org.id}?done=lookups#sources`, label: 'Run the research' }] : []),
    ...(p !== null && p.missing.length > 0 ? [{ href: '#questions', label: 'Ask the client for something' }] : []),
  ];
  const legal = org.legal_name.value !== null && org.legal_name.value !== org.trading_name ? org.legal_name.display : null;
  // Which tab shows first: where a change was just made, a step asked for, else the conversation.
  // UI tidy phase 8: a plain visit opens no part — the overview of every part shows instead (tabbed, partsList).
  const defaultTab: TabKey | null = openNow !== undefined ? (TAB_OF_SECTION[openNow] ?? 'chat') : step !== undefined ? 'checks' : null;

  // UI tidy phase 7: the left-hand menu opens out to this client — its claims, then the page's parts.
  setClientMenu(org.id, org.trading_name, org.claims, presentTabs(sections), null, d.app.now());
  return page({
    title: org.trading_name, nav: d.nav(actor), wide: true,
    body: h`
      ${done !== undefined && DONE_WORDS[done] !== undefined ? savedMessage(DONE_WORDS[done])
        : done !== undefined && SAVED[done] !== undefined ? savedMessage(SAVED[done]) : raw('')}
      ${breadcrumb([{ label: 'Clients', href: '/staff/clients' }, { label: org.trading_name }])}
      <header class="clienthead"><div class="clienthead-main"><h1>${org.trading_name}</h1>${legal === null ? raw('') : h`<p class="subhead">${legal}</p>`}
        <p class="pills">${clientStatusBadge(org.client_status.value, org.client_status.label)}<span class="badge">Owner: ${org.owner?.name ?? 'nobody yet'}</span>${
          waiting === null ? raw('') : h`<span class="badge${waiting === 'Us' ? ' b-warn' : ''}">Waiting on ${waiting === 'Us' ? 'us' : waiting === 'The client' ? 'the client' : 'nobody'}</span>`}${
          p === null ? raw('') : h`<span class="badge">Engagement letter: ${p.row.letter_label}</span>`}</p></div>
        ${headerActions(org.id, folder.files.length, chatNow !== null, quick, fresh)}</header>
      ${progressBar(db, org.id)}
      ${claimBoxes(org.trading_name, org.claims, d.app.now())}
      <div class="ctop">${nextStepCard(db, checks, d.app.now().slice(0, 10))}${lookupsCard(work?.sources ?? null, d.app.now())}</div>
      ${tabbed(sections.map((x) => (openNow === x.id ? { ...x, open_now: true } : x)), ctx, defaultTab, fresh)}
      <p><a href="/staff/clients">Back to the list</a></p>`,
  });
}
