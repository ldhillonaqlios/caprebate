/**
 * THE BRANDED EMAIL LAYOUT. Phase 161m2, 11 November 2026.
 *
 * The approved design is 05-reports-and-templates/emails/build.py (its render(), plain(), footer() and block()), with
 * the wording of every email in emails.py beside it. This file is that design, ported line for line: the same
 * email-safe HTML (tables for layout, inline styles only, 600px wide, web-safe font stacks behind the brand fonts, no
 * script, no SVG) and the same plain-text version. test/integrations/email-layout.test.ts renders two of the 33 emails
 * and compares them with build.py's own output, byte for byte.
 *
 * WHAT IS ESCAPED. Every string an email is given (the wording, and whatever a client typed or a record holds) is
 * HTML-escaped in the HTML version and left exactly as it is in the plain-text version. `**bold**` marks bold words in
 * the heading, a paragraph, a small heading and a bullet; it is read after escaping, so it can never make a tag. The
 * figure, the facts and the code hold record values, so they are escaped and never read for bold.
 *
 * THE LOGO is a 68 x 68 PNG of the house mark (src/integrations/email/email-logo.ts), served by the app at
 * /email/cap-rebate-logo.png. An email names it only when the app knows its public https address; otherwise the header
 * is the wordmark alone, which reads well by itself.
 *
 * No long dash in any fixed words here (the house rule: a comma, a colon or a full stop).
 */

import { EMAIL_LOGO_PATH } from './email-logo.ts';

/** One block of an email's body, in order. A bare string is a paragraph. */
export type EmailBlock =
  | string
  | { readonly kind: 'paragraph'; readonly text: string }
  /** A small heading line ("What happens next"): capitals, letter-spaced. */
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  /** The mint box with one big figure ("£12,000 to £18,000") and its label above it. */
  | { readonly kind: 'figure'; readonly value: string; readonly label: string }
  /** A table of label and value rows ("When", "Tuesday 3 November, 10am"). */
  | { readonly kind: 'facts'; readonly rows: readonly (readonly [string, string])[] }
  /** A sign-in code, large and centred in the mist box. */
  | { readonly kind: 'code'; readonly text: string };

export type EmailButton = { readonly label: string; readonly href: string };

export type EmailContent = {
  readonly subject: string;
  /** The line a mail program shows after the subject, before the email is opened. Hidden in the email itself. */
  readonly preheader: string;
  readonly heading: string;
  readonly blocks: readonly EmailBlock[];
  /** The mint pill button under the body, and in the plain text "label: href". */
  readonly button?: EmailButton | null;
  /** Who signs it, under "Kind regards,". */
  readonly sign: string;
  /** Adds the note that we never ask for a password, a sign-in code or bank details. */
  readonly security?: boolean;
  /** A back-office email: the header says BACK OFFICE and the footer is the one-line staff footer. */
  readonly staff?: boolean;
};

export type EmailLayoutOptions = {
  /** The logo's full address. Absent or null: the wordmark alone. */
  readonly logoUrl?: string | null;
};

/* Brand book v1.0, slides 31 to 38 (build.py's constants). */
const MINT = '#ABEDD8', INK = '#111111', WHITE = '#FFFFFF', MIST = '#F2F8F6', GREY = '#333333';
const RULE = '#DCE9E4', SOFT = '#5B6B66';
const HEAD_FONT = "'Bookman Old Style','Roboto Slab',Georgia,'Times New Roman',serif";
const BODY_FONT = "Calibri,'Segoe UI',Arial,Helvetica,sans-serif";

export const SECURITY_NOTE = 'We will never ask for your password, sign-in code or bank details by email or phone.';

/** The footer's lines: the company's details for a client, one line for the back office. */
export const CLIENT_FOOTER: readonly string[] = Object.freeze([
  'Questions? Reply to this email or write to contact@caprebate.co.uk. We answer by email.',
  'CAP REBATE LTD, trading as Cap Rebate. Registered in England and Wales, company number 17307313. '
    + 'Registered office: 1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA.',
  'How we use your data: caprebate.co.uk/privacy-policy. Cap Rebate identifies and values capital allowances; '
    + 'we do not give tax advice.',
]);
export const STAFF_FOOTER: readonly string[] = Object.freeze([
  'Sent by the Cap Rebate back office. You get this because of your role on this claim.',
]);

/** Python's html.escape: &, < and >, and with `quote` also " and '. */
function esc(s: string, quote = true): string {
  const t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return quote ? t.replace(/"/g, '&quot;').replace(/'/g, '&#x27;') : t;
}

/** Escape, then **bold** (build.py's inline(), without the preview's merge-field highlight). */
function inline(text: string): string {
  return esc(text, false).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${INK};font-weight:700">$1</strong>`);
}

/** Bold marks taken out, for the plain-text version. */
function unbold(text: string): string {
  return text.replace(/\*\*/g, '');
}

function para(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${GREY}">${inline(text)}</p>`;
}

function blockHtml(b: EmailBlock): string {
  if (typeof b === 'string') return para(b);
  switch (b.kind) {
    case 'paragraph': return para(b.text);
    case 'heading':
      return `<p style="margin:24px 0 8px;font-family:${BODY_FONT};font-size:13px;letter-spacing:0.08em;`
        + `text-transform:uppercase;font-weight:700;color:${INK}">${inline(b.text)}</p>`;
    case 'bullets': {
      const items = b.items.map((i) =>
        `<tr><td valign="top" style="padding:0 10px 10px 0;font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${INK}">`
        + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MINT};border:1px solid #6FCFAE;margin-top:7px"></span></td>`
        + `<td style="padding:0 0 10px;font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${GREY}">${inline(i)}</td></tr>`).join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${items}</table>`;
    }
    case 'figure':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px">`
        + `<tr><td style="background:${MINT};border-radius:12px;padding:20px 24px">`
        + `<p style="margin:0 0 4px;font-family:${BODY_FONT};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${INK}">${esc(b.label, false)}</p>`
        + `<p style="margin:0;font-family:${HEAD_FONT};font-size:30px;line-height:1.2;color:${INK};font-variant-numeric:tabular-nums">${esc(b.value, false)}</p>`
        + `</td></tr></table>`;
    case 'facts': {
      const rows = b.rows.map(([k, v]) =>
        `<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid ${RULE};font-family:${BODY_FONT};font-size:14px;color:${SOFT};white-space:nowrap;vertical-align:top">${esc(k, false)}</td>`
        + `<td style="padding:10px 0;border-bottom:1px solid ${RULE};font-family:${BODY_FONT};font-size:16px;color:${INK};font-variant-numeric:tabular-nums">${esc(v, false)}</td></tr>`).join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid ${RULE}">${rows}</table>`;
    }
    case 'code':
      return `<p style="margin:4px 0 20px;padding:18px 0;background:${MIST};border-radius:12px;text-align:center;`
        + `font-family:Consolas,Menlo,'Courier New',monospace;font-size:32px;letter-spacing:0.3em;color:${INK}">${esc(b.text, false)}</p>`;
  }
}

function buttonHtml(cta: EmailButton | null | undefined): string {
  if (cta === undefined || cta === null) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>`
    + `<td style="background:${MINT};border-radius:999px;border:1px solid #8FDDC2">`
    + `<a href="${esc(cta.href)}" style="display:inline-block;padding:13px 28px;font-family:${BODY_FONT};font-size:16px;font-weight:700;color:${INK};text-decoration:none">${esc(cta.label)}</a>`
    + `</td></tr></table>`;
}

function footerLines(c: EmailContent): readonly string[] {
  return c.staff === true ? STAFF_FOOTER : CLIENT_FOOTER;
}

function footerHtml(c: EmailContent): string {
  return footerLines(c).map((l) => `<p style="margin:0 0 8px;font-family:${BODY_FONT};font-size:12px;line-height:1.55;color:${SOFT}">${esc(l)}</p>`).join('');
}

/** The email's body as build.py's render(e, False) draws it: the part inside <body>. */
function renderInner(c: EmailContent, o: EmailLayoutOptions): string {
  const logo = o.logoUrl === undefined || o.logoUrl === null ? null
    : `<img src="${esc(o.logoUrl)}" width="34" height="34" alt="" style="display:block;border:0">`;
  const tag = c.staff === true ? 'BACK OFFICE' : 'CAPITAL ALLOWANCES SIMPLIFIED';
  const security = c.security === true
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr>`
      + `<td style="background:${MIST};border-radius:10px;padding:12px 16px;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${SOFT}">`
      + `${SECURITY_NOTE}</td></tr></table>`
    : '';
  const body = c.blocks.map(blockHtml).join('');
  // Without a logo the cell that held it goes, so the wordmark sits at the left edge.
  const logoCell = logo === null ? '' : `    <td style="padding-right:12px;vertical-align:middle">${logo}</td>\n`;
  return `<div style="background:${MIST};padding:24px 12px">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MIST}">${esc(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:${INK};border-radius:14px 14px 0 0;padding:18px 28px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
${logoCell}    <td style="vertical-align:middle"><p style="margin:0;font-family:${HEAD_FONT};font-size:20px;color:${WHITE}">Cap Rebate</p>
      <p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:10px;letter-spacing:0.16em;color:${MINT}">${tag}</p></td>
  </tr></table>
</td></tr>
<tr><td style="background:${WHITE};padding:32px 28px 24px;border-left:1px solid ${RULE};border-right:1px solid ${RULE}">
  <h1 style="margin:0 0 18px;font-family:${HEAD_FONT};font-size:26px;line-height:1.25;font-weight:400;color:${INK}">${inline(c.heading)}</h1>
  ${body}
  ${buttonHtml(c.button)}
  <p style="margin:8px 0 0;font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${GREY}">Kind regards,<br><strong style="color:${INK}">${esc(c.sign)}</strong></p>
  ${security}
</td></tr>
<tr><td style="background:${WHITE};border-radius:0 0 14px 14px;border:1px solid ${RULE};border-top:0;padding:0 28px 8px"><div style="height:4px;background:${MINT};border-radius:2px;width:56px"></div></td></tr>
<tr><td style="padding:20px 28px 8px">${footerHtml(c)}</td></tr>
</table></td></tr></table></div>`;
}

/** The whole HTML version, as build.py writes html/<id>.html: a small document around the layout. */
export function renderEmailHtml(c: EmailContent, o: EmailLayoutOptions = {}): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(c.subject)}</title></head><body style="margin:0">${renderInner(c, o)}</body></html>\n`;
}

/** The plain-text version, as build.py's plain(): nothing escaped, bold marks taken out of the wording. */
export function renderEmailText(c: EmailContent): string {
  const out: string[] = [unbold(c.heading), ''];
  for (const b of c.blocks) {
    if (typeof b === 'string') { out.push(unbold(b), ''); continue; }
    switch (b.kind) {
      case 'paragraph': case 'heading': out.push(unbold(b.text), ''); break;
      case 'bullets': out.push(...b.items.map((i) => `- ${unbold(i)}`), ''); break;
      case 'figure': out.push(`${b.label}: ${b.value}`, ''); break;
      case 'facts': out.push(...b.rows.map(([k, v]) => `${k}: ${v}`), ''); break;
      case 'code': out.push(b.text, ''); break;
    }
  }
  if (c.button !== undefined && c.button !== null) out.push(`${c.button.label}: ${c.button.href}`, '');
  out.push('Kind regards,', c.sign, '');
  if (c.security === true) out.push(SECURITY_NOTE, '');
  out.push('--', ...footerLines(c));
  return `${out.join('\n')}\n`;
}

/** The logo's address on a public https origin, or null (then the email shows the wordmark alone). */
export function emailLogoUrl(publicOrigin: string | null | undefined): string | null {
  const o = (publicOrigin ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/?#]+$/i.test(o) ? `${o}${EMAIL_LOGO_PATH}` : null;
}

export type BrandedEmail = { readonly subject: string; readonly text: string; readonly html: string; readonly preheader: string };

/**
 * THE ONE HELPER THE MODULES CALL: an email's content in, its subject and both versions out. Queue it with
 * `{ subject: e.subject, body: e.text, html: e.html }` on the outbox transport.
 */
export function brandedEmail(c: EmailContent, opts: { readonly publicOrigin?: string | null } = {}): BrandedEmail {
  return {
    subject: c.subject,
    text: renderEmailText(c),
    html: renderEmailHtml(c, { logoUrl: emailLogoUrl(opts.publicOrigin) }),
    preheader: c.preheader,
  };
}
