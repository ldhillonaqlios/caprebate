/**
 * THE RESTRICTED BREACH NAMES LIST. PHASE 153c, 4 October 2026.
 *
 * Word question 181, Sadique's: "Once the back office is live, which breach record is the official one?" Built on our
 * recommendation for him to check: the back office's breach register is the official record, and the names of anyone
 * who had to be identified are kept apart from it, in this list, which only two people may open — the data protection
 * officer and the deputy named in writing (the letter of authority, Word question 184).
 *
 * THE REGISTER STILL CARRIES NO NAME. A breach entry carries only its annex reference (ANX-nnn, migration 017's
 * `annex_ref`), and the entry's page shows that reference and a link — never a name, a count of names or a role. The
 * list holds, per name: the reference, the entry, the name, how the person was involved, a note. Append-only.
 *
 * WHO MAY OPEN IT. The officer (the DPO role, switched off until it exists) and ONE Admin: the latest deputy named in
 * `breach_names_deputies`, with the paper that names them. Every other Admin — and every other role — is refused, and
 * the refusal is in the audit log as well as every read. Naming the deputy is itself an Admin's recorded act.
 */
import type { Db } from '../db.ts';
import { can, type Actor } from '../authz.ts';
import { DPO_ROLE } from '../roles.ts';
import { complianceObj, record, requiredText, textField, type ComplianceDeps, type Fields, type WriteResult } from './compliance.ts';

export type NameLine = { readonly annex_ref: string; readonly name: string; readonly how_involved: string; readonly note: string | null; readonly recorded_at: string };

/** The deputy named now: the latest row, or null where nobody has been named. */
export function currentDeputy(db: Db): { user_id: string; source: string; named_at: string } | null {
  return db.get<{ user_id: string; source: string; named_at: string }>(
    'SELECT user_id, source, named_at FROM breach_names_deputies ORDER BY named_at DESC, rowid DESC LIMIT 1') ?? null;
}

/** May this person open the list? The officer, or the named deputy — and nobody else. */
export function mayOpenNames(db: Db, actor: Actor): boolean {
  if (!can(actor, 'compliance.breach_names', complianceObj())) return false;
  if ((actor.role as string) === DPO_ROLE) return true;
  const deputy = currentDeputy(db);
  return deputy !== null && deputy.user_id === actor.id;
}

function refuse(d: ComplianceDeps, actor: Actor, incident_id: string): { ok: false; why: string } {
  record(d, actor, 'BREACH_NAMES_REFUSED', 'REFUSED', 'breach_incident', incident_id, {});
  return { ok: false, why: 'Only the data protection officer and the named deputy may open the names list.' };
}

/** Name the deputy. An Admin's recorded act, with the paper that names them; the named person must be an active Admin. */
export function nameDeputy(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  if (!can(actor, 'compliance.write', complianceObj())) return { ok: false, why: 'Only an Admin may name the deputy.' };
  const user_id = (input['user_id'] ?? '').trim();
  const u = d.db.get<{ role: string; disabled_at: string | null }>('SELECT role, disabled_at FROM users WHERE id = ?', [user_id]);
  if (u === undefined || u.role !== 'ADMIN' || u.disabled_at !== null) return { ok: false, why: 'The deputy must be an active Admin login.' };
  const source = requiredText(input['source'], 500, 'The paper that names them, such as the signed letter of authority');
  if (!source.ok) return source;
  const id = d.newId();
  d.db.run('INSERT INTO breach_names_deputies (id, user_id, source, named_by, named_at) VALUES (?, ?, ?, ?, ?)', [id, user_id, source.value, actor.id, d.now()]);
  record(d, actor, 'COMPLIANCE_SETTING_RECORDED', 'ALLOWED', 'breach_names_deputy', id, { setting: 'BREACH_NAMES_DEPUTY' });
  return { ok: true, id };
}

/** The entry's annex reference, given now if it has none (ANX-001, ANX-002 …). */
function annexRefFor(d: ComplianceDeps, incident_id: string): string | null {
  const i = d.db.get<{ annex_ref: string | null }>('SELECT annex_ref FROM breach_incidents WHERE id = ?', [incident_id]);
  if (i === undefined) return null;
  if (i.annex_ref !== null) return i.annex_ref;
  const n = d.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM breach_incidents WHERE annex_ref IS NOT NULL")?.n ?? 0;
  let k = n + 1, ref = '';
  for (;;) { ref = `ANX-${String(k).padStart(3, '0')}`; if (d.db.get('SELECT 1 FROM breach_incidents WHERE annex_ref = ?', [ref]) === undefined) break; k++; }
  d.db.run('UPDATE breach_incidents SET annex_ref = ?, updated_at = ? WHERE id = ?', [ref, d.now(), incident_id]);
  return ref;
}

export function addName(d: ComplianceDeps, actor: Actor, incident_id: string, input: Fields): WriteResult {
  if (!mayOpenNames(d.db, actor)) return refuse(d, actor, incident_id);
  const name = requiredText(input['name'], 200, 'The name');
  if (!name.ok) return name;
  const how = requiredText(input['how_involved'], 500, 'How the person was involved');
  if (!how.ok) return how;
  const note = textField(input['note'], 2000, 'A note');
  if (!note.ok) return note;
  return d.db.tx((): WriteResult => {
    const ref = annexRefFor(d, incident_id);
    if (ref === null) return { ok: false, why: 'No such breach entry.' };
    const id = d.newId();
    d.db.run('INSERT INTO breach_names (id, annex_ref, incident_id, name, how_involved, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, ref, incident_id, name.value, how.value, note.value, actor.id, d.now()]);
    record(d, actor, 'BREACH_NAME_ADDED', 'ALLOWED', 'breach_incident', incident_id, { annex_ref: ref });
    return { ok: true, id };
  });
}

export function namesFor(d: ComplianceDeps, actor: Actor, incident_id: string): { ok: true; annex_ref: string | null; lines: readonly NameLine[] } | { ok: false; why: string } {
  if (!mayOpenNames(d.db, actor)) return refuse(d, actor, incident_id);
  const ref = d.db.get<{ annex_ref: string | null }>('SELECT annex_ref FROM breach_incidents WHERE id = ?', [incident_id])?.annex_ref ?? null;
  const lines = d.db.all<NameLine>('SELECT annex_ref, name, how_involved, note, recorded_at FROM breach_names WHERE incident_id = ? ORDER BY recorded_at, rowid', [incident_id]);
  record(d, actor, 'BREACH_NAMES_READ', 'ALLOWED', 'breach_incident', incident_id, { annex_ref: ref, count: lines.length });
  return { ok: true, annex_ref: ref, lines };
}
