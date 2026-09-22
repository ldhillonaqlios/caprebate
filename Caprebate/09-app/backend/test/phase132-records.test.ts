/**
 * PHASE 132 — THE RECORDS A DEFENCE RESTS ON. 14 September 2026.
 *
 * WHAT EACH BLOCK PROVES, BOTH WAYS:
 *   line 2 · the case stamp       an ISSUE through the register writes exactly one stamp — engine version, rulebook
 *                                 versions, every CTA switch COUNTED, every back-end switch found by grep, the sign-off
 *                                 references — hashed over what is stored; a refusal writes none; nothing changes one
 *   line 2 · the defence pack     OFF refuses and writes nothing; ON builds a hashed manifest and issues nothing; a
 *                                 section resting on a fact recorded as not known and one never recorded are identical
 *                                 and INCOMPLETE (N4); with every sealed record present it is COMPLETE
 *   line 5 · the deletion log     the backup cycle is a named blank; the log refuses an expiry with no cycle and "no
 *                                 backups" with no cycle; the only change is one verification; a restoration needs a
 *                                 logged deletion and an approval
 *   line 6 · RET-7's two dates    read from the claim; not known and never recorded read null alike (N4); a draft and
 *                                 no report read null alike; fed to the ingestion module's clock they give its date,
 *                                 and the earlier-of rule is unchanged
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _canonical } from '../src/audit.ts';
import { APP_ROLES } from '../src/roles.ts';
import { can, NotAuthorised, REGISTERED_ACTIONS, type Obj } from '../src/authz.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as T from '../src/web/tasks.ts';
import * as R from '../src/web/claim-record.ts';
import * as D from '../src/web/documents.ts';
import * as S from '../src/web/compliance-identity.ts';
import * as CS from '../src/web/case-stamp.ts';
import * as DP from '../src/web/defence-pack.ts';
import { CTA, ctaSwitchReadings } from '../src/web/engine.ts';
import { FEE_CONTROLS } from '../src/web/fee-controls.ts';
import { FUNNEL_SWITCHES } from '../src/web/funnel-session.ts';
import {
  BACKUP_CYCLE, FAIL_CLOSED_SETTINGS, RET7, deletionDueAt, type IngestionSettings, type RawFileRecord,
} from '../src/web/upload-handler-port.ts';
import { actor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

type App = Awaited<ReturnType<typeof testApp>>;
type Org = { business: string; property: string; assessment: string };

const T0 = '2026-09-08T00:00:00.000Z';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BACKEND = fileURLToPath(new URL('../', import.meta.url));
const SALES = actor('SALES');
const ADMIN = actor('ADMIN');

async function app(): Promise<App> {
  const a = await testApp();
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
  return a;
}

let n = 0;
function organisation(a: App): Org {
  n += 1;
  const business = `b-132-${n}`;
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Records ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-132-${n}`;
  a.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-132-${n}`;
  a.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
  return { business, property, assessment };
}

function claimAt(a: App, org: Org, stage: string): string {
  const made = C.insertClaim(a.db, a.now, randomUUID, {
    business_id: org.business, property_id: org.property, assessment_id: org.assessment, workstream: 'PLANT_AND_MACHINERY',
    stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened(CF.recordDeps(a), null, made.id, stage, 'a test fixture');
  T.insertTask(a.db, a.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: org.business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null,
    created_by: 'u-SALES',
  });
  return made.id;
}

function count(a: App, sql: string, params: readonly string[] = []): number {
  return a.db.get<{ n: number }>(sql, [...params])?.n ?? -1;
}

function ok(r: { ok: boolean; why?: string }): void {
  assert.equal(r.ok, true, r.why ?? '');
}

function sha256(v: unknown): string {
  return createHash('sha256').update(_canonical(v)).digest('hex');
}

type StampRow = {
  id: string; claim_id: string; deliverable_id: string; engine_version: string | null; rulebook_modules_json: string;
  switch_readings_json: string; signoff_refs_json: string; estimate_hash: string | null; anchor_log_head_hash: string | null;
  stamp_hash: string; stamped_by: string; stamped_at: string;
};

/* ================================================================== *
 * LINE 2 — THE CASE STAMP
 * ================================================================== */

describe('line 2 — every sealed case stamped with the engine version, the rulebook versions, every switch and the sign-off references', () => {
  test('CASE STAMP ON ISSUE: an ISSUE through recordDeliverable writes exactly one stamp — a draft writes none — carrying the engine package’s version, the eleven rulebooks, every CTA switch (counted from CB_CTA, not quoted), every back-end switch and the sign-off records, hashed over what is stored; a later version is stamped again and the first stays as it was', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const signoff = CF.signOffRow(a, org.business, org.assessment, claim);
      const d = CF.recordDeps(a);
      ok(R.recordDeliverable(d, SALES, claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 0, 'a draft was stamped');
      const issued = R.recordDeliverable(d, SALES, claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-01', content_hash: 'b'.repeat(64) });
      assert.ok(issued.ok);
      const rows = a.db.all<StampRow>('SELECT * FROM claim_version_stamps');
      assert.equal(rows.length, 1, 'one ISSUE writes exactly one stamp');
      const s = rows[0];
      assert.ok(s !== undefined);
      assert.equal(s.deliverable_id, issued.id);
      assert.equal(s.claim_id, claim);
      assert.equal(s.stamped_by, 'u-SALES');

      const pkg = JSON.parse(readFileSync(join(ROOT, '09-app', 'engine', 'package.json'), 'utf8')) as { version?: unknown };
      assert.equal(s.engine_version, typeof pkg.version === 'string' ? pkg.version : null, 'the engine version is the engine package’s own');

      const modules = JSON.parse(s.rulebook_modules_json) as unknown[];
      assert.deepEqual(modules, JSON.parse(JSON.stringify(CS.RULEBOOK_MODULES)));
      assert.equal(modules.length, 11);

      const sw = JSON.parse(s.switch_readings_json) as { cta: { switch: string; on: boolean }[]; registry_free_enabled: boolean; backend: { switch: string; on: boolean }[] };
      const counted = Object.values(CTA as unknown as Record<string, unknown>).filter((v) => typeof v === 'boolean').length;
      assert.ok(counted > 0, 'CB_CTA carries no switch at all');
      assert.equal(sw.cta.length, counted, 'the stamp does not carry every CB_CTA switch');
      assert.equal(sw.cta.length, ctaSwitchReadings().length);
      assert.equal(sw.registry_free_enabled, false, 'the free register gate ships shut');
      assert.deepEqual(sw.backend.map((x) => x.switch), CS.backendSwitchReadings().map((x) => x.switch));
      assert.deepEqual(sw.backend.find((x) => x.switch === 'DEFENCE_PACK_GENERATOR'), { switch: 'DEFENCE_PACK_GENERATOR', on: false, home: 'src/web/defence-pack.ts' });

      const refs = JSON.parse(s.signoff_refs_json) as { id: string; record_hash: string }[];
      assert.deepEqual(refs, a.db.all<{ id: string; record_hash: string }>('SELECT id, record_hash FROM tax_adviser_signoffs WHERE claim_id = ?', [claim]).map((x) => ({ ...x })));
      assert.equal(refs[0]?.id, signoff);
      assert.equal(s.estimate_hash, null, 'no estimate is sealed for this assessment, and none is invented');

      const recomputed = sha256(CS.stampHashInput({ ...s, rulebook_modules: modules, switch_readings: sw, signoff_refs: refs }));
      assert.equal(s.stamp_hash, recomputed, 'the stamp hash is not over what is stored');

      const line = a.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CASE_STAMPED'");
      const detail = JSON.parse(line?.detail ?? '{}') as Record<string, unknown>;
      assert.equal(detail['stamp'], s.id);
      assert.equal(detail['cta_switches'], counted);
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CASE_STAMPED'"), 1);

      ok(R.recordDeliverable(d, SALES, claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
      const second = R.recordDeliverable(d, SALES, claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-02', content_hash: 'c'.repeat(64) });
      assert.ok(second.ok);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 2);
      assert.deepEqual({ ...a.db.get<StampRow>('SELECT * FROM claim_version_stamps WHERE id = ?', [s.id]) }, { ...s }, 'the first stamp moved when the report was superseded');
    } finally { a.close(); }
  });

  test('A STAMP NEVER CHANGES AND IS NEVER DELETED, is written only for an issued deliverable of its own claim — and a refused ISSUE writes none; the same ISSUE with what it lacked writes one', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const d = CF.recordDeps(a);
      ok(R.recordDeliverable(d, SALES, claim, { kind: 'DEFENCE_PACK', action: 'DRAFT' }));
      const draft = a.db.get<{ id: string }>("SELECT id FROM claim_deliverables WHERE claim_id = ? AND kind = 'DEFENCE_PACK'", [claim]);
      assert.ok(draft !== undefined);
      const refusals = [
        R.recordDeliverable(d, SALES, claim, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: '2026-09-01', content_hash: '' }),
        R.recordDeliverable(d, SALES, claim, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: '2027-01-01', content_hash: 'a'.repeat(64) }),
        R.recordDeliverable(d, SALES, claim, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: 'not a date', content_hash: 'a'.repeat(64) }),
      ];
      for (const r of refusals) assert.equal(r.ok, false);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 0, 'a refused ISSUE wrote a stamp');
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CASE_STAMPED'"), 0);
      assert.throws(() => a.db.run(
        'INSERT INTO claim_version_stamps (id, claim_id, deliverable_id, engine_version, rulebook_modules_json, switch_readings_json, signoff_refs_json, stamp_hash, stamped_by, stamped_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), claim, draft.id, null, '[]', '{}', '[]', 'd'.repeat(64), 'u-SALES', T0]), /issued deliverable of its own claim/, 'a draft took a stamp');

      ok(R.recordDeliverable(d, SALES, claim, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: '2026-09-01', content_hash: 'a'.repeat(64) }));
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 1, 'the defence pack, issued, is stamped like every kind');
      assert.throws(() => a.db.run("UPDATE claim_version_stamps SET engine_version = '9.9.9'"), /never changes/);
      assert.throws(() => a.db.run("UPDATE claim_version_stamps SET stamp_hash = ?", ['e'.repeat(64)]), /never changes/);
      assert.throws(() => a.db.run('DELETE FROM claim_version_stamps'), /never deleted/);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 1);
    } finally { a.close(); }
  });

  test('THE RULEBOOK VERSIONS ARE THE README’S FILENAMES: every row of 01-rulebooks/README.md, in order, with the version its filename carries, its board item and its Monday doc — and every file is on disk', () => {
    const readme = readFileSync(join(ROOT, '01-rulebooks', 'README.md'), 'utf8');
    const rows = [...readme.matchAll(/^\| `([^`]+\.md)` \| ([^|]+) \|/gm)].map((m) => ({ file: m[1] ?? '', cell: (m[2] ?? '').trim() }));
    assert.equal(rows.length, 11, 'the README no longer lists eleven rulebooks');
    assert.deepEqual(CS.RULEBOOK_MODULES.map((m) => m.file), rows.map((r) => r.file));
    for (const [i, r] of rows.entries()) {
      const m = CS.RULEBOOK_MODULES[i];
      assert.ok(m !== undefined);
      assert.equal(m.version, /-(v\d+)\.md$/.exec(r.file)?.[1], `${r.file}: the version is not the filename’s`);
      assert.equal(m.board_item, /^(\d+)/.exec(r.cell)?.[1], `${r.file}: the board item`);
      assert.equal(m.monday_doc, /Monday doc (\d+)/.exec(r.cell)?.[1] ?? null, `${r.file}: the Monday doc`);
      assert.ok(existsSync(join(ROOT, '01-rulebooks', r.file)), `${r.file} is not on disk`);
    }
  });

  test('EVERY BACK-END SWITCH IS STAMPED: each frozen `enabled:` switch exported anywhere in src/, found by grep, is one the stamp reads — and FEE_CONTROLS’s three by their own keys', () => {
    const src = join(BACKEND, 'src');
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
    const top = new Set<string>();
    const nested = new Set<string>();
    for (const f of files) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const m of text.matchAll(/export const ([A-Z][A-Z0-9_]*)\b[^=\n]*=\s*Object\.freeze\(\{\s*enabled:/g)) top.add(m[1] ?? '');
      for (const m of text.matchAll(/export const ([A-Z][A-Z0-9_]*)\b[^=\n]*=\s*Object\.freeze\(\{\s*\w+:\s*Object\.freeze\(\{\s*enabled:/g)) nested.add(m[1] ?? '');
    }
    assert.ok(top.has('DISCLOSURE_LOG') && top.has('DEFENCE_PACK_GENERATOR'), 'the grep found nothing — the test is not looking');
    assert.deepEqual([...nested], ['FEE_CONTROLS']);
    const readings = CS.backendSwitchReadings();
    const stampedTop = new Set(readings.map((r) => r.switch).filter((x) => !x.includes('.')));
    assert.deepEqual([...stampedTop].sort(), [...top].sort(), 'a switch in src/ is not stamped, or the stamp names one that is not there');
    const feeKeys = Object.keys(FEE_CONTROLS).filter((k) => typeof (FEE_CONTROLS as unknown as Record<string, { enabled?: unknown }>)[k]?.enabled === 'boolean');
    assert.deepEqual(readings.filter((r) => r.switch.startsWith('FEE_CONTROLS.')).map((r) => r.switch.slice('FEE_CONTROLS.'.length)).sort(), feeKeys.sort());
    // The funnel's switch is not an `enabled` flag, so the grep cannot find it: its booleans are counted instead.
    const funnelKeys = Object.keys(FUNNEL_SWITCHES).filter((k) => typeof (FUNNEL_SWITCHES as unknown as Record<string, unknown>)[k] === 'boolean');
    assert.ok(funnelKeys.length > 0);
    assert.deepEqual(readings.filter((r) => r.switch.startsWith('FUNNEL_SWITCHES.')).map((r) => r.switch.slice('FUNNEL_SWITCHES.'.length)).sort(), funnelKeys.sort());
    assert.equal(readings.length, top.size + feeKeys.length + funnelKeys.length);
  });
});

/* ================================================================== *
 * LINE 2 — THE DEFENCE PACK GENERATOR
 * ================================================================== */

const ON: DP.DefencePackSwitch = { ...DP.DEFENCE_PACK_GENERATOR, enabled: true };

function objFor(org: Org, claim: string): Obj {
  return { type: 'claim_figures', id: claim, business_id: org.business };
}

describe('line 2 — the defence pack generator — built, and switched off', () => {
  test('THE GENERATOR SHIPS OFF: a request is refused with nothing written — no manifest, no audit line, no deliverable and no stamp — and what it waits on is named', async () => {
    assert.equal(DP.DEFENCE_PACK_GENERATOR.enabled, false);
    assert.equal(DP.DEFENCE_PACK_GENERATOR.waits_on, 'the chartered tax adviser signing off the Defence Pack Template');
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      CF.signOffRow(a, org.business, org.assessment, claim);
      const before = count(a, 'SELECT COUNT(*) AS n FROM audit_log');
      const r = DP.generateDefencePack(CF.recordDeps(a), SALES, claim);
      assert.deepEqual(r, { ok: false, why: DP.DEFENCE_PACK_OFF });
      assert.deepEqual(DP.generateDefencePack(CF.recordDeps(a), ADMIN, claim, { ...ON, enabled: false }), r);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM audit_log'), before, 'an audit line was written while the generator is off');
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_deliverables'), 0);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 0);
    } finally { a.close(); }
  });

  test('THE GENERATOR SWITCHED ON: a manifest hashed with SHA-256 over the stamp and seven sections — INCOMPLETE, naming every missing section — and it issues nothing', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const r = DP.generateDefencePack(CF.recordDeps(a), SALES, claim, ON);
      assert.ok(r.ok);
      assert.equal(r.state, 'INCOMPLETE');
      assert.deepEqual([...r.missing], ['SURVEYOR_COMMITMENT', 'SOURCES', 'RECONCILIATION', 'SIGNOFF', 'S203_POSITION', 'ANCHOR_LOG', 'DELIVERABLE_HASHES']);
      assert.deepEqual(r.manifest.sections.map((x) => x.key), Object.keys(DP.DEFENCE_PACK_SECTIONS));
      assert.equal(r.manifest_hash, sha256(r.manifest), 'the manifest hash is not over the manifest');
      assert.match(r.manifest_hash, /^[0-9a-f]{64}$/);
      assert.equal(r.manifest.stamp.cta_switches.length, ctaSwitchReadings().length);
      assert.equal(r.issued, false);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_deliverables'), 0, 'the generator issued a deliverable');
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_version_stamps'), 0, 'the generator wrote a stamp');
      const line = a.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'DEFENCE_PACK_GENERATED'");
      assert.deepEqual(JSON.parse(line?.detail ?? '{}'), { state: 'INCOMPLETE', sections_missing: 7, manifest_hash: r.manifest_hash, business: org.business });
    } finally { a.close(); }
  });

  test('N4 — A SECTION WHOSE FACT IS RECORDED AS NOT KNOWN AND ONE NEVER RECORDED ARE IDENTICAL, AND BOTH LEAVE THE PACK INCOMPLETE; the known answer completes them', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      CF.fact(a, claim, 'ACCOUNTING_PERIOD_START', '2025-01-01');
      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', '2025-12-31');
      CF.fact(a, claim, 'GRANTS_EXIST', 'NO');
      const read = () => {
        const r = DP.generateDefencePack(CF.recordDeps(a), SALES, claim, ON);
        assert.ok(r.ok);
        return r;
      };
      const pick = (r: ReturnType<typeof read>, key: DP.SectionKey) => r.manifest.sections.find((x) => x.key === key);
      const neverRecorded = read();
      CF.fact(a, claim, 'ELECTION_EXISTS', null);
      const recordedUnknown = read();
      // Assert BOTH.
      for (const r of [neverRecorded, recordedUnknown]) {
        assert.equal(r.state, 'INCOMPLETE');
        assert.ok(r.missing.includes('S203_POSITION'));
        assert.ok(r.missing.includes('SOURCES'));
        assert.equal(pick(r, 'S203_POSITION')?.state, 'MISSING');
        assert.equal(pick(r, 'SOURCES')?.state, 'MISSING');
      }
      assert.deepEqual(pick(recordedUnknown, 'S203_POSITION'), pick(neverRecorded, 'S203_POSITION'), 'not known and never recorded read differently');
      assert.deepEqual(pick(recordedUnknown, 'SOURCES'), pick(neverRecorded, 'SOURCES'), 'not known and never recorded read differently');
      assert.deepEqual(recordedUnknown.manifest.sections, neverRecorded.manifest.sections);
      // The negative control: the known answer.
      CF.fact(a, claim, 'ELECTION_EXISTS', 'NO');
      const known = read();
      assert.equal(pick(known, 'S203_POSITION')?.state, 'PRESENT');
      assert.equal(pick(known, 'SOURCES')?.state, 'PRESENT');
      assert.equal(known.missing.includes('S203_POSITION'), false);
    } finally { a.close(); }
  });

  test('WITH EVERY SEALED RECORD PRESENT THE MANIFEST IS COMPLETE — commitment, sources, reconciliation, sign-off, s.203, anchor log and hashed deliverables — and still issues nothing', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'TAX_ADVISER_SIGNOFF');
      CF.commitmentOn(a, org.business, org.assessment, claim);
      ok(R.recordSignOff(CF.recordDeps(a), SALES, claim, {
        adviser: 'CAPREBATE_CTA', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
        method_note: 'reviewed against the rulebooks', figure: '2400000', confirmed_switches: '',
      }));
      for (const [key, value] of [['ACCOUNTING_PERIOD_START', '2025-01-01'], ['ACCOUNTING_PERIOD_END', '2025-12-31'], ['ELECTION_EXISTS', 'NO'], ['GRANTS_EXIST', 'NO']] as const) {
        CF.fact(a, claim, key, value);
      }
      const job = a.db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ?', [claim]);
      assert.ok(job !== undefined);
      a.db.run('INSERT INTO anchor_log (seq, kind, job_id, actor, at, detail_json, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?)',
        [1, 'SURVEYOR_COMMITTED', job.id, 'u-SURVEYING', T0, '{}', '0'.repeat(64), 'f'.repeat(64)]);
      CF.issue(a, claim, 'CLIENT_REPORT', 'c'.repeat(64));
      const deliverables = count(a, 'SELECT COUNT(*) AS n FROM claim_deliverables');
      const r = DP.generateDefencePack(CF.recordDeps(a), ADMIN, claim, ON);
      assert.ok(r.ok);
      assert.deepEqual([...r.missing], [], JSON.stringify(r.manifest.sections.filter((x) => x.state === 'MISSING')));
      assert.equal(r.state, 'COMPLETE');
      assert.equal(r.manifest.stamp.anchor_log_head_hash, 'f'.repeat(64));
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM claim_deliverables'), deliverables, 'a COMPLETE manifest issued a deliverable');
    } finally { a.close(); }
  });

  test('defence_pack.generate: registered, deny by default — ADMIN and SALES alone, refused for every other role and a disabled admin, on and off', async () => {
    assert.ok(REGISTERED_ACTIONS.includes('defence_pack.generate'));
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      for (const role of APP_ROLES) {
        const who = actor(role, `u-${role}`, role === 'CLIENT' ? org.business : null);
        assert.equal(can(who, 'defence_pack.generate', objFor(org, claim)), role === 'ADMIN' || role === 'SALES', role);
        if (role !== 'ADMIN' && role !== 'SALES') {
          for (const sw of [DP.DEFENCE_PACK_GENERATOR, ON]) assert.throws(() => DP.generateDefencePack(CF.recordDeps(a), who, claim, sw), NotAuthorised);
        }
      }
      assert.equal(can({ ...ADMIN, disabled: true }, 'defence_pack.generate', objFor(org, claim)), false);
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'DEFENCE_PACK_GENERATED'"), 0);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * LINE 5 — THE DELETION LOG AND RESTORATIONS
 * ================================================================== */

function logEntry(a: App, over: Record<string, string | number | null> = {}): string {
  const row: Record<string, string | number | null> = {
    deletion_ref: `DEL-${randomUUID()}`, record_kind: 'DOCUMENT_VERSIONS', record_id: randomUUID(), category: 'a client document',
    basis_rule: 'RET-7', basis_due_on: '2033-09-15', approved_by: 'the data protection officer', review_ref: 'REV-1',
    executed_by: 'u-ADMIN', executed_at: T0, stores_json: '["object store"]', backups_pending: 1, backup_cycle_days: null,
    backup_copies_expire_at: null, verified_by: null, verified_at: null, ...over,
  };
  a.db.run(
    'INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
      'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [row['deletion_ref'] ?? null, row['record_kind'] ?? null, row['record_id'] ?? null, row['category'] ?? null, row['basis_rule'] ?? null,
      row['basis_due_on'] ?? null, row['approved_by'] ?? null, row['review_ref'] ?? null, row['executed_by'] ?? null, row['executed_at'] ?? null,
      row['stores_json'] ?? null, row['backups_pending'] ?? null, row['backup_cycle_days'] ?? null, row['backup_copies_expire_at'] ?? null,
      row['verified_by'] ?? null, row['verified_at'] ?? null]);
  return String(row['deletion_ref']);
}

describe('line 5 — the deletion log carries the host’s backup cycle as a named blank, and nothing deleted comes back without approval', () => {
  test('THE DELETION LOG: backups pending with the cycle NOT SET is taken; an expiry with no cycle, and "no backups" with no cycle, are refused (N4); the only change is one verification; nothing is deleted', async () => {
    assert.equal(BACKUP_CYCLE.state, 'NOT_SET', 'read through the port');
    assert.equal(BACKUP_CYCLE.days, null);
    const a = await app();
    try {
      const ref = logEntry(a);
      assert.throws(() => logEntry(a, { backup_copies_expire_at: '2026-10-08T00:00:00.000Z' }), /CHECK/i, 'an expiry was computed from a cycle nobody stated');
      assert.throws(() => logEntry(a, { backups_pending: 0 }), /CHECK/i, 'a cycle not known was read as no backups');
      assert.throws(() => logEntry(a, { backups_pending: 0, backup_cycle_days: 30, backup_copies_expire_at: '2026-10-08T00:00:00.000Z' }), /CHECK/i);
      assert.throws(() => logEntry(a, { record_kind: 'Jane Smith' }), /CHECK/i, 'a record kind is a code, never a name');
      logEntry(a, { backup_cycle_days: 30, backup_copies_expire_at: '2026-10-08T00:00:00.000Z' });
      logEntry(a, { backups_pending: 0, backup_cycle_days: 0 });

      assert.throws(() => a.db.run("UPDATE deletion_log SET category = 'something else' WHERE deletion_ref = ?", [ref]), /only change/);
      assert.throws(() => a.db.run("UPDATE deletion_log SET backups_pending = 0, backup_cycle_days = 0 WHERE deletion_ref = ?", [ref]), /only change/);
      a.db.run('UPDATE deletion_log SET verified_by = ?, verified_at = ? WHERE deletion_ref = ?', ['u-ADMIN', '2026-09-09T00:00:00.000Z', ref]);
      assert.throws(() => a.db.run('UPDATE deletion_log SET verified_by = ?, verified_at = ? WHERE deletion_ref = ?', ['u-SALES', '2026-09-10T00:00:00.000Z', ref]), /only change/);
      assert.throws(() => a.db.run('DELETE FROM deletion_log WHERE deletion_ref = ?', [ref]), /never deleted/);

      const lines = S.retentionList({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, ADMIN, a.now());
      const log = lines.find((l) => l.kind === 'DELETION_LOG');
      assert.ok(log !== undefined, 'the deletion log is not on the retention list');
      assert.equal(log.ref, 'RET-3');
      assert.equal(log.records, 3);
      assert.deepEqual(log.due, []);
      assert.match(log.clock, /Six years from the day a deletion is done everywhere: checked as done, or the last backup copy has run out\./);
      assert.match(log.clock, /backup cycle is not set yet/);
      assert.match(log.delete, /The database blocks deleting these/);
      assert.notEqual(S.RETENTION_PARAMETERS['RET-3']?.state, 'APPROVED');
    } finally { a.close(); }
  });

  test('RESTORATIONS: refused for a reference the deletion log does not hold, and without who approved it and its reference; taken with both; never changed or deleted', async () => {
    const a = await app();
    try {
      const ref = logEntry(a);
      const restore = (deletion_ref: string, approved_by: string | null, approval_ref: string | null) => a.db.run(
        'INSERT INTO deletion_restorations (id, deletion_ref, approved_by, approval_ref, restored_by, restored_at) VALUES (?,?,?,?,?,?)',
        [randomUUID(), deletion_ref, approved_by, approval_ref, 'u-ADMIN', T0]);
      assert.throws(() => restore('DEL-NOT-LOGGED', 'the data protection officer', 'DPO-1'), /has no entry there/);
      assert.throws(() => restore(ref, null, 'DPO-1'), /NOT NULL/i);
      assert.throws(() => restore(ref, 'the data protection officer', null), /NOT NULL/i);
      assert.throws(() => restore(ref, 'the data protection officer', '  '), /CHECK/i);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM deletion_restorations'), 0);
      restore(ref, 'the data protection officer', 'DPO-1');
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM deletion_restorations'), 1);
      assert.throws(() => a.db.run("UPDATE deletion_restorations SET approval_ref = 'DPO-2'"), /never changes/);
      assert.throws(() => a.db.run('DELETE FROM deletion_restorations'), /never deleted/);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * LINE 6 — RET-7'S TWO DATES, READ FROM THE CLAIM
 * ================================================================== */

function documentOn(a: App, org: Org, claims: readonly string[]): string {
  const id = randomUUID();
  const seq = count(a, "SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = 'LEASE'", [org.business]) + 1;
  a.db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?,?,?,?,?,?)',
    [id, org.business, 'LEASE', seq, 'u-SALES', T0]);
  for (const claim of claims) {
    a.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?,?,?,NULL,?,?)',
      [randomUUID(), id, claim, 'u-SALES', T0]);
  }
  return id;
}

describe('line 6 — the raw-file record’s claim period end and report delivery date, read from the claim', () => {
  test('BOTH DATES READ FROM THE CLAIM: the accounting period end recorded as a fact, and the client report’s issue date — shown on the document versions’ line of the retention list, with still no date computed', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const doc = documentOn(a, org, [claim]);
      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', '2025-12-31');
      CF.signOffRow(a, org.business, org.assessment, claim);
      CF.issue(a, claim, 'CLIENT_REPORT');
      const limbs = D.ret7Limbs(a.db, doc);
      assert.equal(limbs.claim_period_end, '2025-12-31T00:00:00.000Z');
      assert.equal(limbs.report_delivered_at, '2026-09-01T00:00:00.000Z');

      const lines = S.retentionList({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, ADMIN, a.now());
      const versions = lines.find((l) => l.kind === 'DOCUMENT_VERSIONS');
      assert.equal(versions?.state, 'DERIVED_NOT_APPROVED');
      assert.deepEqual(versions?.due, []);
      const shown = versions?.limbs?.find((x) => x.logical_document_id === doc);
      assert.equal(shown?.claim_period_end, '2025-12-31T00:00:00.000Z');
      assert.equal(shown?.report_delivered_at, '2026-09-01T00:00:00.000Z');
      assert.equal(shown?.reading, 'claim period end: 2025-12-31 · report delivered: 2026-09-01');
      assert.doesNotMatch(versions?.clock ?? '', /not recorded/, 'the list still says the two dates are not recorded');

      // An unlinked document shows both, as not known.
      const loose = documentOn(a, org, []);
      assert.equal(lines.find((l) => l.kind === 'DOCUMENT_VERSIONS')?.limbs?.some((x) => x.logical_document_id === loose), false, 'read before it existed');
      const again = S.retentionList({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, ADMIN, a.now()).find((l) => l.kind === 'DOCUMENT_VERSIONS');
      assert.equal(again?.limbs?.find((x) => x.logical_document_id === loose)?.reading, 'claim period end: not known · report delivered: not known');
    } finally { a.close(); }
  });

  test('N4 — THE PERIOD END RECORDED AS NOT KNOWN AND NEVER RECORDED BOTH READ NULL, IDENTICALLY; A DRAFT REPORT AND NO REPORT BOTH READ NULL, IDENTICALLY; a document on no claim, or on two, reads null — and the known values fill each', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const doc = documentOn(a, org, [claim]);

      const nothing = D.ret7Limbs(a.db, doc);
      assert.equal(nothing.claim_period_end, null, 'never recorded');
      assert.equal(nothing.report_delivered_at, null, 'no report');

      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', null);
      const unknownEnd = D.ret7Limbs(a.db, doc);
      assert.equal(unknownEnd.claim_period_end, null, 'recorded as not known');
      assert.deepEqual(unknownEnd, nothing, 'not known and never recorded read differently');

      CF.signOffRow(a, org.business, org.assessment, claim);
      ok(R.recordDeliverable(CF.recordDeps(a), SALES, claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
      const draft = D.ret7Limbs(a.db, doc);
      assert.equal(draft.report_delivered_at, null, 'a draft report');
      assert.deepEqual(draft, nothing, 'a draft and no report read differently');

      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', '2026-03-31');
      assert.equal(D.ret7Limbs(a.db, doc).claim_period_end, '2026-03-31T00:00:00.000Z', 'the known value');
      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', null);
      assert.equal(D.ret7Limbs(a.db, doc).claim_period_end, null, 'the latest answer is the answer: a later “not known” is not overridden by an earlier date');
      ok(R.recordDeliverable(CF.recordDeps(a), SALES, claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-03' }));
      assert.equal(D.ret7Limbs(a.db, doc).report_delivered_at, '2026-09-03T00:00:00.000Z', 'the issued report');
      ok(R.recordDeliverable(CF.recordDeps(a), SALES, claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
      ok(R.recordDeliverable(CF.recordDeps(a), SALES, claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-05' }));
      assert.equal(D.ret7Limbs(a.db, doc).report_delivered_at, '2026-09-03T00:00:00.000Z', 'the EARLIEST delivery, superseded or not');

      const negOrg = organisation(a);
      const negClaim = claimAt(a, negOrg, 'REPORTS');
      const negDoc = documentOn(a, negOrg, [negClaim]);
      CF.issue(a, negClaim, 'REASONED_NEGATIVE');
      const negative = D.ret7Limbs(a.db, negDoc);
      assert.equal(negative.report_delivered_at, null, 'a reasoned negative is not the report');
      assert.match(negative.why, /a letter saying there is no claim/);

      const other = claimAt(a, org, 'REPORTS');
      const two = documentOn(a, org, [claim, other]);
      assert.deepEqual({ ...D.ret7Limbs(a.db, two), why: '' }, { claim_period_end: null, report_delivered_at: null, why: '' });
      assert.match(D.ret7Limbs(a.db, two).why, /linked to 2 claims/);
      assert.match(D.ret7Limbs(a.db, documentOn(a, org, [])).why, /linked to no claim/);
    } finally { a.close(); }
  });

  test('THE DATES FED TO THE INGESTION MODULE’S CLOCK: 31 March 2027 and 15 September 2027 give 15 September 2033 with RET-7 approved — the EARLIER of two clocks still governs — and as shipped, unapproved, nothing is computed', async () => {
    const a = await app();
    try {
      const org = organisation(a);
      const claim = claimAt(a, org, 'REPORTS');
      const doc = documentOn(a, org, [claim]);
      CF.fact(a, claim, 'ACCOUNTING_PERIOD_END', '2027-03-31');
      CF.signOffRow(a, org.business, org.assessment, claim);
      ok(R.recordDeliverable(CF.recordDeps(a), SALES, claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
      const later = { ...CF.recordDeps(a), now: () => '2027-09-20T12:00:00.000Z' };
      ok(R.recordDeliverable(later, SALES, claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2027-09-15' }));
      const limbs = D.ret7Limbs(a.db, doc);
      assert.equal(limbs.claim_period_end, '2027-03-31T00:00:00.000Z');
      assert.equal(limbs.report_delivered_at, '2027-09-15T00:00:00.000Z');

      const rec: RawFileRecord = {
        doc_id: doc, doc_type: 'LEASE', received_at: '2026-09-01T09:00:00.000Z',
        ...(limbs.claim_period_end === null ? {} : { claim_period_end: limbs.claim_period_end }),
        ...(limbs.report_delivered_at === null ? {} : { report_delivered_at: limbs.report_delivered_at }),
      };
      const approved: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true };
      assert.equal(deletionDueAt(rec, approved), '2033-09-15T00:00:00.000Z', 'six years from the later of the two dates');
      assert.equal(deletionDueAt({ ...rec, defence_period_ends_at: '2030-01-31T00:00:00.000Z' }, approved), '2030-01-31T00:00:00.000Z', 'an earlier defence-pack clock governs');
      assert.equal(deletionDueAt({ ...rec, defence_period_ends_at: '2040-01-31T00:00:00.000Z' }, approved), '2033-09-15T00:00:00.000Z', 'a later one does not extend RET-7');

      assert.equal(RET7.approved, false);
      assert.equal(deletionDueAt(rec, { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' }), null, 'unapproved, the dates compute nothing');
      assert.equal(D.retentionReading('RET-7').computes_a_date, false);
    } finally { a.close(); }
  });
});
