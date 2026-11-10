/**
 * WHATSAPP WITH ONE COMPANY, IN TWO HALVES..
 *
 *   GET /staff/clients/:id/whatsapp   ?contact= picks whose conversation; the newest otherwise
 *
 * the owner: "the same needs to happen for whats app also i know whats app works a bit differently where it is already one
 * chain, so the chain should be on the right allowing the user to see the full conversation and the left is to type a
 * message." On the left, the message being written (to the person chosen, with WhatsApp's 24-hour rule in words); on the
 * right, the whole conversation with that number, oldest first — and, where more than one of the company's people is on
 * WhatsApp, a link to each. Sending is unchanged (`sendWhatsApp`, src/modules/crm/whatsapp.ts: POST /staff/clients/:id/whatsapp),
 * and comes back here. Opening the page reads their WhatsApp (the red dot on Chat goes). Who: `client_message.read` to
 * see it, `client_message.write` to write — Admin and Sales. No number goes in an address: a person is picked by id.
 */

import { randomUUID } from 'node:crypto';
import type { App } from '../../core/app.ts';
import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { h, raw, page, type Safe } from '../../shared/index.ts';
import { savedMessage } from '../../shared/index.ts';
import { localStamp } from '../../shared/index.ts';
import { markChannelRead, lastChannelRead } from './messages.ts';
import { attachmentOf, phoneContacts, ATTACHMENT_WORDS, type PhoneContact } from './whatsapp.ts';
import { MAX_WHATSAPP_TEXT, WINDOW_HOURS, whatsappMissing } from '../../integrations/index.ts';
import { isDoNotContact } from '../../integrations/index.ts';
import { importsFor } from './whatsapp-import.ts';
import { listWhatsappImportLinesPhoneLastAtByBusinessId } from '../../integrations/index.ts';
import { getBusinessesNameById } from '../clients/index.ts';
import type { Param, Row } from '../../core/index.ts';
import { namesByIds } from '../../core/index.ts';
import { listWhatsappMessagesIdCreatedAtSenderByBusinessIdPhone } from '../../integrations/index.ts';
import { byId, idsOf, listContactsIdFullNameByIds, lookUp } from '../clients/index.ts';


/** One person (or one number we filed under the company) we have a WhatsApp conversation with, or could. */
export type WaPerson = {
  readonly key: string; readonly name: string; readonly number: string; readonly contact: PhoneContact | null;
  readonly last_at: string | null; readonly unread: number;
};

export type WaLine = { readonly id: string; readonly ours: boolean; readonly who: string; readonly when: string; readonly body: string; readonly state: string | null;
  /** Added from a chat exported on the phone. */ readonly imported: boolean };

const WA_STATE: Readonly<Record<string, string>> = { SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Not delivered', NOT_SENT: 'Not sent' };

/** Everyone at the company on WhatsApp, the newest conversation first; then those we have not written to yet. */
export function waPeople(db: Db, actor: Actor, business_id: string, nowIso: string): WaPerson[] {
  const readUntil = lastChannelRead(db, actor.id, business_id, 'WHATSAPP');
  const contacts = phoneContacts(db, business_id, nowIso);
  const byNumber = new Map<string, WaPerson>();
  for (const c of contacts) if (!byNumber.has(c.number)) byNumber.set(c.number, { key: c.id, name: c.name, number: c.number, contact: c, last_at: null, unread: 0 });
  for (const r of listWhatsappImportLinesPhoneLastAtByBusinessId<{ phone: string; last_at: string; first_id: string; unread: number }>(db, [readUntil, business_id])) {
    const known = byNumber.get(r.phone);
    byNumber.set(r.phone, known !== undefined ? { ...known, last_at: r.last_at, unread: r.unread }
      : { key: `n-${r.first_id}`, name: `+${r.phone}`, number: r.phone, contact: null, last_at: r.last_at, unread: r.unread });
  }
  return [...byNumber.values()].sort((a, b) => ((b.last_at ?? '') > (a.last_at ?? '') ? 1 : (b.last_at ?? '') < (a.last_at ?? '') ? -1 : a.name.localeCompare(b.name)));
}

/** The conversation with one number, oldest first. */
export function waLines(db: Db, business_id: string, number: string, nowIso: string): WaLine[] {
  return listWhatsappMessagesIdCreatedAtByBusinessIdPhone<{ id: string; created_at: string; direction: string; body: string; status: string; error: string | null; contact: string | null; writer: string | null; sender: string | null }>(db, [business_id, number]).map((w) => {
    const ours = w.direction === 'OUT';
    const imported = w.sender !== null;
    return {
      id: w.id, ours, when: localStamp(w.created_at, nowIso), body: w.body, imported,
      // An imported message is named as the phone named it; ours "on the phone", since nobody sent it from here.
      who: imported ? (ours ? `${w.sender} (on the phone)` : (w.contact ?? w.sender ?? `+${number}`)) : ours ? (w.writer ?? 'Cap Rebate') : (w.contact ?? `+${number}`),
      state: ours && !imported ? `${WA_STATE[w.status] ?? w.status}${w.error === null ? '' : ` — ${w.error}`}` : null,
    };
  });
}

/**
 * A file someone sent us — "Get it" (fetched from Meta and kept sealed) for those who write to the company,
 * then "Open it" for those who may read it.
 */
function attachmentLine(db: Db, actor: Actor, business_id: string, message_id: string): Safe {
  const a = attachmentOf(db, message_id);
  if (a === undefined) return raw('');
  const what = ATTACHMENT_WORDS[a.media_type] ?? 'the file';
  if (a.fetched_at !== null) {
    return h`<p class="msgfile"><a href="/staff/whatsapp/${message_id}/attachment">Open ${what}</a>${a.filename === null ? '' : ` (${a.filename})`}. Kept here, encrypted.</p>`;
  }
  return can(actor, 'client_message.write', { type: 'client_message', id: business_id, business_id })
    ? h`<form method="post" action="/staff/whatsapp/${message_id}/attachment" class="msgfile"><button class="btn-quiet" type="submit">Get ${what} from WhatsApp</button></form>`
    : h`<p class="msgfile help">Someone who writes to this company can get ${what} from WhatsApp.</p>`;
}

const DONE: Readonly<Record<string, string>> = {
  'whatsapp-file': 'Got it from WhatsApp. It is kept here, encrypted.',
  whatsapp: 'Sent on WhatsApp.',
  'whatsapp-opening': 'Our opening message is sent. When they reply, you can write freely for 24 hours.',
  'whatsapp-import-saved': 'The WhatsApp chat is added to the record.',
  'whatsapp-import-cancelled': 'Cancelled. Nothing was added.',
};

export function whatsappPage(app: App, actor: Actor, business_id: string, asked: string | null, done: string | null, nav: Safe): string {
  const db = app.db;
  authorise(actor, 'client_message.read', { type: 'client_message', id: business_id, business_id });
  const company = getBusinessesNameById<{ name: string }>(db, [business_id])?.name ?? 'This company';
  const now = app.now();
  const people = waPeople(db, actor, business_id, now);
  const chosen = people.find((p) => p.key === asked) ?? people[0] ?? null;
  const lines = chosen === null ? [] : waLines(db, business_id, chosen.number, now);
  // Reading the page reads their WhatsApp: the dot on Chat goes.
  markChannelRead({ db, audit: app.audit, now: app.now, newId: () => randomUUID() }, actor, business_id, 'WHATSAPP');
  const mayWrite = can(actor, 'client_message.write', { type: 'client_message', id: business_id, business_id });
  const missing = whatsappMissing(app.secrets, app.whatsappPolicy, { outside: app.outside });
  const reachable = people.filter((p) => p.contact !== null);
  const pick = chosen?.contact ?? reachable[0]?.contact ?? null;
  // While the live connection to Meta is off, nothing is written from here.
  // Staff reply on the WhatsApp phone and add the chat when it should be kept (src/modules/crm/whatsapp-import.ts).
  const live = missing.length === 0;
  const first = (chosen?.contact?.first ?? chosen?.name ?? 'them').trim() || 'them';
  const write: Safe = !mayWrite ? h`<p class="help">You can read this conversation, not write to it.</p>`
    : !live ? h`<p class="help">Reply to ${first} on the WhatsApp phone. To keep newer messages, export the chat again and add it below.</p>`
    : isDoNotContact(db, '', business_id) ? h`<div class="gate" role="note"><strong>You cannot write to this company.</strong> They asked us not to contact them.</div>`
    : reachable.length === 0 ? h`<p class="help">None of ${company}’s contacts has a mobile number. <a href="/staff/clients/${business_id}#contacts">Add one under Contacts</a> to write to them on WhatsApp.</p>`
    : h`
      ${chosen !== null && chosen.contact === null ? h`<p class="help">${chosen.name} is not one of their contacts, so you cannot write back to that number. Add it to a contact first.</p>` : raw('')}
      <form method="post" action="/staff/clients/${business_id}/whatsapp" class="pblock chatform">
        <label class="fl" for="wa-to">To</label>
        <select class="fi" id="wa-to" name="contact_id" required>${reachable.map((p) => {
          const c = p.contact!;
          return h`<option value="${c.id}"${c.id === pick?.id ? raw(' selected') : raw('')}>${c.name} — ${c.shown} — ${c.open_until === null
            ? `only our opening message (more than ${WINDOW_HOURS} hours since they last wrote on WhatsApp)` : `you can write freely until ${localStamp(c.open_until, now)}`}${c.agreed ? '' : ' — did not tick WhatsApp'}</option>`;
        })}</select>
        <label class="fl" for="wa-body">Message</label>
        <textarea class="fi" id="wa-body" name="body" maxlength="${String(MAX_WHATSAPP_TEXT)}" rows="6"></textarea>
        <p><button class="cta" type="submit" name="send" value="1">Send on WhatsApp</button>
        <button class="btn-quiet" type="submit" name="opening" value="1" formnovalidate>Send our opening message</button></p>
        <p class="help">WhatsApp lets us write freely only within ${WINDOW_HOURS} hours of the person’s last message to us. After that, it only lets us send our opening message. It asks them to reply.</p>
      </form>`;
  const chain: Safe = h`${people.length > 1 ? h`<ul class="chattabs" aria-label="Whose conversation">${people.map((p) => h`<li><a href="/staff/clients/${business_id}/whatsapp?contact=${p.key}"${
      p.key === chosen?.key ? raw(' aria-current="page"') : raw('')}>${p.name}${p.unread > 0 ? h` <span class="unread" aria-label="${String(p.unread)} not read">${String(p.unread)}</span>` : raw('')}</a></li>`)}</ul>` : raw('')}
    ${chosen === null ? h`<p class="empty">No WhatsApp with ${company} yet.</p>`
      : lines.length === 0 ? h`<p class="empty">No WhatsApp with ${chosen.name} yet. Write the first on the left.</p>`
      : h`<ol class="chat">${lines.map((l) => h`<li class="msg${l.ours ? ' mine' : ''}" id="wa-${l.id}">
          <p class="msgmeta"><span class="via">${l.imported ? 'From the phone' : 'WhatsApp'}</span> <strong>${l.who}</strong> · ${l.when}${l.state === null ? '' : ` · ${l.state}`}</p>
          <p class="msgbody">${l.body}</p>${attachmentLine(db, actor, business_id, l.id)}</li>`)}</ol>`}`;
  return page({
    title: `WhatsApp ${company}`, nav, wide: true,
    body: h`${done !== null && DONE[done] !== undefined ? savedMessage(DONE[done]) : raw('')}
      <h1>WhatsApp ${company}</h1>
      <p><a href="/staff/clients/${business_id}?chat=all#chat">Back to ${company}</a> · <a href="/staff/clients/${business_id}/email">Email them instead</a></p>
      <div class="convo">
        <section class="convo-write" id="compose" aria-labelledby="wa-write-h"><h2 id="wa-write-h">${live ? 'Write on WhatsApp' : 'WhatsApp'}</h2>${write}
          ${mayWrite && reachable.length > 0 ? importBox(app, business_id, reachable.map((p) => p.contact!), pick?.id ?? null) : raw('')}</section>
        <section class="convo-chain" aria-labelledby="wa-chain-h"><h2 id="wa-chain-h">${chosen === null ? 'The conversation' : `With ${chosen.name}`}</h2>${chain}</section>
      </div>`,
  });
}

/* ================================================================== *
 * ADD A CHAT EXPORTED ON THE PHONE (src/modules/crm/whatsapp-import.ts; the script is src/modules/crm/whatsapp-import-script.ts).
 * ================================================================== */
function importBox(app: App, business_id: string, contacts: readonly PhoneContact[], pick: string | null): Safe {
  const ups = importsFor(app, business_id).slice(0, 10);
  return h`<h3 id="wa-import-h">Add a WhatsApp chat</h3>
    <ol class="help">
      <li>On the WhatsApp phone, open the chat with the client.</li>
      <li>Tap their name, then <strong>Export chat</strong>, then <strong>Attach media</strong>.</li>
      <li>Save the .zip (to Files, or email it to yourself), then choose it here.</li>
    </ol>
    ${importForm(business_id, contacts, pick)}
    ${ups.length === 0 ? raw('') : h`<h3>Chats added</h3><ul class="plainlist">${ups.map((u) => h`<li>${localStamp(u.uploaded_at, app.now())} · ${u.contact} · ${u.status === 'SAVED'
      ? `${String(u.added ?? 0)} message${u.added === 1 ? '' : 's'} added by ${u.by}${u.files_waiting > 0 ? ` · ${String(u.files_waiting)} file${u.files_waiting === 1 ? '' : 's'} still to add` : ''}`
      : h`waiting to be checked — <a href="/staff/clients/${business_id}/whatsapp/import/${u.id}">check it</a>`}${u.status === 'SAVED' && u.files_waiting > 0
      ? h` — <a href="/staff/clients/${business_id}/whatsapp/import/${u.id}">add them</a>` : raw('')}</li>`)}</ul>`}`;
}

/** The upload form alone — on the WhatsApp page and on the company's conversation (src/modules/crm/communication.ts). */
export function importForm(business_id: string, contacts: readonly PhoneContact[], pick: string | null): Safe {
  return h`<form method="post" action="/staff/clients/${business_id}/whatsapp/import" enctype="multipart/form-data" class="pblock" id="wa-import" aria-labelledby="wa-import-h">
      <label class="fl" for="wa-imp-to">Whose chat is it</label>
      <select class="fi" id="wa-imp-to" name="contact_id" required>${contacts.map((c) => h`<option value="${c.id}"${c.id === pick ? raw(' selected') : raw('')}>${c.name} — ${c.shown}</option>`)}</select>
      <label class="fl" for="wa-imp-file">The exported chat (.zip or .txt)</label>
      <input class="fi" id="wa-imp-file" name="export" type="file" accept=".zip,.txt,application/zip,text/plain" required>
      <p class="help" id="wa-imp-note">Nothing is added yet: you check it first. A big export is opened on this computer, and only the chat’s words and the files from the dates you keep are sent.</p>
      <p><button class="cta" type="submit">Upload and check</button></p>
    </form>`;
}

/** The WhatsApp pages run one script of our own (the export reader), so their policy allows it and no more. */
export const WHATSAPP_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; " +
    "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
});

/** The page with the export reader's script. */
export function withImportScript(html: string): string {
  return html.replace('</body>', '<script src="/assets/whatsapp-import.js" defer></script></body>');
}

// THE CRM'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1): its own rows and the other area's, read
// through that area's front door and put together here as the old join did (test/crm/borrowed-split.test.ts).
export function listWhatsappMessagesIdCreatedAtByBusinessIdPhone<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listWhatsappMessagesIdCreatedAtSenderByBusinessIdPhone<{ id: unknown; created_at: unknown; direction: unknown; body: unknown; status: unknown; error: unknown; contact_id: unknown; written_by: unknown; sender: unknown }>(db, params);
  const contacts = byId(listContactsIdFullNameByIds<{ id: string; full_name: unknown }>(db, [idsOf(rows.map((r) => r.contact_id))]));
  const name = namesByIds(db, rows.map((r) => r.written_by));
  return rows.map((w) => ({ id: w.id, created_at: w.created_at, direction: w.direction, body: w.body, status: w.status, error: w.error,
    contact: lookUp(contacts, w.contact_id)?.full_name ?? null, writer: name(w.written_by), sender: w.sender })) as unknown as T[];
}
