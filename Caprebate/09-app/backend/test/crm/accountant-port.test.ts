/**
 * THE CRM'S PORT FOR THE ACCOUNTANT'S CONFIRMATIONS (src/modules/crm/accountant-port.ts; Phase 161l2). The claim page's
 * block of the accountant's confirmations and the Reports gate's "the claim fits the return" need are the portal's
 * (src/modules/portal/accountant-confirm.ts and its pages), above the CRM; the portal hands both in as its door loads.
 * Asked before that, the port refuses loudly; after, the parts are the portal's own functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountantConfirmations } from '../../src/modules/crm/accountant-port.ts';

test('asked before the portal has loaded, the port refuses and says what is missing', () => {
  assert.throws(() => accountantConfirmations(), /accountant's confirmations are not set up\. The portal sets them up when it loads/);
});

test('the portal\'s door fills it with its own two functions', async () => {
  const need = await import('../../src/modules/portal/accountant-confirm.ts');
  const pages = await import('../../src/modules/portal/accountant-confirm-pages.ts');
  await import('../../src/modules/portal/index.ts');
  const p = accountantConfirmations();
  assert.equal(p.accountantFitNeed, need.accountantFitNeed);
  assert.equal(p.accountantConfirmBlock, pages.accountantConfirmBlock);
});
