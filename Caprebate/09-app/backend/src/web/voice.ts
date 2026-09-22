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

/**
 * THE PLAIN-WORDS LIST — PHASE 144, 22 September 2026.
 *
 * Lakhbir, 18 September 2026: the back office "needs to be readable at a 12-year-old level and to the point". These
 * are words our own design notes used that a person on a screen should never have to read. Each row is
 * [the pattern, the word, what to say instead]. 03-app/caprebate-plain-words-check.cjs reads this list (by parsing
 * this file, so keep each row on the one-line shape below) and fails on any of these words in anything a person reads
 * in src/web/*.ts. Comments, SQL, ids and audit event names are code, not words on a screen, and may keep them.
 */
export const PLAIN_SWAPS: readonly (readonly [RegExp, string, string])[] = Object.freeze([
  [/\bfired\b|\bfires\b|\bnot fire\b/i, 'fired', 'checked, or looked up'],
  [/\btiers?\b/i, 'tier', 'free or paid'],
  [/\bprovenance\b/i, 'provenance', 'where this came from'],
  [/\bderived\b|\bDERIVED\b/i, 'derived', 'worked out'],
  [/\bgates?\b|\bgated\b/i, 'gate', 'check'],
  [/\breceipt (?:strip|contract)\b/i, 'receipt strip', 'we read it, then deleted the file'],
  [/\bhash(?:es|ed)?\b|\bSHA-?256\b/i, 'hash', 'audit log'],
  [/\bchain (?:intact|broken)\b|\bhash chain\b|\bthe chain\b/i, 'chain', 'audit log'],
  [/\bN4\b/, 'N4', 'say the rule: not known is never counted as nothing'],
  [/\bpayloads?\b/i, 'payload', 'what we send'],
  [/\bstub(?:s|bed)?\b/i, 'stub', 'not switched on yet'],
  [/\boutbox\b/i, 'outbox', 'emails waiting to send'],
  [/\bdeletion clock\b/i, 'deletion clock', 'deleted on (date)'],
  [/\bUNSET\b/, 'UNSET', 'no date set yet'],
  [/\bNOT_COVERED\b/, 'NOT_COVERED', 'no rule for this yet'],
  [/\bYYYY-MM-DD\b/, 'YYYY-MM-DD', 'a date like 31/03/2026'],
  [/\bHTTP\b|\bPUT request\b|\bwith an? (?:HTTP )?PUT\b/, 'HTTP PUT', 'upload the file'],
  [/\bsealed\b/i, 'sealed', 'locked'],
  [/\bescaped\b/i, 'escaped', 'shown as typed'],
  [/\bnon-negotiable\b/i, 'non-negotiable', 'always'],
  [/\bone-next-action rule\b/i, 'one-next-action rule', 'one next step at a time'],
  [/\bnought\b/i, 'nought', 'nothing, or £0'],
  [/\bqualifying expenditure\b/i, 'qualifying expenditure', 'spend that counts'],
  [/\bnot recognised\b/i, 'not recognised', 'not set'],
  [/\bstubbed\b/i, 'stubbed', 'not sent yet'],
  [/\bnarrate\b/i, 'narrate', 'tell'],
  [/\btraced to cost elements\b|\bcost elements?\b/i, 'cost element', 'the items it paid for'],
  [/\bidempoten(?:t|cy)\b/i, 'idempotent', 'safe to do twice'],
  [/\bcanonical\b/i, 'canonical', 'the one true copy'],
  [/\bpersist(?:ed|s)?\b/i, 'persisted', 'saved'],
  [/\benum\b|\bboolean\b/, 'code word', 'say what it means'],
  [/\bqueued?\b/i, 'queued', 'waiting to send'],
  [/\bartefacts?\b|\bartifacts?\b/i, 'artefact', 'file'],
  [/\bRET-\d+\b|\bSDP-\w+\b/, 'rule code', 'say the rule in words'],
] as const);
