/**
 * UI TIDY PHASE 15 — SETTINGS, 3 October 2026 (src/web/staff.ts usersPage, src/web/tasks-pages.ts, src/web/compliance-views.ts).
 * Users and roles: a header with its two buttons, four boxes, one table with each person's role as a label, their state
 * in colour and their role change folded in their own row; Add a user folded until asked for. Automation: four boxes,
 * the things no rule may do folded with their count, each rule's source in its second row. Email templates: Add a
 * template folded. Compliance: three boxes, one a register; the dated-value form folded.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as S from '../src/web/settings.ts';
import * as A from '../src/web/automation.ts';
import { userCounts, ADD_USER_HREF } from '../src/web/staff.ts';
import { distinctReasons } from '../src/web/tasks-pages.ts';
import { escapeHtml } from '../src/web/html.ts';

let H: Harness;
let off = '';
before(async () => {
  H = await startHarness('uit15');
  // One account turned off, so the page shows both states.
  off = H.made.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'READ_ONLY'")?.id ?? '';
  assert.equal((await H.post('admin', `/staff/users/${off}/disable`, {})).status, 303);
  // One automation rule retired, so Active and Retired count apart.
  H.made.app.db.run('UPDATE automation_rules SET active = 0 WHERE id = (SELECT id FROM automation_rules ORDER BY id LIMIT 1)');
});
after(() => H.close());

const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/<(?:li|a) class="kpi k-([a-z]+)"[^>]*><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);

describe('UI tidy phase 15: Users and roles', () => {
  test('the counts: staff and client logins that are on, those turned off, staff with no working hours', () => {
    const u = (role: string, disabled: boolean, working_periods: number) => ({ user: { role, disabled } as S.StaffRow['user'], working_periods });
    assert.deepEqual(userCounts([u('ADMIN', false, 5), u('SALES', false, 0), u('CLIENT', false, 0), u('SURVEYING', true, 0), u('CLIENT', true, 0)]),
      { staff: 2, clients: 1, off: 2, no_hours: 1 });
  });

  test('the header’s two buttons and four boxes from the same list', async () => {
    const rows = S.staffList(H.made.app.db, H.actor('admin'));
    const n = userCounts(rows);
    assert.equal(n.off, 1);
    const body = (await H.get('admin', '/staff/users')).body;
    assert.match(body, new RegExp(`<p><a class="btn" href="/staff/admin/roles">Make or change a role</a> <a class="btn btn-primary" href="${ADD_USER_HREF.replace('?', '\\?')}">Add a user</a></p>`));
    assert.deepEqual(kpis(body), [
      ['total', 'Staff', String(n.staff)], ['plain', 'Client logins', String(n.clients)],
      ['plain', 'Turned off', '1'], ['plain', 'Staff with no working hours', String(n.no_hours)],
    ]);
  });

  test('each person: name over username, role a label, state in colour; a role change folded in every row but one’s own and a turned-off one', async () => {
    const admin = H.actor('admin');
    const body = (await H.get('admin', '/staff/users')).body;
    for (const r of S.staffList(H.made.app.db, admin)) {
      const row = new RegExp(`<tr>\\s*<td>${r.user.display_name}<br><span class="help">${r.user.email}</span></td>[\\s\\S]*?</tr>`).exec(body)?.[0] ?? '';
      assert.ok(row !== '', r.user.email);
      assert.match(row, new RegExp(`<td data-label="Role"><span class="badge b-info">${r.user.role}</span></td>`));
      assert.match(row, r.user.disabled ? /<span class="badge b-late">Turned off<\/span>/ : /<span class="badge b-ok">Active<\/span>/);
      const fold = /<details class="formfold rolefold"><summary>Change role<\/summary>\s*<form method="post" action="\/staff\/users\/([^"]+)\/role">[\s\S]*?<select name="role">([\s\S]*?)<\/select>/.exec(row);
      assert.equal(fold !== null, !r.user.disabled && r.user.id !== admin.id, r.user.email);
      if (fold !== null) {
        assert.equal(fold[1], r.user.id);
        assert.match(fold[2] ?? '', new RegExp(`<option value="${r.user.role}" selected>`), 'the current role is chosen');
      }
    }
    assert.doesNotMatch(body, /Change somebody's role|class="opt"/);
  });

  test('Add a user is folded; its button, a link to it and a refusal open it', async () => {
    const tag = (body: string): string => /<details[^>]*id="create-user"[^>]*>/.exec(body)?.[0] ?? '';
    assert.equal(tag((await H.get('admin', '/staff/users')).body), '<details class="pblock recordlead" id="create-user">');
    assert.equal(tag((await H.get('admin', '/staff/users?add=1')).body), '<details class="pblock recordlead" id="create-user" open>');
    const refused = await H.post('admin', '/staff/users/create', { email: 'not an email', display_name: 'Kept Fifteen', role: 'SALES' });
    assert.equal(refused.status, 400);
    assert.match(tag(refused.body), /^<details open class="pblock recordlead" id="create-user">$/);
    assert.match(refused.body, /value="Kept Fifteen"/);
    assert.match(refused.body, /<select class="fi" id="new-user-role" name="role"><option value="">choose a role<\/option>/);
  });
});

describe('UI tidy phase 15: Automation and Email templates', () => {
  test('Automation: four boxes from the rules and their runs; what no rule may do, folded with its count, each said once', async () => {
    const p = A.rulesPage(H.made.app.db, H.actor('admin'));
    const body = (await H.get('admin', '/staff/automation')).body;
    assert.deepEqual(kpis(body), [
      ['total', 'Rules', String(p.rules.length)], ['paid', 'Active', String(p.rules.filter((r) => r.active).length)],
      ['plain', 'Retired', String(p.rules.filter((r) => !r.active).length)],
      [p.runs.some((r) => !r.ran) ? 'warn' : 'plain', 'Did not run', String(p.runs.filter((r) => !r.ran).length)],
    ]);
    const reasons = distinctReasons(p.forbidden);
    const fold = /<details class="morelist cantdo"><summary>What no rule may do <span class="count">(\d+)<\/span><\/summary>([\s\S]*?)<\/details>/.exec(body);
    assert.equal(fold?.[1], String(reasons.length));
    assert.equal((fold?.[2]?.match(/<li>/g) ?? []).length, reasons.length, 'a reason is said twice');
    assert.equal(p.rules.filter((r) => !r.active).length, 1);
    for (const why of reasons) assert.equal(body.split(`<li>${escapeHtml(why)}</li>`).length - 1, 1, why);
    assert.doesNotMatch(body, /<div class="gate"><strong>What no rule may do/);
  });

  test('Automation: each rule’s source sits in its second row with its Change; Add a rule opens from its button', async () => {
    const p = A.rulesPage(H.made.app.db, H.actor('admin'));
    const body = (await H.get('admin', '/staff/automation')).body;
    assert.match(body, /<thead><tr><th>Rule<\/th><th>When<\/th><th>Does<\/th><th>Goes to<\/th><th>Active<\/th><\/tr><\/thead>/);
    for (const r of p.rules) assert.ok(body.includes(`<tr class="rulefrom"><td colspan="5"><span class="help">Where it came from: ${escapeHtml(r.source)}</span>`), r.label);
    assert.equal((body.match(/<tr class="rulefrom">/g) ?? []).length, p.rules.length);
    assert.match(body, /<details class="formfold" id="add-rule"><summary>Add a rule<\/summary>/);
    assert.match((await H.get('admin', '/staff/automation?add=1')).body, /<details class="formfold" id="add-rule" open><summary>Add a rule<\/summary>/);
    assert.match(body, /<a class="btn btn-primary" href="\?add=1#add-rule">Add a rule<\/a>/);
  });

  test('Email templates: Add a template is folded until its button opens it', async () => {
    const body = (await H.get('admin', '/staff/templates')).body;
    assert.match(body, /<details class="pblock recordlead" id="add-template"><summary class="pnum">Add a template<\/summary><form method="post" action="\/staff\/templates">/);
    assert.match(body, /<a class="btn btn-primary" href="\?add=1#add-template">Add a template<\/a>/);
    assert.match((await H.get('admin', '/staff/templates?add=1')).body, /<details class="pblock recordlead" id="add-template" open>/);
  });
});

describe('UI tidy phase 15: Compliance', () => {
  test('three boxes, one a register, each a link; the dated-value form folded; the s.164A count kept', async () => {
    const body = (await H.get('admin', '/staff/compliance')).body;
    assert.deepEqual([...body.matchAll(/<a class="kpi k-([a-z]+)" href="([^"]+)"><span class="kpi-label">([^<]+)<\/span><span class="kpi-value">(\d+)<\/span>/g)].map((m) => [m[2], m[3], m[4]]), [
      ['/staff/compliance/rights', 'Rights requests', '0'], ['/staff/compliance/complaints', 'Complaints', '0'], ['/staff/compliance/breaches', 'Breaches', '0'],
    ]);
    assert.match(body, /<details class="formfold" id="record-setting"><summary>Record a new dated value<\/summary>\s*<form method="post" action="\/staff\/compliance\/settings"/);
    assert.match(body, /s\.164A complaints [^:]+: <strong>0<\/strong>/);
    assert.match(body, /<h3>Find a person<\/h3>/);
  });
});
