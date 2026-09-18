/**
 * HELP, INSIDE THE APP — PHASE 133c, 17 September 2026 (B5).
 *
 * The "Help" link in every header opens the user guide's training section for the screen it was pressed on. The words
 * are the guide's own, copied in by tools/build-help.cjs (src/web/help-content.ts), so the page and the guide cannot
 * say different things. This file only draws them.
 *
 * THE MARKDOWN IS THE GUIDE'S, AND IT IS STILL ESCAPED. The renderer below understands only what Part 3 uses —
 * headings, paragraphs, lists, tables, a rule, bold, italic and code — and builds every piece with `h`, so a character
 * in the guide can never become markup.
 *
 * WHO SEES WHAT. Staff see any training section (the guide is a staff document, and it names no client). The client
 * sees the portal's own section, C6, without its trainer's exercise and self-check.
 */

import { h, raw, type Safe } from './html.ts';
import { HELP_INTRO, HELP_SECTIONS, type HelpSection } from './help-content.ts';

/** The name a person reads is "Cap Rebate": the guide's own "Caprebate" is shown so, except inside a file name or code. */
function displayName(text: string): string {
  return text.replace(/Caprebate(?![-\w]*\.(?:md|html|docx|cjs|ts|csv))(?![-\w])/g, 'Cap Rebate');
}

function inline(text: string): Safe {
  const parts: Safe[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(h`${displayName(text.slice(last, at))}`);
    if (m[2] !== undefined) parts.push(h`<strong>${displayName(m[2])}</strong>`);
    else if (m[3] !== undefined) parts.push(h`<code>${m[3]}</code>`);
    else if (m[4] !== undefined) parts.push(h`<em>${displayName(m[4])}</em>`);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(h`${displayName(text.slice(last))}`);
  return h`${parts}`;
}

/** The subset of markdown Part 3 uses, drawn with `h`. */
export function renderMarkdown(md: string): Safe {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Safe[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') { i++; continue; }
    const head = /^(#{2,4})\s+(.*)$/.exec(line);
    if (head !== null) {
      const level = Math.min((head[1] ?? '##').length + 0, 4);
      const t = head[2] ?? '';
      out.push(level === 2 ? h`<h2>${inline(t)}</h2>` : level === 3 ? h`<h3>${inline(t)}</h3>` : h`<h4>${inline(t)}</h4>`);
      i++; continue;
    }
    if (/^---\s*$/.test(line)) { out.push(raw('<hr>')); i++; continue; }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i] ?? '')) {
        const cells = (lines[i] ?? '').trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [first, ...body] = rows;
      out.push(h`<div class="tablewrap"><table>${first === undefined ? raw('') : h`<thead><tr>${first.map((c) => h`<th>${inline(c)}</th>`)}</tr></thead>`}
        <tbody>${body.map((r) => h`<tr>${r.map((c) => h`<td>${inline(c)}</td>`)}</tr>`)}</tbody></table></div>`);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/; const numbered = /^\s*\d+\.\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const m = (ordered ? numbered : bullet).exec(l);
        if (m !== null) { items.push(m[1] ?? ''); i++; continue; }
        if (l.trim() !== '' && /^\s{2,}\S/.test(l) && items.length > 0) { items[items.length - 1] += ` ${l.trim()}`; i++; continue; }
        break;
      }
      const lis = items.map((t) => h`<li>${inline(t)}</li>`);
      out.push(ordered ? h`<ol>${lis}</ol>` : h`<ul>${lis}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (l.trim() === '' || /^(#{2,4}\s|\||---\s*$|\s*[-*]\s+|\s*\d+\.\s+)/.test(l)) break;
      para.push(l.trim()); i++;
    }
    out.push(h`<p>${inline(para.join(' '))}</p>`);
  }
  return h`${out}`;
}

export function helpSectionFor(code: string): HelpSection | undefined {
  return HELP_SECTIONS.find((s) => s.codes.includes(code));
}

/** The client's Help: the portal's section without the trainer's exercise and self-check. */
export function clientHelp(): Safe {
  const s = helpSectionFor('C6');
  if (s === undefined) return h`<p>Help for this page is not written yet. Contact us and we will talk you through it.</p>`;
  const kept = s.markdown.split(/\n(?=\*\*Try it on the demo\*\*|\*\*Check yourself\*\*)/)[0] ?? s.markdown;
  return renderMarkdown(kept.replace(/Sign in as the client; you land/g, 'Sign in; you land'));
}

/** "B17/B18 claims" → "Claims": the screen codes are the developer's, not the reader's. */
function plainTitle(t: string): string {
  const words = t.replace(/^[BC]\d+(?:[\/–-][BC]\d+)*\s+/, '');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Staff Help for one screen code, with the list of every section beneath it. */
export function staffHelp(code: string): { title: string; body: Safe } {
  const s = helpSectionFor(code) ?? helpSectionFor('B0');
  const list = h`<section class="card"><div class="card-h"><h2>Every screen's training</h2></div><ul class="plain">${
    HELP_SECTIONS.map((x) => h`<li><a href="/staff/help?screen=${x.codes[0] ?? 'B0'}">${plainTitle(x.title)}</a></li>`)}</ul></section>`;
  if (s === undefined) return { title: 'Help', body: h`<p>No training section is written yet.</p>${list}` };
  return {
    title: `Help: ${plainTitle(s.title)}`,
    body: h`<div class="guide card"><p class="eyebrow">Training, from the user guide</p><h1>${plainTitle(s.title)}</h1>${renderMarkdown(s.markdown)}</div>
      <details class="card"><summary>How the training sections work</summary>${renderMarkdown(HELP_INTRO)}</details>${list}`,
  };
}
