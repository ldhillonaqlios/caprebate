/**
 * PHASE 156c, 5 October 2026 — READING A CHAT EXPORTED FROM THE WHATSAPP PHONE. No network, no Meta.
 *
 * Lakhbir chose a manual upload (5 Oct 2026: "go with manual upload, keep photos"): staff talk to clients on the
 * WhatsApp phone, and to keep a conversation they export that one chat (Export chat > Attach media) and upload the
 * .zip on the client's WhatsApp page. This file turns the export's text into messages; src/web/whatsapp-import.ts
 * checks them with a person and saves them.
 *
 * THE TWO LAYOUTS (read from a real iPhone export's 5 October lines only, every word masked, used with consent; and
 * WhatsApp's documented Android form):
 *   iPhone   [05/10/2026, 13:36:43] Name: text           (24-hour; or 1:36:43 PM, with a narrow space before PM)
 *   Android  05/10/2026, 13:36 - Name: text              (no seconds)
 * Lines without a date belong to the message above. Messages are separated by CRLF on the iPhone, while a message's
 * own line breaks are a bare LF; both are read the same way here. A U+200E (left-to-right mark) may stand before the
 * line, before an attachment and before WhatsApp's own words; it is never part of what a person wrote.
 *
 * WHAT IS RECOGNISED: an attachment ("<attached: FILE>" on the iPhone, "FILE (file attached)" on Android, with any
 * words before it kept as its caption); a file left out of the export ("<Media omitted>", "image omitted"); a deleted
 * message ("This message was deleted." / "You deleted this message."), kept as WhatsApp wrote it; an edit
 * ("<This message was edited>"), marked; WhatsApp's own notices (end-to-end encryption, joined, changed number…),
 * skipped. An empty message is skipped.
 *
 * DATES are read day first (UK). If no day number in the file is above 12, month first would also make sense, and
 * the check step says so. TIMES are UK local time (Europe/London), turned into an exact moment across the clock
 * change; the export carries no time zone.
 */
import { instantsForLocalMinute } from '../web/localtime.ts';

export type ExportMessage = {
  /** The exact moment, ISO UTC. */
  readonly at: string;
  /** As the phone wrote it, day first: "05/10/2026 13:36:43". */
  readonly local: string;
  readonly sender: string;
  /** What the person wrote (a caption, for a file). Empty for a file with no caption. */
  readonly text: string;
  /** The file's name inside the export, when the message is a file. */
  readonly attachment: string | null;
  /** True when the export says a file was here but left it out ("without media", or too big). */
  readonly omitted: boolean;
  readonly deleted: boolean;
  readonly edited: boolean;
};

export type ParsedChat = {
  readonly layout: 'iphone' | 'android' | null;
  readonly messages: readonly ExportMessage[];
  /** Every name that wrote, in order of first appearance. */
  readonly senders: readonly string[];
  /** Lines that were WhatsApp's own notices, skipped. */
  readonly notices: number;
  /** No day number above 12 anywhere: the dates could also be read month first. */
  readonly dates_could_be_month_first: boolean;
};

const LRM = /[\u200e\u200f\u202a-\u202e]/g;
const SPACE = '[ \\u00a0\\u202f]';
const IPHONE = new RegExp(`^\\[(\\d{1,2})[/.](\\d{1,2})[/.](\\d{2,4}),${SPACE}(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:${SPACE}?([AaPp])\\.?[Mm]\\.?)?\\]${SPACE}([^:\\n]{1,100}?):${SPACE}?(.*)$`);
const ANDROID = new RegExp(`^(\\d{1,2})[/.](\\d{1,2})[/.](\\d{2,4}),?${SPACE}(\\d{1,2}):(\\d{2})(?:${SPACE}?([AaPp])\\.?[Mm]\\.?)?${SPACE}-${SPACE}(.*)$`);

/** WhatsApp's own words about the chat itself, never a person's: skipped. Kept narrow on purpose (5 Oct 2026: a broad
 *  "… added …" pattern swallowed 212 view-once notices in a real export, because their wording contains "added"). */
const NOTICE = /^(Messages and calls are end-to-end encrypted|Messages to this chat and calls are now secured|Your security code with .{1,100} changed|.{1,100} changed (their|the) phone number|.{1,100} changed to \+?[\d ]{6,20}|Disappearing messages (were|are) turned|This chat is with a business account|.{1,100} is a contact\.?)/;

/** A view-once photo or video: WhatsApp never puts it in an export, but it was sent, so it is shown as such. */
const VIEW_ONCE = /^You (sent|received) a view once (message|photo|video|voice message)\b/i;

const DELETED = /^(This message was deleted|You deleted this message)\.?$/;
const EDITED = /\s*<This message was edited>\s*$/;
const ATTACHED_IPHONE = /^(.*?)\s*<attached: ([^<>]{1,200})>\s*$/s;
const ATTACHED_ANDROID = /^([^\n]{1,200}?) \(file attached\)(?:\n([\s\S]*))?$/;
const OMITTED = /^(<Media omitted>|(image|video|audio|document|sticker|GIF|Contact card) omitted|.{1,200} document omitted)$/i;

type Head = { day: number; month: number; year: number; hour: number; minute: number; second: number; sender: string; text: string };

function headOf(line: string): { head: Head; layout: 'iphone' | 'android' } | { notice: true; layout: 'android' } | null {
  const l = line.replace(/^[\u200e\u200f]+/, '');
  const i = IPHONE.exec(l);
  if (i !== null) {
    return { layout: 'iphone', head: {
      day: Number(i[1]), month: Number(i[2]), year: fullYear(i[3] ?? ''),
      hour: hour24(Number(i[4]), i[7]), minute: Number(i[5]), second: Number(i[6] ?? '0'), sender: clean(i[8] ?? ''), text: i[9] ?? '' } };
  }
  const a = ANDROID.exec(l);
  if (a !== null) {
    const rest = a[7] ?? '';
    const colon = /^([^:\n]{1,100}?):[ \u00a0]?(.*)$/.exec(rest);
    // An Android line with no "Name:" is one of WhatsApp's own notices ("Messages and calls are end-to-end encrypted").
    if (colon === null) return { notice: true, layout: 'android' };
    return { layout: 'android', head: {
      day: Number(a[1]), month: Number(a[2]), year: fullYear(a[3] ?? ''),
      hour: hour24(Number(a[4]), a[6]), minute: Number(a[5]), second: 0, sender: clean(colon[1] ?? ''), text: colon[2] ?? '' } };
  }
  return null;
}

const fullYear = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y));
const hour24 = (h: number, ap: string | undefined): number => (ap === undefined ? h : ap.toLowerCase() === 'p' ? (h % 12) + 12 : h % 12);
const clean = (s: string): string => s.replace(LRM, '').trim();
const two = (n: number): string => String(n).padStart(2, '0');

/** Read the export's text. Never throws: a file that is not a WhatsApp export comes back with no messages. */
export function parseChat(raw: string): ParsedChat {
  const text = raw.replace(/^\ufeff/, '');
  const lines = text.split(/\r?\n/);
  type Draft = { head: Head; body: string[] };
  const drafts: Draft[] = [];
  let layout: ParsedChat['layout'] = null;
  let notices = 0;
  let current: Draft | null = null;
  for (const line of lines) {
    const h = headOf(line);
    if (h !== null && 'notice' in h) { notices += 1; current = null; layout ??= h.layout; continue; }
    if (h !== null) {
      layout ??= h.layout;
      current = { head: h.head, body: [h.head.text] };
      drafts.push(current);
      continue;
    }
    if (current !== null) current.body.push(line);
  }
  let monthFirstPossible = drafts.length > 0;
  const messages: ExportMessage[] = [];
  const senders: string[] = [];
  for (const d of drafts) {
    if (d.head.day > 12) monthFirstPossible = false;
    let words = d.body.join('\n').replace(/\s+$/, '');
    const plain = words.replace(LRM, '').trim();
    if (NOTICE.test(plain) && words.trimStart().startsWith('\u200e')) { notices += 1; continue; }
    if (VIEW_ONCE.test(plain)) words = 'A view-once message — WhatsApp does not put these in an export.';
    const edited = EDITED.test(words.replace(LRM, ''));
    if (edited) words = words.replace(LRM, '\u0000').replace(EDITED, '').replace(/\u0000/g, '\u200e');
    let attachment: string | null = null;
    let omitted = false;
    const ip = ATTACHED_IPHONE.exec(words);
    const an = ip === null ? ATTACHED_ANDROID.exec(words.replace(LRM, '')) : null;
    if (ip !== null) { attachment = clean(ip[2] ?? ''); words = ip[1] ?? ''; }
    else if (an !== null) { attachment = clean(an[1] ?? ''); words = an[2] ?? ''; }
    else if (OMITTED.test(words.replace(LRM, '').trim())) { omitted = true; words = ''; }
    words = words.replace(LRM, '').trim();
    const deleted = DELETED.test(words);
    if (words === '' && attachment === null && !omitted) continue;
    const h = d.head;
    const local = `${two(h.day)}/${two(h.month)}/${h.year} ${two(h.hour)}:${two(h.minute)}:${two(h.second)}`;
    // UK local time to an exact moment. In the hour the clocks go back, the earlier of the two; in the hour that does
    // not exist (clocks forward), the moment just after it.
    if (h.month < 1 || h.month > 12 || h.day < 1 || h.day > 31 || h.hour > 23 || h.minute > 59 || h.second > 59) continue;
    const minute = h.hour * 60 + h.minute;
    const found = instantsForLocalMinute(h.year, h.month, h.day, minute);
    const base = found[0] ?? instantsForLocalMinute(h.year, h.month, h.day, minute + 60)[0];
    if (base === undefined) continue;
    const at = new Date(base + h.second * 1000).toISOString();
    if (!senders.includes(h.sender)) senders.push(h.sender);
    messages.push({ at, local, sender: h.sender, text: words, attachment, omitted, deleted, edited });
  }
  return { layout, messages, senders, notices, dates_could_be_month_first: monthFirstPossible };
}
