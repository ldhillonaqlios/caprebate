/**
 * WHICH SECTIONS A PERSON KEEPS OPEN — PHASE 138, 21 September 2026. "Clean-up 5 of 11."
 *
 * The client page and the claim page draw every section with `section` (src/web/components.ts). A section opens by
 * itself when it is being worked on and closes when it is Done. Under each one a person may press "keep this open for
 * me", "keep this closed for me" or "Let the page decide". The choice is theirs alone, kept on the server (migration 033),
 * so it follows them to any device and is never in the address. The pages run no script, so a form is the only way to
 * say it.
 *
 * WHAT IT NEVER DOES: change what anyone may see. A kept-open section a login may not read is simply not drawn, because
 * the page never builds it. The key is one of a fixed list, the address sent back to is checked against the two page
 * shapes this is offered on and carries nothing but ids, and the write is audited with the key alone.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { Actor } from '../authz.ts';

/** Every section a choice may be kept for. A key not here is refused before it reaches the table. */
export const SECTION_KEYS: readonly string[] = Object.freeze([
  // the client page
  'client.claims', 'client.questions', 'client.activity', 'client.company', 'client.contacts', 'client.properties',
  'client.sources', 'client.answers', 'client.documents',
  // PHASE 142: the two chat threads, as one section with two tabs
  'client.chat',
  // the claim page
  'claim.stage', 'claim.facts', 'claim.figures', 'claim.property', 'claim.team', 'claim.documents', 'claim.money',
  'claim.aftercare', 'claim.activity',
  // PHASE 139: checking facts and telling the client, on both pages; and the property page and a lead's page as sections
  'client.checks', 'claim.checks',
  'property.details', 'property.claims', 'property.activity',
  'lead.details', 'lead.related', 'lead.activity',
]);

/** The page shapes a person is sent back to — the client, a claim, and since Phase 139 a property and a lead. Ids only. */
const BACK = /^\/staff\/(clients\/[A-Za-z0-9-]+(\/claims\/[A-Za-z0-9-]+)?|claims\/[A-Za-z0-9-]+|properties\/[A-Za-z0-9-]+|leads\/[A-Za-z0-9-]+)$/;
const ANCHOR = /^[a-z][a-z0-9-]{0,39}$/;

export function sectionPrefs(db: Db, actor: Actor): ReadonlyMap<string, boolean> {
  const rows = db.all<{ section: string; open: number }>('SELECT section, open FROM section_prefs WHERE user_id = ?', [actor.id]);
  return new Map(rows.map((r) => [r.section, r.open === 1] as const));
}

export type SectionChoice = { readonly section: string; readonly open: string; readonly back: string; readonly anchor: string };

/**
 * Keep a person's choice, and say where to send them. A key off the list, a choice that is not yes, no or auto, or an
 * address that is not one of those pages is refused, and nothing is written.
 */
export function keepSectionChoice(
  d: { db: Db; audit: AuditLog; now: () => string }, actor: Actor, c: SectionChoice,
): { ok: true; to: string } | { ok: false } {
  if (!SECTION_KEYS.includes(c.section) || !['yes', 'no', 'auto'].includes(c.open) || !BACK.test(c.back)) return { ok: false };
  const at = d.now();
  d.db.tx(() => {
    if (c.open === 'auto') d.db.run('DELETE FROM section_prefs WHERE user_id = ? AND section = ?', [actor.id, c.section]);
    else {
      d.db.run(
        'INSERT INTO section_prefs (user_id, section, open, updated_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT (user_id, section) DO UPDATE SET open = excluded.open, updated_at = excluded.updated_at',
        [actor.id, c.section, c.open === 'yes' ? 1 : 0, at],
      );
    }
    d.audit.append({
      at, kind: 'SECTION_PREFERENCE_SET', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'user', object_id: actor.id, detail: { section: c.section, open: c.open },
    });
  });
  return { ok: true, to: ANCHOR.test(c.anchor) ? `${c.back}#${c.anchor}` : c.back };
}
