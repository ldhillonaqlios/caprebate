/**
 * WHO APPROVED EACH LEGAL PAGE, AND WHO AGREED TO THE TERMS — PHASE 161g, 5 November 2026 (migration 121).
 *
 * APPROVALS. Lakhbir, 5 Nov 2026: the legal pages are built ready for the live website "but not switched on ... each
 * page shows the 'Draft' line until an approval is recorded (who approved it, and the date, kept in the database and
 * the audit log). With no approval nothing goes live." An admin records each approval in the back office at
 * /staff/legal: the page, who approved it, as solicitor or as data protection officer, and the date. A page is in force
 * when both have approved its CURRENT version (LEGAL_PAGES in src/modules/public-site/legal-pages.ts); a new version starts again.
 * An approval is never changed or deleted (migration 121's triggers).
 *
 * AGREEMENTS. Lakhbir, 5 Nov 2026: "the sign-up asks the person to tick that they have read them (the tick, its date
 * and the version are kept, and the audit log records it)". The sign-up offered after the free assessment carries the
 * tick (src/core/signup.ts keeps it until the login is made); a client who has not agreed to the current versions is
 * asked once at /portal/agree before the portal opens. Both only where the legal pages are served (the test website's
 * `notices`, or the `legal` setting), so a link never leads to "being prepared".
 */
import type { App } from '../core/app.ts';
import type { Actor } from '../core/index.ts';
import type { Db } from '../core/index.ts';
import { h, raw, page, type Safe } from '../shared/index.ts';
import { LEGAL_PAGES, NOTICES_VERSION, agreementLinks, inForce, versionOf, type Approvals, type LegalPageKey, type PageApproval } from '../modules/public-site/index.ts';

/** Every page an approval can be recorded for, with its title. */
export const APPROVABLE: readonly (readonly [key: LegalPageKey, title: string])[] = Object.freeze([
  ...LEGAL_PAGES.map(([, title, key]) => [key, title] as const),
  ['notices', 'Public notices'] as const,
]);

/** What a client agrees to: the version of each of the three documents. */
export type TermsVersions = { readonly portal_terms: string; readonly website_terms: string; readonly privacy: string };
export const currentTermsVersions = (): TermsVersions =>
  ({ portal_terms: versionOf('portal-terms'), website_terms: versionOf('terms'), privacy: versionOf('privacy-policy') });

/** The approvals of each page's current version. */
export function currentApprovals(db: Db): Approvals {
  const rows = db.all<{ page: LegalPageKey; version: string; approved_by: string; approver_role: 'SOLICITOR' | 'DPO'; approved_on: string }>(
    'SELECT page, version, approved_by, approver_role, approved_on FROM legal_approvals');
  const out = new Map<LegalPageKey, PageApproval>();
  for (const [key] of APPROVABLE) {
    const mine = rows.filter((r) => r.page === key && r.version === versionOf(key));
    const of = (role: 'SOLICITOR' | 'DPO') => { const r = mine.find((x) => x.approver_role === role); return r === undefined ? null : { by: r.approved_by, on: r.approved_on }; };
    if (mine.length > 0) out.set(key, { solicitor: of('SOLICITOR'), dpo: of('DPO') });
  }
  return out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Record one approval. Admins only. Refuses a page we do not have, a role we do not use, a missing name or date, a
 *  date in the future, and a second approval by the same role of the same version. */
export function recordApproval(app: App, actor: Actor, f: URLSearchParams, newId: () => string): { ok: true } | { ok: false; why: string } {
  if (actor.role !== 'ADMIN') return { ok: false, why: 'Only an admin can record an approval.' };
  const key = f.get('page') as LegalPageKey | null;
  if (key === null || !APPROVABLE.some(([k]) => k === key)) return { ok: false, why: 'Choose the page that was approved.' };
  const role = f.get('role');
  if (role !== 'SOLICITOR' && role !== 'DPO') return { ok: false, why: 'Choose who approved it.' };
  const by = (f.get('approved_by') ?? '').trim();
  if (by.length < 2 || by.length > 200) return { ok: false, why: 'Type the name of the person who approved it.' };
  const on = (f.get('approved_on') ?? '').trim();
  if (!DAY.test(on) || Number.isNaN(Date.parse(on))) return { ok: false, why: 'Give the date they approved it.' };
  if (on > app.now().slice(0, 10)) return { ok: false, why: 'The date they approved it cannot be in the future.' };
  const version = versionOf(key);
  const taken = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM legal_approvals WHERE page = ? AND version = ? AND approver_role = ?', [key, version, role]);
  if ((taken?.n ?? 0) > 0) return { ok: false, why: 'That approval of this version is already recorded.' };
  const id = newId();
  const at = app.now();
  app.db.run('INSERT INTO legal_approvals (id, page, version, approved_by, approver_role, approved_on, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, key, version, by, role, on, actor.id, at]);
  app.audit.append({ at, kind: 'LEGAL_PAGE_APPROVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'legal_page', object_id: id, detail: { page: key, version, role, approved_on: on } });
  return { ok: true };
}

/** Whether this person has agreed to the current version of all three documents. */
export function hasAgreedCurrent(db: Db, user_id: string): boolean {
  const v = currentTermsVersions();
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM terms_agreements WHERE user_id = ? AND portal_terms_version = ? AND website_terms_version = ? AND privacy_version = ?',
    [user_id, v.portal_terms, v.website_terms, v.privacy])!.n > 0;
}

/** Keep a tick: its date and the three versions, and an audit entry. `at` is when the person ticked. */
export function keepAgreement(app: App, user_id: string, role: string, at: string, v: TermsVersions, newId: () => string, route: string): void {
  const id = newId();
  app.db.run('INSERT INTO terms_agreements (id, user_id, agreed_at, portal_terms_version, website_terms_version, privacy_version) VALUES (?, ?, ?, ?, ?, ?)',
    [id, user_id, at, v.portal_terms, v.website_terms, v.privacy]);
  app.audit.append({ at: app.now(), kind: 'TERMS_AGREED', outcome: 'ALLOWED', actor_id: user_id, actor_role: role,
    object_type: 'terms_agreement', object_id: id, detail: { ...v, ticked_at: at, route } });
}

/** The words beside the tick, on the sign-up and on the portal's agreement page. */
export function agreementTick(): Safe {
  return h`<label class="tick"><input type="checkbox" name="agree" value="yes" required>
    I have read ${agreementLinks()}.</label>`;
}

/** The portal's agreement page, for a client who has not agreed to the current versions. */
export function agreementPage(nav: Safe, next: string, error?: string): string {
  return page({ title: 'Before you go on', nav, body: h`<h1>Before you go on</h1>
    ${error === undefined ? raw('') : h`<p class="err" role="alert">${error}</p>`}
    <p>Please read ${agreementLinks()}. They say how our client portal works and how we use your data.</p>
    <p class="help">Your engagement letter governs our work for you. If it and these terms ever differ, the engagement
    letter wins.</p>
    <form method="post" action="/portal/agree"><input type="hidden" name="next" value="${next}">
      ${agreementTick()}
      <button class="cta" type="submit">Continue</button></form>` });
}

/** The back office page: each page's version, who has approved it, and the form to record an approval. */
export function approvalsPage(nav: Safe, approvals: Approvals, msg?: { ok: boolean; text: string }): string {
  const day = (on: string) => on;
  const cell = (a: { by: string; on: string } | null) => a === null ? h`<span class="gap">not yet</span>` : h`${a.by}, ${day(a.on)}`;
  return page({ title: 'Legal pages', nav, wide: true, body: h`<h1>Legal pages</h1>
    ${msg === undefined ? raw('') : h`<p class="${msg.ok ? 'ok' : 'err'}" role="${msg.ok ? 'status' : 'alert'}">${msg.text}</p>`}
    <p class="help">A page stays a draft until both reviewers approve this version. One is our solicitor. The other is
    our data protection officer. A new version needs new approvals. Once kept, an approval cannot be changed or removed.</p>
    <div class="tablewrap"><table><thead><tr><th>Page</th><th>Version</th><th>Solicitor</th><th>Data protection officer</th><th>In force</th></tr></thead>
    <tbody>${APPROVABLE.map(([key, title]) => { const a = approvals.get(key); return h`<tr><td>${title}</td><td>${key === 'notices' ? NOTICES_VERSION : versionOf(key)}</td>
      <td>${cell(a?.solicitor ?? null)}</td><td>${cell(a?.dpo ?? null)}</td><td>${inForce(a) ? 'Yes' : 'No, a draft'}</td></tr>`; })}</tbody></table></div>
    <h2>Record an approval</h2>
    <form method="post" action="/staff/legal/approve">
      <label class="fl" for="la-page">Page</label>
      <select class="fi" id="la-page" name="page" required>${APPROVABLE.map(([key, title]) => h`<option value="${key}">${title}, version ${versionOf(key)}</option>`)}</select>
      <label class="fl" for="la-role">Approved by our</label>
      <select class="fi" id="la-role" name="role" required><option value="SOLICITOR">Solicitor</option><option value="DPO">Data protection officer</option></select>
      <label class="fl" for="la-by">Their name</label><input class="fi" id="la-by" name="approved_by" maxlength="200" required>
      <label class="fl" for="la-on">The date they approved it</label><input class="fi" id="la-on" type="date" name="approved_on" required>
      <button class="cta" type="submit">Record the approval</button>
    </form>` });
}
