/**
 * THE LIVE WEBSITE'S OWN TIMERS — every scheduled job, woken by Vercel Cron. (the developer
 * question pack, D11: "Vercel Cron on the Pro plan for the live website, each call carrying its own secret word and
 * writing a log line").
 *
 * THE JOBS, LISTED FROM THE CODE (src/app/cli.ts's scheduled commands, and what the reply timer's call already did):
 *   every-five-minutes  read email replies (at most once every two minutes, as the reply timer does); clear photo and
 *                       video uploads never finished within a day, and upload pieces never taken; try again any email
 *                       that could not be sent at the moment it was saved (retryUnsent, below); and (Phase 161m2) the
 *                       engagement letter reminder and the evening documents-received email to clients.
 *   nightly             the clean-up jobs: kept originals past their time (sweep-originals), messages and closed
 *                       enquiries past theirs (each switched off until the data protection officer sets the periods,
 *                       and then it says so), and the audit chain checked end to end.
 *   backup              the nightly backup (src/integrations/backup.ts): the database and the document store, locked, to the second
 *                       place. Its own call, so its time limit is its own.
 * The land boundary sweep (sweep-land-boundaries) is not here: the live website keeps no land boundary file (no
 * CAPREBATE_INSPIRE_STORE_DIR; LIVE-RUNBOOK.md says why), so it has nothing to sweep.
 *
 * THE WORD. Vercel Cron calls GET <path> with "Authorization: Bearer <CRON_SECRET>", CRON_SECRET being one setting of
 * the project (vercel.com/docs/cron-jobs/manage-cron-jobs, read 7 Nov 2026). Vercel sends that ONE word with every job:
 * a word per job, which the phase asked for, is not something Vercel Cron can send, so every job's call carries the
 * project's word and is refused without it. Compared in constant time; 32 characters or more, or every call is refused.
 * The answer carries counts only, never an address, a name or a word of any email.
 *
 * A LOG LINE EACH RUN: "timer <job>: ..." with the same counts, so the function log shows every run and what it did.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AuditLog, sweepPieces } from '../core/index.ts';
import { runNightlyBackup } from '../integrations/index.ts';
import type { App, SecretStore } from '../core/index.ts';
import type { FsObjectStore } from '../shared/index.ts';
import { inboundEmailModule as IE } from '../modules/crm/index.ts';
import { sweepUploads } from '../modules/survey/index.ts';
import { sweepVideos } from '../modules/survey/index.ts';
import { sweepOriginals, openKeptOriginal } from '../modules/claims/index.ts';
import { documentsReceivedDigest, letterRemindersDue } from '../modules/claims/index.ts';
import { MESSAGE_RETENTION } from '../modules/clients/index.ts';
import { sweepMessages } from '../modules/crm/index.ts';
import { sweepEnquiries } from '../modules/public-site/index.ts';
import { ENQUIRY_RETENTION } from '../modules/clients/index.ts';
import { EMAIL_SENDING, auditMailConnections, dispatchOutbox, mailWhere, sendingOn, smtpLoginFromKeyFile, smtpProvider } from '../integrations/index.ts';
import { isInventedAddress } from '../integrations/index.ts';
import { listOutboxIdToEmailBySendRequestedSentAt, updateOutboxLastErrorByIdLastError, updateOutboxLastErrorByIdSentAt, updateOutboxLastErrorByIdSentAt2 } from '../integrations/index.ts';

export const TIMER_JOBS = Object.freeze(['every-five-minutes', 'nightly', 'backup'] as const);
export type TimerJob = (typeof TIMER_JOBS)[number];
export const TIMER_PATH_PREFIX = '/hooks/timer/';
export const CRON_SECRET_MIN_LENGTH = 32;

/** The schedules vercel.ts gives Vercel Cron on the live project (UTC). A test holds the two equal. */
export const TIMER_SCHEDULES: Readonly<Record<TimerJob, string>> = Object.freeze({
  'every-five-minutes': '*/5 * * * *',
  nightly: '30 1 * * *',
  backup: '0 2 * * *',
});

export function timerJobOf(path: string): TimerJob | null {
  if (!path.startsWith(TIMER_PATH_PREFIX)) return null;
  const job = path.slice(TIMER_PATH_PREFIX.length);
  return (TIMER_JOBS as readonly string[]).includes(job) ? job as TimerJob : null;
}

/** Why a timer call is refused, in words it can show (never the word itself), or null when it may run. */
export function timerWordRefusal(store: SecretStore, authorization: string | undefined): string | null {
  const want = (store.forOwner('TIMERS').get('CRON_SECRET') ?? '').trim();
  if (want.length < CRON_SECRET_MIN_LENGTH) return `no word is set on the website (CRON_SECRET, ${CRON_SECRET_MIN_LENGTH} characters or more)`;
  const sent = (authorization ?? '').trim();
  if (sent === '') return 'no word was sent';
  const got = /^Bearer\s+(\S+)$/i.exec(sent)?.[1] ?? '';
  const a = Buffer.from(got, 'utf8'), b = Buffer.from(want, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b) ? null : 'the word sent does not match the one set on the website';
}

/** An email saved while sending was on is tried again only while it is this young. */
export const RETRY_HOURS = 24;
/** One left "Being sent." this long ago was dropped by a copy that stopped; it may be tried again. */
export const STUCK_MINUTES = 15;
/** The moment of saving is the first try (src/app/server.ts, sendSaved); the timer waits this long before a second. */
export const FIRST_TRY_MINUTES = 2;
const COULD_NOT = 'It could not be sent just now.';
const BEING_SENT = 'Being sent.';

/**
 * TRY AGAIN THE EMAILS THAT COULD NOT BE SENT. Only rows that are safe to try again: never sent, asked to be sent, under
 * a day old, and either never tried (its copy stopped before it could), or "could not be sent just now", or left
 * "Being sent." by a copy that stopped. A row refused for a reason that will not change (do not contact, a bounced
 * address, no sender, a lost file, the mail server's refusal) keeps its reason and is never tried again here; an
 * invented address is never sent to. Each row is claimed before it is sent, so two copies never send one email twice.
 */
export async function retryUnsent(app: App, store: FsObjectStore, limit = 50): Promise<{ tried: number; sent: number; state: 'OFF' | 'RAN' }> {
  const login = smtpLoginFromKeyFile(app.secrets);
  if (!sendingOn(EMAIL_SENDING, login, mailWhere(app)) || login === null) return { tried: 0, sent: 0, state: 'OFF' };
  const now = Date.parse(app.now());
  const iso = (ms: number): string => new Date(ms).toISOString();
  const rows = rowsToRetry(app.db, app.now(), limit);
  if (rows.length === 0) return { tried: 0, sent: 0, state: 'RAN' };
  const provider = smtpProvider(login, app.smtpConnect, 15_000, auditMailConnections(app.audit, app.now));
  let tried = 0, sent = 0;
  for (const r of rows) {
    if (isInventedAddress(r.to_email)) {
      updateOutboxLastErrorByIdSentAt(app.db, ['An invented address, so it was not sent.', r.id]);
      continue;
    }
    const claimed = updateOutboxLastErrorByIdSentAt2(app.db, [BEING_SENT, r.id, COULD_NOT, BEING_SENT, iso(now - STUCK_MINUTES * 60_000)]);
    if (claimed.changes !== 1) continue;
    tried++;
    try {
      const out = await dispatchOutbox({ db: app.db, now: app.now }, EMAIL_SENDING, login, provider, async (doc) => {
        const k = await openKeptOriginal({ db: app.db, store, now: app.now, audit: app.audit }, { id: 'system', role: 'SYSTEM' }, doc);
        return k === null ? null : { filename: k.filename, content_type: 'application/octet-stream', bytes: k.bytes };
      }, r.id);
      if (out.state === 'RAN') sent += out.sent;
    } catch {
      updateOutboxLastErrorByIdLastError(app.db, [COULD_NOT, r.id, BEING_SENT]);
    }
  }
  return { tried, sent, state: 'RAN' };
}

/** The rows retryUnsent would try (see it for which, and why). Reads only. */
export function rowsToRetry(db: App['db'], nowIso: string, limit = 50): { id: string; to_email: string }[] {
  const now = Date.parse(nowIso);
  const iso = (ms: number): string => new Date(ms).toISOString();
  return listOutboxIdToEmailBySendRequestedSentAt<{ id: string; to_email: string }>(db, [iso(now - RETRY_HOURS * 3_600_000), iso(now - FIRST_TRY_MINUTES * 60_000), COULD_NOT, BEING_SENT, iso(now - STUCK_MINUTES * 60_000), limit]);
}

export type TimerResult = { readonly ok: boolean; readonly line: string };

/** Runs one job. Never throws: a step that fails is said in the line (its error's name only), and the others still run. */
export async function runTimerJob(d: { app: App; store: FsObjectStore }, job: TimerJob, env: Readonly<Record<string, string | undefined>> = process.env): Promise<TimerResult> {
  const parts: string[] = [];
  let ok = true;
  const step = async (name: string, f: () => Promise<string>): Promise<void> => {
    try {
      parts.push(`${name} ${await f()}`);
    } catch (e) {
      ok = false;
      parts.push(`${name} failed (${e instanceof Error ? e.name : 'an error'})`);
    }
  };
  const app = d.app;
  const deps = { db: app.db, audit: app.audit, now: app.now, newId: () => randomUUID() };
  if (job === 'every-five-minutes') {
    await step('replies:', async () => {
      const r = await IE.readRepliesIfDue(app);
      return r === null ? 'read in the last two minutes' : r.state === 'OFF' ? 'off' : `read ${r.read}, filed ${r.filed}, to sort ${r.queued}`;
    });
    await step('unfinished photos cleared:', async () => String(await sweepUploads({ db: app.db, now: app.now }, d.store)));
    await step('unfinished videos cleared:', async () => String(await sweepVideos({ db: app.db, now: app.now }, d.store)));
    await step('upload pieces cleared:', async () => String(await sweepPieces({ db: app.db, now: app.now }, d.store)));
    // Phase 161m2: the two timed client emails. Each decides for itself whether anything is due (the reminder once,
    // five working days after a letter was sent and not signed; the documents digest once a UK day, from 18:00) and
    // only queues the email: the retry step below, and the outbox's own rules, decide whether it goes.
    const origin = (env['CAPREBATE_PUBLIC_ORIGIN'] ?? '').trim() || undefined;
    await step('letter reminders:', async () => {
      const r = letterRemindersDue(app, app.now(), origin);
      return `${r.reminded} due, ${r.queued} waiting to send`;
    });
    await step('documents received emails:', async () => {
      const r = documentsReceivedDigest(app, app.now(), origin);
      return r.state === 'NOT_YET' ? 'not yet (from 18:00)' : `${r.clients} clients, ${r.queued} waiting to send`;
    });
    await step('emails tried again:', async () => {
      const r = await retryUnsent(app, d.store);
      return r.state === 'OFF' ? 'sending is off' : `${r.tried}, sent ${r.sent}`;
    });
  } else if (job === 'nightly') {
    await step('kept originals deleted:', async () => String(await sweepOriginals({ db: app.db, store: d.store, now: app.now, audit: app.audit }, null)));
    await step('messages:', async () => {
      const r = sweepMessages(deps, MESSAGE_RETENTION, null);
      return r.state === 'OFF' ? 'clean-up off' : `${r.client_messages + r.team_messages + r.emails} deleted`;
    });
    await step('closed enquiries:', async () => {
      const r = sweepEnquiries(deps, ENQUIRY_RETENTION, null);
      return r.state === 'OFF' ? 'clean-up off' : `${r.deleted} deleted`;
    });
    await step('audit chain:', async () => {
      const log = new AuditLog(app.db);
      const v = log.verify();
      if (!v.intact) ok = false;
      return v.intact ? `intact (${log.entries().length} entries)` : `BROKEN at entry ${String(v.broken_at ?? '?')}`;
    });
  } else {
    await step('backup:', async () => {
      const r = await runNightlyBackup({ db: app.db, store: d.store, secrets: app.secrets, outside: app.outside, now: app.now }, env);
      if (!r.ok) ok = false;
      return r.why;
    });
  }
  return { ok, line: `timer ${job}: ${parts.join('; ')}` };
}
