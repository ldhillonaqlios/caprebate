/**
 * COMPLIANCE'S ADDRESSES THE ROUTER SHELL ASKS: the identity check's signed result, and the legal pages' approvals.
 * The router shell (src/app/router.ts) asks each function at the point where its addresses have always been matched,
 * so the order in which every address is tried is unchanged (Phase 161l2; both sat in the shell). The compliance
 * registers are asked by src/app/staff.ts through their own handler (src/modules/compliance/compliance.routes.ts).
 */
import { form, html, inContext, readBody, simple, staffShell, type WebRequest, type WebResult } from '../../core/index.ts';
import { IDENTITY_HOOK_MAX_BYTES, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, receiveIdentityResult } from './identity-checks.ts';
import { approvalsPage, currentApprovals, recordApproval } from './legal-approvals.ts';

/** The identity check's signed result, from the service (no login). */
export async function complianceIdentityHook(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, path, method, newId } = w;
  /* THE IDENTITY CHECK'S SIGNED RESULT. The service has no login, so this sits outside it — and believes
     nothing it is sent unless the signature holds (src/modules/compliance/identity-checks.ts). A bad signature is refused and audited.
     The answer is a status and nothing else: the service reads no page, and a refusal says nothing about why. */
  if (path === IDENTITY_HOOK_PATH && method === 'POST') {
    const raw0 = (await readBody(req, IDENTITY_HOOK_MAX_BYTES)).toString('utf8');
    // Didit signs with two headers and dates the result; any may be missing, and then nothing is believed.
    const one = (name: string): string | null => { const v = req.headers[name]; return typeof v === 'string' ? v : null; };
    const r = receiveIdentityResult(d.app, newId, raw0, {
      v2: one(IDENTITY_SIGNATURE_HEADERS.v2), raw: one(IDENTITY_SIGNATURE_HEADERS.raw), timestamp: one(IDENTITY_SIGNATURE_HEADERS.timestamp),
    });
    res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r.status === 200 ? 'ok' : r.note === undefined ? 'refused' : `refused. ${r.note}`);
    return 'handled';
  }
  return undefined;
}

/** The legal pages' approvals, in the back office: asked by the shell for a signed-in person, before the staff pages. */
export async function complianceLegalApprovals(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, path, method, actor, newId } = w;
  if (actor === undefined) return undefined;
  /* The legal pages' approvals (src/modules/compliance/legal-approvals.ts). Admins only; recorded once, never changed. */
  if ((path === '/staff/legal' && method === 'GET') || (path === '/staff/legal/approve' && method === 'POST')) {
    if (actor.role !== 'ADMIN') { html(res, 403, simple('Not allowed', 'Only an admin can see or record the legal pages’ approvals.')); return 'handled'; }
    return inContext(d, path, async () => {
      if (method === 'GET') { html(res, 200, approvalsPage(staffShell(actor), currentApprovals(d.app.db))); return 'handled'; }
      const r = recordApproval(d.app, actor, await form(req), newId);
      html(res, r.ok ? 200 : 400, approvalsPage(staffShell(actor), currentApprovals(d.app.db), r.ok ? { ok: true, text: 'The approval is recorded.' } : { ok: false, text: r.why }));
      return 'handled';
    });
  }
  return undefined;
}
