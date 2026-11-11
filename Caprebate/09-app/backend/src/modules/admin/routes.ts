/**
 * ADMIN'S ADDRESSES THE STAFF PAGES ASK: Settings' page of tiles, every outside service on one page, the rules in force,
 * the admin settings screen, and the people (the roles a super admin makes, users, saved keys and the addresses we
 * cannot email). The staff pages' dispatch (src/app/staff.ts) asks each function at the point where its addresses have
 * always been matched, so the order in which every address is tried is unchanged (Phase 162; Settings' tiles, the users,
 * the keys and the stopped addresses sat in the staff pages, the others were asked there through their own handlers,
 * which they still are: src/modules/admin/connections.ts, rules-page.ts, configuration-pages.ts, role-editor-pages.ts).
 * Each answers 'handled', or undefined for an address that is not its own.
 */
import { clearPhoto, html, issueTemporaryPassword, opens, photoFor, redirect, resetTwoFactor, temporaryPassword, temporaryUntil, type StaffRequest, type WebResult } from '../../core/index.ts';
import { page } from '../../shared/index.ts';
import { settingsBody, settingsTiles } from './admin-tiles.ts';
import { handleConfiguration } from './configuration-pages.ts';
import { handleConnections } from './connections.ts';
import { handleRoleEditor, madeRoleChoices } from './role-editor-pages.ts';
import { handleRulesPage } from './rules-page.ts';
import { saveKey } from './saved-keys.ts';
import * as S from './settings.ts';
import { roleName, stoppedAddressesPage, temporaryPasswordPage, usersPage } from './users-pages.ts';

const mine = (r: WebResult): WebResult | undefined => (r === 'handled' ? 'handled' : undefined);

/** Settings, one page of tiles (Admin). */
export async function adminSettingsTiles(w: StaffRequest): Promise<WebResult | undefined> {
  const { res, path, method, actor, nav } = w;
  if (path === '/staff/admin' && method === 'GET') {
    const tiles = settingsTiles(actor, opens);
    html(res, 200, page({ title: 'Settings', nav: nav(actor), wide: true, body: settingsBody(tiles) })); return 'handled';
  }
  return undefined;
}

/** Every outside service on one page, and the care regulators' lists (Admin). */
export async function adminConnections(w: StaffRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, method, actor, body, nav, problem } = w;
  return mine(await handleConnections({ app: d.app, nav, problem }, req, res, url, method, actor, body));
}

/** Every rule in force, its version and who approves it, read only (Admin; Phase 161m). */
export async function adminRulesPage(w: StaffRequest): Promise<WebResult | undefined> {
  const { req, res, url, method, actor, nav, problem } = w;
  return mine(await handleRulesPage({ nav, problem }, req, res, url, method, actor));
}

/** The admin settings screen (CRM 9 of 10). */
export async function adminConfiguration(w: StaffRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, method, actor, form, nav, problem } = w;
  return mine(await handleConfiguration({ app: d.app, newId: d.newId, nav, problem }, req, res, url, method, actor, form));
}

/** The people: the roles a super admin makes, users, an API key saved sealed, and the addresses we cannot email. */
export async function adminPeopleAndKeys(w: StaffRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, actor, form, nav, problem } = w;
  const db = d.app.db;
  const now = d.app.now;

  /* ------------------------------------------------ · SUPER ADMIN ONLY · the roles they make */
  const roles = await handleRoleEditor({ app: d.app, nav, problem }, req, res, url, method, actor, form);
  if (roles === 'handled') return 'handled';

  /* ------------------------------------------------ ADMIN ONLY · users */
  if (path === '/staff/users' && method === 'GET') {
    html(res, 200, usersPage(actor, S.staffList(db, actor), undefined, madeRoleChoices(d.app, actor), url.searchParams.get('add') === '1')); return 'handled';
  }

  if (path === '/staff/users/create' && method === 'POST') {
    const f = await form(req);
    /* The system makes a TEMPORARY password, shown once, here, to hand over. The
       person chooses their own at their first sign-in, and sets up their second step. Nobody types a password here. */
    const password = temporaryPassword();
    const until = temporaryUntil(now());
    let created;
    try {
      created = await S.createStaffUser(
        { db, audit: d.app.audit, now, hash: (p) => d.app.hasher.hash(p) },
        actor,
        {
          email: f.get('email') ?? '', display_name: f.get('display_name') ?? '',
          role: f.get('role') ?? '', password, temporary_until: until,
          business_id: f.get('business_id'),
        },
      );
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not created', e.message, '/staff/users', e.field);
      throw e;
    }
    html(res, 200, temporaryPasswordPage(actor, created.display_name, created.email, roleName(created.role), password, until, true)); return 'handled';
  }

  /* The super user gives somebody a new temporary password (a forgotten one, or none to hand), or clears
     their second step (a lost phone). Either ends their sessions. */
  const tempMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/temporary-password$/.exec(path);
  if (tempMatch && method === 'POST') {
    const r = await issueTemporaryPassword(d.app, actor, tempMatch[1] ?? '');
    html(res, 200, temporaryPasswordPage(actor, r.user.display_name, r.user.email, roleName(r.user.role), r.password, r.until, false)); return 'handled';
  }
  const mfaMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/reset-two-factor$/.exec(path);
  if (mfaMatch && method === 'POST') {
    resetTwoFactor(d.app, actor, mfaMatch[1] ?? '');
    redirect(res, '/staff/users?done=two-factor'); return 'handled';
  }

  const roleMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/role$/.exec(path);
  if (roleMatch && method === 'POST') {
    const f = await form(req);
    try {
      S.assignRole(d.app.deps, actor, roleMatch[1] ?? '', f.get('role') ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not changed', e.message, '/staff/users');
      throw e;
    }
    redirect(res, '/staff/users?done=role'); return 'handled';
  }

  const disableMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/disable$/.exec(path);
  if (disableMatch && method === 'POST') {
    // "Archive" on Home's Admin tab posts here too, and goes back there.
    const fromHome = (await form(req)).get('back') === '/staff?view=admin';
    try {
      S.disableUser(d.app.deps, actor, disableMatch[1] ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not disabled', e.message, '/staff/users');
      throw e;
    }
    /* A leaver's photo is deleted when their account is disabled
       — the row and the file, by the same clearPhoto a person uses on their own, which fails rather than report a file
       gone that is still on disk. Only once the account is disabled: a refused disable deletes nothing. */
    const hadPhoto = photoFor(db, disableMatch[1] ?? '') !== undefined;
    await clearPhoto({ db, store: d.store }, disableMatch[1] ?? '');
    if (hadPhoto) {
      d.app.audit.append({
        at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'user', object_id: disableMatch[1] ?? '', detail: { photo_deleted: true, because: 'ACCOUNT_DISABLED' },
      });
    }
    redirect(res, fromHome ? '/staff?view=admin&done=archived#people' : '/staff/users?done=disabled'); return 'handled';
  }

  /* ------------------------------------------ · Admin saves an API key, sealed (src/core/saved-keys.ts) */
  const keyMatch = /^\/staff\/keys\/([A-Z0-9_]{1,64})(\/unsave)?$/.exec(path);
  if (keyMatch && method === 'POST') {
    const f = await form(req);
    const unsave = keyMatch[2] !== undefined;
    const r = await saveKey(d.app, actor, keyMatch[1] ?? '', unsave ? null : (f.get('value') ?? ''), f.get('password') ?? '');
    if (!r.ok) return problem(res, actor, 'Not saved', r.why, '/staff?view=admin#keys');
    redirect(res, `/staff?view=admin&done=${unsave ? 'key-unsaved' : 'key-saved'}#key-${keyMatch[1] ?? ''}`); return 'handled';
  }

  /* ---------------------------------- · addresses we cannot email */
  if (path === '/staff/email-addresses' && method === 'GET') {
    html(res, 200, stoppedAddressesPage(actor, S.stoppedAddresses(db, actor), url.searchParams.get('done') ?? undefined));
    return 'handled';
  }
  if (path === '/staff/email-addresses/lift' && method === 'POST') {
    const f = await form(req);
    const r = S.liftStoppedAddress({ db, audit: d.app.audit, now }, actor, f.get('address') ?? '');
    redirect(res, `/staff/email-addresses?done=${r.lifted ? 'lifted' : 'not-stopped'}`); return 'handled';
  }

  return undefined;
}
