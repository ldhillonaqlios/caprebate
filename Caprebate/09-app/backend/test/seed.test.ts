/**
 * The seed, the name exclusion register (N2), and the two gates.
 *
 * A developer reads the seed as the schema, so what it demonstrates has to be
 * what the real ingestion would accept — and what it must never demonstrate is
 * a personal name.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/seed.ts';
import { ingestRegisterRecord, planResearch, gateStatus } from '../src/stubs/registers.ts';
import { NameExclusionError, assertNoUnauthorisedName } from '../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUBS } from '../src/app.ts';
import { APP_ROLES } from '../src/roles.ts';
import { testApp, scalars } from './helpers.ts';
import { newId } from '../src/users.ts';

describe('the seed', () => {
  test('covers all five sectors, at different stages', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const sectors = app.db.all<{ sector: string }>('SELECT DISTINCT sector FROM businesses ORDER BY sector')
      .map((r) => r.sector);
    assert.deepEqual(sectors, ['care_homes', 'dental', 'gp', 'private_hospital', 'supported_living']);
    const stages = app.db.all<{ stage: string }>('SELECT DISTINCT stage FROM businesses').length;
    assert.ok(stages >= 5, `only ${stages} distinct stages — a pipeline seeded at one stage tests nothing`);
    app.close();
  });

  test('has one user per role, and all five roles are covered', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    // Phase 132e: READ_ONLY is assigned to nobody, so the seed writes no user for it.
    assert.deepEqual([...r.users.map((u) => u.role)].sort(), [...APP_ROLES].filter((x) => x !== 'READ_ONLY').sort());
    assert.equal(r.users.some((u) => u.role === 'READ_ONLY'), false, 'the seed gave somebody the view-only role');
    app.close();
  });

  test('the CLIENT belongs to exactly one business, and the schema refuses anything else', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const c = app.db.get<{ business_id: string | null }>("SELECT business_id FROM users WHERE role = 'CLIENT'");
    assert.ok(c?.business_id, 'the seeded client has no business');
    // a CLIENT with no business is refused by the database, not just by code
    assert.throws(() => app.db.run(
      'INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, created_at, updated_at, business_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
      [newId(), 'c2@example.invalid', 'c2@example.invalid', 'C2', 'CLIENT', 'x', 'T', 'T'],
    ));
    // and a STAFF user WITH a business is refused too
    assert.throws(() => app.db.run(
      'INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, created_at, updated_at, business_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newId(), 's2@example.invalid', 's2@example.invalid', 'S2', 'SALES', 'x', 'T', 'T', c.business_id],
    ));
    app.close();
  });

  test('shows all three answer states — a seed that only shows ANSWERED teaches the wrong schema', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const states = app.db.all<{ state: string }>('SELECT DISTINCT state FROM assessment_answers ORDER BY state')
      .map((r) => r.state);
    assert.deepEqual(states, ['ANSWERED', 'DONT_KNOW', 'SKIPPED']);
    app.close();
  });

  test('N4 in the database: DONT_KNOW and SKIPPED cannot carry a value, ANSWERED must', async () => {
    const app = await testApp();
    const a = app.db.get<{ id: string }>('SELECT id FROM assessments LIMIT 1');
    await seed(app.db, app.hasher, app.now);
    const one = a ?? app.db.get<{ id: string }>('SELECT id FROM assessments LIMIT 1');
    assert.ok(one);
    assert.throws(() => app.db.run(
      'INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId(), one.id, 900, 'QX', 'q', 'DONT_KNOW', '0'],
    ), 'a "don\'t know" was allowed to carry a value — that is how an unknown becomes a zero');
    assert.throws(() => app.db.run(
      'INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId(), one.id, 901, 'QY', 'q', 'ANSWERED', null],
    ));
    app.close();
  });

  test('CONTAINS NO PERSONAL NAMES AT ALL — not even invented ones', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);

    // Every free-text value in every seeded domain table.
    const tables = ['businesses', 'properties', 'register_records', 'invoices', 'assessment_answers'];
    const values: string[] = [];
    for (const t of tables) {
      // The table list is a literal array in this file, never caller input.
      const rows =
        t === 'businesses' ? app.db.all('SELECT * FROM businesses')
        : t === 'properties' ? app.db.all('SELECT * FROM properties')
        : t === 'register_records' ? app.db.all('SELECT * FROM register_records')
        : t === 'invoices' ? app.db.all('SELECT * FROM invoices')
        : app.db.all('SELECT * FROM assessment_answers');
      for (const v of scalars(rows)) if (typeof v === 'string') values.push(v);
    }

    // A personal-name field would look like a title followed by two capitalised
    // words, or a "manager"/"proprietor"/"director" label with a name beside it.
    for (const v of values) {
      assert.equal(/\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+/.test(v), false, `looks like a personal name: ${v}`);
      assert.equal(/registered_manager|proprietor_name_personal|psc_name|nominated_individual/.test(v), false,
        `a personal-name FIELD appears in the seed: ${v}`);
    }

    // Users are named for their role, not for a person.
    const names = app.db.all<{ display_name: string }>('SELECT display_name FROM users').map((r) => r.display_name);
    for (const n of names) {
      assert.match(n, /^(Admin|Sales|Accounting|Surveying|Client) User$/, `user display name is a person: ${n}`);
    }
    app.close();
  });

  test('every seeded property uses a postcode reserved for fiction', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    for (const r of app.db.all<{ postcode: string | null }>('SELECT postcode FROM properties')) {
      assert.match(r.postcode ?? '', /^ZZ/, `${String(r.postcode)} is not in the reserved range`);
    }
    app.close();
  });
});

describe('N2 — the name exclusion register is WIRED IN, not restated', () => {
  test('the seed writes register data through the real assertion', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    assert.ok(app.db.all('SELECT id FROM register_records').length >= 3);
    app.close();
  });

  test('a personal-name field is REFUSED at the ingestion boundary', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const biz = r.businesses[0];
    assert.ok(biz);
    assert.throws(
      () => ingestRegisterRecord(app.db, newId, app.now, biz.id, {
        sourceId: 'CQC', entityId: 'X',
        fields: { registered_manager_name: 'Someone Invented' },
      }),
      NameExclusionError,
    );
    // and nothing was written
    assert.equal(app.db.all('SELECT id FROM register_records WHERE entity_id = ?', ['X']).length, 0);
    app.close();
  });

  test('an UNCATALOGUED field is refused, never assumed safe', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const biz = r.businesses[0];
    assert.ok(biz);
    assert.throws(
      () => ingestRegisterRecord(app.db, newId, app.now, biz.id, {
        sourceId: 'CQC', entityId: 'Y', fields: { something_nobody_registered: 1 },
      }),
      NameExclusionError,
    );
    app.close();
  });

  /* PHASE 132, 14 SEPTEMBER 2026. THE ASSERTION RUN AGAIN ON WHAT WAS STORED.
     The test above proves the seed goes through `ingestRegisterRecord`; this one
     proves what came out the other side still passes the rule, read back from the
     database rather than from the seed's own arguments. A row written by some other
     path, or a field the store added, would fail here and nowhere else. */
  test('every seeded register record passes assertNoUnauthorisedName again, read back from storage', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const rows = app.db.all<{ source_id: string; entity_id: string; fields_json: string }>(
      'SELECT source_id, entity_id, fields_json FROM register_records');
    assert.ok(rows.length >= 3, 'no register records were seeded, so nothing was checked');
    for (const r of rows) {
      const fields = JSON.parse(r.fields_json) as Record<string, unknown>;
      assert.doesNotThrow(() => assertNoUnauthorisedName({ sourceId: r.source_id, entityId: r.entity_id, fields }),
        `${r.source_id} ${r.entity_id} fails the name exclusion rule as stored`);
    }
    app.close();
  });

  /* AND THERE IS ONE DOOR. If a second file could write register_records, the
     assertion in registers.ts would guard one path and not the other. */
  test('src/stubs/registers.ts is the only file under src containing INSERT INTO register_records', () => {
    // fileURLToPath, not `.pathname`: this tree's path has spaces, and `.pathname` keeps them as %20.
    const SRC = fileURLToPath(new URL('../src/', import.meta.url));
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.ts')) continue; // .bak-phase* copies are not source
        if (/INSERT\s+INTO\s+register_records/i.test(readFileSync(p, 'utf8'))) hits.push(p.slice(SRC.length));
      }
    };
    walk(SRC);
    assert.deepEqual(hits, ['stubs/registers.ts']);
  });

  test('an unknown SOURCE fails closed', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const biz = r.businesses[0];
    assert.ok(biz);
    assert.throws(
      () => ingestRegisterRecord(app.db, newId, app.now, biz.id, {
        sourceId: 'NOT_A_REGISTER', entityId: 'Z', fields: { a: 1 },
      }),
      NameExclusionError,
    );
    app.close();
  });
});

describe('the two gates are real, and shut', () => {
  const shutRegistry = { precondition: { enabled: false, requires: 'a published privacy notice' } };

  test('the free gate reports itself shut, and reports WHY', () => {
    const g = gateStatus(shutRegistry);
    assert.equal(g.free_enabled, false);
    assert.match(g.free_requires, /privacy notice/);
  });

  test('nothing fires while the free gate is shut — and nothing throws either', () => {
    const plan = planResearch(
      [{ source_id: 'CQC', tier: 'FREE', state: 'NOT_RUN' }], gateStatus(shutRegistry), false,
    );
    assert.equal(plan[0]?.next_state, 'NOT_PERMITTED_YET');
  });

  test('a paid source stays shut without a signed engagement, and opens with one', () => {
    const open = { precondition: { enabled: true, requires: '' } };
    const unsigned = planResearch([{ source_id: 'VOA', tier: 'PAID', state: 'NOT_RUN' }], gateStatus(open), false);
    assert.equal(unsigned[0]?.next_state, 'NOT_PERMITTED_YET');
    const signed = planResearch([{ source_id: 'VOA', tier: 'PAID', state: 'NOT_RUN' }], gateStatus(open), true);
    // permitted — and STILL not fired, because the connector does not exist
    assert.equal(signed[0]?.next_state, 'NOT_RUN');
    assert.match(signed[0]?.reason ?? '', /connector is not built/);
  });

  test('the seed records both gates honestly rather than pretending they ran', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const states = app.db.all<{ state: string }>('SELECT DISTINCT state FROM research_sources').map((r) => r.state);
    assert.deepEqual(states, ['NOT_PERMITTED_YET']);
    app.close();
  });
});

describe('what is stubbed is a short list, and it is stated', () => {
  /* FOUR, NOT THREE, SINCE 9 SEPTEMBER 2026 (Phase 108). The fourth —
     text extraction — declared itself a stub in its own file and appeared in
     no list, which is the failure this assertion exists to catch. */
  /* PHASE 146g, 23 September 2026: FIVE. `document-reading` was added because Phase 146e built the real reader for a
     client document and left it with no caller in src/ at all — the upload flow ended at DISCHARGED and never ran
     steps 8, 9 or 10 of the receipt contract — so a developer watching an upload finish could reasonably have
     concluded that uploads were read. They are not. The count is asserted so that a row cannot be quietly dropped:
     a list that got shorter without anything being built is the failure this list exists to prevent. */
  test('exactly five stubs, each one named module behind an interface', () => {
    assert.deepEqual(STUBS.map((s) => s.id).sort(),
      ['document-reading', 'email', 'registers', 'signature', 'text-extraction']);
  });

  /* Every entry names a module that is on disk. A stub list pointing at a file
     that has moved is worse than no list, because it reads as checked. */
  test('every stub names a module that exists', async () => {
    const { readFileSync } = await import('node:fs');
    for (const s of STUBS) {
      const p = new URL('../' + s.module, import.meta.url);
      assert.ok(readFileSync(p, 'utf8').length > 0, s.module);
    }
  });

  /* THE NEGATIVE CONTROL FOR THE WHOLE LIST. src/web/uploads.ts calls itself a
     stub in prose; that prose and this list must not be able to disagree
     again. */
  test('the module that calls itself a stub in prose is in the list', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/web/uploads.ts', import.meta.url), 'utf8');
    assert.match(src, /it is a STUB, declared as one/);
    assert.ok(STUBS.some((s) => s.module === 'src/web/uploads.ts'));
  });
});
