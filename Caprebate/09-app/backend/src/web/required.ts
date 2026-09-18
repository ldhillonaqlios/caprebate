/**
 * "(REQUIRED)" IN WORDS BESIDE EVERY REQUIRED FIELD — PHASE 133d, 17 September 2026 (D1).
 *
 * Phase 133c wrote "(required)" by hand into three forms (the task, the lead and the enquiry check). Every other form
 * that carries `required` showed nothing a person could read: the browser's own marker only appears after a failed
 * submit, and a screen reader or a printout never sees it. Rather than edit some ninety labels one by one — and miss
 * the next one somebody adds — `page()` in src/web/html.ts passes every page body through this, as it already passes
 * it through `ukDatesInMarkup`. A test crawls every page every login reaches and fails on a required control whose label
 * does not say so (test/phase133d.test.ts).
 *
 * A CONTROL'S LABEL IS FOUND THE WAY A BROWSER FINDS IT, then one fallback:
 *   1. `<label for="x">` when the control has id="x";
 *   2. the `<label>` the control sits inside;
 *   3. a `<label>` with no `for` that ends immediately before the control (`<label class="fl">Name</label><input …>`),
 *      which is how the account and sign-up forms are drawn.
 * A label that already carries `class="req"` is left alone. Hidden inputs are not fields. The words go inside the label,
 * so they are read with the field's name.
 */

const REQ = '<span class="req">(required)</span>';
const CONTROL = /<(input|select|textarea)\b[^>]*>/gi;

function isRequired(tag: string): boolean {
  return /\srequired(?=[\s>/=])/i.test(tag) && !/\stype="hidden"/i.test(tag);
}

type Edit = { at: number; text: string };

export function requiredWordsInMarkup(html: string): string {
  const edits: Edit[] = [];
  const done = new Set<number>();
  for (const m of html.matchAll(CONTROL)) {
    const tag = m[0];
    if (!isRequired(tag)) continue;
    const at = m.index ?? 0;
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];

    // 1. <label for="id">
    if (id !== undefined) {
      const lm = new RegExp(`<label\\b[^>]*\\sfor="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([\\s\\S]*?)</label>`).exec(html);
      if (lm !== null) {
        const close = (lm.index ?? 0) + lm[0].length - '</label>'.length;
        if (!/class="req"/.test(lm[1] ?? '') && !done.has(close)) { edits.push({ at: close, text: ` ${REQ}` }); done.add(close); }
        continue;
      }
    }

    // 2. inside an open <label>
    const before = html.slice(0, at);
    const open = before.lastIndexOf('<label');
    const closed = before.lastIndexOf('</label>');
    if (open >= 0 && open > closed) {
      const inner = before.slice(open);
      if (!/class="req"/.test(inner) && !done.has(at)) { edits.push({ at, text: `${REQ} ` }); done.add(at); }
      continue;
    }

    // 3. a label with no `for` that ends right before the control
    const prev = /<label\b(?![^>]*\sfor=)[^>]*>((?:(?!<label\b)[\s\S])*?)<\/label>\s*$/.exec(before);
    if (prev !== null) {
      const close = (prev.index ?? 0) + prev[0].trimEnd().length - '</label>'.length;
      if (!/class="req"/.test(prev[1] ?? '') && !/<(input|select|textarea)\b/i.test(prev[1] ?? '') && !done.has(close)) {
        edits.push({ at: close, text: ` ${REQ}` }); done.add(close);
      }
    }
  }
  if (edits.length === 0) return html;
  let out = html;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);
  return out;
}

/**
 * For the test: every required control on a page whose label does not say "(required)", described by its name.
 * The same three ways of finding a label as above, so a control this cannot label is reported rather than passed.
 */
export function requiredWithoutWords(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(CONTROL)) {
    const tag = m[0];
    if (!isRequired(tag)) continue;
    const at = m.index ?? 0;
    const name = /\sname="([^"]*)"/.exec(tag)?.[1] ?? tag.slice(0, 60);
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    let label: string | null = null;
    if (id !== undefined) label = new RegExp(`<label\\b[^>]*\\sfor="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([\\s\\S]*?)</label>`).exec(html)?.[1] ?? null;
    const before = html.slice(0, at);
    if (label === null) {
      const open = before.lastIndexOf('<label'); const closed = before.lastIndexOf('</label>');
      if (open >= 0 && open > closed) label = before.slice(open);
    }
    if (label === null) label = /<label\b(?![^>]*\sfor=)[^>]*>((?:(?!<label\b)[\s\S])*?)<\/label>\s*$/.exec(before)?.[1] ?? null;
    if (label === null || !/\(required\)/.test(label.replace(/<[^>]+>/g, ''))) out.push(name);
  }
  return out;
}

/**
 * PHASE 133e (D5) — LABELLED BY POSITION IS NOT LABELLED.
 *
 * `requiredWordsInMarkup` above will put "(required)" into a bare `<label>` that merely SITS before a control
 * (route 3), because that is how several of these forms are drawn and the words are worth having either way.
 * A screen reader does not read it that way. Route 3 is a repair, not a join: the label and the field are two
 * unrelated elements, and a person using a screen reader hears "edit text, blank" with the words nowhere near it.
 *
 * So this reports every required control that ONLY route 3 can label — no `for`/`id` pair, and no enclosing
 * `<label>`. Nothing else in this module changes behaviour; this is the thing the test measures.
 */
export function requiredLabelledByPositionOnly(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(CONTROL)) {
    const tag = m[0];
    if (!isRequired(tag)) continue;
    const at = m.index ?? 0;
    const name = /\sname="([^"]*)"/.exec(tag)?.[1] ?? tag.slice(0, 60);
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];

    // 1. a <label for="id"> anywhere on the page — the join a browser makes
    if (id !== undefined) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`<label\\b[^>]*\\sfor="${esc}"`).test(html)) continue;
    }
    // 2. the <label> the control sits inside
    const before = html.slice(0, at);
    const open = before.lastIndexOf('<label');
    const closed = before.lastIndexOf('</label>');
    if (open >= 0 && open > closed) continue;

    out.push(name);
  }
  return out;
}
