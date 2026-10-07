/**
 * THE CLIENT'S PORTAL HOME AS A DASHBOARD — 1 October 2026.
 *
 * Lakhbir: "for clients, it should show what the progression is, what we are working on, any up coming calls,
 * notifications from the portal, and what cap rebate needs from them."
 *
 * Five cards at the top of /portal, each with its button; everything the portal already drew stays below them.
 *   WHERE YOUR CLAIM IS      the six steps as a bar (the names the back office's bar reads), and which step this is.
 *   WHAT WE ARE WORKING ON   this step in plain words, and the last things Cap Rebate has done (the steps staff told them).
 *   YOUR NEXT CALL           the soonest call with a time: a video call's button joins it; a telephone call says we will
 *                            ring; a call asked for with no time yet says so; none at all offers "Book a call".
 *   NEW FOR YOU              our messages they have not read, and what we have done or issued in the last 30 days.
 *   WHAT WE NEED FROM YOU    every open question and every document asked for, each with its button.
 * UI TIDY PHASE 16 (3 October 2026): the cards no longer repeat "Send us a message" — the header carries it, once.
 * Nothing here is new information: each card reads what the portal's own sections read, asked of the same rules. No
 * figure, no fact and no value is shown — only words, dates and counts.
 */

import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { clientProgress } from './tell-and-move.ts';
import { STAGES } from './stages.ts';
import { localClock, localDate, localPartsOf, ukDate, ukDatesIn, WEEKDAY_NAMES } from './localtime.ts';
import { unreadCount } from './messages.ts';
import type { ClientStep } from './approvals.ts';
import type { ClientDeliverable } from './claim-record.ts';
import { releasedVersion } from './report-signoff.ts';
import { myAcceptance } from './report-accept.ts';

export type PortalDashInput = {
  readonly db: Db; readonly actor: Actor; readonly business_id: string; readonly nowIso: string;
  readonly bookings: readonly { id: string; channel: string; starts_at: string | null; cancelled_at: string | null }[];
  readonly tasks: readonly { id: string; state: string; question: string }[];
  readonly requests: readonly { id: string; state: string; type: { label: string }; due: { label: string; overdue: boolean } }[];
  readonly done: readonly ClientStep[];
  readonly delivered: readonly ClientDeliverable[];
  readonly joins: Readonly<Record<string, string>>;
};

function dayWords(iso: string): string {
  const p = localPartsOf(Date.parse(iso));
  return `${WEEKDAY_NAMES[p.weekday] ?? ''} ${ukDate(localDate(iso))}`;
}

function card(id: string, title: string, body: Safe): Safe {
  return h`<section class="pdash-card" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${title}</h2>${body}</section>`;
}

export function portalDashboard(x: PortalDashInput): Safe {
  const p = clientProgress(x.db, x.business_id);
  const stage = STAGES[p.at];
  const where = card('where-you-are', 'Where your claim is', h`
    <ol class="cprogress" aria-label="Your claim, step by step">${p.steps.map((name, i) => h`<li class="${i < p.at ? 'done' : i === p.at ? 'now' : 'todo'}"${
      i === p.at ? raw(' aria-current="step"') : raw('')}><span class="bar"></span><span class="name">${name}</span></li>`)}</ol>
    <p class="pdash-big">Step ${String(p.at + 1)} of ${String(p.steps.length)}: ${p.steps[p.at] ?? ''}</p>`);

  const recent = [...x.done].filter((d) => d.state === 'DONE').sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  const working = card('working-on', 'What we are working on', h`
    <p>${workingWords(x.db, x.actor, x.business_id, stage?.toTheClient ?? null)}</p>
    ${recent.length === 0 ? raw('') : h`<p class="fl">Done so far</p><ul class="plain">${recent.slice(0, 3).map((d) => h`<li>✓ ${d.words} <span class="help">· ${ukDate(d.on)}</span></li>`)}</ul>`}
    <p><a href="#done-so-far">See everything we have done</a></p>`);

  const ahead = x.bookings.filter((b) => b.cancelled_at === null && (b.starts_at === null || b.starts_at >= new Date(Date.parse(x.nowIso) - 60 * 60_000).toISOString()))
    .sort((a, b) => ((a.starts_at ?? '9') < (b.starts_at ?? '9') ? -1 : 1));
  const next = ahead[0];
  const call = card('next-call', 'Your next call', next === undefined
    ? h`<p>Nothing is booked.</p><p><a class="cta" href="#appointment">Book a call</a></p>`
    : next.starts_at === null
      ? h`<p>You asked us for a call. We will offer you a time.</p>`
      : h`<p class="pdash-big">${dayWords(next.starts_at)}, ${localClock(next.starts_at)}</p>
        <p>${next.channel === 'video' ? 'A video call, here in your portal.' : next.channel === 'phone' ? 'A telephone call. We will ring you.' : 'A call.'}</p>
        <p>${x.joins[next.id] !== undefined ? h`<a class="cta" href="${x.joins[next.id]!}">Join the video call</a> ` : raw('')}<a class="btn" href="#appointment">Move or cancel it</a></p>
        ${ahead.length > 1 ? h`<p class="help">And ${String(ahead.length - 1)} more booked.</p>` : raw('')}`);

  const unread = x.actor.role === 'CLIENT' ? unreadCount(x.db, x.actor, x.business_id, 'CLIENT') : 0;
  const since = localDate(new Date(Date.parse(x.nowIso) - 30 * 86_400_000).toISOString());
  const told = recent.filter((d) => d.on >= since);
  const issued = x.delivered.filter((d) => d.issued_on >= since);
  const items: Safe[] = [
    ...(unread > 0 ? [h`<li class="pdash-new"><strong>${unread === 1 ? 'A new message from us' : `${String(unread)} new messages from us`}</strong> <a class="cta" href="/portal/messages">Read ${unread === 1 ? 'it' : 'them'}</a></li>`] : []),
    ...told.slice(0, 3).map((d) => h`<li>${d.words} <span class="help">· ${ukDate(d.on)}</span></li>`),
    ...issued.map((d) => h`<li>${issuedLine(d.label)} <span class="help">· ${ukDate(d.issued_on)}</span></li>`),
  ];
  const fresh = card('new-for-you', 'New for you', items.length === 0
    ? h`<p class="empty">Nothing new in the last 30 days.</p>`
    : h`<ul class="plain pdash-list">${items}</ul>`);

  const open = x.tasks.filter((t) => t.state === 'OPEN');
  const asked = x.requests.filter((r) => r.state === 'REQUESTED');
  const needs = card('waiting-on-you', 'What we need from you', open.length + asked.length === 0
    ? h`<p class="empty">Nothing at the moment. We are working on your claim, and we will tell you here if we need anything.</p>`
    : h`<ul class="plain pdash-list">${open.map((t) => h`<li><span>${t.question} <span class="help">— a question</span></span> <a class="cta" href="#question-${t.id}">Answer it</a></li>`)}${
      asked.map((r) => h`<li${r.due.overdue ? raw(' class="late"') : raw('')}><span>${r.type.label} <span class="help">— a document, ${ukDatesIn(r.due.label)}</span></span> <a class="cta" href="#request-${r.id}">Send it</a></li>`)}</ul>`);

  return h`<div class="pdash">${where}${needs}${working}${call}${fresh}</div>`;
}

/** PHASE 158b (F40, the Friary House run): "We issued your The client report". The label's own "The" goes, and it reads in the sentence. */
export function issuedLine(label: string): string {
  const name = label.replace(/^the\s+/i, '');
  return `We issued your ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/**
 * PHASE 158c (F39, the Friary House run): with the report issued, the client was still told "A chartered surveyor is
 * valuing the property". Once a version is released to them the sentence says the report is ready, or that they
 * accepted it. Otherwise the step's own words, as before.
 */
export function workingWords(db: PortalDashInput['db'], actor: PortalDashInput['actor'], business_id: string, step: string | null): string {
  if (releasedVersion(db, business_id) !== null) {
    return myAcceptance(db, actor, business_id) === null
      ? 'Your survey report is ready. Read it in your portal, and tell us you accept it.'
      : 'You accepted your survey report. We are preparing the papers for filing.';
  }
  return step ?? 'We are working on your claim.';
}
