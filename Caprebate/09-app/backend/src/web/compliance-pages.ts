/**
 * THE COMPLIANCE REGISTERS — THE ROUTES. CRM 8 of 10, 12 September 2026.
 *
 * Same shape as src/web/introducers-pages.ts: 'not-mine' for anything outside
 * /staff/compliance, so the mounting in staff.ts is one line. NOTHING HERE DECIDES
 * ANYTHING: every read and write authorises itself in the store — src/web/
 * compliance.ts, compliance-aml.ts, compliance-rights.ts, compliance-breach.ts and
 * compliance-identity.ts — and this file reads a form and draws the answer.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { HTML_HEADERS, type Safe } from './html.ts';
import * as C from './compliance.ts';
import * as A from './compliance-aml.ts';
import * as R from './compliance-rights.ts';
import * as B from './compliance-breach.ts';
import * as S from './compliance-identity.ts';
import * as N from './breach-names.ts';
import * as V from './compliance-views.ts';
import { identityPanel, sendIdentityCheck } from './identity-checks.ts';
import { logFormComplaint, waitingForms } from './notices-site.ts';

export type WebResult = 'handled' | 'not-mine';

export type CompliancePageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
});

function html(res: ServerResponse, body: string): 'handled' {
  res.writeHead(200, HTML_HEADERS);
  res.end(body);
  return 'handled';
}

function json(res: ServerResponse, body: unknown): 'handled' {
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(body, null, 2));
  return 'handled';
}

function redirect(res: ServerResponse, to: string): 'handled' {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
  return 'handled';
}

/** Every posted field, trimmed, blank as null. Checkbox groups named `limbs` are joined. */
function posted(f: URLSearchParams): C.Fields {
  const out: Record<string, string | null> = {};
  for (const k of new Set(f.keys())) {
    if (k === 'limbs') { out[k] = f.getAll(k).join(','); continue; }
    const v = (f.get(k) ?? '').trim();
    out[k] = v === '' ? null : v;
  }
  return out;
}

const ID = '([A-Za-z0-9-]+)';

export async function handleCompliance(
  d: CompliancePageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  if (path !== '/staff/compliance' && !path.startsWith('/staff/compliance/')) return 'not-mine';
  const db = d.app.db;
  const now = d.app.now;
  const deps: C.ComplianceDeps = { db, audit: d.app.audit, now, newId: d.newId };
  const nav = d.nav(actor);
  const msg = url.searchParams.get('done') ?? undefined;
  const back = (r: C.WriteResult, title: string, onOk: string, onFail: string): 'handled' =>
    r.ok ? redirect(res, onOk) : d.problem(res, actor, title, r.why, onFail);
  const m = (re: string): RegExpExecArray | null => new RegExp(`^/staff/compliance${re}$`).exec(path);

  /* ------------------------------------------------ landing, settings, holds, links, search */
  if (path === '/staff/compliance' && method === 'GET') {
    const aml = A.amlView(db, actor, now());
    const today = C.ukDay(now());
    return html(res, V.landingPage(nav, aml, [C.settingReading(db, 'AML_IN_SCOPE', now()), C.settingReading(db, 'INSURANCE_POSITION', now())],
      { rights: R.rightsRegister(db, actor).length, complaints: R.complaintsLog(db, actor).length, breaches: B.breachRegister(db, actor, now()).length },
      R.complaintCount(db, actor, `${today.slice(0, 4)}-01-01`, today), msg));
  }
  if (path === '/staff/compliance/view.json' && method === 'GET') {
    return json(res, { aml: A.amlView(db, actor, now()), rights: R.rightsRegister(db, actor), complaints: R.complaintsLog(db, actor), breaches: B.breachRegister(db, actor, now()) });
  }
  if (path === '/staff/compliance/settings' && method === 'POST') {
    return back(C.recordSetting(deps, actor, posted(await form(req))), 'Setting not recorded', '/staff/compliance?done=saved', '/staff/compliance');
  }
  if (path === '/staff/compliance/holds' && method === 'POST') {
    const f = posted(await form(req));
    const to = f['rights_request_id'] != null ? `/staff/compliance/rights/${f['rights_request_id']}` : f['complaint_id'] != null
      ? `/staff/compliance/complaints/${f['complaint_id']}` : f['incident_id'] != null ? `/staff/compliance/breaches/${f['incident_id']}` : '/staff/compliance';
    return back(C.setHold(deps, actor, f), 'Hold not set', `${to}?done=saved`, to);
  }
  const lift = m(`/holds/${ID}/lift`);
  if (lift && method === 'POST') return back(C.liftHold(deps, actor, lift[1] ?? '', posted(await form(req))), 'Hold not lifted', '/staff/compliance?done=saved', '/staff/compliance');
  if (path === '/staff/compliance/links' && method === 'POST') {
    return back(C.link(deps, actor, posted(await form(req))), 'Not cross-referenced', '/staff/compliance?done=saved', '/staff/compliance');
  }
  if (path === '/staff/compliance/search' && method === 'POST') {
    const term = (await form(req)).get('term') ?? '';
    return html(res, V.searchPage(nav, term, R.searchPerson(deps, actor, term)));
  }

  /* ------------------------------------------------ due diligence */
  if (path === '/staff/compliance/aml' && method === 'GET') {
    const v = A.amlView(db, actor, now());
    return html(res, V.amlPage(nav, v, db.all<{ id: string; name: string }>('SELECT id, name FROM businesses ORDER BY name LIMIT 1000'),
      db.all<{ id: string; name: string }>("SELECT id, display_name AS name FROM users WHERE role <> 'CLIENT' AND disabled_at IS NULL ORDER BY display_name"), msg));
  }
  if (path === '/staff/compliance/aml/officers' && method === 'POST') return back(A.recordOfficer(deps, actor, posted(await form(req))), 'Not recorded', '/staff/compliance/aml?done=saved', '/staff/compliance/aml');
  const endOfficer = m(`/aml/officers/${ID}/end`);
  if (endOfficer && method === 'POST') return back(A.endOfficer(deps, actor, endOfficer[1] ?? '', posted(await form(req))), 'Not recorded', '/staff/compliance/aml?done=saved', '/staff/compliance/aml');
  if (path === '/staff/compliance/aml/risk-assessments' && method === 'POST') return back(A.recordRiskAssessment(deps, actor, posted(await form(req))), 'Not recorded', '/staff/compliance/aml?done=saved', '/staff/compliance/aml');
  if (path === '/staff/compliance/aml/notes' && method === 'POST') return back(A.addMonitoringNote(deps, actor, posted(await form(req))), 'Not recorded', '/staff/compliance/aml?done=saved', '/staff/compliance/aml');
  if (path === '/staff/compliance/aml/checks' && method === 'POST') {
    const r = A.openCheck(deps, actor, posted(await form(req)));
    return back(r, 'Check not opened', r.ok ? `/staff/compliance/aml/checks/${r.id}?done=opened` : '', '/staff/compliance/aml');
  }
  const oneCheck = m(`/aml/checks/${ID}`);
  if (oneCheck && method === 'GET') {
    const v = A.checkView(db, actor, oneCheck[1] ?? '');
    // PHASE 151b: the online identity check, sent from this check while it is open.
    return html(res, V.checkPage(nav, v, msg, identityPanel(d.app, actor, { business_id: v.check.business_id, cdd_check_id: v.check.id }, v.contacts)));
  }
  /* PHASE 151b · THE ONLINE IDENTITY CHECK: sent from a due diligence check, or from the client's page. compliance.write,
     asserted inside sendIdentityCheck. Off with IDENTITY_CHECK: the refusal says, in words, what is still missing. */
  const sendFromCheck = m(`/aml/checks/${ID}/identity`);
  if ((sendFromCheck || path === '/staff/compliance/identity-checks') && method === 'POST') {
    const f = posted(await form(req));
    const business_id = f['business_id'] ?? '';
    const cdd = sendFromCheck ? (sendFromCheck[1] ?? '') : null;
    const at = cdd !== null ? `/staff/compliance/aml/checks/${cdd}` : `/staff/clients/${business_id}`;
    const r = await sendIdentityCheck({ app: d.app, newId: d.newId }, actor, {
      business_id, contact_id: f['contact_id'] ?? '', cdd_check_id: cdd, first_name: f['first_name'] ?? '', last_name: f['last_name'] ?? '',
    });
    return r.ok ? redirect(res, cdd !== null ? `${at}?done=identity-sent` : `${at}?done=identity-sent#identity`) : d.problem(res, actor, 'Identity check not sent', r.why, at);
  }
  const checkAct = m(`/aml/checks/${ID}(|/owners|/psc-decisions|/complete|/withdraw)`);
  if (checkAct && method === 'POST') {
    const id = checkAct[1] ?? '';
    const f = posted(await form(req));
    const at = `/staff/compliance/aml/checks/${id}`;
    const r = checkAct[2] === '/owners' ? A.recordOwner(deps, actor, id, f) : checkAct[2] === '/psc-decisions' ? A.recordPscDecision(deps, actor, id, f)
      : checkAct[2] === '/complete' ? A.completeCheck(deps, actor, id) : checkAct[2] === '/withdraw' ? A.withdrawCheck(deps, actor, id, f) : A.updateCheck(deps, actor, id, f);
    return back(r, 'Not saved', `${at}?done=saved`, at);
  }

  /* ------------------------------------------------ rights requests */
  if (path === '/staff/compliance/rights' && method === 'GET') return html(res, V.rightsListPage(nav, R.rightsRegister(db, actor), msg));
  if (path === '/staff/compliance/rights' && method === 'POST') {
    const r = R.logRequest(deps, actor, posted(await form(req)));
    return back(r, 'Request not logged', r.ok ? `/staff/compliance/rights/${r.id}?done=logged` : '', '/staff/compliance/rights');
  }
  const reqJson = m(`/rights/${ID}/view\\.json`);
  if (reqJson && method === 'GET') return json(res, R.requestView(db, actor, reqJson[1] ?? ''));
  const oneReq = m(`/rights/${ID}`);
  if (oneReq && method === 'GET') return html(res, V.requestPage(nav, R.requestView(db, actor, oneReq[1] ?? ''), msg));
  const reqAct = m(`/rights/${ID}(|/limbs|/close|/letters)`);
  if (reqAct && method === 'POST') {
    const id = reqAct[1] ?? '';
    const f = posted(await form(req));
    const at = `/staff/compliance/rights/${id}`;
    const r = reqAct[2] === '/limbs' ? R.recordLimb(deps, actor, id, f) : reqAct[2] === '/close' ? R.closeRequest(deps, actor, id, f)
      : reqAct[2] === '/letters' ? R.queueLetter(deps, actor, id, f) : R.updateRequest(deps, actor, id, f);
    return back(r, 'Not saved', `${at}?done=saved`, at);
  }

  /* ------------------------------------------------ complaints */
  if (path === '/staff/compliance/complaints' && method === 'GET') return html(res, V.complaintsListPage(nav, R.complaintsLog(db, actor), msg, waitingForms(db)));
  // PHASE 160f: a complaint sent through the public notices page's form, logged with the time it arrived.
  const formLog = m(`/complaint-forms/${ID}/log`);
  if (formLog && method === 'POST') {
    const r = logFormComplaint(deps, actor, formLog[1] ?? '');
    return back(r, 'Complaint not logged', r.ok ? `/staff/compliance/complaints/${r.id}?done=logged` : '', '/staff/compliance/complaints');
  }
  if (path === '/staff/compliance/complaints' && method === 'POST') {
    const r = R.logComplaint(deps, actor, posted(await form(req)));
    return back(r, 'Complaint not logged', r.ok ? `/staff/compliance/complaints/${r.id}?done=logged` : '', '/staff/compliance/complaints');
  }
  const oneCp = m(`/complaints/${ID}`);
  if (oneCp && method === 'GET') return html(res, V.complaintPage(nav, R.complaintView(db, actor, oneCp[1] ?? ''), msg));
  const cpAct = m(`/complaints/${ID}(|/classify|/progress|/close|/letters)`);
  if (cpAct && method === 'POST') {
    const id = cpAct[1] ?? '';
    const f = posted(await form(req));
    const at = `/staff/compliance/complaints/${id}`;
    const r = cpAct[2] === '/classify' ? R.classifyComplaint(deps, actor, id, f) : cpAct[2] === '/progress' ? R.addProgressUpdate(deps, actor, id, f)
      : cpAct[2] === '/close' ? R.closeComplaint(deps, actor, id, f) : cpAct[2] === '/letters' ? R.queueLetter(deps, actor, id, f) : R.updateComplaint(deps, actor, id, f);
    return back(r, 'Not saved', `${at}?done=saved`, at);
  }

  /* ------------------------------------------------ breaches */
  if (path === '/staff/compliance/breaches' && method === 'GET') return html(res, V.breachListPage(nav, B.breachRegister(db, actor, now()), msg));
  if (path === '/staff/compliance/breaches' && method === 'POST') {
    const r = B.openIncident(deps, actor, posted(await form(req)));
    return back(r, 'Entry not opened', r.ok ? `/staff/compliance/breaches/${r.id}?done=opened` : '', '/staff/compliance/breaches');
  }
  const sheet = m(`/breaches/${ID}/ico-sheet`);
  if (sheet && method === 'GET') {
    const s = B.icoAnswerSheet(db, actor, sheet[1] ?? '', now());
    return html(res, V.icoSheetPage(nav, s.ref, s.sections, s.note));
  }
  /* Phase 153c (Word question 181): the restricted names list — the officer and the named deputy only. */
  const names = m(`/breaches/${ID}/names`);
  if (names && method === 'GET') {
    const r = N.namesFor(deps, actor, names[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Restricted', r.why, `/staff/compliance/breaches/${names[1] ?? ''}`);
    return html(res, V.breachNamesPage(nav, names[1] ?? '', r.annex_ref, r.lines, msg));
  }
  if (names && method === 'POST') {
    const id = names[1] ?? '';
    const r = N.addName(deps, actor, id, posted(await form(req)));
    return back(r, 'Not added', `/staff/compliance/breaches/${id}/names?done=added`, `/staff/compliance/breaches/${id}`);
  }
  if (path === '/staff/compliance/breach-names/deputy' && method === 'POST') {
    const r = N.nameDeputy(deps, actor, posted(await form(req)));
    return back(r, 'Not recorded', '/staff/compliance/breaches?done=deputy-named', '/staff/compliance/breaches');
  }
  const oneBi = m(`/breaches/${ID}`);
  if (oneBi && method === 'GET') return html(res, V.incidentPage(nav, B.incidentView(db, actor, oneBi[1] ?? '', now()), msg));
  const biAct = m(`/breaches/${ID}(|/awareness|/decision|/phases|/told|/close)`);
  if (biAct && method === 'POST') {
    const id = biAct[1] ?? '';
    const f = posted(await form(req));
    const at = `/staff/compliance/breaches/${id}`;
    const r = biAct[2] === '/awareness' ? B.correctAwareness(deps, actor, id, f) : biAct[2] === '/decision' ? B.recordDecision(deps, actor, id, f)
      : biAct[2] === '/phases' ? B.recordPhase(deps, actor, id, f) : biAct[2] === '/told' ? B.recordTold(deps, actor, id, f)
        : biAct[2] === '/close' ? B.closeIncident(deps, actor, id) : B.updateIncident(deps, actor, id, f);
    return back(r, 'Not saved', `${at}?done=saved`, at);
  }

  /* ------------------------------------------------ S2, consent, retention */
  if (path === '/staff/compliance/identity' && method === 'GET') return html(res, V.identityPage(nav, S.identityCounts(db, actor), null, msg));
  if (path === '/staff/compliance/identity' && method === 'POST') {
    const r = S.recordPerson(deps, actor, posted(await form(req)));
    return back(r, 'Person not recorded', r.ok ? `/staff/compliance/identity/${r.id}?done=recorded` : '', '/staff/compliance/identity');
  }
  if (path === '/staff/compliance/identity/search' && method === 'POST') {
    const term = (await form(req)).get('term') ?? '';
    try {
      const found = S.searchIdentity(deps, actor, term);
      return html(res, V.identityPage(nav, S.identityCounts(db, actor), found.results));
    } catch (e) {
      if (e instanceof S.IdentityRefusal) return d.problem(res, actor, 'Not searched', e.message, '/staff/compliance/identity');
      throw e;
    }
  }
  const person = m('/identity/(PR-[0-9A-Z]{16})');
  if (person && method === 'GET') return html(res, V.personPage(nav, S.readPerson(deps, actor, person[1] ?? ''), msg));
  if (person && method === 'POST') {
    const ref = person[1] ?? '';
    return back(S.updatePerson(deps, actor, ref, posted(await form(req))), 'Not saved', `/staff/compliance/identity/${ref}?done=saved`, `/staff/compliance/identity/${ref}`);
  }
  const consent = m(`/consent/${ID}`);
  if (consent && method === 'GET') return html(res, V.consentPage(nav, S.consentHistory(db, actor, consent[1] ?? ''), msg));
  if (consent && method === 'POST') {
    const id = consent[1] ?? '';
    return back(S.recordConsent(deps, actor, id, posted(await form(req))), 'Not recorded', `/staff/compliance/consent/${id}?done=saved`, `/staff/compliance/consent/${id}`);
  }
  if (path === '/staff/compliance/retention' && method === 'GET') return html(res, V.retentionPage(nav, S.retentionList(deps, actor, now())));
  if (path === '/staff/compliance/retention/view.json' && method === 'GET') return json(res, S.retentionList(deps, actor, now()));

  // Anything else under the prefix is still this section's: a refusal first, so a role that may not enter learns nothing.
  C.assertComplianceRead(actor);
  return 'not-mine';
}
