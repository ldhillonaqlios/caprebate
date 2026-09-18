/**
 * THE TEXT EXTRACTOR — AND THE ONE ASSERTION THAT ACTUALLY MATTERS.
 *
 * Two thirds of this file is unit work on `src/web/extract-text.ts`: does a
 * known sentence come back out of a .docx, out of an uncompressed PDF, out of
 * a FlateDecode one. That is worth having. But the test this file exists for
 * is the END-TO-END one: a NAME planted in a real .docx and a real PDF is
 * found by the extractor and then STRIPPED by the receipt policy, through the
 * actual upload handler, with the removal recorded in `document_events`.
 * Before Phase 113c that strip ran over a marker line, so on a PDF or a .docx
 * the control was specified and never exercised.
 *
 * EVERY FIXTURE IS BUILT HERE, IN CODE. There is not one binary blob in this
 * repository for this suite, and there must never be: a checked-in PDF is a
 * file nobody reads, that nobody can diff, and that quietly stops matching
 * what the test claims it contains.
 *
 * AND THE MARKER TESTS ARE NOT PADDING. The rule this module is built around
 * is that anything unreadable returns the marker rather than a guess AND
 * RATHER THAN AN EMPTY PAGE — because downstream, zero segments reads as "we
 * looked and there was nothing to redact", which is the favourable branch N4
 * forbids an unknown from taking. An encrypted PDF, a scanned one, an
 * unsupported filter and a malformed zip are each asserted separately.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { zipOf, docxOf, pdfOf } from './document-fixtures.ts';
import { createApp } from '../src/server.ts';
import { beginUpload, acceptClientBytes, finishUpload, eventsFor } from '../src/web/uploads.ts';
import { retainedTextKeyFor } from '../src/web/upload-handler-port.ts';
import {
  extractPages, isMarkerPages, UNREADABLE_MARKER_PREFIX,
  type ExtractedPage,
} from '../src/web/extract-text.ts';

/* ================================================================== *
 * 1. A KNOWN SENTENCE COMES BACK OUT OF EACH
 * ================================================================== */

/** `pdfLiteral` and the builders live in ./document-fixtures.ts. */
const SENTENCE = 'Installation of a new air handling unit and associated ductwork.';

function allText(pages: readonly ExtractedPage[]): string {
  return pages.flatMap((p) => p.lines).join('\n');
}

test('a .docx gives up its text — both spellings of the entry path', () => {
  for (const entryName of ['word/document.xml', 'word\\document.xml']) {
    const pages = extractPages(docxOf(['PROPOSAL DESCRIPTION:', SENTENCE], { entryName }));
    assert.equal(isMarkerPages(pages), false, entryName);
    assert.match(allText(pages), /air handling unit/, entryName);
    assert.equal(pages.length, 1, 'a .docx has no pages until something lays it out');
  }
});

test('a .docx stored uncompressed reads too — method 0 as well as method 8', () => {
  const pages = extractPages(docxOf([SENTENCE], { store: true }));
  assert.match(allText(pages), /air handling unit/);
});

test('an uncompressed PDF gives up its text', () => {
  const pages = extractPages(pdfOf([['PLANNING DECISION NOTICE', SENTENCE]]));
  assert.equal(isMarkerPages(pages), false);
  assert.match(allText(pages), /air handling unit/);
});

test('a FlateDecode PDF gives up its text', () => {
  const pages = extractPages(pdfOf([['PLANNING DECISION NOTICE', SENTENCE]], { compress: true }));
  assert.equal(isMarkerPages(pages), false);
  assert.match(allText(pages), /air handling unit/);
});

test('a TJ array with kerning numbers keeps the word spaces', () => {
  const pages = extractPages(pdfOf([[SENTENCE]], { kerned: true }));
  assert.match(allText(pages), /Installation of a new air handling unit/);
});

test('a multi-page PDF is read as multiple pages, in order', () => {
  const pages = extractPages(pdfOf([['Page one text'], ['Page two text']], { compress: true }));
  assert.equal(pages.length, 2);
  assert.match(pages[0]!.lines.join(' '), /Page one/);
  assert.match(pages[1]!.lines.join(' '), /Page two/);
});

test('plain text is still read the way it always was', () => {
  const pages = extractPages(new Uint8Array(Buffer.from('DECISION:\nGranted 14 March 2024\n')));
  assert.deepEqual(pages, [{ page: 1, lines: ['DECISION:', 'Granted 14 March 2024'] }]);
});

/* ================================================================== *
 * 2. WHAT CANNOT BE READ RETURNS THE MARKER — NEVER A GUESS, NEVER EMPTY
 * ================================================================== */

test('an encrypted PDF returns the marker and says so', () => {
  const pages = extractPages(pdfOf([[SENTENCE]], { encrypted: true }));
  assert.equal(isMarkerPages(pages), true);
  assert.match(pages[0]!.lines[0]!, /encrypted/);
  // AND THE POINT OF IT: the text that IS sitting in the file in the clear did
  // not come out, because a partly-readable enciphered file is exactly where
  // an extractor starts inventing.
  assert.doesNotMatch(allText(pages), /air handling unit/);
});

test('a scanned PDF — page images, no text operators — returns the marker', () => {
  const pages = extractPages(pdfOf([[SENTENCE]], { scanned: true, compress: true }));
  assert.equal(isMarkerPages(pages), true);
  assert.match(pages[0]!.lines[0]!, /scan/);
});

test('a PDF behind a filter this build does not decode returns the marker, and says which problem it is', () => {
  const pages = extractPages(pdfOf([[SENTENCE]], { unsupportedFilter: true }));
  assert.equal(isMarkerPages(pages), true);
  assert.match(pages[0]!.lines[0]!, /filter/);
});

test('a malformed zip returns the marker rather than reading as a corrupt file', () => {
  const truncated = docxOf([SENTENCE]).subarray(0, 40);
  const pages = extractPages(truncated);
  assert.equal(isMarkerPages(pages), true);
  assert.match(pages[0]!.lines[0]!, /docx/);
});

test('an OOXML file that is not a .docx — no word/document.xml — returns the marker', () => {
  const xlsxish = zipOf([{ name: 'xl/workbook.xml', body: '<workbook/>' }]);
  assert.equal(isMarkerPages(extractPages(xlsxish)), true);
});

test('THE MARKER IS NEVER AN EMPTY PAGE, and that is the N4 half of the rule', () => {
  const unreadable: Uint8Array[] = [
    pdfOf([[SENTENCE]], { encrypted: true }),
    pdfOf([[SENTENCE]], { scanned: true }),
    pdfOf([[SENTENCE]], { unsupportedFilter: true }),
    docxOf([SENTENCE]).subarray(0, 40),
    zipOf([{ name: 'xl/workbook.xml', body: '<workbook/>' }]),
    docxOf([]),                                    // a .docx with no paragraphs
    new Uint8Array(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe])),
    new Uint8Array(0),
  ];
  for (const bytes of unreadable) {
    const pages = extractPages(bytes);
    assert.ok(pages.length > 0, 'never an empty page list');
    for (const p of pages) {
      assert.ok(p.lines.length > 0, 'never a page with no lines');
      for (const l of p.lines) assert.ok(l.trim().length > 0, 'never an empty line');
    }
    assert.equal(isMarkerPages(pages), true, 'and it is the marker, not something invented');
    assert.ok(pages[0]!.lines[0]!.startsWith(UNREADABLE_MARKER_PREFIX));
  }
});

test('the marker is lower case, so the segmenter reads it as body text and not as a heading', () => {
  const line = extractPages(new Uint8Array(Buffer.from([0x00, 0x01, 0x02])))[0]!.lines[0]!;
  assert.notEqual(line, line.toUpperCase(), 'an ALL-CAPS marker would be classified as a document section');
  assert.doesNotMatch(line.trim(), /:$/, 'and a trailing colon would do the same');
});

/* ================================================================== *
 * 3. THE ASSERTION THAT ACTUALLY MATTERS
 *
 * A name planted in a real .docx and a real PDF is found by the extractor and
 * STRIPPED by the receipt policy, end to end through the handler.
 * ================================================================== */

const T = '2026-09-09T00:00:00.000Z';
const NAME = 'Jonathan Whitmore';

/** A planning document with a name in a section that has NO LAWFUL BASIS. */
const PLANNING_LINES = [
  'PLANNING DECISION NOTICE',
  'Application 24/00871/FUL was granted on 14 March 2024.',
  'PROPOSAL DESCRIPTION:',
  SENTENCE,
  'REPRESENTATIONS RECEIVED:',
  `Mr ${NAME} of 14 Elm Row objected to the plant noise.`,
];

async function boot(): Promise<{
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  store: Awaited<ReturnType<typeof createApp>>['store'];
}> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-x-')) });
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) '
      + 'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u', 'u@example.test', 'u@example.test', 'U', 'CLIENT', 'x', T, T, 'bz']);
  return { close: made.close, app: made.app, store: made.store };
}

type Ran = {
  retained: string;
  removedKinds: { kind: string; reason: string }[];
  pages: number;
  segments: number;
  state: string;
};

async function runUpload(
  it: Awaited<ReturnType<typeof boot>>, filename: string, bytes: Uint8Array,
): Promise<Ran> {
  const deps = { db: it.app.db, store: it.store, now: it.app.now, actor: 'u' };
  const b = await beginUpload(deps, {
    business_id: 'bz', uploaded_by: 'u', filename, declared_type: 'PLANNING',
  });
  const token = new URL('http://x' + b.url).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(deps, { doc_id: b.doc_id, token, bytes });
  assert.equal(w.ok, true, `${filename}: the bytes must be accepted by the sniffer`);

  const done = await finishUpload(deps, b.job, w.ok ? w.written_at : T);
  const events = eventsFor(it.app.db, b.doc_id);
  const seg = events.find((e) => e.contract_step === 4)?.detail as { pages: number; segments: number };
  const strip = events.find((e) => e.contract_step === 5)?.detail as
    { removed: { kind: string; reason: string }[] };

  return {
    retained: Buffer.from(await it.store.get(retainedTextKeyFor(b.doc_id))).toString('utf8'),
    removedKinds: strip.removed,
    pages: seg.pages,
    segments: seg.segments,
    state: done.job.state,
  };
}

test('A NAME IN A .docx IS FOUND AND STRIPPED, end to end through the handler', async (t) => {
  const it = await boot();
  t.after(() => it.close());

  const r = await runUpload(it, 'planning.docx', docxOf(PLANNING_LINES));

  // The extractor really read the document: a retained section came through.
  assert.match(r.retained, /air handling unit/,
    'the strip must have run over the DOCUMENT, not over a marker line');
  // And the name did not.
  assert.doesNotMatch(r.retained, new RegExp(NAME),
    'the planted name must not survive into the retained text');
  // The removal is recorded, with the reason that makes it absolute.
  assert.deepEqual(
    r.removedKinds.filter((x) => x.kind === 'REPRESENTATIONS'),
    [{ kind: 'REPRESENTATIONS', reason: 'NO_LAWFUL_BASIS' }]);
  assert.equal(r.state, 'DISCHARGED');
});

test('A NAME IN A PDF IS FOUND AND STRIPPED, end to end through the handler', async (t) => {
  const it = await boot();
  t.after(() => it.close());

  const r = await runUpload(it, 'planning.pdf', pdfOf([PLANNING_LINES], { compress: true }));

  assert.match(r.retained, /air handling unit/,
    'the strip must have run over the DOCUMENT, not over a marker line');
  assert.doesNotMatch(r.retained, new RegExp(NAME));
  assert.deepEqual(
    r.removedKinds.filter((x) => x.kind === 'REPRESENTATIONS'),
    [{ kind: 'REPRESENTATIONS', reason: 'NO_LAWFUL_BASIS' }]);
  assert.equal(r.state, 'DISCHARGED');
});

test('AN UNREADABLE UPLOAD STILL COMPLETES THE CONTRACT, and the strip sees one marker segment', async (t) => {
  const it = await boot();
  t.after(() => it.close());

  const r = await runUpload(it, 'scan.pdf', pdfOf([PLANNING_LINES], { scanned: true, compress: true }));

  assert.equal(r.pages, 1, 'one marker page');
  assert.equal(r.segments, 1, 'one segment, and it is the marker');
  assert.equal(r.state, 'DISCHARGED', 'the pipeline still runs end to end');
  // NOT AN EMPTY READING DRESSED UP AS A CLEAN ONE: the retained text is empty
  // because the marker is UNCLASSIFIED and fails closed, and nothing anywhere
  // claims the document contained no name.
  assert.doesNotMatch(r.retained, new RegExp(NAME));
  assert.doesNotMatch(r.retained, /air handling unit/);
});
