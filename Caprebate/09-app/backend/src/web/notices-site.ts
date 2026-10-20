/**
 * THE PUBLIC NOTICES PAGE ON THE TEST WEBSITE, AND ITS COMPLAINT FORM — PHASE 160f, 20 October 2026.
 *
 * The stress test of 19 October 2026 found /privacy and /notices saying the notices "are being prepared" while the
 * contact form and the assessment already took names, emails and phone numbers. The page is drafted in full
 * (03-app/caprebate-notices-page.html, Phase 99 onwards); Lakhbir: "Build and publish on test". Its four facts nobody
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
 * time (`logFormComplaint`). Nothing the person typed is ever drawn as HTML.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { rateLimit } from '../auth.ts';
import { hashToken } from '../users.ts';
import type { Db } from '../db.ts';
import { logComplaint } from './compliance-rights.ts';
import { assertComplianceWrite, type ComplianceDeps } from './compliance.ts';
import { plainDashes } from './plain-dashes.ts';

export const NOTICES_PATH = join(import.meta.dirname, '..', '..', '..', '..', '03-app', 'caprebate-notices-page.html');
/** Where the page sends people about their data, and where a complaint from its form is emailed. */
export const DP_MAIL = 'data.protection@caprebate.co.uk';
/** Complaints from one network address in the 15-minute window, before the form says to wait. */
export const COMPLAINT_SOURCE_LIMIT = 10;

const BANNER = '<p class="draft-banner" role="note"><strong>Draft, on our test website.</strong> The facts marked '
  + '<span class="proposed">Proposed</span> are our advice. Our data protection officer has not checked them yet. '
  + 'This page is not final.</p>';

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
  // No long dash in the words a person reads (the house rule; src/web/plain-dashes.ts, as every page page() draws).
  html = plainDashes(html);
  if (!html.includes('draft-banner')) throw new Error('the notices page has no place for the draft banner');
  return { html, css: (style[1] ?? '') + BANNER_CSS };
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
  app.db.run(
    'INSERT INTO complaint_forms (id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, about, complaint_verbatim, remedy_sought, rights) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, at, name, reply_to, on === 'self' || on === 'other' ? on : null, clean(f.get('authority_detail'), 2000), clean(f.get('matching_info'), 2000),
      about !== null && ABOUT.has(about) ? about : null, verbatim, clean(f.get('remedy_sought'), 5000), JSON.stringify(rights)],
  );
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

/** A short reference the person can quote: CF- and the first eight characters of the id. */
export function refOf(id: string): string {
  return `CF-${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
}

export type WaitingForm = { id: string; ref: string; received_at: string; name: string; reply_to: string; complaint_verbatim: string };

/** The complaints sent through the form and not yet logged, oldest first. */
export function waitingForms(db: Db): WaitingForm[] {
  return db.all<{ id: string; received_at: string; name: string; reply_to: string; complaint_verbatim: string }>(
    'SELECT id, received_at, name, reply_to, complaint_verbatim FROM complaint_forms WHERE logged_complaint_id IS NULL ORDER BY received_at',
  ).map((r) => ({ ...r, ref: refOf(r.id) }));
}

/** Log a form complaint into the complaints log, received when it arrived, and mark it logged. */
export function logFormComplaint(d: ComplianceDeps, actor: Actor, id: string): { ok: true; id: string } | { ok: false; why: string } {
  assertComplianceWrite(actor);
  const f = d.db.get<{ id: string; received_at: string; name: string; reply_to: string; on_behalf: string | null; authority_detail: string | null;
    matching_info: string | null; complaint_verbatim: string; remedy_sought: string | null; rights: string; logged_complaint_id: string | null }>(
    'SELECT id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, complaint_verbatim, remedy_sought, rights, logged_complaint_id FROM complaint_forms WHERE id = ?', [id]);
  if (f === undefined) return { ok: false, why: 'That complaint was not found.' };
  if (f.logged_complaint_id !== null) return { ok: false, why: 'That complaint is already in the log.' };
  const rights = JSON.parse(f.rights) as string[];
  const described = `${f.name}, reply to ${f.reply_to}`
    + `${f.on_behalf === 'other' ? `, made for someone else (authority: ${f.authority_detail ?? 'not given'})` : ''}`
    + `${f.matching_info === null ? '' : `. To find their records: ${f.matching_info}`}`;
  const verbatim = f.complaint_verbatim
    + `${f.remedy_sought === null ? '' : `\n\nWhat they want: ${f.remedy_sought}`}`
    + `${rights.length === 0 ? '' : `\n\nRights they asked about: ${rights.join(', ')}`}`;
  const r = logComplaint(d, actor, {
    received_at: f.received_at, received_via: 'FORM', received_via_detail: `the complaint form on the public notices page (${refOf(f.id)})`,
    complainant_as_described: described.slice(0, 2000), complaint_verbatim: verbatim.slice(0, 20000),
  });
  if (!r.ok) return { ok: false, why: r.why ?? 'It could not be logged.' };
  d.db.run('UPDATE complaint_forms SET logged_complaint_id = ?, logged_at = ?, logged_by = ? WHERE id = ? AND logged_complaint_id IS NULL', [r.id, d.now(), actor.id, id]);
  return { ok: true, id: r.id };
}
