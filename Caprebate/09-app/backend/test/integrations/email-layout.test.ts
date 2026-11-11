/**
 * PHASE 161m2, 11 NOVEMBER 2026: THE BRANDED EMAIL LAYOUT (src/integrations/email/email-layout.ts) AND ITS LOGO
 * (src/integrations/email/email-logo.ts).
 *
 * The approved design is 05-reports-and-templates/emails/build.py. Three of its 33 emails are copied, as build.py
 * wrote them, into test/fixtures/phase161m2/ (that folder of OneDrive is not in git), and the layout must draw the same
 * emails byte for byte, and the same words.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  CLIENT_FOOTER, SECURITY_NOTE, STAFF_FOOTER, brandedEmail, emailLogoUrl, renderEmailHtml, renderEmailText,
  EMAIL_LOGO_HEADERS, EMAIL_LOGO_PATH, emailLogoPng,
} from '../../src/integrations/index.ts';
import type { EmailContent } from '../../src/integrations/index.ts';
import { emailLogoPixels } from '../../src/integrations/email/email-logo.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'phase161m2');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const HOSTED_LOGO = 'https://caprebate.co.uk/email/cap-rebate-logo.png';

/** The words a reader sees: tags out, entities read, whitespace as single spaces. */
function words(html: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/* Three of emails.py's emails, with their merge fields left as {fields}, as build.py drew them. */
const ASSESSMENT: EmailContent = {
  subject: 'Your Cap Rebate assessment: what happens next',
  preheader: 'Thank you for completing our assessment. Here is your indicative range.',
  heading: 'Thank you for completing our assessment',
  blocks: [
    'Based on your answers about {property_name}, the capital allowances you may be able to claim are in the range of:',
    { kind: 'figure', value: '{range_low} to {range_high}', label: 'Indicative range of capital allowances' },
    'This range is an estimate from your answers only. The figure you can claim is set by a chartered surveyor\'s survey of the building.',
    { kind: 'heading', text: 'What happens next' },
    { kind: 'bullets', items: ['We review your answers.', 'If you booked a call, you will get a separate email with the time.', 'If not, we will email you to arrange one.'] },
    'Our fee is 3% of the capital allowances identified, and only once we deliver our report. There is nothing to pay before then.',
  ],
  button: { label: 'Book a call', href: '{booking_link}' },
  sign: 'The Cap Rebate team',
};
const SIGNIN: EmailContent = {
  subject: 'Your Cap Rebate sign-in code: {code}',
  preheader: 'Your code works once, for 10 minutes.',
  heading: 'Your sign-in code',
  blocks: [
    { kind: 'code', text: '{code}' },
    'Enter this code to finish signing in. It works once, for 10 minutes.',
    'If you did not try to sign in, someone may know your password. Please change it now, and tell us at security@caprebate.co.uk.',
  ],
  sign: 'The Cap Rebate team',
  security: true,
};
const STAFF_ENQUIRY: EmailContent = {
  subject: 'New enquiry: {organisation}',
  preheader: '{sector}, {postcode_area}. Reply within one working day.',
  heading: 'A new enquiry has come in',
  blocks: [
    { kind: 'facts', rows: [['Organisation', '{organisation}'], ['Sector', '{sector}'], ['Area', '{postcode_area}'], ['Received', '{received_at}']] },
    'We have told them we will reply within one working day. The details are in the back office: we never put a client\'s details in an email.',
  ],
  button: { label: 'Open the enquiry', href: '{backoffice_link}' },
  sign: 'Cap Rebate back office',
  staff: true,
};

describe('Phase 161m2: the layout draws build.py\'s emails', () => {
  for (const [id, c] of [['assessment-complete', ASSESSMENT], ['signin-code', SIGNIN], ['staff-new-enquiry', STAFF_ENQUIRY]] as const) {
    test(`${id}: the same words as build.py's HTML, and the same text version`, () => {
      const html = renderEmailHtml(c, { logoUrl: HOSTED_LOGO });
      assert.equal(words(html), words(fixture(`${id}.html`)));
      assert.equal(`Subject: ${c.subject}\n\n${renderEmailText(c)}`, fixture(`${id}.txt`));
    });
    test(`${id}: the HTML is build.py's, byte for byte`, () => {
      assert.equal(renderEmailHtml(c, { logoUrl: HOSTED_LOGO }), fixture(`${id}.html`));
    });
  }
});

describe('Phase 161m2: each part of the layout', () => {
  const ALL: EmailContent = {
    subject: 'Everything', preheader: 'The line after the subject', heading: 'A **bold** heading',
    blocks: [
      'A paragraph with **two words** in bold.',
      { kind: 'paragraph', text: 'A second paragraph.' },
      { kind: 'heading', text: 'What happens next' },
      { kind: 'bullets', items: ['First thing', 'Second **thing**'] },
      { kind: 'figure', value: '£12,000 to £18,000', label: 'Indicative range' },
      { kind: 'facts', rows: [['When', 'Tuesday 3 November, 10am'], ['How long', '30 minutes']] },
      { kind: 'code', text: '123456' },
    ],
    button: { label: 'Open your portal', href: 'https://caprebate.co.uk/portal?a=1&b=2' },
    sign: 'The Cap Rebate team',
  };
  const html = renderEmailHtml(ALL);
  const text = renderEmailText(ALL);

  test('every block type is drawn, in order, in the HTML', () => {
    const at = (s: string): number => { const i = html.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); return i; };
    const order = [
      '<h1 ', 'A <strong style="color:#111111;font-weight:700">bold</strong> heading',
      'A paragraph with <strong style="color:#111111;font-weight:700">two words</strong> in bold.',
      'A second paragraph.',
      'text-transform:uppercase;font-weight:700;color:#111111">What happens next</p>',
      'border:1px solid #6FCFAE', 'First thing</td>', 'Second <strong style="color:#111111;font-weight:700">thing</strong></td>',
      'background:#ABEDD8;border-radius:12px;padding:20px 24px', 'Indicative range</p>', '£12,000 to £18,000</p>',
      'white-space:nowrap;vertical-align:top">When</td>', 'Tuesday 3 November, 10am</td>', 'How long</td>',
      'letter-spacing:0.3em;color:#111111">123456</p>',
      '<a href="https://caprebate.co.uk/portal?a=1&amp;b=2"', '>Open your portal</a>',
      'Kind regards,<br><strong style="color:#111111">The Cap Rebate team</strong>',
    ];
    let last = -1;
    for (const s of order) { const i = at(s); assert.ok(i > last, `out of order: ${s}`); last = i; }
    assert.match(html, /<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F2F8F6">The line after the subject<\/span>/);
    assert.match(html, /max-width:600px/);
    assert.match(html, /background:#111111;border-radius:14px 14px 0 0/);
    assert.match(html, /font-family:'Bookman Old Style','Roboto Slab',Georgia,'Times New Roman',serif/);
    assert.match(html, /font-family:Calibri,'Segoe UI',Arial,Helvetica,sans-serif/);
    assert.match(html, /border-radius:999px;border:1px solid #8FDDC2/, 'the mint pill button');
    assert.doesNotMatch(html, /<script|<svg|<style/i, 'email-safe: no script, no SVG, no style block');
  });

  test('the plain-text version has each block, bold marks out, nothing escaped', () => {
    assert.equal(text, [
      'A bold heading', '',
      'A paragraph with two words in bold.', '',
      'A second paragraph.', '',
      'What happens next', '',
      '- First thing', '- Second thing', '',
      'Indicative range: £12,000 to £18,000', '',
      'When: Tuesday 3 November, 10am', 'How long: 30 minutes', '',
      '123456', '',
      'Open your portal: https://caprebate.co.uk/portal?a=1&b=2', '',
      'Kind regards,', 'The Cap Rebate team', '',
      '--', ...CLIENT_FOOTER,
    ].join('\n') + '\n');
  });

  test('without a logo address the header is the wordmark alone; with one, the 34px image', () => {
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /font-size:20px;color:#FFFFFF">Cap Rebate<\/p>/);
    const withLogo = renderEmailHtml(ALL, { logoUrl: 'https://caprebate.co.uk/email/cap-rebate-logo.png' });
    assert.match(withLogo, /<img src="https:\/\/caprebate\.co\.uk\/email\/cap-rebate-logo\.png" width="34" height="34" alt="" style="display:block;border:0">/);
  });

  test('the footer: the company, its number, its registered office, the address to write to, privacy, no tax advice', () => {
    for (const s of ['CAP REBATE LTD, trading as Cap Rebate', 'company number 17307313', 'Registered office: 1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA.',
      'contact@caprebate.co.uk', 'How we use your data: caprebate.co.uk/privacy-policy.', 'we do not give tax advice.']) {
      assert.ok(html.includes(s), `HTML footer: ${s}`);
      assert.ok(text.includes(s), `text footer: ${s}`);
    }
    assert.match(html, /CAPITAL ALLOWANCES SIMPLIFIED/);
    assert.doesNotMatch(html, /We will never ask for your password/);
  });

  test('the security note and the back-office variant', () => {
    const sec = { ...ALL, security: true };
    assert.ok(renderEmailHtml(sec).includes(`padding:12px 16px;font-family:Calibri,'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5B6B66">${SECURITY_NOTE}</td>`));
    assert.ok(renderEmailText(sec).includes(`The Cap Rebate team\n\n${SECURITY_NOTE}\n\n--\n`));
    const staff = { ...ALL, staff: true };
    const sh = renderEmailHtml(staff), st = renderEmailText(staff);
    assert.match(sh, /letter-spacing:0\.16em;color:#ABEDD8">BACK OFFICE<\/p>/);
    assert.ok(sh.includes(STAFF_FOOTER[0] ?? 'x') && st.endsWith(`--\n${STAFF_FOOTER[0] ?? 'x'}\n`));
    assert.doesNotMatch(sh, /17307313|CAPITAL ALLOWANCES SIMPLIFIED/);
    assert.doesNotMatch(st, /17307313/);
  });

  test('no long dash in any fixed words, in any variant', () => {
    for (const c of [ALL, { ...ALL, security: true }, { ...ALL, staff: true }, { ...ALL, button: null }]) {
      for (const out of [renderEmailHtml(c, { logoUrl: HOSTED_LOGO }), renderEmailText(c)]) assert.doesNotMatch(out, /—|&mdash;|&#8212;|–/);
    }
    for (const l of [...CLIENT_FOOTER, ...STAFF_FOOTER, SECURITY_NOTE]) assert.doesNotMatch(l, /—|–/);
  });
});

describe('Phase 161m2: what a client typed or a record holds', () => {
  const V = 'Smith & Co <b>"Ltd"\'s';
  const c: EmailContent = {
    subject: `Your claim for ${V}`, preheader: `About ${V}`, heading: `Hello ${V}`,
    blocks: [
      `A paragraph about ${V}.`, { kind: 'heading', text: V }, { kind: 'bullets', items: [V] },
      { kind: 'figure', value: V, label: V }, { kind: 'facts', rows: [[V, V]] }, { kind: 'code', text: V },
    ],
    button: { label: V, href: `https://caprebate.co.uk/x?n=${V}` }, sign: V,
  };

  test('is escaped in the HTML version, everywhere it appears', () => {
    const html = renderEmailHtml(c);
    assert.ok(!html.includes('Smith & Co'), 'never a bare ampersand from the record');
    assert.ok(!html.includes('<b>'), 'never a tag from the record');
    assert.ok(html.includes('Smith &amp; Co &lt;b&gt;'));
    const count = html.split('Smith &amp; Co &lt;b&gt;').length - 1;
    assert.equal(count, 14, 'the title, the preheader, the heading, a paragraph, a small heading, a bullet, the figure (2), the facts (2), the code, the button (2) and the sign');
    assert.ok(html.includes('href="https://caprebate.co.uk/x?n=Smith &amp; Co &lt;b&gt;&quot;Ltd&quot;&#x27;s"'), 'an attribute is quoted safely');
  });

  test('is left exactly as it is in the text version', () => {
    const text = renderEmailText(c);
    assert.ok(text.startsWith(`Hello ${V}\n\nA paragraph about ${V}.\n\n${V}\n\n- ${V}\n\n${V}: ${V}\n\n${V}: ${V}\n\n${V}\n\n${V}: https://caprebate.co.uk/x?n=${V}\n\nKind regards,\n${V}\n`));
    assert.doesNotMatch(text, /&amp;|&lt;|&quot;|&#x27;/);
  });

  test('bold marks cannot make a tag', () => {
    const html = renderEmailHtml({ ...c, blocks: ['**<script>alert(1)</script>**'] });
    assert.ok(html.includes('<strong style="color:#111111;font-weight:700">&lt;script&gt;alert(1)&lt;/script&gt;</strong>'));
    assert.doesNotMatch(html, /<script/);
  });
});

describe('Phase 161m2: brandedEmail and the logo', () => {
  test('brandedEmail gives the subject, both versions and the preheader; the logo only on a public https address', () => {
    const e = brandedEmail(SIGNIN, { publicOrigin: 'https://caprebate.co.uk/' });
    assert.equal(e.subject, SIGNIN.subject);
    assert.equal(e.preheader, SIGNIN.preheader);
    assert.equal(e.text, renderEmailText(SIGNIN));
    assert.equal(e.html, fixture('signin-code.html'));
    assert.doesNotMatch(brandedEmail(SIGNIN).html, /<img/);
    assert.doesNotMatch(brandedEmail(SIGNIN, { publicOrigin: 'http://localhost:8103' }).html, /<img/);
    assert.equal(emailLogoUrl('https://test.caprebate.co.uk'), `https://test.caprebate.co.uk${EMAIL_LOGO_PATH}`);
    assert.equal(emailLogoUrl('http://localhost:8103'), null);
    assert.equal(emailLogoUrl(null), null);
    assert.equal(emailLogoUrl('https://caprebate.co.uk/some/path'), null);
  });

  test('the logo is a 68 x 68 RGBA PNG of the mint mark on a transparent ground, the same every time', () => {
    const png = emailLogoPng();
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
    assert.equal(png.readUInt32BE(16), 68);
    assert.equal(png.readUInt32BE(20), 68);
    assert.equal(png[24], 8); assert.equal(png[25], 6);
    // Its pixels, read back from the file.
    const idat = png.indexOf('IDAT');
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    const pixel = (x: number, y: number): number[] => { const i = y * (68 * 4 + 1) + 1 + x * 4; return [...raw.subarray(i, i + 4)]; };
    assert.deepEqual(pixel(0, 0), [0xab, 0xed, 0xd8, 0], 'a corner is transparent');
    const at = (u: number): number => Math.floor((u * 68) / 48);
    assert.deepEqual(pixel(at(18), at(31.5)), [0xab, 0xed, 0xd8, 255], 'the middle of the first key is solid mint');
    assert.deepEqual(pixel(at(24), at(22.75)), [0xab, 0xed, 0xd8, 255], 'the screen bar');
    assert.deepEqual(pixel(at(24), at(14)), [0xab, 0xed, 0xd8, 0], 'inside the house, above the screen, is empty');
    assert.deepEqual(pixel(at(10), at(30)), [0xab, 0xed, 0xd8, 255], 'the left wall');
    assert.deepEqual([...emailLogoPixels()], [...emailLogoPixels()]);
    assert.ok(png.length < 2048, 'small');
    assert.equal(EMAIL_LOGO_HEADERS['content-type'], 'image/png');
    assert.match(EMAIL_LOGO_HEADERS['cache-control'] ?? '', /^public, max-age=\d+$/);
  });
});
