/**
 * A REFUSED FORM KEEPS WHAT WAS TYPED — PHASE 133c, 17 September 2026 (B6).
 *
 * Until this phase a refusal landed on a separate "Not saved" page with a "Go back" link, and whatever the person had
 * typed was gone. `problem()` in src/web/staff.ts now redraws the page the form was on — the ordinary GET, under the
 * same login — and this file puts the typed values back into THAT form, puts the refusal's words at the top of it, and
 * opens the <details> and the tab that hold it, so the person sees the message where they typed.
 *
 * IT ONLY EVER WORKS ON MARKUP THIS APPLICATION DREW, and every value it writes is escaped. A password is never written
 * back. When the form cannot be found on the page (the refusal came from somewhere else), it returns null and the caller
 * shows the plain refusal with the typed values listed, so nothing typed is lost either way.
 *
 * THE MESSAGE SITS BESIDE THE FIELD IT IS ABOUT — PHASE 133d (D4). Phase 133c put it at the top of the form, because the
 * stores refused with a sentence and no field name. The ten most-used forms' stores now name the posted field a refusal
 * is about (`field` on the refusal: the task, the next action, a lead, an enquiry check, a claim move, the claim, the
 * organisation, a contact, a property, a document request). Where the form holds that field, the message is drawn
 * straight after it — after its <label> when the field sits inside one — and the field is marked aria-invalid and
 * described by the message. A refusal about no one field (a gate that is not ready, a claim that has closed) and any
 * form whose store does not name one keep the message at the top of the form, as before. Nothing is guessed.
 */

import { escapeHtml } from './html.ts';

type Found = { start: number; openEnd: number; end: number };

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m === null ? null : (m[1] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Every form on the page posting to `action`, scored by how well its hidden fields agree with what was posted. */
function findForm(html: string, action: string, typed: URLSearchParams): Found | null {
  let best: Found | null = null; let bestScore = -1;
  for (const m of html.matchAll(/<form\b[^>]*>/g)) {
    const tag = m[0];
    if ((attr(tag, 'method') ?? 'get').toLowerCase() !== 'post') continue;
    const a = attr(tag, 'action');
    if (a === null || new URL(a, 'http://localhost').pathname !== action) continue;
    const start = m.index ?? 0; const openEnd = start + tag.length;
    const end = html.indexOf('</form>', openEnd);
    if (end < 0) continue;
    const inner = html.slice(openEnd, end);
    let score = 0; let clash = false;
    for (const h of inner.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
      const name = attr(h[0], 'name'); const value = attr(h[0], 'value') ?? '';
      if (name === null || !typed.has(name)) continue;
      if (typed.get(name) === value) score++; else clash = true;
    }
    if (clash) continue;
    if (score > bestScore) { best = { start, openEnd, end }; bestScore = score; }
  }
  return best;
}

function setAttr(tag: string, name: string, value: string | null): string {
  const without = tag.replace(new RegExp(`\\s${name}(="[^"]*")?(?=[\\s>/])`, 'g'), '');
  if (value === null) return without;
  return without.replace(/\s*\/?>$/, (end) => ` ${name}="${escapeHtml(value)}"${end.trim() === '/>' ? ' />' : '>'}`);
}

/** The form's inner markup with the typed values in it. */
function refillInner(inner: string, typed: URLSearchParams): string {
  let out = inner.replace(/<input\b[^>]*>/g, (tag) => {
    const name = attr(tag, 'name'); const type = (attr(tag, 'type') ?? 'text').toLowerCase();
    if (name === null || ['hidden', 'submit', 'button', 'file', 'password'].includes(type)) return tag;
    if (type === 'checkbox' || type === 'radio') {
      const value = attr(tag, 'value') ?? 'on';
      return setAttr(tag, 'checked', typed.getAll(name).includes(value) ? '' : null).replace(/ checked=""/, ' checked');
    }
    return typed.has(name) ? setAttr(tag, 'value', typed.get(name) ?? '') : tag;
  });
  out = out.replace(/(<select\b[^>]*>)([\s\S]*?)(<\/select>)/g, (all, open: string, body: string, close: string) => {
    const name = attr(open, 'name');
    if (name === null || !typed.has(name)) return all;
    const want = typed.get(name) ?? '';
    const opts = body.replace(/<option\b[^>]*>/g, (o) => {
      const plain = o.replace(/\sselected(?=[\s>])/g, '');
      return (attr(plain, 'value') ?? '') === want ? plain.replace(/>$/, ' selected>') : plain;
    });
    return `${open}${opts}${close}`;
  });
  out = out.replace(/(<textarea\b[^>]*>)([\s\S]*?)(<\/textarea>)/g, (all, open: string, _body: string, close: string) => {
    const name = attr(open, 'name');
    return name === null || !typed.has(name) ? all : `${open}${escapeHtml(typed.get(name) ?? '')}${close}`;
  });
  return out;
}

/** Opens every <details> still open around `at`, and marks the tab panel that holds it. */
function revealAround(html: string, at: number): string {
  const before = html.slice(0, at);
  const opens: number[] = [];
  for (const m of before.matchAll(/<details\b[^>]*>|<\/details>/g)) {
    if (m[0].startsWith('</')) opens.pop(); else opens.push(m.index ?? 0);
  }
  let panel = -1;
  let depth = 0;
  const sections = [...before.matchAll(/<section\b[^>]*>|<\/section>/g)];
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i]; if (s === undefined) continue;
    if (s[0].startsWith('</')) { depth++; continue; }
    if (depth > 0) { depth--; continue; }
    if (/class="[^"]*\btabpanel\b/.test(s[0])) { panel = s.index ?? -1; break; }
  }
  const edits = [...opens.map((i) => ({ i, kind: 'details' as const })), ...(panel >= 0 ? [{ i: panel, kind: 'panel' as const }] : [])]
    .sort((a, b) => b.i - a.i);
  let out = html;
  for (const e of edits) {
    const close = out.indexOf('>', e.i);
    const tag = out.slice(e.i, close + 1);
    const next = e.kind === 'details'
      ? (/\sopen[\s>]/.test(tag) ? tag : tag.replace(/^<details/, '<details open'))
      : tag.replace(/class="([^"]*)"/, (_m, c: string) => `class="${c} has-refusal"`);
    out = out.slice(0, e.i) + next + out.slice(close + 1);
  }
  return out;
}

/** The three kinds of form field, as a regular expression group. (A constant, so no line pairs the word with a `${}`.) */
const FIELD_TAGS = '(input|select|textarea)';

/** The refusal's sentence, starting with a capital: a few stores write theirs to follow a colon. */
function sentence(why: string): string {
  return why.length === 0 ? why : why[0]!.toUpperCase() + why.slice(1);
}

/**
 * The form's inner markup with the message placed beside the control named `field`, or null when the form has no such
 * control. The control gains aria-invalid and aria-describedby; the message follows its enclosing <label>, or the
 * control itself (its closing tag, for a select or a textarea).
 */
function besideField(inner: string, field: string, message: (id: string) => string): string | null {
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<${FIELD_TAGS}\\b[^>]*\\sname="${esc}"[^>]*>`).exec(inner);
  if (m === null) return null;
  const id = `refusal-${field.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const start = m.index ?? 0;
  const tag = setAttr(setAttr(m[0], 'aria-invalid', 'true'), 'aria-describedby', id);
  let out = inner.slice(0, start) + tag + inner.slice(start + m[0].length);
  const afterTag = start + tag.length;
  const kind = (m[1] ?? '').toLowerCase();
  let at = kind === 'input' ? afterTag : out.indexOf(`</${kind}>`, afterTag) + `</${kind}>`.length;
  const before = out.slice(0, start);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) {
    const close = out.indexOf('</label>', at);
    if (close >= 0) at = close + '</label>'.length;
  }
  out = out.slice(0, at) + message(id) + out.slice(at);
  return out;
}

/**
 * The page with the refused form refilled and its message beside the field the refusal names — or at the top of the form
 * when it names none, or names one the form does not hold. Null when the page holds no form that posts to `action`.
 * `title` and `why` are the refusal's own words.
 */
export function refillForm(page: string, action: string, typed: URLSearchParams, title: string, why: string, field?: string): string | null {
  const f = findForm(page, action, typed);
  if (f === null) return null;
  const words = `<strong>${escapeHtml(title)}.</strong> ${escapeHtml(sentence(why))} What you typed is still here.`;
  const inner = refillInner(page.slice(f.openEnd, f.end), typed);
  const beside = field === undefined ? null
    : besideField(inner, field, (id) => `<p class="fielderr" id="${id}" role="alert">${words}</p>`);
  const body = beside ?? `<div class="formerr" role="alert">${words}</div>${inner}`;
  const rebuilt = page.slice(0, f.openEnd) + body + page.slice(f.end);
  return revealAround(rebuilt, f.start);
}

/** Every value that was typed, for the plain refusal page when the form cannot be found. Passwords and hidden keys left out. */
export function typedValues(typed: URLSearchParams): { name: string; value: string }[] {
  return [...typed.entries()].filter(([k, v]) => v.trim() !== '' && !/password|token|^back$|_id$|^kind$|^to$/.test(k)).map(([name, value]) => ({ name, value }));
}
