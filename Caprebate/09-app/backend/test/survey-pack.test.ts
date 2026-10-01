/**
 * 1 OCTOBER 2026 — THE SURVEY PACK, THROUGH ITS OWN PAGES (src/web/survey-pack.ts, src/web/survey-pack-pages.ts).
 *
 * Lakhbir: "any edits made by the surveyor needs to essentially have their stamp to say thats their number" … "when
 * you build this stress test it, this is one thing that cannot fail."
 *
 * Proven here, through the real routes, on a real database:
 *   · the drafts come only from evidence — the energy certificate's floor area, the title register's price, the room
 *     counts recorded on the job — and from the fixture list (pool, share); rates are never drafted;
 *   · every change is the surveyor's: their name, the time and their reason, kept for ever (the database refuses an
 *     edit or a delete), and our draft comes back when they put it back;
 *   · only the assigned surveyor changes the pack; anyone who may open the job may read it; the rest are refused;
 *   · a change from an out-of-date page is refused, never applied blind;
 *   · a complete pack's totals are exactly the sums module's, and the pools add up to the penny;
 *   · 400 random changes from two tabs leave a pack whose counter, history and totals all agree;
 *   · 2,000 random forms never break a page.
 * Invented people and places; nothing leaves.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { packView, type PackDeps } from '../src/web/survey-pack.ts';
import { packSums } from '../src/web/pack-sums.ts';
import { linesForSector, parseCsv, taxonomy } from '../src/web/pack-lines.ts';
import { actor } from './helpers.ts';

const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
const nextId = () => `pk-${(++n).toString().padStart(6, '0')}`;

const JOB = 'job-pk-1';         // GP, one property, assigned to Sam
const JOB2 = 'job-pk-2';        // GP, two properties, no claim: the pack asks which
const JOB3 = 'job-pk-3';        // for the stress run
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-pk-')), now: () => T });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, role, name] of [['u-pk-sam', 'SURVEYING', 'Sam Surveyor'], ['u-pk-ola', 'SURVEYING', 'Ola Other'], ['u-pk-admin', 'ADMIN', 'Ada Admin'],
    ['u-pk-ro', 'READ_ONLY', 'Rita Reader'], ['u-pk-acc', 'ACCOUNTING', 'Al Accounts']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T, T]);
  }
  const business = (id: string, name: string) => db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [id, name, 'gp', 'SURVEY', T]);
  const property = (id: string, b: string, label: string) => db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [id, b, label, 'ZZ9 9ZZ', T]);
  const job = (id: string, b: string, surveyor: string) => {
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [`as-${id}`, b, 'gp', T, 100, 200, T]);
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at) VALUES (?,?,?,?,?,?,?)', [id, b, `as-${id}`, surveyor, 'SEALED', null, T]);
  };
  business('b-pk-1', 'Pack Practice Limited'); property('p-pk-1', 'b-pk-1', 'Pack Practice — main surgery'); job(JOB, 'b-pk-1', 'u-pk-sam');
  // The evidence: an energy certificate (640.5 m²) and the title register's price (£1,050,000), on THIS property.
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-epc-1', 'b-pk-1', 'EPC', 'INVENTED-RRN-PK1', JSON.stringify({ epc_total_floor_area_m2: 640.5, epc_rrn: 'INVENTED-RRN-PK1' }), T, 'p-pk-1']);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-title-1', 'b-pk-1', 'HMLR_TITLE', 'ZZ123456', JSON.stringify({ title_number: 'ZZ123456', price_paid: 1050000 }), T, 'p-pk-1']);
  business('b-pk-2', 'Two Sites Practice Limited'); property('p-pk-2a', 'b-pk-2', 'Two Sites — east'); property('p-pk-2b', 'b-pk-2', 'Two Sites — west'); job(JOB2, 'b-pk-2', 'u-pk-sam');
  // The energy certificate of the OTHER site must never be read as this one's.
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-epc-2', 'b-pk-2', 'EPC', 'INVENTED-RRN-PK2', JSON.stringify({ epc_total_floor_area_m2: 300 }), T, 'p-pk-2a']);
  business('b-pk-3', 'Stress Practice Limited'); property('p-pk-3', 'b-pk-3', 'Stress Practice'); job(JOB3, 'b-pk-3', 'u-pk-sam');
  for (const w of ['u-pk-sam', 'u-pk-ola', 'u-pk-admin', 'u-pk-ro', 'u-pk-acc']) {
    await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() });
  }
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  return { status: r.status, body: await r.text(), location: r.headers.get('location') };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const deps = (): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: nextId });
const view = (job = JOB) => packView(deps(), actor('ADMIN'), job);
const seqOf = (job = JOB) => String(view(job).seq);
const P = (job = JOB) => `/staff/survey/${job}/pack`;

describe('the fixture list', () => {
  test('is read whole (103 rows), its quoted commas kept, and a broken file is refused rather than misread', () => {
    assert.equal(taxonomy().length, 103);
    assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n'), [{ a: 'x, y', b: 'he said "hi"' }]);
    assert.throws(() => parseCsv('a,b\n1,2,3\n'), /row 2 has 3 fields/);
    assert.throws(() => parseCsv('a,b\n"1,2\n'), /never closed/);
  });

  test('a GP pack starts with the shared rows and the GP rows — never loose equipment, never an excluded row', () => {
    const lines = linesForSector('gp');
    assert.equal(lines.length, 37);
    assert.ok(lines.every((l) => /^LS-(SR|MP|GP)-/.test(l.element_id)));
    assert.equal(lines.some((l) => l.element_id === 'LS-GP-013'), false, 'loose GP equipment is the accountant’s claim, not a fixture');
    assert.deepEqual(linesForSector('nowhere'), []);
    // Drafted quantities come only from the floor area or room counts, and only on rows measured that way.
    assert.deepEqual(lines.filter((l) => l.qty_from.kind !== 'NONE').map((l) => l.element_id),
      ['LS-SR-001', 'LS-SR-002', 'LS-SR-003', 'LS-SR-004', 'LS-GP-001', 'LS-GP-002']);
  });
});

describe('the pack', () => {
  test('the drafts: evidence where we hold it, our draft from the fixture list, and nothing else — no rate, no land', async () => {
    const v = view();
    assert.equal(v.property?.id, 'p-pk-1');
    assert.deepEqual([v.inputs.price_paid_pence.value, v.inputs.price_paid_pence.source?.kind], [105_000_000, 'EVIDENCE']);
    assert.deepEqual([v.inputs.gia_milli_m2.value, v.inputs.gia_milli_m2.source?.text], [640_500, 'Energy certificate INVENTED-RRN-PK1']);
    assert.equal(v.inputs.land_pence.value, null);
    assert.equal(v.inputs.building_rate_pence.value, null);
    const elec = v.lines.find((l) => l.id === 'LS-SR-001')!;
    assert.deepEqual([elec.qty_milli.value, elec.pool, elec.qpct_bp.value, elec.qpct_bp.source?.kind, elec.rate_pence.value], [640_500, 'SR', 10000, 'DRAFT', null]);
    assert.ok(v.lines.every((l) => l.rate_pence.value === null), 'a rate was drafted');
    // Room-counted lines wait for every room they need.
    assert.equal(v.lines.find((l) => l.id === 'LS-GP-001')!.qty_milli.value, null);
    for (const [room, count] of [['GP-R1', '8'], ['GP-R2', '2']] as const) {
      assert.equal((await post('u-pk-sam', `/staff/survey/${JOB}/rooms`, { room_id: room, count, note: '' })).status, 303);
    }
    assert.equal(view().lines.find((l) => l.id === 'LS-GP-001')!.qty_milli.value, null, 'drafted before the phlebotomy room was counted');
    await post('u-pk-sam', `/staff/survey/${JOB}/rooms`, { room_id: 'GP-R7', count: '0', note: '' });
    const basins = view().lines.find((l) => l.id === 'LS-GP-001')!;
    assert.equal(basins.qty_milli.value, 10_000);
    assert.equal(basins.qty_milli.source?.text, 'Room counts on this job (chapter 6)');
    assert.equal(basins.qty_milli.source?.by_name, 'Sam Surveyor');
    // No total: the land, the building rate and every line's rate are missing, and each is named.
    assert.equal(v.sums.qualifying_pence, null);
    assert.ok(v.sums.needed.some((x) => x.key === 'land_pence') && v.sums.needed.some((x) => x.key === 'building_rate_pence'));
    // The page says so, in words, with every gap a link to where it is filled in.
    const page = await req('u-pk-sam', `${P()}?ch=4`);
    assert.equal(page.status, 200);
    assert.match(page.body, /There is no total until every value is in\. We never fill a gap with a guess\./);
    assert.match(page.body, /<a href="\/staff\/survey\/job-pk-1\/pack\?ch=9">The value of the bare land within that price\.<\/a>/);
  });

  test('a change is the surveyor’s: their name, the time and the reason, and the history keeps every one', async () => {
    const r = await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-001', qty: '', rate: '162', qpct: '75', pool: '', reason: 'Lighting only in the clinical half', seq: seqOf(), ch: '10' });
    assert.equal(r.status, 303, r.body.slice(0, 400));
    assert.equal(r.location, `${P()}?ch=10&done=saved#l-LS-SR-001`);
    const l = view().lines.find((x) => x.id === 'LS-SR-001')!;
    assert.deepEqual([l.rate_pence.value, l.rate_pence.source?.kind, l.rate_pence.source?.by_name, l.rate_pence.source?.reason], [16_200, 'SURVEYOR', 'Sam Surveyor', 'Lighting only in the clinical half']);
    assert.deepEqual([l.qpct_bp.value, l.qpct_bp.source?.kind], [7500, 'SURVEYOR']);
    assert.equal(l.qty_milli.source?.kind, 'EVIDENCE', 'an empty box changed a value');
    const rows = made.app.db.all<{ field: string; by_user: string; reason: string }>("SELECT field, by_user, reason FROM survey_pack_entries WHERE line_key = 'LS-SR-001' ORDER BY seq");
    assert.deepEqual(rows.map((x) => x.field), ['rate', 'qpct']);
    assert.ok(rows.every((x) => x.by_user === 'u-pk-sam' && x.reason === 'Lighting only in the clinical half'));
    // The page shows the stamp beside the number, and the change in the list.
    const page = (await req('u-pk-sam', `${P()}?ch=10`)).body;
    assert.match(page, /<td class="n">£162<br><span class="pk-src pk-sv">Sam Surveyor<\/span><\/td>/);
    assert.match(page, /<strong>Sam Surveyor<\/strong> set the share that qualifies on <a href="[^"]+#l-LS-SR-001">General electrical system including lighting<\/a>\. “Lighting only in the clinical half”/);
    // The audit says what and where, never the value.
    const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'SURVEY_PACK_CHANGED' ORDER BY seq DESC LIMIT 1")!;
    assert.doesNotMatch(audit.detail, /16200|162|7500/);
    // Typing their own value again changes nothing; typing the draft's own value stamps it as theirs.
    assert.equal((await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-001', qty: '', rate: '162', qpct: '75', pool: '', reason: 'again', seq: seqOf(), ch: '10' })).status, 400);
    assert.equal((await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-001', qty: '640.5', rate: '', qpct: '', pool: '', reason: 'Measured it myself: matches', seq: seqOf(), ch: '10' })).status, 303);
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-001')!.qty_milli.source?.kind, 'SURVEYOR');
  });

  test('our draft comes back when the surveyor puts it back; a line can be taken out and put back; a line can be added', async () => {
    assert.equal((await post('u-pk-sam', `${P()}/revert`, { line: 'LS-SR-001', reason: 'Wrong building', seq: seqOf(), ch: '10' })).status, 303);
    const l = view().lines.find((x) => x.id === 'LS-SR-001')!;
    assert.deepEqual([l.rate_pence.value, l.qpct_bp.value, l.qpct_bp.source?.kind, l.qty_milli.source?.kind], [null, 10000, 'DRAFT', 'EVIDENCE']);
    assert.equal((await post('u-pk-sam', `${P()}/revert`, { line: 'LS-SR-001', reason: 'again', seq: seqOf(), ch: '10' })).status, 400, 'nothing of theirs to put back');
    assert.equal((await post('u-pk-sam', `${P()}/remove`, { line: 'LS-SR-006', reason: 'No external shading', seq: seqOf(), ch: '10' })).status, 303);
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-006')!.removed, true);
    assert.ok(!view().sums.needed.some((x) => x.line_id === 'LS-SR-006'), 'a line taken out is still asked for');
    assert.equal((await post('u-pk-sam', `${P()}/remove`, { line: 'LS-SR-006', reason: 'twice', seq: seqOf(), ch: '10' })).status, 400);
    assert.equal((await post('u-pk-sam', `${P()}/restore`, { line: 'LS-SR-006', reason: 'Found some on the south side', seq: seqOf(), ch: '10' })).status, 303);
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-006')!.removed, false);
    const add = await post('u-pk-sam', `${P()}/add`, { label: 'Reception security screen', unit: 'metres', qty: '4', rate: '850', qpct: '100', pool: 'MP', reason: 'Not on the list; seen in the photos', seq: seqOf(), ch: '10' });
    assert.equal(add.status, 303, add.body.slice(0, 300));
    const added = view().lines.find((x) => x.label === 'Reception security screen')!;
    assert.deepEqual([added.added?.by_name, added.qty_milli.value, added.rate_pence.value, added.pool], ['Sam Surveyor', 4000, 85_000, 'MP']);
    assert.equal((await post('u-pk-sam', `${P()}/add`, { label: 'reception security screen', unit: 'metres', qty: '', rate: '', qpct: '', pool: '', reason: 'dup', seq: seqOf(), ch: '10' })).status, 400);
    assert.equal((await post('u-pk-sam', `${P()}/revert`, { line: added.id, reason: 'x', seq: seqOf(), ch: '10' })).status, 400, 'an added line has no draft');
  });

  test('a line taken out cannot be changed until it is put back; a pack value typed again unchanged changes nothing', async () => {
    assert.equal((await post('u-pk-sam', `${P()}/remove`, { line: 'LS-SR-007', reason: 'No added insulation', seq: seqOf(), ch: '10' })).status, 303);
    const r = await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-007', qty: '10', rate: '', qpct: '', pool: '', reason: 'x', seq: seqOf(), ch: '10' });
    assert.equal(r.status, 400);
    assert.match(r.body, /That line is taken out\. Put it back first\./);
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-007')!.qty_milli.value, null);
    assert.equal((await post('u-pk-sam', `${P()}/value`, { field: 'gia', value: '641', reason: 'Measured from the plans', seq: seqOf(), ch: '9' })).status, 303);
    const s = seqOf();
    const again = await post('u-pk-sam', `${P()}/value`, { field: 'gia', value: '641', reason: 'again', seq: s, ch: '9' });
    assert.equal(again.status, 400);
    assert.match(again.body, /That is already the value\. Nothing changed\./);
    assert.equal(seqOf(), s);
    // The whole-building systems follow the pack's floor area, whoever gave it — and say where it came from.
    const elec = view().lines.find((x) => x.id === 'LS-SR-002')!;
    assert.deepEqual([elec.qty_milli.value, elec.qty_milli.source?.kind, elec.qty_milli.source?.text, elec.qty_milli.source?.by_name], [641_000, 'SURVEYOR', 'The floor area (chapter 9)', 'Sam Surveyor']);
    assert.equal(elec.qty_milli.source?.reason ?? null, null, 'a floor area drafted onto a line reads as a change made on the line');
    // An empty box puts the energy certificate's figure back — and only a value of theirs can be put back.
    assert.equal((await post('u-pk-sam', `${P()}/value`, { field: 'gia', value: '', reason: 'Use the certificate', seq: s, ch: '9' })).status, 303);
    assert.deepEqual([view().inputs.gia_milli_m2.value, view().inputs.gia_milli_m2.source?.kind], [640_500, 'EVIDENCE']);
    assert.equal((await post('u-pk-sam', `${P()}/value`, { field: 'gia', value: '', reason: 'again', seq: seqOf(), ch: '9' })).status, 400);
  });

  test('the database keeps every change for ever: an entry, an added line or a pack is never edited or deleted', () => {
    const db = made.app.db;
    assert.throws(() => db.run('UPDATE survey_pack_entries SET value = 1'), /never edited/);
    assert.throws(() => db.run('DELETE FROM survey_pack_entries'), /never deleted/);
    assert.throws(() => db.run('UPDATE survey_pack_added_lines SET label = ?', ['x']), /never edited/);
    assert.throws(() => db.run('DELETE FROM survey_pack_added_lines'), /never deleted/);
    assert.throws(() => db.run('DELETE FROM survey_packs'), /never deleted/);
    // A surveyor's entry with no reason, a share above 100%, a pool on a value: refused by the database itself.
    const pack = db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [JOB])!.id;
    const ins = (field: string, value: number | null, pool: string | null, reason: string, line: string | null = 'LS-SR-001') =>
      db.run('INSERT INTO survey_pack_entries (id,pack_id,seq,line_key,field,value,pool,by_user,reason,at) VALUES (?,?,?,?,?,?,?,?,?,?)', [nextId(), pack, 9999, line, field, value, pool, 'u-pk-sam', reason, T]);
    assert.throws(() => ins('rate', 1, null, '  '));
    assert.throws(() => ins('qpct', 10001, null, 'x'));
    assert.throws(() => ins('rate', 1, 'MP', 'x'));
    assert.throws(() => ins('price_paid', 1, null, 'x'), 'a pack-wide value on a line');
    assert.throws(() => ins('rate', -1, null, 'x'));
  });

  test('who may change it: only the assigned surveyor. Admin reads it; the other surveyor, accounting and view-only are refused', async () => {
    const form = { line: 'LS-SR-002', qty: '', rate: '14', qpct: '', pool: '', reason: 'x', seq: seqOf(), ch: '10' };
    for (const who of ['u-pk-ola', 'u-pk-admin', 'u-pk-acc', 'u-pk-ro']) {
      const r = await post(who, `${P()}/line`, form);
      assert.ok(r.status === 403 || r.status === 404, `${who} changed the pack (${r.status})`);
    }
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-002')!.rate_pence.value, null);
    assert.equal((await req('u-pk-admin', `${P()}?ch=10`)).status, 200);
    assert.doesNotMatch((await req('u-pk-admin', `${P()}?ch=10`)).body, /<a href="[^"]+edit=/, 'Admin was offered an edit');
    for (const who of ['u-pk-ola', 'u-pk-acc', 'u-pk-ro']) {
      const r = await req(who, `${P()}?ch=10`);
      assert.ok(r.status === 403 || r.status === 404, `${who} read the pack (${r.status})`);
    }
  });

  test('a reason is required; values that are not numbers, or too large, are refused with the box named', async () => {
    const s = seqOf();
    const bad: [Record<string, string>, RegExp][] = [
      [{ rate: '14', reason: '   ' }, /Say why/],
      [{ rate: 'fourteen', reason: 'x' }, /Type the rate in pounds/],
      [{ qpct: '101', reason: 'x' }, /cannot be more than 100%/],
      [{ qty: '-3', reason: 'x' }, /Type how much as a number/],
      [{ pool: 'XX', reason: 'x' }, /Choose the main pool or the special rate pool/],
      [{ rate: '99999999999', reason: 'x' }, /rate/],
      [{ reason: 'nothing typed' }, /Nothing changed/],
    ];
    for (const [f, why] of bad) {
      const r = await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-002', qty: '', rate: '', qpct: '', pool: '', seq: s, ch: '10', ...f });
      assert.equal(r.status, 400, JSON.stringify(f));
      assert.match(r.body, why, JSON.stringify(f));
    }
    assert.equal(seqOf(), s, 'a refused change moved the counter');
    assert.equal((await post('u-pk-sam', `${P()}/line`, { line: 'LS-NOPE', qty: '1', rate: '', qpct: '', pool: '', reason: 'x', seq: s, ch: '10' })).status, 400);
    assert.equal((await post('u-pk-sam', `${P()}/value`, { field: 'secret', value: '1', reason: 'x', seq: s, ch: '9' })).status, 400);
  });

  test('a change from an out-of-date page is refused, and the page is drawn again saying so', async () => {
    const old = seqOf();
    assert.equal((await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-002', qty: '', rate: '14', qpct: '', pool: '', reason: 'tab one', seq: old, ch: '10' })).status, 303);
    const stale = await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-002', qty: '', rate: '15', qpct: '', pool: '', reason: 'tab two', seq: old, ch: '10' });
    assert.equal(stale.location, `${P()}?ch=10&stale=1`);
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-002')!.rate_pence.value, 1400, 'the out-of-date tab overwrote the first');
    assert.match((await req('u-pk-sam', stale.location ?? '')).body, /This pack changed since you opened it\./);
    for (const s of ['', 'abc', '-1', '99999999999']) {
      assert.ok([303, 400].includes((await post('u-pk-sam', `${P()}/line`, { line: 'LS-SR-002', qty: '', rate: '16', qpct: '', pool: '', reason: 'x', seq: s, ch: '10' })).status));
    }
    assert.equal(view().lines.find((x) => x.id === 'LS-SR-002')!.rate_pence.value, 1400);
  });

  test('a company with several properties: the pack asks which, and never borrows another site’s certificate', async () => {
    const v = view(JOB2);
    assert.equal(v.property, null);
    assert.equal(v.inputs.gia_milli_m2.value, null);
    assert.match((await req('u-pk-sam', `${P(JOB2)}?ch=10`)).body, /Which property is this pack for\?/);
    assert.equal((await post('u-pk-sam', `${P(JOB2)}/line`, { line: 'LS-SR-002', qty: '1', rate: '', qpct: '', pool: '', reason: 'x', seq: '0', ch: '10' })).status, 400);
    assert.equal((await post('u-pk-sam', `${P(JOB2)}/property`, { property_id: 'p-pk-1', ch: '10', seq: '0' })).status, 400, 'another company’s property');
    assert.equal((await post('u-pk-sam', `${P(JOB2)}/property`, { property_id: 'p-pk-2b', ch: '10', seq: '0' })).status, 303);
    const w = view(JOB2);
    assert.equal(w.property?.id, 'p-pk-2b');
    assert.equal(w.inputs.gia_milli_m2.value, null, 'the east site’s certificate was read as the west site’s');
    assert.equal((await post('u-pk-sam', `${P(JOB2)}/property`, { property_id: 'p-pk-2a', ch: '10', seq: '0' })).status, 400, 'changed once set');
    // No certificate for this site: the surveyor gives the floor area, and the whole-building systems follow it.
    assert.equal(w.lines.find((x) => x.id === 'LS-SR-001')!.qty_milli.value, null);
    assert.equal((await post('u-pk-sam', `${P(JOB2)}/value`, { field: 'gia', value: '420', reason: 'Measured from the plans', seq: seqOf(JOB2), ch: '9' })).status, 303);
    const l = view(JOB2).lines.find((x) => x.id === 'LS-SR-001')!;
    assert.deepEqual([l.qty_milli.value, l.qty_milli.source?.text, l.qty_milli.source?.by_name], [420_000, 'The floor area (chapter 9)', 'Sam Surveyor']);
  });

  test('a complete pack: the totals on the page are exactly the sums module’s, and the pools add up to the penny', async () => {
    const say = async (path: string, f: Record<string, string>) => {
      const r = await post('u-pk-sam', path, { ...f, seq: seqOf(), ch: '10' });
      assert.equal(r.status, 303, `${path} ${JSON.stringify(f)}: ${r.body.slice(0, 300)}`);
    };
    await say(`${P()}/value`, { field: 'land', value: '50,000', reason: 'Land at 5% of the price, from local sales' });
    await say(`${P()}/value`, { field: 'building_rate', value: '1847.50', reason: 'BCIS health centres, Q3 2026, location factor applied' });
    const fill: Record<string, [string, string, string, string]> = {
      'LS-SR-001': ['', '162', '75', ''], 'LS-SR-002': ['', '15', '', ''], 'LS-SR-003': ['', '52', '', ''], 'LS-SR-004': ['', '12.5', '', ''],
      'LS-SR-005': ['1', '38000', '', ''], 'LS-MP-001': ['14', '1000', '', ''], 'LS-MP-003': ['1', '17920', '', ''],
      'LS-GP-001': ['', '650', '', ''], 'LS-GP-002': ['', '400', '', ''], 'LS-MP-015': ['1', '6000', '', 'MP'], 'LS-GP-014': ['1', '9000', '100', 'SR'],
    };
    for (const l of view().lines) {
      if (l.removed) continue;
      const f = fill[l.id];
      if (f === undefined) { await say(`${P()}/remove`, { line: l.id, reason: 'Not in this building' }); continue; }
      if (l.added !== null) continue;
      await say(`${P()}/line`, { line: l.id, qty: f[0], rate: f[1], qpct: f[2], pool: f[3], reason: 'From the floor plans and the photos' });
    }
    const v = view();
    assert.equal(v.sums.complete, true, JSON.stringify(v.sums.needed.slice(0, 5)));
    const again = packSums(v.inputs, v.lines);
    assert.equal(v.sums.qualifying_pence, again.qualifying_pence);
    assert.equal((v.sums.main_pool_pence ?? 0) + (v.sums.special_pool_pence ?? 0), v.sums.qualifying_pence);
    assert.ok((v.sums.qualifying_pence ?? 0) > 0 && (v.sums.qualifying_pence ?? 0) < 100_000_000);
    const page = (await req('u-pk-sam', `${P()}?ch=4`)).body;
    assert.match(page, /Every value is in\.<\/strong> The sums are complete\./);
    const money = (p: number | null) => `£${Math.floor((p ?? 0) / 100).toLocaleString('en-GB')}${(p ?? 0) % 100 === 0 ? '' : `.${String((p ?? 0) % 100).padStart(2, '0')}`}`;
    assert.ok(page.includes(`Spend that qualifies<b>${money(v.sums.qualifying_pence)}</b>`), 'the summary does not show the total');
    assert.ok(page.includes(`<div><dt>Main pool</dt><dd>${money(v.sums.main_pool_pence)}</dd></div>`));
    assert.ok(page.includes(`<div><dt>Special rate pool</dt><dd>${money(v.sums.special_pool_pence)}</dd></div>`));
  });

  test('400 random changes from two tabs: the counter never skips or repeats, every accepted change is in the history, the totals always agree', async () => {
    let r = 20261001;
    const rand = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
    const ids = view(JOB3).lines.map((l) => l.id);
    const tabs = [seqOf(JOB3), seqOf(JOB3)];
    let accepted = 0, stale = 0, refused = 0;
    for (let i = 0; i < 400; i++) {
      const t = Math.floor(rand() * 2);
      const line = ids[Math.floor(rand() * ids.length)]!;
      const k = rand();
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
      const path = k < 0.6 ? 'line' : k < 0.7 ? 'remove' : k < 0.8 ? 'restore' : k < 0.9 ? 'revert' : 'value';
      const f: Record<string, string> = path === 'value'
        ? { field: pick(['price_paid', 'land', 'gia', 'building_rate']), value: pick(['', '1000', '250000.50', '640', 'x']), reason: `r${i}` }
        : { line, qty: pick(['', '3', '12.5']), rate: pick(['', '100', '2500']), qpct: pick(['', '100', '50']), pool: pick(['', 'MP', 'SR']), reason: `r${i}` };
      const before = view(JOB3).seq;
      const res = await post('u-pk-sam', `${P(JOB3)}/${path}`, { ...f, seq: tabs[t]!, ch: '10' });
      const after = view(JOB3).seq;
      if (res.status === 303 && res.location?.includes('stale=1')) { stale++; assert.equal(after, before, 'a stale change was written'); }
      else if (res.status === 303) { accepted++; assert.ok(after > before, 'an accepted change did not move the counter'); assert.equal(String(before), tabs[t], 'a change from an old page was accepted'); }
      else { refused++; assert.equal(res.status, 400); assert.equal(after, before, 'a refused change was written'); }
      // A tab that saved, or was told it was stale, reloads; the other tab keeps its old page, sometimes.
      if (res.status === 303 || rand() < 0.3) tabs[t] = seqOf(JOB3);
      const v = view(JOB3);
      assert.deepEqual([v.sums.qualifying_pence, v.sums.complete], [packSums(v.inputs, v.lines).qualifying_pence, packSums(v.inputs, v.lines).complete]);
    }
    const seqs = made.app.db.all<{ seq: number }>('SELECT e.seq FROM survey_pack_entries e JOIN survey_packs p ON p.id = e.pack_id WHERE p.job_id = ? ORDER BY e.seq', [JOB3]).map((x) => x.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i + 1), 'the counter skipped or repeated');
    assert.ok(accepted > 100 && stale > 20 && refused > 10, `accepted ${accepted}, stale ${stale}, refused ${refused}`);
    assert.equal(view(JOB3).changes.length, seqs.length, 'a change is missing from the history');
  });

  test('2,000 random forms against every route never break a page', async () => {
    let r = 7;
    const rand = () => { r = (Math.imul(r ^ (r >>> 13), 1597334677) + 1) >>> 0; return r / 4294967296; };
    const junk = ['', ' ', '0', '-0', '1e9', 'NaN', '£', '<script>', '"', "'; DROP TABLE x;--", '9'.repeat(40), 'LS-SR-001', 'MP', 'SR', '100', '12.345', '\u0000', 'é'.repeat(600)];
    const routes = ['value', 'line', 'revert', 'remove', 'restore', 'add', 'property'];
    for (let i = 0; i < 2000; i++) {
      const pick = () => junk[Math.floor(rand() * junk.length)] as string;
      const f: Record<string, string> = {};
      for (const k of ['field', 'value', 'line', 'qty', 'rate', 'qpct', 'pool', 'label', 'unit', 'reason', 'seq', 'ch', 'property_id']) if (rand() < 0.7) f[k] = pick();
      const res = await post('u-pk-sam', `${P(JOB3)}/${routes[Math.floor(rand() * routes.length)]}`, f);
      assert.ok([303, 400].includes(res.status), `status ${res.status} for ${JSON.stringify(f).slice(0, 200)}`);
    }
    for (const q of ['?ch=99', '?ch=-1', '?ch=abc', '?edit=%3Cscript%3E', '?ch=10&edit=LS-SR-001', '?ch=9&edit=land', '?ch=10&add=1']) {
      const res = await req('u-pk-sam', `${P(JOB3)}${q}`);
      assert.equal(res.status, 200, q);
      assert.doesNotMatch(res.body, /<script>/);
    }
  });
});
