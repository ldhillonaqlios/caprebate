/**
 * PHASE 161m2 STEP 2, AREA C: THE ACCOUNTANT, MONEY, CLOSING, INTRODUCER AND TEMPLATE EMAILS ON THE BRANDED LAYOUT.
 *
 * Each email in the approved wording (05-reports-and-templates/emails/emails.py): its subject, an HTML version with its
 * heading and its button's address, and the key sentence of its plain text. The two new emails (claim-complete and
 * no-claim) are queued once, to the client's own address, by a person's closing move, and not where a rule says no.
 * The money emails are in test/finance/invoices-and-fee-controls.test.ts, section 5a.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Snapshot } from '../../src/modules/survey/pack-approve.ts';
import { signoffEmail } from '../../src/modules/survey/report-signoff.ts';
import { confirmEmail } from '../../src/modules/portal/accountant-confirm.ts';
import { introducerUpdateEmail } from '../../src/modules/crm/introducers.ts';
import { templateEmail, companyFirst, mergeText } from '../../src/modules/admin/templates.ts';
import * as C from '../../src/modules/crm/crm.ts';
import * as P from '../../src/modules/crm/pipeline.ts';
import { insertTask } from '../../src/modules/clients/index.ts';
import { loadPipelineClaim } from '../../src/modules/claims/index.ts';
import { actor, testApp } from '../helpers.ts';

const ORIGIN = 'https://caprebate.example.invalid';
const T0 = '2026-09-08T00:00:00.000Z';
type App = Awaited<ReturnType<typeof testApp>>;

const button = (html: string, label: string, href: string): boolean =>
  html.includes(`<a href="${href}"`) && new RegExp(`>${label}</a>`).test(html);

/* ------------------------------------------------------------------ the accountant */

describe('the accountant’s emails', () => {
  const snapshot = { property: { id: 'p', label: '3 Meltham Road, Huddersfield', postcode: 'HD1 3XH' }, sums: { qualifying_pence: 123_456_00 } } as unknown as Snapshot;

  test('accountant-signoff: the approved subject, the figure, the one-use link as the button', () => {
    const link = `${ORIGIN}/signoff/abc`;
    const e = signoffEmail('Avery Accountant', 'Smith & Jones Dental Limited', snapshot, link, '2026-12-11T10:00:00.000Z', ORIGIN);
    assert.equal(e.subject, 'Capital allowances report to sign off: Smith & Jones Dental Limited');
    assert.match(e.html, /<h1[^>]*>A capital allowances report for you<\/h1>/);
    assert.ok(button(e.html, 'Review and sign off', link), 'the button is not the link');
    assert.match(e.html, /Smith &amp; Jones Dental Limited has asked us/);
    assert.match(e.text, /^Smith & Jones Dental Limited has asked us to send you their capital allowances report for 3 Meltham Road, Huddersfield, HD1 3XH\. It is attached, with the figures as a spreadsheet\.$/m);
    assert.match(e.text, /^Capital allowances identified: £123,456$/m);
    assert.match(e.text, /The link works once, until 11 December 2026\.$/m);
    const none = signoffEmail('A', 'B Limited', { ...snapshot, property: null } as unknown as Snapshot, link, '2026-12-11T10:00:00.000Z', ORIGIN);
    assert.match(none.text, /^B Limited has asked us to send you their capital allowances report\. It is attached/m, 'a missing property was invented');
  });

  test('accountant-confirm, RETURN_FIT: thanks for the sign-off only where the accountant signed; names the one return', () => {
    const link = `${ORIGIN}/confirm/abc`;
    const signed = confirmEmail({ name: 'Avery', company: 'Smith & Jones Limited', kind: 'RETURN_FIT', link, period_end: '2025-03-31', signed: true, publicOrigin: ORIGIN });
    assert.equal(signed.subject, 'Please confirm the claim fits the return: Smith & Jones Limited');
    assert.match(signed.html, /<h1[^>]*>Please confirm the claim fits the return<\/h1>/);
    assert.ok(button(signed.html, 'Confirm', link));
    assert.match(signed.text, /^Thank you for signing off the capital allowances report for Smith & Jones Limited\. Please confirm the claim fits the tax return for the period ending 31 Mar 2025\.$/m);
    assert.match(signed.text, /^When the return has been filed, we send a second email with the subject "Please confirm the amended return was filed: Smith & Jones Limited" and the same button\.$/m);
    const not = confirmEmail({ name: 'Avery', company: 'Smith & Jones Limited', kind: 'RETURN_FIT', link, period_end: null, signed: false, publicOrigin: ORIGIN });
    assert.match(not.text, /^We are working with Smith & Jones Limited on their capital allowances claim\. Please confirm the claim fits the tax return\.$/m);
    assert.equal(not.text.includes('Thank you for signing off'), false, 'thanked an accountant who did not sign off');
  });

  test('accountant-confirm, FILED: its own subject, heading and the return it asks about', () => {
    const link = `${ORIGIN}/confirm/def`;
    const e = confirmEmail({ name: 'Avery', company: 'Smith Limited', kind: 'FILED', link, period_end: '2024-12-31', signed: false, publicOrigin: ORIGIN });
    assert.equal(e.subject, 'Please confirm the amended return was filed: Smith Limited');
    assert.match(e.html, /<h1[^>]*>Please confirm the amended return was filed<\/h1>/);
    assert.ok(button(e.html, 'Confirm', link));
    assert.match(e.text, /Please confirm the amended tax return for the period ending 31 Dec 2024, carrying its part of the claim, has been filed, and give us the day it was filed\.$/m);
    assert.equal(e.text.includes('we send a second email'), false);
  });
});

/* ------------------------------------------------------------------ the introducer and the templates */

describe('the introducer’s update and the template emails', () => {
  test('introducer-update: the facts, the stage’s own words, the reason’s label; values escaped in the HTML only', () => {
    const e = introducerUpdateEmail({ firm: 'Ledger & Co', person: 'Pat Partner', organisation: 'Meadow <Dental> Limited', notice: 'REASONED_NEGATIVE', reason: 'The tax adviser directed a reasoned negative', date: '2026-11-11T10:00:00.000Z' });
    assert.equal(e.subject, 'Cap Rebate update: Meadow <Dental> Limited');
    assert.match(e.html, /<h1[^>]*>An update on Meadow &lt;Dental&gt; Limited<\/h1>/);
    assert.equal(e.html.includes('<Dental>'), false, 'a value made a tag');
    assert.equal(/<a href=/.test(e.html), false, 'the update carries a button');
    assert.match(e.text, /^Dear Pat Partner,$/m);
    assert.match(e.text, /^Stage: Reasoned negative$/m);
    assert.match(e.text, /^Date: 11 Nov 2026$/m);
    assert.match(e.text, /^There is no claim to make, and the client keeps a written report saying why\. The reason: The tax adviser directed a reasoned negative\.$/m);
    assert.match(e.text, /^You are receiving this because Meadow <Dental> Limited asked us to keep you updated\. Thank you for the introduction\.$/m);
    assert.match(introducerUpdateEmail({ firm: 'Ledger & Co', person: null, organisation: 'X Limited', notice: 'ENGAGED', reason: null, date: T0 }).text, /^Dear Ledger & Co,$/m);
  });

  test('THE TEMPLATE FIX: the plain text carries “Smith & Co”, never “Smith &amp; Co”; the HTML escapes it; the sign-off is the layout’s', () => {
    const v = { contact_name: 'Jo <Bloggs>', organisation: 'Smith & Co', property_address: null, claim_reference: 'CR-2026-0001', next_action: 'send the plans', due_date: '31 Dec 2026' };
    const subject = companyFirst(mergeText('the next step on your claim', v, true).text, v.organisation);
    const body = mergeText('Dear {{contact_name}},\n\nThis is about {{claim_reference}} for {{organisation}}, on {{property_address}}.\n\nThe next step is: {{next_action}}.\n\nCap Rebate', v, false).text;
    assert.equal(subject, 'Smith & Co: the next step on your claim');
    const e = templateEmail(subject, body, ORIGIN);
    assert.equal(e.subject, 'Smith & Co: the next step on your claim');
    assert.match(e.text, /^This is about CR-2026-0001 for Smith & Co, on \[property address not recorded\]\.$/m);
    assert.match(e.text, /^Dear Jo <Bloggs>,$/m);
    assert.equal(/&amp;|&lt;/.test(e.text), false, 'the plain text was HTML-escaped');
    assert.match(e.html, /<h1[^>]*>Smith &amp; Co: the next step on your claim<\/h1>/);
    assert.match(e.html, /Dear Jo &lt;Bloggs&gt;,/);
    assert.equal(e.html.includes('<Bloggs>'), false);
    assert.equal(/^Cap Rebate$/m.test(e.text), false, 'the template’s own sign-off was said twice');
    assert.match(e.text, /^Kind regards,\nThe Cap Rebate team$/m);
  });
});

/* ------------------------------------------------------------------ closing a claim */

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES'] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

let n = 0;
function claimAt(app: App, stage: string, email: string | null = 'office@meadow.example.com'): { business: string; claim: string } {
  n += 1;
  const business = `bc-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,contact_email) VALUES (?,?,?,?,?,?)', [business, `Meadow ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0, email]);
  const property = `pc-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,address_line_1,town,postcode,created_at) VALUES (?,?,?,?,?,?,?)', [property, business, 'Main site', '1 High Street', 'Hinckley', 'LE10 1AA', T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, { business_id: business, property_id: property, assessment_id: null, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null });
  P.recordOpened({ db: app.db, now: app.now, newId: randomUUID }, null, made.id, stage, 'a test fixture');
  insertTask(app.db, app.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null, activity_type: 'TASK',
    business_id: business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null, fact_id: null, recurrence: null, recurred_from_id: null,
    is_next_action: true, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
  });
  return { business, claim: made.id };
}

type Row = { to_email: string; subject: string; body: string; html_body: string | null; kind: string; claim_id: string | null };
const told = (app: App, claim: string): Row[] =>
  app.db.all<Row>("SELECT to_email, subject, body, html_body, kind, claim_id FROM outbox WHERE claim_id = ? AND kind = 'NOTIFICATION' ORDER BY rowid", [claim]);

describe('closing a claim tells the client, once', () => {
  test('no-claim: a person’s exit to a reasoned negative queues exactly one email to the client’s address; it says there is no fee', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = claimAt(app, 'REPORTS');
      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, email: app.email, origin: ORIGIN };
      const r = P.moveClaim(d, actor('SALES'), claim, { kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'ADVISER_DIRECTED_NEGATIVE', reason: 'Spoke to Jane Doe' });
      assert.ok(r.ok, r.ok ? '' : r.why);
      const rows = told(app, claim);
      assert.equal(rows.length, 1);
      const e = rows[0]!;
      assert.equal(e.to_email, 'office@meadow.example.com');
      assert.equal(e.subject, 'The result of your survey: 1 High Street, Hinckley, LE10 1AA');
      assert.match(e.html_body ?? '', /<h1[^>]*>The result of your survey<\/h1>/);
      assert.ok(button(e.html_body ?? '', 'Read our findings', `${ORIGIN}/portal`));
      assert.match(e.body, /^As our engagement letter says, there is no fee when we find no material claim\.$/m);
      assert.match(e.body, /^The tax adviser directed a reasoned negative\.$/m);
      assert.equal(e.body.includes('Jane Doe'), false, 'the staff note reached the client');
    } finally { app.close(); }
  });

  test('no-claim before the survey says “our review”; “another reason” sends no reason; without the email at hand nothing is sent', async () => {
    const app = await testApp();
    try {
      staff(app);
      const early = claimAt(app, 'DATA_GATHERING');
      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, email: app.email, origin: ORIGIN };
      assert.ok(P.moveClaim(d, actor('SALES'), early.claim, { kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'OTHER', reason: 'staff prose here' }).ok);
      const e = told(app, early.claim);
      assert.equal(e.length, 1);
      assert.match(e[0]!.subject, /^The result of our review/);
      assert.match(e[0]!.body, /^Thank you for working with us on 1 High Street, Hinckley, LE10 1AA\. After our review, we have not found/m);
      assert.equal(e[0]!.body.includes('staff prose'), false);
      const quiet = claimAt(app, 'REPORTS');
      assert.ok(P.moveClaim({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, actor('SALES'), quiet.claim, { kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'ADVISER_DIRECTED_NEGATIVE' }).ok);
      assert.deepEqual(told(app, quiet.claim), [], 'a move without the email at hand sent one');
      // Another exit tells nothing.
      const other = claimAt(app, 'REPORTS');
      assert.ok(P.moveClaim(d, actor('SALES'), other.claim, { kind: 'EXIT', to: 'CLIENT_WITHDREW', reason_code: 'CLIENT_REJECTED_REPORT' }).ok);
      assert.deepEqual(told(app, other.claim), []);
    } finally { app.close(); }
  });

  test('claim-complete: one email to the client, never a second; none to a company marked do not contact or with no address', async () => {
    const app = await testApp();
    try {
      staff(app);
      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, email: app.email, origin: ORIGIN };
      const { claim } = claimAt(app, 'DEFENCE_PACK');
      const pc = { ...loadPipelineClaim(app.db, claim) };
      assert.equal(P.tellClientClaimEnded(d, actor('SALES'), pc, 'COMPLETE', { from: 'DEFENCE_PACK', reason_code: null }), true);
      assert.equal(P.tellClientClaimEnded(d, actor('SALES'), pc, 'COMPLETE', { from: 'DEFENCE_PACK', reason_code: null }), false, 'told twice');
      const rows = told(app, claim);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.to_email, 'office@meadow.example.com');
      assert.equal(rows[0]!.subject, P.CLAIM_COMPLETE_SUBJECT);
      assert.match(rows[0]!.html_body ?? '', /<h1[^>]*>Your claim is complete<\/h1>/);
      assert.ok(button(rows[0]!.html_body ?? '', 'Open your portal', `${ORIGIN}/portal`));
      assert.match(rows[0]!.body, /^Your capital allowances claim for 1 High Street, Hinckley, LE10 1AA is complete\. Thank you for working with us\.$/m);

      const dnc = claimAt(app, 'DEFENCE_PACK');
      app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [dnc.business]);
      assert.equal(P.tellClientClaimEnded(d, actor('SALES'), { ...loadPipelineClaim(app.db, dnc.claim) }, 'COMPLETE', { from: 'DEFENCE_PACK', reason_code: null }), false);
      assert.deepEqual(told(app, dnc.claim), []);
      const nobody = claimAt(app, 'DEFENCE_PACK', null);
      assert.equal(P.tellClientClaimEnded(d, actor('SALES'), { ...loadPipelineClaim(app.db, nobody.claim) }, 'COMPLETE', { from: 'DEFENCE_PACK', reason_code: null }), false);
      assert.deepEqual(told(app, nobody.claim), []);
    } finally { app.close(); }
  });
});
