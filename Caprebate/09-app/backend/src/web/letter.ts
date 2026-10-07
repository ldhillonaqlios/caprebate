/**
 * THE ENGAGEMENT LETTER, RENDERED FROM THE DOCX THAT ALREADY EXISTS.
 *
 * `06-commercial-and-governance/Caprebate Engagement Letter.docx` is the
 * letter. It is not re-typed here and it is not summarised: this module reads
 * that file and turns its paragraphs into markup. If the letter changes, the
 * portal changes, and there is no second copy to forget.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE REFUSES TO DO, AND IT IS THE POINT OF IT
 *
 * TERMS IN THAT LETTER ARE STILL BLANK, AND HOW MANY IS DERIVED, NOT WRITTEN
 * HERE — `unresolvedTerms()` counts them from the document itself. This
 * sentence said FIVE until Phase 108 re-derived EIGHT on 9 September 2026 (the
 * prose had counted the clauses clause 13 names, not the placeholders), and it
 * said EIGHT until Phase 115 redrafted clause 7 on 10 September 2026 with three
 * more choices in square brackets. That is the point: the number moves when the
 * letter does. Run `unresolvedTerms()`. They are shown as blank, loudly.
 * A prototype that filled in a plausible break fee would be handing the next
 * reader a number with no decision behind it, and a number in a prototype
 * becomes a number in a contract. Board item 12984553034 is the question, it
 * is under Lakhbir, and it is not this build's to answer.
 *
 * The letter says so itself at clause 13: "These three terms are not yet
 * settled and are marked for completion before issue, in the same way as the
 * fee basis at clause 4 and the Break Fee at clause 5."
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AND A SECOND THING THE PROTOTYPE MUST NOT DO QUIETLY
 *
 * The .docx is a SPECIMEN. It names "Quenmoor Care Group" and quotes an
 * indicative range of £27,788–£73,125 — an invented client and an illustrative
 * figure. (Until Phase 153, 28 September 2026, the specimen was "Oakfield Care
 * Group", company number 09183422, and that number is a real, dissolved
 * company's. Name and number were both replaced in the .docx itself.) Rendering it unchanged into a real client's portal would show them
 * somebody else's name in their own contract. So the specimen values are
 * substituted where the record supplies a real one, and MARKED where it does
 * not. Neither is silent.
 *
 * SIGNING IS BUILT IN SINCE PHASE 146f, AND SWITCHED OFF: src/web/signing.ts.
 * The state machine (NOT_SENT → SENT → VIEWED → SIGNED) lives in the
 * `engagements` table, and SIGNED counts only with its signature record
 * (engagement_signatures). A letter with a term still in square brackets is
 * never signed, whatever the switch says.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readZipEntry, DOCX_DOCUMENT_ENTRIES, docxParagraphTexts } from './zip.ts';

export const LETTER_PATH = join(
  import.meta.dirname, '..', '..', '..', '..',
  '06-commercial-and-governance', 'Caprebate Engagement Letter.docx',
);

/**
 * THE TEST-ONLY COPY — Phase 153d, 4 October 2026 (Word questions 33, 34 and 196, the director's). Built on our
 * recommendation, for the director and the solicitor to check: the same letter with clause 5 (£995 a property plus the
 * charges of a surveyor already booked, at cost), clause 7(d) ("named in our privacy notice") and clause 13 (any
 * reduction; a settlement the client accepts counts) filled, each marked "test default, not agreed", and a TEST COPY
 * line under the title. The real letter above keeps its brackets: they are the director's and the solicitor's.
 * ONLY THE TEST WEBSITE READS THIS COPY: createApp's `testLetter`, passed by api/index.mjs alone. A test copy is never
 * signed, whatever the switch says (signing.ts), so a real client can never be sent it as a contract.
 */
export const TEST_LETTER_PATH = join(
  import.meta.dirname, '..', '..', '..', '..',
  '06-commercial-and-governance', 'Caprebate Engagement Letter - TEST DEFAULTS, not agreed.docx',
);
export const TEST_COPY_MARK = 'TEST COPY — for the test system only.';
export const TEST_DEFAULT_MARK = '(test default, not agreed)';

/**
 * A term the letter leaves open. `where` is the clause a person will look in.
 *
 * DERIVED FROM THE DOCUMENT, NOT LISTED BY HAND. `unresolvedTerms()` finds the
 * square-bracket placeholders in the text it just read, so a term that gets
 * filled in disappears from the portal without anybody editing this file — and
 * a NEW blank appears without anybody remembering to add it.
 */
export type OpenTerm = { readonly clause: string; readonly text: string };

export type Letter = {
  readonly paragraphs: readonly { readonly text: string; readonly heading: boolean }[];
  readonly openTerms: readonly OpenTerm[];
  /** Specimen values still in the rendered text, named so the screen can flag them. */
  readonly specimens: readonly string[];
  /** Phase 153d: true for the test-only copy (its TEST COPY line). Never signed. */
  readonly test_copy: boolean;
};

/** The specimen client and figures baked into the template. */
const SPECIMEN_CLIENT = 'Quenmoor Care Group';
/**
 * The same specimen WITH its suffix. The letter says "Quenmoor Care Group Ltd" in
 * three places; substituting only the bare name turned a record called
 * "Test Care Ltd" into "Test Care Ltd Ltd". The longer form is replaced first.
 */
const SPECIMEN_CLIENT_WITH_SUFFIX = 'Quenmoor Care Group Ltd';
/**
 * THE SPECIMEN COMPANY NUMBER. Invented since Phase 153 (28 September 2026):
 * 98604417 is not on the Companies House register (its page answered 404 that
 * day), and the register's numbers run nowhere near 98 million. The number it
 * replaced, 09183422, was not fictional: it is BEYOND BEAUTY (BIGGLESWADE)
 * LIMITED, dissolved 14 May 2019 (checked 12 September 2026, Phase 129). Until
 * this constant existed the portal replaced the specimen NAME and left the
 * number standing, so a real client's letter named them "under company number
 * 09183422". Substituted where the record supplies a number; FLAGGED where it
 * does not — an invented number is still not the client's.
 */
const SPECIMEN_COMPANY_NUMBER = '98604417';
const SPECIMEN_RANGE = '£27,788–£73,125';

/**
 * The letter's own XML, read through THE PROJECT'S ONE ZIP READER.
 *
 * THE FORTY-LINE CENTRAL-DIRECTORY WALK THAT USED TO LIVE HERE NOW LIVES IN
 * `zip.ts`, unchanged, because Phase 113c needed the same reading for uploaded
 * .docx files and a second copy would have been a second place to get the two
 * traps wrong. Both traps are documented at the top of that file: the
 * BACKSLASH entry paths this corpus really uses — `word\\document.xml`, whose
 * forward-slash lookup returns nothing and reads exactly like a corrupt file —
 * and the refusal to shell out to an `unzip` binary that is not on a stock
 * Windows machine.
 *
 * WHAT DID NOT MOVE IS THE POLICY. The letter is a file this build ships, so a
 * missing entry here is a broken install and this path lets it THROW. An
 * uploaded document is a client's file, so the extractor catches the same
 * error and returns its unreadable marker. Same reader, two right answers.
 */
function readDocumentXml(path: string): string {
  return readZipEntry(path, DOCX_DOCUMENT_ENTRIES).toString('utf8');
}

const CLAUSE_RE = /^(\d{1,2})\.\s+(.+)$/;

/**
 * PHASE 158b (F22, the Friary House run): the letter named a partnership "a company registered in England and Wales
 * under company number 98604417" - the specimen - and left "Date:" and "Subject property:" blank. The client's own
 * kind of business now decides how the letter describes them: a partnership, a sole trader or an individual has no
 * company number to give, so the company words and the specimen number go; an LLP is called one. A company with no
 * number on record keeps the specimen, flagged, as before - and signing refuses it (signing.ts).
 */
const SPECIMEN_PARTY = `a company registered in England and Wales under company number ${SPECIMEN_COMPANY_NUMBER}`;
const SPECIMEN_SIGNATURE_NUMBER = ` (Company No. ${SPECIMEN_COMPANY_NUMBER})`;
const PARTY_WORDS: Readonly<Record<string, string>> = Object.freeze({
  PARTNERSHIP: 'a partnership', SOLE_TRADER: 'a sole trader', INDIVIDUAL: 'an individual',
});

export function loadLetter(
  opts: {
    path?: string; clientName?: string; companyNumber?: string; range?: string;
    /** PHASE 158b: businesses.claimant_type, the property or properties, and the letter's date, as words. */
    claimantType?: string | null; property?: string | null; date?: string | null;
  } = {},
): Letter {
  const xml = readDocumentXml(opts.path ?? LETTER_PATH);
  const number = opts.companyNumber?.trim() ?? '';
  const kind = opts.claimantType ?? null;

  const paragraphs: { text: string; heading: boolean }[] = [];
  for (let text of docxParagraphTexts(xml)) {
    // PHASE 158b: who the client is, before the specimen number is replaced or flagged.
    const words = kind === null ? undefined : PARTY_WORDS[kind];
    if (words !== undefined) {
      text = text.split(SPECIMEN_PARTY).join(words).split(SPECIMEN_SIGNATURE_NUMBER).join('');
    } else if (kind === 'LLP' && number.length > 0) {
      text = text.split(SPECIMEN_PARTY).join(`a limited liability partnership registered in England and Wales under number ${number}`)
        .split(SPECIMEN_SIGNATURE_NUMBER).join(` (Registered No. ${number})`);
    }
    if (text === 'Subject property:' && opts.property != null && opts.property.trim() !== '') text = `Subject property: ${opts.property.trim()}`;
    if (text === 'Date:' && opts.date != null && opts.date.trim() !== '') text = `Date: ${opts.date.trim()}`;
    // Substitute the specimen client, or leave it and let the screen flag it.
    if (opts.clientName !== undefined && opts.clientName.length > 0) {
      text = text.split(SPECIMEN_CLIENT_WITH_SUFFIX).join(opts.clientName);
      text = text.split(SPECIMEN_CLIENT).join(opts.clientName);
    }
    // The number travels with the name. Absent or empty is NOT a blank: the
    // specimen stays and is flagged below, so nobody reads it as the client's.
    if (opts.companyNumber !== undefined && opts.companyNumber.trim().length > 0) {
      text = text.split(SPECIMEN_COMPANY_NUMBER).join(opts.companyNumber.trim());
    }
    if (opts.range !== undefined && opts.range.length > 0) {
      text = text.split(SPECIMEN_RANGE).join(opts.range);
    }
    paragraphs.push({ text, heading: CLAUSE_RE.test(text) || text === 'ENGAGEMENT LETTER' });
  }

  const rendered = paragraphs.map((p) => p.text).join('\n');
  return {
    paragraphs,
    openTerms: unresolvedTerms(paragraphs),
    test_copy: paragraphs.some((p) => p.text.startsWith(TEST_COPY_MARK)),
    specimens: [
      ...(rendered.includes(SPECIMEN_CLIENT) ? [`the specimen client name "${SPECIMEN_CLIENT}"`] : []),
      ...(rendered.includes(SPECIMEN_COMPANY_NUMBER)
        ? [`the specimen company number ${SPECIMEN_COMPANY_NUMBER}`] : []),
      ...(rendered.includes(SPECIMEN_RANGE) ? [`the specimen indicative range ${SPECIMEN_RANGE}`] : []),
    ],
  };
}

/**
 * Every square-bracket placeholder still in the letter, tagged with the clause
 * it sits in. Nested brackets — `[... £[amount]]` at clause 4 — are matched
 * outermost-first so one open term is reported once rather than twice.
 */
export function unresolvedTerms(
  paragraphs: readonly { readonly text: string }[],
): readonly OpenTerm[] {
  const out: OpenTerm[] = [];
  let clause = 'the preamble';
  for (const p of paragraphs) {
    const m = CLAUSE_RE.exec(p.text);
    if (m) clause = `clause ${m[1]} — ${m[2]}`;
    for (const term of bracketed(p.text)) out.push({ clause, text: term });
  }
  return out;
}

/** Outermost bracket groups, so `[a [b]]` yields one term and not two. */
function bracketed(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[') { if (depth === 0) start = i; depth++; }
    else if (c === ']') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; }
    }
  }
  return out;
}

/** Present, so a test can assert the file is where the phase brief said it is. */
export function letterExists(path = LETTER_PATH): boolean {
  try { readFileSync(path); return true; } catch { return false; }
}
