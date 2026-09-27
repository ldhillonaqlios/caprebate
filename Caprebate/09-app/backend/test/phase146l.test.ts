/**
 * PHASE 146l, 27 September 2026 — THE LAND REGISTRY OFFICIAL COPY CAN BE UPLOADED.
 *
 * Lakhbir: the title register is done by hand, not by the API; "i still need the certificate and information ... human
 * will get the information and type and/or upload it" — the certificate being the paperwork, the official copy of the
 * register and the title plan. Phase 146k built the typing. This holds the upload:
 *   · one new document type, TITLE_REGISTER, bound to its own receipt policy, RET-7, carrying a value, so the claim
 *     team reads it and a surveyor never does;
 *   · it is READ BY A PERSON: even with the document reader switched on and a key in hand, nothing is sent anywhere;
 *   · the property page's title block lists the copies uploaded and offers the upload beside the typing.
 * No key, no network; every document invented.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { createApp } from '../src/server.ts';
import { docxOf } from './document-fixtures.ts';
import { secretsFromValues, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { fixtureTransport, RateLimiter } from '../src/connectors/http.ts';
import { acceptClientBytes, finishUpload, issuedJob, type UploadDeps } from '../src/web/uploads.ts';
import * as D from '../src/web/documents.ts';
import * as TH from '../src/web/title-by-hand.ts';
import { HUMAN_READ_ONLY_TYPES } from '../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
import { receiptPolicyFor } from '../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
import { actor } from './helpers.ts';
import { can } from '../src/authz.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const T = '2026-09-27T09:00:00.000Z';
afterEach(() => forgetRegisteredSecretsForTest());

async function boot() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-146l-')) });
  const db = made.app.db;
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  db.run("INSERT INTO properties (id, business_id, label, postcode, created_at, jurisdiction) VALUES ('p1', 'bz', 'Main site', 'ZZ1 1ZZ', ?, 'england')", [T]);
  for (const [id, role, biz] of [['u-ADMIN', 'ADMIN', null], ['u-SURVEYING', 'SURVEYING', null], ['u-CLIENT', 'CLIENT', 'bz']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.test`, `${id}@example.test`, id, role, 'x', T, T, biz]);
  }
  return made;
}
const admin = () => actor('ADMIN', 'u-ADMIN');

describe('the official copy of the title register, uploaded by hand and read by a person', () => {
  test('L1 — ONE NEW TYPE, BOUND TO ITS OWN POLICY, CARRYING A VALUE: the claim team reads it and the surveyor never does', async () => {
    const made = await boot();
    const t = made.app.db.get<{ handler_type: string; readers: string; carries_value: number; retention_ref: string; source: string; active: number }>(
      "SELECT handler_type, readers, carries_value, retention_ref, source, active FROM document_types WHERE code = 'TITLE_REGISTER'");
    assert.deepEqual({ ...t }, { handler_type: 'TITLE_REGISTER', readers: 'CLAIM_TEAM', carries_value: 1, retention_ref: 'RET-7', source: 'EXTRACTION_SPECS', active: 1 });
    assert.ok(D.receivableTypes(made.app.db).some((x) => x.code === 'TITLE_REGISTER'), 'it cannot be uploaded');
    assert.equal(HUMAN_READ_ONLY_TYPES.includes('TITLE_REGISTER'), true);
    assert.equal(receiptPolicyFor('TITLE_REGISTER').mode, 'WHOLE_DOCUMENT_PENDING_HUMAN_READ');
    const probe = { type: 'document' as const, id: 'd', business_id: 'bz', readers: 'CLAIM_TEAM', carries_value: true, letter_signed: true, assigned_surveyor_ids: ['u-SURVEYING'] };
    assert.equal(can(actor('SURVEYING', 'u-SURVEYING'), 'document.read', probe), false, 'a surveyor can read an official copy');
    assert.equal(can(admin(), 'document.read', probe), true);
    made.close();
  });

  test('L2 — READ BY A PERSON: with the reader switched on and a key in hand, uploading one sends nothing anywhere', async () => {
    const made = await boot();
    const t = fixtureTransport({});
    const deps: UploadDeps = {
      db: made.app.db, store: made.store, now: made.app.now, actor: 'u-ADMIN', audit: made.app.audit, newId: randomUUID,
      reading: {
        transport: t, secrets: secretsFromValues({ ANTHROPIC_API_KEY: 'sk-ant-fixture-key-146l-0000-1111' }),
        switches: { DOCUMENT_READING: true, SCANNED_PAGES: true }, limiter: new RateLimiter(), sleep: async () => {},
        policy_override: { international_transfer_approved: true }, actor_role: 'ADMIN',
        gate: { free_gate_open: false, engagement_signed: true, switched_on: true },
      },
    };
    const started = await D.startDocumentUpload({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID, store: made.store }, admin(),
      { business_id: 'bz', type_code: 'TITLE_REGISTER', logical_document_id: null, request_id: null, claim_id: null });
    assert.equal(started.ok, true, started.ok ? '' : started.why);
    if (!started.ok) return;
    const token = new URL(started.url, 'http://x').searchParams.get('token') ?? '';
    const job = issuedJob(made.app.db, started.doc_id);
    const bytes = new Uint8Array(docxOf(['OFFICIAL COPY OF REGISTER OF TITLE', 'Title number ZZ123456', 'A: Property Register', 'B: Proprietorship Register',
      'PROPRIETOR: EXAMPLE PROPERTIES LIMITED (Co. Regn. No. 01234567)', 'The price stated to have been paid was £450,000.']));
    const w = await acceptClientBytes(deps, { doc_id: started.doc_id, token, bytes });
    assert.equal(w.ok, true);
    const done = await finishUpload(deps, job as NonNullable<typeof job>, w.ok ? w.written_at : T);
    assert.equal(done.error, undefined, 'the upload failed');
    assert.equal(done.discharged, true, 'the quarantined original was not discharged');
    assert.equal(done.reading?.state, 'HUMAN_ONLY');
    assert.match(done.reading?.why ?? '', /read by a person, never by a model/);
    assert.equal(t.seen.length, 0, 'an official copy was sent to the document reader');
    made.close();
  });

  test('L3 — THE PROPERTY PAGE LISTS THE COPIES AND OFFERS THE UPLOAD BESIDE THE TYPING, and the surveyor sees neither', async () => {
    const made = await boot();
    const db = made.app.db;
    db.run("INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES ('ld1', 'bz', 'TITLE_REGISTER', 1, 'u-ADMIN', ?)", [T]);
    const v = TH.titleByHandView(db, admin(), 'p1');
    assert.deepEqual(v?.copies.map((c) => [c.id, c.label]), [['ld1', 'Official copy 1']]);
    assert.equal(v?.may_upload, true);
    assert.equal(TH.titleByHandView(db, actor('SURVEYING', 'u-SURVEYING'), 'p1'), null);
    const pages = readFileSync(join(SRC, 'web', 'crm-pages.ts'), 'utf8');
    const block = pages.slice(pages.indexOf('function titleBlock('), pages.indexOf('function propertyPage('));
    assert.match(block, /<input type="hidden" name="type_code" value="\$\{TH\.OFFICIAL_COPY_TYPE\}">/);
    assert.match(block, /action="\/staff\/clients\/\$\{t\.business_id\}\/files" enctype="multipart\/form-data"/);
    assert.equal(TH.OFFICIAL_COPY_TYPE, 'TITLE_REGISTER');
    made.close();
  });
});
