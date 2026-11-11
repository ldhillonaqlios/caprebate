/**
 * THE PUBLIC NOTICES PAGE ON THE TEST WEBSITE, AND ITS COMPLAINT FORM.
 *
 * The stress test found /privacy and /notices saying the notices "are being prepared" while the
 * contact form and the assessment already took names, emails and phone numbers. The page is drafted in full
 *; the owner: "Build and publish on test". Its four facts nobody
 * had supplied are filled with our recommendation and each is marked "Proposed, awaiting our data protection officer".
 *
 * SERVED ON THE TEST WEBSITE ONLY. createApp's `testNotices`, passed by api/index.mjs alone, serves the page at
 * /notices/ (and /privacy/ goes to its privacy part); anywhere else the old placeholder stays. A banner at the top
 * says it is a draft. The same rule as every other page: nothing inline. Its one <style> block is served as
 * /assets/notices.css, and the edition is refused if a style attribute, a script or an event handler appears.
 *
 * THE COMPLAINT FORM. A complaint counts however it arrives and its thirty days run from when it arrives, so
 * `receiveComplaintForm` keeps it at once (complaint_forms, migration 118), emails it to the data protection address,
 * and the staff complaints page lists it until a member of staff logs it into the complaints log with the same arrival
 * time (`logFormComplaint`, src/modules/compliance/complaint-forms.ts). Nothing the person typed is ever drawn as HTML.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from '../../core/app.ts';
import { rateLimit } from '../../core/index.ts';
import { hashToken } from '../../core/index.ts';
import { plainDashes } from '../../shared/index.ts';
import { insertComplaintForms, refOf } from '../compliance/index.ts';

/** the app's own copy: edit the original, 03-app/caprebate-notices-page.html, then run `npm run copies`; npm run check fails while they differ (tools/app-copies.cjs). */
export const NOTICES_PATH = join(import.meta.dirname, '..', '..', '..', 'copies', 'caprebate-notices-page.html');
/** Where the page sends people about their data, and where a complaint from its form is emailed. */
export const DP_MAIL = 'data.protection@caprebate.co.uk';
/** Complaints from one network address in the 15-minute window, before the form says to wait. */
export const COMPLAINT_SOURCE_LIMIT = 10;

/* The eight facts the notices proposed are confirmed by the data protection officer
  , so the page is no longer a draft; the banner says only where it is. */
const BANNER = '<p class="draft-banner" role="note"><strong>Our test website.</strong> It holds invented information '
  + 'only. Our public website will carry this page too.</p>';

const BANNER_CSS = '\n  /* PHASE 160f: the test website says the page is a draft. */\n'
  + '  .draft-banner{border:2px solid var(--alert); background:var(--alertbg); padding:.8rem 1rem; margin:1rem 0}\n';

const INLINE: readonly [RegExp, string][] = [
  [/<style\b/i, 'an inline <style> block'],
  [/<script\b/i, 'a script'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/href\s*=\s*["']?\s*javascript:/i, 'a javascript: link'],
];

export type NoticesEdition = { readonly html: string; readonly css: string };

/** Build the served edition from the file's text. Pure, so a test can hand it a string. Throws on anything inline. */
export function buildNoticesEdition(source: string): NoticesEdition {
  const text = source.replace(/<!--[\s\S]*?-->/g, '');
  const style = /<style>([\s\S]*?)<\/style>/i.exec(text);
  if (style === null) throw new Error('the notices page has no style block');
  let html = text.replace(style[0], '<link rel="stylesheet" href="/assets/notices.css">');
  for (const [re, what] of INLINE) if (re.test(html)) throw new Error(`the notices page carries ${what}`);
  html = html.replace(/<div class="wrap">/, `<div class="wrap">\n${BANNER}`);
  // No long dash in the words a person reads (the house rule; src/shared/plain-dashes.ts, as every page page() draws).
  html = plainDashes(html);
  if (!html.includes('draft-banner')) throw new Error('the notices page has no place for the draft banner');
  return { html, css: (style[1] ?? '') + BANNER_CSS };
}

/**
 * THE SAME PAGE ON THE LIVE WEBSITE (the `legal` setting). The test website's banner ("Our test website")
 * is replaced by the page's own Draft line, which goes once our data protection officer has approved its version
 * (src/modules/compliance/legal-approvals.ts; the DPO alone since Phase 161m1).
 */
export function noticesForLiveSite(html: string, line: string): string {
  if (!html.includes(BANNER)) throw new Error('the notices page has no test banner to replace');
  return html.replace(BANNER, line);
}

let cached: { mtimeMs: number; edition: NoticesEdition } | null = null;

/** The edition of the file beside the build, or undefined if it is missing or refused. */
export function noticesEdition(path = NOTICES_PATH): NoticesEdition | undefined {
  try {
    const m = statSync(path).mtimeMs;
    if (cached === null || cached.mtimeMs !== m) cached = { mtimeMs: m, edition: buildNoticesEdition(readFileSync(path, 'utf8')) };
    return cached.edition;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ the complaint form */

const ABOUT = new Set(['how_obtained', 'what_doing', 'not_told', 'answer_to_request', 'retention', 'other']);
const RIGHTS = new Set(['access', 'rectify', 'erase', 'object', 'restrict']);

export type ComplaintFormResult = { ok: true; id: string; ref: string; received_at: string } | { ok: false; why: string };

const clean = (v: string | null, max: number): string | null => {
  const t = (v ?? '').replace(/\u0000/g, '').trim();
  return t === '' ? null : t.slice(0, max);
};

/** Keep a complaint sent through the page, with when it arrived, and email it to the data protection address. */
export function receiveComplaintForm(app: App, f: URLSearchParams, source: string, newId: () => string): ComplaintFormResult {
  if (!rateLimit(app.deps, 'complaint-from:' + hashToken(source), COMPLAINT_SOURCE_LIMIT)) {
    return { ok: false, why: `We have had a lot of complaints from where you are in a short time. Please wait a few minutes, or email ${DP_MAIL}.` };
  }
  const name = clean(f.get('name'), 200);
  const reply_to = clean(f.get('reply_to'), 320);
  const verbatim = clean(f.get('complaint_verbatim'), 20000);
  if (name === null) return { ok: false, why: 'Tell us your name.' };
  if (reply_to === null) return { ok: false, why: 'Tell us how to reply to you: an email address or a postal address.' };
  if (verbatim === null) return { ok: false, why: 'Tell us what your complaint is about, in your own words.' };
  const on = f.get('on_behalf');
  const about = f.get('about');
  const rights = f.getAll('rights[]').filter((r) => RIGHTS.has(r));
  const id = newId();
  const at = app.now();
  insertComplaintForms(app.db, [id, at, name, reply_to, on === 'self' || on === 'other' ? on : null, clean(f.get('authority_detail'), 2000), clean(f.get('matching_info'), 2000),
      about !== null && ABOUT.has(about) ? about : null, verbatim, clean(f.get('remedy_sought'), 5000), JSON.stringify(rights)]);
  const ref = refOf(id);
  app.email.send({
    to_email: DP_MAIL, kind: 'NOTIFICATION',
    subject: `A complaint through the public notices page, ${ref}`,
    body: `A complaint arrived through the complaint form on the public notices page at ${at} (UTC). Its thirty days run `
      + `from then. Log it from Compliance, then Complaints, in the back office, where it is listed until it is logged.\n\n`
      + `Reference: ${ref}\nName: ${name}\nReply to: ${reply_to}\n`
      + `${on === 'other' ? `Made for someone else. Their authority: ${clean(f.get('authority_detail'), 2000) ?? 'not given'}\n` : ''}`
      + `\nWhat they said:\n${verbatim}\n`,
  });
  app.audit.append({ at, kind: 'COMPLAINT_FORM_RECEIVED', outcome: 'ALLOWED', object_type: 'complaint_form', object_id: id, detail: { ref } });
  return { ok: true, id, ref, received_at: at };
}
