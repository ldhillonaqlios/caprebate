/**
 * ADMIN'S USERS PAGES: the users and roles list, the temporary password shown once, and the addresses we cannot email.
 * Moved word for word from the staff pages (src/app/staff.ts) with their addresses (src/modules/admin/routes.ts,
 * Phase 162); the header is the back office's own (`staffShell`, which is what the staff pages' `nav` drew).
 */
import { APP_ROLES, TEMPORARY_PASSWORD_DAYS, customRoleOf, kpiRow, staffShell, type Actor } from '../../core/index.ts';
import { h, localStamp, localWhen, page, raw } from '../../shared/index.ts';
import type * as S from './settings.ts';

const nav = (actor: Actor) => staffShell(actor);
const stamp = (iso: string): string => localStamp(iso);

/**
 * ADDRESSES WE CANNOT EMAIL. Admin only.
 *
 * An address the mail server refused for good is stopped, and nothing more is sent to it. That was built
 * with no way back: `liftSuppression` existed and no screen called it. This is the screen.
 *
 * A LIFT IS A NEW ROW, not an edit. The bounce stays on record and so does the stop; the lift sits after them with
 * who pressed the button and when. Pressing it for an address that is not stopped is not an error and says so.
 */
export function stoppedAddressesPage(actor: Actor, rows: readonly S.StoppedAddress[], done: string | undefined): string {
  return page({
    title: 'Addresses we cannot email', nav: nav(actor), wide: true,
    body: h`
      <h1>Addresses we cannot email</h1>
      ${done === 'lifted' ? h`<p class="help">Done. We can email that address again.</p>`
        : done === 'not-stopped' ? h`<p class="help">That address was not stopped, so nothing changed.</p>` : raw('')}
      <p class="help">An email came back saying the address does not work, so we stopped sending to it.
      <strong>Check with the person first.</strong> If they tell you the address is right, or they give you a new
      one, press the button. Nothing is deleted: the bounce stays on record, and so does your lift.</p>
      ${rows.length === 0
        ? h`<p class="help">No addresses are stopped.</p>`
        : h`<table><thead><tr><th>Address</th><th>Stopped</th><th>Code</th><th>The email</th><th></th></tr></thead>
          <tbody>${rows.map((r) => h`<tr>
            <td>${r.address}</td><td class="when">${stamp(r.at)}</td><td>${r.status}</td>
            <td>${r.subject ?? 'not recorded'}</td>
            <td><form method="post" action="/staff/email-addresses/lift" class="inline">
              <input type="hidden" name="address" value="${r.address}">
              <button class="linkish" type="submit">This address works again</button></form></td>
          </tr>`)}</tbody></table>`}
      <p><a href="/staff/settings">Back to your account</a></p>`,
  });
}

/** A role as a person reads it: a built-in role's own word, or the name the super admin gave a made one. */
export function roleName(role: string): string {
  return customRoleOf(role)?.name ?? role;
}

/** The temporary password, shown ONCE, to be handed over by the super user. Never stored in clear. */
export function temporaryPasswordPage(actor: Actor, name: string, email: string, role: string, password: string, until: string, isNew: boolean): string {
  return page({
    title: 'Temporary password', nav: nav(actor),
    body: h`
      <h1>${isNew ? `${name}’s account is ready` : `A new temporary password for ${name}`}</h1>
      <p>Give ${name} these sign-in details yourself — in person or by telephone, not by email.</p>
      <table><tbody>
        <tr><th>Username</th><td><code>${email}</code></td></tr>
        <tr><th>Temporary password</th><td><strong><code id="temporary-password">${password}</code></strong></td></tr>
        <tr><th>Role</th><td>${role}</td></tr>
        <tr><th>Works until</th><td>${localWhen(until)}</td></tr>
      </tbody></table>
      <div class="gate"><strong>This password is shown once.</strong> We do not keep it, so it cannot be shown again. If it
      is lost, give a new temporary password from the Users page.</div>
      <p class="help">When ${name} first signs in, they choose their own password${role === 'CLIENT' ? '' : ' and set up their second step: an authenticator app or an email code'}.</p>
      <p><a href="/staff/users">Back to users</a></p>`,
  });
}

/** Where Add a user lands — the form, opened. Home's "Add a person" card links here too. */
export const ADD_USER_HREF = '/staff/users?add=1#create-user';

/** The counts over the users list. "Staff" leaves out client logins; turned off accounts count apart. */
export function userCounts(rows: readonly Pick<S.StaffRow, 'user' | 'working_periods'>[]): {
  staff: number; clients: number; off: number; no_hours: number;
} {
  const on = rows.filter((r) => !r.user.disabled);
  const staff = on.filter((r) => r.user.role !== 'CLIENT');
  return {
    staff: staff.length, clients: on.length - staff.length, off: rows.length - on.length,
    no_hours: staff.filter((r) => r.working_periods === 0).length,
  };
}

/**
 * USERS AND ROLES. Was 5,000 px: a block of six role buttons for every person, then
 * the create form. Now: a header with Make or change a role and Add a user, four boxes, and one table that stacks on a
 * phone — each person's name over their username, their role as a label, Active in green or Turned off in red, and their
 * actions: the three that were there, and Change role, folded in their own row, a list of the roles instead of six
 * buttons. Add a user is folded until its button, a link to it, or a refusal opens it. Nobody's own row offers a role.
 */
export function usersPage(actor: Actor, rows: readonly S.StaffRow[], error: string | undefined,
  made: readonly { key: string; name: string }[] = [], adding = false): string {
  // The roles the super admin made are offered beside the built-in ones, by their own names.
  const staffOnly = made.map((m) => ({ value: m.key, label: m.name }));
  const all = [...APP_ROLES.map((r) => ({ value: r as string, label: r as string })), ...staffOnly];
  const n = userCounts(rows);
  return page({
    title: 'Users and roles', nav: nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><h1>Users and roles</h1>
        <p class="lede">Add a user, change a role, or turn an account off.</p></div>
        <p><a class="btn" href="/staff/admin/roles">Make or change a role</a> <a class="btn btn-primary" href="${ADD_USER_HREF}">Add a user</a></p></div>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      ${kpiRow([
        { label: 'Staff', value: String(n.staff), tone: 'total' },
        { label: 'Client logins', value: String(n.clients), tone: 'plain' },
        { label: 'Turned off', value: String(n.off), tone: 'plain' },
        { label: 'Staff with no working hours', value: String(n.no_hours), tone: 'plain' },
      ])}
      <p class="help"><strong>You cannot change someone's name, username or photo.</strong> Only they can, from their
      own account. Changing a role signs that person out at once. They sign in again with the new role.</p>

      <div class="tablewrap"><table class="stack userlist"><thead><tr><th>Name</th><th>Role</th><th>Hours set</th><th>Photo</th><th>State</th><th></th></tr></thead>
      <tbody>${rows.map((r) => h`<tr>
        <td>${r.user.display_name}<br><span class="help">${r.user.email}</span></td>
        <td data-label="Role"><span class="badge b-info">${roleName(r.user.role)}</span></td>
        <td data-label="Hours set">${r.working_periods === 0 ? h`<span class="help">none</span>` : r.working_periods}</td>
        <td data-label="Photo">${r.has_photo ? 'yes' : 'no'}</td>
        <td data-label="State">${r.user.disabled ? h`<span class="badge b-late">Turned off</span>` : h`<span class="badge b-ok">Active</span>`}</td>
        <td>${r.user.disabled ? raw('') : h`
          <form method="post" action="/staff/users/${r.user.id}/disable" class="inline">
            <button class="linkish" type="submit">Disable</button></form>
          <form method="post" action="/staff/users/${r.user.id}/temporary-password" class="inline">
            <button class="linkish" type="submit">New temporary password</button></form>
          <form method="post" action="/staff/users/${r.user.id}/reset-two-factor" class="inline">
            <button class="linkish" type="submit">Reset second step</button></form>
          ${r.user.id === actor.id ? raw('') : h`<details class="formfold rolefold"><summary>Change role</summary>
            <form method="post" action="/staff/users/${r.user.id}/role">
              <label>New role for ${r.user.display_name} <select name="role">${all.map((role) => h`
                <option value="${role.value}"${role.value === r.user.role ? raw(' selected') : raw('')}>${role.label}</option>`)}</select></label>
              <button type="submit">Assign</button></form></details>`}`}</td>
      </tr>`)}</tbody></table></div>

      <details class="pblock recordlead" id="create-user"${adding ? raw(' open') : raw('')}><summary class="pnum">Add a user</summary>
      <form method="post" action="/staff/users/create">
        <label class="fl" for="new-user-email">Username — an email address</label>
        <input class="fi" id="new-user-email" name="email" required>
        <label class="fl" for="new-user-display-name">Display name</label>
        <input class="fi" id="new-user-display-name" name="display_name" required>
        <label class="fl" for="new-user-role">Role</label>
        <select class="fi" id="new-user-role" name="role"><option value="">choose a role</option>${all.map((role) => h`
          <option value="${role.value}">${role.label}</option>`)}</select>
        <label class="fl" for="new-user-business">Business — for a CLIENT account only</label>
        <input class="fi" id="new-user-business" name="business_id" placeholder="leave empty for a staff account">
        <button class="cta" type="submit">Create</button>
      </form>
      <p class="help">We make a temporary password for the new person and show it to you once. Give it to them
      yourself, not by email. It works for ${TEMPORARY_PASSWORD_DAYS} days. When they first sign in, they choose their own
      password and set up their second step.</p></details>
      <p><a href="/staff/settings">Back to settings</a></p>`,
  });
}
