/**
 * API KEYS, CHANGED FROM HOME'S ADMIN TAB. 1 October 2026 (migration 067).
 *
 * Lakhbir: Admin's tab is "back end access … update the API keys and save them". Until now a key could only be changed
 * in the key file on the server, or in the test website's settings on Vercel.
 *
 * WHAT IS SHOWN: each key's name, what it is for, and where its value comes from — saved here (when, and by whom), the
 * key file or the website's settings, or not set. NEVER A VALUE, NOT EVEN A PART OF ONE, ONCE SAVED.
 * SAVING: Admin only, with their own password typed again. The value is sealed with AES-256-GCM under CAPREBATE_MFA_KEY
 * (the key that already seals each person's authenticator secret, src/mfa-seal.ts), with the key's name bound in so a
 * sealed value copied onto another name does not open. Without a good CAPREBATE_MFA_KEY nothing is saved: a key kept as
 * text in the database is refused, not quietly allowed. CAPREBATE_MFA_KEY itself is not offered (it cannot seal itself),
 * nor a retired key. The audit line names the key, never the value.
 * READING: the newest row for a name wins over the key file or the settings; "Use the key file again" adds a row with no
 * value. Every request checks one number (the newest row) and rebuilds the keys only when it has moved, so a key saved on
 * one copy of the website is read by every copy at its next request.
 */

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { SECRET_KEYS, overlaySecrets, type SecretKey, type SecretStore } from '../secrets.ts';
import { MFA_KEY_NAME, mfaKeyFrom } from '../mfa-seal.ts';
import { localStamp } from './localtime.ts';
import type { SecretOwner } from '../secrets.ts';
import { EMAIL_SENDING } from '../stubs/email-provider.ts';
import { INBOUND_EMAIL } from '../stubs/email-inbound.ts';
import { IDENTITY_CHECK } from '../connectors/identity-check.ts';
import { COMPANY_SEARCH } from '../connectors/company-search.ts';
import { ADDRESS_LOOKUP } from '../connectors/address-lookup.ts';
import { switchedOn } from '../connectors/registers.ts';
import { CLAUDE_SWITCHES } from '../connectors/claude.ts';
import { zoomBlockers } from './video-calls.ts';
import { whatsappMissing } from '../connectors/whatsapp.ts';
import { turnstileWhy } from '../connectors/turnstile.ts';
import { ga4MeasurementId } from '../analytics.ts';

const PREFIX = 'cbkey1:';

/** The keys Admin may change here: every one in use, except the sealing key itself. */
export const EDITABLE_KEYS: readonly SecretKey[] = SECRET_KEYS.filter((k) => k.retired === undefined && k.name !== MFA_KEY_NAME);

type Holder = App & { baseSecrets?: SecretStore; savedKeysMark?: number };

function sealingKey(base: SecretStore): Buffer | null {
  const k = mfaKeyFrom(base);
  return k.state === 'KEY' ? k.key : null;
}

function seal(key: Buffer, name: string, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`key:${name}`, 'utf8'));
  const body = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

function open(key: Buffer, name: string, sealed: string): string | null {
  try {
    const b = Buffer.from(sealed.slice(PREFIX.length), 'base64');
    if (b.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAAD(Buffer.from(`key:${name}`, 'utf8'));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

type Latest = { name: string; sealed: string | null; set_at: string; who: string | null };

function latestRows(app: App): Latest[] {
  return app.db.all<Latest>(
    'SELECT k.name, k.sealed, k.set_at, u.display_name AS who FROM saved_keys k LEFT JOIN users u ON u.id = k.set_by ' +
    'WHERE k.rowid = (SELECT max(x.rowid) FROM saved_keys x WHERE x.name = k.name) ORDER BY k.name');
}

/** The base keys (file or settings), whatever the overlay has done since. Kept from the first time a saved key was
 *  laid over them; until then they are simply this copy's keys. */
function baseOf(app: Holder): SecretStore {
  return app.baseSecrets ?? app.secrets;
}

/**
 * Called on every request: when a key has been saved or taken off since this copy last looked, rebuild its keys from the
 * base and every saved one. One small query otherwise.
 */
export function refreshSavedKeys(app: App): void {
  const h = app as Holder;
  const mark = app.db.get<{ m: number }>('SELECT coalesce(max(rowid), 0) AS m FROM saved_keys')?.m ?? 0;
  if (mark === (h.savedKeysMark ?? 0)) return;
  if (h.baseSecrets === undefined) h.baseSecrets = app.secrets;
  const base = h.baseSecrets;
  const key = sealingKey(base);
  const over = new Map<string, string>();
  for (const r of latestRows(app)) {
    if (r.sealed === null || key === null || !EDITABLE_KEYS.some((k) => k.name === r.name)) continue;
    const v = open(key, r.name, r.sealed);
    if (v !== null) over.set(r.name, v);
  }
  app.secrets = over.size === 0 ? base : overlaySecrets(base, over, 'the key file or the website’s settings, with keys saved by Admin');
  h.savedKeysMark = mark;
}

/**
 * 1 OCT 2026 — IS THE SERVICE THAT USES THIS KEY SWITCHED ON? Lakhbir: "not set = red, active = green, set but not
 * active = amber". Each service's own switch or readiness check, read as it stands now; the words say what is off.
 */
export function serviceOn(app: App, owner: SecretOwner): { on: boolean; why: string } {
  const st = app.secrets;
  const off = (why: string) => ({ on: false, why });
  switch (owner) {
    case 'CLAUDE_DOCUMENTS': return Object.values(CLAUDE_SWITCHES).some((v) => v) ? { on: true, why: '' } : off('Reading documents with Claude is not switched on.');
    case 'COMPANIES_HOUSE': return COMPANY_SEARCH.enabled || switchedOn('CH_COMPANY') ? { on: true, why: '' } : off('The Companies House search is not switched on.');
    case 'CQC': return switchedOn('CQC') ? { on: true, why: '' } : off('The care regulator lookup is not switched on.');
    case 'EPC': return switchedOn('EPC') ? { on: true, why: '' } : off('The energy certificate lookup is not switched on.');
    case 'HOMEDATA_ADDRESS': return switchedOn('HOMEDATA_ADDRESS') ? { on: true, why: '' } : off('The Homedata address lookup is not switched on.');
    case 'IONOS_EMAIL': return EMAIL_SENDING.enabled ? { on: true, why: '' } : off('Sending email is not switched on.');
    case 'IONOS_MAILBOX': return INBOUND_EMAIL.enabled ? { on: true, why: '' } : off('Reading email replies is not switched on.');
    case 'GOOGLE_ANALYTICS': return ga4MeasurementId(st) !== null ? { on: true, why: '' } : off('It is not a Google Analytics id (G- then letters and numbers).');
    case 'DIDIT_IDV': return IDENTITY_CHECK.enabled ? { on: true, why: '' } : off('The online identity check is not switched on.');
    case 'CLOUDFLARE_TURNSTILE': {
      const w = turnstileWhy(st);
      return /is checked on the server with Cloudflare$/.test(w) ? { on: true, why: '' } : off(w.replace(/^the contact form’s security check /, 'The contact form’s security check '));
    }
    case 'ZOOM': { const m = zoomBlockers(app); return m.length === 0 ? { on: true, why: '' } : off(m.join(' ')); }
    case 'WHATSAPP': { const m = whatsappMissing(st, app.whatsappPolicy, { outside: app.outside }); return m.length === 0 ? { on: true, why: '' } : off(m.join(' ')); }
    case 'REPLY_TIMER': return INBOUND_EMAIL.enabled ? { on: true, why: '' } : off('Reading email replies is not switched on.');
    case 'GOADDRESS': return ADDRESS_LOOKUP.enabled ? { on: true, why: '' } : off('“Find my address” is not switched on.');
    default: return off('Nothing uses this key yet.');
  }
}

export type KeyRow = {
  readonly name: string; readonly what: string; readonly secret: boolean;
  readonly from: 'SAVED' | 'FILE' | 'NOT_SET' | 'UNREADABLE';
  /** For a saved one: when and by whom, in words. */
  readonly saved: string | null;
  /** Not set (red); set and its service on (green); set but its service off, or saved and unreadable (amber). */
  readonly state: 'NOT_SET' | 'ACTIVE' | 'SET_OFF';
  /** For amber: what is off, in words. */
  readonly why_off: string | null;
};

export type KeysView = { readonly rows: readonly KeyRow[]; readonly can_save: boolean; readonly why_not: string | null };

/** Every key Admin may change, and where its value comes from. Never a value. */
export function keysView(app: App, actor: Actor): KeysView {
  if (actor.role !== 'ADMIN') return { rows: [], can_save: false, why_not: 'Only Admin sees the keys.' };
  const base = baseOf(app as Holder);
  const key = sealingKey(base);
  const latest = new Map(latestRows(app).map((r) => [r.name, r]));
  const now = app.now();
  const rows = EDITABLE_KEYS.map((k): KeyRow => {
    const l = latest.get(k.name);
    const inBase = base.forOwner(k.owner).has(k.name);
    const svc = serviceOn(app, k.owner);
    const lit = (from: KeyRow['from']): Pick<KeyRow, 'state' | 'why_off'> =>
      from === 'NOT_SET' ? { state: 'NOT_SET', why_off: null }
        : from === 'UNREADABLE' ? { state: 'SET_OFF', why_off: 'Saved here, but this server cannot open it: save it again.' }
          : svc.on ? { state: 'ACTIVE', why_off: null } : { state: 'SET_OFF', why_off: svc.why };
    if (l !== undefined && l.sealed !== null) {
      const readable = key !== null && open(key, k.name, l.sealed) !== null;
      const from = readable ? 'SAVED' : 'UNREADABLE';
      return { name: k.name, what: k.what, secret: k.secret, from, saved: `${localStamp(l.set_at, now)}${l.who === null || l.who === undefined ? '' : `, by ${l.who}`}`, ...lit(from) };
    }
    const from = inBase ? 'FILE' : 'NOT_SET';
    return { name: k.name, what: k.what, secret: k.secret, from, saved: null, ...lit(from) };
  });
  return { rows, can_save: key !== null, why_not: key === null ? `Keys cannot be saved here until ${MFA_KEY_NAME} is set in the key file or the website’s settings: it is what seals them.` : null };
}

async function passwordHolds(app: App, actor: Actor, password: string): Promise<boolean> {
  const row = app.db.get<{ h: string }>('SELECT password_hash AS h FROM users WHERE id = ? AND disabled_at IS NULL', [actor.id]);
  return row !== undefined && password !== '' && await app.hasher.verify(row.h, password);
}

export type SaveKeyResult = { ok: true } | { ok: false; why: string };

/** Save a key's new value, sealed; or (value null) go back to the key file's. */
export async function saveKey(app: App, actor: Actor, name: string, value: string | null, password: string): Promise<SaveKeyResult> {
  if (actor.role !== 'ADMIN') return { ok: false, why: 'Only Admin can change a key.' };
  const k = EDITABLE_KEYS.find((x) => x.name === name);
  if (k === undefined) return { ok: false, why: 'That is not a key that can be changed here.' };
  if (!(await passwordHolds(app, actor, password))) return { ok: false, why: 'That is not the password you sign in to this site with. Nothing was saved.' };
  const base = baseOf(app as Holder);
  const key = sealingKey(base);
  let sealed: string | null = null;
  if (value !== null) {
    const v = value.trim();
    if (v === '') return { ok: false, why: 'Paste the new value first.' };
    if (v.length > 4096 || /[\r\n]/.test(v)) return { ok: false, why: 'A key is one line, under 4,096 characters.' };
    if (key === null) return { ok: false, why: `Keys cannot be saved here until ${MFA_KEY_NAME} is set: it is what seals them.` };
    sealed = seal(key, name, v);
  }
  const now = app.now();
  const id = randomUUID();
  app.db.run('INSERT INTO saved_keys (id, name, sealed, set_by, set_at) VALUES (?, ?, ?, ?, ?)', [id, name, sealed, actor.id, now]);
  app.audit.append({ at: now, kind: value === null ? 'KEY_UNSAVED' : 'KEY_SAVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'saved_key', object_id: id, detail: { key: name } });
  refreshSavedKeys(app);
  return { ok: true };
}
