/**
 * PHASE 160c — THE HOME PAGE'S BRANDING IN THE BACK OFFICE AND THE PORTAL, THE TEXT TIDIED, AND NO EM DASHES ON SCREEN,
 * 19 October 2026 (src/web/plain-dashes.ts run by page() in src/web/html.ts; the shared block in src/web/assets.ts).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { BRAND_TOKENS, SITE_CSS } from '../src/web/assets.ts';
import { plainDashText, plainDashes } from '../src/web/plain-dashes.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
const WHO = ['admin', 'sales', 'accounting', 'surveying', 'readonly', 'client'] as const;
type Who = (typeof WHO)[number];

let made: Made;
let base = '';
const cookies = new Map<Who, string>();
const get = async (who: Who | null, path: string): Promise<{ status: number; body: string; type: string }> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie: who === null ? '' : cookies.get(who) ?? '' } });
  return { status: x.status, body: await x.text(), type: x.headers.get('content-type') ?? '' };
};
/**
 * The words the rule changes: the page without its scripts, styles, text boxes and code, and without the attributes a
 * form sends back (value, name, href). What is left there is carried to the phase for stored and generated text.
 */
const readable = (html: string): string => html.replace(/<(script|style|textarea|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/\s(?:value|name|href|action|data-[a-z-]+)="[^"]*"/gi, '');
const DASHES = /—|&mdash;|&#8212;|&#x2014;/i;

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160c-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-160c', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  for (const who of WHO) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in`);
    cookies.set(who, r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
  }
});
after(() => made.close());

describe('Phase 160c: the rules for a long dash', () => {
  test('a colon, a comma, or None, by the rules in src/web/plain-dashes.ts', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['Tax return — a document we need', 'Tax return: a document we need'],
      ['Monday 19 October. 11 jobs are late — start at the top.', 'Monday 19 October. 11 jobs are late: start at the top.'],
      ['Corvale Supported Living Limited — main site', 'Corvale Supported Living Limited: main site'],
      ['Confirm who owns the building — 25 days overdue', 'Confirm who owns the building, 25 days overdue'],
      [' — or in the Zoom app', ', or in the Zoom app'],
      ['a case is left out — it is still tagged — and tracked', 'a case is left out, it is still tagged, and tracked'],
      ['Next: Confirm the call — then write', 'Next: Confirm the call, then write'],
      ['Owner — ', 'Owner: '],
      ['x—y', 'x: y'],
    ];
    for (const [from, to] of cases) assert.equal(plainDashText(from), to, from);
  });

  test('a dash that is all a cell holds reads None; between two tags it reads as a colon against the word before', () => {
    assert.equal(plainDashes('<td>—</td>'), '<td>None</td>');
    assert.equal(plainDashes('<b>Due</b> — <a href="/x">late</a>'), '<b>Due</b>: <a href="/x">late</a>');
    assert.equal(plainDashes('<span>Tax return <span class="help">— a document we need</span></span>'),
      '<span>Tax return<span class="help">: a document we need</span></span>');
  });

  test('a script, a style, a text box, code and every attribute a form sends back are left as they are', () => {
    const page = '<script>x="a — b"</script><style>p::after{content:"—"}</style><textarea>typed — kept</textarea><code>a — b</code>'
      + '<input value="Co — main site" name="a—b"><a href="/a—b" title="A — b">c</a><img alt="Cap Rebate — capital allowances">';
    const out = plainDashes(page);
    for (const kept of ['x="a — b"', 'content:"—"', '>typed — kept<', '<code>a — b</code>', 'value="Co — main site"', 'name="a—b"', 'href="/a—b"']) {
      assert.ok(out.includes(kept), `changed: ${kept}`);
    }
    assert.ok(out.includes('title="A: b"'));
    assert.ok(out.includes('alt="Cap Rebate: capital allowances"'));
  });
});

describe('Phase 160c: no long dash on any page a login reaches', () => {
  for (const who of WHO) {
    test(`${who}: every page reached from home, up to sixty, reads without one`, async () => {
      const start = who === 'client' ? '/portal' : '/staff';
      const seen = new Set<string>();
      const queue = [start];
      while (queue.length > 0 && seen.size < 60) {
        const path = queue.shift() ?? '';
        if (seen.has(path)) continue;
        seen.add(path);
        const r = await get(who, path);
        if (r.status !== 200 || !r.type.includes('text/html')) continue;
        assert.doesNotMatch(readable(r.body), DASHES, `${who} ${path}: ${(DASHES.exec(readable(r.body)) !== null ? readable(r.body).slice(Math.max(0, (readable(r.body).search(DASHES)) - 60), readable(r.body).search(DASHES) + 40) : '')}`);
        for (const m of r.body.matchAll(/href="(\/(?:staff|portal)[^"#]*)"/g)) {
          const href = (m[1] ?? '').replace(/&amp;/g, '&');
          if (/download|export|\.csv|\.pdf|\.zip|logout|\/file\b|\/files\/[^/]+$/.test(href)) continue;
          if (!seen.has(href)) queue.push(href);
        }
      }
      assert.ok(seen.size > 5, `${who} reached only ${seen.size} pages`);
    });
  }

  test('the public pages page() draws read without one', async () => {
    // The assessment's steps need the funnel's own session, so the pages that open on their own are read here.
    for (const path of ['/login', '/login/forgot']) {
      const r = await get(null, path);
      assert.equal(r.status, 200, path);
      assert.doesNotMatch(readable(r.body), DASHES, path);
    }
  });
});

describe('Phase 160c: the home page’s branding and the tidied text', () => {
  test('the menu is the home page’s ink with ivory words; the current page and the main buttons are mint pills with ink words', () => {
    assert.equal(BRAND_TOKENS['side'], '#121614');
    assert.equal(BRAND_TOKENS['ivory'], '#EDEAE2');
    assert.match(SITE_CSS, /body\.crm>header\.top\{background:var\(--side\)\}/);
    assert.match(SITE_CSS, /body\.crm \.tabs-main>li>a\[aria-current="page"\]\{background:var\(--mint\);color:var\(--ink\);box-shadow:none;border-radius:999px\}/);
    assert.match(SITE_CSS, /body\.crm main button\[type="submit"\]:not\(\.linkish\):not\(\.opt\):not\(\.btn-quiet\)\{background:var\(--mint\);border-color:var\(--mint\);color:var\(--ink\)\}/);
    assert.match(SITE_CSS, /body\.crm main button,body\.crm main \.btn\{[^}]*border-radius:999px\}/);
  });

  test('headings in the brand’s heading type, figures in the body type; the mark is still', () => {
    assert.match(SITE_CSS, /body\.crm main h1,body\.crm main h2,body\.crm main h3,body\.crm main h4,body\.crm main \.card-h,body\.crm main \.pnum,body\.crm main legend\{font-family:"Bookman Old Style"/);
    assert.match(SITE_CSS, /body\.crm main \.stat,body\.crm main \.figbig,body\.crm main \.kpi \.kpi-value,body\.crm main \.dash-num\{font-family:Calibri/);
    assert.match(SITE_CSS, /body\.crm \.brandmark \.mk\{fill:none;stroke:var\(--ivory\)/);
    assert.doesNotMatch(SITE_CSS.slice(SITE_CSS.indexOf('body.crm .brandmark .mk{'), SITE_CSS.indexOf('body.crm .brandmark .wm{')), /animation/);
  });

  test('Help sits level with the name; the name is not underlined; the menu’s role is plain and Sign out spaced like the rest', () => {
    assert.match(SITE_CSS, /body\.crm \.crumbbar \.helplink\{[^}]*margin:0;align-self:center;/);
    assert.match(SITE_CSS, /body\.crm \.crumbbar \.usermenu summary,body\.crm \.crumbbar \.usermenu summary::after\{color:var\(--ink\);text-decoration:none\}/);
    assert.match(SITE_CSS, /body\.crm \.menu-pop \.who \.help\{font-weight:400;/);
    assert.match(SITE_CSS, /body\.crm \.menu-pop form>button,body\.crm \.menu-pop \.linkish\{margin:0;/);
  });

  test('no navy is left in the shared block', () => {
    const from = SITE_CSS.lastIndexOf('/*', SITE_CSS.indexOf('PHASE 160a — THE BACK OFFICE IN THE LAYOUT'));
    const block = SITE_CSS.slice(from, SITE_CSS.lastIndexOf('/*', SITE_CSS.indexOf('THE PUBLIC PAGES IN THE HOME PAGE')));
    assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /navy/);
  });
});
