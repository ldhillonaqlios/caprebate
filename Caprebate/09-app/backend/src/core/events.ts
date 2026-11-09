/**
 * EVENTS: how a module tells the modules above it that something happened, without importing them
 * (09-app/docs/ARCHITECTURE.md rule 2: an area imports only the areas below it).
 *
 * A module ANNOUNCES what happened ("the letter was signed", "an invoice was raised") and any module may LISTEN. The
 * announcer names no listener and imports none, so it never depends on the modules above it; a listener imports the
 * core's front door, which is below everything.
 *
 *   - Every name and what it carries is listed in EventMap below, ids only: the announcement goes into the audit log,
 *     which refuses anything that looks like personal data.
 *   - announce() runs every listener AT ONCE, IN THE SAME TRANSACTION as the change that caused it, and refuses to run
 *     outside one. So nothing is half done: if a listener throws, the whole change is undone with it, and the error
 *     names the listener.
 *   - The announcement and each listener that heard it are written to the audit log (EVENT_ANNOUNCED, EVENT_HEARD),
 *     inside the same transaction, so they are kept exactly when the change is kept.
 *   - Listeners are registered when their module loads (its events.ts, loaded by its front door). The start-up wiring
 *     (src/app/) loads every module, so in the running app every listener is there.
 */
import type { AuditLog } from './audit.ts';
import type { Db } from './db.ts';

/** Every event, and what it carries (ids and codes only). Add a name here when a module needs to announce one. */
export type EventMap = {
  /** Every signature a letter of engagement needs is on it (claims). */
  'letter.signed': { readonly engagement_id: string; readonly business_id: string; readonly signed_at: string };
  /** An invoice was raised (finance). */
  'invoice.raised': { readonly invoice_id: string; readonly kind: string };
  /** A credit note was issued on an invoice (finance). */
  'credit_note.issued': { readonly credit_note_id: string; readonly invoice_id: string; readonly basis: string };
};
export type EventName = keyof EventMap;

/** What a listener is given: the database (already inside the transaction), the audit log, the clock and who acted. */
export type EventContext = {
  readonly db: Db;
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly newId?: () => string;
  /** Who acted (a signed-in person, or a client signing through a link), or null for the system. */
  readonly actor: { readonly id: string | null; readonly role: string } | null;
};

export type Listener<K extends EventName> = (ctx: EventContext, payload: EventMap[K]) => void;

type Entry = { readonly area: string; readonly name: string; readonly fn: (ctx: EventContext, payload: never) => void };
const LISTENERS = new Map<EventName, Entry[]>();

/** Thrown when announce() is called outside a transaction: the change and its listeners must commit together. */
export class EventOutsideTransaction extends Error {
  constructor(event: string) {
    super(`the event ${event} was announced outside a transaction: announce it inside the transaction of the change that caused it`);
    this.name = 'EventOutsideTransaction';
  }
}

/** Thrown when a listener fails: the transaction it ran in is undone, so the change that caused the event is too. */
export class ListenerFailed extends Error {
  readonly event: string;
  readonly listener: string;
  constructor(event: string, listener: string, cause: unknown) {
    super(`the listener ${listener} failed on ${event}, so the change that caused it was undone: ${String((cause as Error | null)?.message ?? cause)}`, { cause });
    this.name = 'ListenerFailed';
    this.event = event;
    this.listener = listener;
  }
}

/**
 * Listen for an event. `area` is the listening module and `name` says what the listener does; the same area and name
 * registered again replaces the first (a module loaded twice still listens once). Returns a function that stops it.
 */
export function listen<K extends EventName>(event: K, area: string, name: string, fn: Listener<K>): () => void {
  const list = LISTENERS.get(event) ?? [];
  const entry: Entry = { area, name, fn: fn as Entry['fn'] };
  const at = list.findIndex((e) => e.area === area && e.name === name);
  if (at >= 0) list[at] = entry; else list.push(entry);
  LISTENERS.set(event, list);
  return () => {
    const now = LISTENERS.get(event) ?? [];
    const i = now.findIndex((e) => e.area === area && e.name === name);
    if (i >= 0) now.splice(i, 1);
  };
}

/** Who listens to an event, in the order they run: "area: name". */
export function listenersOf(event: EventName): string[] {
  return (LISTENERS.get(event) ?? []).map((e) => `${e.area}: ${e.name}`);
}

/**
 * Announce an event from `from` (the announcing module). Inside the caller's transaction: the announcement is written
 * to the audit log, then each listener runs in turn and its hearing is written too. A listener that throws stops the
 * rest, and the error (ListenerFailed) undoes the whole transaction. Returns how many listeners heard it.
 */
export function announce<K extends EventName>(ctx: EventContext, from: string, event: K, payload: EventMap[K]): number {
  if (!ctx.db.inTransaction) throw new EventOutsideTransaction(event);
  const list = [...(LISTENERS.get(event) ?? [])];
  const at = ctx.now();
  ctx.audit.append({
    at, kind: 'EVENT_ANNOUNCED', outcome: 'ALLOWED', actor_id: ctx.actor?.id ?? null, actor_role: ctx.actor?.role ?? null,
    object_type: 'event', object_id: event, detail: { from, listeners: list.length, ...payload },
  });
  for (const e of list) {
    try {
      (e.fn as Listener<K>)(ctx, payload);
    } catch (err) {
      throw new ListenerFailed(event, `${e.area}: ${e.name}`, err);
    }
    ctx.audit.append({
      at, kind: 'EVENT_HEARD', outcome: 'ALLOWED', actor_id: ctx.actor?.id ?? null, actor_role: ctx.actor?.role ?? null,
      object_type: 'event', object_id: event, detail: { area: e.area, listener: e.name },
    });
  }
  return list.length;
}
