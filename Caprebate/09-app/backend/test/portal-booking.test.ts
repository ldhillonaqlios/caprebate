/**
 * A CLIENT MOVES THEIR OWN CALL.        Phase 113a, 9 September 2026
 *
 * Phase 105 built the picker at the funnel close and the staff side of moving a
 * booking. The portal showed a client their appointment and gave them no way to
 * change it, so the only route was to telephone us.
 *
 * WHAT THESE TESTS ARE REALLY FOR, AND IT IS NOT "THE BUTTON WORKS". Three
 * things could each be got wrong invisibly, and each has its own test below:
 *
 *   THE AUTHORISATION IS A NEW ROW, NOT A LOOSENED ONE. `booking.move_own` is
 *   CLIENT-only and `ownBusiness`; a client is still refused `booking.write`,
 *   still refused the back-office calendar, and still absent from the answer to
 *   "whose diary could hold this call". A build that had reached the same
 *   feature by adding CLIENT to `booking.write` would pass a naive test of the
 *   button and fail every one of those.
 *
 *   THE STORE IS THE CONTROL, NOT THE FORM. A client who posts a time no picker
 *   ever drew — outside working hours, in the past, already taken — is refused
 *   by `isBookable` at the moment of writing. That is tested by posting
 *   directly rather than by clicking, because clicking can only ever exercise
 *   what the form offered.
 *
 *   IT IS ONE RECORD AND ONE HISTORY. The staff calendar reads the row the
 *   client just changed, and the staff booking page's own change history shows
 *   the client's move with the client's name against it — WITHOUT a line of
 *   code written for that, which is the evidence that this is the existing
 *   mechanism and not a second one.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS } from '../src/authz.ts';
import { CLIENT_MOVE_NOTICE_MINUTES, SLOT_MINUTES } from '../src/web/schedule.ts';
import { localClock, localWhen } from '../src/web/localtime.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

type Booked = {
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  /** The signed-in client, their booking id, and the time they hold. */
  client: Client;
  business_id: string;
  booking_id: string;
  starts_at: string;
  signIn(role: AppRole): Promise<Client>;
  /** Every moment the portal is currently offering this client. */
  offered(): Promise<string[]>;
};

function makeClient(base: string): Client {
  const c: Client = {
    cookie: '',
    async req(path, init = {}) {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (c.cookie !== '') headers['cookie'] = c.cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) {
        const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
        for (const s of set) {
          const first = s.split(';')[0] ?? '';
          jar.set(first.split('=')[0] ?? '', first);
        }
        c.cookie = [...jar.values()].join('; ');
      }
      return { status: r.status, location: r.headers.get('location'), body: await r.text() };
    },
    post(path, fields) {
      return c.req(path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    },
  };
  return c;
}

/**
 * A CLIENT WHO HAS BEEN THROUGH THE FUNNEL, HOLDS A TIME, AND CAN SIGN IN.
 *
 * The whole fixture is built by DRIVING THE APPLICATION — a real funnel, a real
 * submission, a real login — rather than by inserting rows. The one row written
 * by hand is the client's user account, because this build has no self-service
 * registration and one is not being invented for a test.
 */
async function booked(): Promise<Booked> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-portal-booking-'));
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
       `${role} Person`, role, hash, T, T],
    );
  }
  /* WORKING TIMES EVERY DAY, WIDE ENOUGH THAT THE FORTNIGHT'S HORIZON ALWAYS
     HAS SLOTS OUTSIDE THE TWO-HOUR NOTICE WINDOW whatever hour of the real day
     this suite is run at. A narrow nine-to-five fixture passes at ten in the
     morning and fails at half past four, which is a test with a timetable. */
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    made.app.db.run(
      'INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
      [`wt-${weekday}`, 'u-SALES', weekday, 0, 24 * 60],
    );
  }

  const visitor = makeClient(base);
  // PHASE 153f: the six old screens are retired; the same answers go through the four-stage funnel, whose figure page
  // carries the times.
  await visitor.req('/assessment');
  await visitor.post('/assessment/buildings', { b0_sector: 'care_homes' });
  await visitor.post('/assessment/spend-on', { b0_trigger: 'purchase' });
  await visitor.post('/assessment/amounts', { b0_spend: '2400000', b0_date: '06/2021' });
  await visitor.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
  await visitor.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
  await visitor.post('/assessment/works', { b0_works: 'no' });
  await visitor.post('/assessment/details', { b0_business: 'Meadowcroft Care Limited', b0_entity: 'ltd', b0_line1: 'Meadowcroft House', b0_postcode: 'ZZ9 9ZZ' });
  const close = await visitor.req('/assessment/figure');
  /* THE LAST OFFERED SLOT, not the first: the first is usually within the
     notice window when this runs during working hours, and a fixture that is
     too late to move is not a fixture for moving. */
  const all = [...close.body.matchAll(/name="slot" value="([^"]+)"/g)].map((m) => m[1] ?? '')
    .filter((v) => v !== '');
  // PHASE 153f: the four-stage figure page offers the whole fortnight, where the old close offered its first 24 times
  // (as the staff booking page does); the 24th is the same "last offered" fixture the old close gave.
  const slot = all[Math.min(23, all.length - 1)] ?? '';
  assert.notEqual(slot, '', 'the funnel offered no times at all');
  const submitted = await visitor.post('/assessment/close', {
    first_name: 'A', surname: 'Person',
    job_role: 'owner_director', channel: 'phone', phone: '01632 960111',
    contact_consent: 'on', slot,
  });
  assert.equal(submitted.status, 200, 'the funnel did not close');

  const row = made.app.db.get<{ id: string; business_id: string; starts_at: string | null }>(
    'SELECT id, business_id, starts_at FROM bookings');
  assert.ok(row !== undefined && row.starts_at !== null, 'the client did not get a time');

  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u-CLIENT', 'client@example.invalid', 'client@example.invalid', 'Client Person',
     'CLIENT', hash, T, T, row.business_id],
  );
  const client = makeClient(base);
  assert.equal(
    (await client.post('/login', { email: 'client@example.invalid', password: PASSWORD })).status, 303);

  async function signIn(role: AppRole): Promise<Client> {
    const c = makeClient(base);
    const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
    assert.equal(r.status, 303, `${role} could not sign in`);
    return c;
  }

  async function offered(): Promise<string[]> {
    const page = await client.req('/portal');
    return [...page.body.matchAll(/name="starts_at" value="([^"]+)"/g)].map((m) => m[1] ?? '');
  }

  return {
    close: made.close, app: made.app, client, signIn, offered,
    business_id: row.business_id, booking_id: row.id, starts_at: row.starts_at,
  };
}

/* ================================================================== *
 * THE DECISION THIS JOB ACTUALLY MAKES
 * ================================================================== */

describe('a client may move their own call, and only their own', () => {
  test('THE RULE IS A NEW ROW, NOT A LOOSENED ONE', () => {
    const client = (business: string) =>
      ({ id: 'u-CLIENT', role: 'CLIENT' as AppRole, business_id: business, disabled: false });
    const mine = { type: 'booking' as const, id: 'bk-1', business_id: 'b-mine' };
    const theirs = { type: 'booking' as const, id: 'bk-2', business_id: 'b-theirs' };

    assert.ok(REGISTERED_ACTIONS.includes('booking.move_own'));
    assert.equal(can(client('b-mine'), 'booking.move_own', mine), true);
    assert.equal(can(client('b-mine'), 'booking.move_own', theirs), false,
      'a client reached another business’s booking');

    /* AND `booking.write` IS UNTOUCHED. This is the assertion that would catch
       the shortcut: adding CLIENT to that row would have delivered the same
       feature and quietly put a client into the staff calendar's section gate
       and into `bookableUserIds`. */
    assert.equal(can(client('b-mine'), 'booking.write', mine), false,
      'a client acquired booking.write — that is the row this job did NOT touch');

    /* NO STAFF ROLE IS ON THE NEW ROW. A staff member moving a call is
       `booking.write`; neither route is the other's back door. */
    for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
      assert.equal(
        can({ id: `u-${role}`, role, business_id: null, disabled: false }, 'booking.move_own', mine),
        false, `${role} is on booking.move_own`);
    }
  });

  test('the portal offers a way to change it, where before there was none', async () => {
    const h = await booked();
    try {
      const page = await h.client.req('/portal');
      assert.match(page.body, /Change or cancel this call/);
      assert.match(page.body, /action="\/portal\/bookings\//);
      const offered = await h.offered();
      assert.ok(offered.length > 0, 'the portal drew a picker with no times in it');
      /* THE TIME THEY ALREADY HOLD IS NOT OFFERED BACK TO THEM: it is taken, by
         their own booking, and `publicSlots` does not know to make an exception
         for the asker. Moving to the time you already have is refused anyway. */
      assert.equal(offered.includes(h.starts_at), false);
    } finally { h.close(); }
  });

  test('IT MOVES, AND IT IS THE SAME RECORD THE BACK OFFICE READS', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      assert.notEqual(target, '');

      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: target });
      assert.equal(r.status, 303);

      /* ONE ROW. Not a second booking, not a request for a change. */
      assert.equal(h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookings')?.n, 1);
      const after = h.app.db.get<{ starts_at: string | null; ends_at: string | null; assigned_to: string | null }>(
        'SELECT starts_at, ends_at, assigned_to FROM bookings WHERE id = ?', [h.booking_id]);
      assert.equal(after?.starts_at, target);
      assert.equal(Date.parse(after?.ends_at ?? '') - Date.parse(target), SLOT_MINUTES * 60_000);
      assert.equal(after?.assigned_to, 'u-SALES', 'nobody was made responsible for the moved call');

      /* AND THE BACK OFFICE SEES IT — reading the same row, with no sync. */
      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/calendar/${h.booking_id}`);
      assert.ok(page.body.includes(localWhen(target)), 'the staff page did not follow the client’s move');
    } finally { h.close(); }
  });

  test('THE MOVE IS ON THE RECORD, WITH THE CLIENT NAMED — in booking_changes, as a staff move is', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: target });

      const history = h.app.db.all<{
        from_starts_at: string | null; to_starts_at: string | null; changed_by: string;
      }>('SELECT from_starts_at, to_starts_at, changed_by FROM booking_changes ORDER BY at');
      assert.equal(history.length, 1, 'the client’s move was not recorded');
      assert.equal(history[0]?.from_starts_at, h.starts_at);
      assert.equal(history[0]?.to_starts_at, target);
      assert.equal(history[0]?.changed_by, 'u-CLIENT', 'the change is not attributed to the client');

      /* THE STAFF BOOKING PAGE ALREADY RENDERS THAT HISTORY, and it now shows
         the client's move without a line of code having been written for it.
         That is the evidence this is the existing mechanism and not a second
         one bolted alongside it. */
      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/calendar/${h.booking_id}`);
      assert.match(page.body, /Client Person/);

      /* AND THE AUDIT SAYS WHO. One kind for both routes; the role is the
         difference, which is where it belongs. */
      const line = h.app.db.get<{ kind: string; actor_role: string; detail: string }>(
        'SELECT kind, actor_role, detail FROM audit_log WHERE object_type = ? ORDER BY seq DESC LIMIT 1',
        ['booking']);
      assert.equal(line?.kind, 'BOOKING_MOVED');
      assert.equal(line?.actor_role, 'CLIENT');
    } finally { h.close(); }
  });

  test('the outbox gets a line, and it is NOT SENT', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: offered[offered.length - 1] ?? '' });
      const msg = h.app.db.get<{ kind: string; sent_at: string | null; body: string }>(
        'SELECT kind, sent_at, body FROM outbox ORDER BY created_at DESC LIMIT 1');
      assert.equal(msg?.kind, 'CALENDAR_INVITE');
      assert.equal(msg?.sent_at, null, 'the stub claimed to have sent something');
      assert.match(msg?.body ?? '', /moved this call themselves/);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE STORE IS THE CONTROL — every one of these POSTS DIRECTLY
 * ================================================================== */

describe('the picker is a courtesy; the refusal is the control', () => {
  test('a time no picker ever offered is refused — outside working hours', async () => {
    const h = await booked();
    try {
      /* Narrow the diary to office hours AFTER the fixture was built, so the
         time posted below is one the client's own page never drew. */
      h.app.db.run('DELETE FROM working_times');
      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        h.app.db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
          [`wt2-${weekday}`, 'u-SALES', weekday, 9 * 60, 17 * 60]);
      }
      const wayOff = new Date(Date.now() + 5 * 86_400_000);
      wayOff.setUTCHours(3, 0, 0, 0);
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`,
        { starts_at: wayOff.toISOString() });
      assert.equal(r.status, 400);
      assert.match(r.body, /outside the working hours/);
      assert.equal(
        h.app.db.get<{ s: string | null }>('SELECT starts_at AS s FROM bookings WHERE id = ?', [h.booking_id])?.s,
        h.starts_at, 'a refused time was written anyway');
    } finally { h.close(); }
  });

  test('a time in the past is refused', async () => {
    const h = await booked();
    try {
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`,
        { starts_at: '2026-01-05T10:00:00.000Z' });
      assert.equal(r.status, 400);
    } finally { h.close(); }
  });

  test('a time somebody else has taken is refused, and the message says so plainly', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      /* SOMEBODY ELSE TAKES IT WHILE THE PAGE IS OPEN — which is the ordinary
         way this fails in real use, and the only way to test the re-check is to
         change the world between the render and the post. */
      h.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        ['b-other', 'Somebody Else Limited', 'gp', 'PAID', T]);
      h.app.db.run(
        'INSERT INTO bookings (id,business_id,assigned_to,channel,entry_point,starts_at,ends_at,created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?)',
        ['bk-other', 'b-other', 'u-SALES', 'phone', 'funnel_close', target,
         new Date(Date.parse(target) + SLOT_MINUTES * 60_000).toISOString(), T]);

      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: target });
      assert.equal(r.status, 400);
      assert.match(r.body, /took that time while this page was open/);
    } finally { h.close(); }
  });

  test('ANOTHER CLIENT’S BOOKING IS REFUSED, and it looks exactly like one that does not exist', async () => {
    const h = await booked();
    try {
      h.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        ['b-other', 'Somebody Else Limited', 'gp', 'PAID', T]);
      h.app.db.run(
        'INSERT INTO bookings (id,business_id,assigned_to,channel,entry_point,starts_at,ends_at,created_at) ' +
          'VALUES (?,?,NULL,?,?,NULL,NULL,?)',
        ['bk-other', 'b-other', 'phone', 'funnel_close', T]);
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';

      const theirs = await h.client.post('/portal/bookings/bk-other', { starts_at: target });
      const nothing = await h.client.post('/portal/bookings/bk-does-not-exist', { starts_at: target });
      assert.equal(theirs.status, nothing.status,
        'the two answers differ — that tells a caller which ids exist');
      assert.equal(
        h.app.db.get<{ s: string | null }>('SELECT starts_at AS s FROM bookings WHERE id = ?', ['bk-other'])?.s,
        null, 'a client wrote to another business’s booking');
    } finally { h.close(); }
  });

  test('a client still cannot reach the staff calendar, before or after moving anything', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: offered[offered.length - 1] ?? '' });
      for (const path of ['/staff/calendar', `/staff/calendar/${h.booking_id}`]) {
        const r = await h.client.req(path);
        assert.equal(r.status, 403, `${path} was not refused to a client`);
      }
      const posted = await h.client.post(`/staff/calendar/${h.booking_id}/schedule`,
        { starts_at: offered[0] ?? '', assigned_to: '' });
      assert.equal(posted.status, 403);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE TWO DECISIONS: HOW LATE, AND WHETHER THEY MAY CANCEL
 * ================================================================== */

/* ================================================================== *
 * PHASE 132e — FULL CONTROL AT ANY TIME, AND A NEW TIME STILL NEEDS NOTICE
 *
 * Lakhbir, 16 September 2026: "Give the client full control to cancel at any
 * time, and rebook at a time that suits them". The tests below replaced Phase
 * 113a's "inside the window the control is not drawn / posting is refused /
 * there is no self-service cancellation" — each is now asserted the other way,
 * and the one half of the old rule that stays (a NEW time must be two hours
 * away) is asserted as before.
 * ================================================================== */

/** A slot-aligned instant `minutes` from the real clock (the server's clock). */
function slotIn(minutes: number): string {
  return new Date(Math.ceil((Date.now() + minutes * 60_000) / (SLOT_MINUTES * 60_000))
    * (SLOT_MINUTES * 60_000)).toISOString();
}
function holdAt(h: Booked, startsAt: string): void {
  h.app.db.run('UPDATE bookings SET starts_at = ?, ends_at = ? WHERE id = ?',
    [startsAt, new Date(Date.parse(startsAt) + SLOT_MINUTES * 60_000).toISOString(), h.booking_id]);
}
function heldAt(h: Booked): string | null | undefined {
  return h.app.db.get<{ s: string | null }>('SELECT starts_at AS s FROM bookings WHERE id = ?', [h.booking_id])?.s;
}

describe('how late a client may move a call — at any time now', () => {
  test('A CALL TWENTY MINUTES AWAY STILL HAS THE CONTROL DRAWN, and no "telephone us" refusal', async () => {
    const h = await booked();
    try {
      holdAt(h, slotIn(20));
      const page = await h.client.req('/portal');
      assert.match(page.body, /Change or cancel this call/,
        'the control was withheld for an imminent call — the Phase 113a refusal is back');
      assert.equal(/less than 2 hours away/.test(page.body), false);
      assert.match(page.body, /name="cancel" value="on"/);
    } finally { h.close(); }
  });

  test('AND POSTING A MOVE FOR AN IMMINENT CALL SUCCEEDS, to a time two hours or more away', async () => {
    const h = await booked();
    try {
      const soon = slotIn(20);
      holdAt(h, soon);
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      assert.notEqual(target, '');
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: target });
      assert.equal(r.status, 303, `the move was refused: ${r.body.slice(0, 300)}`);
      assert.equal(heldAt(h), target, 'an imminent call was not moved');
    } finally { h.close(); }
  });

  test('A NEW TIME INSIDE TWO HOURS IS STILL REFUSED — the rule for a new slot stays', async () => {
    const h = await booked();
    try {
      const soon = slotIn(60);
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: soon });
      assert.equal(r.status, 400);
      assert.match(r.body, new RegExp(`at least ${CLIENT_MOVE_NOTICE_MINUTES / 60} hours from now`));
      assert.equal(heldAt(h), h.starts_at, 'a new time inside the notice period was written');
    } finally { h.close(); }
  });

  test('AND THE PICKER DOES NOT OFFER A NEW TIME INSIDE TWO HOURS', async () => {
    const h = await booked();
    try {
      const nowMs = Date.now();
      const offered = await h.offered();
      assert.ok(offered.length > 0);
      for (const o of offered) {
        assert.ok(Date.parse(o) - nowMs >= CLIENT_MOVE_NOTICE_MINUTES * 60_000 - 5_000,
          `the picker offered ${o}, inside the notice period`);
      }
    } finally { h.close(); }
  });

  test('A CALL THAT HAS ALREADY PASSED MAY BE MOVED TO A NEW TIME, and is not called imminent', async () => {
    const h = await booked();
    try {
      const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
      yesterday.setUTCMinutes(0, 0, 0);
      holdAt(h, yesterday.toISOString());
      const page = await h.client.req('/portal');
      assert.equal(/less than 2 hours away/.test(page.body), false);
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { starts_at: target });
      assert.equal(r.status, 303);
      assert.equal(heldAt(h), target);
    } finally { h.close(); }
  });

  test('releasing an imminent call succeeds — no notice period for giving a time back', async () => {
    const h = await booked();
    try {
      holdAt(h, slotIn(20));
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { release: 'on' });
      assert.equal(r.status, 303);
      assert.equal(heldAt(h), null);
    } finally { h.close(); }
  });
});

describe('the way out keeps the enquiry, and the times come first', () => {
  test('THE WAY OUT KEEPS THE ENQUIRY: the time goes back, the booking does not', async () => {
    const h = await booked();
    try {
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { release: 'on' });
      assert.equal(r.status, 303);

      assert.equal(h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookings')?.n, 1);
      const after = h.app.db.get<{ starts_at: string | null; channel: string; entry_point: string; cancelled_at: string | null }>(
        'SELECT starts_at, channel, entry_point, cancelled_at FROM bookings WHERE id = ?', [h.booking_id]);
      assert.equal(after?.starts_at, null);
      assert.equal(after?.channel, 'phone', 'the channel was lost with the time');
      assert.equal(after?.entry_point, 'funnel_close', 'the enquiry’s origin was lost with the time');
      assert.equal(after?.cancelled_at, null, 'releasing a time is not a cancellation');

      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      assert.match(cal.body, /Meadowcroft Care Limited/);

      const hist = h.app.db.get<{ from_starts_at: string | null; to_starts_at: string | null; changed_by: string; cancelled: number }>(
        'SELECT from_starts_at, to_starts_at, changed_by, cancelled FROM booking_changes ORDER BY at DESC LIMIT 1');
      assert.equal(hist?.from_starts_at, h.starts_at);
      assert.equal(hist?.to_starts_at, null);
      assert.equal(hist?.changed_by, 'u-CLIENT');
      assert.equal(hist?.cancelled, 0);

      const staffPage = await staff.req(`/staff/calendar/${h.booking_id}`);
      assert.ok(staffPage.body.includes(`value="${h.starts_at}"`),
        'the released time was not offered to anybody else');
    } finally { h.close(); }
  });

  test('THE TIMES COME FIRST, THEN "RING ME", AND CANCELLING COMES LAST, on the page itself', async () => {
    const h = await booked();
    try {
      const page = await h.client.req('/portal');
      const picker = page.body.indexOf('Choose another time');
      const wayOut = page.body.indexOf('None of these work');
      const cancel = page.body.indexOf('Cancel this call');
      assert.ok(picker > -1 && wayOut > -1 && cancel > -1, 'one of the three controls is missing');
      assert.ok(picker < wayOut && wayOut < cancel,
        'the order is new times, then ring me, then cancel — a cancellation must not come first');
    } finally { h.close(); }
  });
});

describe('a client may cancel their own call outright, at any time', () => {
  const cases: readonly [string, (h: Booked) => void][] = [
    ['a call days away', () => undefined],
    ['a call twenty minutes away', (h) => holdAt(h, slotIn(20))],
    ['a call that has already passed', (h) => {
      const y = new Date(Date.now() - 26 * 60 * 60 * 1000); y.setUTCMinutes(0, 0, 0); holdAt(h, y.toISOString());
    }],
  ];
  for (const [label, arrange] of cases) {
    test(`CANCELLING ${label.toUpperCase()} SUCCEEDS, KEEPS THE ROW, AND NAMES WHO AND WHEN`, async () => {
      const h = await booked();
      try {
        arrange(h);
        const heldBefore = heldAt(h);
        const lead = h.app.db.get<{ status: string }>('SELECT status FROM leads WHERE business_id = ?', [h.business_id]);
        const stage = h.app.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [h.business_id]);
        assert.ok(lead !== undefined && stage !== undefined, 'the fixture has no lead or organisation to keep open');

        const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { cancel: 'on' });
        assert.equal(r.status, 303, `the cancellation was refused: ${r.body.slice(0, 300)}`);

        assert.equal(h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookings')?.n, 1, 'the row was deleted');
        const row = h.app.db.get<{ starts_at: string | null; cancelled_at: string | null; cancelled_by: string | null }>(
          'SELECT starts_at, cancelled_at, cancelled_by FROM bookings WHERE id = ?', [h.booking_id]);
        assert.equal(row?.starts_at, heldBefore, 'the time was wiped — it is kept for the record');
        assert.notEqual(row?.cancelled_at ?? null, null);
        assert.equal(row?.cancelled_by, 'u-CLIENT');

        const hist = h.app.db.get<{ cancelled: number; changed_by: string }>(
          'SELECT cancelled, changed_by FROM booking_changes ORDER BY at DESC LIMIT 1');
        assert.equal(hist?.cancelled, 1);
        assert.equal(hist?.changed_by, 'u-CLIENT');

        const line = h.app.db.get<{ kind: string; actor_role: string; detail: string }>(
          'SELECT kind, actor_role, detail FROM audit_log WHERE object_type = ? ORDER BY seq DESC LIMIT 1', ['booking']);
        assert.equal(line?.kind, 'BOOKING_CANCELLED');
        assert.equal(line?.actor_role, 'CLIENT');

        const msg = h.app.db.get<{ sent_at: string | null; body: string }>(
          'SELECT sent_at, body FROM outbox ORDER BY created_at DESC LIMIT 1');
        assert.equal(msg?.sent_at, null);
        assert.match(msg?.body ?? '', /cancelled this call themselves/);

        /* THE ENQUIRY STAYS OPEN. */
        assert.deepEqual(
          h.app.db.get<{ status: string }>('SELECT status FROM leads WHERE business_id = ?', [h.business_id]), lead);
        assert.notEqual(lead?.status, 'LOST');
        assert.deepEqual(h.app.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [h.business_id]), stage);

        /* THE BACK OFFICE SEES IT, WITH WHO AND WHEN. */
        const staff = await h.signIn('SALES');
        const cal = await staff.req('/staff/calendar');
        const section = cal.body.slice(cal.body.indexOf('Cancelled calls'));
        assert.match(section, /Meadowcroft Care Limited/);
        assert.match(section, /Client Person \(the client\)/);
        const one = await staff.req(`/staff/calendar/${h.booking_id}`);
        assert.match(one.body, /Cancelled by Client Person \(the client\)/);
        assert.match(one.body, /The enquiry is still open/);

        /* AND THE PORTAL SAYS SO, with no controls left on that call. */
        const portal = await h.client.req('/portal');
        assert.match(portal.body, /You cancelled this call/);
        assert.equal(/name="cancel" value="on"/.test(portal.body), false);
      } finally { h.close(); }
    });
  }

  test('A CANCELLED CALL HOLDS NO SLOT — its time is offered to somebody else', async () => {
    const h = await booked();
    try {
      const staff = await h.signIn('SALES');
      const before = await staff.req('/staff/calendar/' + h.booking_id);
      void before;
      await h.client.post(`/portal/bookings/${h.booking_id}`, { cancel: 'on' });
      // Another call awaiting a time can now be put where the cancelled call was.
      h.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        ['b-other', 'Somebody Else Limited', 'gp', 'PAID', T]);
      h.app.db.run(
        'INSERT INTO bookings (id,business_id,assigned_to,channel,entry_point,starts_at,ends_at,created_at) VALUES (?,?,NULL,?,?,NULL,NULL,?)',
        ['bk-other', 'b-other', 'phone', 'funnel_close', T]);
      const page = await staff.req('/staff/calendar/bk-other');
      assert.ok(page.body.includes(`value="${h.starts_at}"`), 'the cancelled call still holds its slot');
      const r = await staff.post('/staff/calendar/bk-other/schedule', { starts_at: h.starts_at, assigned_to: '' });
      assert.equal(r.status, 303);
    } finally { h.close(); }
  });

  test('A CALL WAITING FOR A TIME CAN BE CANCELLED TOO, and leaves the "no time yet" queue', async () => {
    const h = await booked();
    try {
      await h.client.post(`/portal/bookings/${h.booking_id}`, { release: 'on' });
      const r = await h.client.post(`/portal/bookings/${h.booking_id}`, { cancel: 'on' });
      assert.equal(r.status, 303);
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      const queue = cal.body.slice(cal.body.indexOf('Asked for a call, no time yet'), cal.body.indexOf('Cancelled calls'));
      assert.equal(/Meadowcroft Care Limited/.test(queue), false, 'a cancelled call is still in the work queue');
      assert.match(cal.body.slice(cal.body.indexOf('Cancelled calls')), /Meadowcroft Care Limited/);
    } finally { h.close(); }
  });

  test('ONCE CANCELLED IT IS FINAL: move, release, a second cancel and a staff scheduling are all refused', async () => {
    const h = await booked();
    try {
      const offered = await h.offered();
      const target = offered[offered.length - 1] ?? '';
      await h.client.post(`/portal/bookings/${h.booking_id}`, { cancel: 'on' });
      for (const fields of [{ starts_at: target }, { release: 'on' }, { cancel: 'on' }]) {
        const r = await h.client.post(`/portal/bookings/${h.booking_id}`, fields);
        assert.equal(r.status, 400, `after cancelling, ${JSON.stringify(fields)} was accepted`);
        assert.match(r.body, /has been cancelled/);
      }
      const staff = await h.signIn('SALES');
      const s = await staff.post(`/staff/calendar/${h.booking_id}/schedule`, { starts_at: target, assigned_to: '' });
      assert.equal(s.status, 400);
      assert.match(s.body, /was cancelled/);
      assert.equal(heldAt(h), h.starts_at);
      /* AND THE DATABASE REFUSES IT TOO — the screen is not the control. */
      assert.throws(() => h.app.db.run('UPDATE bookings SET cancelled_at = NULL, cancelled_by = NULL WHERE id = ?', [h.booking_id]),
        /final|who cancelled/);
      assert.throws(() => h.app.db.run('UPDATE bookings SET starts_at = ? WHERE id = ?', [target, h.booking_id]), /final/);
    } finally { h.close(); }
  });

  test('ANOTHER CLIENT’S CALL CANNOT BE CANCELLED, and the refusal looks like a missing one', async () => {
    const h = await booked();
    try {
      h.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        ['b-other', 'Somebody Else Limited', 'gp', 'PAID', T]);
      h.app.db.run(
        'INSERT INTO bookings (id,business_id,assigned_to,channel,entry_point,starts_at,ends_at,created_at) VALUES (?,?,NULL,?,?,NULL,NULL,?)',
        ['bk-other', 'b-other', 'phone', 'funnel_close', T]);
      const theirs = await h.client.post('/portal/bookings/bk-other', { cancel: 'on' });
      const nothing = await h.client.post('/portal/bookings/bk-nope', { cancel: 'on' });
      assert.equal(theirs.status, nothing.status);
      assert.equal(h.app.db.get<{ c: string | null }>('SELECT cancelled_at AS c FROM bookings WHERE id = ?', ['bk-other'])?.c, null);
    } finally { h.close(); }
  });

  test('THE DATABASE REFUSES A CANCELLATION WITHOUT WHO, AND A BOOKING WRITTEN ALREADY CANCELLED', async () => {
    const h = await booked();
    try {
      assert.throws(() => h.app.db.run('UPDATE bookings SET cancelled_at = ? WHERE id = ?', [T, h.booking_id]), /both who cancelled and when/);
      assert.throws(() => h.app.db.run(
        'INSERT INTO bookings (id,business_id,channel,entry_point,created_at,cancelled_at,cancelled_by) VALUES (?,?,?,?,?,?,?)',
        ['bk-x', h.business_id, 'phone', 'funnel_close', T, T, 'u-CLIENT']), /uncancelled/);
      assert.equal(h.app.db.get<{ c: string | null }>('SELECT cancelled_at AS c FROM bookings WHERE id = ?', [h.booking_id])?.c, null);
    } finally { h.close(); }
  });
});

describe('the times a client is shown are UK time, like everything else', () => {
  test('the portal’s own picker prints local time, not UTC', async () => {
    const h = await booked();
    try {
      const page = await h.client.req('/portal');
      const offered = await h.offered();
      const first = offered[0] ?? '';
      assert.notEqual(first, '');
      assert.ok(page.body.includes(localWhen(first)),
        'the picker did not print the local rendering of the time it offered');
      /* AND THE VALUE POSTED BACK IS STILL THE UTC INSTANT. The label is local;
         the wire is not, so nothing has to parse a local string back. */
      assert.match(first, /Z$/);
      assert.equal(page.body.includes(`value="${first}"`), true);
      void localClock;
    } finally { h.close(); }
  });
});
