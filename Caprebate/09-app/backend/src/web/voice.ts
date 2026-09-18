/**
 * THE BRAND BOOK'S AVOID LIST, IN ONE PLACE — PHASE 133d, 17 September 2026.
 *
 * Phase 133c wrote this list inside test/phase133c.test.ts. Phase 133d needs the same rules for the public site, the
 * notices page and the complaint form (03-app/caprebate-brand-check.cjs), and for the engagement letter now that the
 * test no longer exempts it, so the list lives here and both import it. Brand book v1.0, slide 15 (and 14 and 52).
 *
 * THREE WORDS ARE ALLOWED IN ONE SENSE ONLY, and each exception is the correct use, not a loosening:
 *  - "capital gains" where the text DISTINGUISHES it — "not capital gains tax", "separate from capital gains tax",
 *    "Is this the same as capital gains tax? No". Slide 15's rule is never to CONFLATE the two; saying they differ is
 *    how a page obeys it, and the engagement letter's "not against capital gains tax" is exactly that.
 *  - "guaranteed-use", the name of the period an NHS premises grant attaches to. It promises nothing.
 *  - "scheme" alone is not listed: on these pages it is a building ("a supported living scheme") or a pension scheme.
 *    What slide 15 forbids is a TAX scheme, so "tax scheme", "avoidance scheme" and "tax avoidance" are listed.
 */

export const AVOID: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/\bguaranteed\b(?!-use)/i, 'guaranteed'], [/\brisk-free\b/i, 'risk-free'], [/\bno-brainer\b/i, 'no-brainer'],
  [/\bfree money\b/i, 'free money'], [/\bloophole\b/i, 'loophole'], [/\bHMRC[- ]approved\b/i, 'HMRC approved'],
  [/\bpre-approved\b/i, 'pre-approved'], [/\bwe get you\b/i, 'we get you'], [/\bcapital gains\b/i, 'capital gains'],
  [/\bno win,? no fee\b/i, 'no win no fee'], [/(?<!Cap )\brebate\b/i, '"rebate" as a refund'],
  [/\bworkaround\b/i, 'workaround'], [/\btax avoidance\b/i, 'tax avoidance'], [/\b(tax|avoidance) scheme\b/i, 'a tax scheme'],
] as const);

/** "capital gains" used to say the relief is NOT capital gains tax — the one use slide 15 wants. */
function distinguishesCapitalGains(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 60), at);
  return /\b(not|nor|isn’t|isn't|distinct from|separate from|different from|same as|confuse[sd]? with)\b[^.?]*$/i.test(before);
}

/** Every avoid-list word in `text`, with a little context, skipping the allowed uses above. */
export function avoidHits(text: string): { word: string; at: number; context: string }[] {
  const out: { word: string; at: number; context: string }[] = [];
  for (const [re, word] of AVOID) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) {
      const at = m.index ?? 0;
      if (word === 'capital gains' && distinguishesCapitalGains(text, at)) continue;
      out.push({ word, at, context: text.slice(Math.max(0, at - 60), at + 40) });
    }
  }
  return out;
}
