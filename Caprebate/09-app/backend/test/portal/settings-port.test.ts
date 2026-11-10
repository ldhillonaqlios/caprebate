/**
 * THE PORTAL'S ACCOUNT SETTINGS PORT (src/modules/portal/settings-port.ts; Phase 161l2). One settings implementation
 * serves both applications (handleSettings in src/app/staff.ts); the portal sits below the start-up wiring, so the back
 * office hands its portal mount in as it loads. Asked before that, it refuses loudly; after, it is the same function.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalSettings } from '../../src/modules/portal/settings-port.ts';

test('asked before the back office has loaded, the settings port refuses and says what is missing', () => {
  assert.throws(() => portalSettings(), /account settings are not set up\. The back office \(src\/app\/staff\.ts\) sets them up when it loads/);
});

test('the back office fills it with its own portal mount of the settings', async () => {
  const staff = await import('../../src/app/staff.ts');
  assert.equal(portalSettings(), staff.handlePortalSettings);
});
