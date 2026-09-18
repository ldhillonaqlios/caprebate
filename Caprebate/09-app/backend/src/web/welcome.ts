/**
 * THE WELCOME CARD — PHASE 133c, 17 September 2026 (B5).
 *
 * A person who has never seen the system is shown, on Home, the three jobs their login does most — taken from the
 * Phase 133a audit of each login's five most frequent jobs (04-phase-work/phase133a/ui-audit.md) — as buttons, until
 * they hide the card. Hiding it is stored on the user (migration 030) and audited; it never comes back.
 *
 * NOTHING HERE WIDENS WHAT A LOGIN MAY OPEN. Every button is an address that login's own menu already offers, and
 * test/phase133c.test.ts opens each one as that login and requires 200.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { Actor } from '../authz.ts';
import type { AppRole } from '../roles.ts';
import type { Job } from './components.ts';

/** Each login's three most frequent jobs (ui-audit.md, jobs 1 to 3 for each login). */
export const WELCOME_JOBS: Readonly<Record<AppRole, readonly Job[]>> = Object.freeze({
  SALES: [
    { href: '/staff/tasks', label: 'See what is due today' },
    { href: '/staff/leads', label: 'Record a lead’s enquiry checks' },
    { href: '/staff/pipeline', label: 'Move a claim to its next stage' },
  ],
  ACCOUNTING: [
    { href: '/staff/finance#to-invoice', label: 'Raise our fee' },
    { href: '/staff/finance#claim-invoices', label: 'Record that an invoice was sent' },
    { href: '/staff/finance#claim-invoices', label: 'Record money received' },
  ],
  SURVEYING: [
    { href: '/staff/survey', label: 'Open a survey job' },
    { href: '/staff/survey', label: 'Record room quantities' },
    { href: '/staff/survey', label: 'Commit your figures' },
  ],
  ADMIN: [
    { href: '/staff/users', label: 'Create a user or change a role' },
    { href: '/staff/admin-settings', label: 'Change an admin setting' },
    { href: '/staff/audit', label: 'Read the audit log' },
  ],
  READ_ONLY: [
    { href: '/staff/pipeline', label: 'See the pipeline' },
    { href: '/staff/claims', label: 'Open a claim' },
    { href: '/staff/dashboard', label: 'See the dashboard' },
  ],
  CLIENT: [
    { href: '/portal#waiting-on-you', label: 'See what we need from you' },
    { href: '/portal#documents', label: 'Send us a document' },
    { href: '/portal/letter', label: 'Read your engagement letter' },
  ],
});

/** Whether this person's card is still to be shown. A user row that cannot be found shows no card. */
export function welcomeShown(db: Db, actor: Actor): boolean {
  const r = db.get<{ welcome_dismissed_at: string | null }>('SELECT welcome_dismissed_at FROM users WHERE id = ?', [actor.id]);
  return r !== undefined && r.welcome_dismissed_at === null;
}

/** Hide the card for good. A second press changes nothing and writes nothing. */
export function dismissWelcome(d: { db: Db; audit: AuditLog; now: () => string }, actor: Actor): void {
  const at = d.now();
  d.db.tx(() => {
    const r = d.db.get<{ welcome_dismissed_at: string | null }>('SELECT welcome_dismissed_at FROM users WHERE id = ?', [actor.id]);
    if (r === undefined || r.welcome_dismissed_at !== null) return;
    d.db.run('UPDATE users SET welcome_dismissed_at = ? WHERE id = ? AND welcome_dismissed_at IS NULL', [at, actor.id]);
    d.audit.append({
      at, kind: 'WELCOME_DISMISSED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'user', object_id: actor.id, detail: {},
    });
  });
}
