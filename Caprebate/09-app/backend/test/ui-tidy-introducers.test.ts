/**
 * UI TIDY PHASE 14 — INTRODUCERS, 3 October 2026 (src/web/introducers-pages.ts).
 * The list opens with its two buttons and boxes counting the firms and what they sent; the reward model is a label;
 * the firms are one table — owner, contact, what they sent — that stacks on a phone, nobody in amber, a late next contact
 * in red; the two forms fold until a button or a refusal opens them. A firm's page has the way back, a line saying who
 * owns it and when it is next contacted, the same boxes, its sections in the left-hand menu and its forms folded.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as I from '../src/web/introducers.ts';
import { ukDatesIn } from '../src/web/localtime.ts';
import { firstPart, introducerCounts, rewardBadge, sentUs, RECORD_REFERRAL_HREF, ADD_FIRM_HREF } from '../src/web/introducers-pages.ts';
import { plainDashes } from '../src/web/plain-dashes.ts';

let H: Harness;
let referred = '';
let bare = '';
before(async () => {
  H = await startHarness('uit14');
  const r = await H.post('sales', '/staff/referrals', { firm_name: 'Harrow & Lane Accountants', contact_name: 'Priya Shah', prospect_organisation: 'Kestrel Dental Care Limited' });
  assert.equal(r.status, 303);
  await H.post('sales', '/staff/referrals', { firm_name: 'Harrow & Lane Accountants', introducer_id: '', contact_name: 'Sam Lee', prospect_organisation: 'Willowbank Care Homes Limited' });
  const f = await H.post('sales', '/staff/introducers', { firm_name: 'Pell & Marsh Accountants' });
  assert.equal(f.status, 303);
  bare = /\/staff\/introducers\/([A-Za-z0-9-]+)/.exec(f.location ?? '')?.[1] ?? '';
  referred = H.made.app.db.get<{ id: string }>("SELECT id FROM introducers WHERE firm_name = 'Harrow & Lane Accountants' ORDER BY created_at LIMIT 1")?.id ?? '';
  // A next contact planned for Pell & Marsh, then put in the past: it is late.
  const page = (await H.get('sales', `/staff/introducers/${bare}`)).body;
  const plan = /<form method="post" action="\/staff\/introducers\/[^"]+\/next-contact">[\s\S]*?<\/form>/.exec(page)?.[0] ?? '';
  const kind = /<select name="kind"><option value=""[^>]*>[^<]*<\/option><option value="([^"]+)"/.exec(plan)?.[1] ?? '';
  const owner = /<select name="owner_id"><option value=""[^>]*>[^<]*<\/option><option value="([^"]+)"/.exec(plan)?.[1] ?? '';
  const p = await H.post('sales', `/staff/introducers/${bare}/next-contact`, { kind, title: 'Call about the practice event', owner_id: owner, due_on: '2026-12-01' });
  assert.equal(p.status, 303, `the next contact was not planned: ${kind} ${owner} ${/<p class="fielderr"[^>]*>([\s\S]*?)<\/p>|<div class="formerr"[^>]*>([\s\S]*?)<\/div>/.exec(p.body)?.[0] ?? p.body.slice(0, 300)}`);
  H.made.app.db.run("UPDATE staff_tasks SET due_on = '2026-09-01' WHERE introducer_id = ?", [bare]);
});
after(() => H.close());

const list = (): I.IntroducerRow[] => I.introducerList(H.made.app.db, H.actor('sales'), H.made.app.now());
const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-([a-z]+)" href="[^"]*"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);
const esc = (s: string): string => ukDatesIn(s.replace(/&/g, '&amp;'));

describe('UI tidy phase 14: the pieces', () => {
  test('what a firm sent us, in one cell, in the singular or the plural', () => {
    assert.equal(sentUs({ leads_referred: 1, claims_opened: 1, claims_won: 0, reasoned_negatives: 1 }).html,
      '1 lead, 1 claim opened, 0 won<br><span class="help">1 reasoned negative</span>');
    assert.equal(sentUs({ leads_referred: 3, claims_opened: 2, claims_won: 2, reasoned_negatives: 0 }).html,
      '3 leads, 2 claims opened, 2 won<br><span class="help">0 reasoned negatives</span>');
  });

  test('a reading’s first part; the reward model in a word', () => {
    assert.equal(firstPart('none recorded — no call, email, meeting or reciprocity with this firm is logged'), 'none recorded');
    assert.equal(firstPart('5 Oct 2026'), '5 Oct 2026');
    assert.equal(rewardBadge('OFF').html, '<span class="badge b-nodate">Off</span>');
    assert.equal(rewardBadge('B_DISCLOSED_FEE').html, '<span class="badge b-info">Model B</span>');
  });

  test('the counts add up over the firms read in full, and count the late next contacts', () => {
    const p = (l: number, c: number, w: number) => ({ leads_referred: l, claims_opened: c, claims_won: w, reasoned_negatives: 0 }) as I.IntroducerRow['pipeline'];
    const d = (overdue: boolean) => ({ type: 'x', owner: null, last_contact: 'x', next_contact: { label: 'x', overdue }, from_public_form: false });
    assert.deepEqual(introducerCounts([
      { id: 'a', firm_name: 'A', details: d(true), pipeline: p(2, 1, 1) }, { id: 'b', firm_name: 'B', details: d(false), pipeline: p(3, 2, 0) },
      { id: 'c', firm_name: 'C' },
    ] as I.IntroducerRow[]), { firms: 3, leads: 5, claims: 3, won: 1, late: 1 });
  });
});

describe('UI tidy phase 14: the list', () => {
  test('the top: two buttons for Sales, five boxes from the same list, the reward model as a label', async () => {
    const rows = list();
    const n = introducerCounts(rows);
    assert.equal(n.late, 1);
    const body = (await H.get('sales', '/staff/introducers')).body;
    assert.match(body, new RegExp(`<p><a class="btn" href="${ADD_FIRM_HREF.replace(/[?]/g, '\\?')}">Add a firm</a> <a class="btn btn-primary" href="${RECORD_REFERRAL_HREF.replace(/[?]/g, '\\?')}">Record a referral</a></p>`));
    assert.deepEqual(kpis(body), [
      ['total', 'Firms', String(n.firms)], ['win', 'Leads referred', String(n.leads)], ['survey', 'Claims opened', String(n.claims)],
      ['paid', 'Claims won', String(n.won)], ['late', 'Next contact late', '1'],
    ]);
    assert.match(body, /<p class="rewardline">The reward model: <span class="badge b-nodate">Off<\/span> <a href="\/staff\/introducer-rewards">/);
  });

  test('each firm: its owner or Nobody yet, its contact short or red when late, what it sent in one cell', async () => {
    const body = (await H.get('sales', '/staff/introducers')).body;
    for (const r of list()) {
      const row = new RegExp(`<tr><td><a href="/staff/introducers/${r.id}">[\\s\\S]*?</tr>`).exec(body)?.[0] ?? '';
      assert.ok(row !== '', r.firm_name);
      const d = r.details; const p = r.pipeline;
      assert.ok(d !== undefined && p !== undefined);
      assert.ok(row.includes(`<td data-label="Owner">${d.owner === null ? '<span class="badge b-nobody">Nobody yet</span>' : esc(d.owner)}</td>`), r.firm_name);
      const next = d.next_contact.overdue ? `<span class="badge b-late">${esc(d.next_contact.label)}</span>` : esc(firstPart(d.next_contact.label));
      assert.ok(row.includes(plainDashes(`<td data-label="Contact">Last: ${esc(firstPart(d.last_contact))}<br>Next: ${next}</td>`)), r.firm_name);
      assert.ok(row.includes(`<td data-label="Sent us">${sentUs(p).html}</td>`), r.firm_name);
      assert.equal(row.includes('<span class="help">not recorded</span>'), false, 'a kind nobody recorded is not shown as one');
    }
    assert.match(body, /<table class="stack">\s*<thead><tr><th>Firm<\/th><th>Owner<\/th><th>Contact<\/th><th>Sent us<\/th><\/tr><\/thead>/);
  });

  test('the forms are folded, each button opens its own, and a refusal opens the form with what was typed', async () => {
    const fold = (body: string, id: string): string | undefined => new RegExp(`<details class="pblock recordlead" id="${id}"( open)?>`).exec(body)?.[1] ?? (body.includes(`id="${id}"`) ? '' : undefined);
    const plain = (await H.get('sales', '/staff/introducers')).body;
    assert.deepEqual([fold(plain, 'record-referral'), fold(plain, 'add-firm')], ['', '']);
    const rec = (await H.get('sales', '/staff/introducers?record=referral')).body;
    assert.deepEqual([fold(rec, 'record-referral'), fold(rec, 'add-firm')], [' open', '']);
    const add = (await H.get('sales', '/staff/introducers?add=firm')).body;
    assert.deepEqual([fold(add, 'record-referral'), fold(add, 'add-firm')], ['', ' open']);
    const refused = await H.post('sales', '/staff/introducers', { firm_name: '', notes: 'kept for phase 14' });
    assert.equal(refused.status, 400);
    assert.match(refused.body, /<details open class="pblock recordlead" id="add-firm">/);
    assert.match(refused.body, /kept for phase 14/);
  });

  test('the left-hand menu: the firms with their count, the two forms and the reward model', async () => {
    const body = (await H.get('sales', '/staff/introducers')).body;
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    const sub = [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1] ?? '').matchAll(/<a href="([^"]+)">([^<]+)(?: <span class="subnote">(\d+)<\/span>)?<\/a>/g)].map((m) => [m[1], m[2], m[3] ?? '']);
    assert.deepEqual(sub, [
      ['/staff/introducers#firms', 'The firms', String(list().length)], [RECORD_REFERRAL_HREF, 'Record a referral', ''],
      [ADD_FIRM_HREF, 'Add a firm', ''], ['/staff/introducer-rewards', 'The reward model', ''],
    ]);
  });

  test('Accounting: the firms and their fees only — no boxes, no buttons, no forms', async () => {
    const body = (await H.get('accounting', '/staff/introducers')).body;
    assert.deepEqual(kpis(body), []);
    assert.doesNotMatch(body, /Record a referral|Add a firm/);
    assert.match(body, /<thead><tr><th>Firm<\/th><th>Fees<\/th><\/tr><\/thead>/);
    assert.match(body, /<td data-label="Fees">£[\d,.]+ invoiced<br>£[\d,.]+ paid<\/td>/);
  });
});

describe('UI tidy phase 14: one firm', () => {
  test('the way back, who owns it and its next contact, the four boxes from its own figures', async () => {
    const v = I.introducerView(H.made.app.db, H.actor('sales'), bare, H.made.app.now());
    const body = (await H.get('sales', `/staff/introducers/${bare}`)).body;
    assert.match(body, /<li><a href="\/staff\/introducers">Introducers<\/a><\/li><li><span aria-current="page">Pell &amp; Marsh Accountants<\/span><\/li>/);
    assert.ok(v.details !== undefined && v.pipeline !== undefined && v.details.next_contact.overdue);
    assert.ok(body.includes(plainDashes(`<p class="lede"><span class="badge b-nobody">Nobody yet</span> · Next contact: <span class="badge b-late">${esc(v.details.next_contact.label)}</span></p>`)));
    assert.deepEqual(kpis(body), [
      ['win', 'Leads referred', String(v.pipeline.leads_referred)], ['survey', 'Claims opened', String(v.pipeline.claims_opened)],
      ['paid', 'Claims won', String(v.pipeline.claims_won)], ['plain', 'Reasoned negatives', String(v.pipeline.reasoned_negatives)],
    ]);
    const owned = (await H.get('sales', `/staff/introducers/${referred}`)).body;
    assert.match(owned, /<p class="lede">Owned by [^<]+ · Next contact: not planned<\/p>/);
  });

  test('its sections open out in the left-hand menu, with the counts of referrals and people', async () => {
    const v = I.introducerView(H.made.app.db, H.actor('sales'), referred, H.made.app.now());
    const body = (await H.get('sales', `/staff/introducers/${referred}`)).body;
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    const sub = [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1] ?? '').matchAll(/<a href="([^"]+)">([^<]+)(?: <span class="subnote">(\d+)<\/span>)?<\/a>/g)].map((m) => [m[1], m[2], m[3] ?? '']);
    assert.deepEqual(sub, [
      ['#firm', 'The firm', ''], ['#sent', 'What it has sent us', ''], ['#referrals', 'Referrals', String(v.referrals?.length)],
      ['#people', 'The people at the firm', String(v.contacts?.length)], ['#contact', 'Contact with the firm', ''],
      ['#fees', 'Fees to this firm', ''], ['#change', 'Change the firm', ''],
    ].filter((x) => x[0] !== '#fees' || v.fees !== undefined));
    for (const id of ['firm', 'sent', 'referrals', 'people', 'contact', 'change']) assert.match(body, new RegExp(`<div class="pblock" id="${id}">`), id);
  });

  test('its forms fold; Record a referral at the top opens the one under Referrals', async () => {
    const body = (await H.get('sales', `/staff/introducers/${referred}`)).body;
    for (const s of ['Record a referral from this firm', 'Add a person', 'Log contact that has happened', 'Plan the next contact', 'Change the firm’s details'.replace('’', "'")]) {
      assert.match(body, new RegExp(`<details class="formfold"[^>]*><summary>${s}</summary><form method="post"`), s);
    }
    assert.doesNotMatch(body, /<details class="formfold"[^>]* open>/);
    assert.match(body, /<a class="btn btn-primary" href="\?refer=1#refer-here">Record a referral<\/a>/);
    assert.match((await H.get('sales', `/staff/introducers/${referred}?refer=1`)).body, /<details class="formfold" id="refer-here" open><summary>Record a referral from this firm<\/summary>/);
  });
});
