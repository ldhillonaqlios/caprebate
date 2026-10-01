/**
 * 1 OCTOBER 2026 — HOME AS A DASHBOARD, AND BLOCKING OFF TIME.
 *
 * Lakhbir: "for workers, it should be client driven whos a new lead (where did the lead come from) whats in the pipeline
 * at which stage, any new messages received, a calendar allowing users to block off time … and below it should be
 * activities for today if its a telephone call, teams call and if they need to send any initial emails … a CTA on each,
 * if its a zoom call clicking the CTA launches zoom and the same goes for email. Phone will be manual." Admin: "tabs
 * across the top to see the sales dashboard … same does for accounting and survayor … a special tab which is admin".
 * Invented people and numbers only; nothing leaves.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { isBookable, staffSlots } from '../src/web/schedule.ts';
import { dashView } from '../src/web/staff-dashboard.ts';
import { secretsFromValues } from '../src/secrets.ts';

// Thursday 1 October 2026, 10:00 in the UK (09:00 UTC).
const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const ROLES = { admin: 'ADMIN', sales: 'SALES', accounting: 'ACCOUNTING', surveying: 'SURVEYING', readonly: 'READ_ONLY' } as const;
type Who = keyof typeof ROLES;

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
const now = T;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-dh-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [who, role] of Object.entries(ROLES)) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-dh-${who}`, `dh.${who}@example.invalid`, `dh.${who}@example.invalid`, `Dash ${who}`, role, hash, T, T]);
  }
  // Sales works Thursdays 09:00 to 17:00.
  db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, 4, 540, 1020)', [randomUUID(), 'u-dh-sales']);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-dh-1', 'Dashboard Dental Limited', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-dh-1', 'b-dh-1', 'Pat Phone', 1, 0, ?, 'pat@dashboard-dental.invented.co.uk', '07700 900456')", [T]);
  // Today: a Zoom call at 14:00 for Sales, and a telephone call at 15:00 nobody has taken.
  db.run("INSERT INTO bookings (id, business_id, assigned_to, channel, entry_point, starts_at, ends_at, created_at) VALUES ('bk-dh-video', 'b-dh-1', 'u-dh-sales', 'video', 'funnel_close', '2026-10-01T13:00:00.000Z', '2026-10-01T14:00:00.000Z', ?)", [T]);
  db.run("INSERT INTO bookings (id, business_id, assigned_to, channel, entry_point, starts_at, ends_at, created_at) VALUES ('bk-dh-phone', 'b-dh-1', NULL, 'phone', 'funnel_close', '2026-10-01T14:00:00.000Z', '2026-10-01T15:00:00.000Z', ?)", [T]);
  // A new lead from the website nobody has written to.
  db.run("INSERT INTO leads (id, business_id, origin, source, prospect_organisation, prospect_sector, lead_date, priority, status, created_at, updated_at) VALUES ('lead-dh-1', NULL, 'STAFF', 'WEBSITE', 'First Email Dental Limited', 'dental', ?, 'NORMAL', 'NEW', ?, ?)", [T, T, T]);
  db.run("INSERT INTO contacts (id, lead_id, business_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-dh-lead', 'lead-dh-1', NULL, 'Lee Lead', 1, 0, ?, 'lee@first-email.invented.co.uk')", [T]);
});
after(() => made.close());

const cookies = new Map<Who, string>();
async function req(who: Who, path: string, init: RequestInit = {}) {
  let cookie = cookies.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  cookies.set(who, cookie);
  return { status: r.status, body: await r.text(), location: r.headers.get('location') };
}
const post = (who: Who, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const section = (body: string, id: string): string => new RegExp(`<section class="dash-card" id="${id}"[\\s\\S]*?</section>`).exec(body)?.[0] ?? '';
const stat = (body: string, label: string): string => new RegExp(`<span class="dash-num">([^<]+)</span><span class="dash-label">${label}</span>`).exec(body)?.[1] ?? 'missing';

describe('Home as a dashboard', () => {
  before(async () => { for (const who of Object.keys(ROLES) as Who[]) await post(who, '/login', { email: `dh.${who}@example.invalid`, password: PASSWORD }); });

  test('each role gets its own view; Admin chooses with tabs across the top, and only Admin has them', async () => {
    assert.equal(dashView({ id: 'x', role: 'SALES' } as never, 'admin'), 'sales', 'Sales opened the Admin tab');
    assert.equal(dashView({ id: 'x', role: 'ACCOUNTING' } as never, null), 'accounting');
    assert.equal(dashView({ id: 'x', role: 'SURVEYING' } as never, 'sales'), 'surveying');
    assert.equal(dashView({ id: 'x', role: 'ADMIN' } as never, null), 'sales');
    assert.equal(dashView({ id: 'x', role: 'ADMIN' } as never, 'admin'), 'admin');
    const admin = (await req('admin', '/staff')).body;
    assert.match(admin, /<nav class="dash-tabs" aria-label="Whose dashboard"><a href="\/staff\?view=sales" class="dash-tab" aria-current="page">Sales<\/a><a href="\/staff\?view=accounting" class="dash-tab">Accounting<\/a><a href="\/staff\?view=surveying" class="dash-tab">Surveyor<\/a><a href="\/staff\?view=admin" class="dash-tab">Admin<\/a><\/nav>/);
    for (const who of ['sales', 'accounting', 'surveying', 'readonly'] as const) assert.doesNotMatch((await req(who, '/staff?view=admin')).body, /dash-tabs|Who is working/, who);
    assert.match((await req('admin', '/staff?view=accounting')).body, /aria-current="page">Accounting<\/a>[\s\S]*aria-labelledby="row-money"/);
    assert.match((await req('admin', '/staff?view=surveying')).body, /aria-current="page">Surveyor<\/a>[\s\S]*aria-labelledby="row-jobs"/);
  });

  test('Sales: the figures at a glance, the new lead with where it came from, and today’s calls and first emails — each with its button', async () => {
    const page = (await req('sales', '/staff')).body;
    assert.equal(stat(page, 'new lead'), '1');
    assert.equal(stat(page, 'calls today'), '2');
    assert.match(page, /First Email Dental Limited[\s\S]*?From Website/);
    const today = section(page, 'today-activities');
    // The Zoom call: its button opens the host's call inside the site.
    assert.match(today, /<span class="act-when">14:00<\/span>[\s\S]*?<span class="chip">Zoom call<\/span> <a href="\/staff\/calendar\/bk-dh-video">Dashboard Dental Limited<\/a> · Pat Phone<\/span>\s*<a class="cta act-cta" href="\/staff\/calendar\/bk-dh-video\/video">Start the Zoom call<\/a>/);
    // The telephone call: made by hand — the number is shown, and the button opens the call to note it.
    assert.match(today, /<span class="act-when">15:00<\/span>[\s\S]*?Telephone call[\s\S]*?<span class="act-phone">07700 900456<\/span> <span class="help">· nobody has taken it yet<\/span><\/span>\s*<a class="btn act-cta" href="\/staff\/calendar\/bk-dh-phone">Open the call<\/a>/);
    assert.ok(today.indexOf('14:00') < today.indexOf('15:00'), 'not in time order');
    // The first email: the button opens the email page for that lead, filled in.
    assert.match(today, /First email<\/span> <a href="\/staff\/leads\/lead-dh-1">First Email Dental Limited<\/a> · from Website[\s\S]*?<a class="cta act-cta" href="\/staff\/leads\/lead-dh-1\/email">Write the first email<\/a>/);
    const email = (await req('sales', '/staff/leads/lead-dh-1/email')).body;
    assert.match(email, /value="lee@first-email\.invented\.co\.uk">/);
    // Once written, it is no longer waiting.
    assert.equal((await post('sales', '/staff/leads/lead-dh-1/email', { to_email: 'lee@first-email.invented.co.uk', subject: 'Your enquiry', body: 'Thank you.' })).status, 303);
    assert.doesNotMatch(section((await req('sales', '/staff')).body, 'today-activities'), /First Email Dental Limited/);
  });

  test('the view-only login sees the dashboard without a button that changes anything', async () => {
    const page = (await req('readonly', '/staff')).body;
    assert.match(section(page, 'today-activities'), /Zoom call/);
    assert.doesNotMatch(section(page, 'today-activities'), /act-cta/);
    assert.doesNotMatch(page, /Block off time/);
  });

  test('blocking off time: it shows in the calendar, and no call can be offered or booked in it; a clash with a call is refused; only its owner (or Admin) frees it', async () => {
    const db = made.app.db;
    const four = '2026-10-01T15:00:00.000Z'; // 16:00 in the UK
    assert.equal(isBookable(db, four, { forUser: 'u-dh-sales', now }).ok, true);
    // Over the Zoom call: refused, so no client is left without the call they booked.
    const clash = await post('sales', '/staff/time-blocks', { date: '2026-10-01', from: '13:30', to: '14:30', reason: '', back: '/staff#calendar' });
    assert.equal(clash.status, 400);
    assert.match(clash.body, /You have a call booked in that time/);
    for (const [from, to, why] of [['17:00', '16:00', 'The finish must be after the start'], ['08:00', '09:00', 'That time has already gone'], ['nine', '10:00', 'Give a date']] as const) {
      const r = await post('sales', '/staff/time-blocks', { date: '2026-10-01', from, to, back: '/staff#calendar' });
      assert.equal(r.status, 400, from);
      assert.match(r.body, new RegExp(why), from);
    }
    const ok = await post('sales', '/staff/time-blocks', { date: '2026-10-01', from: '16:00', to: '17:00', reason: 'Dentist', back: '/staff#calendar' });
    assert.equal(ok.location, '/staff?done=blocked#calendar');
    const block = db.get<{ id: string; starts_at: string; ends_at: string }>('SELECT id, starts_at, ends_at FROM time_blocks')!;
    assert.deepEqual({ ...block, id: 'x' }, { id: 'x', starts_at: four, ends_at: '2026-10-01T16:00:00.000Z' });
    // Held exactly as a call holds it.
    assert.deepEqual(isBookable(db, four, { forUser: 'u-dh-sales', now }), { ok: false, why: 'that time has been taken' });
    const slots = staffSlots(db, now, '2026-10-02T00:00:00.000Z', { onlyUser: 'u-dh-sales', now });
    assert.ok(slots.available && !slots.slots.some((s) => s.starts_at === four), 'the blocked hour was offered');
    const cal = section((await req('sales', '/staff?done=blocked')).body, 'calendar');
    assert.match(cal, /Blocked off\. Nobody can book you a call then\./);
    assert.match(cal, /<li class="wk-day today" aria-current="date">[\s\S]*?<strong>14:00<\/strong> Zoom · Dashboard Dental Limited[\s\S]*?<li class="wk-block"><strong>16:00–17:00<\/strong> Blocked · Dentist/);
    // Not Accounting's to free; Admin may.
    assert.equal((await post('accounting', `/staff/time-blocks/${block.id}/remove`, { back: '/staff#calendar' })).status, 400);
    assert.equal(db.get<{ r: string | null }>('SELECT removed_at AS r FROM time_blocks')!.r, null);
    assert.equal((await post('sales', `/staff/time-blocks/${block.id}/remove`, { back: 'https://elsewhere.example/' })).location, '/staff?done=freed#calendar', 'sent back to another site');
    assert.equal(isBookable(db, four, { forUser: 'u-dh-sales', now }).ok, true, 'freed time was not bookable again');
    assert.throws(() => db.run('DELETE FROM time_blocks'), /never deleted/);
    assert.throws(() => db.run('UPDATE time_blocks SET reason = ?', ['x']), /never edited/);
  });

  test('a new message from a client is counted at a glance and listed, with a button to read and reply', async () => {
    made.app.db.run("INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, 'b-dh-1', NULL, 'FROM_CLIENT', 'EMAIL', NULL, 'c-dh-1', 'Can we move the call?', ?)", [randomUUID(), T]);
    const page = (await req('sales', '/staff')).body;
    assert.equal(stat(page, 'new message'), '1');
    assert.match(section(page, 'new-messages'), /<a href="\/staff\/clients\/b-dh-1\?chat=all#chat">Dashboard Dental Limited<\/a> <span class="newdot"[^>]*>1<\/span>\s*<a class="btn act-cta" href="\/staff\/clients\/b-dh-1\?chat=all#chat">Read and reply<\/a>/);
  });

  test('Admin’s own tab: who is working now, and when they signed in today', async () => {
    const page = (await req('admin', '/staff?view=admin')).body;
    const who = section(page, 'staff-working');
    assert.match(who, /<td data-label="Who">Dash admin<\/td><td data-label="Role">admin<\/td>\s*<td data-label="Now"><span class="chip chip-ok">Working<\/span><\/td>\s*<td data-label="Today">10:00 to 10:00<\/td>/);
    assert.match(who, /<td data-label="Who">Dash sales<\/td>[\s\S]*?Working/);
    assert.match(page, /aria-labelledby="row-admin"/);
  });
});

describe('Admin’s tab: people and API keys', () => {
  test('People: everyone who can sign in with Reset password and Archive (never for yourself); archiving stops them at once and lists them as archived', async () => {
    const page = (await req('admin', '/staff?view=admin')).body;
    const people = section(page, 'people');
    assert.match(people, /<td data-label="Who">Dash surveying<\/td>[\s\S]*?action="\/staff\/users\/u-dh-surveying\/temporary-password"[\s\S]*?action="\/staff\/users\/u-dh-surveying\/disable"/);
    assert.doesNotMatch(people, /\/staff\/users\/u-dh-admin\/disable/, 'Admin was offered to archive themself');
    assert.match(people, /<a class="cta" href="\/staff\/users#create-user">Add a person<\/a>/);
    assert.match((await req('surveying', '/staff')).body, /Survey jobs|row-jobs/);
    const r = await post('admin', '/staff/users/u-dh-surveying/disable', { back: '/staff?view=admin' });
    assert.equal(r.location, '/staff?view=admin&done=archived#people');
    assert.notEqual((await req('surveying', '/staff')).status, 200, 'an archived person is still signed in');
    assert.match(section((await req('admin', '/staff?view=admin')).body, 'people'), /<summary>Archived \(1\)<\/summary>[\s\S]*Dash surveying/);
    // From the Users page it still goes back there.
    assert.equal((await post('admin', '/staff/users/u-dh-accounting/disable', {})).location, '/staff/users?done=disabled');
  });

  test('API keys: where each comes from, never a value; saved only with Admin’s own password, sealed, and in use at once; taken off, the key file’s again', async () => {
    const before = made.app.secrets;
    const sealKey = Buffer.alloc(32, 7).toString('base64');
    made.app.secrets = secretsFromValues({ CAPREBATE_MFA_KEY: sealKey, GOADDRESS_API_KEY: 'file-value-0001', CQC_SUBSCRIPTION_KEY: 'cqc-value-0001' });
    try {
      const page = section((await req('admin', '/staff?view=admin')).body, 'keys');
      // 1 Oct 2026, Lakhbir: "not set = red, active = green, set but not active = amber".
      assert.match(page, /<code>GOADDRESS_API_KEY<\/code> <span class="chip key-on">In use<\/span><\/summary>\s*<p class="help">[^<]*\. From the key file or the website’s settings\.<\/p>/);
      assert.match(page, /<code>ZOOM_CLIENT_SECRET<\/code> <span class="chip key-off">Not set<\/span>/);
      assert.match(page, /<code>CQC_SUBSCRIPTION_KEY<\/code> <span class="chip key-idle">Set, not in use<\/span>[\s\S]*?<p class="help key-why">Why it is not in use: The care regulator lookup is not switched on\.<\/p>/);
      assert.doesNotMatch(page, /CAPREBATE_MFA_KEY<\/code>|HMLR_BG_PASSWORD/, 'the sealing key, or a retired one, was offered');
      assert.doesNotMatch(page, /file-value-0001/);
      assert.match(page, /<input class="fi" id="kv-GOADDRESS_API_KEY" name="value" type="password"/);
      // Not Sales'; and not without Admin's own password.
      assert.match((await post('sales', '/staff/keys/GOADDRESS_API_KEY', { value: 'x', password: PASSWORD })).body, /Only Admin can change a key/);
      assert.match((await post('admin', '/staff/keys/GOADDRESS_API_KEY', { value: 'new-value-23456', password: 'not it' })).body, /That is not the password you sign in to this site with/);
      assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM saved_keys')!.n, 0);
      const r = await post('admin', '/staff/keys/GOADDRESS_API_KEY', { value: 'new-value-23456', password: PASSWORD });
      assert.equal(r.location, '/staff?view=admin&done=key-saved#key-GOADDRESS_API_KEY');
      const row = made.app.db.get<{ sealed: string }>('SELECT sealed FROM saved_keys')!;
      assert.match(row.sealed, /^cbkey1:/);
      assert.ok(!row.sealed.includes('new-value-23456'), 'kept as text');
      assert.equal(made.app.secrets.forOwner('GOADDRESS').get('GOADDRESS_API_KEY'), 'new-value-23456', 'not in use');
      assert.equal(made.app.secrets.forOwner('SIGN_IN').get('CAPREBATE_MFA_KEY'), sealKey, 'the other keys were lost');
      const after = (await req('admin', '/staff?view=admin&done=key-saved')).body;
      assert.match(section(after, 'keys'), /<code>GOADDRESS_API_KEY<\/code> <span class="chip key-on">In use<\/span><\/summary>\s*<p class="help">[^<]*\. Saved here, [^<]*by Dash admin\.<\/p>/);
      assert.doesNotMatch(after, /new-value-23456/);
      const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'KEY_SAVED'")!;
      assert.equal(JSON.parse(audit.detail).key, 'GOADDRESS_API_KEY');
      assert.ok(!audit.detail.includes('new-value'), 'the value is in the audit log');
      // A sealed value copied onto another key's name does not open: it is never used, and the page says so.
      made.app.db.run('INSERT INTO saved_keys (id, name, sealed, set_by, set_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), 'ZOOM_CLIENT_SECRET', row.sealed, 'u-dh-admin', T]);
      assert.match(section((await req('admin', '/staff?view=admin')).body, 'keys'), /<code>ZOOM_CLIENT_SECRET<\/code> <span class="chip key-idle">Set, not in use<\/span>[\s\S]*?Saved here, but this server cannot open it: save it again\./);
      assert.equal(made.app.secrets.forOwner('ZOOM').get('ZOOM_CLIENT_SECRET'), null);
      assert.throws(() => made.app.db.run('UPDATE saved_keys SET sealed = NULL'), /never edited/);
      // Taken off: the key file's value again.
      assert.equal((await post('admin', '/staff/keys/GOADDRESS_API_KEY/unsave', { password: PASSWORD })).location, '/staff?view=admin&done=key-unsaved#key-GOADDRESS_API_KEY');
      assert.equal(made.app.secrets.forOwner('GOADDRESS').get('GOADDRESS_API_KEY'), 'file-value-0001');
    } finally { made.app.secrets = before; delete (made.app as { baseSecrets?: unknown }).baseSecrets; }
  });

  test('without the sealing key nothing can be saved, and the page says what is missing', async () => {
    const before = made.app.secrets;
    made.app.secrets = secretsFromValues({ GOADDRESS_API_KEY: 'file-value-0001' });
    const was = (made.app as { baseSecrets?: unknown }).baseSecrets;
    (made.app as { baseSecrets?: unknown }).baseSecrets = made.app.secrets;
    try {
      const page = section((await req('admin', '/staff?view=admin')).body, 'keys');
      assert.match(page, /Keys cannot be saved here until CAPREBATE_MFA_KEY is set/);
      assert.doesNotMatch(page, /name="value"/);
      assert.match((await post('admin', '/staff/keys/WHATSAPP_ACCESS_TOKEN', { value: 'abc', password: PASSWORD })).body, /Keys cannot be saved here until CAPREBATE_MFA_KEY is set/);
    } finally { made.app.secrets = before; (made.app as { baseSecrets?: unknown }).baseSecrets = was; }
  });
});

describe('the client’s portal home as a dashboard', () => {
  test('five cards at the top: where the claim is, what we need, what we are working on, the next call, and what is new', async () => {
    const db = made.app.db;
    const hash = await made.app.hasher.hash(PASSWORD);
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      ['u-dh-client', 'dh.client@example.invalid', 'dh.client@example.invalid', 'Dash client', 'CLIENT', hash, T, T, 'b-dh-1']);
    // A message from us they have not read.
    db.run("INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, 'b-dh-1', NULL, 'TO_CLIENT', 'STAFF', 'u-dh-sales', NULL, 'Your survey is booked.', ?)", [randomUUID(), T]);
    const c = 'client' as unknown as Who;
    await post(c, '/login', { email: 'dh.client@example.invalid', password: PASSWORD });
    const page = (await req(c, '/portal')).body;
    const dash = /<div class="pdash">[\s\S]*?<\/section><\/div>/.exec(page)?.[0] ?? '';
    assert.deepEqual([...dash.matchAll(/<section class="pdash-card" id="([a-z-]+)"/g)].map((m) => m[1]), ['where-you-are', 'waiting-on-you', 'working-on', 'next-call', 'new-for-you']);
    assert.equal((page.match(/id="waiting-on-you"/g) ?? []).length, 1, 'What we need from you is drawn twice');
    assert.equal((dash.match(/<li class="(done|now|todo)"/g) ?? []).length, 6);
    assert.match(dash, /Step 1 of 6: Your estimate/);
    // The Zoom call at 14:00 (15:00 is a telephone call), and how to move it.
    assert.match(dash, /<p class="pdash-big">Thursday 1 Oct 2026, 14:00<\/p>\s*<p>A video call, here in your portal\.<\/p>/);
    assert.match(dash, /<a class="btn" href="#appointment">Move or cancel it<\/a>/);
    assert.match(dash, /And 1 more booked\./);
    assert.match(dash, /<strong>A new message from us<\/strong> <a class="cta" href="\/portal\/messages">Read it<\/a>/);
    assert.ok(page.indexOf('class="pdash"') < page.indexOf('id="contact-us"'), 'the dashboard is not at the top');
  });

  test('each card’s button: answer a question, send a document, join the video call; only what is recent is new', async () => {
    const { portalDashboard } = await import('../src/web/portal-dashboard.ts');
    const html = String(portalDashboard({
      db: made.app.db, actor: { id: 'u-dh-client', role: 'CLIENT' } as never, business_id: 'b-dh-1', nowIso: T,
      bookings: [{ id: 'bk-x', channel: 'video', starts_at: '2026-10-02T09:00:00.000Z', cancelled_at: null }, { id: 'bk-gone', channel: 'video', starts_at: '2026-10-01T10:00:00.000Z', cancelled_at: T }],
      tasks: [{ id: 't-1', state: 'OPEN', question: 'Who owns the building?' }, { id: 't-2', state: 'ANSWERED', question: 'Answered already' }],
      requests: [{ id: 'r-1', state: 'REQUESTED', type: { label: 'Floor plans' }, due: { label: 'due by 5 Oct 2026', overdue: false } }],
      done: [
        { claim_id: null, key: 'SURVEY_BOOKED', state: 'DONE', words: 'Cap Rebate has booked your survey', on: '2026-09-25' },
        { claim_id: null, key: 'COMPANY', state: 'DONE', words: 'Cap Rebate has checked your company details', on: '2026-07-01' },
      ] as never,
      delivered: [{ label: 'client report', version: 1, issued_on: '2026-09-30', note: '' }],
      joins: { 'bk-x': '/call/tok-123' },
    }));
    assert.match(html, /Who owns the building\? <span class="help">— a question<\/span><\/span> <a class="cta" href="#question-t-1">Answer it<\/a>/);
    assert.doesNotMatch(html, /Answered already/);
    assert.match(html, /Floor plans <span class="help">— a document, due by 5 Oct 2026<\/span><\/span> <a class="cta" href="#request-r-1">Send it<\/a>/);
    assert.match(html, /Friday 2 Oct 2026, 10:00[\s\S]*?<a class="cta" href="\/call\/tok-123">Join the video call<\/a>/);
    assert.doesNotMatch(html, /And \d+ more booked/, 'a cancelled call was counted');
    const fresh = /<section class="pdash-card" id="new-for-you"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    assert.match(fresh, /Cap Rebate has booked your survey/);
    assert.match(fresh, /We issued your client report/);
    assert.doesNotMatch(fresh, /checked your company details/, 'something from July is "new"');
    const done = /<section class="pdash-card" id="working-on"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    assert.ok(done.indexOf('booked your survey') < done.indexOf('checked your company details'), 'not newest first');
  });
});
