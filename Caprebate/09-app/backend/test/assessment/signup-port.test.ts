/**
 * THE ASSESSMENT'S SIGN-UP PORTS (src/modules/assessment/signup-port.ts; Phase 161l2). The assessment offers a client
 * their own login at its end, but the login is the portal's and the terms' tick is compliance's, both above it. Each
 * hands its part in as its front door loads. Until then, asking refuses loudly; once the doors have loaded, the parts
 * are the portal's and compliance's own functions, unchanged. The router shell lends nothing any more.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signupParts, termsParts } from '../../src/modules/assessment/signup-port.ts';

const SRC = join(import.meta.dirname, '..', '..', 'src');

test('asked before the portal and compliance have loaded, each port refuses and says what is missing', () => {
  assert.throws(() => signupParts(), /client sign-up is not set up\. The portal sets it up when it loads/);
  assert.throws(() => termsParts(), /terms a client agrees to are not set up\. Compliance sets them up when it loads/);
});

test('the portal\'s and compliance\'s doors fill them with their own functions', async () => {
  const portal = await import('../../src/modules/portal/signup.ts');
  const compliance = await import('../../src/modules/compliance/legal-approvals.ts');
  await import('../../src/modules/portal/index.ts');
  await import('../../src/modules/compliance/index.ts');
  const s = signupParts();
  assert.equal(s.offerSignup, portal.offerSignup);
  assert.equal(s.requestSignup, portal.requestSignup);
  assert.equal(s.verifyOpen, portal.verifyOpen);
  assert.equal(s.confirmSignup, portal.confirmSignup);
  assert.equal(s.MIN_PASSWORD, portal.MIN_PASSWORD);
  const t = termsParts();
  assert.equal(t.currentTermsVersions, compliance.currentTermsVersions);
  assert.equal(t.agreementTick, compliance.agreementTick);
});

test('the router shell lends nothing: no lendShellParts, no shellParts', () => {
  for (const f of ['core/http.ts', 'core/index.ts', 'app/router.ts', 'modules/assessment/routes.ts', 'modules/portal/routes.ts', 'modules/public-site/routes.ts']) {
    assert.doesNotMatch(readFileSync(join(SRC, f), 'utf8'), /lendShellParts|shellParts\(/, f);
  }
});
