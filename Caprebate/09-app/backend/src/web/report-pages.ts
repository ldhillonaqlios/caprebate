/**
 * THE SURVEY REPORT'S PAGES — the report and its PDF for staff, the accountant's private link, the client's portal, and
 * the "Send the report" panel in the pack's chapter 23. 2 October 2026; the mock-up Lakhbir approved that day.
 *
 *   GET  /staff/survey/{job}/pack/version/{n}/report       the report as the client will see it (surveyor_job.read)
 *   GET  /staff/survey/{job}/pack/version/{n}/report.pdf   its PDF
 *   GET  /staff/survey/{job}/pack/version/{n}/return-entries.csv   beside it, the return entries for each year (Phase 153b)
 *   POST /staff/survey/{job}/pack/version/{n}/send         email it to the company's accountant to sign off (email.queue)
 *   POST /staff/survey/{job}/pack/answer/{id}/record       put their signed answer on the claim (tax_signoff.record)
 *   POST /staff/survey/{job}/pack/version/{n}/tell         tell the client it is in their portal (client_message.write)
 *   GET  /signoff/{token}  · POST /signoff/{token} · GET /signoff/{token}/report.pdf     the accountant's link, no login
 *   GET  /signoff/{token}/return-entries.csv                 and its return entries, beside the PDF (Phase 153b)
 *   GET  /portal/report    · GET /portal/report.pdf          the client's released version (src/web/report-signoff.ts)
 *
 * The report and the PDF are made again from the approved version every time (src/web/survey-report.ts): nothing about
 * them is stored but the version itself.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { approvedVersion, type Readiness } from './pack-approve.ts';
import type { PackView } from './survey-pack.ts';
import { reportHtml, reportModel, reportPdf, longDate, REPORT_TITLE } from './survey-report.ts';
import * as S from './report-signoff.ts';
import { ACCEPT_WORDS, myAcceptance } from './report-accept.ts';
import { ukDate } from './localtime.ts';
import { poundsWords } from './pack-sums.ts';
import { csvName, returnContext, returnEntriesCsv } from './return-entries.ts';
import { packJob } from './surveyor.ts';

export type ReportPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
  /** The site's address, for the link in the accountant's email. */
  origin: string;
};

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

function sendPdf(res: ServerResponse, bytes: Uint8Array, filename: string): void {
  res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': String(bytes.length) });
  res.end(Buffer.from(bytes));
}

/** PHASE 153b (Word question 121): the return entries for each year, as a spreadsheet beside the PDF. */
function sendCsv(res: ServerResponse, text: string, filename: string): void {
  const bytes = Buffer.from(text, 'utf8');
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': String(bytes.length) });
  res.end(bytes);
}

const csvLink = (href: string) => h`<p class="help">Beside the PDF: <a href="${href}">the return entries for each year, as a spreadsheet (CSV)</a> — what goes on each tax return, so nobody retypes the figures.</p>`;

const pdfName = (company: string, version: number) =>
  `${company.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'client'}-survey-report-v${String(version)}.pdf`;

/* ================================================================== *
 * STAFF
 * ================================================================== */

export async function handleReportStaff(
  d: ReportPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const v = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack\/version\/(\d{1,6})\/(report|report\.pdf|return-entries\.csv|send|tell)$/.exec(url.pathname);
  const a = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack\/answer\/([A-Za-z0-9-]+)\/record$/.exec(url.pathname);
  if (v === null && a === null) return 'not-mine';
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const job = (v ?? a)?.[1] ?? '';
  const back = `/staff/survey/${job}/pack?ch=23`;

  if (a !== null) {
    if (method !== 'POST') return 'not-mine';
    const r = S.recordAnswer(deps, actor, job, a[2] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `${back}#send`);
    redirect(res, `${back}&done=recorded#send`);
    return 'handled';
  }
  const version = Number(v?.[2]);
  const what = v?.[3];
  if (what === 'report' || what === 'report.pdf' || what === 'return-entries.csv') {
    if (method !== 'GET') return 'not-mine';
    const kept = approvedVersion(deps, actor, job, version);
    if (kept === null) return d.problem(res, actor, 'No such version', 'This pack has no approved version with that number.', back);
    const m = reportModel(kept.snapshot, kept.row.fingerprint);
    if (what === 'report.pdf') { sendPdf(res, reportPdf(m).bytes, pdfName(m.company, m.version)); return 'handled'; }
    if (what === 'return-entries.csv') {
      const { job: j } = packJob(d.app.db, actor, job);
      sendCsv(res, returnEntriesCsv(kept.snapshot, returnContext(d.app.db, j.claim_id, j.business_id), kept.row.fingerprint), csvName(m.company, m.version));
      return 'handled';
    }
    res.writeHead(200, HTML_HEADERS);
    res.end(page({ title: `${REPORT_TITLE} · ${m.company}`, nav: d.nav(actor), wide: true, body: h`
      <p class="eyebrow">${m.company} · Survey pack · version ${String(m.version)}</p>
      <div class="gate" role="note">${kept.fingerprint_holds ? 'This is the report exactly as the client will see it, once a tax adviser has signed off its figures.'
        : h`<strong>The fingerprint does not match.</strong> This copy is not what was approved. Do not send it. Tell the office.`}
        <a href="${back}#send">Back to the pack</a></div>
      ${reportHtml(m, { pdf: `/staff/survey/${job}/pack/version/${String(version)}/report.pdf` })}
      ${csvLink(`/staff/survey/${job}/pack/version/${String(version)}/return-entries.csv`)}` }));
    return 'handled';
  }
  if (method !== 'POST') return 'not-mine';
  const f = await form(req);
  if (what === 'send') {
    const r = S.sendForSignoff({ ...deps, email: d.app.email }, actor, job, version,
      { contact_id: f.get('contact_id') ?? '', permission: f.get('permission') ?? '', origin: d.origin });
    if (!r.ok) return d.problem(res, actor, 'Not sent', r.why, `${back}#send`, r.field);
    redirect(res, `${back}&done=${r.requested === true ? 'emailed' : 'saved-email'}#send`);
    return 'handled';
  }
  const r = S.tellClient(deps, actor, job, version);
  if (!r.ok) return d.problem(res, actor, 'Not sent', r.why, `${back}#send`);
  redirect(res, `${back}&done=told#send`);
  return 'handled';
}

/** Chapter 23's last part: the report travels — an adviser signs off, then the client has it. */
export function sendPanel(d: { app: App; stamp: (iso: string) => string }, actor: Actor, v: PackView, r: Readiness, q: URLSearchParams): Safe {
  const latest = r.approvals[0];
  if (latest === undefined) return raw('');
  const db = d.app.db;
  const base = `/staff/survey/${v.job.id}/pack`;
  const reqs = S.requestsOf(db, v.job.id);
  const accountants = S.accountantsOf(db, v.job.business_id);
  const released = S.releasedVersion(db, v.job.business_id);
  const mine = released !== null && released.row.job_id === v.job.id ? released : null;
  const told = mine === null ? null : S.toldOf(db, mine.row.id);
  const mayEmail = can(actor, 'email.queue', { type: 'email', id: v.job.business_id, business_id: v.job.business_id });
  const qualifying = db.get<{ q: number | null }>("SELECT json_extract(snapshot_json, '$.sums.qualifying_pence') AS q FROM survey_pack_approvals WHERE id = ?", [latest.id])?.q ?? null;
  const done = q.get('done');
  const notes: Record<string, string> = {
    emailed: 'Emailed to the accountant, with the PDF and their private sign-off link.',
    'saved-email': 'Saved. It is not sent from here: sending is off for this copy, or for this address. Their link works once the email goes.',
    recorded: 'Their sign-off is on the claim.',
    told: 'The client has a message in their portal saying their report is there.',
  };
  const ver = (n: number) => `${base}/version/${String(n)}`;
  return h`<section id="send" class="pk-sendp">
    <h2>Send the report</h2>
    ${done !== null && notes[done] !== undefined ? h`<div class="gate" role="status">${notes[done]!}</div>` : raw('')}
    <p class="help">Version ${String(latest.version)}, approved by ${latest.approver_name} on ${d.stamp(latest.approved_at)}. The report and its PDF are made from that version, and never change.</p>
    <div class="pk-step pk-step-done"><span class="pk-step-n" aria-hidden="true">✓</span><div><b>The surveyor approved it.</b><br>
      <a href="${ver(latest.version)}/report">See the report</a> · <a href="${ver(latest.version)}/report.pdf">Download the PDF</a> · <a href="${ver(latest.version)}/return-entries.csv">The return entries (CSV)</a></div></div>
    <div class="pk-step"><span class="pk-step-n" aria-hidden="true">2</span><div><b>A tax adviser checks it and signs off.</b>
      <p><strong>Our own tax adviser:</strong> Admin or Sales record their sign-off on the claim, as before${v.job.claim_id === null ? '.' : h` — <a href="/staff/claims/${v.job.claim_id}">open the claim</a>.`} The figure is ${poundsWords(qualifying)}.</p>
      <p><strong>The client’s accountant:</strong> we email them the PDF and a private link. They read it and sign off, or send it back. Only with the client’s permission.</p>
      ${!mayEmail ? h`<p class="help">Admin or Sales send it.</p>`
        : accountants.length === 0 ? h`<p class="help">The company has no accountant or adviser with an email address. <a href="/staff/clients/${v.job.business_id}#contacts">Add one as a contact</a>.</p>`
        : h`<form method="post" action="${ver(latest.version)}/send" class="pk-add">
          <div class="pk-fields"><label>Their accountant
<select class="fi" name="contact_id">${accountants.map((x) => h`<option value="${x.id}">${x.name} (${x.email})</option>`)}</select></label>
            <label>How did the client give permission? <input class="fi pk-why" name="permission" maxlength="500" required placeholder="For example: by email on 2 October"></label></div>
          <button class="cta" type="submit">Email version ${String(latest.version)} for sign-off</button></form>`}
      ${reqs.length === 0 ? raw('') : h`<ul class="pk-reqs">${reqs.map((x) => h`<li><span>Version ${String(x.version)} to <b>${x.contact_name}</b> (${x.to_email}), by ${x.sent_by_name}, ${d.stamp(x.sent_at)}.
        ${x.answer === null ? (x.sent ? h` <span class="pk-lv pk-lv-amber">Waiting for them</span>` : h` <span class="pk-lv pk-lv-red">Not sent yet</span>${x.send_error === null ? '' : ` ${x.send_error}`}`)
          : x.answer.outcome === 'SENT_BACK' ? h` <span class="pk-lv pk-lv-red">Sent back</span> by ${x.answer.signer_name}: “${x.answer.reason ?? ''}”`
          : h` <span class="pk-lv pk-lv-green">Signed off</span> by ${x.answer.signer_name} of ${x.answer.signer_firm ?? ''} (${x.answer.signer_credential ?? ''}), ${d.stamp(x.answer.answered_at)}.
            ${x.answer.recorded_signoff !== null ? h` On the claim.` : h`<form method="post" action="${base}/answer/${x.answer.id}/record" class="inline"><button class="btn-quiet" type="submit">Record it on the claim</button></form>`}`}
        </span></li>`)}</ul>`}</div></div>
    <div class="pk-step${mine === null ? ' pk-step-wait' : ''}"><span class="pk-step-n" aria-hidden="true">3</span><div><b>The client gets the report.</b>
      ${mine === null ? h`<p class="help">Not yet. It appears in their portal once a tax adviser’s sign-off for ${poundsWords(qualifying)} is on the claim. No figure reaches the client before then.</p>`
        : h`<p>The client can see version ${String(mine.row.version)} in their portal.</p>
          ${told !== null ? h`<p class="help">Told by ${told.told_by_name}, ${d.stamp(told.told_at)}.</p>`
            : h`<form method="post" action="${ver(mine.row.version)}/tell"><button class="cta" type="submit">Tell the client it is there</button></form>
              <p class="help">We send a message to their portal, which emails them to say it is waiting.</p>`}`}</div></div>
  </section>`;
}

/* ================================================================== *
 * THE ACCOUNTANT'S LINK — no login: the link is the key
 * ================================================================== */

const LINK_HEADERS = Object.freeze({ ...HTML_HEADERS, 'cache-control': 'no-store' });

function linkPage(res: ServerResponse, status: number, title: string, body: Safe): 'handled' {
  res.writeHead(status, LINK_HEADERS);
  res.end(page({ title, wide: true, body }));
  return 'handled';
}

function linkForms(token: string, err: { why: string; field?: string } | null, f: URLSearchParams | null): Safe {
  const val = (k: string) => f?.get(k) ?? '';
  return h`<section class="rp-signoff" id="sign">
    <h2>Your answer</h2>
    ${err === null ? raw('') : h`<div class="gate" role="alert"><strong>Not saved.</strong> ${err.why}</div>`}
    <div class="rp-forms">
      <form method="post" action="/signoff/${token}#sign" class="pk-add"><input type="hidden" name="outcome" value="SIGNED">
        <h3>Sign off the figures</h3>
        <div class="pk-fields"><label>Your full name <input class="fi" name="name" maxlength="200" required autocomplete="name" value="${val('outcome') === 'SIGNED' ? val('name') : ''}"></label>
          <label>Your firm, as registered <input class="fi" name="firm" maxlength="300" required autocomplete="organization" placeholder="ending Limited, LLP or plc" value="${val('firm')}"></label>
          <label>The title you sign under <input class="fi" name="credential" maxlength="300" required placeholder="For example: Chartered Accountant" value="${val('credential')}"></label></div>
        <label class="ck"><input type="checkbox" name="read" value="yes" required> I have read this report, and I sign off its figures.</label>
        <button class="cta" type="submit">I sign off these figures</button></form>
      <form method="post" action="/signoff/${token}#sign" class="pk-add"><input type="hidden" name="outcome" value="SENT_BACK">
        <h3>Or send it back</h3>
        <div class="pk-fields"><label>Your full name <input class="fi" name="name" maxlength="200" required autocomplete="name" value="${val('outcome') === 'SENT_BACK' ? val('name') : ''}"></label></div>
        <label class="pk-why-l">Why? <textarea class="fi" name="reason" maxlength="2000" rows="4" required>${val('reason')}</textarea></label>
        <button class="btn" type="submit">Send it back</button></form>
    </div>
    <p class="help">You can answer once. Your name, firm and the time are kept with the report.</p></section>`;
}

export async function handleSignoffLink(
  app: App, newId: () => string, req: IncomingMessage, res: ServerResponse, url: URL, method: string,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const m = /^\/signoff\/([A-Za-z0-9_-]{1,100})(\/report\.pdf|\/return-entries\.csv)?$/.exec(url.pathname);
  if (m === null) return 'not-mine';
  const token = m[1] ?? '';
  let err: { why: string; field?: string } | null = null;
  let posted: URLSearchParams | null = null;
  if (method === 'POST' && m[2] === undefined) {
    posted = await form(req);
    const r = S.answerLink({ db: app.db, audit: app.audit, now: app.now, newId }, token, {
      outcome: posted.get('outcome') ?? '', name: posted.get('name') ?? '', firm: posted.get('firm') ?? '',
      credential: posted.get('credential') ?? '', reason: posted.get('reason') ?? '', read: posted.get('read') ?? '',
    });
    if (r.ok) { redirect(res, `/signoff/${token}`); return 'handled'; }
    err = { why: r.why, ...(r.field === undefined ? {} : { field: r.field }) };
  } else if (method !== 'GET') {
    return 'not-mine';
  }
  const v = S.linkView(app.db, app.now(), token);
  if (v.state === 'NONE') return linkPage(res, 404, 'Link not found', h`<div class="card"><h1>This link is not one of ours</h1><p>Check it was copied in full, or ask Cap Rebate for a new one.</p></div>`);
  if (v.state === 'EXPIRED') return linkPage(res, 410, 'Link run out', h`<div class="card"><h1>This link has run out</h1><p>Ask Cap Rebate for a new one.</p></div>`);
  if (v.state === 'ANSWERED') {
    return linkPage(res, err === null ? 200 : 409, 'Thank you', h`<div class="card">${err === null ? raw('') : h`<p role="alert"><strong>${err.why}</strong></p>`}<h1>Thank you</h1><p>${v.outcome === 'SIGNED' ? 'You signed off this report' : 'You sent this report back'} on ${longDate(v.answered_at)}. We have your answer. This link does nothing more.</p></div>`);
  }
  const model = reportModel(v.snapshot, v.fingerprint);
  if (m[2] !== undefined) {
    if (!v.fingerprint_holds) return linkPage(res, 409, 'Not available', h`<div class="card"><h1>This report cannot be opened</h1><p>It does not match what the surveyor approved. Tell Cap Rebate.</p></div>`);
    if (m[2] === '/return-entries.csv') {
      sendCsv(res, returnEntriesCsv(v.snapshot, returnContext(app.db, v.claim_id, v.business_id), v.fingerprint), csvName(model.company, model.version));
      return 'handled';
    }
    sendPdf(res, reportPdf(model).bytes, pdfName(model.company, model.version));
    return 'handled';
  }
  return linkPage(res, err === null ? 200 : 400, `${REPORT_TITLE} to sign off`, h`
    <div class="gate" role="note"><p><strong>Dear ${v.contact_name},</strong> ${v.company} asked us to send you this report. Read it, then sign off its figures or send it back at the end.
      This link is for you alone. It works once, until ${longDate(v.expires_at)}.</p></div>
    ${v.fingerprint_holds ? raw('') : h`<div class="gate" role="alert"><strong>This report does not match what the surveyor approved.</strong> Do not rely on it. Tell Cap Rebate.</div>`}
    ${reportHtml(model, { pdf: `/signoff/${token}/report.pdf` })}
    ${v.fingerprint_holds ? csvLink(`/signoff/${token}/return-entries.csv`) : raw('')}
    ${v.fingerprint_holds ? linkForms(token, err, posted) : raw('')}`);
}

/* ================================================================== *
 * THE CLIENT'S PORTAL
 * ================================================================== */

/** The portal's report pages, for the business the portal resolved for this request. 'not-mine' for any other path. */
export function portalReport(app: App, actor: Actor, business_id: string, path: string, res: ServerResponse, nav: Safe): 'handled' | 'not-mine' {
  if (path !== '/portal/report' && path !== '/portal/report.pdf') return 'not-mine';
  const r = S.releasedVersion(app.db, business_id);
  if (r === null) {
    res.writeHead(404, HTML_HEADERS);
    res.end(page({ title: 'Your survey report', nav, wide: true, body: h`<div class="card"><h1>Your survey report is not ready yet</h1><p>It appears here once your surveyor has approved it and a tax adviser has signed off its figures. We will tell you.</p><p><a href="/portal">Back to your portal</a></p></div>` }));
    return 'handled';
  }
  const m = reportModel(r.snapshot, r.row.fingerprint);
  if (path === '/portal/report.pdf') { sendPdf(res, reportPdf(m).bytes, pdfName(m.company, m.version)); return 'handled'; }
  res.writeHead(200, HTML_HEADERS);
  res.end(page({ title: `Your survey report · ${m.company}`, nav, wide: true, body: h`<p><a href="/portal">Back to your portal</a></p>${acceptBox(app, actor, business_id)}${reportHtml(m, { pdf: '/portal/report.pdf' })}` }));
  return 'handled';
}

/**
 * PHASE 158c (F39): "I accept this report", on the report page and the home card - or when this login accepted it. A
 * plain form, no script: the portal's pages stay script-free.
 */
export function acceptBox(app: App, actor: Actor, business_id: string): Safe {
  const mine = myAcceptance(app.db, actor, business_id);
  if (mine !== null) return h`<p class="saved" role="status">You accepted this report on ${ukDate(mine.accepted_at)}.</p>`;
  return h`<form method="post" action="/portal/report/accept" class="rp-accept"><p>Read the report. If it is right, tell us you accept it.
    We go on to the next step once you do.</p><button class="cta" type="submit">${ACCEPT_WORDS.button}</button></form>`;
}

/** The portal home's card, when a version is released. */
export function portalReportCard(app: App, business_id: string, actor?: Actor): Safe {
  const r = S.releasedVersion(app.db, business_id);
  if (r === null) return raw('');
  const m = reportModel(r.snapshot, r.row.fingerprint);
  return h`<section class="card rp-portal" id="survey-report" aria-labelledby="survey-report-h">
    <h2 id="survey-report-h">Your survey report is ready</h2>
    <p>Approved by your surveyor, ${m.surveyor.name}, and signed off by a tax adviser.</p>
    <p class="rp-lbl">Spend that qualifies</p><p class="rp-fig">${m.headline.qualifying}</p>
    <p>${m.headline.share} of the ${m.headline.building} paid for the building</p>
    <div class="rp-split" role="img" aria-label="Main pool ${String(m.headline.main_pct)} per cent, special rate pool ${String(100 - m.headline.main_pct)} per cent"><span class="rp-mp pk-w${String(Math.round(m.headline.main_pct / 5) * 5)}"></span><span class="rp-sr"></span></div>
    <p class="rp-legend"><span>Main pool ${m.headline.main}</span><span>Special rate pool ${m.headline.special}</span></p>
    <p><a class="cta" href="/portal/report">Read the report</a> <a class="btn" href="/portal/report.pdf">Download the PDF</a></p>
    ${actor === undefined ? raw('') : acceptBox(app, actor, business_id)}</section>`;
}
