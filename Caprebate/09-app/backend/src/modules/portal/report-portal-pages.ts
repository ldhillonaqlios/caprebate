/**
 * THE CLIENT'S SURVEY REPORT IN THEIR PORTAL: the released version and its PDF, "I accept this report", and the home
 * page's card. 2 October 2026; the mock-up the owner approved that day.
 *
 *   GET  /portal/report    · GET /portal/report.pdf          the client's released version (src/modules/survey/report-signoff.ts)
 *
 * Phase 161l2 moved these from the claims' report pages (now src/modules/survey/report-pages.ts, the staff's side and
 * the accountant's link) to the portal, whose pages ask them: the portal sits above the survey and reads it through its
 * front door. The words and the pages are unchanged.
 */
import type { ServerResponse } from 'node:http';
import type { App } from '../../core/app.ts';
import type { Actor } from '../../core/index.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from '../../shared/index.ts';
import { ukDate } from '../../shared/index.ts';
import { pdfName, releasedVersion, reportHtml, reportModel, reportPdf, sendPdf } from '../survey/index.ts';
import { contextForApproval } from '../claims/index.ts';
import { ACCEPT_WORDS, myAcceptance } from './report-accept.ts';

/* ================================================================== *
 * THE CLIENT'S PORTAL
 * ================================================================== */

/** The portal's report pages, for the business the portal resolved for this request. 'not-mine' for any other path. */
export function portalReport(app: App, actor: Actor, business_id: string, path: string, res: ServerResponse, nav: Safe): 'handled' | 'not-mine' {
  if (path !== '/portal/report' && path !== '/portal/report.pdf') return 'not-mine';
  const r = releasedVersion(app.db, business_id);
  if (r === null) {
    res.writeHead(404, HTML_HEADERS);
    res.end(page({ title: 'Your survey report', nav, wide: true, body: h`<div class="card"><h1>Your survey report is not ready yet</h1><p>It appears here once your surveyor has approved it and a tax adviser has signed off its figures. We will tell you.</p><p><a href="/portal">Back to your portal</a></p></div>` }));
    return 'handled';
  }
  const m = reportModel(r.snapshot, r.row.fingerprint, contextForApproval(app.db, r.row.id));
  if (path === '/portal/report.pdf') { sendPdf(res, reportPdf(m).bytes, pdfName(m.company, m.version)); return 'handled'; }
  res.writeHead(200, HTML_HEADERS);
  res.end(page({ title: `Your survey report · ${m.company}`, nav, wide: true, body: h`<p><a href="/portal">Back to your portal</a></p>${acceptBox(app, actor, business_id)}${reportHtml(m, { pdf: '/portal/report.pdf' })}` }));
  return 'handled';
}

/**
 * "I accept this report", on the report page and the home card - or when this login accepted it. A
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
  const r = releasedVersion(app.db, business_id);
  if (r === null) return raw('');
  const m = reportModel(r.snapshot, r.row.fingerprint, contextForApproval(app.db, r.row.id));
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
