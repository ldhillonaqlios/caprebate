/**
 * THE COMPLAINTS SENT THROUGH THE PUBLIC NOTICES PAGE'S FORM: their reference, the list waiting to be logged, and logging
 * one into the complaints log with the time it arrived.
 *
 * Moved here from src/modules/public-site/notices-site.ts (Phase 161l2): the form's complaints are compliance's
 * (complaint_forms, migration 118, and the complaints log), and the compliance complaints page lists and logs them, so
 * they sit with the log rather than with the page that takes them in. The public site keeps the form and the page
 * (`receiveComplaintForm`), and reads the reference from here. Nothing here changed but where it lives.
 */
import type { Actor } from '../../core/index.ts';
import type { Db } from '../../core/index.ts';
import { type ComplianceDeps } from './compliance.ts';
import { assertComplianceWrite } from './compliance.permissions.ts';
import { logComplaint } from './compliance-rights.ts';
import { getComplaintFormsIdReceivedAtById, listComplaintFormsIdReceivedAtByLoggedComplaintId, updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl } from './data.ts';

/** A short reference the person can quote: CF- and the first eight characters of the id. */
export function refOf(id: string): string {
  return `CF-${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
}

export type WaitingForm = { id: string; ref: string; received_at: string; name: string; reply_to: string; complaint_verbatim: string };

/** The complaints sent through the form and not yet logged, oldest first. */
export function waitingForms(db: Db): WaitingForm[] {
  return listComplaintFormsIdReceivedAtByLoggedComplaintId<{ id: string; received_at: string; name: string; reply_to: string; complaint_verbatim: string }>(db).map((r) => ({ ...r, ref: refOf(r.id) }));
}

/** Log a form complaint into the complaints log, received when it arrived, and mark it logged. */
export function logFormComplaint(d: ComplianceDeps, actor: Actor, id: string): { ok: true; id: string } | { ok: false; why: string } {
  assertComplianceWrite(actor);
  const f = getComplaintFormsIdReceivedAtById<{ id: string; received_at: string; name: string; reply_to: string; on_behalf: string | null; authority_detail: string | null;
    matching_info: string | null; complaint_verbatim: string; remedy_sought: string | null; rights: string; logged_complaint_id: string | null }>(d.db, [id]);
  if (f === undefined) return { ok: false, why: 'That complaint was not found.' };
  if (f.logged_complaint_id !== null) return { ok: false, why: 'That complaint is already in the log.' };
  const rights = JSON.parse(f.rights) as string[];
  const described = `${f.name}, reply to ${f.reply_to}`
    + `${f.on_behalf === 'other' ? `, made for someone else (authority: ${f.authority_detail ?? 'not given'})` : ''}`
    + `${f.matching_info === null ? '' : `. To find their records: ${f.matching_info}`}`;
  const verbatim = f.complaint_verbatim
    + `${f.remedy_sought === null ? '' : `\n\nWhat they want: ${f.remedy_sought}`}`
    + `${rights.length === 0 ? '' : `\n\nRights they asked about: ${rights.join(', ')}`}`;
  const r = logComplaint(d, actor, {
    received_at: f.received_at, received_via: 'FORM', received_via_detail: `the complaint form on the public notices page (${refOf(f.id)})`,
    complainant_as_described: described.slice(0, 2000), complaint_verbatim: verbatim.slice(0, 20000),
  });
  if (!r.ok) return { ok: false, why: r.why ?? 'It could not be logged.' };
  updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl(d.db, [r.id, d.now(), actor.id, id]);
  return { ok: true, id: r.id };
}
