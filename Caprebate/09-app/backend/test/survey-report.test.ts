/**
 * 2 OCTOBER 2026 — THE CLIENT'S SURVEY REPORT, ITS PDF, AND HOW IT TRAVELS (src/web/survey-report.ts, pdf-canvas.ts,
 * report-signoff.ts, report-pages.ts; migration 073).
 *
 * Lakhbir: the report goes to the client "visually appealing"; the adviser signs off first, then the client has it; our own
 * adviser's sign-off recorded by staff as today; the client's accountant by email with a private sign-off link.
 *
 * Proven here:
 *   · the drawn PDF: exact text widths, wrapping that never passes the edge, the same bytes every time, a file a reader
 *     can follow (every cross-reference lands on its object);
 *   · the report says what the approved version says, the page and the PDF alike, every figure with its source;
 *   · staff see the report and its PDF; nobody else does;
 *   · the accountant's email: only to the company's own accountant, only with the client's permission in words, only by
 *     Admin or Sales; the PDF attached is the report's; the link's SHA-256 is kept, never the link;
 *   · the link: opens the report with no login, answers once, signs off only with a registered firm, a title and the
 *     tick, or sends back with a reason; a wrong, used or run-out link opens nothing;
 *   · a signed answer is put on the claim through the claim's own rules, once; the client sees the report only after a
 *     sign-off for that version's figure, and never a version whose fingerprint fails; told once;
 *   · none of the new records is ever edited or deleted; the sent link leaves the outbox.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { buildCanvasPdf, textWidth, wrapText } from '../src/web/pdf-canvas.ts';
import { reportHtml, reportModel, reportPdf } from '../src/web/survey-report.ts';
import { packView, savePackValue, saveLine, setLineRemoved } from '../src/web/survey-pack.ts';
import { answerLegal, legalView } from '../src/web/pack-legal.ts';
import { approvePack, approvedVersion, saveDetails } from '../src/web/pack-approve.ts';
import { chaptersToRead } from '../src/web/pack-chapters.ts';
import * as S from '../src/web/report-signoff.ts';
import { setBasis } from '../src/web/survey-evidence.ts';
import { blankSentSecrets, SENT_SECRET_BODY } from '../src/stubs/email-provider.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as R from '../src/web/claim-record.ts';
import { actor } from './helpers.ts';

/** Every piece of text the PDF draws, decoded from its hexadecimal strings. */
function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  return [...s.matchAll(/<([0-9a-f]+)> Tj/g)].map((m) => Buffer.from(m[1] ?? '', 'hex').toString('latin1')).join('\n')
    .replace(/\x92/g, '’').replace(/\x93/g, '“').replace(/\x94/g, '”').replace(/\x96/g, '–').replace(/\x97/g, '—').replace(/\x85/g, '…');
}

describe('the drawn PDF', () => {
  test('widths are Helvetica’s and Times-Bold’s; wrapping never passes the edge, and cuts a word too long for the line', () => {
    assert.equal(textWidth('Hello', 'Helvetica', 10), 22.78);
    assert.equal(textWidth(' ', 'Times-Bold', 10), 2.5);
    assert.ok(textWidth('W', 'Helvetica-Bold', 10) > textWidth('i', 'Helvetica-Bold', 10));
    const words = 'The qualifying items would cost £130,447.50 to rebuild, out of £1,024,800 for the whole building. That is 12.73%.';
    for (const w of [40, 80, 150, 300]) {
      for (const line of wrapText(words, 'Helvetica', 10, w)) assert.ok(textWidth(line, 'Helvetica', 10) <= w, `${line} at ${w}`);
    }
    assert.deepEqual(wrapText(words, 'Helvetica', 10, 2000), [words]);
    const long = wrapText('Supercalifragilisticexpialidocious', 'Helvetica', 10, 50);
    assert.ok(long.length > 1 && long.every((l) => textWidth(l, 'Helvetica', 10) <= 50));
    assert.equal(long.join(''), 'Supercalifragilisticexpialidocious', 'a cut word loses no letter');
  });

  test('the same drawing gives the same bytes; every cross-reference lands on its object; a character it cannot show is counted', () => {
    const pages = [[{ k: 'rect' as const, x: 10, y: 10, w: 100, h: 20, r: 4, fill: [171, 237, 216] as const, stroke: [17, 17, 17] as const },
      { k: 'text' as const, x: 20, y: 25, s: 'Cap Rebate · £1,050 ✓', font: 'Times-Bold' as const, size: 12, color: [17, 17, 17] as const, align: 'right' as const, spacing: 1 },
      { k: 'line' as const, x1: 0, y1: 0, x2: 50, y2: 50, color: [0, 0, 0] as const, lw: 1, dash: 3 }, { k: 'circle' as const, cx: 40, cy: 40, r: 5, fill: [0, 0, 0] as const }]];
    const a = buildCanvasPdf(pages, { title: 't' });
    const b = buildCanvasPdf(pages, { title: 't' });
    assert.deepEqual(a.bytes, b.bytes);
    assert.equal(a.unshown, 1, 'the tick is not in WinAnsi');
    const s = Buffer.from(a.bytes).toString('latin1');
    assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
    const start = Number(/startxref\n(\d+)\n/.exec(s)?.[1]);
    assert.ok(s.slice(start).startsWith('xref'));
    const offsets = [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${String(i + 1)} 0 obj`), `object ${String(i + 1)}`));
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const at = (m.index ?? 0) + m[0].length;
      assert.equal(s.slice(at + Number(m[1]), at + Number(m[1]) + 10), '\nendstream', 'a stream’s length is wrong');
    }
    // Character spacing is set on every piece of text, so it never leaks into the next.
    assert.match(s, /1 Tc /);
    const plain = buildCanvasPdf([[{ k: 'text', x: 0, y: 0, s: 'a', font: 'Helvetica', size: 9, color: [0, 0, 0] }]], { title: 't' });
    assert.match(Buffer.from(plain.bytes).toString('latin1'), / 0 Tc /, 'text with no spacing does not set it back to none');
  });
});

/* ------------------------------------------------------------------ the app */

const T0 = '2026-10-02T09:00:00.000Z';
let clock = T0;
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-sr-1';
const SAM = actor('SURVEYING', 'u-sr-sam');
const SALES = actor('SALES', 'u-sr-sales');
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
let CLAIM = '';

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-sr-')), now: () => clock, publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-sr', 'Report Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-sr-other', 'Other Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  for (const [id, role, name, biz] of [['u-sr-sam', 'SURVEYING', 'Sam Surveyor', null], ['u-sr-ola', 'SURVEYING', 'Ola Other', null], ['u-sr-admin', 'ADMIN', 'Ada Admin', null],
    ['u-sr-sales', 'SALES', 'Sid Sales', null], ['u-sr-ro', 'READ_ONLY', 'Rita Reader', null], ['u-sr-acc', 'ACCOUNTING', 'Al Accounts', null],
    ['u-sr-client', 'CLIENT', 'Cleo Client', 'b-sr'], ['u-sr-other', 'CLIENT', 'Otto Other', 'b-sr-other']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T0, T0, biz]);
  }
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-sr', 'b-sr', 'Report Practice', 'ZZ9 9ZZ', T0]);
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-sr', 'b-sr', 'gp', T0, 100, 200, T0]);
  db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['e-sr', 'as-sr', 'b-sr', 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T0, 'test-not-a-real-hash']);
  CLAIM = C.insertClaim(db, made.app.now, randomUUID, { business_id: 'b-sr', property_id: 'p-sr', assessment_id: 'as-sr', workstream: 'PLANT_AND_MACHINERY', stage: 'TAX_ADVISER_SIGNOFF', owner_id: null, surveyor_id: null }).id;
  P.recordOpened({ db, now: made.app.now, newId: randomUUID }, null, CLAIM, 'TAX_ADVISER_SIGNOFF', 'a test fixture');
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [JOB, 'b-sr', 'as-sr', 'u-sr-sam', 'SEALED', null, T0, CLAIM]);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-epc-sr', 'b-sr', 'EPC', 'INVENTED-RRN-SR', JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T0, 'p-sr']);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-title-sr', 'b-sr', 'HMLR_TITLE', 'ZZ55555', JSON.stringify({ title_number: 'ZZ55555', price_paid: 1050000 }), T0, 'p-sr']);
  // The company's accountant (an invented address, so nothing can leave), a second one, and a contact who is not one.
  for (const [id, name, type, email] of [['c-sr-acct', 'Avery Accountant', 'ACCOUNTANT', 'avery@smithco.example.com'], ['c-sr-adv', 'Ade Adviser', 'ADVISER', 'ade@advisers.example.com'],
    ['c-sr-dir', 'Dee Director', 'DECISION_MAKER', 'dee@practice.example.com'], ['c-sr-noemail', 'Nora Nomail', 'ACCOUNTANT', null]] as const) {
    db.run('INSERT INTO contacts (id,business_id,full_name,contact_consent,marketing_optin,created_at,contact_type,email) VALUES (?,?,?,?,?,?,?,?)', [id, 'b-sr', name, 1, 0, T0, type, email]);
  }
  db.run('INSERT INTO contacts (id,business_id,full_name,contact_consent,marketing_optin,created_at,contact_type,email) VALUES (?,?,?,?,?,?,?,?)', ['c-sr-elsewhere', 'b-sr-other', 'Eli Elsewhere', 1, 0, T0, 'ACCOUNTANT', 'eli@x.example.com']);
  for (const w of ['u-sr-sam', 'u-sr-ola', 'u-sr-admin', 'u-sr-sales', 'u-sr-ro', 'u-sr-acc', 'u-sr-client', 'u-sr-other']) {
    await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() });
  }
  approveOnce('2000');
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, body: Buffer.from(buf).toString('utf8'), bytes: buf, type: r.headers.get('content-type'), location: r.headers.get('location') };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `sr-${(++n).toString().padStart(6, '0')}` });
const view = () => packView(deps(), actor('ADMIN'), JOB);
const P_ = `/staff/survey/${JOB}/pack`;

/** Fill, clear, read and approve the pack, with the first line's rate as given. */
function approveOnce(rate: string): void {
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  if (view().lines.filter((l) => !l.removed).length > 2) {
    const keep = view().lines.slice(0, 2).map((l) => l.id);
    for (const l of view().lines) if (!keep.includes(l.id) && !l.removed) ok(setLineRemoved(deps(), SAM, JOB, { line: l.id, reason: 'Not in this building', seq: String(view().seq) }, true));
    ok(saveLine(deps(), SAM, JOB, { line: keep[1]!, qty: '100', rate: '300', qpct: '50', pool: 'MP', reason: 'Counted on the walkthrough', seq: String(view().seq) }));
    ok(savePackValue(deps(), SAM, JOB, { field: 'land', value: '150000', reason: 'Local land sales', seq: String(view().seq) }));
    ok(savePackValue(deps(), SAM, JOB, { field: 'building_rate', value: '1500', reason: 'BCIS, GP surgeries', seq: String(view().seq) }));
    for (const [q, v] of [['G8', ['new_build']], ['G9d', ['2023-05-01']]] as const) {
      ok(answerLegal(deps(), SAM, JOB, { question: q, values: v, source: 'The building contract', seq: String(legalView(deps(), SAM, JOB).seq) }));
    }
    ok(saveDetails(deps(), SAM, JOB, { rics_number: '1234567', firm: 'Sam Surveyors LLP' }));
    ok(setBasis(deps(), SAM, JOB, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  }
  ok(saveLine(deps(), SAM, JOB, { line: view().lines[0]!.id, qty: '10', rate, qpct: '100', pool: 'SR', reason: 'Counted on the walkthrough', seq: String(view().seq) }));
  for (const c of chaptersToRead()) made.app.db.run('INSERT OR IGNORE INTO survey_pack_reads (id, job_id, user_id, chapter, legal_seq, at) VALUES (?, ?, ?, ?, ?, ?)',
    [`rd-${(++n).toString()}`, JOB, 'u-sr-sam', c, legalView(deps(), SAM, JOB).seq, clock]);
  ok(approvePack(deps(), SAM, JOB, { seq: String(view().seq), legal_seq: String(legalView(deps(), SAM, JOB).seq) }));
}

describe('the report', () => {
  test('it says what the approved version says — the page and the PDF alike — every figure with its source', () => {
    const kept = approvedVersion(deps(), SAM, JOB, 1)!;
    const m = reportModel(kept.snapshot, kept.row.fingerprint);
    const s = kept.snapshot.sums;
    assert.equal(m.company, 'Report Practice Limited');
    assert.equal(m.property, 'Report Practice, ZZ9 9ZZ');
    assert.deepEqual(m.surveyor, { name: 'Sam Surveyor', rics: '1234567', firm: 'Sam Surveyors LLP' });
    assert.equal(m.approved_on, '2 October 2026');
    assert.equal(m.fingerprint, kept.row.fingerprint);
    assert.equal(m.headline.qualifying, `£${(Math.floor((s.qualifying_pence ?? 0) / 100)).toLocaleString('en-GB')}.${String((s.qualifying_pence ?? 0) % 100).padStart(2, '0')}`.replace(/\.00$/, ''));
    assert.equal(m.groups.map((g) => g.pool).join(','), 'SR,MP');
    assert.equal(m.groups[0]!.rows[0]!.rate_chip.words, 'Surveyor', 'in the item table a surveyor’s value says Surveyor');
    assert.equal(m.sources.find((x) => x.label === 'Bare land')!.chip.words, 'Sam Surveyor', 'among the four values it carries their name');
    assert.equal(m.sources.find((x) => x.label === 'Floor area')!.chip.kind, 'EVIDENCE');
    assert.equal(m.taken_out.length, view().lines.filter((l) => l.removed).length);
    assert.equal(m.legal.level_words, 'Clear');
    assert.equal(m.inspection, 'Desktop, with the client’s photos and video.', 'how the building was inspected');
    assert.ok(m.legal.answers.some((a) => a.answer === '1 May 2023'), 'a date is in words');
    const html = String(reportHtml(m, { pdf: null }));
    const pdf = pdfText(reportPdf(m).bytes);
    for (const must of [m.headline.qualifying, m.headline.main, m.headline.special, m.headline.share, 'RICS no. 1234567', 'Sam Surveyors LLP', m.fingerprint,
      ...m.declaration, 'How this report was made', m.legal.headline.split('.')[0]!, 'How the building was inspected', m.inspection!]) {
      assert.ok(html.includes(must.replace(/’/g, '’')), `the page lacks ${must}`);
      assert.ok(pdf.replace(/\n/g, ' ').includes(must) || pdf.includes(must), `the PDF lacks ${must}`);
    }
    for (const r of m.groups.flatMap((g) => g.rows)) assert.ok(pdf.includes(r.qualifying) && html.includes(r.qualifying), r.label);
    assert.deepEqual(reportPdf(m).bytes, reportPdf(m).bytes, 'the PDF is the same file every time');
    assert.equal(reportPdf(m).unshown, 0, 'a character the PDF could not show');
  });

  test('staff see the report and its PDF; another surveyor, Accounting and view-only do not', async () => {
    for (const who of ['u-sr-sam', 'u-sr-admin', 'u-sr-sales']) {
      const page = await req(who, `${P_}/version/1/report`);
      assert.equal(page.status, 200, who);
      assert.match(page.body, /Capital allowances survey report/);
      const pdf = await req(who, `${P_}/version/1/report.pdf`);
      assert.equal(pdf.type, 'application/pdf');
      assert.ok(Buffer.from(pdf.bytes).toString('latin1').startsWith('%PDF-1.4'));
    }
    for (const who of ['u-sr-ola', 'u-sr-acc', 'u-sr-ro', 'u-sr-client']) {
      for (const path of [`${P_}/version/1/report`, `${P_}/version/1/report.pdf`]) {
        const r = await req(who, path);
        assert.ok(r.status === 403 || r.status === 404 || r.status === 303, `${who} ${path} ${String(r.status)}`);
        assert.ok(!Buffer.from(r.bytes).toString('latin1').startsWith('%PDF'), `${who} got the PDF`);
      }
    }
    assert.match((await req('u-sr-admin', `${P_}/version/9/report`)).body, /no approved version with that number/);
  });
});

let token = '';
describe('the accountant’s sign-off', () => {
  test('sent only by Admin or Sales, only to the company’s own accountant with an address, only with the client’s permission in words', async () => {
    const page = (await req('u-sr-sales', `${P_}?ch=23`)).body;
    assert.match(page, /<h2>Send the report<\/h2>/);
    assert.match(page, /<option value="c-sr-adv">Ade Adviser \(ade@advisers\.example\.com\)<\/option><option value="c-sr-acct">Avery Accountant \(avery@smithco\.example\.com\)<\/option><\/select>/);
    assert.doesNotMatch(page, /c-sr-dir|c-sr-noemail|c-sr-elsewhere/, 'a contact who is not their accountant, or has no address, is offered');
    assert.match(page, /Not yet\. It appears in their portal once a tax adviser’s sign-off/);
    assert.match((await req('u-sr-sam', `${P_}?ch=23`)).body, /Admin or Sales send it\./);
    const go = (who: string, f: Record<string, string>) => post(who, `${P_}/version/1/send`, f);
    for (const who of ['u-sr-sam', 'u-sr-acc', 'u-sr-ro', 'u-sr-ola']) {
      const r = await go(who, { contact_id: 'c-sr-acct', permission: 'by email' });
      assert.ok(r.status === 403 || r.status === 404, `${who}: ${String(r.status)}`);
    }
    assert.match((await go('u-sr-sales', { contact_id: 'c-sr-acct', permission: '   ' })).body, /Say how the client gave permission/);
    for (const c of ['c-sr-dir', 'c-sr-noemail', 'c-sr-elsewhere', 'nobody']) assert.match((await go('u-sr-sales', { contact_id: c, permission: 'by email' })).body, /Choose one of the company’s accountants/);
    assert.match((await post('u-sr-sales', `${P_}/version/7/send`, { contact_id: 'c-sr-acct', permission: 'x' })).body, /no approved version/);
    assert.equal(made.app.db.get<{ c: number }>("SELECT COUNT(*) AS c FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF'")!.c, 0, 'a refusal saved an email');
    const ok = await go('u-sr-sales', { contact_id: 'c-sr-acct', permission: 'The client, by email on 2 October' });
    assert.equal(ok.status, 303, ok.body.slice(0, 300));
    assert.match(ok.location ?? '', /done=(emailed|saved-email)#send$/);
  });

  test('the email carries the report’s own PDF and the link; only the link’s SHA-256 is kept', () => {
    const o = made.app.db.get<{ id: string; to_email: string; subject: string; body: string; contact_id: string; business_id: string }>(
      "SELECT id, to_email, subject, body, contact_id, business_id FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF'")!;
    assert.deepEqual([o.to_email, o.contact_id, o.business_id], ['avery@smithco.example.com', 'c-sr-acct', 'b-sr']);
    assert.equal(o.subject, 'Survey report to sign off: Report Practice Limited');
    const link = /https:\/\/caprebate\.example\.invalid\/signoff\/([A-Za-z0-9_-]{43})/.exec(o.body);
    assert.ok(link !== null, o.body);
    token = link[1]!;
    assert.match(o.body, /^Dear Avery Accountant,/);
    assert.match(o.body, /version 1, approved on 2 October 2026 by Sam Surveyor \(RICS no\. 1234567\)/);
    const r = made.app.db.get<{ token_sha256: string; permission_note: string }>('SELECT token_sha256, permission_note FROM pack_signoff_requests')!;
    assert.equal(r.token_sha256, createHash('sha256').update(token).digest('hex'));
    assert.equal(r.permission_note, 'The client, by email on 2 October');
    const all = JSON.stringify(made.app.db.all('SELECT * FROM pack_signoff_requests'));
    assert.equal(all.includes(token), false, 'the link itself is kept');
    const f = made.app.db.get<{ filename: string; content_type: string; bytes: Uint8Array }>('SELECT filename, content_type, bytes FROM outbox_inline_files WHERE outbox_id = ?', [o.id])!;
    const kept = approvedVersion(deps(), SAM, JOB, 1)!;
    assert.deepEqual([f.filename, f.content_type], ['survey-report-version-1.pdf', 'application/pdf']);
    assert.deepEqual(new Uint8Array(f.bytes), reportPdf(reportModel(kept.snapshot, kept.row.fingerprint)).bytes, 'the attachment is not the report');
    const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'REPORT_SENT_FOR_SIGNOFF'")!;
    assert.equal(audit.detail.includes(token), false);
    // Once really sent, the email's words leave the outbox; until then, and for any other kind, they never change.
    assert.throws(() => made.app.db.run('UPDATE outbox SET body = ? WHERE id = ?', [SENT_SECRET_BODY, o.id]), /never edited/);
    made.app.db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [clock, o.id]);
    assert.equal(blankSentSecrets(made.app.db, o.id), true);
    assert.equal(made.app.db.get<{ body: string }>('SELECT body FROM outbox WHERE id = ?', [o.id])!.body, SENT_SECRET_BODY);
  });

  test('the link opens the report with no login; a wrong or broken link opens nothing', async () => {
    const page = await req('anon', `/signoff/${token}`);
    assert.equal(page.status, 200);
    assert.match(page.body, /Dear Avery Accountant,/);
    assert.match(page.body, /Report Practice Limited asked us to send you this report/);
    assert.match(page.body, /I sign off these figures/);
    const pdf = await req('anon', `/signoff/${token}/report.pdf`);
    assert.equal(pdf.type, 'application/pdf');
    // Phase 153b: the last character is changed to one it is not — a token that already ended in "A" (1 in 64) made
    // this "wrong" link the right one, and the test failed now and then.
    for (const bad of [`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'short', `${token}x`, '../../etc']) {
      const r = await req('anon', `/signoff/${bad}`);
      assert.ok(r.status === 404, `${bad}: ${String(r.status)}`);
      assert.doesNotMatch(r.body, /Report Practice/);
    }
  });

  /* PHASE 153b, 4 October 2026 — Word question 121: beside the PDF, the return entries for each year as a spreadsheet. */
  test('beside the PDF: the return entries for each year as a spreadsheet — attached to the email, and on the accountant’s link and the staff page', async () => {
    const o = made.app.db.get<{ id: string }>("SELECT id FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF'")!;
    const files = made.app.db.all<{ filename: string; content_type: string; bytes: Uint8Array }>('SELECT filename, content_type, bytes FROM outbox_inline_files WHERE outbox_id = ? ORDER BY part_no', [o.id]);
    assert.deepEqual(files.map((f) => [f.filename, f.content_type]), [['survey-report-version-1.pdf', 'application/pdf'], ['return-entries-version-1.csv', 'text/csv; charset=utf-8']]);
    const attached = Buffer.from(files[1]!.bytes).toString('utf8');
    assert.match(attached, /^Return,Accounting period,Pool,Entry,Amount \(£\),How it is worked out\r\n/);
    assert.match(attached, /Special rate pool,Writing-down allowance,[0-9]+\.[0-9]{2},6% of the balance on the pool\./);
    const kept = approvedVersion(deps(), SAM, JOB, 1)!;
    assert.ok(attached.includes(kept.row.fingerprint), 'the spreadsheet names the version it was made from');
    const link = await req('anon', `/signoff/${token}/return-entries.csv`);
    assert.equal(link.type, 'text/csv; charset=utf-8');
    assert.equal(link.body, attached, 'the link gives the same spreadsheet as the email');
    assert.match((await req('anon', `/signoff/${token}`)).body, /the return entries for each year, as a spreadsheet \(CSV\)/);
    const staff = await req('u-sr-sales', `${P_}/version/1/return-entries.csv`);
    assert.equal(staff.status, 200);
    assert.equal(staff.body, attached);
    assert.match((await req('u-sr-sales', `${P_}?ch=23`)).body, /The return entries \(CSV\)/);
  });

  test('signing off needs a registered firm, a title and the tick; it is answered once', async () => {
    const sign = (f: Record<string, string>) => post('anon', `/signoff/${token}`, { outcome: 'SIGNED', name: 'Avery Accountant', firm: 'Smith & Co Accountants Limited', credential: 'Chartered Accountant', read: 'yes', ...f });
    assert.match((await sign({ read: '' })).body, /Tick to say you have read the report/);
    for (const firm of ['Avery Accountant', 'Smith & Co', 'Limited']) assert.match((await sign({ firm })).body, /ending Limited, LLP or plc/, firm);
    assert.match((await sign({ credential: ' ' })).body, /The title you sign under|Type the title/);
    assert.match((await sign({ name: 'A' })).body, /Type your full name/);
    assert.match((await post('anon', `/signoff/${token}`, { outcome: 'MAYBE', name: 'Avery Accountant' })).body, /Choose to sign off, or to send it back/);
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM pack_signoff_answers')!.c, 0);
    const ok = await sign({});
    assert.equal(ok.status, 303);
    assert.equal(ok.location, `/signoff/${token}`);
    const after = await req('anon', `/signoff/${token}`);
    assert.match(after.body, /You signed off this report on 2 October 2026/);
    assert.doesNotMatch(after.body, /Report Practice Limited asked us|£/, 'a used link still shows the report');
    assert.match((await sign({})).body, /already been answered/);
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM pack_signoff_answers')!.c, 1);
    assert.match((await req('u-sr-sales', `${P_}?ch=23`)).body, /Signed off<\/span> by Avery Accountant of Smith &amp; Co Accountants Limited \(Chartered Accountant\)/);
  });

  test('sending back needs a reason; a link that has run out opens nothing', async () => {
    const r = S.sendForSignoff({ ...deps(), email: made.app.email }, SALES, JOB, 1, { contact_id: 'c-sr-adv', permission: 'by phone', origin: 'https://x.example.invalid' });
    assert.equal(r.ok, true);
    const body = made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF' AND contact_id = 'c-sr-adv'")!.body;
    const t2 = /\/signoff\/([A-Za-z0-9_-]{43})/.exec(body)![1]!;
    assert.match((await post('anon', `/signoff/${t2}`, { outcome: 'SENT_BACK', name: 'Ade Adviser', reason: '  ' })).body, /Say why you are sending it back/);
    assert.equal((await post('anon', `/signoff/${t2}`, { outcome: 'SENT_BACK', name: 'Ade Adviser', reason: 'The land value looks low.' })).status, 303);
    assert.match((await req('u-sr-sales', `${P_}?ch=23`)).body, /Sent back<\/span> by Ade Adviser: “The land value looks low\.”/);
    // A third link, left 30 days and a moment.
    S.sendForSignoff({ ...deps(), email: made.app.email }, SALES, JOB, 1, { contact_id: 'c-sr-acct', permission: 'by email', origin: 'https://x.example.invalid' });
    const t3 = /\/signoff\/([A-Za-z0-9_-]{43})/.exec(made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF' ORDER BY rowid DESC LIMIT 1")!.body)![1]!;
    clock = new Date(Date.parse(T0) + 30 * 86_400_000 + 1000).toISOString();
    try {
      const old = await req('anon', `/signoff/${t3}`);
      assert.equal(old.status, 410);
      assert.match((await post('anon', `/signoff/${t3}`, { outcome: 'SIGNED', name: 'Avery Accountant', firm: 'A Limited', credential: 'CA', read: 'yes' })).body, /run out/);
    } finally { clock = T0; }
  });
});

describe('to the claim, and to the client', () => {
  test('before a sign-off is on the claim the client sees no report, and no figure', async () => {
    const r = await req('u-sr-client', '/portal/report');
    assert.equal(r.status, 404);
    assert.match(r.body, /not ready yet/);
    assert.equal((await req('u-sr-client', '/portal/report.pdf')).status, 404);
    assert.doesNotMatch((await req('u-sr-client', '/portal')).body, /Your survey report is ready/);
    assert.match((await post('u-sr-sales', `${P_}/version/1/tell`, {})).body, /cannot see this version yet/);
  });

  test('a signed answer goes on the claim through the claim’s own rules, by Admin or Sales, once', async () => {
    const answer = S.requestsOf(made.app.db, JOB).find((x) => x.answer?.outcome === 'SIGNED')!.answer!;
    const back = S.requestsOf(made.app.db, JOB).find((x) => x.answer?.outcome === 'SENT_BACK')!.answer!;
    const rec = (who: string, id: string) => post(who, `${P_}/answer/${id}/record`, {});
    for (const who of ['u-sr-sam', 'u-sr-acc', 'u-sr-ro']) {
      const r = await rec(who, answer.id);
      assert.ok(r.status === 403 || r.status === 404, `${who}: ${String(r.status)}`);
    }
    assert.match((await rec('u-sr-sales', back.id)).body, /sent the report back/);
    assert.match((await rec('u-sr-sales', 'nope')).body, /not one of this pack’s/);
    assert.equal((await rec('u-sr-sales', answer.id)).status, 303);
    const s = made.app.db.get<{ adviser: string; credential: string; figure_pence: number; scope: string }>('SELECT adviser, credential, figure_pence, scope FROM tax_adviser_signoffs WHERE claim_id = ?', [CLAIM])!;
    const kept = approvedVersion(deps(), SAM, JOB, 1)!;
    assert.deepEqual([s.adviser, s.credential, s.figure_pence], ['Smith & Co Accountants Limited', 'Chartered Accountant', kept.snapshot.sums.qualifying_pence]);
    assert.ok(s.scope.includes(kept.row.fingerprint));
    assert.match((await rec('u-sr-sales', answer.id)).body, /already on the claim/);
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM tax_adviser_signoffs')!.c, 1);
  });

  test('then the client has it — the page, the PDF and the card — and nobody else’s client does', async () => {
    const page = await req('u-sr-client', '/portal/report');
    assert.equal(page.status, 200);
    const kept = approvedVersion(deps(), SAM, JOB, 1)!;
    const m = reportModel(kept.snapshot, kept.row.fingerprint);
    assert.ok(page.body.includes(m.headline.qualifying));
    const pdf = await req('u-sr-client', '/portal/report.pdf');
    assert.deepEqual(pdf.bytes, reportPdf(m).bytes);
    const home = (await req('u-sr-client', '/portal')).body;
    assert.match(home, /Your survey report is ready/);
    assert.ok(home.includes(m.headline.qualifying));
    assert.equal((await req('u-sr-other', '/portal/report')).status, 404);
    assert.equal((await req('u-sr-other', '/portal/report?business=b-sr')).status, 403);
  });

  test('told once, by a portal message; a later version is not the client’s until its own figure is signed off', async () => {
    assert.equal((await post('u-sr-sam', `${P_}/version/1/tell`, {})).status, 403);
    assert.equal((await post('u-sr-sales', `${P_}/version/1/tell`, {})).status, 303);
    const msg = made.app.db.get<{ body: string; direction: string }>("SELECT body, direction FROM client_messages WHERE business_id = 'b-sr' ORDER BY created_at DESC LIMIT 1")!;
    assert.deepEqual([msg.body, msg.direction], [S.TELL_CLIENT_WORDS, 'TO_CLIENT']);
    assert.match((await post('u-sr-sales', `${P_}/version/1/tell`, {})).body, /already been told/);
    // Version 2, with a different figure: the client still has version 1.
    clock = '2026-10-02T10:00:00.000Z';
    try {
      approveOnce('2500');
      assert.equal(S.releasedVersion(made.app.db, 'b-sr')?.row.version, 1);
      assert.match((await req('u-sr-sales', `${P_}?ch=23`)).body, /The client can see version 1 in their portal\.|Not yet\./);
      assert.match((await post('u-sr-sales', `${P_}/version/2/tell`, {})).body, /cannot see this version yet/);
      // A sign-off recorded after version 2, but for version 1's figure, does not release version 2. PHASE 159a (C4): it is
      // now refused outright — a sign-off names the newest version, and its figure must be that version's own.
      clock = '2026-10-02T11:00:00.000Z';
      const v1 = approvedVersion(deps(), SAM, JOB, 1)!.snapshot.sums.qualifying_pence ?? 0;
      const r = R.recordSignOff(deps(), SALES, CLAIM, { adviser: 'Taxwise Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-10-02',
        scope: 'Version 1 again', method_note: 'Read it', figure: `${String(Math.floor(v1 / 100))}.${String(v1 % 100).padStart(2, '0')}`, confirmed_switches: '' });
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.match(r.ok ? '' : r.why, /approved version’s own/);
      assert.equal(S.releasedVersion(made.app.db, 'b-sr')?.row.version, 1, 'version 2 was released by a sign-off of another figure');
    } finally { clock = T0; }
  });

  test('a version whose fingerprint fails is never shown to the client, nor signed off by link; nothing new is ever edited or deleted', async () => {
    const db = made.app.db;
    for (const [edit, del] of [
      ['UPDATE pack_signoff_requests SET rowid = rowid', 'DELETE FROM pack_signoff_requests'],
      ['UPDATE pack_signoff_answers SET rowid = rowid', 'DELETE FROM pack_signoff_answers'],
      ['UPDATE pack_signoff_recorded SET rowid = rowid', 'DELETE FROM pack_signoff_recorded'],
      ['UPDATE pack_client_notices SET rowid = rowid', 'DELETE FROM pack_client_notices'],
    ] as const) {
      assert.throws(() => db.run(edit), /never edited/, edit);
      assert.throws(() => db.run(del), /never deleted/, del);
    }
    // The database itself refuses a signed answer with no firm, and a second record of one answer.
    const reqId = db.get<{ id: string }>('SELECT r.id FROM pack_signoff_requests r LEFT JOIN pack_signoff_answers x ON x.request_id = r.id WHERE x.id IS NULL LIMIT 1')!.id;
    assert.throws(() => db.run("INSERT INTO pack_signoff_answers (id, request_id, outcome, signer_name, signer_firm, signer_credential, reason, answered_at) VALUES ('x1', ?, 'SIGNED', 'A Person', NULL, 'CA', NULL, ?)", [reqId, clock]), /CHECK/);
    const rec = db.get<{ answer_id: string; signoff_id: string }>('SELECT answer_id, signoff_id FROM pack_signoff_recorded')!;
    // PHASE 159a: the earlier test's second sign-off is now refused, so there may be no other one; a made-up id does.
    const other = db.get<{ id: string }>('SELECT id FROM tax_adviser_signoffs WHERE id <> ?', [rec.signoff_id])?.id ?? 'no-such-signoff';
    assert.throws(() => db.run('INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', [rec.answer_id, other, 'u-sr-sales', clock]), /UNIQUE|PRIMARY/, 'one answer recorded twice');
    assert.throws(() => db.run('INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', ['x2', rec.signoff_id, 'u-sr-sales', clock]), /UNIQUE|FOREIGN/, 'one sign-off recorded for two answers');
    // A link to version 1, then version 1's kept text altered underneath (it cannot be through the app).
    S.sendForSignoff({ ...deps(), email: made.app.email }, SALES, JOB, 1, { contact_id: 'c-sr-acct', permission: 'by email', origin: 'https://x.example.invalid' });
    const t4 = /\/signoff\/([A-Za-z0-9_-]{43})/.exec(db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'REPORT_FOR_SIGNOFF' ORDER BY rowid DESC LIMIT 1")!.body)![1]!;
    db.run('DROP TRIGGER survey_pack_approvals_never_edited');
    db.run("UPDATE survey_pack_approvals SET snapshot_json = json_set(snapshot_json, '$.sums.main_pool_pence', 1) WHERE version = 1");
    assert.equal(S.releasedVersion(db, 'b-sr'), null);
    assert.equal((await req('u-sr-client', '/portal/report')).status, 404);
    const link = await req('anon', `/signoff/${t4}`);
    assert.match(link.body, /does not match what the surveyor approved/);
    assert.doesNotMatch(link.body, /I sign off these figures/);
    assert.match((await post('anon', `/signoff/${t4}`, { outcome: 'SIGNED', name: 'Avery Accountant', firm: 'A Limited', credential: 'CA', read: 'yes' })).body, /does not match/);
    const pdf = await req('anon', `/signoff/${t4}/report.pdf`);
    assert.equal(pdf.status, 409);
    assert.ok(!Buffer.from(pdf.bytes).toString('latin1').startsWith('%PDF'), 'a report that does not match was handed out as a PDF');
    assert.match((await post('u-sr-sales', `${P_}/version/1/send`, { contact_id: 'c-sr-acct', permission: 'x' })).body, /fingerprint does not match/);
  });
});
