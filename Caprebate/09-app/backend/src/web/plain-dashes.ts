/**
 * NO EM DASHES ON SCREEN — PHASE 160c, 19 October 2026.
 *
 * Lakhbir: "remove the — AI uses". The house rule is that copy a person reads never uses the long dash; it uses a comma,
 * a colon or a full stop. There are well over a thousand in the screens' words and in the names records carry ("Company —
 * main site"), so rather than rewrite each, `page()` (src/web/html.ts) passes every finished page through this, the way it
 * already passes dates and "(required)" through theirs. It changes only the words a person reads:
 *
 *   · text between tags, and the four attributes a person reads or hears (title, alt, placeholder, aria-label);
 *   · never inside a script, a style, a text box (what someone typed stays as they typed it), pre or code, nor inside an
 *     element marked `data-as-made` (Phase 160d: an older approved report, drawn in the words it was made in);
 *   · never an attribute a form sends back (value, name, href), so nothing a form posts is changed on its way round.
 *
 * THE RULES, for each long dash in a run of words (a spaced "a — b" or an unspaced "a—b"):
 *   1. a dash standing alone in a cell or a label, meaning "nothing here", becomes "None";
 *   2. two dashes around an aside in one sentence ("a — the aside — b") become two commas;
 *   3. before "or", "and", "but", "so", "not", "which" and the other joining words, or before a number, a comma;
 *   4. (none: a "short ending takes a comma" rule was dropped the same day, because it made one name read two ways,
 *      "Company, main site" in a heading and "Company: main site" in the page's title);
 *   5. where the sentence already has a colon before it, a comma;
 *   6. at the very end of a run (the words go on after a tag), a colon;
 *   7. otherwise a colon ("Tax return — a document we need" reads "Tax return: a document we need").
 *
 * The signed and kept documents (the engagement letter, the reports, the PDFs) and the emails are NOT drawn by `page()`
 * and are not changed here: their versions are fixed. They have a phase of their own (see ACTION-PLAN.md).
 */

const DASH = /\s*(?:—|&mdash;|&#8212;|&#x2014;)\s*/gi;
const ANY_DASH = /—|&mdash;|&#8212;|&#x2014;/i;
const JOINING = new Set(['or', 'and', 'but', 'so', 'not', 'nor', 'yet', 'then', 'which', 'who', 'whose', 'because', 'unless',
  'until', 'while', 'if', 'when', 'with', 'without', 'before', 'after', 'as', 'though', 'although', 'once', 'since', 'for']);
const READ_ATTRS = /(\s(?:title|alt|placeholder|aria-label)=")([^"]*)(")/gi;
const SKIP = new Set(['script', 'style', 'textarea', 'pre', 'code']);

/** One run of words, with every long dash in it changed by the rules above. */
export function plainDashText(text: string, wholeElement = false): string {
  if (!ANY_DASH.test(text)) return text;
  // Rule 1: a dash that is all an element holds (a table cell, a label's value) means "nothing here".
  if (wholeElement && /^(?:—|&mdash;|&#8212;|&#x2014;)$/i.test(text.trim())) return 'None';
  const parts = text.split(DASH);
  const n = parts.length - 1;
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  let out = (parts[0] ?? '').trim() === '' ? '' : lead + (parts[0] ?? '').trim();
  for (let i = 0; i < n; i += 1) {
    const before = parts.slice(0, i + 1).join(' ').trim();
    const next = (parts[i + 1] ?? '').trim();
    const restOfRun = parts.slice(i + 1).join(' ').trim();
    const firstWord = (next.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9£]/g, '');
    const sentenceBefore = before.split(/[.!?]\s/).pop() ?? before;
    let sep: string;
    if (restOfRun === '') sep = ':';                                                          // rule 6, a dash ending the run
    else if (n === 2 && !/[.!?]/.test(parts[1] ?? '') && before !== '') sep = ', ';           // rule 2, an aside
    else if (JOINING.has(firstWord) || /^[0-9£]/.test(firstWord)) sep = ', ';                 // rule 3
    else if (sentenceBefore.includes(':')) sep = ', ';                                       // rule 5
    else sep = ': ';                                                                          // rule 7
    // A run that starts with its dash follows a tag ("<b>X</b> — Y"): the mark sits against the word before it, as
    // the run's own leading space is dropped above.
    out += sep + next;
  }
  return out + trail;
}

/** A whole page, with the long dashes in the words a person reads changed, and nothing else touched. */
export function plainDashes(html: string): string {
  if (!ANY_DASH.test(html)) return html;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->|<!doctype[^>]*>/gi;
  const tags: { at: number; tag: string; name: string; closing: boolean }[] = [];
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    tags.push({ at: m.index, tag: m[0], name: (m[2] ?? '').toLowerCase(), closing: m[1] === '/' });
  }
  let out = '';
  let skip: string | null = null;
  // PHASE 160d: an element marked `data-as-made` (an approved report's older version) keeps its words exactly, however
  // many elements of its own kind it holds, so the depth is counted.
  let depth = 0;
  let last = 0;
  let before: (typeof tags)[number] | null = null;
  for (const t of tags) {
    const text = html.slice(last, t.at);
    // The text is all its element holds when the tag before it opens an element and this one closes the same one.
    const whole = before !== null && !before.closing && before.name === t.name && t.closing;
    const changed = skip === null ? plainDashText(text, whole) : text;
    // A run that starts with its dash ("Tax return <span>— a document</span>"): its colon or comma belongs against the
    // word before, so the space before the tags in between goes.
    if (changed !== text && /^[:,]/.test(changed) && /^\s*(?:—|&mdash;|&#8212;|&#x2014;)/i.test(text)) out = out.replace(/\s+((?:<[^>]+>)*)$/, '$1');
    out += changed;
    if (skip === null && !t.closing && (SKIP.has(t.name) || /\sdata-as-made\b/.test(t.tag))) { skip = t.name; depth = 1; }
    else if (skip !== null && t.name === skip && !t.closing && !/\/>$/.test(t.tag)) depth += 1;
    else if (skip !== null && t.closing && t.name === skip) { depth -= 1; if (depth === 0) skip = null; }
    out += skip === null && !t.closing && t.name !== '' ? t.tag.replace(READ_ATTRS, (_all, a: string, v: string, z: string) => a + plainDashText(v) + z) : t.tag;
    last = t.at + t.tag.length;
    before = t;
  }
  const tail = html.slice(last);
  return out + (skip === null ? plainDashText(tail) : tail);
}

/**
 * PHASE 160d, 19 October 2026 — PLAIN TEXT, LINE BY LINE: an email's subject and body, a task's title, an export's
 * column name. Each line is one run of words for the rules above, so a dash in one paragraph never pairs with one in
 * another.
 */
export function plainDashLines(text: string): string {
  if (!ANY_DASH.test(text)) return text;
  // A line that is only a dash stands for "nothing here" (an empty value in a report), as a lone dash in a cell does.
  return text.split('\n').map((line) => plainDashText(line, true)).join('\n');
}

