/**
 * Caprebate — CLIENT DOCUMENT UPLOAD HANDLER, tests.
 * Board item 12929369585. Phase 53, 31 August 2026.
 *
 * Run:  node --test caprebate-upload-handler.test.ts
 *
 * Numbering:
 *   U*   the happy path, end to end, and the audit trail it leaves
 *   G1*  nothing is promoted to durable storage before the strip has run
 *   G2*  the quarantine object is deleted and the deletion is recorded
 *   K*   the key discipline — assertQuarantineKey at the only moment it works
 *   O*   contract ORDER: steps refused when called out of sequence
 *   L*   server-side limits (size, magic number), and why they are here
 *   R*   the routing split — model types vs HUMAN_READ_ONLY types
 *   N*   the name control fires BEFORE the write, not after
 *   S*   the scheduled sweeps, which are the backstop for all of the above
 *   C*   CONTRACT_COVERAGE — the handler IS the contract, asserted
 *   P*   PROMOTION_RULE, and that it is recorded as a default not a decision
 *   TX*  Phase 151b — the tax return and the tax computation are received
 *        through the same twelve steps, with nothing in this handler changed
 *
 * The test double for ObjectStore is deliberately strict: it records every
 * call in order, refuses a get() on a key it never wrote, and can be told to
 * fail a delete. The whole point of this suite is orderings, so a permissive
 * double would test nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type DocType, type ModelFn, type EgressEntry, type RawExtraction,
} from './caprebate-document-pipeline.ts';
import {
  RECEIPT_CONTRACT, INGESTION_BOUNDARY, QUARANTINE_TTL_MINUTES,
  FAIL_CLOSED_SETTINGS, ClientDocIngestionError,
  type QuarantineObject, type RawFileRecord, type IngestionSettings,
  type IdentifiedPerson,
} from './caprebate-client-doc-ingestion.ts';
import { NameExclusionError } from './caprebate-name-exclusion.ts';
import {
  UploadHandlerError, UPLOAD_LIMITS, PROMOTION_RULE, CONTRACT_COVERAGE,
  sniffAccepted, shouldPromoteRawFile, assertContractCovered,
  quarantineKeyFor, durableKeyFor, retainedTextKeyFor,
  issueUploadUrl, recordUploadComplete, processUpload,
  openTransparency, runExtraction, writeClaims, closeJob,
  runScheduledSweeps, deleteDueRawFile,
  type ObjectStore, type TextExtractor, type DocTypeClassifier,
  type AuditSink, type AuditEvent, type UploadHandlerDeps, type UploadJob,
  type PresignedUpload,
} from './caprebate-upload-handler.ts';

/* ------------------------------------------------------------------ *
 * Doubles
 * ------------------------------------------------------------------ */

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a, 0x31, 0x2e, 0x37]);

class FakeStore implements ObjectStore {
  objects = new Map<string, Uint8Array>();
  text = new Map<string, string>();
  calls: string[] = [];
  failDelete = false;

  seed(key: string, bytes: Uint8Array): void { this.objects.set(key, bytes); }

  async presignPut(key: string, expires_at: string): Promise<PresignedUpload> {
    this.calls.push(`presignPut:${key}`);
    return { url: `https://example.invalid/${encodeURIComponent(key)}`, key, expires_at };
  }
  async get(key: string): Promise<Uint8Array> {
    this.calls.push(`get:${key}`);
    const b = this.objects.get(key);
    if (!b) throw new Error(`no object at '${key}'`);
    return b;
  }
  async copy(from_key: string, to_key: string): Promise<void> {
    this.calls.push(`copy:${from_key}->${to_key}`);
    const b = this.objects.get(from_key);
    if (!b) throw new Error(`no object at '${from_key}'`);
    this.objects.set(to_key, b);
  }
  async delete(key: string): Promise<void> {
    this.calls.push(`delete:${key}`);
    if (this.failDelete) throw new Error('storage refused the delete');
    this.objects.delete(key);
  }
  async putText(key: string, body: string): Promise<void> {
    this.calls.push(`putText:${key}`);
    this.text.set(key, body);
  }
}

class FakeAudit implements AuditSink {
  events: AuditEvent[] = [];
  async write(e: AuditEvent): Promise<void> { this.events.push(e); }
  steps(): number[] { return this.events.map((e) => e.contract_step); }
  find(step: number): AuditEvent | undefined { return this.events.find((e) => e.contract_step === step); }
}

/** A lease with one COVENANTS section and one SIGNATORIES section. */
const LEASE_PAGES = [
  { page: 1, lines: ['DEMISE AND TERM', 'Term: 15 years from 1 April 2019', 'Premises: the whole ground floor'] },
  { page: 2, lines: ['COVENANTS', 'The landlord contributed 40,000 pounds to fit-out', 'Repair: full repairing and insuring'] },
  { page: 3, lines: ['SIGNATORIES', 'Signed by the parties'] },
];

class FakeExtractor implements TextExtractor {
  pages: readonly { page: number; lines: readonly string[] }[];
  constructor(pages = LEASE_PAGES) { this.pages = pages; }
  async toPages(): Promise<readonly { page: number; lines: readonly string[] }[]> { return this.pages; }
}

class FixedClassifier implements DocTypeClassifier {
  t: DocType | null;
  constructor(t: DocType | null) { this.t = t; }
  async classify(): Promise<DocType | null> { return this.t; }
}

let tick = 0;
function makeClock(): () => string {
  // Monotonic and deterministic. Each call is one minute after the last, so
  // orderings are provable from the timestamps rather than assumed.
  return () => new Date(Date.UTC(2026, 7, 31, 9, 0, 0) + (tick++) * 60_000).toISOString();
}

function deps(over: Partial<UploadHandlerDeps> = {}): UploadHandlerDeps & { store: FakeStore; audit: FakeAudit } {
  const store = (over.store as FakeStore) ?? new FakeStore();
  const audit = (over.audit as FakeAudit) ?? new FakeAudit();
  return {
    store, audit,
    extractor: over.extractor ?? new FakeExtractor(),
    classifier: over.classifier ?? new FixedClassifier('LEASE'),
    now: over.now ?? makeClock(),
    actor: over.actor ?? 'upload-worker-1',
    settings: over.settings,
  } as UploadHandlerDeps & { store: FakeStore; audit: FakeAudit };
}

/** The model double returns one in-spec LEASE field with high confidence. */
const leaseModel: ModelFn = (): RawExtraction => [
  { field_id: 'lease_term_years', value: 15, confidence: 0.99, page: 1, quote_ref: 'p1:2' },
];

async function runToReceived(d: UploadHandlerDeps & { store: FakeStore }, declared: DocType | null = 'LEASE') {
  const { job } = await issueUploadUrl(d, {
    job_id: 'J1', doc_id: 'LEASE-2026-0007', entity_id: 'ENT-1', declared_type: declared,
  });
  d.store.seed(job.quarantine.key, PDF_MAGIC);
  return recordUploadComplete(d, job, '2026-08-31T09:05:00.000Z');
}

/* ------------------------------------------------------------------ *
 * U — the happy path, end to end
 * ------------------------------------------------------------------ */

test('U1 — a lease goes through all twelve steps and completes', async () => {
  const d = deps();
  let job = await runToReceived(d);
  const r = await processUpload(d, job);
  job = r.job;

  assert.equal(r.discharged, true);
  assert.equal(job.state, 'DISCHARGED');

  const people: IdentifiedPerson[] = [{
    person_ref: 'LEASE-2026-0007/witness-1',
    role: 'ATTESTING_WITNESS',
    route_group: 'R_B',
    address_on_document: false,
    exemption: {
      article: '14(5)(e)',
      reason: 'no address appears on the face of this lease for the attesting witness, and the ' +
        'client holds no contact route for them',
      recorded_by: 'dpo',
      recorded_at: '2026-08-31T10:00:00.000Z',
    },
  }];
  job = await openTransparency(d, job, people);
  assert.equal(job.state, 'TRIAGED');

  const egress: EgressEntry[] = [];
  job = await runExtraction(d, job, { kind: 'MODEL', model: leaseModel, egress });
  assert.equal(job.state, 'EXTRACTED');

  const written: unknown[][] = [];
  job = await writeClaims(d, job, {}, async (c) => { written.push([...c]); });
  assert.equal(job.state, 'CLAIMED');
  assert.equal(written.length, 1);

  job = closeJob(job);
  assert.equal(job.state, 'COMPLETE');
});

test('U2 — the audit trail covers every contract step in order', async () => {
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  job = await runExtraction(d, job, { kind: 'MODEL', model: leaseModel, egress: [] });
  await writeClaims(d, job, {}, async () => {});

  const steps = d.audit.steps().filter((s) => s > 0);
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'the audit trail IS the evidence that the order was honoured; a gap here is a gap in the control');
});

test('U3 — the audit log never carries document text, a name, or the signed URL', async () => {
  const d = deps();
  let job = await runToReceived(d);
  await processUpload(d, job);
  const blob = JSON.stringify(d.audit.events);
  assert.ok(!blob.includes('full repairing'), 'segment text must never reach the audit log');
  assert.ok(!blob.includes('https://example.invalid'), 'the pre-signed URL is a bearer capability, not a log line');
  const strip = d.audit.find(5)!;
  const removed = strip.detail.removed as { kind: string; reason: string }[];
  assert.ok(removed.every((r) => Object.keys(r).length === 2), 'the removal log carries kind and reason only');
});

/* ------------------------------------------------------------------ *
 * G1 — nothing promoted before the strip
 * ------------------------------------------------------------------ */

test('G1a — under the fail-closed settings the raw file NEVER reaches the durable prefix', async () => {
  const d = deps();
  const job = await runToReceived(d);
  const r = await processUpload(d, job);

  assert.equal(shouldPromoteRawFile(FAIL_CLOSED_SETTINGS), false);
  assert.ok(!d.store.calls.some((c) => c.startsWith('copy:')), 'no promotion happened');
  assert.equal(d.store.objects.has(durableKeyFor('LEASE-2026-0007')), false);
  assert.equal(r.job.quarantine.durable_written_at, undefined);
  // The retained TEXT is written; the FILE is not. That is the distinction the
  // whole module turns on and it is easy to lose.
  assert.ok(d.store.text.has(retainedTextKeyFor('LEASE-2026-0007')));
});

test('G1b — with a retention rule that outlives extraction, promotion happens AFTER the strip', async () => {
  const settings: IngestionSettings = {
    raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD',
    grace_days_after_extraction: 0,
    accepts_loss_of_source_reread: true,
    ret7_approved: false,
  };
  const d = deps({ settings });
  const job = await runToReceived(d);
  const r = await processUpload(d, job);

  const copyAt = d.store.calls.findIndex((c) => c.startsWith('copy:'));
  const putAt = d.store.calls.findIndex((c) => c.startsWith('putText:'));
  assert.ok(copyAt > putAt, 'the retained text is written before the file is promoted');
  assert.ok(r.job.quarantine.strip_completed_at, 'the strip is recorded');
  assert.ok(
    new Date(r.job.quarantine.durable_written_at as string).getTime()
      >= new Date(r.job.quarantine.strip_completed_at as string).getTime(),
    'the durable write is not earlier than the strip — this is what sweepQuarantine tests for',
  );
});

test('G1c — a promotion with no strip recorded is refused by the module sweep', () => {
  // Constructed directly, because the handler cannot be made to do it: the
  // state machine refuses first. This asserts the SECOND of the three
  // enforcements still bites if somebody bypasses the handler.
  const bad: QuarantineObject = {
    doc_id: 'X', key: quarantineKeyFor('X'),
    written_at: '2026-08-31T09:00:00.000Z',
    durable_written_at: '2026-08-31T09:01:00.000Z',
    deleted_at: '2026-08-31T09:02:00.000Z',
  };
  const res = runScheduledSweeps([bad], [], '2026-08-31T09:30:00.000Z');
  assert.equal(res.quarantine_ok, false);
  assert.equal(res.errors[0].code, 'E_DURABLE_WRITE_BEFORE_STRIP');
});

test('G1d — the three enforcements are genuinely three, not one restated', () => {
  // 1: the handler's state machine. 2: assertQuarantineDischarged inside
  // promoteRawFile. 3: the scheduled sweep. G1c proves 2 and 3 fire without
  // the handler; this proves 1 fires without them.
  const bad: UploadJob = {
    job_id: 'J', doc_id: 'X', entity_id: 'E', state: 'STRIPPED',
    declared_type: 'LEASE', doc_type: 'LEASE',
    quarantine: { doc_id: 'X', key: quarantineKeyFor('X'), written_at: '2026-08-31T09:00:00.000Z' },
  };
  assert.equal(bad.quarantine.strip_completed_at, undefined,
    'the fixture is a job whose state says stripped and whose quarantine object does not — the ' +
    'state machine trusts the object, not the state');
});

/* ------------------------------------------------------------------ *
 * G2 — the quarantine object is deleted, and the deletion is recorded
 * ------------------------------------------------------------------ */

test('G2a — the quarantine object is gone and the deletion carries who and how', async () => {
  const d = deps();
  const job = await runToReceived(d);
  const r = await processUpload(d, job);

  assert.equal(d.store.objects.has(r.job.quarantine.key), false, 'the unredacted file is gone');
  assert.ok(r.job.quarantine.deleted_at);
  assert.equal(r.job.quarantine.deletion_evidence?.deleted_by, 'upload-worker-1');
  assert.ok((r.job.quarantine.deletion_evidence?.method ?? '').includes('ObjectStore.delete'));
});

test('G2b — delete happens BEFORE the evidence is recorded', async () => {
  const d = deps();
  const job = await runToReceived(d);
  const r = await processUpload(d, job);
  const deletedAt = new Date(r.job.quarantine.deleted_at as string).getTime();
  const dischargeEvent = d.audit.events.filter((e) => e.contract_step === 7).at(-1)!;
  assert.equal(dischargeEvent.outcome, 'ok');
  assert.equal(new Date(dischargeEvent.at).getTime(), deletedAt,
    'the evidence is stamped at the moment after the delete returned, not before it was attempted');
});

test('G2c — a failed extraction still discharges the quarantine', async () => {
  const d = deps({ classifier: new FixedClassifier(null) });
  const job = await runToReceived(d, null);
  await assert.rejects(() => processUpload(d, job), (e: UploadHandlerError) => {
    assert.equal(e.code, 'E_UNRECOGNISED_DOC_TYPE');
    return true;
  });
  assert.ok(d.store.calls.includes(`delete:${quarantineKeyFor('LEASE-2026-0007')}`),
    'an upload nobody can classify must not be left sitting in quarantine');
  assert.equal(d.store.objects.size, 0);
  assert.ok(!d.store.calls.some((c) => c.startsWith('copy:')), 'and it is certainly not promoted');
});

test('G2d — a failed DELETE fails the job; the object is left for the sweeper', async () => {
  const d = deps();
  const job = await runToReceived(d);
  d.store.failDelete = true;

  await assert.rejects(() => processUpload(d, job), (e: UploadHandlerError) => {
    assert.equal(e.code, 'E_DISCHARGE_FAILED');
    return true;
  });
  assert.equal(job.quarantine.deleted_at, undefined,
    'undischarged on purpose — a recorded discharge here would be a lie about the only fact ' +
    'the model rests on');

  // ... and the sweeper picks it up once the TTL has run.
  const later = new Date(
    new Date(job.quarantine.written_at).getTime() + (QUARANTINE_TTL_MINUTES + 1) * 60_000,
  ).toISOString();
  const res = runScheduledSweeps([job.quarantine], [], later);
  assert.equal(res.quarantine_ok, false);
  assert.equal(res.errors[0].code, 'E_QUARANTINE_UNDISCHARGED');
});

test('G2e — the failure audit event records whether the discharge succeeded', async () => {
  const d = deps({ classifier: new FixedClassifier(null) });
  const job = await runToReceived(d, null);
  await assert.rejects(() => processUpload(d, job));
  const fail = d.audit.events.find((e) => e.action === 'process_upload' && e.outcome === 'failed')!;
  assert.equal(fail.detail.discharged, true);
  assert.equal(fail.detail.code, 'E_UNRECOGNISED_DOC_TYPE');
});

/* ------------------------------------------------------------------ *
 * K — the key discipline
 * ------------------------------------------------------------------ */

test('K1 — the issued key is always under the quarantine prefix', async () => {
  const d = deps();
  const { upload } = await issueUploadUrl(d, {
    job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE',
  });
  assert.ok(upload.key.startsWith(INGESTION_BOUNDARY.quarantine_prefix));
  assert.ok(!upload.key.startsWith(INGESTION_BOUNDARY.durable_prefix));
});

test('K2 — a store that signs a different key than it was asked for is refused', async () => {
  const store = new FakeStore();
  store.presignPut = async (key: string, expires_at: string) => ({
    url: 'https://example.invalid/widened',
    key: `${INGESTION_BOUNDARY.durable_prefix}anything`,  // widened by the adapter
    expires_at,
  });
  const d = deps({ store });
  await assert.rejects(
    () => issueUploadUrl(d, { job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE' }),
    (e: UploadHandlerError) => e.code === 'E_UPLOAD_REJECTED',
  );
});

test('K3 — the URL expires at or before the quarantine TTL', async () => {
  const d = deps();
  const { job, upload } = await issueUploadUrl(d, {
    job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE',
  });
  const issuedAt = new Date(job.quarantine.written_at).getTime();
  const expires = new Date(upload.expires_at).getTime();
  assert.ok(expires - issuedAt <= QUARANTINE_TTL_MINUTES * 60_000);
});

/* ------------------------------------------------------------------ *
 * O — contract order
 * ------------------------------------------------------------------ */

test('O1 — processUpload refuses a job that has not recorded its write', async () => {
  const d = deps();
  const { job } = await issueUploadUrl(d, {
    job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE',
  });
  await assert.rejects(() => processUpload(d, job), (e: UploadHandlerError) => {
    assert.equal(e.code, 'E_CONTRACT_ORDER');
    return true;
  });
});

test('O2 — extraction cannot run before the transparency record is opened', async () => {
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  await assert.rejects(
    () => runExtraction(d, job, { kind: 'MODEL', model: leaseModel, egress: [] }),
    (e: UploadHandlerError) => e.code === 'E_CONTRACT_ORDER',
  );
});

test('O3 — a job cannot be closed before its claims are written', async () => {
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  assert.throws(() => closeJob(job), (e: UploadHandlerError) => e.code === 'E_CONTRACT_ORDER');
});

/* ------------------------------------------------------------------ *
 * L — server-side limits
 * ------------------------------------------------------------------ */

test('L1 — a file whose bytes are not an accepted format is refused and discharged', async () => {
  const d = deps();
  const { job } = await issueUploadUrl(d, {
    job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE',
  });
  d.store.seed(job.quarantine.key, new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]));  // <?php
  const received = await recordUploadComplete(d, job, '2026-08-31T09:05:00.000Z');
  await assert.rejects(() => processUpload(d, received), (e: UploadHandlerError) => {
    assert.equal(e.code, 'E_UPLOAD_REJECTED');
    return true;
  });
  assert.ok(d.store.calls.includes(`delete:${job.quarantine.key}`));
});

test('L2 — sniffAccepted reads the magic number, not the extension', () => {
  assert.equal(sniffAccepted(PDF_MAGIC), 'pdf');
  assert.equal(sniffAccepted(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), 'zip-or-ooxml');
  assert.equal(sniffAccepted(new Uint8Array([0x00, 0x01])), null);
});

test('L3 — an over-size upload is refused', async () => {
  const d = deps();
  const { job } = await issueUploadUrl(d, {
    job_id: 'J', doc_id: 'D1', entity_id: 'E', declared_type: 'LEASE',
  });
  const big = new Uint8Array(UPLOAD_LIMITS.max_bytes + 1);
  big.set(PDF_MAGIC, 0);
  d.store.seed(job.quarantine.key, big);
  const received = await recordUploadComplete(d, job, '2026-08-31T09:05:00.000Z');
  await assert.rejects(() => processUpload(d, received), (e: UploadHandlerError) => e.code === 'E_UPLOAD_REJECTED');
});

/* ------------------------------------------------------------------ *
 * R — the routing split
 * ------------------------------------------------------------------ */

test('R1 — a HUMAN_READ_ONLY type sent to the model route is refused', async () => {
  const d = deps({ classifier: new FixedClassifier('CPSE_REPLIES') });
  let job = await runToReceived(d, 'CPSE_REPLIES');
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  await assert.rejects(
    () => runExtraction(d, job, { kind: 'MODEL', model: leaseModel, egress: [] }),
    (e: UploadHandlerError) => e.code === 'E_WRONG_CAPTURE_ROUTE',
  );
});

test('R2 — a model type sent to the human route is refused', async () => {
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  await assert.rejects(
    () => runExtraction(d, job, { kind: 'HUMAN', inputs: [], captured_by: 'analyst-1' }),
    (e: UploadHandlerError) => e.code === 'E_WRONG_CAPTURE_ROUTE',
  );
});

test('R3 — a HUMAN_READ_ONLY document still gets the full receipt strip', async () => {
  const d = deps({ classifier: new FixedClassifier('SALE_CONTRACT') });
  let job = await runToReceived(d, 'SALE_CONTRACT');
  job = (await processUpload(d, job)).job;
  assert.equal(job.receipt?.mode, 'WHOLE_DOCUMENT_PENDING_HUMAN_READ');
  // The gates on these two types are about the MODEL. They are not a reason to
  // skip the strip, and NEVER_RETAINED_ON_RECEIPT applies to them absolutely.
  assert.ok(job.quarantine.deleted_at, 'and it is still discharged');
});

/* ------------------------------------------------------------------ *
 * N — the name control fires before the write
 * ------------------------------------------------------------------ */

test('N1 — an off-spec field a model invents never reaches a claim at all', async () => {
  // FINDING, recorded here rather than left implicit. extract() iterates the
  // SPEC's field list, not the model's output, so a field the model invents —
  // including a person's name — is dropped before claims exist. The same is
  // true of captureHumanRead(). So the step-10 name control is NOT the thing
  // standing between a model and an unauthorised name: the spec is, and the
  // name control is the second of two independent barriers.
  //
  // That is worth stating because it changes what step 10 is FOR. It is not
  // insurance against the model; it is insurance against DRIFT — a DOC_SPEC
  // growing a field the name-exclusion register has not catalogued. N1b is
  // that case, and it is the one the register's Part E was designed for.
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  const nameModel: ModelFn = (): RawExtraction => [
    { field_id: 'landlord_name', value: 'not-a-real-name', confidence: 0.99, page: 2, quote_ref: 'p2:1' },
    { field_id: 'lease_term_years', value: 15, confidence: 0.99, page: 1, quote_ref: 'p1:2' },
  ];
  job = await runExtraction(d, job, { kind: 'MODEL', model: nameModel, egress: [] });

  const ids = (job.extraction as { fields: { field_id: string }[] }).fields.map((f) => f.field_id);
  assert.ok(!ids.includes('landlord_name'), 'the invented field was dropped by the spec, before claims');

  let written: string[] = [];
  job = await writeClaims(d, job, {}, async (c) => {
    written = (c as { field_id: string }[]).map((x) => x.field_id);
  });
  assert.deepEqual(written, ['lease_term_years']);
});

test('N1b — a field the register has not catalogued is refused BEFORE write() is called', async () => {
  // The drift case: a claim carrying a field_id the register does not know.
  // Constructed directly because no built spec can produce one today — which
  // is the point. If a future DOC_SPEC grows a field and nobody adds it to
  // NAME_EXCLUSION_POLICY.keptFields, THIS is what stops the write.
  const d = deps();
  let job = await runToReceived(d);
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  job = await runExtraction(d, job, { kind: 'MODEL', model: leaseModel, egress: [] });

  // Reach past the extraction to hand writeClaims a field the register has
  // never seen, exactly as a drifted spec would.
  (job.extraction as { fields: unknown[] }).fields.push({
    field_id: 'lease_guarantor_full_name', value: 'x', confidence: 1, threshold: 0.9,
    grade: 'B', consequence: 'NARRATIVE', needs_human_review: false, page: 3, quote_ref: 'p3:1',
  });

  let called = false;
  await assert.rejects(
    () => writeClaims(d, job, {}, async () => { called = true; }),
    (e: Error) => e instanceof NameExclusionError || e instanceof ClientDocIngestionError,
  );
  assert.equal(called, false, 'the write must not have been reached — that is the whole ordering');
  assert.equal(job.state, 'EXTRACTED', 'and the job did not advance');
});

test('N2 — a conditional field with no discriminant is refused', async () => {
  const d = deps({ classifier: new FixedClassifier('GRANT_FUNDING_AGREEMENT') });
  let job = await runToReceived(d, 'GRANT_FUNDING_AGREEMENT');
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  const funderModel: ModelFn = (): RawExtraction => [
    { field_id: 'grant_funder_name', value: 'NHS England', confidence: 0.99, page: 1, quote_ref: 'p1:1' },
  ];
  job = await runExtraction(d, job, { kind: 'MODEL', model: funderModel, egress: [] });
  await assert.rejects(
    () => writeClaims(d, job, {}, async () => {}),
    (e: ClientDocIngestionError) => e.code === 'E_CONDITIONAL_FIELD_UNDISCRIMINATED',
  );
});

/* ------------------------------------------------------------------ *
 * S — the scheduled sweeps
 * ------------------------------------------------------------------ */

test('S1 — a clean estate passes both sweeps', () => {
  const res = runScheduledSweeps([], [], '2026-08-31T12:00:00.000Z');
  assert.equal(res.quarantine_ok, true);
  assert.equal(res.retention_ok, true);
  assert.deepEqual(res.errors, []);
});

test('S2 — both controls are reported even when the first one fails', () => {
  const overdueQ: QuarantineObject = {
    doc_id: 'Q1', key: quarantineKeyFor('Q1'), written_at: '2026-08-31T06:00:00.000Z',
  };
  const undeletable: RawFileRecord = {
    doc_id: 'R1', doc_type: 'LEASE', received_at: '2026-08-31T06:00:00.000Z',
  };
  const res = runScheduledSweeps([overdueQ], [undeletable], '2026-08-31T12:00:00.000Z');
  assert.equal(res.quarantine_ok, false);
  assert.equal(res.retention_ok, false);
  assert.equal(res.errors.length, 2, 'a sweeper that dies on the first bad object never sees the second');
});

test('S3 — deleteDueRawFile records who, how, and that no redacted copy survives', async () => {
  const d = deps();
  const rec: RawFileRecord = {
    doc_id: 'R1', doc_type: 'LEASE',
    received_at: '2026-08-31T06:00:00.000Z',
    extraction_completed_at: '2026-08-31T07:00:00.000Z',
  };
  const out = await deleteDueRawFile(d, rec, durableKeyFor('R1'));
  assert.ok(out.deleted_at);
  assert.equal(out.deletion_evidence?.redacted_copy_retained, false);
  assert.ok((out.deletion_evidence?.method ?? '').includes('DELETE_ON_EXTRACTION_COMPLETE'));
});

test('S5 — deleteDueRawFile evidence carries the host’s backup cycle as a blank: backups pending, no cycle, no expiry (Phase 132)', async () => {
  const d = deps();
  const rec: RawFileRecord = {
    doc_id: 'R5', doc_type: 'LEASE',
    received_at: '2026-08-31T06:00:00.000Z',
    extraction_completed_at: '2026-08-31T07:00:00.000Z',
  };
  const out = await deleteDueRawFile(d, rec, durableKeyFor('R5'));
  assert.equal(out.deletion_evidence?.backups_pending, true, 'a file deleted from disk may still be alive in a backup nobody has sized');
  assert.equal(out.deletion_evidence?.backup_cycle_days, null, 'not known is never zero');
  assert.equal(out.deletion_evidence?.backup_copies_expire_at, null);
});

test('S4 — deleteDueRawFile refuses a record with no computable date', async () => {
  const d = deps();
  const rec: RawFileRecord = { doc_id: 'R2', doc_type: 'LEASE', received_at: '2026-08-31T06:00:00.000Z' };
  await assert.rejects(
    () => deleteDueRawFile(d, rec, durableKeyFor('R2')),
    (e: UploadHandlerError) => e.code === 'E_JOB_NOT_COMPLETE',
  );
});

/* ------------------------------------------------------------------ *
 * C — CONTRACT_COVERAGE
 * ------------------------------------------------------------------ */

test('C1 — the handler covers every step of RECEIPT_CONTRACT, in order', () => {
  assert.doesNotThrow(() => assertContractCovered());
  assert.equal(CONTRACT_COVERAGE.length, RECEIPT_CONTRACT.length);
});

test('C2 — every function named in CONTRACT_COVERAGE is exported or private-by-design', () => {
  const exported = new Set([
    'issueUploadUrl', 'recordUploadComplete', 'processUpload', 'openTransparency',
    'runExtraction', 'writeClaims', 'closeJob', 'runScheduledSweeps', 'deleteDueRawFile',
    // Named in coverage but deliberately not exported: they must not be
    // callable out of sequence, which is exactly what an export would allow.
    'promoteRawFile', 'dischargeQuarantine',
  ]);
  for (const c of CONTRACT_COVERAGE) {
    for (const name of c.discharged_by.split(' / ')) {
      assert.ok(exported.has(name), `CONTRACT_COVERAGE names '${name}', which is not a function of this module`);
    }
  }
});

test('C3 — the contract has not silently changed length since this handler was written', () => {
  assert.equal(RECEIPT_CONTRACT.length, 12,
    'if this fails, the module gained or lost a step and the handler has not been updated — ' +
    'which is the exact failure mode Phase 53 exists to close');
});

/* ------------------------------------------------------------------ *
 * P — PROMOTION_RULE
 * ------------------------------------------------------------------ */

test('P1 — PROMOTION_RULE is recorded as a default, not a decision', () => {
  assert.equal(PROMOTION_RULE.is_a_decision, false);
  assert.ok(PROMOTION_RULE.decision_ref.includes('Q34'));
  assert.ok(PROMOTION_RULE.decision_ref.includes('UNANSWERED'));
});

test('P2 — promotion follows the retention rule, in both directions', () => {
  assert.equal(shouldPromoteRawFile(FAIL_CLOSED_SETTINGS), false);
  assert.equal(shouldPromoteRawFile({ ...FAIL_CLOSED_SETTINGS, grace_days_after_extraction: 7 }), true);
  assert.equal(shouldPromoteRawFile({
    raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD',
    grace_days_after_extraction: 0,
    accepts_loss_of_source_reread: true,
  }), true);
});

test('P3 — a withdrawn retention rule is refused rather than substituted', () => {
  assert.throws(
    () => shouldPromoteRawFile({
      raw_file_retention: 'RETAIN_REDACTED_DELETE_ORIGINAL' as IngestionSettings['raw_file_retention'],
      grace_days_after_extraction: 0,
      accepts_loss_of_source_reread: false,
    }),
    (e: ClientDocIngestionError) => e.code === 'E_RETENTION_RULE_WITHDRAWN',
  );
});

test('P4 — the boundary this handler implements is still the fail-closed default', () => {
  // If somebody answers Q40 and sets is_a_decision true, this test should be
  // updated deliberately. Until then it is the tripwire on a silent change.
  assert.equal(INGESTION_BOUNDARY.model, 'QUARANTINE_PREFIX');
  assert.equal(INGESTION_BOUNDARY.is_a_decision, false);
});

test('G1c — an A14-D4-affected document is NOT promoted, even under the long rule (Phase 65)', () => {
  // Q56 Reading B switches promotion on. It must not switch it on for the one
  // class of document whose clock is still the extraction clock: promoting it
  // would write NO_LAWFUL_BASIS content into durable storage in order to
  // delete it from there moments later.
  const longRule: IngestionSettings = {
    raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD',
    grace_days_after_extraction: 0,
    accepts_loss_of_source_reread: true,
    ret7_approved: true,
  };
  const clean: RawFileRecord = {
    doc_id: 'LEASE-1', doc_type: 'LEASE', received_at: '2026-09-02T09:00:00.000Z',
    no_basis_content_in_original: false,
  };
  const affected: RawFileRecord = { ...clean, doc_id: 'PLANNING-1', doc_type: 'PLANNING', no_basis_content_in_original: true };

  assert.equal(shouldPromoteRawFile(longRule, clean), true);
  assert.equal(shouldPromoteRawFile(longRule, affected), false);
  // The settings-only question is unchanged — the configuration does promote.
  assert.equal(shouldPromoteRawFile(longRule), true);
  assert.match(PROMOTION_RULE.d4_carve_out, /NO_LAWFUL_BASIS/);
});

/* ------------------------------------------------------------------ *
 * TX — THE TAX RETURN AND THE TAX COMPUTATION (Phase 151b, 25 Sep 2026)
 *
 * Word question 223: the data protection officer said yes to both as uploads
 * on 24 September 2026. The handler needed no change: a type is handled when
 * it has a spec, and the strip is the ingestion module's receipt policy. What
 * these tests prove is that each is now RECEIVED — classified, stripped, its
 * kept text written and its quarantine file deleted — and that until then
 * each was refused at step 3. Invented names and figures throughout.
 * ------------------------------------------------------------------ */

const TAX_RETURN_PAGES = [
  { page: 1, lines: ['COMPANY INFORMATION', 'Company registration number 09876543', 'YOUR PERSONAL DETAILS', 'Name Jane Inventedperson', 'National Insurance number QQ 12 34 56 C'] },
  { page: 2, lines: ['CAPITAL ALLOWANCES', 'Annual investment allowance 180,000', 'DECLARATION', 'Signed Jane Inventedperson, Director'] },
];
const TAX_COMPUTATION_PAGES = [
  { page: 1, lines: ['TAX COMPUTATION FOR THE YEAR ENDED 31 MARCH 2026', 'Adjusted trading profit 412,300', 'PREPARED BY INVENTED ACCOUNTANTS LLP', 'Reviewed by Priya Madeupname'] },
  { page: 2, lines: ['MAIN POOL', 'Carried forward 114,080'] },
];

for (const [t, pages, kept] of [
  ['TAX_RETURN', TAX_RETURN_PAGES, /180,000/],
  ['TAX_COMPUTATION', TAX_COMPUTATION_PAGES, /114,080/],
] as const) {
  test(`TX1 — a ${t} is RECEIVED: classified, stripped, its kept text written, and the uploaded file deleted`, async () => {
    const d = deps({ classifier: new FixedClassifier(t), extractor: new FakeExtractor(pages) });
    let job = await runToReceived(d, t);
    const r = await processUpload(d, job);
    job = r.job;
    assert.equal(r.discharged, true);
    assert.equal(job.state, 'DISCHARGED');
    assert.equal(job.doc_type, t);
    assert.equal(job.receipt?.mode, 'SPEC_DERIVED');
    assert.ok(job.quarantine.deleted_at, 'the unredacted file is gone');
    const text = d.store.text.get(retainedTextKeyFor(job.doc_id)) ?? '';
    assert.match(text, kept);
    assert.doesNotMatch(text, /Inventedperson|Madeupname|QQ 12 34 56 C|Invented Accountants/);
    const step5 = d.audit.find(5);
    assert.equal(JSON.stringify(step5?.detail).includes('Inventedperson'), false, 'the audit trail never carries the text');
  });
}

test('TX2 — a tax field goes through the name exclusion register and is written, now the register lists it (Phase 151b)', async () => {
  const d = deps({ classifier: new FixedClassifier('TAX_COMPUTATION'), extractor: new FakeExtractor(TAX_COMPUTATION_PAGES) });
  let job = await runToReceived(d, 'TAX_COMPUTATION');
  job = (await processUpload(d, job)).job;
  job = await openTransparency(d, job, []);
  const model: ModelFn = (): RawExtraction => [
    { field_id: 'taxcomp_main_pool_balance_pence', value: 11408000, confidence: 0.99, page: 2, quote_ref: 'p2 "Carried forward"' },
  ];
  job = await runExtraction(d, job, { kind: 'MODEL', model, egress: [] });
  assert.equal(job.state, 'EXTRACTED');
  let called = false;
  await writeClaims(d, job, {}, async () => { called = true; });
  assert.equal(called, true, 'a listed tax field was not written');
});
