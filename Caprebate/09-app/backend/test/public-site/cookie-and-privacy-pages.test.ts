/**
 * PHASE 161g — THE LEGAL PAGES READY FOR THE LIVE WEBSITE, 5 November 2026.
 *
 * 1. ONE cookie choice, and Google Analytics only after a click (src/integrations/analytics.ts sitePageFor; the site page's
 *    SITE_CONSENT; src/modules/public-site/legal-pages.ts).
 * 2. The cookie list is tested, not typed: every cookie the app can set and every storage key a page it serves writes.
 * 3. The privacy policy, with every outside service tied to SECRET_KEYS (src/integrations/outside-services.ts).
 * 4. The client's portal terms, the links, and the sign-up's tick kept with its versions (src/web/legal-approvals.ts).
 * 5. The `legal` setting: every page a Draft until both approvals are recorded; with it off, nothing changes.
 *
 * Each of these fails on the code before Phase 161g: the old router gave the site page its measurement id with no
 * answer at all, the old SITE_CONSENT trusted an earlier visit's kept "accepted", COOKIE_LIST, OUTSIDE_SERVICES, the
 * two new pages, the tick, the approvals and the `legal` setting did not exist.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import type { IncomingMessage } from 'node:http';
import { createApp, legalPagesSetting } from '../../src/core/server.ts';
import { seed } from '../../src/core/seed.ts';
import { SECRET_KEYS } from '../../src/core/secrets.ts';
import { OUTSIDE_SERVICES, TRANSFER_TO_CONFIRM } from '../../src/integrations/outside-services.ts';
import { sitePageFor } from '../../src/integrations/analytics.ts';
import { siteEdition, SITE_PAGE_CSP } from '../../src/modules/public-site/public-site.ts';
import {
  CONSENT_COOKIE, CONSENT_MAX_AGE, COOKIE_LIST, LEGAL_GAPS, LEGAL_PAGES, cookieBanner, legalPageHtml, optionalAllowed, versionOf,
} from '../../src/modules/public-site/legal-pages.ts';
import { currentApprovals, currentTermsVersions, hasAgreedCurrent } from '../../src/web/legal-approvals.ts';
import { offerSignup, requestSignup, confirmSignup } from '../../src/core/signup.ts';
import { STEP_TTL_MS } from '../../src/core/sign-in.ts';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const SITE_DIR = join(import.meta.dirname, '..', '..', '..', 'site');

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string; headers: Headers };
async function listen(m: Made): Promise<string> {
  await new Promise<void>((r) => m.server.listen(0, '127.0.0.1', () => r()));
  const a = m.server.address();
  return `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
}
const get = async (base: string, path: string, cookie = ''): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
  return { status: x.status, body: await x.text(), headers: x.headers };
};
const post = async (base: string, path: string, body: Record<string, string>, cookie = ''): Promise<Res> => {
  const x = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  return { status: x.status, body: await x.text(), headers: x.headers };
};
const cookieOf = (h: Headers): string => h.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const BANNER = /<section class="cookie-banner" aria-label="Cookies">/;
const DRAFT = /<p class="draft-note" role="note"><strong>Draft\.<\/strong>/;

let live: Made; let testSite: Made; let plain: Made;
let baseLive = ''; let baseTest = ''; let basePlain = '';
let password = '';

before(async () => {
  live = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161g-live-')), legal: true });
  testSite = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161g-test-')), testNotices: true });
  plain = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161g-plain-')) });
  baseLive = await listen(live); baseTest = await listen(testSite); basePlain = await listen(plain);
  password = (await seed(live.app.db, live.app.hasher, live.app.now)).password;
  await seed(testSite.app.db, testSite.app.hasher, testSite.app.now);
  await seed(plain.app.db, plain.app.hasher, plain.app.now);
});
after(() => { live.close(); testSite.close(); plain.close(); });

async function signIn(base: string, email: string): Promise<string> {
  const r = await post(base, '/login', { email, password });
  return cookieOf(r.headers);
}

/* ======================================================================== 1 */
describe('Phase 161g item 1: one cookie choice, and Google Analytics only after a click', () => {
  const site = siteEdition();
  /** The served page's own script, run with a page faked far enough: its two meta tags, its path, storage, cookies. */
  function runPage(html: string, store: Record<string, string> = {}, path = '/'): { scripts: string[]; writes: string[] } {
    const js = site!.js;
    const a = js.indexOf('var CB_TRACK = (function(){');
    const b = js.indexOf('/* ===== end SITE_CONSENT ===== */');
    assert.ok(a >= 0 && b > a, 'the site script has no CB_TRACK and SITE_CONSENT');
    const meta = (name: string) => new RegExp(`<meta name="${name}" content="([^"]*)">`).exec(html)?.[1] ?? '';
    const scripts: string[] = []; const writes: string[] = [];
    const doc = {
      cookie: '',
      querySelector: (sel: string) => {
        const m = /meta\[name="([^"]+)"\]/.exec(sel);
        return m === null ? null : { getAttribute: () => meta(m[1] ?? '') };
      },
      querySelectorAll: () => [], getElementById: () => null,
      createElement: (t: string) => { const el = { tag: t, src: '' }; return new Proxy(el, { set(o, k, v) { (o as Record<string, unknown>)[k as string] = v; if (k === 'src') scripts.push(String(v)); return true; } }); },
      head: { appendChild: () => undefined },
    };
    const ctx = vm.createContext({ document: doc, window: {}, location: { pathname: path, hostname: 'caprebate.co.uk' }, console,
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { writes.push(k); store[k] = v; }, removeItem: (k: string) => { delete store[k]; } } });
    vm.runInContext(js.slice(a, b), ctx);
    return { scripts, writes };
  }
  const google = (s: string) => /google/i.test(s);

  test('with no answer: the page carries no id, its policy names no Google address, and its script loads nothing', () => {
    assert.ok(site !== undefined, 'the site file is not beside the build');
    const out = sitePageFor(site.html, SITE_PAGE_CSP, 'G-TEST1234', false);
    assert.equal(out.csp, null);
    assert.match(out.html, /<meta name="cb-ga4-measurement-id" content="">/);
    assert.match(out.html, /<meta name="cb-cookie-choice" content="">/);
    assert.ok(!google(SITE_PAGE_CSP), 'the ordinary policy names Google');
    assert.deepEqual(runPage(out.html).scripts, []);
  });

  test('an earlier visit with no answer, or an older version\'s kept "accepted", is never a yes, and nothing is written to the browser', () => {
    const store = { cb_analytics_choice_v1: 'accepted' };
    const r = runPage(sitePageFor(site!.html, SITE_PAGE_CSP, 'G-TEST1234', false).html, store);
    assert.deepEqual(r.scripts, []);
    assert.deepEqual(r.writes, []);
    assert.equal('cb_analytics_choice_v1' in store, false, 'the old note was not removed');
  });

  test('a click on "Reject non-essential" loads nothing; a click on "Accept all" loads exactly one Google tag', async () => {
    for (const [choice, loads] of [['essential', false], ['all', true]] as const) {
      const click = await post(baseTest, '/cookies/choice', { choice, back: '/' });
      assert.equal(click.status, 303);
      const jar = cookieOf(click.headers);
      const accepted = optionalAllowed({ headers: { cookie: jar } } as IncomingMessage, (_r, name) => new RegExp(`${name}=([^;]*)`).exec(jar)?.[1]);
      assert.equal(accepted, loads, choice);
      const out = sitePageFor(site!.html, SITE_PAGE_CSP, 'G-TEST1234', accepted);
      const ran = runPage(out.html);
      if (loads) {
        assert.equal(ran.scripts.length, 1);
        assert.match(ran.scripts[0] ?? '', /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-TEST1234$/);
        assert.match(out.csp ?? '', /googletagmanager/);
        assert.match(out.html, /<meta name="cb-cookie-choice" content="all">/);
      } else {
        assert.deepEqual(ran.scripts, []);
        assert.equal(out.csp, null);
      }
    }
  });

  test('even after "Accept all", nothing loads while Analytics is switched off (no id), or on a page after the engagement', () => {
    assert.deepEqual(runPage(sitePageFor(site!.html, SITE_PAGE_CSP, null, true).html).scripts, []);
    assert.equal(sitePageFor(site!.html, SITE_PAGE_CSP, null, true).csp, null);
    assert.deepEqual(runPage(sitePageFor(site!.html, SITE_PAGE_CSP, 'G-TEST1234', true).html, {}, '/portal/letter').scripts, []);
  });

  test('the site page asks no question of its own: one choice, the banner; Cookie settings goes to the cookie policy', () => {
    assert.doesNotMatch(site!.html, /data-consent=|id="cbConsent"/);
    assert.match(site!.html, /<a class="foot-cookies" href="\/cookies\/#choice">Cookie settings<\/a>/);
  });

  test('"Reject" is as easy as "Accept": the same button, side by side, on the banner and on the cookie policy page', () => {
    const both = /<button type="submit" name="choice" value="all" class="cookie-btn">Accept all<\/button>\s*<button type="submit" name="choice" value="essential" class="cookie-btn">Reject non-essential<\/button>/;
    assert.match(cookieBanner('/'), both);
    assert.match(legalPageHtml('/cookies/', null) ?? '', both);
    assert.match(legalPageHtml('/cookies/', null) ?? '', /You have not answered yet, so the answer is no\./);
    assert.match(cookieBanner('/', true), /Nothing of Google’s loads unless you press “Accept all”\./);
  });
});

/* ======================================================================== 2 */
/** Every cookie name the app can set, and every storage key a page it serves writes, read from the code itself. */
export function collectStorageNames(files: readonly { name: string; text: string }[], servedPages: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const f of files) {
    for (const m of f.text.matchAll(/\bconst [A-Z_]*COOKIE[A-Z_]*\s*=\s*'([^']+)'/g)) names.add(m[1] ?? '');
    for (const line of f.text.split('\n')) {
      if (!/set-cookie/i.test(line)) continue;
      for (const m of line.matchAll(/[`'"]([a-z][a-z0-9_]*)=/g)) names.add(m[1] ?? '');
    }
    for (const m of f.text.matchAll(/indexedDB\.open\('([^']+)'/g)) names.add(m[1] ?? '');
    for (const m of f.text.matchAll(/(?:local|session)Storage\.setItem\('([^']+)'/g)) names.add(m[1] ?? '');
  }
  for (const page of servedPages) {
    for (const m of page.matchAll(/(?:local|session)Storage\.setItem\(\s*["']([^"']+)["']/g)) names.add(m[1] ?? '');
    for (const m of page.matchAll(/indexedDB\.open\(\s*["']([^"']+)["']/g)) names.add(m[1] ?? '');
    // a key held in a variable: var KEY = "x"; ... localStorage.setItem(KEY
    for (const m of page.matchAll(/(?:local|session)Storage\.setItem\(\s*([A-Za-z_$][\w$]*)/g)) {
      const v = new RegExp(`\\b${m[1]}\\s*=\\s*["']([^"']+)["']`).exec(page);
      if (v !== null) names.add(v[1] ?? '');
    }
    // Google's tag sets its own cookies when the page can load it
    if (/googletagmanager\.com\/gtag\/js/.test(page)) { names.add('_ga'); names.add('_ga_<id>'); }
  }
  names.delete('');
  return names;
}
function tsFiles(dir: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (n.endsWith('.ts')) out.push({ name: p, text: readFileSync(p, 'utf8') });
  }
  return out;
}
function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (n.endsWith('.html')) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}

describe('Phase 161g item 2: the cookie list is tested, not typed', () => {
  const found = collectStorageNames(tsFiles(SRC), [...htmlFiles(SITE_DIR), siteEdition()?.js ?? '', siteEdition()?.html ?? '']);
  const listed = new Set(COOKIE_LIST.map((c) => c.name));

  test('every cookie and storage key the code can set is in the cookie policy, with what it does and how long it lasts', () => {
    for (const n of found) assert.ok(listed.has(n), `${n} is set by the code but not in the cookie policy (COOKIE_LIST)`);
    const page = legalPageHtml('/cookies/', null) ?? '';
    for (const c of COOKIE_LIST) {
      assert.ok(c.why.length > 10 && c.howLong.length > 1 && c.where.length > 1, c.name);
      assert.ok(page.includes(`<code>${c.name.replace('<', '&lt;').replace('>', '&gt;')}</code>`), `${c.name} is not on the page`);
    }
  });

  test('the policy has no line for a cookie that no longer exists', () => {
    for (const n of listed) assert.ok(found.has(n), `the cookie policy lists ${n}, which nothing sets any more`);
  });

  test('how long each lasts is what the code says', () => {
    const line = (n: string) => COOKIE_LIST.find((c) => c.name === n)!.howLong;
    assert.equal(CONSENT_MAX_AGE, 365 * 24 * 60 * 60); assert.equal(line(CONSENT_COOKIE), '12 months');
    assert.equal(STEP_TTL_MS, 15 * 60 * 1000); assert.equal(line('cb_step'), '15 minutes');
    assert.match(readFileSync(join(SRC, 'core', 'auth.ts'), 'utf8'), /const SESSION_TTL_MS = 8 \* 60 \* 60 \* 1000;/); assert.match(line('cb_session'), /^Up to 8 hours/);
    assert.match(readFileSync(join(SRC, 'core', 'router.ts'), 'utf8'), /setCookie\(res, DRAFT_COOKIE, draft\.token, 60 \* 60 \* 6\)/); assert.equal(line('cb_draft'), '6 hours');
  });

  test('the collector itself fails a new cookie and a new storage key (a planted fault)', () => {
    const planted = collectStorageNames([{ name: 'x.ts', text: "res.setHeader('set-cookie', `cb_new=1; Path=/`);\nconst NEW_COOKIE = 'cb_other';" }], ['<script>localStorage.setItem("planted_key", "1")</script>']);
    for (const n of ['cb_new', 'cb_other', 'planted_key']) assert.ok(planted.has(n) && !listed.has(n), n);
  });
});

/* ======================================================================== 3 */
describe('Phase 161g item 3: the privacy policy', () => {
  const policy = legalPageHtml('/privacy-policy/', null) ?? '';

  test('every owner in SECRET_KEYS has a line, and every line names an owner that exists', () => {
    const owners = new Set(SECRET_KEYS.map((k) => k.owner));
    const lined = new Set(OUTSIDE_SERVICES.map((s) => s.keyOwner).filter((o) => o !== null));
    for (const o of owners) assert.ok(lined.has(o), `${o} has keys but no line in OUTSIDE_SERVICES: add what is sent, why and where`);
    for (const o of lined) assert.ok(owners.has(o), `${o} is in OUTSIDE_SERVICES but owns no key`);
    assert.equal(lined.size, OUTSIDE_SERVICES.filter((s) => s.keyOwner !== null).length, 'an owner has two lines');
  });

  test('a place outside the UK, or not yet known, has its transfer basis as "to be confirmed by our DPO", never guessed', () => {
    for (const s of OUTSIDE_SERVICES) {
      assert.ok(s.sent.length > 5 && s.why.length > 3 && s.where.length > 3, s.name);
      if (s.outsideUk === false) assert.equal(s.transfer, null, s.name);
      else assert.equal(s.transfer, TRANSFER_TO_CONFIRM, s.name);
    }
  });

  test('the policy names every outside service that receives personal data, with what is sent, why and where', () => {
    for (const s of OUTSIDE_SERVICES.filter((x) => x.personalData)) {
      for (const part of [s.name, s.where]) assert.ok(policy.includes(part.replace(/&/g, '&amp;')), `${s.name}: ${part}`);
    }
    for (const n of ['Anthropic', 'Zoom', 'WhatsApp', 'IONOS', 'Google', 'Didit', 'Companies House', 'Our hosting company', 'Our database']) assert.ok(policy.includes(n), n);
  });

  test('who we are, as registered, and every gap marked, never made up', () => {
    assert.match(policy, /CAP REBATE LTD, trading as Cap Rebate/);
    assert.match(policy, /number\s+17307313/);
    for (const gap of ['Telephone', 'Our data protection officer', 'Our registration number with the Information Commissioner']) {
      assert.match(policy, new RegExp(`${gap}: <span class="gap">to be added</span>`), gap);
    }
    assert.ok(LEGAL_GAPS.some(([f]) => /data protection officer/.test(f)));
    assert.ok(LEGAL_GAPS.some(([f]) => /Information Commissioner/.test(f)));
    assert.ok(LEGAL_GAPS.some(([f]) => /telephone/i.test(f)));
  });

  test('the free lookups are legitimate interests, never consent; the only consent is the optional analytics', () => {
    assert.match(policy, /Give you a free estimate, and check public registers for it<\/td><td>Our legitimate interests/);
    assert.match(policy, /We do not ask for consent for this\./);
    assert.equal((policy.match(/Your consent/g) ?? []).length, 1);
    assert.match(policy, /Count visits with Google Analytics<\/td><td>Your consent/);
  });

  test('it has the retention schedule, rights, complaints (us, then the ICO), the cookie policy and a "last updated" date', () => {
    assert.match(policy, /<h2 id="keep">How long we keep it<\/h2>/);
    assert.match(policy, /Proposed\. Not yet approved by our data protection officer\./);
    for (const r of ['Access', 'Correction', 'Deletion', 'Restriction', 'Objection', 'Portability', 'Consent']) assert.match(policy, new RegExp(`<strong>${r}:</strong>`), r);
    assert.match(policy, /please tell us first/);
    assert.match(policy, /Information Commissioner at any time/);
    assert.match(policy, /0303 123 1113/);
    assert.match(policy, /href="\/cookies\/"/);
    assert.match(policy, /Last updated: 5 November 2026\./);
  });
});

/* ======================================================================== 4 */
describe('Phase 161g item 4: the client\'s terms, the links and the sign-up\'s tick', () => {
  test('the client portal terms cover what the portal is for, the login, uploads, misuse, the letter winning, and the law', () => {
    const t = legalPageHtml('/portal-terms/', null) ?? '';
    for (const part of ['What the portal is for', 'Your engagement letter comes first', 'Your login', 'What you upload', 'If the portal is misused', 'The law that applies']) {
      assert.match(t, new RegExp(`<h2>${part}</h2>`), part);
    }
    assert.match(t, /the engagement letter wins/);
    assert.match(t, /second step/);
    assert.match(t, /England and Wales/);
    assert.match(t, DRAFT);
  });

  test('the website terms are brought level: they link the privacy policy and the client portal terms', () => {
    const t = legalPageHtml('/terms/', null) ?? '';
    assert.match(t, /href="\/privacy-policy\/">privacy policy<\/a>/);
    assert.match(t, /href="\/portal-terms\/">client portal terms<\/a>/);
    assert.doesNotMatch(t, /href="\/notices\/#privacy"/);
  });

  test('every footer links the privacy policy and the client portal terms: the app\'s pages, the home page and the sector pages', async () => {
    const own = (await get(baseLive, '/login', `${CONSENT_COOKIE}=essential`)).body;
    assert.match(own, /<footer class="foot">[\s\S]*href="\/portal-terms\/"/);
    for (const f of ['home.html', ...readdirSync(join(SITE_DIR, 'capital-allowances')).map((x) => join('capital-allowances', x))]) {
      const nav = /<nav aria-label="Legal">([\s\S]*?)<\/nav>/.exec(readFileSync(join(SITE_DIR, f), 'utf8'))?.[1] ?? '';
      assert.ok(nav.includes('href="/privacy-policy/"') && nav.includes('href="/portal-terms/"'), f);
      assert.ok(!nav.includes('href="/notices/#privacy"'), f);
    }
  });

  test('the engagement letter signing screen links the three documents where the pages are served', () => {
    const router = readFileSync(join(SRC, 'core', 'router.ts'), 'utf8');
    assert.match(router, /\$\{legalLinks \? h`<p class="help">Please also read \$\{agreementLinks\(\)\}\./);
  });

  test('the sign-up asks for the tick where the pages are served, and refuses without it', async () => {
    const app = live.app;
    const business = app.db.get<{ id: string }>("SELECT id FROM businesses WHERE client_status IS NULL OR client_status <> 'DO_NOT_CONTACT' ORDER BY id LIMIT 1")!.id;
    let k = 0;
    const offer = offerSignup(app, () => `g-${++k}`, business, null);
    const ask = { offer, email: 'tick.client@example.invalid', display_name: 'An Invented Client', password: 'a long invented password 161g' };
    const no = await requestSignup(app, 'http://localhost', new URLSearchParams(ask), currentTermsVersions());
    assert.equal(no.ok, false);
    assert.match(no.ok ? '' : no.why, /Tick the box/);
    assert.deepEqual(await requestSignup(app, 'http://localhost', new URLSearchParams({ ...ask, agree: 'yes' }), currentTermsVersions()), { ok: true });
    const mail = app.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'ACCOUNT_VERIFY' ORDER BY rowid DESC LIMIT 1")!;
    const raw = /token=([0-9a-f]+)/.exec(mail.body)?.[1] ?? '';
    assert.deepEqual(confirmSignup(app, raw, () => `ta-${++k}`), { ok: true });
    const user = app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'tick.client@example.invalid'")!;
    const kept = app.db.get<{ agreed_at: string; portal_terms_version: string; website_terms_version: string; privacy_version: string }>(
      'SELECT agreed_at, portal_terms_version, website_terms_version, privacy_version FROM terms_agreements WHERE user_id = ?', [user.id])!;
    assert.deepEqual({ p: kept.portal_terms_version, w: kept.website_terms_version, v: kept.privacy_version },
      { p: versionOf('portal-terms'), w: versionOf('terms'), v: versionOf('privacy-policy') });
    assert.ok(kept.agreed_at.length > 0);
    assert.ok(hasAgreedCurrent(app.db, user.id));
    const audit = app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'TERMS_AGREED' AND actor_id = ?", [user.id]);
    assert.ok(audit !== undefined, 'the audit log does not record the tick');
    assert.match(audit.detail, /"route":"signup"/);
  });

  test('where the pages are not served, the sign-up asks nothing new (as today)', async () => {
    const app = plain.app;
    const business = app.db.get<{ id: string }>("SELECT id FROM businesses WHERE client_status IS NULL OR client_status <> 'DO_NOT_CONTACT' ORDER BY id LIMIT 1")!.id;
    const offer = offerSignup(app, () => 'p-1', business, null);
    assert.deepEqual(await requestSignup(app, 'http://localhost', new URLSearchParams({ offer, email: 'plain@example.invalid', display_name: 'An Invented Client', password: 'a long invented password 161g' })), { ok: true });
  });

  test('a client who has not agreed is asked once before the portal opens; the tick, its date and versions are kept', async () => {
    const jar = await signIn(baseLive, 'client@example.invalid');
    const first = await get(baseLive, '/portal', jar);
    assert.equal(first.status, 200);
    assert.match(first.body, /<h1>Before you go on<\/h1>/);
    for (const href of ['/portal-terms/', '/terms/', '/privacy-policy/']) assert.match(first.body, new RegExp(`href="${href.replace(/\//g, '\\/')}"`), href);
    assert.match(first.body, /<input type="checkbox" name="agree" value="yes" required>/);
    assert.equal((await post(baseLive, '/portal/agree', { next: '/portal' }, jar)).status, 400);
    const ok = await post(baseLive, '/portal/agree', { next: '/portal', agree: 'yes' }, jar);
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get('location'), '/portal');
    assert.doesNotMatch((await get(baseLive, '/portal', jar)).body, /Before you go on/);
    const id = live.app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'client@example.invalid'")!.id;
    assert.ok(hasAgreedCurrent(live.app.db, id));
    assert.ok(live.app.db.get("SELECT 1 AS x FROM audit_log WHERE kind = 'TERMS_AGREED' AND actor_id = ? AND detail LIKE '%\"route\":\"portal\"%'", [id]) !== undefined);
  });

  test('with the legal pages not served, a client goes straight into the portal (as today)', async () => {
    const jar = await signIn(basePlain, 'client@example.invalid');
    assert.doesNotMatch((await get(basePlain, '/portal', jar)).body, /Before you go on/);
  });
});

/* ======================================================================== 5 */
describe('Phase 161g item 5: the legal setting, and every page a draft until approved', () => {
  const all = [...LEGAL_PAGES.map(([p]) => p), '/notices/'];

  test('CAPREBATE_LEGAL_PAGES=on, and only "on", switches it on', () => {
    assert.equal(legalPagesSetting({ CAPREBATE_LEGAL_PAGES: 'on' }), true);
    assert.equal(legalPagesSetting({}), false);
    for (const v of ['', 'off', 'ON', 'yes', '1', 'true']) assert.equal(legalPagesSetting({ CAPREBATE_LEGAL_PAGES: v }), false, v);
  });

  test('with "legal" off (and not the test website), the start shows what it shows today', async () => {
    for (const p of LEGAL_PAGES.map(([x]) => x)) assert.match((await get(basePlain, p)).body, /<h1>This page is being prepared<\/h1>/, p);
    assert.match((await get(basePlain, '/privacy/')).body, /Our privacy notice and our public notices are being prepared/);
    assert.doesNotMatch((await get(basePlain, '/login')).body, BANNER);
  });

  test('with it on and no approval, every page is served and carries the Draft line, and the banner asks', async () => {
    for (const p of all) {
      const r = await get(baseLive, p, `${CONSENT_COOKIE}=essential`);
      assert.equal(r.status, 200, p);
      assert.match(r.body, DRAFT, p);
      assert.doesNotMatch(r.body, /class="draft-banner"/, p);
    }
    assert.match((await get(baseLive, '/login')).body, BANNER);
    assert.equal((await get(baseLive, '/privacy')).headers.get('location'), '/privacy-policy/');
  });

  test('an admin records an approval; a page is in force only when both the solicitor and the DPO approved its version', async () => {
    const admin = await signIn(baseLive, 'admin@example.invalid');
    const page0 = await get(baseLive, '/staff/legal', admin);
    assert.equal(page0.status, 200);
    assert.match(page0.body, /<h1>Legal pages<\/h1>/);
    const sol = await post(baseLive, '/staff/legal/approve', { page: 'disclaimer', role: 'SOLICITOR', approved_by: 'An Invented Solicitor', approved_on: '2026-11-04' }, admin);
    assert.equal(sol.status, 200);
    assert.match(sol.body, /The approval is recorded\./);
    assert.match((await get(baseLive, '/disclaimer/', `${CONSENT_COOKIE}=essential`)).body, DRAFT, 'one approval is not enough');
    assert.equal((await post(baseLive, '/staff/legal/approve', { page: 'disclaimer', role: 'SOLICITOR', approved_by: 'Again', approved_on: '2026-11-04' }, admin)).status, 400);
    assert.equal((await post(baseLive, '/staff/legal/approve', { page: 'disclaimer', role: 'DPO', approved_by: 'An Invented Officer', approved_on: '2999-01-01' }, admin)).status, 400);
    assert.equal((await post(baseLive, '/staff/legal/approve', { page: 'disclaimer', role: 'DPO', approved_by: 'An Invented Officer', approved_on: '2026-11-05' }, admin)).status, 200);
    const now = (await get(baseLive, '/disclaimer/', `${CONSENT_COOKIE}=essential`)).body;
    assert.doesNotMatch(now, DRAFT);
    assert.match(now, /<p class="in-force-note" role="note">In force\./);
    assert.match((await get(baseLive, '/terms/', `${CONSENT_COOKIE}=essential`)).body, DRAFT, 'another page went live');
    assert.equal(live.app.db.all("SELECT 1 FROM audit_log WHERE kind = 'LEGAL_PAGE_APPROVED'").length, 2);
    const a = currentApprovals(live.app.db).get('disclaimer');
    assert.deepEqual(a, { solicitor: { by: 'An Invented Solicitor', on: '2026-11-04' }, dpo: { by: 'An Invented Officer', on: '2026-11-05' } });
  });

  test('an approval is never changed or deleted, and only an admin may record one', async () => {
    assert.throws(() => live.app.db.run("UPDATE legal_approvals SET approved_by = 'x'"), /never changed/);
    assert.throws(() => live.app.db.run('DELETE FROM legal_approvals'), /never deleted/);
    const sales = await signIn(baseLive, 'sales@example.invalid');
    assert.equal((await post(baseLive, '/staff/legal/approve', { page: 'terms', role: 'DPO', approved_by: 'X Y', approved_on: '2026-11-05' }, sales)).status, 403);
    assert.equal((await get(baseLive, '/staff/legal', sales)).status, 403);
  });

  test('on the test website the pages are served as before, and the notices page keeps its test banner', async () => {
    for (const p of LEGAL_PAGES.map(([x]) => x)) assert.match((await get(baseTest, p, `${CONSENT_COOKIE}=essential`)).body, DRAFT, p);
    assert.match((await get(baseTest, '/notices/', `${CONSENT_COOKIE}=essential`)).body, /class="draft-banner" role="note"><strong>Our test website\./);
  });
});
