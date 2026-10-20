/**
 * PHASE 160i — WHERE THIS CLAIM STANDS, 20 October 2026 (src/web/claim-overview.ts, drawn on the claim page by
 * src/web/crm-pages.ts; the one-client audit log in src/web/audit-log.ts and src/web/staff.ts; the fact form's source in
 * src/web/claim-record-pages.ts). Every stage with its needs, still needed and gathered from the claim's own records,
 * where each fact came from, every value before, the survey pack's progress and the client's audit log.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { claimOverview, fieldWords, packProgress, sentence, sourceName, STAGE_WORDS } from '../src/web/claim-overview.ts';
import * as C from '../src/web/crm.ts';
import type { Actor } from '../src/authz.ts';
import type { FactsPanel } from '../src/web/claim-facts.ts';
import { kindWords } from '../src/web/audit-log.ts';
import { PROCEDURE_STAGES } from '../src/web/stages.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };
let made: Made;
let base = '';
let password = '';
let claim = ''; let biz = ''; let job = '';
const BLOCK = /<section class="cov" id="where"[\s\S]*?<details class="cov-gloss">[\s\S]*?<\/details>\s*<\/div>\s*<\/div>\s*<\/section>/;

type Session = { get: (p: string) => Promise<Res>; post: (p: string, f: Record<string, string>) => Promise<Res> };
const sessions = new Map<string, Session>();
/** One sign-in per login for the whole file: sign-in is limited from one network address (Phase 160e). */
async function signIn(who: string): Promise<Session> {
  const had = sessions.get(who);
  if (had !== undefined) return had;
  const made = await signInNow(who);
  sessions.set(who, made);
  return made;
}
async function signInNow(who: string): Promise<Session> {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text() };
  };
  const post = (path: string, fields: Record<string, string>): Promise<Res> => req(path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(),
  });
  const r = await post('/login', { email: `${who}@example.invalid`, password });
  assert.equal(r.status, 303, `${who} could not sign in`);
  return { get: (p) => req(p), post };
}
const block = (html: string): string => BLOCK.exec(html)?.[0] ?? '';
const words = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160i-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  password = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
  const row = made.app.db.get<{ id: string; business_id: string }>(
    "SELECT c.id, c.business_id FROM claims c JOIN businesses b ON b.id = c.business_id JOIN surveyor_jobs j ON j.claim_id = c.id " +
      "WHERE b.name LIKE 'Dunmarrow%' AND c.stage = 'SURVEY' LIMIT 1");
  assert.ok(row !== undefined, 'the seed has Dunmarrow at the survey stage with a survey job');
  claim = row.id; biz = row.business_id;
  job = made.app.db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1', [claim])?.id ?? '';
});
after(() => made.close());

describe('Phase 160i: the stages', () => {
  test('Admin and Sales see every stage, the ten and Closed, with the one we are at marked and each stage’s count', async () => {
    for (const who of ['admin', 'sales']) {
      const b = block((await (await signIn(who)).get(`/staff/claims/${claim}`)).body);
      assert.notEqual(b, '', `${who}: no block`);
      const links = [...b.matchAll(/<a href="[^"]*\?stage=([A-Z_]+)#where" class="cov-st cov-(done|now|later)"/g)];
      assert.deepEqual(links.map((m) => m[1]), [...PROCEDURE_STAGES.map((s) => s.key), 'CLOSED'], who);
      assert.deepEqual(links.map((m) => m[2]), ['done', 'done', 'done', 'done', 'now', 'later', 'later', 'later', 'later', 'later', 'later'], who);
      assert.match(b, /\?stage=SURVEY#where" class="cov-st cov-now" aria-current="true">/);
      assert.match(b, /<h3>5\. Survey: we are here<\/h3>/);
      assert.match(b, /Stage 5 of 11: Survey\./);
      assert.match(b, /<span class="cov-cnt">\d+\/\d+<\/span>/, 'the current and later stages carry what is in, out of what they need');
    }
  });

  test('a later stage opens to what it will need, says it has not started, and links back', async () => {
    const b = block((await (await signIn('sales')).get(`/staff/claims/${claim}?stage=VALUATION`)).body);
    assert.match(b, /<h3>6\. Valuation<\/h3><span class="badge">Not started yet<\/span>/);
    assert.match(b, new RegExp(STAGE_WORDS.VALUATION.plain.slice(0, 40)));
    assert.match(b, /Needed at this stage, once it starts\./);
    assert.match(b, /\?stage=SURVEY#where">Back to where we are<\/a>/);
    const bad = block((await (await signIn('sales')).get(`/staff/claims/${claim}?stage=NOT_A_STAGE`)).body);
    assert.match(bad, /<h3>5\. Survey: we are here<\/h3>/, 'an unknown stage opens the current one');
  });

  test('the block itself refuses a login that may not read the pipeline, even one handed the facts', () => {
    const actorOf = (email: string, role: string): Actor => ({ id: made.app.db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])?.id ?? '', role, business_id: null, disabled: false } as Actor);
    const admin = actorOf('admin@example.invalid', 'ADMIN');
    const v = C.claimView(made.app.db, admin, claim, { now: made.app.now() });
    const facts = v.facts as FactsPanel;
    const input = { id: claim, business_id: biz, property_id: null, facts, documents: v.documents };
    assert.notEqual(claimOverview(made.app.db, admin, input, null, '2026-10-20'), null);
    for (const [email, role] of [['accounting@example.invalid', 'ACCOUNTING'], ['surveying@example.invalid', 'SURVEYING']] as const) {
      assert.equal(claimOverview(made.app.db, actorOf(email, role), input, null, '2026-10-20'), null, role);
    }
  });

  test('nobody else gets the block: Accounting and the surveyor', async () => {
    for (const who of ['accounting', 'surveying']) {
      const r = await (await signIn(who)).get(`/staff/claims/${claim}`);
      assert.doesNotMatch(r.body, /class="cov"/, who);
    }
  });
});

describe('Phase 160i: still needed', () => {
  test('the stage’s unmet needs in plain words with the way to fix them, and a late ask of the client first', async () => {
    const t = made.app.now();
    made.app.db.run(
      "INSERT INTO client_tasks (id, business_id, question, why, holds_up, state, created_at, kind, claim_id, due_on, sent_to_portal_at) " +
        "VALUES ('ct-160i-late', ?, 'When did you last extend the building?', 'Work done since can be claimed too', 'the survey', 'OPEN', ?, 'QUESTION', ?, '2026-10-06', ?)",
      [biz, t, claim, t]);
    const b = block((await (await signIn('sales')).get(`/staff/claims/${claim}`)).body);
    const list = /<section class="cov-col" aria-labelledby="cov-need-h">([\s\S]*?)<\/section>/.exec(b)?.[1] ?? '';
    const items = [...list.matchAll(/<li class="cov-need cov-(late|asked|needed)">([\s\S]*?)<\/li>/g)];
    assert.ok(items.length >= 2);
    assert.equal(items[0]?.[1], 'late');
    assert.match(items[0]?.[2] ?? '', /When did you last extend the building\?<\/span> <span class="badge b-stop">Late<\/span>/);
    assert.match(items[0]?.[2] ?? '', /A question for the client, in their portal\. Asked [^.]+, due 6 Oct 2026\./);
    assert.match(list, /The surveyor’s figures/);
    assert.match(list, /No surveyor has committed figures/, 'the reason, as a sentence');
    const sales = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email = 'sales@example.invalid'")?.id ?? '';
    made.app.db.run("UPDATE client_tasks SET state = 'WITHDRAWN', withdrawn_at = ?, withdrawn_by = ? WHERE id = 'ct-160i-late'", [t, sales]);
  });
});

describe('Phase 160i: gathered, and where each thing came from', () => {
  test('a lookup shows its public record by name, the record it read, who started the run, and exactly what came back', async () => {
    const t = made.app.now();
    const sales = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email = 'sales@example.invalid'")?.id ?? '';
    made.app.db.run("INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, not_permitted, failed, kind) VALUES ('rr-160i', ?, ?, ?, 3, 1, 0, 0, 'RUN')",
      [biz, sales, new Date(Date.parse(t) - 60000).toISOString()]);
    made.app.db.run("INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at) VALUES ('rec-160i', ?, 'CH_COMPANY', 'INVENTED-CO-160I', ?, ?)",
      [biz, JSON.stringify({ company_name: 'Dunmarrow Medical Practice Limited', company_status: 'active', incorporation_date: '2011-06-04', accounts_year_end: '03-31' }), t]);
    const b = block((await (await signIn('sales')).get(`/staff/claims/${claim}`)).body);
    const line = /<details class="cov-got"><summary>[\s\S]*?Companies House[\s\S]*?<\/details>/.exec(b)?.[0] ?? '';
    assert.notEqual(line, '');
    assert.match(line, /<span class="cov-gval">Dunmarrow Medical Practice Limited, active<\/span>/);
    assert.match(line, /<span class="cov-src cov-src-lookup">Lookup: Companies House<\/span>/);
    assert.match(line, /<dt>Record<\/dt><dd>INVENTED-CO-160I<\/dd>/);
    assert.match(line, /<dt>Started by<\/dt><dd>[^<]*Sales[^<]*, /);
    assert.match(line, /<h4>Exactly what came back<\/h4>/);
    assert.match(line, /<th scope="row">Set up on<\/th><td>4 Jun 2011<\/td>/);
    assert.match(line, /<th scope="row">Year end \(month and day\)<\/th><td>03-31<\/td>/);
    assert.doesNotMatch(words(b), /\bCH_COMPANY\b|\bHMLR_[A-Z]+\b|\bCLIENT_ANSWER\b|\bCLIENT_DOC\b/, 'no internal code on the screen');
  });

  test('a typed fact needs its source; each value stays, newest first, with who typed it, and each is in the audit log', async () => {
    const sales = await signIn('sales');
    const none = await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'AIA_HEADROOM_AMOUNT', answer: 'VALUE', value: '25000', source_id: '' });
    assert.notEqual(none.status, 303, 'refused without a source');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_facts WHERE claim_id = ? AND fact_key = 'AIA_HEADROOM_AMOUNT'", [claim])?.n, 0);
    const before = made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLAIM_FACT_RECORDED' AND object_id = ?", [claim])?.n ?? 0;
    assert.equal((await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'AIA_HEADROOM_AMOUNT', answer: 'VALUE', value: '25000', source_id: 'CLIENT_ANSWER', note: 'On the phone' })).status, 303);
    assert.equal((await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'AIA_HEADROOM_AMOUNT', answer: 'VALUE', value: '30000', source_id: 'CLIENT_DOC', note: 'Page 4 of the accounts' })).status, 303);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLAIM_FACT_RECORDED' AND object_id = ?", [claim])?.n, before + 2);
    const b = block((await sales.get(`/staff/claims/${claim}`)).body);
    const line = /<details class="cov-got"><summary>(?:(?!<\/details>)[\s\S])*?How much Annual Investment Allowance headroom is left[\s\S]*?<\/details>/.exec(b)?.[0] ?? '';
    assert.notEqual(line, '');
    assert.match(line, /<span class="cov-gval">£30,000<\/span>/);
    assert.match(line, /<span class="cov-src cov-src-client">Typed in by Sales User<\/span>/);
    assert.match(line, /<dt>How we got it<\/dt><dd>From a document the client gave us<\/dd>/);
    assert.match(line, /<dt>Their note<\/dt><dd>Page 4 of the accounts<\/dd>/);
    const hist = [...(/<ol class="cov-hist">([\s\S]*?)<\/ol>/.exec(line)?.[1] ?? '').matchAll(/<li><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    assert.deepEqual(hist, ['£30,000', '£25,000'], 'newest first, the old value kept');
    assert.match(line, /The client told us\. Note: On the phone/);
    assert.match(line, /href="#record-fact">Change or correct it<\/a>/);
  });

  test('the fact form asks where the value came from, with no answer chosen for you', async () => {
    const page = (await (await signIn('sales')).get(`/staff/claims/${claim}`)).body;
    assert.match(page, /<label>Where did you get this\? <span class="req">\(required\)<\/span> <select name="source_id" required><option value="">Choose one<\/option>/);
  });

  test('field names and record names are said in words', () => {
    assert.equal(fieldWords('epc_total_floor_area_m2'), 'Floor area (m²)');
    assert.equal(fieldWords('some_new_field'), 'Some new field');
    assert.equal(sourceName('EPC'), 'The energy certificate register');
    assert.equal(sourceName('HMLR_PPD'), 'HM Land Registry, prices paid');
    assert.equal(sentence('no surveyor has committed figures'), 'No surveyor has committed figures.');
  });
});

describe('Phase 160i: the survey pack', () => {
  test('its progress is the chapters the surveyor has gone through, and all 23 once they approve it', () => {
    const db = made.app.db;
    const j = db.get<{ surveyor_id: string | null }>('SELECT surveyor_id FROM surveyor_jobs WHERE id = ?', [job]);
    assert.ok(j?.surveyor_id !== null && j?.surveyor_id !== undefined, 'the seeded job has a surveyor');
    const t = made.app.now();
    for (const ch of [1, 2, 3, 4, 5, 6]) db.run('INSERT INTO survey_pack_reads (id, job_id, user_id, chapter, legal_seq, at) VALUES (?, ?, ?, ?, 0, ?)', [`r160i-${ch}`, job, j.surveyor_id, ch, t]);
    const p = packProgress(db, claim);
    assert.ok(p !== null);
    assert.deepEqual(p.done, [1, 2, 3, 4, 5, 6]);
    assert.equal(p.percent, Math.round((6 / 23) * 100));
    assert.equal(p.approved, false);
    let pack = db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [job])?.id;
    if (pack === undefined) {
      pack = 'pack-160i';
      db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, NULL, ?, ?)', [pack, job, t, j.surveyor_id]);
    }
    const snap = '{}';
    db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, 1, 0, 0, ?, ?, ?, ?)',
      ['appr-160i', pack, snap, createHash('sha256').update(snap).digest('hex'), j.surveyor_id, t]);
    const q = packProgress(db, claim);
    assert.equal(q?.percent, 100);
    assert.equal(q?.done.length, 23);
  });

  test('the page shows the percentage, the 23 chapters and the link to the pack', async () => {
    const b = block((await (await signIn('sales')).get(`/staff/claims/${claim}`)).body);
    assert.match(b, /<span class="cov-pct">100%<\/span>/);
    assert.equal((b.match(/<li class="done"><span>\d+<\/span>/g) ?? []).length, 23);
    assert.match(b, new RegExp(`href="/staff/survey/${job}/pack">Open the survey pack</a>`));
    assert.match(b, /class="cov-bar-100"/);
  });
});

describe('Phase 160i: the client’s audit log', () => {
  test('Admin sees the count on the claim and opens one client’s entries, in plain words; opening it is itself logged', async () => {
    const admin = await signIn('admin');
    const b = block((await admin.get(`/staff/claims/${claim}`)).body);
    assert.match(b, /<h3>The audit log for this client<\/h3>/);
    assert.match(b, /Nobody can change or delete an entry, Admin included\./);
    assert.match(b, new RegExp(`href="/staff/audit\\?client=${biz}">Open the audit log for this client</a>`));
    const r = await admin.get(`/staff/audit?client=${biz}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /<h1>Dunmarrow Medical Practice Limited<\/h1>/);
    assert.match(r.body, /<td>Recorded a fact on the claim<\/td>/);
    assert.match(r.body, /Sales User<br><span class="help">Sales<\/span>/);
    assert.doesNotMatch(r.body, /CLAIM_FACT_RECORDED/, 'no code on the screen');
    const last = made.app.db.get<{ kind: string; detail: string }>('SELECT kind, detail FROM audit_log ORDER BY seq DESC LIMIT 1');
    assert.equal(last?.kind, 'AUDIT_LOG_READ');
    assert.deepEqual((JSON.parse(last?.detail ?? '{}') as { filters: string[] }).filters, ['client']);
  });

  test('only Admin: Sales gets no audit card and is refused the client’s log', async () => {
    const sales = await signIn('sales');
    assert.doesNotMatch(block((await sales.get(`/staff/claims/${claim}`)).body), /cov-audit/);
    assert.notEqual((await sales.get(`/staff/audit?client=${biz}`)).status, 200);
  });

  test('an entry cannot be changed or deleted, by anyone', () => {
    assert.throws(() => made.app.db.run("UPDATE audit_log SET kind = 'X' WHERE seq = 1"));
    assert.throws(() => made.app.db.run('DELETE FROM audit_log WHERE seq = 1'));
    assert.equal(kindWords('CLAIM_FACT_RECORDED'), 'Recorded a fact on the claim');
    assert.equal(kindWords('SOME_NEW_KIND'), 'Some new kind');
  });

  test('an unknown client is said, not used', async () => {
    const r = await (await signIn('admin')).get('/staff/audit?client=nobody');
    assert.equal(r.status, 200);
    assert.match(r.body, /Client: not a client in this system, so it was not used/);
  });
});

describe('Phase 160i: the words and the look', () => {
  test('no long dash, no script, no inline style in the block; a glossary for newcomers; its style is in the stylesheet', async () => {
    const b = block((await (await signIn('sales')).get(`/staff/claims/${claim}`)).body);
    assert.doesNotMatch(b, /—|<script|\sstyle=/);
    assert.match(b, /<summary>New to capital allowances\? The words on this page<\/summary>/);
    assert.match(SITE_CSS, /body\.crm \.cov\{/);
    assert.match(SITE_CSS, /body\.crm \.cov-bar-55\{width:55%\}/);
  });
});
