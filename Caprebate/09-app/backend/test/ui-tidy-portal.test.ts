/**
 * UI TIDY PHASE 16 — THE CLIENT PORTAL, 3 October 2026 (src/web/router.ts portalPage, src/web/portal-dashboard.ts,
 * src/web/navigation.ts portalShell).
 * "Send us a message" four times becomes once, in the header, beside Book a call and a new Send us a document; the
 * questions and the documents asked for are drawn only when there is one (the "What we need from you" card already says
 * when nothing is); How to contact us moves to the end; the page's parts open out under Your claims.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';

let H: Harness;
let business = '';
before(async () => {
  H = await startHarness('uit16');
  business = H.made.app.db.get<{ b: string }>("SELECT business_id AS b FROM users WHERE email = 'client@example.invalid'")?.b ?? '';
  assert.notEqual(business, '');
});
after(() => H.close());

const nav = (body: string): string => /<nav class="appnav portalnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
const portal = async (): Promise<string> => (await H.get('client', '/portal')).body;

describe('UI tidy phase 16: the portal’s header and menu', () => {
  test('the header offers a message, a call and a document; "Send us a message" is said once on the page', async () => {
    const body = await portal();
    assert.match(body, /<p><a class="btn btn-primary" href="\/portal\/messages">Send us a message<\/a> <a class="btn" href="#appointment">Book a call<\/a> <a class="btn" href="#documents">Send us a document<\/a><\/p><\/header>/);
    assert.equal(body.split('>Send us a message<').length - 1, 1);
  });

  test('Your claims opens out to the page’s parts, and every part it names is on the page', async () => {
    const body = await portal();
    const items = [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav(body))?.[1] ?? '').matchAll(/<a href="#([a-z-]+)">([^<]+?)(?: <span class="subnote">\d+<\/span>)?<\/a>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(items, [
      ['where-you-are', 'Where your claim is'], ['waiting-on-you', 'What we need from you'], ['done-so-far', 'What we have done'],
      ['your-range', 'The figure you were shown'], ['letter', 'Your engagement letter'], ['appointment', 'Your appointment'],
      ['documents', 'Documents'], ['contact-us', 'How to contact us'],
    ]);
    for (const [id] of items) assert.equal((body.match(new RegExp(`id="${id ?? ''}"`, 'g')) ?? []).length, 1, id ?? '');
  });

  test('How to contact us comes after Documents and before Your account, its words unchanged', async () => {
    const body = await portal();
    const at = (id: string): number => body.indexOf(`id="${id}"`);
    assert.ok(at('documents') < at('contact-us') && at('contact-us') < at('account'));
    assert.match(body, /<h2>How to contact us<\/h2><\/div>\s*<p>Write to us under <a href="\/portal\/messages">Messages<\/a> — you can send a file there too/);
  });
});

describe('UI tidy phase 16: what we need from you, said once', () => {
  test('with nothing asked, the card says so and the two lists are not drawn', async () => {
    const body = await portal();
    assert.match(body, /<section class="pdash-card" id="waiting-on-you"[\s\S]*?Nothing at the moment\./);
    assert.doesNotMatch(body, /Questions we still need answered|Documents we have asked you for/);
    assert.doesNotMatch(body, /<section class="pdash-card" id="(next-call|new-for-you)"[^>]*>(?:(?!<\/section>)[\s\S])*Send us a message/);
  });

  test('a question asked brings its list back, with its form, and the menu counts it', async () => {
    const t = H.made.app.now();
    H.made.app.db.run(
      'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, sent_to_portal_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['ct-uit16', business, H.actor('sales').id, 'Who owns the building?', 'For the claim.', 'The survey.', 'OPEN', t, t],
    );
    const body = await portal();
    assert.match(body, /<section class="card" id="questions"><div class="card-h"><h2>Questions we still need answered<\/h2><\/div>[\s\S]*?id="question-ct-uit16"[\s\S]*?<form method="post" action="\/portal\/tasks\/ct-uit16">/);
    assert.match(nav(body), /<a href="#waiting-on-you">What we need from you <span class="subnote">1<\/span><\/a>/);
    assert.doesNotMatch(body, /Documents we have asked you for/, 'no document is asked for');
  });
});
