/**
 * THE SURVEYOR PAYLOAD INSPECTION, AS A RUNNABLE PROOF.  Phase 107.
 *
 *   cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts
 *
 * WHY THIS EXISTS ALONGSIDE `test/surveyor.test.ts`, WHICH ALREADY ASSERTS IT.
 * The test says pass or fail. This PRINTS WHAT WAS CAPTURED — the status, the
 * bytes, the top-level keys, the estimate that was sealed for that job read
 * straight out of the table, and the result of searching the captured body for
 * every one of its field names and every one of its values. A developer taking
 * this over should be able to run one command and read the evidence rather
 * than trust a tick.
 *
 * IT RUNS AGAINST THE SEED, not against a test fixture, so what it inspects is
 * the demonstration data anybody else will open.
 *
 * AND IT ENDS WITH A NEGATIVE CONTROL. The identical searches are run as ADMIN,
 * where the estimate IS released and MUST be found. A search that finds nothing
 * when the thing is definitely there proves nothing when it finds nothing
 * elsewhere — three of the four checks below would pass on an empty string.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXTENDED BY CRM 1 of 10, 10 September 2026, TO EVERY NEW ROUTE A SURVEYOR CAN
 * REACH: the claim page and its `view.json`, and the property page and its
 * `view.json`. The rule is the same and so is the search — none of the seven
 * as SURVEYING, all seven as ADMIN.
 *
 * AND IT NOW EXITS 1 ON A FAILURE. It printed and exited 0 whatever it found,
 * which made it evidence for a person and nothing for a script. The printout
 * is unchanged; a verdict line follows it, and the exit code is the verdict.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXTENDED BY CRM 2 of 10, 10 September 2026. A survey job now carries its
 * claim, and the surveyor reaches the claim by that id — so the claim searched
 * below is the job's own. The claim's view now carries a pipeline panel, and a
 * surveyor's panel must hold the stage and its steps and nothing else. Every new
 * route — the leads, a lead's view.json, the board and its view.json, a stage
 * move, a confirmation — must REFUSE a surveyor outright, and a refused move must
 * leave the stage where it was. As ADMIN, a lead's view.json carries all seven
 * and the board carries the value on the job's card.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXTENDED BY CRM 3 of 10, 11 September 2026. The claim's view now carries its
 * tasks and its timeline, so a surveyor's must hold their own tasks and a
 * timeline limited to what the job reaches. The new routes a surveyor CAN reach —
 * the landing page with "my tasks", the task list and its view.json, and their own
 * task — must carry none of the seven. Every CRM 3 route a surveyor may NOT reach —
 * the breakers list, the rules, the templates, adding a task, setting a next
 * action, queuing an email, a note on the claim — must refuse outright, and the
 * property page must draw them no timeline. As ADMIN, the claim's view.json still
 * carries all seven WITH its tasks and timeline inside it; "my tasks" builds no
 * estimate for any role, and ADMIN's search finds none there either.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { quarantinedKeysAndValues } from '../src/payload.ts';
import { randomUUID } from 'node:crypto';
import * as D from '../src/web/documents.ts';
import * as I from '../src/web/introducers.ts';
import { acceptClientBytes, finishUpload, issuedJob } from '../src/web/uploads.ts';
import * as F from '../src/web/claim-facts.ts';
import { RELEASED_FACTS_TO_SURVEYOR } from '../src/payload.ts';
import * as DB from '../src/web/dashboard.ts';
import { can as canForProof } from '../src/authz.ts';
import { addNote } from '../src/web/engaged.ts';

// PHASE 151j: this proof reads what each ROLE receives once signed in; the second step is not what it proves, and it
// signs in with a password only. test/phase151j.test.ts proves the second step on the default application.
const made = await createApp(':memory:', {
  twoFactor: 'off',
  documentRoot: mkdtempSync(join(tmpdir(), 'cb-payload-proof-')),
});
await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
const addr = made.server.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;
const s = await seed(made.app.db, made.app.hasher, made.app.now);

let cookie = '';
async function req(path: string, init: RequestInit = {}) {
  const headers = { ...(init.headers as Record<string,string> | undefined) };
  if (cookie) headers['cookie'] = cookie;
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
  const set = r.headers.getSetCookie();
  if (set.length) cookie = set.map((x) => x.split(';')[0]).join('; ');
  return { status: r.status, body: await r.text() };
}

await req('/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'surveying@example.invalid', password: s.password }).toString(),
});

const jobs = made.app.db.all<{ id: string; business_id: string; assessment_id: string; claim_id: string }>(
  'SELECT id, business_id, assessment_id, claim_id FROM surveyor_jobs');
const job = jobs[0]!;
const est = made.app.db.get<Record<string, number>>(
  'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
  'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates WHERE business_id = ?',
  [job.business_id])!;
const { keys: badKeys, values: badValues } = quarantinedKeysAndValues(est as never);

const json = await req(`/staff/survey/${job.id}/payload.json`);
const html = await req(`/staff/survey/${job.id}`);

const parsed = JSON.parse(json.body) as Record<string, unknown>;
const walk = (v: unknown, out: { k: string[]; s: string[] }): void => {
  if (Array.isArray(v)) { for (const x of v) walk(x, out); return; }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { out.k.push(k); walk(x, out); }
    return;
  }
  if (typeof v === 'string' || typeof v === 'number') out.s.push(String(v));
};
const seen = { k: [] as string[], s: [] as string[] };
walk(parsed, seen);

/** Every failure the verdict is made of. Empty is a pass. */
const failures: string[] = [];
/**
 * A VALUE FOUND AS A NUMBER IN THE TEXT, never as part of a longer one. CRM 9 of 10, 12 September 2026: this proof and
 * test/crm.test.ts both searched with `includes`, and a seeded 0.3 matched the milliseconds of a real-clock timestamp
 * about one run in eighty-five — the intermittent 611 in 612. A digit or a point either side is a different number.
 */
const inText = (body: string, v: unknown): boolean =>
  new RegExp(`(?<![\\d.])${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(body);
const found = (body: string, parsedBody: unknown | null) => {
  const x = { k: [] as string[], s: [] as string[] };
  if (parsedBody !== null) walk(parsedBody, x);
  return {
    byName: badKeys.filter((k) => x.k.includes(k)),
    byValue: badValues.filter((v) => x.s.includes(String(v))),
    byText: badValues.filter((v) => inText(body, v)),
  };
};

console.log('=== CAPTURED: GET /staff/survey/<job>/payload.json  as SURVEYING');
console.log('    HTTP status               :', json.status);
console.log('    response bytes            :', Buffer.byteLength(json.body));
console.log('    top-level keys            :', Object.keys(parsed).join(', '));
console.log("    'estimate' in body        :", 'estimate' in parsed);
console.log('    quarantine.state          :', (parsed['quarantine'] as {state:string}).state);
console.log('    quarantine.notice         :', (parsed['quarantine'] as {notice:string}).notice);
console.log('    answers carried           :', (parsed['answers'] as unknown[]).length);
console.log('    register records carried  :', (parsed['register_records'] as unknown[]).length);
console.log('    properties carried        :', (parsed['properties'] as unknown[]).length);
console.log('');
console.log('    THE SEALED ESTIMATE FOR THIS JOB (from the estimates table, read directly):');
for (const [k, v] of Object.entries(est)) console.log(`      ${k} = ${v}`);
console.log('');
console.log('    SEARCHED THE CAPTURED JSON BODY FOR EACH OF THOSE:');
console.log('      by field name  ->', badKeys.filter((k) => seen.k.includes(k)).length, 'found', JSON.stringify(badKeys.filter((k) => seen.k.includes(k))));
console.log('      by value       ->', badValues.filter((v) => seen.s.includes(String(v))).length, 'found', JSON.stringify(badValues.filter((v) => seen.s.includes(String(v)))));
console.log('      by raw text    ->', badValues.filter((v) => inText(json.body, v)).length, 'found', JSON.stringify(badValues.filter((v) => inText(json.body, v))));
console.log('');
console.log('=== CAPTURED: GET /staff/survey/<job>  as SURVEYING  (the rendered page)');
console.log('    HTTP status               :', html.status, '  bytes:', Buffer.byteLength(html.body));
console.log('      by raw text    ->', badValues.filter((v) => inText(html.body, v)).length, 'found', JSON.stringify(badValues.filter((v) => inText(html.body, v))));
console.log('');
{
  const f = found(json.body, parsed);
  if (json.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0) failures.push('survey payload.json as SURVEYING');
  if (html.status !== 200 || badValues.some((v) => inText(html.body, v))) failures.push('survey page as SURVEYING');
}

/* ------------------------------------------------ CRM 1 of 10 — the new routes */

// CRM 2 of 10: the job's own claim, by the id the job now carries.
const claim = made.app.db.get<{ id: string; claim_ref: string; property_id: string; stage: string; business_id: string }>(
  'SELECT id, claim_ref, property_id, stage, business_id FROM claims WHERE id = ?', [job.claim_id])!;
const crmRoutes = [
  { label: 'claim view.json', path: `/staff/claims/${claim.id}/view.json`, json: true },
  { label: 'claim page', path: `/staff/claims/${claim.id}`, json: false },
  // Phase 134: the same claim, inside its company's page.
  { label: 'claim in its company', path: `/staff/clients/${claim.business_id}/claims/${claim.id}`, json: false },
  { label: 'property view.json', path: `/staff/properties/${claim.property_id}/view.json`, json: true },
  { label: 'property page', path: `/staff/properties/${claim.property_id}`, json: false },
] as const;

console.log(`=== CAPTURED: the CRM routes for this job's claim ${claim.claim_ref} and its property, as SURVEYING`);
for (const route of crmRoutes) {
  const r = await req(route.path);
  const body = route.json && r.status === 200 ? JSON.parse(r.body) as unknown : null;
  const f = found(r.body, body);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status}  bytes ${Buffer.byteLength(r.body)}`);
  if (route.json) {
    console.log('      by field name  ->', f.byName.length, 'found', JSON.stringify(f.byName));
    console.log('      by value       ->', f.byValue.length, 'found', JSON.stringify(f.byValue));
  }
  console.log('      by raw text    ->', f.byText.length, 'found', JSON.stringify(f.byText));
  if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0) failures.push(`${route.label} as SURVEYING`);
}
const elsewhere = made.app.db.get<{ id: string }>(
  'SELECT c.id FROM claims c WHERE NOT EXISTS (SELECT 1 FROM surveyor_jobs j WHERE j.claim_id = c.id) LIMIT 1');
if (elsewhere !== undefined) {
  const r = await req(`/staff/claims/${elsewhere.id}/view.json`);
  console.log(`    a claim on no job of theirs        HTTP ${r.status} (must be 403)`);
  if (r.status !== 403) failures.push('a claim outside the surveyor’s jobs was served');
}
{
  // Phase 134: the one client page carries the research half and the notes; a surveyor is refused it, as the
  // organisation page refused them.
  const r = await req(`/staff/clients/${claim.business_id}`);
  console.log(`    the one client page               HTTP ${r.status} (must be 403)`);
  if (r.status !== 403) failures.push('the one client page was served to a surveyor');
}
console.log('');

/* ------------------------------------------ CRM 2 of 10 — leads and the pipeline */

console.log('=== CAPTURED: the pipeline panel on the job\'s claim, and every CRM 2 route, as SURVEYING');
{
  const r = await req(`/staff/claims/${claim.id}/view.json`);
  const panel = (JSON.parse(r.body) as { pipeline?: Record<string, unknown> }).pipeline;
  const panelKeys = panel === undefined ? [] : Object.keys(panel).sort();
  console.log('    pipeline panel keys        :', JSON.stringify(panelKeys), '(must be exactly stage and steps)');
  if (JSON.stringify(panelKeys) !== JSON.stringify(['stage', 'steps'])) failures.push('the surveyor’s pipeline panel carries more than the stage and its steps');
}
const lead = made.app.db.get<{ id: string }>('SELECT id FROM leads WHERE business_id = ? ORDER BY created_at LIMIT 1', [job.business_id])!;
const refused = [
  { label: 'lead list', path: '/staff/leads', post: null },
  { label: 'lead page', path: `/staff/leads/${lead.id}`, post: null },
  { label: 'lead view.json', path: `/staff/leads/${lead.id}/view.json`, post: null },
  { label: 'pipeline board', path: '/staff/pipeline', post: null },
  { label: 'pipeline view.json', path: '/staff/pipeline/view.json', post: null },
  { label: 'a stage move', path: `/staff/claims/${claim.id}/stage`, post: { kind: 'FORWARD', to: 'VALUATION' } },
  { label: 'a confirmation', path: `/staff/claims/${claim.id}/milestones`, post: { milestone: 'VALUATION_SIGNED' } },
] as const;
for (const route of refused) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
{
  const after = made.app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])!;
  console.log(`    the claim's stage after the refused move: ${after.stage} (was ${claim.stage})`);
  if (after.stage !== claim.stage) failures.push('a refused move changed the stage');
}
console.log('');

/* ------------------------------------ CRM 3 of 10 — tasks, the timeline, automation */

console.log('=== CAPTURED: tasks, the timeline and every CRM 3 route, as SURVEYING');
{
  const r = await req(`/staff/claims/${claim.id}/view.json`);
  const body = JSON.parse(r.body) as { tasks?: { tasks: unknown[] }; timeline?: { limited_to?: string; events: { category: string }[] } };
  const cats = [...new Set((body.timeline?.events ?? []).map((e) => e.category))].sort();
  console.log('    claim view.json tasks          :', body.tasks === undefined ? 'absent' : `${body.tasks.tasks.length} — the surveyor’s own`);
  console.log('    claim view.json timeline       :', body.timeline === undefined ? 'absent' : `limited to: ${body.timeline.limited_to ?? '(nothing — a full timeline)'}`);
  console.log('    timeline categories            :', JSON.stringify(cats), '(must be within STAGE, TASK, SURVEY)');
  if (body.tasks === undefined || body.timeline === undefined || body.timeline.limited_to === undefined
    || cats.some((c) => !['STAGE', 'TASK', 'SURVEY'].includes(c))) {
    failures.push('the surveyor’s claim view carries more tasks or timeline than an assigned job reaches');
  }
}
const surveyorTask = made.app.db.get<{ id: string }>(
  "SELECT t.id FROM staff_tasks t JOIN users u ON u.id = t.owner_id WHERE u.role = 'SURVEYING' LIMIT 1");
if (surveyorTask === undefined) failures.push('the seed gives the surveyor no task, so their task page is not exercised');
const reachable: { label: string; path: string; json: boolean }[] = [
  { label: 'landing page', path: '/staff', json: false },
  { label: 'my tasks', path: '/staff/tasks', json: false },
  { label: 'my tasks view.json', path: '/staff/tasks/view.json', json: true },
  ...(surveyorTask === undefined ? [] : [{ label: 'their own task', path: `/staff/tasks/${surveyorTask.id}`, json: false }]),
];
for (const route of reachable) {
  const r = await req(route.path);
  const f = found(r.body, route.json && r.status === 200 ? JSON.parse(r.body) as unknown : null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status}  by name ${f.byName.length}, by value ${f.byValue.length}, by raw text ${f.byText.length}`);
  if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0) failures.push(`${route.label} as SURVEYING`);
}
const refusedCrm3 = [
  { label: 'breakers list', path: '/staff/next-actions', post: null },
  { label: 'automation rules', path: '/staff/automation', post: null },
  { label: 'email templates', path: '/staff/templates', post: null },
  { label: 'add a task', path: '/staff/tasks', post: { claim_id: claim.id, title: 'x', activity_type: 'TASK', owner_role: 'SURVEYING' } },
  { label: 'set a next action', path: `/staff/claims/${claim.id}/next-action`, post: { title: 'x', due_on: '2026-12-31' } },
  { label: 'queue an email', path: `/staff/claims/${claim.id}/email`, post: { template_id: 'template-next-step', contact_id: 'x' } },
  { label: 'a note on the claim', path: `/staff/claims/${claim.id}/notes`, post: { body: 'x' } },
] as const;
for (const route of refusedCrm3) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(route.post).toString(),
  });
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)`);
  if (r.status !== 403) failures.push(`${route.label} did not refuse SURVEYING`);
}
{
  const r = await req(`/staff/properties/${claim.property_id}`);
  console.log(`    property page timeline drawn : ${r.body.includes('Activity timeline')} (must be false)`);
  if (r.status !== 200 || r.body.includes('Activity timeline')) failures.push('the property page drew a timeline for SURVEYING');
}
console.log('');

/* ------------------------------------------------- CRM 4 of 10 — documents on the claim */

console.log('=== CAPTURED: documents on the job\'s claim, and every CRM 4 route, as SURVEYING');
const adminActor = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN' as const, business_id: null, disabled: false };
const docDeps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID, store: made.store };
// THE PROOF'S OWN FIXTURES: a lease uploaded through the one handler and linked to the job's claim; a fee
// invoice, which no upload can create, written as its row would be; and a request on the claim.
const started = await D.startDocumentUpload(docDeps, adminActor, {
  business_id: job.business_id, type_code: 'LEASE', logical_document_id: null, request_id: null, claim_id: job.claim_id,
});
if (!started.ok) throw new Error(`the proof could not upload its lease: ${started.why}`);
{
  const up = { db: made.app.db, store: made.store, now: made.app.now, actor: adminActor.id, newId: randomUUID, audit: made.app.audit };
  const token = new URL('http://x' + started.url).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(up, { doc_id: started.doc_id, token, bytes: new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n')) });
  const issued = issuedJob(made.app.db, started.doc_id);
  if (!w.ok || issued === null) throw new Error('the proof could not write its lease');
  await finishUpload(up, issued, w.written_at);
}
const lease = started.logical_document_id;
const invoiceDoc = randomUUID();
made.app.db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, 1, ?, ?)',
  [invoiceDoc, job.business_id, 'INVOICE', adminActor.id, made.app.now()]);
made.app.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
  [randomUUID(), job.business_id, adminActor.id, 'invoice-1-version-1', 'DISCHARGED', made.app.now(), invoiceDoc, 'INVOICE']);
made.app.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)',
  [randomUUID(), invoiceDoc, job.claim_id, adminActor.id, made.app.now()]);
const docRequest = D.createDocumentRequest(docDeps, adminActor, {
  business_id: job.business_id, claim_id: job.claim_id, type_code: 'FIRE_RISK_ASSESSMENT', why: 'the proof', holds_up: 'the proof', due_on: null,
});
if (!docRequest.ok) throw new Error(`the proof could not raise its request: ${docRequest.why}`);
{
  const r = await req(`/staff/claims/${claim.id}/view.json`);
  const panel = (JSON.parse(r.body) as { documents?: { documents: { id: string }[]; requests?: unknown } }).documents;
  const ids = (panel?.documents ?? []).map((x) => x.id);
  console.log('    claim view.json documents     :', JSON.stringify(ids.map((x) => (x === lease ? 'the lease' : x === invoiceDoc ? 'THE FEE INVOICE' : x))), '(must be the lease alone)');
  console.log('    claim view.json requests      :', panel === undefined ? 'no panel' : 'requests' in panel ? 'PRESENT' : 'absent', '(must be absent)');
  if (panel === undefined || JSON.stringify(ids) !== JSON.stringify([lease]) || 'requests' in panel) failures.push('the surveyor’s documents panel carries more than the claim evidence of the job');
}
for (const route of [
  { label: 'the lease page', path: `/staff/documents/${lease}`, json: false },
  { label: 'the lease view.json', path: `/staff/documents/${lease}/view.json`, json: true },
]) {
  const r = await req(route.path);
  const f = found(r.body, route.json && r.status === 200 ? JSON.parse(r.body) as unknown : null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status}  by name ${f.byName.length}, by value ${f.byValue.length}, by raw text ${f.byText.length}`);
  if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0) failures.push(`${route.label} as SURVEYING`);
}
const refusedCrm4 = [
  { label: 'the fee invoice', path: `/staff/documents/${invoiceDoc}`, post: null },
  { label: 'its view.json', path: `/staff/documents/${invoiceDoc}/view.json`, post: null },
  { label: 'the lease original', path: `/staff/documents/${lease}/download`, post: null },
  { label: 'document types', path: '/staff/document-types', post: null },
  { label: 'request a document', path: `/staff/claims/${claim.id}/document-requests`, post: { type_code: 'LEASE', why: 'x', holds_up: 'x' } },
  { label: 'upload to the claim', path: `/staff/claims/${claim.id}/documents`, post: { type_code: 'LEASE' } },
  { label: 'link a document', path: `/staff/documents/${lease}/links`, post: { claim_id: claim.id } },
  { label: 'withdraw a request', path: `/staff/document-requests/${docRequest.id}/withdraw`, post: {} },
] as const;
for (const route of refusedCrm4) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
// CRM 5 of 10: introducers, the referral channel and the reward model. A SURVEYOR REACHES NONE OF IT — every route
// refuses, reading and writing, and a refused write leaves nothing behind. The firm and the referral are the proof's own.
const adminForCrm5 = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN' as const, business_id: null, disabled: false };
const crm5Deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
const firm = I.createIntroducer(crm5Deps, adminForCrm5, { firm_name: 'Proof Accountants LLP', introducer_type: 'ACCOUNTANT_FIRM' });
if (!firm.ok) throw new Error(`the proof could not record its firm: ${firm.why}`);
const referred = I.intakeReferral(crm5Deps, adminForCrm5, {
  introducer_id: firm.id, contact_name: 'Proof Partner', contact_email: 'partner@proof.example.invalid', prospect_organisation: 'Proof Clinic Limited',
}, 'STAFF');
if (!referred.ok) throw new Error(`the proof could not record its referral: ${referred.why}`);
const introducersBefore = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducers')?.n ?? -1;
const refusedCrm5 = [
  { label: 'introducers', path: '/staff/introducers', post: null },
  { label: 'a firm', path: `/staff/introducers/${firm.id}`, post: null },
  { label: 'its view.json', path: `/staff/introducers/${firm.id}/view.json`, post: null },
  { label: 'the reward model', path: '/staff/introducer-rewards', post: null },
  { label: 'its view.json ', path: '/staff/introducer-rewards/view.json', post: null },
  { label: 'add a firm', path: '/staff/introducers', post: { firm_name: 'x' } },
  { label: 'record a referral', path: '/staff/referrals', post: { firm_name: 'x', prospect_organisation: 'x' } },
  { label: 'log contact', path: `/staff/introducers/${firm.id}/contact-log`, post: { kind: 'CALL', title: 'x' } },
  { label: 'the client opt-in', path: `/staff/leads/${referred.id}/share-progress`, post: { decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING } },
  { label: 'switch the reward', path: '/staff/introducer-rewards', post: { model: 'A_RECIPROCITY' } },
] as const;
for (const route of refusedCrm5) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
if ((made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducers')?.n ?? -2) !== introducersBefore
  || (made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducer_share_consents')?.n ?? -1) !== 0) {
  failures.push('a refused CRM 5 write left something behind');
}
console.log('');

/* ------------------------------ CRM 6 of 10 — the claim's facts, figures, sign-off, deliverables and aftercare */

// THE PROOF'S OWN FACTS: amounts a surveyor could anchor on as readily as our estimate, recorded on the job's claim.
const crm6Deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
const salesForCrm6 = { id: s.users.find((u) => u.role === 'SALES')!.id, role: 'SALES' as const, business_id: null, disabled: false };
for (const [fact_key, value] of [
  ['ELECTION_EXISTS', 'YES'], ['ELECTION_VALUE', '98765.43'], ['TRANSACTION_TAX', '87654.32'], ['ACCOUNTING_PERIOD_END', '2025-12-31'],
] as const) {
  const r = F.recordFact(crm6Deps, salesForCrm6, claim.id, { fact_key, answer: 'VALUE', value, source_id: 'CLIENT_DOC' });
  if (!r.ok) throw new Error(`the proof could not record ${fact_key}: ${r.why}`);
}
const CRM6_AMOUNTS = ['£98,765', '£87,654', '2025-12-31'] as const;
console.log('=== CAPTURED: the claim\'s facts on the job\'s claim, and every CRM 6 route, as SURVEYING');
{
  const r = await req(`/staff/claims/${claim.id}/view.json`);
  const body = JSON.parse(r.body) as Record<string, unknown>;
  const facts = body['facts'] as { released_to_surveyor?: boolean; facts?: Record<string, unknown> } | undefined;
  const keys = facts?.facts === undefined ? [] : Object.keys(facts.facts).sort();
  const f = found(r.body, body);
  console.log('    claim view.json facts released  :', JSON.stringify(keys));
  console.log('    figures, deliverables, aftercare :', 'figures' in body, 'deliverables' in body, 'aftercare' in body, '(must all be false)');
  console.log('    the proof\'s amounts by raw text  :', CRM6_AMOUNTS.filter((x) => r.body.includes(x)).length, 'found (must be 0)');
  console.log('    the sealed estimate              : by name', f.byName.length, 'by value', f.byValue.length, 'by raw text', f.byText.length);
  if (facts?.released_to_surveyor !== true || JSON.stringify(keys) !== JSON.stringify([...RELEASED_FACTS_TO_SURVEYOR].sort())
    || 'figures' in body || 'deliverables' in body || 'aftercare' in body) {
    failures.push('the surveyor’s claim view carries more than the released facts');
  }
  if (CRM6_AMOUNTS.some((x) => r.body.includes(x)) || f.byName.length + f.byValue.length + f.byText.length > 0) {
    failures.push('the surveyor’s claim view carries an amount, a date the tax position turns on, or the estimate');
  }
}
const crm6Count = (): number => made.app.db.get<{ n: number }>(
  'SELECT (SELECT COUNT(*) FROM claim_facts) + (SELECT COUNT(*) FROM claim_grants) + (SELECT COUNT(*) FROM claim_owner_chain) + ' +
    '(SELECT COUNT(*) FROM tax_adviser_signoffs) + (SELECT COUNT(*) FROM claim_deliverables) + (SELECT COUNT(*) FROM hmrc_enquiries) AS n')?.n ?? -1;
const crm6Before = crm6Count();
for (const route of [
  { label: 'record a fact', path: `/staff/claims/${claim.id}/facts`, post: { fact_key: 'GRANTS_EXIST', answer: 'VALUE', value: 'NO', source_id: 'SURVEYOR' } },
  { label: 'record a grant', path: `/staff/claims/${claim.id}/grants`, post: { kind: 'GRANT', payer_class: 'nhs', traced: 'NO', source_id: 'SURVEYOR' } },
  { label: 'record an owner', path: `/staff/claims/${claim.id}/owners`, post: { position: '1', owner: 'UNKNOWN', claimed: 'UNKNOWN', source_id: 'SURVEYOR' } },
  { label: 'record a sign-off', path: `/staff/claims/${claim.id}/signoff`, post: { adviser: 'Invented Tax Advisers LLP', credential: 'x', signed_on: '2026-09-01', scope: 'x', method_note: 'x', figure: '1' } },
  { label: 'draft a deliverable', path: `/staff/claims/${claim.id}/deliverables`, post: { kind: 'REASONED_NEGATIVE', action: 'DRAFT' } },
  { label: 'record a filing', path: `/staff/claims/${claim.id}/reconciliation/filing`, post: { filed_on: '2026-09-01' } },
  { label: 'open an enquiry', path: `/staff/claims/${claim.id}/enquiries`, post: { opened_on: '2026-09-01' } },
] as const) {
  const r = await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
if (crm6Count() !== crm6Before) failures.push('a refused CRM 6 write left something behind');
console.log('');

/* ------------------------------ CRM 7 of 10 — finance on the claim, the fee controls and VAT monitoring */

// A SURVEYOR REACHES NONE OF IT. Every finance route refuses — reading and writing — and a refused write leaves
// nothing behind in any of the finance tables. The invoice is one the seed raised on a claim.
const seededInvoice = made.app.db.get<{ id: string; claim_id: string }>('SELECT id, claim_id FROM invoices WHERE claim_id IS NOT NULL ORDER BY created_at LIMIT 1');
if (seededInvoice === undefined) throw new Error('the proof found no claim invoice in the seed');
const crm7Count = (): number => made.app.db.get<{ n: number }>(
  'SELECT (SELECT COUNT(*) FROM invoices) + (SELECT COUNT(*) FROM invoice_numbers) + (SELECT COUNT(*) FROM invoice_credit_notes) + ' +
    "(SELECT COUNT(*) FROM invoice_payments) + (SELECT COUNT(*) FROM finance_settings) + (SELECT COUNT(*) FROM staff_tasks WHERE company_subject IS NOT NULL) AS n")?.n ?? -1;
const crm7Before = crm7Count();
console.log('=== CAPTURED: every CRM 7 finance route, as SURVEYING');
for (const route of [
  { label: 'finance', path: '/staff/finance', post: null },
  { label: 'its view.json', path: '/staff/finance/view.json', post: null },
  { label: 'a claim invoice', path: `/staff/finance/${seededInvoice.id}`, post: null },
  { label: 'raise an invoice', path: `/staff/finance/claims/${claim.id}/raise`, post: { kind: 'FEE' } },
  { label: 'record money in', path: `/staff/finance/${seededInvoice.id}/received`, post: { received_on: '2026-09-08', amount: '1' } },
  { label: 'credit in full', path: `/staff/finance/${seededInvoice.id}/credit-in-full`, post: { reason: 'x' } },
  { label: 'record as sent', path: `/staff/finance/${seededInvoice.id}/sent`, post: { sent_on: '2026-09-08' } },
  { label: 'the VAT check', path: '/staff/finance/vat-check', post: {} },
  { label: 'a finance setting', path: '/staff/finance/settings', post: { setting: 'VAT_WARNING_FRACTION', value: '0.1', effective_from: '2026-09-01', source: 'x' } },
] as const) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
if (crm7Count() !== crm7Before) failures.push('a refused CRM 7 write left something behind');
console.log('');

/* ------------------------------ CRM 8 of 10 — the compliance registers */

// A SURVEYOR REACHES NONE OF IT. Every compliance route refuses — the registers, due diligence, S2 and its search, the
// consent history and the retention list, reading and writing — and a refused write leaves nothing behind.
const crm8Count = (): number => made.app.db.get<{ n: number }>(
  'SELECT (SELECT COUNT(*) FROM compliance_settings) + (SELECT COUNT(*) FROM cdd_checks) + (SELECT COUNT(*) FROM rights_requests) + ' +
    '(SELECT COUNT(*) FROM complaints) + (SELECT COUNT(*) FROM breach_incidents) + (SELECT COUNT(*) FROM identity_persons) + ' +
    '(SELECT COUNT(*) FROM identity_search_log) + (SELECT COUNT(*) FROM legal_holds) + (SELECT COUNT(*) FROM consent_answers) AS n')?.n ?? -1;
const crm8Before = crm8Count();
console.log('=== CAPTURED: every CRM 8 compliance route, as SURVEYING');
for (const route of [
  { label: 'compliance', path: '/staff/compliance', post: null },
  { label: 'its view.json', path: '/staff/compliance/view.json', post: null },
  { label: 'due diligence', path: '/staff/compliance/aml', post: null },
  { label: 'rights requests', path: '/staff/compliance/rights', post: null },
  { label: 'complaints', path: '/staff/compliance/complaints', post: null },
  { label: 'breaches', path: '/staff/compliance/breaches', post: null },
  { label: 'S2', path: '/staff/compliance/identity', post: null },
  { label: 'retention', path: '/staff/compliance/retention', post: null },
  { label: 'retention.json', path: '/staff/compliance/retention/view.json', post: null },
  { label: 'a setting', path: '/staff/compliance/settings', post: { setting: 'AML_IN_SCOPE', value: 'true', effective_from: '2026-09-01', source: 'x' } },
  { label: 'open a check', path: '/staff/compliance/aml/checks', post: { business_id: claim.business_id, claimant_type: 'SOLE_TRADER' } },
  { label: 'log a request', path: '/staff/compliance/rights', post: { received_at: '2026-09-08T10:00', received_via: 'POST', request_verbatim: 'x', limbs: 'ART_15' } },
  { label: 'log a complaint', path: '/staff/compliance/complaints', post: { received_at: '2026-09-08T10:00', received_via: 'POST', complaint_verbatim: 'x' } },
  { label: 'open a breach', path: '/staff/compliance/breaches', post: { kind: 'SECURITY_INCIDENT' } },
  { label: 'search S2', path: '/staff/compliance/identity/search', post: { term: 'proof' } },
  { label: 'search a person', path: '/staff/compliance/search', post: { term: 'proof' } },
  { label: 'set a hold', path: '/staff/compliance/holds', post: { hold_kind: 'LEGAL_HOLD' } },
] as const) {
  const r = route.post === null ? await req(route.path) : await req(route.path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
  });
  const f = found(r.body, null);
  console.log(`    ${route.label.padEnd(20)} HTTP ${r.status} (must be 403)  by raw text -> ${f.byText.length} found`);
  if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
}
if (crm8Count() !== crm8Before) failures.push('a refused CRM 8 write left something behind');
console.log('');

/* ------------------------------ CRM 9 of 10 — the management dashboard */

// A SURVEYOR IS DRAWN ITS OWN SURVEY JOBS AND NOTHING ELSE. The dashboard's view.json and its page carry none of the
// seven by name, by value or as a number in the text — and none of the pound figures the same dashboard shows ADMIN,
// read here straight from the dashboard's own function so the comparison has something to find.
const adminUser = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'admin@example.invalid'")!;
const adminDash = DB.dashboard(made.app.db, { id: adminUser.id, role: 'ADMIN', business_id: null, disabled: false }, made.app.now());
const adminPounds = [...new Set(adminDash.tiles.filter((t) => t.group !== 'MY_JOBS')
  .flatMap((t) => t.lines.map((l) => l.value)).flatMap((v) => v.match(/£[\d,]+/g) ?? []))];
console.log('=== CAPTURED: the management dashboard, as SURVEYING');
// PHASE 136: the dashboard's page is /staff/reports (Home's Reports tile); /staff/dashboard itself now answers 303 to Home.
for (const path of ['/staff/dashboard/view.json', '/staff/reports']) {
  const r = await req(path);
  const parsedBody = path.endsWith('.json') && r.status === 200 ? JSON.parse(r.body) as { tiles?: { key: string }[] } : null;
  const f = found(r.body, parsedBody);
  const pounds = adminPounds.filter((p) => r.body.includes(p));
  const tiles = parsedBody === null ? null : (parsedBody.tiles ?? []).map((t) => t.key);
  console.log(`    ${path.padEnd(28)} HTTP ${r.status}  tiles ${JSON.stringify(tiles)}  by name ${f.byName.length}, by value ${f.byValue.length}, by text ${f.byText.length} of 7; ADMIN's pound figures found ${pounds.length} of ${adminPounds.length}`);
  if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0 || pounds.length > 0) failures.push(`${path} as SURVEYING`);
  if (tiles !== null && JSON.stringify(tiles) !== JSON.stringify(['my_jobs'])) failures.push('the dashboard drew SURVEYING a tile beyond its own survey jobs');
}
console.log('');

/* ------------------------------ CRM 9 of 10 — search, the lists, export, and the property page's new routes */

// SEARCH, AS SURVEYING: 200, the claims and properties of the surveyor's own jobs alone, and none of the seven.
{
  const mineClaims = new Set(made.app.db.all<{ claim_id: string }>(
    'SELECT claim_id FROM surveyor_jobs WHERE surveyor_id = (SELECT id FROM users WHERE email_canonical = ?)', ['surveying@example.invalid']).map((x) => x.claim_id));
  console.log('=== CAPTURED: search, the claims list and export, and the property page’s new routes, as SURVEYING');
  for (const path of ['/staff/search/view.json?q=CR-', '/staff/search?q=CR-']) {
    const r = await req(path);
    const body = path.includes('.json') && r.status === 200 ? JSON.parse(r.body) as { hits: { kind: string; href: string }[]; scope: { kind: string; searched: string }[] } : null;
    const f = found(r.body, body);
    const outside = body === null ? [] : body.hits.filter((x) => x.kind === 'CLAIM' && !mineClaims.has(x.href.replace('/staff/claims/', '')));
    const kinds = body === null ? null : [...new Set(body.hits.map((x) => x.kind))];
    console.log(`    ${path.padEnd(32)} HTTP ${r.status}  kinds ${JSON.stringify(kinds)}  claims outside the surveyor's jobs ${outside.length}  by name ${f.byName.length}, value ${f.byValue.length}, text ${f.byText.length} of 7`);
    if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0 || outside.length > 0) failures.push(`${path} as SURVEYING`);
    if (body !== null && body.scope.some((s) => ['ORGANISATION', 'CONTACT', 'INVOICE', 'NOTE', 'PROSPECT'].includes(s.kind) && s.searched !== 'NOT_SEARCHED')) {
      failures.push('search looked in a kind a surveyor may not read');
    }
  }
  // THE CLAIMS LIST, WITH A VALUE FILTER AND A VALUE SORT ASKED FOR: 200, said not applied, none of the seven.
  {
    const r = await req('/staff/claims?value_min=1&sort=value');
    const f = found(r.body, null);
    console.log(`    /staff/claims?value_min=1&sort=value HTTP ${r.status}  the refusal said ${/not shown to this role/.test(r.body)}  by text ${f.byText.length} of 7`);
    if (r.status !== 200 || f.byText.length > 0 || !/not shown to this role/.test(r.body)) failures.push('the claims list with a value filter as SURVEYING');
  }
  // EXPORT, AND THE PROPERTY PAGE'S NOTE AND LINK: refused outright, and nothing written.
  const notesBefore = made.app.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM internal_notes) + (SELECT COUNT(*) FROM document_links) AS n')?.n ?? -1;
  const anyDocument = made.app.db.get<{ id: string }>('SELECT id FROM logical_documents WHERE business_id = ? ORDER BY rowid LIMIT 1', [job.business_id])?.id ?? 'no-document';
  for (const route of [
    { label: 'claims export.csv', path: '/staff/claims/export.csv', post: null },
    { label: 'leads export.csv', path: '/staff/leads/export.csv', post: null },
    { label: 'a note on the property', path: `/staff/properties/${claim.property_id}/notes`, post: { body: 'a surveyor note' } },
    { label: 'link to the property', path: `/staff/properties/${claim.property_id}/documents/link`, post: { document_id: anyDocument } },
  ] as const) {
    const r = route.post === null ? await req(route.path) : await req(route.path, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
    });
    const f = found(r.body, null);
    console.log(`    ${route.label.padEnd(24)} HTTP ${r.status} (must be 403)  by text ${f.byText.length}`);
    if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
  }
  if ((made.app.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM internal_notes) + (SELECT COUNT(*) FROM document_links) AS n')?.n ?? -2) !== notesBefore) {
    failures.push('a refused CRM 9 write left something behind');
  }
  // THE PROPERTY VIEW'S DOCUMENTS PANEL: present, and every document in it one `document.read` admits for this surveyor.
  {
    const r = await req(`/staff/properties/${claim.property_id}/view.json`);
    const body = JSON.parse(r.body) as { documents?: { documents: { id: string }[] } };
    const surveyor = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'surveying@example.invalid'")!;
    const who = { id: surveyor.id, role: 'SURVEYING' as const, business_id: null, disabled: false };
    const admitted = (body.documents?.documents ?? []).every((x) => {
      const l = made.app.db.get<{ id: string; business_id: string; readers: string; carries_value: number }>(
        'SELECT l.id, l.business_id, t.readers, t.carries_value FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?', [x.id]);
      return l !== undefined && canForProof(who, 'document.read', D.documentObj(made.app.db, l));
    });
    console.log(`    property view.json documents panel: present ${body.documents !== undefined}, ${body.documents?.documents.length ?? 0} documents, every one admitted by document.read ${admitted}`);
    if (body.documents === undefined || !admitted) failures.push('the property view.json documents panel as SURVEYING');
  }
  // THE ADMIN SETTINGS SCREEN, ITS REFUSAL ROUTE, AND MERGING A FIRM: refused outright, and nothing written or recorded.
  const settingsBefore = made.app.db.get<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM vocabularies) + (SELECT COUNT(*) FROM introducer_merges) + (SELECT COUNT(*) FROM audit_log WHERE kind IN (\'CONFIGURATION_REFUSED\', \'INTRODUCER_MERGED\')) AS n')?.n ?? -1;
  const firmId = firm.ok ? firm.id : 'no-firm';
  for (const route of [
    { label: 'the admin settings page', path: '/staff/admin-settings', post: null },
    { label: 'the admin settings view.json', path: '/staff/admin-settings/view.json', post: null },
    { label: 'add a value to a list', path: '/staff/admin-settings/values', post: { list: 'LEAD_SOURCE', code: 'SURVEYOR_ADDED', label: 'x' } },
    { label: 'ask for a forbidden setting', path: '/staff/admin-settings/setting', post: { setting: 'PAID_REGISTER_GATE' } },
    { label: 'merge a firm', path: `/staff/introducers/${firmId}/merge`, post: { into_id: firmId, reason: 'x' } },
  ] as const) {
    const r = route.post === null ? await req(route.path) : await req(route.path, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
    });
    const f = found(r.body, null);
    console.log(`    ${route.label.padEnd(30)} HTTP ${r.status} (must be 403)  by text ${f.byText.length}`);
    if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
  }
  if ((made.app.db.get<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM vocabularies) + (SELECT COUNT(*) FROM introducer_merges) + (SELECT COUNT(*) FROM audit_log WHERE kind IN (\'CONFIGURATION_REFUSED\', \'INTRODUCER_MERGED\')) AS n')?.n ?? -2) !== settingsBefore) {
    failures.push('a refused settings or merge request left something behind');
  }
  console.log('');
}

/* ------------------------------ the CRM follow-on — the team, where a claim came from, the fee, the document centre, the period */

// EXTENDED BY THE CRM FOLLOW-ON, 12 September 2026, to every route it changed or added that a surveyor can reach. The claim
// view now carries a team panel, where the claim came from and the fee expected; a surveyor's must hold the owner and the
// surveyor and nothing else. The claim at INVOICE the follow-on seeds is on the surveyor's own job, with a fee to find.
const invoiceClaim = made.app.db.get<{ id: string }>(
  "SELECT c.id FROM claims c JOIN surveyor_jobs j ON j.claim_id = c.id WHERE c.stage = 'INVOICE' LIMIT 1");
if (invoiceClaim === undefined) throw new Error('the proof found no seeded claim at INVOICE on a survey job');
const SEEDED_FEE = '£4,935'; // Phase 132e: 3% of the seeded £164,500 (it was £8,225 at 5%)
console.log('=== CAPTURED: the CRM follow-on’s routes, as SURVEYING');
for (const id of [claim.id, invoiceClaim.id]) {
  const r = await req(`/staff/claims/${id}/view.json`);
  const body = r.status === 200 ? JSON.parse(r.body) as Record<string, unknown> : {};
  const teamKeys = Object.keys((body['team'] ?? {}) as object).sort();
  const f = found(r.body, body);
  console.log(`    claim view.json (${id === claim.id ? 'the job’s claim' : 'the claim at INVOICE'}) HTTP ${r.status}  team keys ${JSON.stringify(teamKeys)}  origin ${'origin' in body}  estimated_fee ${'estimated_fee' in body}  the fee as text ${r.body.includes(SEEDED_FEE)}  by name ${f.byName.length}, value ${f.byValue.length}, text ${f.byText.length} of 7`);
  if (r.status !== 200 || JSON.stringify(teamKeys) !== JSON.stringify(['may_link', 'owner', 'surveyor', 'surveyor_reach'])) failures.push('the surveyor’s claim team carries more than the owner and the surveyor');
  if ('origin' in body || 'estimated_fee' in body || r.body.includes(SEEDED_FEE)) failures.push('the surveyor’s claim view carries where it came from, or our fee');
  if (f.byName.length + f.byValue.length + f.byText.length > 0) failures.push('the surveyor’s claim view carries the estimate');
  const page = await req(`/staff/claims/${id}`);
  if (page.status !== 200 || page.body.includes(SEEDED_FEE) || page.body.includes('Our estimated fee') || badValues.some((v) => inText(page.body, v))) failures.push('the surveyor’s claim page carries our fee or the estimate');
}
{
  const surveyorUser = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'surveying@example.invalid'")!;
  const surveyorActor = { id: surveyorUser.id, role: 'SURVEYING' as const, business_id: null, disabled: false };
  for (const path of ['/staff/documents/view.json', '/staff/documents', '/staff/dashboard/view.json?period=FINANCIAL_YEAR', '/staff/reports?period=RANGE&from=2026-01-01&to=2026-12-31']) {
    const r = await req(path);
    const parsedBody = path.includes('.json') && r.status === 200 ? JSON.parse(r.body) as { rows?: { id: string }[]; tiles?: { key: string }[] } : null;
    const f = found(r.body, parsedBody);
    const pounds = adminPounds.filter((p) => r.body.includes(p));
    const admitted = (parsedBody?.rows ?? []).every((x) => {
      const l = made.app.db.get<{ id: string; business_id: string; readers: string; carries_value: number }>(
        'SELECT l.id, l.business_id, t.readers, t.carries_value FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?', [x.id]);
      return l !== undefined && canForProof(surveyorActor, 'document.read', D.documentObj(made.app.db, l));
    });
    const tiles = parsedBody?.tiles === undefined ? null : parsedBody.tiles.map((t) => t.key);
    console.log(`    ${path.padEnd(62)} HTTP ${r.status}  by name ${f.byName.length}, value ${f.byValue.length}, text ${f.byText.length} of 7; ADMIN's pound figures ${pounds.length}; rows admitted ${admitted}${tiles === null ? '' : `; tiles ${JSON.stringify(tiles)}`}`);
    if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0 || pounds.length > 0 || !admitted) failures.push(`${path} as SURVEYING`);
    if (parsedBody?.rows !== undefined && parsedBody.rows.some((x) => x.id === invoiceDoc)) failures.push('the document centre listed the fee invoice to SURVEYING');
    if (tiles !== null && JSON.stringify(tiles) !== JSON.stringify(['my_jobs'])) failures.push('the dashboard over a period drew SURVEYING a tile beyond its own survey jobs');
  }
  const contact = made.app.db.get<{ id: string }>('SELECT id FROM contacts WHERE business_id = ? LIMIT 1', [job.business_id])?.id ?? 'no-contact';
  const teamBefore = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claim_contacts')?.n ?? -1;
  for (const route of [
    { label: 'the organisation view.json', path: `/staff/organisations/${job.business_id}/view.json`, post: null },
    { label: 'the audit log', path: '/staff/audit', post: null },
    { label: 'link to the claim team', path: `/staff/claims/${claim.id}/team`, post: { contact_id: contact } },
    { label: 'end a team link', path: '/staff/claim-team/no-such-link/end', post: {} },
  ] as const) {
    const r = route.post === null ? await req(route.path) : await req(route.path, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(route.post).toString(),
    });
    const f = found(r.body, null);
    // A link that does not exist is refused in the words a forbidden one is: 403, never a 404 that confirms it.
    console.log(`    ${route.label.padEnd(30)} HTTP ${r.status} (must be 403)  by text ${f.byText.length}`);
    if (r.status !== 403 || f.byText.length > 0) failures.push(`${route.label} did not refuse SURVEYING`);
  }
  if ((made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claim_contacts')?.n ?? -2) !== teamBefore) failures.push('a refused claim team write left something behind');
}
console.log('');

/* ------------------------------------------------ Phase 132e — THE VIEW-ONLY LOGIN
 *
 * EXTENDED BY PHASE 132e, 16 September 2026. READ_ONLY is assigned to nobody, so the seed has no such user; the proof
 * writes one here, in its own in-memory database, and signs in as it. Every route it may read must carry none of the
 * seven sealed fields, none of ADMIN's pound figures and not our fee; the survey workspace, the money, the registers,
 * the audit log and the export must refuse it outright; and a write must refuse it and leave nothing behind. The ADMIN
 * negative control below is what proves these searches can see the seven where they are. */
console.log('=== CAPTURED: the view-only login (READ_ONLY), on the same seed');
{
  const roId = randomUUID();
  const roHash = await made.app.hasher.hash(s.password);
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    [roId, 'view-only@example.invalid', 'view-only@example.invalid', 'View Only', 'READ_ONLY', roHash, made.app.now(), made.app.now()]);
  cookie = '';
  await req('/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'view-only@example.invalid', password: s.password }).toString(),
  });
  const readable = [
    `/staff/claims/${claim.id}/view.json`, `/staff/claims/${claim.id}`,
    `/staff/claims/${invoiceClaim.id}/view.json`, `/staff/claims/${invoiceClaim.id}`,
    `/staff/properties/${claim.property_id}/view.json`, `/staff/properties/${claim.property_id}`,
    `/staff/organisations/${job.business_id}/view.json`,
    `/staff/leads/${lead.id}/view.json`,
    '/staff/pipeline/view.json', '/staff/pipeline',
    '/staff/dashboard/view.json', '/staff/documents/view.json', '/staff/calendar',
  ];
  for (const path of readable) {
    const r = await req(path);
    const body = path.includes('.json') && r.status === 200 ? JSON.parse(r.body) as unknown : null;
    const f = found(r.body, body);
    const pounds = adminPounds.filter((p) => r.body.includes(p));
    const fee = r.body.includes(SEEDED_FEE);
    console.log(`    ${path.replace(/[0-9a-f-]{36}/g, '<id>').padEnd(44)} HTTP ${r.status}  by name ${f.byName.length}, value ${f.byValue.length}, text ${f.byText.length} of 7; ADMIN's pound figures ${pounds.length}; our fee ${fee}`);
    if (r.status !== 200 || f.byName.length + f.byValue.length + f.byText.length > 0 || pounds.length > 0 || fee) failures.push(`${path} as READ_ONLY`);
  }
  const refusedRo = [
    `/staff/survey/${job.id}/payload.json`, `/staff/survey/${job.id}`, '/staff/finance/view.json',
    '/staff/compliance/view.json', '/staff/compliance/identity', '/staff/audit', '/staff/claims/export.csv',
  ];
  for (const path of refusedRo) {
    const r = await req(path);
    const f = found(r.body, null);
    console.log(`    ${path.replace(/[0-9a-f-]{36}/g, '<id>').padEnd(44)} HTTP ${r.status} (must be 403)  by text ${f.byText.length}`);
    if (r.status !== 403 || f.byText.length > 0) failures.push(`${path} did not refuse READ_ONLY`);
  }
  const auditBefore = made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE outcome = 'ALLOWED' AND actor_id = ?", [roId])?.n ?? -1;
  const stageBefore = made.app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])?.stage;
  const w = await req(`/staff/claims/${claim.id}/team`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ contact_id: 'x' }).toString(),
  });
  console.log(`    a write (link to the claim team)             HTTP ${w.status} (must be 403)`);
  if (w.status !== 403) failures.push('a write did not refuse READ_ONLY');
  if ((made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE outcome = 'ALLOWED' AND actor_id = ?", [roId])?.n ?? -2) !== auditBefore
    || made.app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])?.stage !== stageBefore) {
    failures.push('a refused READ_ONLY write left something behind');
  }
}
console.log('');

console.log('=== NEGATIVE CONTROL: the same searches as ADMIN, where the estimate IS released');
cookie = '';
await req('/login', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'admin@example.invalid', password: s.password }).toString(),
});
const adminJson = await req(`/staff/survey/${job.id}/payload.json`);
const adminParsed = JSON.parse(adminJson.body) as Record<string, unknown>;
const adminSeen = { k: [] as string[], s: [] as string[] };
walk(adminParsed, adminSeen);
console.log("    'estimate' in body        :", 'estimate' in adminParsed);
console.log('      by field name  ->', badKeys.filter((k) => adminSeen.k.includes(k)).length, 'found', JSON.stringify(badKeys.filter((k) => adminSeen.k.includes(k))));
console.log('      by value       ->', badValues.filter((v) => adminSeen.s.includes(String(v))).length, 'found');
console.log('      by raw text    ->', badValues.filter((v) => inText(adminJson.body, v)).length, 'found');
{
  const f = found(adminJson.body, adminParsed);
  if (f.byName.length !== 7 || f.byValue.length !== 7) failures.push('survey payload.json as ADMIN did not carry all seven — the search is blind');
}
for (const route of crmRoutes.filter((x) => x.json)) {
  const r = await req(route.path);
  const f = found(r.body, JSON.parse(r.body) as unknown);
  console.log(`    ${route.label.padEnd(20)} as ADMIN: by name ${f.byName.length} of 7, by value ${f.byValue.length} of 7, by text ${f.byText.length} of 7`);
  if (f.byName.length !== 7 || f.byValue.length !== 7) failures.push(`${route.label} as ADMIN did not carry all seven — the search is blind`);
}
{
  const r = await req(`/staff/leads/${lead.id}/view.json`);
  const f = found(r.body, JSON.parse(r.body) as unknown);
  console.log(`    lead view.json       as ADMIN: by name ${f.byName.length} of 7, by value ${f.byValue.length} of 7, by text ${f.byText.length} of 7`);
  if (r.status !== 200 || f.byName.length !== 7 || f.byValue.length !== 7) failures.push('lead view.json as ADMIN did not carry all seven — the search is blind');
}
// CRM 7 of 10: the finance view.json as ADMIN — open to ADMIN, and built from the invoices alone, so it carries none of the
// sealed estimate's seven for anyone, BY NAME OR BY VALUE. The raw-text count is printed and does not decide here: the
// fee-versus-benefit comparison carries unrounded ratios, and the seed's qualifying percentage, 0.3, is the first three
// characters of one of them (0.3898…). A substring of a longer number is not the value; the structured search is the test.
{
  const r = await req('/staff/finance/view.json');
  const f = found(r.body, r.status === 200 ? JSON.parse(r.body) as unknown : null);
  console.log(`    finance view.json    as ADMIN: HTTP ${r.status}, by name ${f.byName.length} of 7, by value ${f.byValue.length} of 7 — no estimate is built into it for any role (by raw text ${f.byText.length}: a substring of an unrounded ratio, not the value)`);
  if (r.status !== 200 || f.byName.length + f.byValue.length > 0) failures.push('the finance view.json as ADMIN carried an estimate field or value, or did not open');
}
// CRM 8 of 10: the compliance view.json and the retention list as ADMIN — open to ADMIN, and built from the registers
// alone, so they carry none of the sealed estimate's seven for anyone, by name or by value.
for (const path of ['/staff/compliance/view.json', '/staff/compliance/retention/view.json']) {
  const r = await req(path);
  const f = found(r.body, r.status === 200 ? JSON.parse(r.body) as unknown : null);
  console.log(`    ${path.padEnd(38)} as ADMIN: HTTP ${r.status}, by name ${f.byName.length} of 7, by value ${f.byValue.length} of 7`);
  if (r.status !== 200 || f.byName.length + f.byValue.length > 0) failures.push(`${path} as ADMIN carried an estimate field or value, or did not open`);
}
{
  const r = await req('/staff/pipeline/view.json');
  const board = JSON.parse(r.body) as { columns: { cards: { claim_ref: string; value?: string }[] }[]; on_hold: { claim_ref: string; value?: string }[] };
  const card = [...board.columns.flatMap((c) => c.cards), ...board.on_hold].find((c) => c.claim_ref === claim.claim_ref);
  console.log(`    pipeline view.json   as ADMIN: the job's card ${card === undefined ? 'is missing' : `carries value ${JSON.stringify(card.value)}`}`);
  if (r.status !== 200 || card === undefined || card.value === undefined) failures.push('the board as ADMIN carried no value on the job’s card — the search is blind');
}
{
  // CRM 3 of 10: the tasks and the timeline sit inside a response the search finds all seven in.
  const r = await req(`/staff/claims/${claim.id}/view.json`);
  const body = JSON.parse(r.body) as Record<string, unknown>;
  const f = found(r.body, body);
  console.log(`    claim view.json      as ADMIN: tasks ${'tasks' in body}, timeline ${'timeline' in body}, by name ${f.byName.length} of 7, by value ${f.byValue.length} of 7`);
  if (!('tasks' in body) || !('timeline' in body) || f.byName.length !== 7 || f.byValue.length !== 7) {
    failures.push('the claim view.json as ADMIN did not carry its tasks, its timeline and all seven');
  }
  // CRM 4 of 10: the documents panel sits inside the same response, and the search still finds all seven there.
  console.log(`    claim view.json      as ADMIN: documents ${'documents' in body} (the lease and the fee invoice both listed: ${
    JSON.stringify(((body['documents'] as { documents?: { id: string }[] } | undefined)?.documents ?? []).map((x) => x.id).sort()) === JSON.stringify([lease, invoiceDoc].sort())})`);
  if (!('documents' in body)) failures.push('the claim view.json as ADMIN did not carry its documents');
  for (const path of [`/staff/documents/${lease}/view.json`, `/staff/documents/${invoiceDoc}/view.json`]) {
    const x = await req(path);
    const g = found(x.body, x.status === 200 ? JSON.parse(x.body) as unknown : null);
    console.log(`    ${path.replace(/[0-9a-f-]{36}/, '<doc>').padEnd(21)} as ADMIN: HTTP ${x.status}, by raw text ${g.byText.length} of 7 — a document's page builds no estimate for anyone`);
    if (x.status !== 200 || g.byName.length + g.byValue.length + g.byText.length > 0) failures.push(`${path} as ADMIN`);
  }
  // CRM 5 of 10: a firm's view.json as ADMIN. It carries the estimated value of what the firm referred — a sum, for
  // ADMIN and SALES — and builds none of the sealed estimate's seven fields by name for anyone.
  {
    const x = await req(`/staff/introducers/${firm.id}/view.json`);
    const g = found(x.body, x.status === 200 ? JSON.parse(x.body) as unknown : null);
    console.log(`    /staff/introducers/<firm>/view.json as ADMIN: HTTP ${x.status}, by name ${g.byName.length} of 7, value reading ${'value' in (x.status === 200 ? JSON.parse(x.body) as object : {})}`);
    if (x.status !== 200 || g.byName.length > 0) failures.push('the introducer view.json as ADMIN');
  }
  // CRM 6 of 10: the same claim view.json as ADMIN carries the whole facts panel with the proof's amounts, the four
  // figures with the sealed estimate inside them, the deliverables and aftercare — so the search above could have found them.
  {
    const hasCrm6 = ['facts', 'figures', 'deliverables', 'aftercare'].every((k) => k in body);
    const amounts = CRM6_AMOUNTS.filter((x) => r.body.includes(x)).length;
    const figures = body['figures'] as { a_indicative?: { estimate?: unknown } } | undefined;
    const inFigures = found(JSON.stringify(figures ?? {}), figures ?? null);
    console.log(`    claim view.json      as ADMIN: facts, figures, deliverables, aftercare ${hasCrm6}; the proof's amounts ${amounts} of ${CRM6_AMOUNTS.length}; the figures panel by name ${inFigures.byName.length} of 7`);
    if (!hasCrm6 || amounts !== CRM6_AMOUNTS.length || inFigures.byName.length !== 7) {
      failures.push('the claim view.json as ADMIN did not carry the facts, the figures with the estimate, the deliverables and aftercare — the CRM 6 search is blind');
    }
  }
  for (const path of ['/staff', '/staff/tasks/view.json']) {
    const x = await req(path);
    const g = found(x.body, path.endsWith('.json') && x.status === 200 ? JSON.parse(x.body) as unknown : null);
    console.log(`    ${path.padEnd(21)}as ADMIN: by raw text ${g.byText.length} of 7 — no estimate is built into it for any role`);
    if (x.status !== 200 || g.byName.length + g.byValue.length + g.byText.length > 0) failures.push(`${path} carried an estimate value as ADMIN`);
  }
}
console.log('');
// CRM 9 of 10: THE DASHBOARD AS ADMIN draws every tile, and its open pipeline carries a pound figure — so the searches
// above had something to find. It carries none of the seven fields by name, being built of sums.
{
  const r = await req('/staff/dashboard/view.json');
  const body = r.status === 200 ? JSON.parse(r.body) as { tiles: { key: string; lines: { value: string }[] }[] } : null;
  const pipeline = body?.tiles.find((t) => t.key === 'open_pipeline_value');
  const hasPounds = pipeline?.lines.some((l) => /£[\d,]+/.test(l.value)) ?? false;
  const g = found(r.body, body);
  console.log(`    /staff/dashboard/view.json as ADMIN: HTTP ${r.status}, ${body?.tiles.length ?? 0} tiles, the open pipeline carries a pound figure ${hasPounds}, by name ${g.byName.length} of 7; pound figures to search for ${adminPounds.length}`);
  if (r.status !== 200 || !hasPounds || g.byName.length > 0 || adminPounds.length === 0) {
    failures.push('the dashboard as ADMIN carried no pipeline figure, or a sealed field by name — the dashboard search is blind');
  }
}
console.log('');
// CRM 9 of 10: SEARCH AND EXPORT AS ADMIN — the controls. Search finds every claim by its reference and every kind is
// searched; the claims export carries the value column. Neither carries a sealed field by name or a raw pence value.
{
  const r = await req('/staff/search/view.json?q=CR-');
  const body = r.status === 200 ? JSON.parse(r.body) as { hits: { kind: string }[]; scope: { searched: string }[] } : null;
  const claims = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n ?? -1;
  const found0 = found(r.body, body);
  const claimHits = body?.hits.filter((x) => x.kind === 'CLAIM').length ?? 0;
  console.log(`    /staff/search/view.json?q=CR- as ADMIN: HTTP ${r.status}, claim hits ${claimHits} of ${claims}, every kind searched ${body?.scope.every((x) => x.searched === 'ALL') ?? false}, by name ${found0.byName.length} of 7`);
  if (r.status !== 200 || claimHits !== Math.min(claims, 25) || found0.byName.length > 0) failures.push('search as ADMIN did not find every claim — the search check is blind');
  const x = await req('/staff/claims/export.csv');
  const header = x.body.split('\r\n')[0] ?? '';
  const g = found(x.body, null);
  console.log(`    /staff/claims/export.csv as ADMIN: HTTP ${x.status}, value column ${/Estimated value/.test(header)}, raw sealed values by text ${g.byText.length} of 7`);
  if (x.status !== 200 || !/Estimated value/.test(header)) failures.push('the claims export as ADMIN carried no value column — the export check is blind');
}
// CRM 9 of 10: THE ADMIN SETTINGS SCREEN AS ADMIN — the control. It opens, it carries the finance and compliance settings, and
// being built of lists and settings it carries none of the seven by name or by value.
{
  const r = await req('/staff/admin-settings/view.json');
  const body = r.status === 200 ? JSON.parse(r.body) as { finance?: unknown; compliance?: unknown; lists: unknown[] } : null;
  const g = found(r.body, body);
  console.log(`    /staff/admin-settings/view.json as ADMIN: HTTP ${r.status}, ${body?.lists.length ?? 0} lists, finance ${body?.finance !== undefined}, compliance ${body?.compliance !== undefined}, by name ${g.byName.length} of 7, by value ${g.byValue.length} of 7`);
  if (r.status !== 200 || body?.finance === undefined || body.compliance === undefined || g.byName.length + g.byValue.length > 0) {
    failures.push('the admin settings view.json as ADMIN did not open with its settings, or carried an estimate field or value');
  }
}
// THE CRM FOLLOW-ON, AS ADMIN — the controls. The claim at INVOICE carries the fee the finance view expects, so the fee search
// above had something to find; the organisation's view.json carries its claims' values, so the refusal above hid something;
// and the document centre lists the fee invoice the surveyor was not listed.
{
  const r = await req(`/staff/claims/${invoiceClaim.id}/view.json`);
  const body = r.status === 200 ? JSON.parse(r.body) as { estimated_fee?: { amount?: string | null }; team?: { tax_adviser?: unknown } } : {};
  console.log(`    claim view.json at INVOICE as ADMIN: HTTP ${r.status}, estimated fee ${JSON.stringify(body.estimated_fee?.amount)}, the sign-off record on the team ${body.team?.tax_adviser !== undefined}`);
  if (r.status !== 200 || body.estimated_fee?.amount !== SEEDED_FEE || body.team?.tax_adviser === undefined) failures.push('the claim at INVOICE as ADMIN carried no fee or no sign-off record — the follow-on’s search is blind');
  const o = await req(`/staff/organisations/${job.business_id}/view.json`);
  const g = found(o.body, o.status === 200 ? JSON.parse(o.body) as unknown : null);
  console.log(`    organisation view.json as ADMIN: HTTP ${o.status}, by name ${g.byName.length} of 7, by value ${g.byValue.length} of 7`);
  if (o.status !== 200 || g.byName.length !== 7 || g.byValue.length !== 7) failures.push('the organisation view.json as ADMIN did not carry all seven — the refusal above proves nothing');
  const c = await req('/staff/documents/view.json');
  const rows = c.status === 200 ? (JSON.parse(c.body) as { rows: { id: string }[] }).rows.map((x) => x.id) : [];
  console.log(`    /staff/documents/view.json as ADMIN: HTTP ${c.status}, the fee invoice listed ${rows.includes(invoiceDoc)}, the lease listed ${rows.includes(lease)}`);
  if (c.status !== 200 || !rows.includes(invoiceDoc) || !rows.includes(lease)) failures.push('the document centre as ADMIN did not list the fee invoice and the lease — the centre check is blind');
  const a = await req('/staff/audit');
  console.log(`    /staff/audit as ADMIN: HTTP ${a.status}, the audit log said nothing changed ${/Audit log checked — nothing changed/.test(a.body)}`);
  if (a.status !== 200 || !/Audit log checked — nothing changed/.test(a.body)) failures.push('the audit log as ADMIN did not open saying nothing changed (Phase 144 wording; the chain check itself is unchanged)');
}
// PHASE 142 — THE TEAM THREAD NEVER REACHES THE PORTAL, AND NEITHER THREAD REACHES THE SURVEYOR. A team message with words
// found nowhere else is written; the client's portal, every page of it, and the staff pages a client or a surveyor might
// type, are fetched and searched as raw text for those words. The control: the same words ARE on Admin's page.
{
  const clientUser = made.app.db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM users WHERE role = 'CLIENT'")!;
  const salesUser = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES'")!;
  const SECRET = `TEAM-ONLY-PROOF-${randomUUID()}`;
  const note = addNote({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID },
    { id: salesUser.id, role: 'SALES', business_id: null, disabled: false }, clientUser.business_id, `${SECRET} staff only`);
  if (!note.ok) failures.push('the proof could not write its team message');
  const session = async (who: string): Promise<(path: string) => Promise<{ status: number; body: string }>> => {
    let jar = '';
    const go = async (path: string, init: RequestInit = {}) => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (jar) headers['cookie'] = jar;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length) jar = set.map((x) => x.split(';')[0]).join('; ');
      return { status: r.status, body: await r.text() };
    };
    await go('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString() });
    return (path) => go(path);
  };
  const biz = clientUser.business_id;
  const noteId = note.ok ? note.id : 'none';
  const claimPaths = made.app.db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [biz]).map((r) => `/portal/claims/${r.id}`);
  const asClient = await session('client');
  console.log('=== PHASE 142: the team thread, searched on the wire as CLIENT and as SURVEYING');
  for (const path of ['/portal', '/portal/messages', '/portal/help', '/portal/letter', ...claimPaths, `/portal/messages/${noteId}`,
    `/staff/clients/${biz}?chat=team`, `/staff/clients/${biz}?chat=client`]) {
    const r = await asClient(path);
    const hit = r.body.includes(SECRET);
    console.log(`    as CLIENT     ${path.slice(0, 60).padEnd(60)} HTTP ${r.status}  team words found ${hit}`);
    if (hit) failures.push(`${path} carried a team message to the client`);
    if (path === `/portal/messages/${noteId}` && r.status !== 404) failures.push('a team message asked for by id did not answer 404 to the client');
  }
  const asSurveyor = await session('surveying');
  for (const path of [`/staff/clients/${biz}?chat=team`, `/staff/clients/${biz}?chat=client`, '/staff/replies']) {
    const r = await asSurveyor(path);
    const hit = r.body.includes(SECRET) || /class="chattabs"/.test(r.body);
    console.log(`    as SURVEYING  ${path.slice(0, 60).padEnd(60)} HTTP ${r.status}  a thread found ${hit}`);
    if (hit) failures.push(`${path} showed a chat thread to the surveyor`);
  }
  const asAdmin = await session('admin');
  const control = await asAdmin(`/staff/clients/${biz}?chat=team`);
  console.log(`    as ADMIN      the team tab: HTTP ${control.status}  team words found ${control.body.includes(SECRET)} (must be true — the control)`);
  if (control.status !== 200 || !control.body.includes(SECRET)) failures.push('the team words are not on Admin’s page either — the search above proves nothing');
}
console.log('');
console.log('=== THE FIRST 900 BYTES OF THE SURVEYOR PAYLOAD, VERBATIM');
console.log(json.body.slice(0, 900));
console.log('');
console.log(failures.length === 0
  ? '=== VERDICT: PASS — surveyor 0 of 7 on every route it can reach and refused every other; view-only 0 of 7 and no fee on every route it reads, and refused the rest; admin 7 of 7 on every JSON route that carries the estimate, and 0 of 7 on the routes that carry none for anyone'
  : `=== VERDICT: FAIL — ${failures.join('; ')}`);
made.close();
process.exit(failures.length === 0 ? 0 : 1);
