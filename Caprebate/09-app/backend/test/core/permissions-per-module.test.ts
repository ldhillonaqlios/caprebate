/**
 * PERMISSIONS PER MODULE (09-app/docs/ARCHITECTURE.md; src/core/authz.ts). Each module declares its own actions in its
 * actions.ts; the core puts them into the one table when the module loads; authorise() decides as it always did. The
 * rules themselves moved word for word, so every existing permission test is the proof that no decision changed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/modules/assessment/index.ts';
import '../../src/modules/claims/index.ts';
import '../../src/modules/survey/index.ts';
import '../../src/modules/finance/index.ts';
import '../../src/modules/compliance/index.ts';
import '../../src/modules/admin/index.ts';
import '../../src/modules/crm/index.ts';
import '../../src/modules/portal/index.ts';
import { REGISTERED_ACTIONS, actionOwner, registerActions, PREDICATES } from '../../src/core/authz.ts';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const MODULES = ['assessment', 'claims', 'survey', 'finance', 'compliance', 'admin', 'crm', 'portal'];

test('every module with permissions declares them in its own actions.ts, loaded first by its front door', () => {
  for (const m of MODULES) {
    assert.ok(existsSync(join(SRC, 'modules', m, 'actions.ts')), `${m} has no actions.ts`);
    const door = readFileSync(join(SRC, 'modules', m, 'index.ts'), 'utf8');
    const first = door.split('\n').find((l) => /^export |^import /.test(l)) ?? '';
    assert.match(first, /from '\.\/actions\.ts'/, `${m}'s front door does not load its permissions first`);
  }
});

test('the table, put together, holds the same 130 actions as the one table did, each declared by one area', () => {
  assert.equal(REGISTERED_ACTIONS.length, 130);
  assert.equal(new Set(REGISTERED_ACTIONS).size, 130);
  for (const a of REGISTERED_ACTIONS) assert.ok(actionOwner(a) !== undefined, a);
  const owners: Record<string, string> = { 'user.create': 'core', 'role.manage': 'core', 'lead.read': 'crm', 'claim.read': 'claims',
    'estimate.read': 'assessment', 'surveyor_job.commit': 'survey', 'invoice.raise': 'finance', 'compliance.read': 'compliance',
    'audit.read': 'compliance', 'configuration.write': 'admin', 'client_report.accept': 'portal' };
  for (const [a, area] of Object.entries(owners)) assert.equal(actionOwner(a), area, a);
});

test('a second module declaring an action another owns is refused', () => {
  assert.throws(() => registerActions('finance', { 'lead.read': { ADMIN: PREDICATES.always } }), /declared by crm and by finance/);
  assert.equal(actionOwner('lead.read'), 'crm');
});

test('the core\'s table names no module: the modules hand it their actions', () => {
  const text = readFileSync(join(SRC, 'core', 'authz.ts'), 'utf8');
  assert.doesNotMatch(text, /from '\.\.\/modules\//);
});
