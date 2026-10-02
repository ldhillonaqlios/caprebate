/**
 * WHATSAPP THROUGH META'S WHATSAPP CLOUD API. 30 September 2026.
 *
 * Lakhbir: "the ability to use whats app directly using our back end portal the idea is each client when we view back
 * end has full communication via email or whats app".
 *
 * WHAT IT NEEDS (developers.facebook.com, WhatsApp Cloud API, read 30 Sep 2026; Graph API v25.0):
 *   · a Meta business account with a WhatsApp Business account and our number on it, and an app in Meta for
 *     Developers with the WhatsApp product. From there, in the key file:
 *       WHATSAPP_ACCESS_TOKEN      a system user's permanent token (secret)
 *       WHATSAPP_PHONE_NUMBER_ID   the id Meta gives our number (not the number itself)
 *       WHATSAPP_APP_SECRET        the app's secret, which signs every message Meta sends us (X-Hub-Signature-256)
 *       WHATSAPP_VERIFY_TOKEN      a word we choose and type into Meta's webhook settings, so Meta can check the address
 *       WHATSAPP_OPENING_TEMPLATE  the name of our approved opening message (a "utility" template with one {{1}} for
 *                                  the person's first name), and WHATSAPP_TEMPLATE_LANGUAGE (en_GB if empty)
 *   · the webhook address set in Meta: <our site>/hooks/whatsapp, subscribed to "messages".
 *
 * WHATSAPP'S OWN RULE — THE 24-HOUR WINDOW. We may write freely only within 24 hours of the person's last message to us.
 * Outside it, WhatsApp allows only a message template Meta has approved. So outside the window the back office offers
 * one thing: our opening message, which asks them to reply; once they do, the window opens.
 *
 * THE TRANSFER. Meta Platforms keeps Cloud API messages in its own data centres (the United States unless a local
 * storage region is set up), so the row is US and NOT APPROVED until the data protection officer approves it
 * (sources.ts, WHATSAPP_CLOUD). Until then nothing is sent, and the back office says so. Receiving needs no call.
 *
 * 2 OCT 2026 — ONLY THE TEST WEBSITE SENDS (Lakhbir: "yes for now"), as Zoom: a copy on a computer, reading the real
 * key file, would message a real person from our number. It sends only on the deployed test website, or when started
 * with CAPREBATE_LOCAL_WHATSAPP=1 (src/connectors/place.ts). Receiving is not touched.
 *
 * No key is ever printed or logged. What is sent to Meta is the number and the words staff typed, nothing else.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuditLog } from '../audit.ts';
import type { SecretStore } from '../secrets.ts';
import { callOutside, isLiveTransport, policyRefusal, type Transport } from './http.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';
import { placeRefusal, type Env } from './place.ts';

export const WHATSAPP_SERVICE = 'WHATSAPP_CLOUD';
export const GRAPH_VERSION = 'v25.0';
/** WhatsApp's own limit for one text message. */
export const MAX_WHATSAPP_TEXT = 4096;
export const WINDOW_HOURS = 24;

export type WhatsAppDeps = {
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** Tests only: the service's policy with some values changed (the transfer approved). */
  readonly policy_override?: Partial<CallPolicy>;
  /** Tests only: the settings asked whether this copy is the test website. Absent, the process's own. */
  readonly env?: Env;
};

/** 2 Oct 2026: the setting that lets a copy that is not the test website send WhatsApp messages. Off unless exactly "1". */
export const WHATSAPP_LOCAL_OPT_IN = 'CAPREBATE_LOCAL_WHATSAPP';

/**
 * 2 Oct 2026 (Lakhbir: "yes for now"): why THIS copy may not send WhatsApp messages, in words, or null when it may —
 * as Zoom (src/connectors/place.ts). Only a live transport is ever refused.
 */
export function whatsappPlaceRefusal(outside: Transport, env?: Env): string | null {
  return placeRefusal({ live: isLiveTransport(outside), ...(env === undefined ? {} : { env }), optIn: WHATSAPP_LOCAL_OPT_IN, service: 'WhatsApp',
    harm: 'A message from here would reach a real person from our WhatsApp number.' });
}

/** Where the app runs, for `whatsappMissing`: how it reaches outside, and its settings (the process's, unless a test gives some). */
export type WhatsAppWhere = { readonly outside: Transport; readonly env?: Env };

const REQUIRED = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_OPENING_TEMPLATE'] as const;

function key(store: SecretStore, name: string): string { return (store.forOwner('WHATSAPP').get(name) ?? '').trim(); }

/**
 * What must be true before a message is sent, in words. Empty means WhatsApp is on. Names only, never a value. With
 * `where` (every caller in src/ passes it), whether this copy may send at all is said too.
 */
export function whatsappMissing(store: SecretStore, o?: Partial<CallPolicy>, where?: WhatsAppWhere): string[] {
  const out: string[] = [];
  const absent = REQUIRED.filter((n) => key(store, n) === '');
  if (absent.length > 0) out.push(`Put the WhatsApp keys in the key file: ${absent.join(', ')}.`);
  const base = CALL_POLICIES[WHATSAPP_SERVICE];
  if (policyRefusal(base === undefined ? undefined : { ...base, ...o }) !== null) {
    out.push('Meta keeps WhatsApp messages outside the UK: the data protection officer approves the transfer (sources.ts, WHATSAPP_CLOUD).');
  }
  const place = where === undefined ? null : whatsappPlaceRefusal(where.outside, where.env);
  if (place !== null) out.push(place);
  return out;
}

/**
 * A telephone number as WhatsApp writes it — the international number, digits only: "07700 900123" becomes
 * 447700900123, "+44 (0)7700 900123" too. Null for anything that is not a plausible number.
 */
export function waNumber(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim().replace(/\(0\)/g, '').replace(/[\s().-]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (/^0[1-9]/.test(s)) s = `44${s.slice(1)}`; // a UK number written the UK way
  return /^[1-9]\d{7,14}$/.test(s) ? s : null;
}

export type Sent = { readonly state: 'SENT'; readonly wa_id: string } | { readonly state: 'NOT_SENT'; readonly why: string; readonly outside_window?: true };

async function post(d: WhatsAppDeps, payload: object): Promise<Sent> {
  const missing = whatsappMissing(d.secrets, d.policy_override, { outside: d.transport, ...(d.env === undefined ? {} : { env: d.env }) });
  if (missing.length > 0) return { state: 'NOT_SENT', why: missing.join(' ') };
  const r = await callOutside(
    { audit: d.audit, now: d.now, transport: d.transport, ...(d.policy_override === undefined ? {} : { policy_override: d.policy_override }) },
    { service_id: WHATSAPP_SERVICE, endpoint: `/${GRAPH_VERSION}/{phone_number_id}/messages`, params: { phone_number_id: key(d.secrets, 'WHATSAPP_PHONE_NUMBER_ID') },
      method: 'POST', headers: { authorization: `Bearer ${key(d.secrets, 'WHATSAPP_ACCESS_TOKEN')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
      actor_id: null, actor_role: null, claim_id: null, gate: { free_gate_open: false, engagement_signed: false, switched_on: true } },
  );
  let j: { messages?: { id?: unknown }[]; error?: { code?: unknown } } = {};
  try { j = JSON.parse(r.body ?? '{}') as typeof j; } catch { /* read below */ }
  if (r.outcome === 'OK') {
    const id = j.messages?.[0]?.id;
    if (typeof id === 'string' && id !== '') return { state: 'SENT', wa_id: id };
    return { state: 'NOT_SENT', why: 'WhatsApp did not say it took the message.' };
  }
  // 131047: more than 24 hours since the person last wrote — only an approved template may go.
  if (j.error?.code === 131047) return { state: 'NOT_SENT', why: 'It is more than 24 hours since they last wrote on WhatsApp, so only our opening message can be sent.', outside_window: true };
  return { state: 'NOT_SENT', why: `WhatsApp did not take the message (${r.why}).` };
}

/** Free words, inside the 24-hour window. */
export function sendWhatsAppText(d: WhatsAppDeps, to: string, body: string): Promise<Sent> {
  return post(d, { to, type: 'text', text: { preview_url: false, body } });
}

/** Our approved opening message, with the person's first name. Allowed at any time. */
export function sendWhatsAppOpening(d: WhatsAppDeps, to: string, firstName: string): Promise<Sent> {
  const lang = key(d.secrets, 'WHATSAPP_TEMPLATE_LANGUAGE') || 'en_GB';
  return post(d, { to, type: 'template', template: { name: key(d.secrets, 'WHATSAPP_OPENING_TEMPLATE'), language: { code: lang },
    components: [{ type: 'body', parameters: [{ type: 'text', text: firstName.slice(0, 60) || 'there' }] }] } });
}

/** Meta's webhook check: it sends our word and a challenge, and we answer the challenge only if the word is ours. */
export function webhookChallenge(store: SecretStore, mode: string | null, token: string | null, challenge: string | null): string | null {
  const ours = key(store, 'WHATSAPP_VERIFY_TOKEN');
  if (ours === '' || mode !== 'subscribe' || token === null || challenge === null || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return null;
  const a = Buffer.from(token), b = Buffer.from(ours);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** Whether Meta signed exactly these bytes with our app's secret (X-Hub-Signature-256: sha256=<hex>). */
export function signatureHolds(store: SecretStore, raw: string, header: string | null): boolean {
  const secret = key(store, 'WHATSAPP_APP_SECRET');
  const m = /^sha256=([0-9a-f]{64})$/.exec(header ?? '');
  if (secret === '' || m === null) return false;
  const want = createHmac('sha256', secret).update(raw, 'utf8').digest();
  const got = Buffer.from(m[1]!, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export type Incoming = { readonly from: string; readonly wa_id: string; readonly at: string; readonly kind: 'text' | 'media' | 'other'; readonly body: string; readonly name: string | null };
export type StatusChange = { readonly wa_id: string; readonly status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; readonly at: string; readonly error: string | null };

const STATUS: Readonly<Record<string, StatusChange['status']>> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const MEDIA: Readonly<Record<string, string>> = { image: 'a photo', video: 'a video', audio: 'a voice note', document: 'a document', sticker: 'a sticker', location: 'a location' };

/** What one signed webhook body carries: the messages people sent us, and the status of messages we sent. */
export function readWebhook(raw: string): { incoming: Incoming[]; statuses: StatusChange[] } {
  const incoming: Incoming[] = [];
  const statuses: StatusChange[] = [];
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { incoming, statuses }; }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : {});
  const when = (ts: unknown): string => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date(0).toISOString(); };
  for (const entry of arr(obj(j)['entry'])) {
    for (const change of arr(obj(entry)['changes'])) {
      const v = obj(obj(change)['value']);
      const names = new Map<string, string>();
      for (const c of arr(v['contacts'])) { const wa = obj(c)['wa_id']; const n = obj(obj(c)['profile'])['name']; if (typeof wa === 'string' && typeof n === 'string') names.set(wa, n.slice(0, 100)); }
      for (const m of arr(v['messages'])) {
        const o = obj(m);
        const from = typeof o['from'] === 'string' ? o['from'] : '';
        const id = typeof o['id'] === 'string' ? o['id'] : '';
        if (!/^[1-9]\d{7,14}$/.test(from) || id === '') continue;
        const type = typeof o['type'] === 'string' ? o['type'] : '';
        const text = obj(o['text'])['body'];
        const caption = obj(o[type])['caption'];
        const kind: Incoming['kind'] = type === 'text' ? 'text' : MEDIA[type] !== undefined ? 'media' : 'other';
        const body = type === 'text' && typeof text === 'string' ? text.slice(0, MAX_WHATSAPP_TEXT)
          : MEDIA[type] !== undefined ? `They sent ${MEDIA[type]} on WhatsApp.${typeof caption === 'string' && caption !== '' ? ` With it: ${caption.slice(0, 1000)}` : ''} Open WhatsApp to see it.`
          : 'They sent a kind of WhatsApp message we cannot show here. Open WhatsApp to see it.';
        incoming.push({ from, wa_id: id, at: when(o['timestamp']), kind, body, name: names.get(from) ?? null });
      }
      for (const s of arr(v['statuses'])) {
        const o = obj(s);
        const id = typeof o['id'] === 'string' ? o['id'] : '';
        const st = STATUS[typeof o['status'] === 'string' ? o['status'] : ''];
        if (id === '' || st === undefined) continue;
        const err = obj(arr(o['errors'])[0]);
        const title = typeof err['title'] === 'string' ? err['title'].slice(0, 200) : null;
        statuses.push({ wa_id: id, status: st, at: when(o['timestamp']), error: st === 'FAILED' ? (title ?? 'WhatsApp could not deliver it.') : null });
      }
    }
  }
  return { incoming, statuses };
}

/** For the start-up log: whether WhatsApp can send, and if not why. Names only. */
export function whatsappWhy(store: SecretStore): string {
  const m = whatsappMissing(store);
  return m.length === 0 ? 'WhatsApp messages can be sent and received from the back office' : `WhatsApp messages are not sent yet: ${m.join(' ')}`;
}
