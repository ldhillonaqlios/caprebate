/**
 * CHAT BECOMES COMMUNICATION — 1 October 2026 (mock-up approved by Lakhbir: "approved").
 *
 * Lakhbir: "When i click on chat … it should be a chat window, drop down box choosing whats app, email, or portal or
 * internal team only. it should then have a message box (and subject line if needed) … on the right hand side it should
 * be a whole conversation flow, emails, whats app messages, portal messages and internal team chat … log a call can be on
 * here as well. and the chat word turns in to communication". Then: "click on the boxes on the right, clicking
 * essentially acts like a reply, with the drop down box automatically changing … the email and also number should auto
 * populate"; and "zoom calls on here also … starts to call them, or allows us to book it in … see when a zoom call was
 * held … a search feature".
 *
 * LEFT, ONE FORM (POST /staff/clients/:id/communicate). "Send by": Email · WhatsApp · Portal message · Team only ·
 * Zoom call · Log a call. The boxes for the choice show (CSS :has — the back office allows no script); the server reads
 * `via` and does exactly what that way of writing always did, with every rule it always had:
 *   email      F.saveEmail (To filled in and changeable; a reply keeps the conversation's Message-IDs), sent now if on
 *   whatsapp   W.sendWhatsApp (the contact's number; the 24-hour rule)
 *   portal     M.postClientMessage
 *   team       addNote (the team thread; the client never sees it)
 *   zoom       start now (a meeting at once; the host page opens) or book a free hour from your own diary; the client is
 *              emailed the time and the link (sendVideoInvite), which then shows in the conversation
 *   call       a telephone call logged (migration 069, call_logs), with an optional follow-up task
 * A refusal draws the form again with what was typed (never lost), and why.
 *
 * RIGHT, THE WHOLE CONVERSATION, newest at the bottom: portal messages, emails both ways (but never a sign-in code, and
 * not the "you have a new message" alerts), WhatsApp both ways, team notes, logged calls, and Zoom calls (booked; started
 * when the host first opened it). Each box is a link that makes the left a reply to it — the way it came, with the
 * address or number filled in. Filters by kind (?show=) and a search (?q=), the words found marked. A red line marks
 * what came since this person last looked; opening the tab reads it all (the red dot goes).
 *
 * Who: the conversation for a login that may read the client's messages (Admin, Sales; the view-only login reads it and
 * writes nothing). Team notes only where the login may read them. Each way of writing only where its own rule allows.
 */

import { randomUUID } from 'node:crypto';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { savedMessage } from './components.ts';
import { localClock, localDate, localPartsOf, localStamp, ukDate, WEEKDAY_NAMES } from './localtime.ts';
import * as M from './messages.ts';
import * as W from './whatsapp.ts';
import * as F from './free-email.ts';
import { emailChains, reSubject } from './email-chains.ts';
import { addNote } from './engaged.ts';
import { createTask } from './tasks.ts';
import { mayArrangeCalls } from './backoffice.ts';
import { addLocalDays, isBookable, SLOT_MINUTES, staffSlots, startOfLocalDay } from './schedule.ts';
import { activeMeeting, reconcileVideoMeeting, zoomBlockers } from './video-calls.ts';
import { sendVideoInvite } from './booking-invite.ts';
import { sendSavedEmailNow } from './free-email-pages.ts';
import { EMAIL_SENDING, mailWhere, smtpLoginFromKeyFile, sendingOn, SENT_SECRET_KINDS } from '../stubs/email-provider.ts';
import { MAX_WHATSAPP_TEXT, WINDOW_HOURS, whatsappMissing } from '../connectors/whatsapp.ts';
import type { FsObjectStore } from './objectstore.ts';
import * as IE from './inbound-email.ts';
import { emailedFiles } from './messages-pages.ts';
import { receivableTypes } from './documents.ts';

export type Via = 'email' | 'whatsapp' | 'portal' | 'team' | 'zoom' | 'call';
export type Kind = Via;

const VIA_LABEL: Readonly<Record<Via, string>> = {
  email: 'Email', whatsapp: 'WhatsApp', portal: 'Portal message', team: 'Team only (internal note)', zoom: 'Zoom call', call: 'Log a call',
};
const KIND_CHIP: Readonly<Record<Kind, string>> = { email: 'Email', whatsapp: 'WhatsApp', portal: 'Portal', team: 'Team only', zoom: 'Zoom', call: 'Call' };
const SHOW: readonly Kind[] = ['email', 'whatsapp', 'portal', 'team', 'call', 'zoom'];
const OUTCOME: Readonly<Record<string, string>> = { SPOKE: 'Spoke to them', NO_ANSWER: 'No answer', VOICEMAIL: 'Left a voicemail' };

export type FeedItem = {
  readonly id: string; readonly at: string; readonly kind: Kind; readonly ours: boolean;
  readonly who: string; readonly subject: string | null; readonly body: string; readonly meta: string | null;
  readonly isNew: boolean;
  /** Where clicking it goes: the reply's address on this page, or (a Zoom call open to join) the call itself. */
  readonly href: string; readonly hint: string;
};

type Ctx = { app: App; actor: Actor; business_id: string; now: string };

function base(c: Ctx): string { return `/staff/clients/${c.business_id}`; }
function replyHref(c: Ctx, qs: string): string { return `${base(c)}?chat=all&${qs}#compose`; }

/* ================================================================== *
 * THE CONVERSATION
 * ================================================================== */

export function feed(c: Ctx): FeedItem[] {
  const { app, actor, business_id, now } = c;
  const db = app.db;
  const obj = { type: 'client_message' as const, id: business_id, business_id };
  const mayClient = can(actor, 'client_message.read', obj);
  const mayTeam = can(actor, 'internal_note.read', { type: 'internal_note', id: business_id, business_id });
  const marks = M.readMarks(db, actor.id, business_id);
  const out: FeedItem[] = [];
  if (mayClient) {
    // Portal messages (emailed replies are in the email part, with their conversation).
    for (const m of M.clientThread(db, actor, business_id).messages) {
      if (m.by_email) continue;
      out.push({ id: `p-${m.id}`, at: m.at, kind: 'portal', ours: !m.from_client, who: m.who, subject: null, body: m.body,
        meta: m.about === null ? null : `About ${withoutRef(m.about)}`, isNew: m.from_client && m.at > marks.portal,
        href: replyHref(c, 'via=portal'), hint: 'Click to reply' });
    }
    // Emails, both ways, by conversation.
    for (const ch of emailChains(db, actor, { business_id, lead_id: null }, now)) {
      for (const e of ch.emails) {
        if (e.ours && /^You have a new message from Cap Rebate/.test(e.subject)) continue; // the portal's own alert
        out.push({ id: `e-${e.id}`, at: e.at, kind: 'email', ours: e.ours, who: e.who, subject: e.subject, body: e.body,
          meta: e.state, isNew: e.unread, href: replyHref(c, `via=email&thread=${encodeURIComponent(ch.key)}`), hint: 'Click to reply' });
      }
    }
    // WhatsApp, both ways. PHASE 156c: a message added from the phone's export says so, is never "new", and our side is
    // named as the phone named it. While the live connection is off, a click opens the WhatsApp page, not a reply here.
    const waLive = whatsappMissing(c.app.secrets, c.app.whatsappPolicy, { outside: c.app.outside }).length === 0;
    for (const w of db.all<{ id: string; created_at: string; direction: string; body: string; status: string; error: string | null; contact_id: string | null; contact: string | null; writer: string | null; phone: string; sender: string | null }>(
      'SELECT w.id, w.created_at, w.direction, w.body, w.status, w.error, w.contact_id, c.full_name AS contact, u.display_name AS writer, w.phone, l.sender FROM whatsapp_messages w ' +
      'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by LEFT JOIN whatsapp_import_lines l ON l.message_id = w.id ' +
      'WHERE w.business_id = ? ORDER BY w.created_at, w.id', [business_id])) {
      const ours = w.direction === 'OUT';
      const imported = w.sender !== null;
      const them = w.contact ?? `+${w.phone}`;
      out.push({ id: `w-${w.id}`, at: w.created_at, kind: 'whatsapp', ours,
        who: ours ? (imported ? `${w.sender} (on the phone), to ${them}` : `${w.writer ?? 'Cap Rebate'}, to ${them}`) : them, subject: null, body: w.body,
        meta: imported ? 'From the phone' : ours ? (w.status === 'NOT_SENT' ? `Not sent${w.error === null ? '' : ` — ${w.error}`}` : w.status === 'FAILED' ? 'Not delivered' : w.status.charAt(0) + w.status.slice(1).toLowerCase()) : null,
        isNew: !ours && !imported && w.created_at > marks.whatsapp,
        href: waLive ? replyHref(c, w.contact_id === null ? 'via=whatsapp' : `via=whatsapp&contact=${encodeURIComponent(w.contact_id)}`)
          : `/staff/clients/${business_id}/whatsapp${w.contact_id === null ? '' : `?contact=${encodeURIComponent(w.contact_id)}`}`,
        hint: waLive ? 'Click to reply' : 'Open the WhatsApp chat' });
    }
    // Calls logged.
    for (const k of db.all<{ id: string; logged_at: string; outcome: string; notes: string; contact_id: string | null; contact: string | null; writer: string | null }>(
      'SELECT k.id, k.logged_at, k.outcome, k.notes, k.contact_id, c.full_name AS contact, u.display_name AS writer FROM call_logs k LEFT JOIN contacts c ON c.id = k.contact_id ' +
      'LEFT JOIN users u ON u.id = k.logged_by WHERE k.business_id = ? ORDER BY k.logged_at, k.id', [business_id])) {
      out.push({ id: `k-${k.id}`, at: k.logged_at, kind: 'call', ours: true, who: `${k.writer ?? 'Cap Rebate'} called ${k.contact ?? 'them'}`, subject: null,
        body: k.notes === '' ? '(no notes)' : k.notes, meta: OUTCOME[k.outcome] ?? k.outcome, isNew: false,
        href: replyHref(c, k.contact_id === null ? 'via=call' : `via=call&contact=${encodeURIComponent(k.contact_id)}`), hint: 'Click to log another call' });
    }
    // Calls booked: Zoom (booked, and started when its host first opened it) and telephone.
    for (const b of db.all<{ id: string; channel: string; starts_at: string | null; ends_at: string | null; created_at: string; cancelled_at: string | null; who: string | null }>(
      "SELECT b.id, b.channel, b.starts_at, b.ends_at, b.created_at, b.cancelled_at, u.display_name AS who FROM bookings b LEFT JOIN users u ON u.id = b.assigned_to " +
      "WHERE b.business_id = ? AND b.channel IN ('video','phone') ORDER BY b.created_at, b.id", [business_id])) {
      const video = b.channel === 'video';
      const m = video ? db.get<{ host_opened_at: string | null; opener: string | null; meeting: number }>(
        'SELECT v.host_opened_at, u.display_name AS opener, 1 AS meeting FROM video_meetings v LEFT JOIN users u ON u.id = v.host_opened_by WHERE v.booking_id = ? ORDER BY v.created_at DESC LIMIT 1', [b.id]) : undefined;
      const open = video && b.cancelled_at === null && b.starts_at !== null && b.ends_at !== null && activeMeeting(db, b.id) !== undefined
        && Date.parse(now) >= Date.parse(b.starts_at) - 10 * 60_000 && Date.parse(now) <= Date.parse(b.ends_at);
      out.push({ id: `b-${b.id}`, at: b.created_at, kind: video ? 'zoom' : 'call', ours: true,
        who: `${video ? 'Zoom call' : 'Telephone call'} ${b.cancelled_at === null ? 'booked' : 'cancelled'}${b.who === null ? '' : ` with ${b.who}`}`,
        subject: b.starts_at === null ? 'No time yet' : `${dayWords(b.starts_at, now)}, ${localClock(b.starts_at)}${b.ends_at === null ? '' : `–${localClock(b.ends_at)}`}`,
        body: b.cancelled_at !== null ? 'Cancelled.' : video ? (m === undefined ? 'The Zoom link follows by email once the meeting is made.' : open ? 'It is time: click to start the call.' : 'The invite and its join link were emailed.') : 'We ring them at that time.',
        meta: null, isNew: false,
        href: open ? `/staff/calendar/${b.id}/video` : replyHref(c, video ? 'via=zoom' : 'via=call'), hint: open ? 'Start the call' : video ? 'Click to book another' : 'Click to log a call' });
      if (m !== undefined && m.host_opened_at !== null) {
        out.push({ id: `bz-${b.id}`, at: m.host_opened_at, kind: 'zoom', ours: true, who: `Zoom call started${m.opener === null ? '' : ` by ${m.opener}`}`,
          subject: null, body: `Opened at ${localClock(m.host_opened_at)}.`, meta: null, isNew: false, href: replyHref(c, 'via=zoom'), hint: 'Click to book another' });
      }
    }
  }
  if (mayTeam) {
    for (const n of M.teamThread(db, actor, business_id).messages) {
      out.push({ id: `t-${n.id}`, at: n.at, kind: 'team', ours: n.mine, who: n.who, subject: null, body: n.body,
        meta: n.about === null ? null : `About ${withoutRef(n.about)}`, isNew: !n.mine && n.at > marks.team, href: replyHref(c, 'via=team'), hint: 'Click to reply to your team' });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}

/** A claim in words, without its reference: a box is a link, and no link's text is a claim reference (Phase 134). */
function withoutRef(about: string): string {
  return about.replace(/\s*\(CR-[0-9A-Z-]+\)\s*$/, '');
}

function dayWords(iso: string, nowIso: string): string {
  const d = localDate(iso);
  if (d === localDate(nowIso)) return 'Today';
  if (d === localDate(addLocalDays(startOfLocalDay(nowIso), -1))) return 'Yesterday';
  const p = localPartsOf(Date.parse(iso));
  return `${WEEKDAY_NAMES[p.weekday] ?? ''} ${ukDate(d)}`;
}

/** The words found, marked; everything else as it is (escaped). */
function marked(text: string, q: string): Safe {
  if (q === '') return h`${text}`;
  const out: Safe[] = [];
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lower.indexOf(needle, i);
    if (j < 0) { out.push(h`${text.slice(i)}`); break; }
    out.push(h`${text.slice(i, j)}`, h`<mark>${text.slice(j, j + needle.length)}</mark>`);
    i = j + needle.length;
  }
  return h`${out}`;
}

function matches(f: FeedItem, q: string): boolean {
  if (q === '') return true;
  const n = q.toLowerCase();
  return [f.who, f.subject ?? '', f.body, f.meta ?? ''].some((t) => t.toLowerCase().includes(n));
}

/* ================================================================== *
 * THE COMPOSER
 * ================================================================== */

export type Prefill = {
  via: Via; to_email: string; subject: string; thread: string; contact_id: string; body: string; claim_id: string;
  outcome: string; next_title: string; next_on: string; slot: string; replying: string | null;
};

type Choice = { id: string; name: string; email: string | null; phone: string | null };

function people(c: Ctx): Choice[] {
  return c.app.db.all<{ id: string; full_name: string; email: string | null; phone: string | null }>(
    'SELECT id, full_name, email, phone FROM contacts WHERE business_id = ? ORDER BY full_name, id', [c.business_id])
    .map((p) => ({ id: p.id, name: p.full_name, email: p.email === null || p.email.trim() === '' ? null : p.email.trim(), phone: p.phone === null || p.phone.trim() === '' ? null : p.phone.trim() }));
}

/**
 * PHASE 156c: while WhatsApp is not connected live, the way in for a chat from the phone (src/web/whatsapp-import.ts).
 * Lakhbir, 5 Oct 2026: "doesnt it make sense to have the upload option on the companies conversation". The upload itself
 * opens on the WhatsApp page, with the person last on WhatsApp chosen: a real export is far bigger than the test website
 * takes at once, so that page runs a script that opens it on the person's computer — and this page carries no script
 * (test/phase133a: every page reached from home works without one).
 */
function whatsappAdd(c: Ctx): Safe {
  const obj = { type: 'client_message' as const, id: c.business_id, business_id: c.business_id };
  if (whatsappLive(c) || !can(c.actor, 'client_message.write', obj)) return raw('');
  const wa = W.phoneContacts(c.app.db, c.business_id, c.now);
  const who = lastOnWhatsApp(c) ?? wa[0]?.id ?? null;
  return h`<div class="wa-add" id="wa-add"><h3 id="wa-add-h">Add a WhatsApp chat</h3>
    <p class="help">Talk to them on the WhatsApp phone. To keep the conversation here: on the phone, open the chat, tap their name, then <strong>Export chat</strong> and <strong>Attach media</strong>, and add the .zip.</p>
    ${wa.length === 0 ? h`<p class="help">None of their contacts has a mobile number. Add one under People first.</p>`
      : h`<p><a class="btn" href="/staff/clients/${c.business_id}/whatsapp${who === null ? '' : `?contact=${encodeURIComponent(who)}`}#wa-import">Add a WhatsApp chat</a></p>`}</div>`;
}

/** The contact this company last spoke with on WhatsApp, if any: the one a new chat is most likely with. */
function lastOnWhatsApp(c: Ctx): string | null {
  return c.app.db.get<{ c: string | null }>("SELECT contact_id AS c FROM whatsapp_messages WHERE business_id = ? AND contact_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", [c.business_id])?.c ?? null;
}

function whatsappLive(c: Ctx): boolean {
  return whatsappMissing(c.app.secrets, c.app.whatsappPolicy, { outside: c.app.outside }).length === 0;
}

function mayVia(c: Ctx): Via[] {
  const { actor, business_id } = c;
  const obj = { type: 'client_message' as const, id: business_id, business_id };
  const out: Via[] = [];
  if (can(actor, 'email.queue', { type: 'email', id: business_id, business_id })) out.push('email');
  // PHASE 156c: WhatsApp is offered here only while the live connection is on; otherwise the box says to use the phone
  // and add the chat (see `composer`).
  if (can(actor, 'client_message.write', obj)) out.push(...(whatsappLive(c) ? ['whatsapp' as const] : []), 'portal');
  if (can(actor, 'internal_note.write', { type: 'internal_note', id: business_id, business_id })) out.push('team');
  if (mayArrangeCalls(actor) && can(actor, 'client_message.write', obj)) out.push('zoom');
  if (can(actor, 'client_message.write', obj)) out.push('call');
  return out;
}

/** What the form opens with: the reply asked for (?via=&thread= or &contact=), else email to the main contact. */
export function prefill(c: Ctx, ask: { via: string | null; thread: string | null; contact: string | null }): Prefill {
  const db = c.app.db;
  const ppl = people(c);
  const allowed = mayVia(c);
  const via = (allowed.includes(ask.via as Via) ? ask.via : allowed[0] ?? 'email') as Via;
  const mainEmail = db.get<{ e: string | null }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [c.business_id])?.e ?? null;
  const p: Prefill = {
    via, to_email: mainEmail ?? ppl.find((x) => x.email !== null)?.email ?? '', subject: '', thread: '', contact_id: '', body: '', claim_id: '',
    outcome: 'SPOKE', next_title: '', next_on: '', slot: '', replying: null,
  };
  // The person: the one asked for, else whoever last wrote on WhatsApp, else the first with a number.
  const lastWa = db.get<{ c: string | null }>("SELECT contact_id AS c FROM whatsapp_messages WHERE business_id = ? AND contact_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", [c.business_id])?.c ?? null;
  const person = ppl.find((x) => x.id === ask.contact) ?? ppl.find((x) => x.id === lastWa && x.phone !== null) ?? ppl.find((x) => x.phone !== null) ?? ppl[0];
  p.contact_id = person?.id ?? '';
  if (via === 'email' && ask.thread !== null) {
    const ch = emailChains(db, c.actor, { business_id: c.business_id, lead_id: null }, c.now).find((x) => x.key === ask.thread);
    if (ch !== undefined) {
      p.thread = ch.key; p.to_email = ch.reply_to; p.subject = reSubject(ch.subject); p.claim_id = ch.claim_id ?? '';
      p.replying = `the email “${ch.subject}”`;
    }
  }
  if (via === 'email' && ask.contact !== null) {
    const x = ppl.find((y) => y.id === ask.contact);
    if (x?.email !== null && x?.email !== undefined) p.to_email = x.email;
  }
  if ((via === 'whatsapp' || via === 'call') && ask.contact !== null && person !== undefined && person.id === ask.contact) {
    p.replying = via === 'whatsapp' ? `${person.name} on WhatsApp` : null;
  }
  return p;
}

function opt(value: string, label: string, sel: boolean): Safe {
  return h`<option value="${value}"${sel ? raw(' selected') : raw('')}>${label}</option>`;
}

export function composer(c: Ctx, p: Prefill, refused?: string): Safe {
  const allowed = mayVia(c);
  if (allowed.length === 0) return h`<p class="help">You can read this conversation, not write to it.</p>`;
  const db = c.app.db;
  const dnc = db.get<{ s: string | null }>('SELECT client_status AS s FROM businesses WHERE id = ?', [c.business_id])?.s === 'DO_NOT_CONTACT';
  const ppl = people(c);
  const claims = db.all<{ id: string; claim_ref: string; label: string | null }>(
    'SELECT c.id, c.claim_ref, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref', [c.business_id]);
  const wa = W.phoneContacts(db, c.business_id, c.now);
  const waMissing = whatsappMissing(c.app.secrets, c.app.whatsappPolicy, { outside: c.app.outside });
  const sendingNow = sendingOn(EMAIL_SENDING, smtpLoginFromKeyFile(c.app.secrets), mailWhere(c.app));
  // 1 Oct 2026: why Zoom makes no meeting from here, if it does not (the keys, the transfer, or not the test website).
  const zoomOff = zoomBlockers(c.app);
  // Zoom: this person's own free hours, the next fortnight.
  const slots = (() => {
    const s = staffSlots(db, c.now, addLocalDays(startOfLocalDay(c.now), 14), { onlyUser: c.actor.id, now: c.now });
    return s.available ? s.slots.slice(0, 80) : [];
  })();
  const byDay = new Map<string, string[]>();
  for (const s of slots) byDay.set(localDate(s.starts_at), [...(byDay.get(localDate(s.starts_at)) ?? []), s.starts_at]);
  const claimPick = claims.length === 0 ? raw('') : h`<div class="f"><label for="cm-claim">About which claim</label>
    <select class="fi" id="cm-claim" name="claim_id"><option value="">The whole company</option>${claims.map((k) => opt(k.id, `${k.label ?? 'A claim'} (${k.claim_ref})`, k.id === p.claim_id))}</select></div>`;
  const clientWays = dnc ? h`<div class="gate" role="note"><strong>You cannot write to this company.</strong> They asked us not to contact them. Team notes and logged calls still work.</div>` : raw('');
  return h`<form method="post" action="${base(c)}/communicate" class="composer" id="compose">
    ${refused === undefined ? raw('') : h`<p class="err" role="alert"><strong>Not sent.</strong> ${refused} What you typed is still here.</p>`}
    ${p.replying === null ? raw('') : h`<div class="replying"><span>Replying to ${p.replying}</span><a href="${base(c)}?chat=all#compose">Clear</a></div>`}
    ${clientWays}
    <div class="f"><label for="via">Send by</label>
      <select class="fi" id="via" name="via">${allowed.filter((v) => !dnc || v === 'team' || v === 'call').map((v) => opt(v, VIA_LABEL[v], v === p.via))}</select></div>
    <input type="hidden" name="thread" value="${p.thread}">

    <div class="only for-email">
      <div class="f"><label for="cm-to">To</label><input class="fi" id="cm-to" name="to_email" type="email" maxlength="254" list="cm-to-list" autocomplete="off" value="${p.to_email}">
        <datalist id="cm-to-list">${ppl.filter((x) => x.email !== null).map((x) => h`<option value="${x.email ?? ''}">${x.name}</option>`)}</datalist>
        <p class="hint">${p.thread === '' ? 'Filled in with their main address. Type another if needed.' : 'Filled in from the email you clicked. It stays in the same email thread in their inbox.'}</p></div>
      <div class="f"><label for="cm-subject">Subject</label><input class="fi" id="cm-subject" name="subject" maxlength="300" value="${p.subject}"></div>
      ${sendingNow ? raw('') : h`<p class="hint">Email sending is switched off: it is saved, not sent.</p>`}
    </div>
    <div class="only for-whatsapp">
      ${waMissing.length === 0 ? raw('') : h`<p class="hint">WhatsApp is not switched on yet: ${waMissing.join(' ')} It is kept here as not sent.</p>`}
      <div class="f"><label for="cm-wa">To</label>${wa.length === 0 ? h`<p class="hint">None of their contacts has a mobile number. Add one under People.</p>`
        : h`
          <select class="fi" id="cm-wa" name="wa_contact_id">${wa.map((x) => opt(x.id, `${x.name} — ${x.shown}`, x.id === p.contact_id))}</select>
          <p class="hint">${(() => { const x = wa.find((y) => y.id === p.contact_id) ?? wa[0]; return x === undefined ? '' : x.open_until === null
            ? `More than ${WINDOW_HOURS} hours since ${x.first} last wrote on WhatsApp: only our opening message can go. It asks them to reply.`
            : `You can write freely until ${localStamp(x.open_until, c.now)}.`; })()}</p>`}</div>
    </div>
    <div class="only for-portal"><p class="hint">They read it in their portal. ${sendingNow ? 'We email them that a message is waiting — never the message itself.' : ''}</p></div>
    <div class="only for-team"><p class="team-note">Only your team sees this. The client never does.</p></div>

    <div class="only for-msg">
      <div class="f"><label for="cm-body">Message</label><textarea class="fi" id="cm-body" name="body" rows="7" maxlength="20000">${p.body}</textarea></div>
      ${claimPick}
      <div class="sendrow">
        <button class="cta only-btn for-email" type="submit" name="go" value="send">${sendingNow ? 'Send email' : 'Save the email'}</button>
        <button class="cta only-btn for-whatsapp" type="submit" name="go" value="send">Send on WhatsApp</button>
        <button class="btn-quiet only-btn for-whatsapp" type="submit" name="go" value="opening">Send our opening message</button>
        <button class="cta only-btn for-portal" type="submit" name="go" value="send">Send to their portal</button>
        <button class="cta only-btn for-team" type="submit" name="go" value="send">Send to the team</button>
      </div>
    </div>

    <div class="only for-zoom">
      ${zoomOff.length === 0 ? raw('') : h`<p class="hint">Zoom is not switched on here: ${zoomOff.join(' ')} A call is still booked, with no Zoom meeting, so send them a link yourself.</p>`}
      <div class="f"><label for="cm-zoom-to">With</label><select class="fi" id="cm-zoom-to" name="zoom_to">${ppl.filter((x) => x.email !== null).map((x) => opt(x.email ?? '', `${x.name} — ${x.email ?? ''}`, x.id === p.contact_id))}</select></div>
      <div class="sendrow"><button class="cta" type="submit" name="go" value="zoom-now">Start a Zoom call now</button></div>
      <p class="hint">Opens the call here for you, and emails them the link to join.</p>
      <div class="or">or book it</div>
      <div class="f"><label for="cm-slot">A free hour in your diary</label>${slots.length === 0
        ? h`<p class="hint">You have no free hours in the next fortnight. Set your working times in Settings, or free some time in your calendar.</p>`
        : h`
          <select class="fi" id="cm-slot" name="slot">${[...byDay.entries()].map(([d, times]) => h`<optgroup label="${dayWords(times[0] ?? d, c.now)}">${times.map((t) => opt(t, `${dayWords(t, c.now)}, ${localClock(t)}`, t === p.slot))}</optgroup>`)}</select>`}</div>
      <div class="sendrow"><button class="cta" type="submit" name="go" value="zoom-book">Book and send the invite</button></div>
      <p class="hint">They get an email with the time, the join link and a calendar invite. It goes in your calendar too.</p>
    </div>

    <div class="only for-call">
      <div class="f"><label for="cm-call">Who did you speak to?</label><select class="fi" id="cm-call" name="call_contact_id">${ppl.map((x) => opt(x.id, `${x.name}${x.phone === null ? '' : ` — ${x.phone}`}`, x.id === p.contact_id))}</select></div>
      <div class="f"><label for="cm-outcome">How did it go?</label><select class="fi" id="cm-outcome" name="outcome">${Object.entries(OUTCOME).map(([k, v]) => opt(k, v, k === p.outcome))}</select></div>
      <div class="f"><label for="cm-notes">Notes</label><textarea class="fi" id="cm-notes" name="notes" rows="5" maxlength="4000">${p.via === 'call' ? p.body : ''}</textarea></div>
      <div class="f"><label for="cm-next">Next step <span class="help">(you do not have to)</span></label><input class="fi" id="cm-next" name="next_title" maxlength="300" value="${p.next_title}" placeholder="For example: chase the floor plans"></div>
      <div class="f"><label for="cm-next-on">By</label><input class="fi" id="cm-next-on" name="next_on" type="date" value="${p.next_on}"></div>
      <div class="sendrow"><button class="cta" type="submit" name="go" value="call">Save the call</button></div>
    </div>
  </form>`;
}

/* ================================================================== *
 * THE PANEL
 * ================================================================== */

const DONE: Readonly<Record<string, string>> = {
  'sent-email': 'Sent.', 'saved-email': 'Saved — emails are not being sent yet.', 'failed-email': 'Saved, but it could not be sent. The reason is on the email.',
  'sent-whatsapp': 'Sent on WhatsApp.', 'sent-opening': 'Our opening message is sent. When they reply, you can write freely for 24 hours.',
  'sent-portal': 'Sent. They will see it in their portal.', 'sent-team': 'Saved. Only your team can see it.',
  'logged-call': 'The call is logged.', 'booked-zoom': 'Booked. The invite with the join link is on its way to them.',
  'booked-no-zoom': 'Booked, but Zoom made no meeting, so the invite has no join link. Choose Zoom call to see why.',
};

export function communicationPanel(
  d: { app: App }, actor: Actor, business_id: string,
  q: { via: string | null; thread: string | null; contact: string | null; show: string | null; search: string | null; done: string | null; opened: boolean },
): { body: Safe; unread: number; started: boolean } | null {
  const app = d.app;
  const obj = { type: 'client_message' as const, id: business_id, business_id };
  if (!can(actor, 'client_message.read', obj) && !can(actor, 'internal_note.read', { type: 'internal_note', id: business_id, business_id })) return null;
  const c: Ctx = { app, actor, business_id, now: app.now() };
  const unread = M.newFromClient(app.db, actor, business_id) + M.unreadCount(app.db, actor, business_id, 'TEAM');
  const all = feed(c);
  // Opening the tab reads it all: the red dot goes. The lines marked new are the ones from before this visit.
  if (q.opened) {
    const deps = { db: app.db, audit: app.audit, now: app.now, newId: () => randomUUID() };
    M.markRead(deps, actor, business_id, 'CLIENT');
    M.markRead(deps, actor, business_id, 'TEAM');
    M.markChannelRead(deps, actor, business_id, 'EMAIL');
    M.markChannelRead(deps, actor, business_id, 'WHATSAPP');
  }
  const show = SHOW.includes(q.show as Kind) ? (q.show as Kind) : null;
  const search = (q.search ?? '').trim().slice(0, 100);
  const shown = all.filter((f) => (show === null || f.kind === show) && matches(f, search));
  const counts = new Map<Kind, number>();
  for (const f of all) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  const link = (k: Kind | null): string => `${base(c)}?chat=all${k === null ? '' : `&show=${k}`}${search === '' ? '' : `&q=${encodeURIComponent(search)}`}#chat`;
  // Newest at the bottom, and the list opens there: drawn newest first in a column-reverse list.
  const lines: Safe[] = [];
  let lastDay = '';
  let newLine = false;
  for (const f of shown) {
    const day = dayWords(f.at, c.now);
    if (day !== lastDay) { lines.push(h`<li class="day">${day}</li>`); lastDay = day; }
    if (f.isNew && !newLine && search === '') { lines.push(h`<li class="newline"><span>New since you last looked</span></li>`); newLine = true; }
    lines.push(h`<li class="cm-li"><a class="it it-${f.kind}${f.ours ? ' ours' : ''}" href="${f.href}">
      <p class="meta"><span class="ch ch-${f.kind}">${KIND_CHIP[f.kind]}</span> <span class="who">${marked(f.who, search)}</span> · ${localClock(f.at)}${f.meta === null ? '' : h` · ${marked(f.meta, search)}`}${f.isNew ? h` <span class="new-pill">New</span>` : raw('')}<span class="reply-hint">${f.hint} ↩</span></p>
      ${f.subject === null ? raw('') : h`<p class="subj">${marked(f.subject, search)}</p>`}
      <p class="body">${marked(f.body, search)}</p></a></li>`);
  }
  const p = prefill(c, { via: q.via, thread: q.thread, contact: q.contact });
  const doneWords = q.done === null ? undefined : DONE[q.done];
  // Kept from the old Chat: WhatsApp from a number no single company has; reading replies now; files that came by email.
  const unfiled = W.unfiledWhatsApp(app.db, actor, c.now).length;
  const last = IE.lastReadWords(app);
  const check = IE.mayReadQueue(actor) ? h`<div class="help echeck"><form method="post" action="/staff/replies/check" class="inline"><input type="hidden" name="back" value="${base(c)}?chat=all"><button class="linkish" type="submit">Check for new email replies</button></form>${
    last === null ? raw('') : h` · <span${last.ok ? raw('') : raw(' class="echeck-bad"')}>Last checked ${localStamp(last.at, c.now)}: ${last.words}</span>`}</div>` : raw('');
  const types = IE.mayReadQueue(actor) ? receivableTypes(app.db) : [];
  const fileForms = can(actor, 'client_message.read', obj) && types.length > 0
    ? M.clientThread(app.db, actor, business_id).messages.filter((m) => m.by_email).map((m) => ({ m, f: emailedFiles(app.db, actor, m, types, business_id) }))
      .filter((x) => String(x.f) !== '')
    : [];
  const body = h`${doneWords === undefined ? raw('') : savedMessage(doneWords)}
    <div class="comms">
      <section class="pane" aria-labelledby="cm-write-h"><h2 id="cm-write-h">Send a message</h2>${composer(c, p)}${whatsappAdd(c)}</section>
      <section class="pane" aria-labelledby="cm-flow-h"><h2 id="cm-flow-h">The whole conversation</h2>
        <form method="get" action="${base(c)}#chat" class="searchrow" role="search"><input type="hidden" name="chat" value="all">${show === null ? raw('') : h`<input type="hidden" name="show" value="${show}">`}
          <label class="vh" for="cm-q">Search this conversation</label><input class="fi" id="cm-q" name="q" type="search" maxlength="100" value="${search}" placeholder="Search this conversation — words, names, subjects…">
          <button class="btn" type="submit">Search</button></form>
        ${check}
        ${unfiled === 0 ? raw('') : h`<p class="help"><a href="/staff/whatsapp">${unfiled === 1 ? 'One WhatsApp message' : `${String(unfiled)} WhatsApp messages`} from a number we do not know yet — file ${unfiled === 1 ? 'it' : 'them'}</a></p>`}
        ${search === '' ? raw('') : h`<p class="found">${String(shown.length)} found for “${search}” · <a href="${base(c)}?chat=all${show === null ? '' : `&show=${show}`}#chat">Show everything</a></p>`}
        <nav class="filters" aria-label="Show only">${[h`<a href="${link(null)}"${show === null ? raw(' aria-current="page"') : raw('')}>All ${String(all.length)}</a>`,
          ...SHOW.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => h`<a href="${link(k)}"${show === k ? raw(' aria-current="page"') : raw('')}>${KIND_CHIP[k]} ${String(counts.get(k) ?? 0)}</a>`)]}</nav>
        ${shown.length === 0 ? h`<p class="empty">${all.length === 0 ? 'Nothing with them yet. Write the first on the left.' : 'Nothing matches.'}</p>`
          : h`<ol class="flow">${[...lines].reverse()}</ol>`}
        ${fileForms.length === 0 ? raw('') : h`<div class="cm-files"><h3>Files that came by email</h3>${fileForms.map((x) => h`<p class="help">With the email of ${localStamp(x.m.at, c.now)} from ${x.m.who}:</p>${x.f}`)}</div>`}
      </section>
    </div>`;
  return { body, unread, started: all.length > 0 };
}

/* ================================================================== *
 * SENDING — POST /staff/clients/:id/communicate
 * ================================================================== */

export type SendDeps = { app: App; store: FsObjectStore; newId: () => string; origin: string };
export type SendResult = { ok: true; to: string } | { ok: false; why: string; prefill: Prefill };

export async function communicate(d: SendDeps, actor: Actor, business_id: string, f: URLSearchParams): Promise<SendResult> {
  const c: Ctx = { app: d.app, actor, business_id, now: d.app.now() };
  const db = d.app.db;
  const via = (f.get('via') ?? '') as Via;
  const go = f.get('go') ?? 'send';
  const body = (f.get('body') ?? '').trim();
  const claim = (f.get('claim_id') ?? '').trim();
  const keep = (why: string): SendResult => ({ ok: false, why, prefill: {
    via: mayVia(c).includes(via) ? via : 'email', to_email: f.get('to_email') ?? '', subject: f.get('subject') ?? '', thread: f.get('thread') ?? '',
    contact_id: f.get('wa_contact_id') ?? f.get('call_contact_id') ?? '', body: via === 'call' ? (f.get('notes') ?? '') : (f.get('body') ?? ''), claim_id: claim,
    outcome: f.get('outcome') ?? 'SPOKE', next_title: f.get('next_title') ?? '', next_on: f.get('next_on') ?? '', slot: f.get('slot') ?? '', replying: null } });
  if (!mayVia(c).includes(via)) return keep('Choose how to send it.');
  const back = (done: string): string => `/staff/clients/${business_id}?chat=all&done=${done}#chat`;
  const deps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  if (via === 'email') {
    const login = smtpLoginFromKeyFile(d.app.secrets);
    const r = F.saveEmail({ ...deps, sending: EMAIL_SENDING, login, where: mailWhere(d.app) }, actor, { kind: 'company', id: business_id },
      { to_email: f.get('to_email'), subject: f.get('subject'), body, claim_id: claim, thread: f.get('thread') }, []);
    if (!r.ok) return keep(r.why);
    const out = r.requested ? await sendSavedEmailNow({ app: d.app, store: d.store }, actor, EMAIL_SENDING, login, r.id) : 'saved';
    return { ok: true, to: back(`${out}-email`) };
  }
  if (via === 'whatsapp') {
    const opening = go === 'opening';
    const r = await W.sendWhatsApp(d.app, actor, business_id, { contact_id: f.get('wa_contact_id') ?? '', body: opening ? '' : body.slice(0, MAX_WHATSAPP_TEXT + 1), opening });
    if (!r.ok) return keep(r.why);
    return { ok: true, to: back(opening ? 'sent-opening' : 'sent-whatsapp') };
  }
  if (via === 'portal') {
    const r = M.postClientMessage(deps, actor, business_id, { body, claim_id: claim === '' ? null : claim });
    if (!r.ok) return keep(r.why);
    return { ok: true, to: back('sent-portal') };
  }
  if (via === 'team') {
    const r = addNote(deps, actor, business_id, body, { claim_id: claim === '' ? null : claim });
    if (!r.ok) return keep(r.why.charAt(0).toUpperCase() + r.why.slice(1));
    return { ok: true, to: back('sent-team') };
  }
  if (via === 'call') {
    const contact = (f.get('call_contact_id') ?? '').trim();
    if (contact !== '' && db.get('SELECT 1 AS x FROM contacts WHERE id = ? AND business_id = ?', [contact, business_id]) === undefined) return keep('Choose one of their contacts.');
    const outcome = f.get('outcome') ?? '';
    if (OUTCOME[outcome] === undefined) return keep('Say how the call went.');
    const notes = (f.get('notes') ?? '').trim();
    if (notes.length > 4000) return keep('Keep the notes under 4,000 characters.');
    const nextTitle = (f.get('next_title') ?? '').trim();
    let task: string | null = null;
    if (nextTitle !== '') {
      const t = createTask(deps, actor, { title: nextTitle, due_on: (f.get('next_on') ?? '').trim(), owner_id: actor.id, activity_type: 'CALL', business_id, ...(contact === '' ? {} : { contact_id: contact }) });
      if (!t.ok) return keep(`The next step: ${t.why}`);
      task = t.id;
    }
    const id = d.newId();
    db.run('INSERT INTO call_logs (id, business_id, claim_id, contact_id, outcome, notes, logged_by, logged_at, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, business_id, claim === '' ? null : claim, contact === '' ? null : contact, outcome, notes, actor.id, d.app.now(), task]);
    d.app.audit.append({ at: d.app.now(), kind: 'CALL_LOGGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'call_log', object_id: id,
      detail: { business: business_id, outcome, follow_up: task !== null } });
    return { ok: true, to: back('logged-call') };
  }
  // via === 'zoom'
  const to = (f.get('zoom_to') ?? '').trim();
  if (to === '' || db.get("SELECT 1 AS x FROM contacts WHERE business_id = ? AND lower(email) = lower(?)", [business_id, to]) === undefined) return keep('Choose who the call is with: one of their contacts with an email address.');
  const now = d.app.now();
  let starts: string;
  if (go === 'zoom-book') {
    starts = (f.get('slot') ?? '').trim();
    const ok = isBookable(db, starts, { forUser: actor.id, now });
    if (!ok.ok) return keep(`That time cannot be booked: ${ok.why}. Choose another.`);
  } else {
    starts = now;
  }
  const ends = new Date(Date.parse(starts) + SLOT_MINUTES * 60_000).toISOString();
  const id = d.newId();
  db.run("INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, ?, 'video', NULL, 'staff', ?, ?, ?)",
    [id, business_id, actor.id, starts, ends, now]);
  d.app.audit.append({ at: now, kind: 'BOOKING_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'booking', object_id: id,
    detail: { business: business_id, channel: 'video', now: go !== 'zoom-book' } });
  const zoomed = await reconcileVideoMeeting(d.app, id);
  sendVideoInvite(d.app, d.origin, id, 'arranged', to);
  return { ok: true, to: go !== 'zoom-book' ? `/staff/calendar/${id}/video` : back(zoomed === 'MADE' ? 'booked-zoom' : 'booked-no-zoom') };
}
