/**
 * THE PORTAL'S ADDRESSES: signing the engagement letter by its emailed link, the accountant's confirmation link, and
 * the client portal itself (the agreement to the current terms first, then its pages). The router shell
 * (src/app/router.ts) asks each function at the point where its addresses have always been matched, so the order in
 * which every address is tried is unchanged; the portal's pages are asked from its entry, as before.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NotAuthorised, NotFoundAsRefusal, WELCOME_JOBS, can, clientHelp, clientIp, clockOf, dismissWelcome, form, html, inContext, nameSwitches, nav, piecesOf, readBody, redirect, setSubMenu, simple, welcomeShown, type Actor, type Db, type WebDeps, type WebRequest, type WebResult } from '../../core/index.ts';
import { HTML_HEADERS, READ_AND_DELETED, badge, breadcrumb, card, claimRef, clientStageBar, formatShownRange, h, localDate, localStamp, localWhen, page, propertyIn, raw, savedMessage, ukDate, ukDatesIn, welcomeCard, why, zoneNotice, type Safe } from '../../shared/index.ts';
import { getResearchSourcesCountByBusinessIdState2 } from '../../integrations/index.ts';
import { ENGAGEMENT_SIGNING, SIGN_WORDS, claimRoutes, clientDeliverables, clientSteps, clientStepsCard, getClaimsPropertyIdByIdBusinessId, getEngagementsStateSignedAtById, letterFacts, letterOptions, letterState, letterSteps, loadLetter, readLines, receivableTypes, shownLetter, signByLink, signEngagement, signLinkFor, signedCopy, signingMissing, startDocumentUpload, updateEngagementsLetterStateViewedAtByIdLetterState, type ClientDeliverable, type ClientStep, type EngagementSigning, type LetterFacts, type RequestView } from '../claims/index.ts';
import { portalReport, portalReportCard } from './report-portal-pages.ts';
import { activeMeeting, booksATime, publicSlots, reconcileVideoMeeting } from '../clients/index.ts';
import { clientMessage, clientShareChoices, portalMessagesBody, readPortalSend, recordShareConsentByClient, sendFromPortal, type ClientShareChoice, type ThreadMessage as MessageView } from '../crm/index.ts';
import { agreementLinks, agreementPage, currentTermsVersions, hasAgreedCurrent, keepAgreement, safeBack } from '../compliance/index.ts';
import { handlePortalEvidence, portalEvidenceCard } from '../survey/index.ts';
import { handleConfirmLink } from './accountant-confirm-pages.ts';
import { readUpload, receiveFile } from '../claims/index.ts';
import { portalDashboard } from './portal-dashboard.ts';
import { stepName } from '../crm/index.ts';
import * as P from './portal.ts';
import { acceptReport } from './report-accept.ts';
import { portalSettings } from './settings-port.ts';

/** Signing the engagement letter from the link in its email, with no login. */
export async function portalSignLink(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, path, method, actor, newId, now } = w;
  /* SIGNING FROM THE LINK IN THE LETTER EMAIL — no login. The link is the key: single use, out of date
     after SIGN_LINK_DAYS, one login's, one letter's. Opening it (a GET, which email scanners also make) signs nothing and
     uses nothing; only the signed form uses the link. Off unless the signing setting says `links`. */
  const signMatch = /^\/sign\/([0-9a-f]{64})$/.exec(path);
  if (signMatch && (method === 'GET' || method === 'POST')) {
    const token = signMatch[1] ?? '';
    const cfg = d.signing ?? ENGAGEMENT_SIGNING;
    const link = signLinkFor(d.app.db, token, now());
    const nope = (status: number, title: string, why: string) => { html(res, status, page({ title, nav: nav(actor), body: h`<h1>${title}</h1><p>${why}</p><p><a class="cta" href="/login">Sign in to the portal</a></p>` })); return 'handled' as const; };
    if (cfg.links !== true) return nope(404, 'Signing link not available', SIGN_WORDS.links_off);
    if (link === null) return nope(404, 'This link does not work', SIGN_WORDS.link);
    const business = { id: link.business_id, name: link.business_name, company_number: link.company_number };
    const engOf = (): P.EngagementView | null => getEngagementsStateSignedAtById<P.EngagementView>(d.app.db, [link.engagement_id]) ?? null;
    const extra = { ...letterExtra(d.app.db, link.business_id, link.user_id), action: `/sign/${token}`, byLink: true };
    if (method === 'GET') {
      updateEngagementsLetterStateViewedAtByIdLetterState(d.app.db, [now(), link.engagement_id]);
      letterHtml(res, 200, letterPage(actor, business, engOf(), undefined, undefined, d.letterPath, cfg, extra, d.notices === true || d.legal === true));
      return 'handled';
    }
    const f = await form(req);
    const typed = { full_name: f.get('full_name') ?? '', role: f.get('signer_role') ?? '' };
    const r = signByLink({ db: d.app.db, audit: d.app.audit, email: d.app.email, now, newId, ...(d.publicOrigin === undefined ? {} : { origin: d.publicOrigin }) }, token, {
      ...typed, authorised: f.get('authorised') === 'on', letter_sha256: f.get('letter_sha256') ?? '',
      signature_strokes: f.get('signature_strokes') ?? '', typed_as_signature: f.get('typed_as_signature') === 'on',
    }, clientIp(req), { cfg, ...(d.letterPath === undefined ? {} : { letterPath: d.letterPath }) });
    if (!r.ok) {
      letterHtml(res, 400, letterPage(actor, business, engOf(), r.why, typed, d.letterPath, cfg, extra, d.notices === true || d.legal === true));
      return 'handled';
    }
    html(res, 200, page({ title: 'Letter signed', nav: nav(actor), body: h`<h1>${r.complete ? 'Thank you — the letter is signed' : 'Thank you — you have signed'}</h1>
      <p>We have recorded your signature. ${r.complete ? 'A copy of the signed letter, with a certificate of completion, is saved to be emailed to you.' : 'The letter needs one more signature. We will email the signed copy when it has it.'}</p>
      <p class="help">This link has now been used, and will not open the letter again.</p>` }));
    return 'handled';
  }
  return undefined;
}

/** The client's accountant confirms by the link alone. */
export async function portalConfirmLink(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, newId } = w;
  /* The client's accountant confirms for themselves, by the link alone (src/modules/portal/accountant-confirm-pages.ts). */
  if (path.startsWith('/confirm/')) {
    const r = await handleConfirmLink(d.app, newId, req, res, url, method, form);
    if (r === 'handled') return 'handled';
  }
  return undefined;
}

/** The portal: a client agrees to the current terms first, then the portal's own pages. */
export async function portalEntry(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, actor, newId, now, legalServed, session } = w;
  /* ----------------------------------------------------------- portal */
  if (path === '/portal' || path.startsWith('/portal/')) {
    if (actor === undefined) { redirect(res, '/login'); return 'handled'; }
    /* A CLIENT AGREES TO THE CURRENT TERMS BEFORE THE PORTAL OPENS, where the legal pages are served. The
       sign-up's tick usually covers it; this asks a client who signed up before, was given a login, or when a version
       changes. Their own second step stays open, so they are never locked out of keeping their login safe. */
    if (legalServed && actor.role === 'CLIENT' && !/^\/portal\/two-factor(\/|$)/.test(path)) {
      if (path === '/portal/agree' && method === 'POST') {
        const f = await form(req);
        const next = safeBack(f.get('next'));
        const to = next.startsWith('/portal') ? next : '/portal';
        if (f.get('agree') !== 'yes') { html(res, 400, agreementPage(nav(actor), to, 'Tick the box to say you have read them.')); return 'handled'; }
        if (!hasAgreedCurrent(d.app.db, actor.id)) keepAgreement(d.app, actor.id, actor.role, now(), currentTermsVersions(), newId, 'portal');
        redirect(res, to); return 'handled';
      }
      if (!hasAgreedCurrent(d.app.db, actor.id)) {
        if (path === '/portal/agree' || method === 'GET') {
          const next = path === '/portal/agree' ? safeBack(url.searchParams.get('next')) : `${path}${url.search}`;
          html(res, 200, agreementPage(nav(actor), next.startsWith('/portal') ? next : '/portal')); return 'handled';
        }
        redirect(res, '/portal/agree'); return 'handled';
      }
      if (path === '/portal/agree') { redirect(res, '/portal'); return 'handled'; }
    }
    return inContext(d, path, () => portalRoutes(d, req, res, url, method, actor, newId, session?.session_id ?? null));
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * portal routes
 * ------------------------------------------------------------------ */

async function portalRoutes(
  d: WebDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor, newId: () => string, session_id: string | null = null,
): Promise<WebResult> {
  const db = d.app.db;
  const now = d.app.now;
  const path = url.pathname;

  /**
   * THE BUSINESS THIS REQUEST IS ABOUT.
   *
   * A CLIENT has exactly one and it comes from their own session record, NOT
   * from the URL. A staff actor may name one. That is the single most common
   * way a portal leaks — `?business=<someone else>` — and the shape below is
   * what makes it impossible rather than merely checked: for a CLIENT the
   * parameter is not read at all, and `readBusiness` authorises the row anyway.
   */
  const asked = url.searchParams.get('business');
  const business_id = actor.role === 'CLIENT' ? (actor.business_id ?? '') : (asked ?? '');

  /**
   * AND IF A CLIENT NAMES SOMEBODY ELSE'S BUSINESS, REFUSE — LOUDLY.
   *
   * Ignoring the parameter would already be safe: the id above is taken from
   * the session and the row is authorised regardless, so the request would
   * simply return the client's own page. THAT IS NOT GOOD ENOUGH, for two
   * reasons. It answers 200 to an attempt to read another client's record,
   * which reads like success to whoever tried it and to anyone reviewing a
   * log; and a silently discarded parameter hides the day somebody wires a
   * genuine caller to it and cannot work out why it has no effect.
   *
   * So a client who addresses a business that is not theirs gets a refusal,
   * and it is the SAME refusal a missing business would produce.
   */
  if (actor.role === 'CLIENT' && asked !== null && asked !== actor.business_id) {
    throw new NotAuthorised('business.read', 'business');
  }

  /**
   * A CLIENT'S OWN ACCOUNT SETTINGS — the same implementation the back office
   * uses, mounted here so that a client has somewhere to change their password.
   * Until this phase there was nowhere at all.
   */
  if (path === '/portal/settings' || path.startsWith('/portal/settings/')) {
    return portalSettings()(
      { app: d.app, store: d.store, newId }, req, res, url, method, actor,
      (r) => form(r), readBody,
    );
  }

  /**
   * THE CLIENT'S OWN ANSWER ON SHARING PROGRESS WITH THE FIRM THAT REFERRED THEM —
   * CRM 8 of 10. Every check is in introducers.ts, on the object: withdrawing is
   * always open, giving waits on its switch.
   */
  if (path === '/portal/share-progress' && method === 'POST') {
    const f = await form(req);
    const r = recordShareConsentByClient(
      { db, audit: d.app.audit, now, newId }, actor, business_id,
      { introducer_id: f.get('introducer_id'), decision: f.get('decision'), wording_version: f.get('wording_version') },
    );
    if (!r.ok) { html(res, 400, simple('Not changed', r.why)); return 'handled'; }
    redirect(res, '/portal'); return 'handled';
  }

  /* The client's Help, and hiding the welcome card. */
  if (path === '/portal/help' && method === 'GET') {
    html(res, 200, page({ title: 'Help', nav: nav(actor), wide: true, body: h`<div class="guide card"><h1>Help with your claim page</h1>${clientHelp()}
      <p>Still stuck? Reply to any message from us, or ask for a call on <a href="/portal#appointment">your claim page</a>.</p></div>` }));
    return 'handled';
  }
  if (path === '/portal/welcome/dismiss' && method === 'POST') {
    dismissWelcome({ db, audit: d.app.audit, now }, actor);
    redirect(res, '/portal'); return 'handled';
  }

  if (path === '/portal' && method === 'GET') {
    const { business, progress } = P.progress(db, actor, business_id);
    const eng = P.engagement(db, actor, business_id);
    const bks = P.bookings(db, actor, business_id);
    const tks = P.tasks(db, actor, business_id);
    const dcs = P.documents(db, actor, business_id);
    const reqs = P.documentRequests(db, actor, business_id, now());
    const rng = P.shownRange(db, actor, business_id);
    /* THE SAME FUNCTION THE FUNNEL-CLOSE PICKER USES — moments, with the people
       taken out. A client must not learn whose diary it is, and building a
       second list here is how the two would come to differ. */
    // CRM 6 of 10: what the deliverables register releases to this client — a reasoned negative is told here, never as a stage.
    const dlv = clientDeliverables(db, actor, business_id);
    // CRM 8 of 10: the client's own share-progress answers. A staff member viewing the portal is not the client, and is not asked.
    const shr = actor.role === 'CLIENT' ? clientShareChoices(db, actor, business_id) : [];
    const welcome = actor.role === 'CLIENT' && welcomeShown(db, actor) ? welcomeCard(WELCOME_JOBS.CLIENT, '/portal/welcome/dismiss') : undefined;
    // Every claim this company holds, each asked of `claim.progress_read`.
    const cls = P.claims(db, actor, business_id);
    // The steps staff have told this client about — words and dates, and nothing behind them.
    const done = portalSteps(db, actor, business_id);
    // Each video call with a meeting gets its join link on the portal.
    const joins: Record<string, string> = {};
    for (const b of bks) { const m = b.channel === 'video' ? activeMeeting(db, b.id) : undefined; if (m !== undefined) joins[b.id] = `/call/${m.client_token}`; }
    // The top of the portal as a dashboard (src/modules/portal/portal-dashboard.ts).
    // The survey report's card leads, once a tax adviser's sign-off has released it (src/modules/portal/report-portal-pages.ts).
    const dashboard = h`${portalReportCard(d.app, business_id, actor)}${portalEvidenceCard(db, business_id)}${portalDashboard({ db, actor, business_id, nowIso: now(), bookings: bks, tasks: tks, requests: reqs, done, delivered: dlv, joins })}`;
    html(res, 200, portalPage(actor, business, progress, eng, bks, tks, dcs, reqs, receivableTypes(db), rng,
      publicSlots(db, now()), now(), dlv, shr, { proposedSteps: nameSwitches().portalSteps, claims: cls, done, sent: url.searchParams.get('sent') === '1', ...(/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('again') ?? '') ? { sentBefore: url.searchParams.get('again') as string } : {}), joins, dashboard, rangeBasis: rangeBasisFor(db, business_id), ...(welcome === undefined ? {} : { welcome }) }));
    return 'handled';
  }

  /* MESSAGES — the thread with the client, and nothing else. `business_id` is the session's for a client, so a
     client only ever reads and writes their own company's thread; every read and write is asked of the rule table again. */
  /* "SHOW US YOUR BUILDING" — the photo checklist and the recorded walkthrough call (src/modules/survey/evidence-pages.ts). */
  if (path === '/portal/building' || path.startsWith('/portal/building/')) {
    P.progress(db, actor, business_id); // the business is asked of the rule table, as every portal page does
    const r = await handlePortalEvidence({ app: d.app, store: d.store, newId, nav: nav(actor), form, readBody }, req, res, url, method, actor, business_id);
    if (r === 'handled') return 'handled';
  }
  /* THE CLIENT'S SURVEY REPORT — only the version a tax adviser's sign-off has released (src/modules/portal/report-portal-pages.ts). */
  /* The client accepts the released report (src/modules/portal/report-accept.ts). */
  if (path === '/portal/report/accept' && method === 'POST') {
    P.progress(db, actor, business_id); // the business is asked of the rule table, as every portal page does
    const r = acceptReport({ db, audit: d.app.audit, now, newId }, actor, business_id);
    if (!r.ok) { html(res, 400, simple('Not accepted', r.why)); return 'handled'; }
    redirect(res, '/portal/report?done=accepted');
    return 'handled';
  }
  if ((path === '/portal/report' || path === '/portal/report.pdf') && method === 'GET') {
    P.progress(db, actor, business_id); // the business is asked of the rule table, as every portal page does
    return portalReport(d.app, actor, business_id, path, res, nav(actor));
  }
  if (path === '/portal/messages' && method === 'GET') {
    const m = portalMessagesBody({ app: d.app, newId }, actor, business_id, url.searchParams.get('done'));
    html(res, 200, page({ title: m.title, nav: nav(actor), wide: true, body: m.body }));
    return 'handled';
  }
  if (path === '/portal/messages' && method === 'POST') {
    const got = await readPortalSend(req, form, readBody, piecesOf(d.app, d.store, actor));
    const r = got.ok ? await sendFromPortal({ app: d.app, store: d.store, newId }, actor, business_id, got.send) : got;
    if (!r.ok) {
      // Drawn again with what they typed, so a refusal never costs a long message. Nothing was sent.
      const m = portalMessagesBody({ app: d.app, newId }, actor, business_id, null, { why: r.why, body: got.ok ? got.send.body : '' });
      html(res, 400, page({ title: m.title, nav: nav(actor), wide: true, body: m.body }));
      return 'handled';
    }
    redirect(res, `/portal/messages?done=${r.with_file ? 'file' : 'sent'}#thread`);
    return 'handled';
  }
  const oneMessage = /^\/portal\/messages\/([A-Za-z0-9-]+)$/.exec(path);
  if (oneMessage && method === 'GET') {
    let msg: MessageView | null = null;
    try { msg = clientMessage(db, actor, business_id, oneMessage[1] ?? ''); } catch (e) { if (!(e instanceof NotFoundAsRefusal)) throw e; }
    if (msg === null) {
      // A team message, another company's message and an id that does not exist all answer the same.
      html(res, 404, page({ title: 'Message not found', nav: nav(actor), wide: true, body: h`<div class="card"><h1>We cannot find that message</h1>
        <p>It may have been typed wrongly.</p><p><a class="btn btn-primary" href="/portal/messages">See your messages</a></p></div>` }));
      return 'handled';
    }
    html(res, 200, page({ title: 'Message', nav: nav(actor), wide: true, body: h`<div class="card"><p class="msgmeta"><strong>${msg.who}</strong> · ${msg.when}</p>
      <p class="msgbody">${msg.body}</p>${msg.files.length === 0 ? raw('') : h`<ul class="msgfiles">${msg.files.map((f) => h`<li><a href="${f.href}">${f.name}</a></li>`)}</ul>`}
      <p><a href="/portal/messages#msg-${msg.id}">See it in your messages</a></p></div>` }));
    return 'handled';
  }

  /* ONE CLAIM'S PROGRESS. Looked for only among this company's own claims, so another company's claim and a
     claim that does not exist both answer 404 — the same page, naming nothing. */
  const claimMatch = /^\/portal\/claims\/([A-Za-z0-9-]+)$/.exec(path);
  if (claimMatch && method === 'GET') {
    const { business } = P.progress(db, actor, business_id);
    const c = P.claim(db, actor, business_id, claimMatch[1] ?? '');
    if (c === null) {
      html(res, 404, page({ title: 'Claim not found', nav: nav(actor), wide: true, body: h`<div class="card"><h1>We cannot find that claim</h1>
        <p>It may have been typed wrongly.</p><p><a class="btn btn-primary" href="/portal">See your claims</a></p></div>` }));
      return 'handled';
    }
    // Which way each part of the claim goes in — the claim the portal has already authorised.
    const row = getClaimsPropertyIdByIdBusinessId<{ property_id: string | null }>(db, [c.id, business_id]);
    const routes = row === undefined || c.state !== 'OPEN' ? [] : claimRoutes(db, { id: c.id, business_id, property_id: row.property_id }, new Date().toISOString())
      .map((r) => ({ label: r.label === 'The claim' ? 'Your claim' : r.label, words: r.words }));
    html(res, 200, portalClaimPage(actor, business, c, nameSwitches().portalSteps, portalSteps(db, actor, business_id), routes));
    return 'handled';
  }

  if (path === '/portal/letter' && method === 'GET') {
    const { business } = P.progress(db, actor, business_id);
    P.markViewed(db, actor, business_id, now);
    const eng = P.engagement(db, actor, business_id);
    letterHtml(res, 200, letterPage(actor, business, eng, undefined, undefined, d.letterPath, d.signing, letterExtra(db, business_id, actor.id), d.notices === true || d.legal === true));
    return 'handled';
  }

  /* The signed copy - the letter, the signature page and the certificate of completion - for the client. */
  if (path === '/portal/letter/signed.pdf' && method === 'GET') {
    const c = signedCopy(db, actor, business_id);
    if (c === null) { html(res, 404, simple('No signed copy', 'Your letter is not signed yet.')); return 'handled'; }
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${c.filename}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(Buffer.from(c.pdf));
    return 'handled';
  }

  /* THE BUILT-IN SIGNATURE (src/modules/claims/signing.ts). Every check is there, on the record: the switch
     (ENGAGEMENT_SIGNING, on since 11 Nov 2026), the letter complete, sent and not yet signed, a full name, a role, the tick, and the
     fingerprint of the letter the page drew. A refusal is a page the client reads, with what they typed kept. */
  if (path === '/portal/letter/sign' && method === 'POST') {
    const f = await form(req);
    const { business } = P.progress(db, actor, business_id);
    const typed = { full_name: f.get('full_name') ?? '', role: f.get('signer_role') ?? '' };
    const r = session_id === null
      ? { ok: false as const, why: 'Please sign in again, then sign the letter.' }
      : signEngagement({ db, audit: d.app.audit, email: d.app.email, now, newId, ...(d.publicOrigin === undefined ? {} : { origin: d.publicOrigin }) }, actor, business_id, {
        ...typed, authorised: f.get('authorised') === 'on', letter_sha256: f.get('letter_sha256') ?? '',
        signature_strokes: f.get('signature_strokes') ?? '', typed_as_signature: f.get('typed_as_signature') === 'on',
      }, { ip: clientIp(req), session_id }, { ...(d.letterPath === undefined ? {} : { letterPath: d.letterPath }), ...(d.signing === undefined ? {} : { cfg: d.signing }) });
    if (!r.ok) {
      letterHtml(res, 400, letterPage(actor, business, P.engagement(db, actor, business_id), r.why, typed, d.letterPath, d.signing, letterExtra(db, business_id, actor.id), d.notices === true || d.legal === true));
      return 'handled';
    }
    html(res, 200, page({ title: 'Letter signed', nav: nav(actor), body: r.complete ? h`<h1>Thank you — the letter is signed</h1>
      <p>We have recorded your signature. A copy of the signed letter, with a signature page and a certificate of completion, is saved to be emailed to you.</p>
      <p><a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a></p>
      <p><a class="cta" href="/portal">Back to your claims</a></p>` : h`<h1>Thank you — you have signed</h1>
      <p>We have recorded your signature. The letter needs one more signature, from the other person we agreed with your business. We will email the signed copy to you both when it has it.</p>
      <p><a class="cta" href="/portal">Back to your claims</a></p>` }));
    return 'handled';
  }

  /**
   * THE CLIENT MOVES THEIR OWN CALL. One route, two verbs, and the
   * decision about which is a radio button rather than two forms that could
   * disagree about which booking they are addressing.
   *
   * EVERY CHECK IS IN portal.ts, on the object: this reads a form and renders
   * an answer. There is no role test here, no "is it too late" arithmetic here
   * and no slot list built here — a control in a handler is a control that the
   * next handler will not have.
   */
  const bookingMatch = /^\/portal\/bookings\/([A-Za-z0-9-]+)$/.exec(path);
  if (bookingMatch && method === 'POST') {
    const f = await form(req);
    const moveDeps = {
      db, audit: d.app.audit, email: d.app.email, now, newId, origin: d.publicOrigin,
    };
    // A third verb, `cancel`, on the same route — see cancelOwnBooking in portal.ts.
    const r = f.get('cancel') === 'on'
      ? P.cancelOwnBooking(moveDeps, actor, business_id, { booking_id: bookingMatch[1] ?? '' })
      : f.get('release') === 'on'
        ? P.releaseOwnBooking(moveDeps, actor, business_id, { booking_id: bookingMatch[1] ?? '' })
        : P.moveOwnBooking(moveDeps, actor, business_id, {
            booking_id: bookingMatch[1] ?? '', starts_at: f.get('starts_at') ?? '',
          });
    if (!r.ok) {
      html(res, 400, simple(f.get('cancel') === 'on' ? 'The call was not cancelled' : 'That time was not taken', r.why));
      return 'handled';
    }
    // A video call's Zoom meeting follows the change (moved, or deleted when cancelled or given back).
    await reconcileVideoMeeting(d.app, bookingMatch[1] ?? '');
    redirect(res, '/portal'); return 'handled';
  }

  const taskMatch = /^\/portal\/tasks\/([A-Za-z0-9-]+)$/.exec(path);
  if (taskMatch && method === 'POST') {
    const f = await form(req);
    const r = P.answerTask(db, actor, business_id, {
      task_id: taskMatch[1] ?? '', dont_know: f.get('dont_know') === 'on',
      answer: f.get('answer') ?? '',
    }, now);
    if (!r.ok) { html(res, 400, simple('Not saved', r.why ?? 'that did not work')); return 'handled'; }
    redirect(res, '/portal'); return 'handled';
  }

  if (path === '/portal/documents' && method === 'POST' && /^multipart\/form-data\b/i.test(req.headers['content-type'] ?? '')) {
    // THE FILE COMES WITH THE FORM. One step, and exactly the path the upload address takes — the same
    // single-use key, `acceptClientBytes` and `finishUpload` — so no page ever shows an HTTP PUT address.
    const up = await readUpload(req, readBody, piecesOf(d.app, d.store, actor));
    if (!up.ok) { html(res, 400, simple('Not sent', up.why)); return 'handled'; }
    const r = await receiveFile({ app: d.app, store: d.store, newId }, actor, {
      business_id: P.progress(db, actor, business_id).business.id,
      type_code: up.fields.type_code ?? null, logical_document_id: up.fields.document ?? null, request_id: up.fields.request ?? null, claim_id: null,
    }, up.bytes);
    if (!r.ok) { html(res, 400, simple('Not sent', r.why)); return 'handled'; }
    // The same file sent before — the day only, which says nothing about anyone.
    redirect(res, r.sent_before === null ? '/portal?sent=1#documents' : `/portal?sent=1&again=${localDate(r.sent_before)}#documents`);
    return 'handled';
  }

  if (path === '/portal/documents' && method === 'POST') {
    const f = await form(req);
    // CRM 4 of 10: AN UPLOAD STARTS AS A VERSION OF A DOCUMENT, of a type with a
    // receipt policy, against a request where there is one. The client no longer
    // types a file name: it is derived, because a file's name can be a person's.
    const b = await startDocumentUpload({ db, audit: d.app.audit, now, newId, store: d.store }, actor, {
      business_id: P.progress(db, actor, business_id).business.id,
      type_code: f.get('type_code'), logical_document_id: f.get('document'), request_id: f.get('request'), claim_id: null,
    });
    if (!b.ok) { html(res, 400, simple('No upload link issued', b.why)); return 'handled'; }
    // The capability goes to the browser and is not stored. The page below is
    // what a real client would see between asking and uploading.
    html(res, 200, uploadTicketPage(b.doc_id, b.url, b.expires_at));
    return 'handled';
  }

  const docMatch = /^\/portal\/documents\/([A-Za-z0-9-]+)$/.exec(path);
  if (docMatch && method === 'GET') {
    const doc = P.document(db, actor, docMatch[1] ?? '');
    // The same plain counts the staff Files folder shows, from the same reader — never the handler's own step log.
    html(res, 200, documentPage(doc, readLines(db, doc)));
    return 'handled';
  }

  /**
   * DB-W1 — THE SERVING ENDPOINT.
   *
   * The only route in this application that could ever return a client
   * document's bytes, and it authorises THAT document for THIS requester on
   * THIS request (DB-W1-T3), then writes an access record naming who, what and
   * when (DB-W1-T6) whether it serves or refuses.
   *
   * IT DOES NOT SERVE THE ORIGINAL, and that is not a limitation of the
   * prototype — it is the design. Under FAIL_CLOSED_SETTINGS the unredacted
   * file is deleted from quarantine as soon as the strip has run and is never
   * promoted to durable storage, so THERE IS NOTHING TO SERVE. Returning 410
   * with that explanation is the honest answer; inventing a copy to serve
   * would undo the control the whole pipeline exists to perform.
   */
  const dlMatch = /^\/portal\/documents\/([A-Za-z0-9-]+)\/download$/.exec(path);
  if (dlMatch && method === 'GET') {
    const id = dlMatch[1] ?? '';
    let doc: P.DocumentView;
    try {
      doc = P.document(db, actor, id);
    } catch (e) {
      d.app.audit.append({
        at: now(), kind: 'DOCUMENT_ACCESSED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'document', object_id: id, outcome: 'REFUSED', detail: { route: 'download' },
      });
      throw e;
    }
    d.app.audit.append({
      at: now(), kind: 'DOCUMENT_ACCESSED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document', object_id: doc.id, outcome: 'ALLOWED',
      detail: { route: 'download', state: doc.state },
    });
    html(res, 410, simple(
      'That file no longer exists, by design',
      'We read it, then deleted the file. We did not keep a copy. ' +
      'We keep what we took from it, not the file. ' +
      'The document’s own page shows when we deleted it.'));
    return 'handled';
  }

  return 'not-mine';
}

/**
 * MOVING OR CANCELLING YOUR OWN CALL.
 *
 * IT DRAWS WHAT THE STORE WOULD ACCEPT, AND NOTHING MORE. Every condition below
 * is asked of the same functions the write path asks: `BOOKING.booksASlot` for
 * whether this channel holds a moment at all, `P.tooSoonForNewTime` for the new
 * time's notice period, and `publicSlots` for the times. THE FORM IS NOT THE
 * CONTROL — a client who posts a time this panel never drew is refused by
 * `isBookable` and the notice period at the moment of writing.
 *
 * THE CONTROL IS DRAWN AT ANY TIME, however close or past the call
 * is ("Give the client full control to cancel at any time, and rebook at a time
 * that suits them"). THE ORDER IS THE DECISION: new times first, then "ring me
 * instead", then cancelling outright.
 */
function movePanel(
  b: P.BookingView, slots: ReturnType<typeof publicSlots>, nowIso: string,
): Safe {
  if (b.cancelled_at !== null) {
    return h`<div class="flag">You cancelled this call on ${clockOf(b.cancelled_at)}. Your enquiry is still
      open — telephone us, or reply to any message from us, and we will arrange another call.</div>`;
  }
  if (!booksATime(b.channel)) return raw('');
  const offerable = slots.available ? slots.slots.filter((sl) => !P.tooSoonForNewTime(nowIso, sl.starts_at)) : [];
  const cancelForm = h`
      <p class="help">Or cancel this call altogether. Your enquiry stays open and nothing else about it
      changes; we will not call you at this time.</p>
      <form method="post" action="/portal/bookings/${b.id}">
        <input type="hidden" name="cancel" value="on">
        <button class="linkish" type="submit">Cancel this call</button>
      </form>`;
  if (b.starts_at === null) {
    return h`<p class="help">No time is held for this call yet — we will ring you to arrange one.</p>${cancelForm}`;
  }
  return h`
    <details class="pblock">
      <summary>Change or cancel this call</summary>
      <p class="help">${zoneNotice(b.starts_at)}</p>
      ${offerable.length > 0
        ? h`<form method="post" action="/portal/bookings/${b.id}">
            <label class="fl">Choose another time</label>
            <div class="opts">${offerable.slice(0, 24).map((sl) => h`
              <label class="opt"><input type="radio" name="starts_at" value="${sl.starts_at}">
                ${clockOf(sl.starts_at)}</label>`)}</div>
            <button class="cta" type="submit">Move my call</button>
          </form>`
        : h`<div class="flag">${slots.available ? 'There are no other times free at the moment.' : slots.say}</div>`}
      <p class="help">If none of those work, give this time back and we will telephone you to
      arrange another. Your enquiry stays open and nothing else about it changes — we simply
      stop holding a slot you cannot make.</p>
      <form method="post" action="/portal/bookings/${b.id}">
        <input type="hidden" name="release" value="on">
        <button class="linkish" type="submit">None of these work — ring me instead</button>
      </form>
      ${cancelForm}
    </details>`;
}

/** Where a booking came from, in words a client reads. */
const BOOKED_FROM: Readonly<Record<string, string>> = Object.freeze({
  funnel_close: 'your assessment', gated_exit: 'your enquiry', portal: 'your claim page',
});

/**
 * THE RANGE'S BASIS, FOR THE CLIENT. The brand book: "Estimates always render as a range with its basis
 * stated underneath" (slide 49). The same facts as RANGE_QUALIFIER, which the back office still shows, in the client's
 * words and with no build language.
 */
// "move it down, not up" stops being true once later works are measured, so it says what is.
export const CLIENT_RANGE_BASIS =
  'An indicative figure, built only from what you told us in the assessment. It is the top of the range for that. Checking the records ' +
  'can move it down. Work you have done since, measured by our surveyor, can add to it. No property registers have been checked yet.';
/**
 * Once a register has answered, "No property registers have been checked yet"
 * is no longer true of the client's claim, though it is still true of the figure. So the note says both.
 */
export const CLIENT_RANGE_BASIS_AFTER_RESEARCH =
  'An indicative figure, built only from what you told us in the assessment. It is the top of the range for that. Checking the records ' +
  'can move it down. Work you have done since, measured by our surveyor, can add to it. We worked it out before checking any property records. We have now started checking the property records.';

export function rangeBasisFor(db: Db, business_id: string): string {
  const fired = getResearchSourcesCountByBusinessIdState2<{ n: number }>(db, [business_id])?.n ?? 0;
  return fired > 0 ? CLIENT_RANGE_BASIS_AFTER_RESEARCH : CLIENT_RANGE_BASIS;
}

function portalPage(
  actor: Actor, business: P.Business, progress: ReturnType<typeof P.progress>['progress'],
  eng: P.EngagementView | null, bks: P.BookingView[], tks: P.TaskView[], dcs: P.DocumentView[],
  reqs: readonly RequestView[], types: readonly { code: string; label: string }[],
  rng: P.ShownRangeView | null,
  slots: ReturnType<typeof publicSlots>, nowIso: string,
  dlv: readonly ClientDeliverable[] = [],
  share: readonly ClientShareChoice[] = [],
  extra: { readonly proposedSteps?: boolean; readonly welcome?: Safe; readonly claims?: readonly P.PortalClaim[]; readonly done?: readonly ClientStep[]; readonly sent?: boolean; readonly sentBefore?: string; readonly joins?: Readonly<Record<string, string>>; readonly dashboard?: Safe; readonly rangeBasis?: string } = {},
): string {
  const open = tks.filter((t) => t.state === 'OPEN');
  const asked = reqs.filter((r) => r.state === 'REQUESTED');
  const versionable = [...new Map(dcs.filter((x) => x.logical_document_id !== null && x.type_label !== null)
    .map((x) => [x.logical_document_id ?? '', `${x.type_label ?? ''} ${x.seq ?? ''}`] as const)).entries()];
  const named = extra.proposedSteps === true;
  const cls = extra.claims ?? [];
  const answered = tks.filter((t) => t.state === 'ANSWERED');
  const received = reqs.filter((r) => r.state === 'RECEIVED');
  // The page's parts open out under Your claims in the left-hand menu.
  setSubMenu({ items: [
    ...(extra.dashboard === undefined ? [] : [{ href: '#where-you-are', label: 'Where your claim is' }]),
    { href: '#waiting-on-you', label: 'What we need from you', ...(open.length + asked.length > 0 ? { note: String(open.length + asked.length) } : {}) },
    { href: '#done-so-far', label: 'What we have done' },
    { href: '#your-range', label: 'The figure you were shown' },
    { href: '#letter', label: 'Your engagement letter' },
    { href: '#appointment', label: 'Your appointment' },
    { href: '#documents', label: 'Documents' },
    { href: '#contact-us', label: 'How to contact us' },
  ] });
  return page({
    title: business.name, nav: nav(actor), wide: true,
    /* THE PORTAL, IN THE ORDER A CLIENT NEEDS IT. At the top, how to reach us and book a call; then where
       the claim is; the range with its basis underneath; what we need from you; then everything else. The long step
       explanations sit behind "What happens at each step". Every section of the first layout is still on the page.
       The header also offers Send us a document; the questions and the documents asked
       for are drawn only when there is one (the "What we need from you" card already says when nothing is); How to
       contact us moves to the end, its words unchanged; the parts are listed under Your claims in the left-hand menu. */
    body: h`
      <header class="highlights"><p class="eyebrow">${cls.length === 1 ? 'Your claim' : 'Your claims'}</p><h1>${business.name}</h1>
        <p><a class="btn btn-primary" href="/portal/messages">Send us a message</a> <a class="btn" href="#appointment">Book a call</a> <a class="btn" href="#documents">Send us a document</a></p></header>
      ${extra.welcome ?? raw('')}
      ${extra.dashboard ?? raw('')}
      ${cls.length === 0 ? raw('') : card('Your claims', portalClaimTiles(cls, named, business.name), { count: cls.length, id: 'your-claims' })}
      ${clientStepsCard(extra.done ?? [], cls.map((c) => ({ id: c.id, name: propertyIn(business.name, c.property) ?? 'Your claim' })))}
      ${cls.length === 0 && progress.known ? clientStageBar(progress.steps.map((s) => ({ label: stepName(s.stage, named), state: s.state }))) : raw('')}

      <section class="card" id="your-range"><div class="card-h"><h2>The figure you were shown</h2></div>
      ${rng === null
        ? h`<p class="help">No assessment has been recorded for this business.</p>`
        /* The assessment shows a ceiling, "up to £X", and never a low end, so
           this says the same. It said "£127,500 to £255,000", a range the client was never shown. */
        : h`<p class="figbig">${formatShownRange({ low_pence: null, high_pence: rng.high_pence })}</p>
            <p class="help">${extra.rangeBasis ?? CLIENT_RANGE_BASIS}</p>`}
      </section>

      ${extra.dashboard !== undefined ? raw('') : h`<section class="card" id="waiting-on-you"><div class="card-h"><h2>What we need from you</h2><span class="count">${open.length + asked.length}</span></div>
        ${open.length + asked.length === 0 ? h`<p class="empty">Nothing at the moment. We are working on your claim, and we will tell you here if we need anything.</p>`
          : h`<ul class="plain">${open.map((t) => h`<li><a href="#question-${t.id}">${t.question}</a> <span class="help">— a question</span></li>`)}${
            asked.map((r) => h`<li><a href="#request-${r.id}">${r.type.label}</a> <span class="help">— a document, ${ukDatesIn(r.due.label)}</span></li>`)}</ul>`}
      </section>`}

      ${open.length + answered.length === 0 ? raw('') : h`<section class="card" id="questions"><div class="card-h"><h2>Questions we still need answered</h2></div>
      ${open.length === 0
        ? h`<p class="help">Nothing is waiting on you.</p>`
        : open.map((t) => h`
          <div class="pblock" id="question-${t.id}">
            <p><strong>${t.question}</strong></p>
            <div class="help">${why(h`<em>Why we are asking:</em> ${t.why}<br><em>What it holds up:</em> ${t.holds_up}`)}</div>
            <form method="post" action="/portal/tasks/${t.id}">
              <label class="vh" for="answer-${t.id}">Your answer to: ${t.question}</label>
              <input class="fi" id="answer-${t.id}" name="answer" placeholder="Your answer">
              <label class="ck"><input type="checkbox" name="dont_know"> I don’t know</label>
              <button class="cta" type="submit">Send this answer</button>
            </form>
          </div>`)}
      ${answered.map((t) => h`
        <p class="help">✓ ${t.question} — ${t.answer_state === 'DONT_KNOW' ? 'answered “I don’t know”' : t.answer}
        (${t.answered_by_role === 'CLIENT' ? 'you' : 'Cap Rebate'}, ${t.answered_at === null ? '' : localStamp(t.answered_at, nowIso)})</p>`)}
      </section>`}

      ${asked.length + received.length === 0 ? raw('') : h`<section class="card" id="asked-documents"><div class="card-h"><h2>Documents we have asked you for</h2></div>
      ${asked.length === 0
        ? h`<p class="help">We are not waiting on any document from you.</p>`
        : asked.map((r) => h`
          <div class="pblock" id="request-${r.id}">
            <p><strong>${r.type.label}</strong> — ${r.due.overdue ? h`<strong>${ukDatesIn(r.due.label)}</strong>` : h`${ukDatesIn(r.due.label)}`}</p>
            <div class="help">${why(h`<em>Why we are asking:</em> ${r.why}<br><em>What it holds up:</em> ${r.holds_up}`)}</div>
            <form method="post" action="/portal/documents" enctype="multipart/form-data" data-pieces>
              <input type="hidden" name="request" value="${r.id}">
              <label class="dropzone" for="send-${r.id}"><span class="dropwords">Drop the file here, or tap to choose it</span>
                <input id="send-${r.id}" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
              <button class="cta" type="submit">Send this file</button>
            </form>
            <p class="help">It is marked received when the file arrives and passes our checks. There is no button
            to say you have sent it.</p>
          </div>`)}
      ${received.map((r) => h`
        <p class="help">✓ ${r.type.label} — received${r.received === null ? '' : `, version ${r.received.version_no ?? ''}, ${ukDatesIn(r.received.at)}`}</p>`)}
      </section>`}

      <section class="card"><div class="card-h"><h2>What happens at each step</h2></div>
      ${progress.known
        ? h`<details><summary>Show each step</summary><ul class="steps">${progress.steps.map((s) => h`
            <li class="${s.state}"><span class="lab">${stepName(s.stage, named)}</span><br>
            <span class="say">${s.stage.toTheClient}</span></li>`)}</ul></details>`
        : h`<div class="flag">We cannot show where this claim is right now, and we will not guess.
            Ask us and we will tell you. <span class="help">${P.stageInWords(business.stage)}</span></div>`}
      </section>

      <section class="card" id="issued"><div class="card-h"><h2>What we have issued to you</h2></div>
      ${dlv.length === 0
        ? h`<p class="help">Nothing has been issued yet.</p>`
        : h`<table><tbody>${dlv.map((x) => h`<tr><td>${x.label}</td><td>version ${x.version}, issued ${ukDate(x.issued_on)}</td>
            <td class="help">${x.note}</td></tr>`)}</tbody></table>`}
      </section>

      ${share.length === 0 ? raw('') : h`
      <section class="card"><div class="card-h"><h2>The firm that referred you</h2></div>
      ${share.map((s) => h`
        <div class="pblock">
          <p><strong>${s.says}</strong></p>
          <p class="help">${s.words}</p>
          ${s.can_withdraw ? h`<form method="post" action="/portal/share-progress">
              <input type="hidden" name="introducer_id" value="${s.introducer_id}">
              <input type="hidden" name="decision" value="WITHDRAWN">
              <input type="hidden" name="wording_version" value="${s.wording_version}">
              <button class="cta" type="submit">Stop telling ${s.firm_name} how my claim is progressing</button>
            </form>` : raw('')}
          ${s.can_give ? h`<form method="post" action="/portal/share-progress">
              <input type="hidden" name="introducer_id" value="${s.introducer_id}">
              <input type="hidden" name="decision" value="GIVEN">
              <input type="hidden" name="wording_version" value="${s.wording_version}">
              <button class="cta" type="submit">Keep ${s.firm_name} informed</button>
            </form>` : raw('')}
        </div>`)}</section>`}

      <section class="card" id="letter"><div class="card-h"><h2>Your engagement letter</h2></div>
      ${eng === null
        ? h`<p class="help">No engagement letter has been prepared yet.</p>`
        : h`<p>Status: <strong>${eng.state.toLowerCase().replace('_', ' ')}</strong>${eng.signed_at !== null ? h`, ${localStamp(eng.signed_at, nowIso)}` : raw('')}.</p>
            <p><a class="cta" href="/portal/letter">${eng.state === 'SIGNED' ? 'Read the letter' : 'Read and sign the letter'}</a>${eng.state === 'SIGNED' ? h` <a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a>` : raw('')}</p>`}
      </section>

      <section class="card" id="appointment"><div class="card-h"><h2>Your appointment</h2></div>
      ${bks.length === 0
        ? h`<p class="help">Nothing is booked. Reply to any message from us and we will arrange a call.</p>`
        : h`<table><thead><tr><th>How</th><th>When</th><th>Booked from</th></tr></thead><tbody>
            ${bks.map((b) => h`<tr>
              <td>${b.channel === 'phone' ? 'Telephone' : b.channel === 'video' ? 'Video call' : b.channel === 'email' ? 'Email' : 'Text message / WhatsApp'}</td>
              <td>${b.starts_at === null
                ? 'No set time yet.'
                : clockOf(b.starts_at)}${extra.joins?.[b.id] === undefined ? '' : h` · <a href="${extra.joins[b.id]!}">Join the video call</a>`}</td>
              <td>${BOOKED_FROM[b.entry_point] ?? b.entry_point.replace(/_/g, ' ')}</td></tr>`)}</tbody></table>
          ${bks.map((b) => movePanel(b, slots, nowIso))}`}
      </section>

      <section class="card" id="documents"><div class="card-h"><h2>Documents</h2></div>
      ${extra.sent === true ? savedMessage(extra.sentBefore === undefined ? 'Thank you. We have your file.'
        : `Thank you. We have your file. You sent us this same file on ${ukDate(extra.sentBefore)}. We have kept both, so nothing is lost, and you do not need to send it again.`) : raw('')}
      ${dcs.length === 0 ? h`<p class="help">Nothing uploaded yet.</p>` : h`
        <table><thead><tr><th>Document</th><th>Version</th><th>State</th><th></th></tr></thead><tbody>
        ${dcs.map((x) => h`<tr><td>${x.type_label === null ? x.filename : `${x.type_label} ${x.seq ?? ''}`}</td>
          <td>${x.version_no === null ? '—' : String(x.version_no)}</td>
          <td>${x.failure_code !== null ? 'We could not use it' : x.strip_recorded_at !== null && x.quarantine_discharged_at !== null ? 'Read' : 'Not read yet'}</td>
          <td><a href="/portal/documents/${x.id}">What we did with it</a></td></tr>`)}</tbody></table>`}
      <form method="post" action="/portal/documents" enctype="multipart/form-data" data-pieces>
        <p class="fl"><strong>Send us a document</strong></p>
        <label class="dropzone" for="send-file"><span class="dropwords">Drop a file here, or tap to choose one</span>
          <input id="send-file" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
        <label class="fl" for="send-type">What is it?</label>
        <select class="fi" id="send-type" name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select>
        ${versionable.length === 0 ? raw('') : h`<label class="fl" for="send-version">A new version of one you have already sent? (optional)</label>
        <select class="fi" id="send-version" name="document"><option value="">No — a new document</option>${
          versionable.map(([id, label]) => h`<option value="${id}">${label}</option>`)}</select>`}
        <p class="help">We name the file ourselves, so nothing personal is kept in its name. Nothing you send replaces
        an earlier version: each is kept as a version of its own.</p>
        <button class="cta" type="submit">Send</button>
      </form></section>

      <section class="card" id="contact-us"><div class="card-h"><h2>How to contact us</h2></div>
        <p>Write to us under <a href="/portal/messages">Messages</a> — you can send a file there too — or ask for a call under
        <a href="#appointment">Your appointment</a>. If you are unhappy with anything we have done, our
        <a href="/notices/">public notices</a> say how to complain.</p>
      </section>

      <section class="card" id="account"><div class="card-h"><h2>Your account</h2></div>
      <p><a href="/portal/settings">Change your password, name or username</a></p></section>`,
  });
}

/** A claim's stage in the client's words. */
function portalClaimStage(c: P.PortalClaim, named: boolean): string {
  if (c.state === 'FINISHED') return 'Finished';
  if (c.state === 'CLOSED') return 'Closed';
  if (c.state === 'UNKNOWN' || c.progress.current === undefined) return 'We will update this soon';
  return stepName(c.progress.current, named);
}

/** ONE TILE PER CLAIM: the property, its town, how far it has got, and its reference in grey. */
function portalClaimTiles(cls: readonly P.PortalClaim[], named: boolean, company: string): Safe {
  return h`<ul class="tiles">${cls.map((c) => h`<li class="tile">
    <p class="tilename"><a href="/portal/claims/${c.id}">${propertyIn(company, c.property) ?? 'Your claim'}</a></p>
    ${c.town === null || c.town.trim() === '' ? raw('') : h`<p class="help">${c.town}</p>`}
    <p>${badge(portalClaimStage(c, named), c.state === 'OPEN' ? 'info' : 'plain')}</p>
    <p>${claimRef(c.ref)}</p></li>`)}</ul>
    <p class="help">Questions, documents and messages for all your claims are on this page.</p>`;
}

/** ONE CLAIM'S PROGRESS, inside the company's portal. Questions, documents and messages stay on /portal. */
/** The client's told steps, or none for a login that may not read them. Never a refusal on the portal's own page. */
function portalSteps(db: Db, actor: Actor, business_id: string): ClientStep[] {
  return can(actor, 'client_step.read', { type: 'client_steps', id: business_id, business_id }) ? clientSteps(db, actor, business_id) : [];
}

function portalClaimPage(actor: Actor, business: P.Business, c: P.PortalClaim, named: boolean, done: readonly ClientStep[] = [],
  routes: readonly { readonly label: string; readonly words: string }[] = []): string {
  const property = propertyIn(business.name, c.property);
  // The town only where the property's words do not already carry it.
  const where = [property, c.town !== null && property !== null && property.toLowerCase().includes(c.town.trim().toLowerCase()) ? null : c.town].filter((x): x is string => x !== null && x.trim() !== '').join(', ');
  return page({
    title: `${business.name} — ${property ?? 'your claim'}`, nav: nav(actor), wide: true,
    body: h`${breadcrumb([{ label: business.name, href: '/portal' }, { label: property ?? 'Your claim' }])}
      <header class="highlights"><p class="eyebrow">Your claim</p><h1>${business.name}</h1>
        <p class="subhead">${where === '' ? 'Your claim' : `Claim on ${where}`} ${claimRef(c.ref)}</p>
        <p>${badge(portalClaimStage(c, named), c.state === 'OPEN' ? 'info' : 'plain')}</p></header>
      ${c.progress.known ? clientStageBar(c.progress.steps.map((s) => ({ label: stepName(s.stage, named), state: s.state }))) : raw('')}
      <section class="card"><div class="card-h"><h2>Where this claim is</h2></div>
        ${c.state === 'FINISHED' ? h`<p>This claim is finished.</p>`
          : c.state === 'CLOSED' ? h`<p>This claim is closed. We will have told you why. Ask us if anything is unclear.</p>`
            : c.progress.current === undefined ? h`<p>We will update this soon. Ask us if you need to know now.</p>`
              : h`<p>${c.progress.current.toTheClient}</p>`}
      </section>
      ${clientStepsCard(done, [{ id: c.id, name: property ?? 'Your claim' }], c.id)}
      ${routes.length === 0 ? raw('') : h`<section class="card" id="routes"><div class="card-h"><h2>How each part goes in</h2></div>
        <ul>${routes.map((r) => h`<li><strong>${r.label}.</strong> ${r.words}</li>`)}</ul></section>`}
      <section class="card"><div class="card-h"><h2>What we need from you</h2></div>
        <p>Questions, documents and messages for all your claims are in one place.</p>
        <p><a class="btn btn-primary" href="/portal#waiting-on-you">See what we need from you</a></p>
      </section>
      <p><a href="/portal">Back to your claims</a></p>`,
  });
}

/**
 * The letter page. While the letter can be signed (the signing form, and its pad, are on the page), every
 * page's policy plus OUR OWN script, the signing pad's. Otherwise exactly every page's policy, with no script at all.
 */
export const LETTER_PAGE_CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
function letterHtml(res: ServerResponse, status: number, body: string): void {
  if (!body.includes('data-sig-pad')) { res.writeHead(status, HTML_HEADERS); res.end(body); return; }
  res.writeHead(status, { ...HTML_HEADERS, 'content-security-policy': LETTER_PAGE_CSP });
  res.end(body.replace('</body>', '<script src="/assets/signature-pad.js" defer></script></body>'));
}

function letterPage(
  actor: Actor | undefined, business: Pick<P.Business, 'id' | 'name' | 'company_number'>, eng: P.EngagementView | null,
  problem?: string, typed?: { full_name: string; role: string }, letterPath?: string, signing: EngagementSigning = ENGAGEMENT_SIGNING,
  /** Where the form posts (the portal, or a signing link), whether this signer has signed, and the steps so far. */
  extra: { readonly action?: string; readonly mine?: boolean; readonly progress?: readonly string[]; readonly byLink?: boolean; readonly facts?: LetterFacts } = {},
  /** Where the legal pages are served, the signing screen links the client's terms, the website terms and the privacy policy. */
  legalLinks = false,
): string {
  // The record's number travels with its name. Absent is omitted, never passed as undefined; a blank is passed and
  // letter.ts treats it as absent — the specimen stays and is flagged, never read as the client's (N4).
  const shown = shownLetter(business, letterPath, extra.facts);
  const openTerms = loadLetter(letterOptions(business, letterPath, extra.facts));
  const missing = signingMissing(signing, shown);
  const canSign = eng !== null && (eng.state === 'SENT' || eng.state === 'VIEWED');
  return page({
    title: 'Engagement letter', nav: nav(actor),
    body: h`
      <h1>Engagement letter</h1>
      <p>Status: <strong>${eng === null ? 'not prepared' : eng.state.toLowerCase().replace('_', ' ')}</strong>.</p>
      ${problem === undefined ? raw('') : h`<p class="err">${problem}</p>`}

      ${openTerms.openTerms.length > 0 ? h`<div class="flag"><strong>Some terms are not settled yet, so they are left blank on purpose.</strong>
      ${openTerms.openTerms.length} of them. ${shown.test_copy ? 'This is the test copy, so it is shown with them left blank. It is never a contract.' : 'We will not issue the letter until they are.'}${why(h`If we guessed a figure, the contract would hold a
      number nobody has agreed. These terms are CAP REBATE LTD’s to settle.`)}
      <ul>${openTerms.openTerms.map((t) => h`<li><strong>${t.clause}</strong> — <q class="letter-quote">${t.text}</q></li>`)}</ul></div>` : raw('')}

      ${openTerms.specimens.length > 0 ? h`<div class="flag"><strong>Sample wording still in this
      letter:</strong> ${openTerms.specimens.join('; ')}. It is an example, not your figure.</div>` : raw('')}

      <div class="letter">${shown.paragraphs.map((p) => p.heading
        ? h`<p class="clause">${p.text}</p>`
        : h`<p>${p.text}</p>`)}</div>

      ${extra.progress === undefined || extra.progress.length === 0 ? raw('') : h`<ul class="plain">${extra.progress.map((w) => h`<li>${w}</li>`)}</ul>`}
      ${eng !== null && eng.state === 'SIGNED' ? (extra.byLink === true
        ? h`<p><strong>This letter is signed${eng.signed_at === null ? '' : ` (${localWhen(eng.signed_at)})`}.</strong> We have emailed the signed copy.</p>`
        : h`<p><strong>You signed this letter${eng.signed_at === null ? '' : ` on ${localWhen(eng.signed_at)}`}.</strong> <a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a></p>`)
        : extra.mine === true ? h`<p><strong>You have signed this letter.</strong> It needs one more signature. We will email the signed copy when it has it.</p>`
        : canSign ? h`
      <form method="post" action="${extra.action ?? '/portal/letter/sign'}" class="sign">
        <h2>Sign the letter</h2>
        <input type="hidden" name="letter_sha256" value="${shown.sha256}">
        <label>Your full name <input name="full_name" required maxlength="200" autocomplete="name" value="${typed?.full_name ?? ''}"></label>
        <label>Your role in the business <input name="signer_role" required maxlength="120" autocomplete="organization-title" value="${typed?.role ?? ''}"></label>
        <fieldset class="sig"><legend>Your signature</legend>
          ${missing.length > 0 ? raw('') /* The pad, and its one script, only while the letter can be signed */ : h`<div class="sig-pad" data-sig-pad hidden>
            <canvas class="sig-canvas" width="600" height="200" aria-label="Draw your signature here"></canvas>
            <p class="help" data-sig-note></p>
            <button type="button" class="btn-quiet" data-sig-clear>Clear and draw again</button>
          </div>`}
          <input type="hidden" name="signature_strokes" value="">
          <label class="ck"><input type="checkbox" name="typed_as_signature"> Use my typed name as my signature (if you cannot, or would rather not, draw it)</label>
        </fieldset>
        <label class="ck"><input type="checkbox" name="authorised" required> I confirm I may sign this letter for ${business.name}.</label>
        ${legalLinks ? h`<p class="help">Please also read ${agreementLinks()}. This letter governs our work for you, and wins if they ever say something different.</p>` : raw('')}
        <button class="cta" type="submit">Sign</button>
      </form>
      ${missing.length === 0 ? raw('') : h`<div class="gate">${signing.enabled === true ? 'This letter cannot be signed yet.' : 'Signing is not switched on yet.'}${why(h`${missing.join(' ')}`)}</div>`}` : raw('')}
      <div class="gate">When you sign, we keep a record of it.${why(h`We keep your name, your role, your signature and the time. We keep the internet address you signed from. We keep a fingerprint of this exact letter. You get a copy of the signed letter by email, and you can download it here. We never take a payment here.`)}</div>`,
  });
}

/** The letter page's second-signer facts — whether this login has signed, and the steps so far. */
function letterExtra(db: Db, business_id: string, user_id: string): { mine: boolean; progress: string[]; facts: LetterFacts } {
  const ls = letterState(db, business_id);
  // The client's kind of business, properties, the date sent and the figure shown, for the letter.
  return { facts: letterFacts(db, business_id), mine: ls.state !== 'SIGNED' && ls.signed_by.some((x) => x.user_id === user_id),
    progress: ls.named.length === 0 && ls.signed_by.length === 0 ? [] : letterSteps(ls).filter((w) => /^(To be signed|Signed by|Waiting)/.test(w)) };
}

/**
 * THE UPLOAD LINK, AND A FORM THAT USES IT — the CRM follow-on. A browser sends the file with the form below: a multipart
 * POST to the same address a PUT uses, carrying the same single-use key, and no script. The PUT is still described for a
 * caller that is not a browser.
 */
function uploadTicketPage(doc_id: string, url: string, expires_at: string): string {
  return page({
    title: 'Upload link', body: h`
      <h1>Your upload link is ready</h1>
      <form method="post" action="${url}&doc=${doc_id}" enctype="multipart/form-data">
        <label class="fl" for="upload-file">Choose the file</label>
        <input class="fi" id="upload-file" type="file" name="file" required>
        <button class="cta" type="submit">Send the file</button>
      </form>
      <p class="help">This link works once, for this one document, until ${localStamp(expires_at)}.</p>
      <p class="help">We check the file's type and size when it arrives.</p>
      <p><a href="/portal">Back to your claim</a></p>`,
  });
}

/**
 * THE CLIENT'S OWN DOCUMENT PAGE. What we read is said in the same plain counts the staff Files folder shows
 * ("We read 3 pages."), from `readLines` — counts only, never the file's words, a note or a figure. Anything not known yet
 * is said as not known, never left out.
 */
function documentPage(doc: P.DocumentView, read: { state: 'READ' | 'WAITING' | 'REFUSED'; lines: readonly string[] }): string {
  return page({
    title: doc.filename, body: h`
      <h1>${doc.type_label === null ? doc.filename : `${doc.type_label} ${doc.seq ?? ''} — version ${doc.version_no ?? ''}`}</h1>
      <table><tbody>
        <tr><th>Sent</th><td>${localStamp(doc.created_at)}</td></tr>
        <tr><th>Where it is</th><td>${read.state === 'READ' ? 'We have read it' : read.state === 'REFUSED' ? 'We could not use it' : 'Not read yet'}</td></tr>
        <tr><th>What it is</th><td>${doc.type_label ?? 'Not known yet'}</td></tr>
        <tr><th>Kind of file</th><td>${doc.sniffed_as === null ? 'Not known yet' : `${doc.sniffed_as} (we checked the file itself, not its name)`}</td></tr>
        <tr><th>We read it</th><td>${doc.strip_recorded_at === null ? 'Not yet' : localStamp(doc.strip_recorded_at)}</td></tr>
        <tr><th>We deleted the file</th><td>${doc.quarantine_discharged_at === null ? 'Not yet' : localStamp(doc.quarantine_discharged_at)}</td></tr>
      </tbody></table>

      <h3>What we did with it</h3>
      <ul>${read.lines.map((l) => h`<li>${l}</li>`)}</ul>

      <p class="help">${doc.original_kept_at === null || doc.original_deleted_at !== null ? READ_AND_DELETED : 'We have kept the original safely.'}</p>
      <p><a href="/portal">Back to your claim</a></p>`,
  });
}
