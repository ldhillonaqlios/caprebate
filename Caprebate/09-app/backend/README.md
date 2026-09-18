# `@caprebate/backend`

**Blocks B, C, D, E and F of the Developer Build Order. Phases 103 to 107,
8–9 September 2026.**

> **The spec that describes the whole of this is `09-app/CAPREBATE-DEVELOPER-SPEC.md`**
> (Phase 108, 9 September 2026): the user cases, every screen, every internal
> and external API, **what is stubbed and exactly where**, and what a developer
> still has to do before any of it may be deployed. Read its first paragraph
> before you run anything.

Phase 103 built authentication, five application roles, server-side
authorisation and an append-only audit log. **One process, both applications.**
Nothing visible came out of it — it decides whether the two applications are
shippable or a demonstration wearing a suit.

Phase 104 put the public half on top of it: the site, the six-screen assessment,
the customer login and the client portal (`src/web/`).

Phases 106 and 107 finished the back office — the engaged-client list and the
five-panel business page, then the surveyor's review-and-sign workspace and the
accounting view.

Phase 105 added the back office's first three sections — **settings, the filled
assessments, and the calendar** — in that order, because working times are the
booking system's only input and the calendar cannot be right until they exist.
See **The back office** below.

## From a clean checkout

```bash
npm install          # one runtime dependency: @node-rs/argon2 (prebuilt, no compiler)
npm run migrate      # creates caprebate.db from migrations/ (007 rebuilds `businesses`)
npm run seed         # invented data + one user per role. Refuses without CAPREBATE_ALLOW_SEED=1
npm run verify-audit # recomputes the audit log's hash chain from caprebate.db; writes nothing; exit 1 if broken
npm start            # http://localhost:8103
npm run start:demo   # in-memory, seeded, http://localhost:8105 — for looking at the screens
npm run check        # lint:sql, typecheck, the whole suite — run it, do not quote it
```

**No hidden state.** Everything the application needs is passed to `buildApp` —
the database location, the clock, the hasher, the transports. There is no
module-level singleton and no ambient configuration read from somewhere unnamed,
which is why a test builds a whole application in memory and start-up does the
same thing with different arguments.

## Persistence

SQLite through `node:sqlite`, built into Node 24 — **a real database with real
constraints and real migrations, needing no server to install**, and one adapter
away from Postgres or MySQL. Schema and migrations are in `migrations/` and in
version control. Every table is `STRICT`; foreign keys are on.

**NO STRING-BUILT SQL ANYWHERE, and it is checked rather than promised.**
`npm run lint:sql` fails the build on a template literal or a concatenated
variable inside a statement. It was proved able to fail before it was kept.

**Migration 007 rebuilds `businesses`** — the twelve-step SQLite procedure, to
remove `preferred_contact`, which migration 004 had ended (every value NULL, two
triggers refusing any new one) and could not delete: SQLite refuses `DROP COLUMN`
on a column named in a table CHECK. **Thirteen tables carry a foreign key into
that table**, which is why 004 declined the rebuild and why 007 does not rely on
having got it right: `PRAGMA foreign_key_check` runs inside the transaction,
turned into a *failure* rather than a report by a one-column guard table whose
CHECK demands zero. Any violation aborts the migration and it is never recorded
as applied. That guard was proved able to fail against a deliberately broken
database before it was kept.

**Migration 008 adds two columns and two triggers**, so that a withdrawn client
question cannot be recorded anonymously. `client_tasks.state` has allowed
`WITHDRAWN` since 003 and nothing ever set it; the control that does is
`withdrawTask`, and `withdrawn_at` / `withdrawn_by` are what make *"we asked
this and then took it back"* answerable three years later. SQLite cannot add a
table CHECK to an existing table, so the constraint is a pair of triggers — the
idiom migration 004 established — and it was proved able to fail before it was
kept: the raw `UPDATE client_tasks SET state = 'WITHDRAWN'` that the test for
that state used to write is now refused.

## The six application roles

They are **not** the six board owner types, and **not** the five roles in
`caprebate-anchor-quarantine.ts`. `src/roles.ts` is the only place the three
meet. See the actor table in the Developer Brief.

| Role | What it is |
|---|---|
| `ADMIN` | Super user: creates, edits and disables users, assigns roles |
| `SALES` | The pipeline: assessments, calendar, engaged clients, tasks |
| `ACCOUNTING` | **Caprebate's own finance.** Client name, claim value, fee, invoice and payment status, VAT position. Not the questions and answers, not the register data, not the internal notes, not the surveyor's workings |
| `SURVEYING` | The review-and-sign workspace, and nothing else |
| `CLIENT` | Their own record only |
| `READ_ONLY` | Phase 132e. View only, assigned to nobody: an explicit yes or no on every action in `READ_ONLY_RULES` (`src/authz.ts`). Writes nothing but its own password; never the estimate, a claim value, money, the registers or the audit log; no export |

The client's own accountant is a **different actor**, has no login, and receives
the computation pack offline.

## Authorisation

```
can(actor, action, object) -> boolean
```

**It takes the specific object, not just a type.** "May this user read THIS
assessment" is the question; "may sales read assessments" is not.

**A screen that omits a field is presentation. A store that refuses it is a
control.** Nothing in `src/authz.ts` consults a route name, a UI or a hidden
field.

**DENY BY DEFAULT, structurally.** `can` cannot return true without finding a
rule: no rule for the action, no rule for the role, or a predicate returning
false all reach the same `return false`. A new route with no rule fails closed,
and a test registers nothing and asserts the refusal. A disabled user is checked
first, so a disabled admin is refused before any rule can say yes.

## N1 — the anchor quarantine, enforced here and not later

Our estimate **is not in the data a surveyor's session receives.** Not hidden,
not greyed, **not present in the response**.

`caprebate-anchor-quarantine.ts` is the rule and is not re-implemented.
`src/payload.ts` asks it, and builds the surveyor's object **from the released
inputs forwards** rather than building everything and stripping the estimate —
because a build-then-strip assembler is one forgotten key away from leaking,
and a new estimate field must be absent by default.

The test looks for the estimate three ways: by field name, by **value** at any
depth under any name, and in the serialised text. A build that renamed the field
on the way out would pass the first and fail the other two.

## Authentication

argon2id at the OWASP baseline (m=19456, t=2, p=1), behind a `PasswordHasher`
interface so the parameters can move. Sessions are **server-side records**, so
revocation is real: **disabling a user ends their live sessions at once, not at
next login.** Cookies are httpOnly, secure, sameSite; sessions rotate on
privilege change and record what they rotated from. Login and reset are
rate-limited.

**Failure messages are generic** — *those details did not match*, never *no such
user*. An unknown address still pays for a password verification against a real
argon2id hash, so the response time does not answer the question either.

A reset token is **single-use and expiring**, stored only as a hash, and
consuming one revokes every session the user held.

## The audit log

Append-only, tamper-evident, covering authentication, role changes, document
access and every research firing.

**Append-only is enforced twice**: `BEFORE UPDATE` and `BEFORE DELETE` triggers
abort at the database, and the rows are hash-chained with the same scheme
`caprebate-anchor-quarantine.ts` uses — so somebody with the file who drops the
triggers still cannot rewrite history undetected. There is a test that does
exactly that and asserts `verify()` catches it.

**Reading it and checking it — the CRM follow-on.** ADMIN reads it at `/staff/audit`: kinds, ids and
outcomes from fixed filters, never a line's detail, with the chain recomputed on every read and the
read itself recorded. `npm run verify-audit` recomputes the chain from the database file without the
server, writes nothing, and exits 1 when it is broken.

**No personal data in log lines, and the screen REFUSES rather than redacts** —
a redacting logger teaches callers that it is safe to pass anything.

## What is stubbed — the whole list

| Stub | Module | What is not real |
|---|---|---|
| Email | `src/stubs/email.ts` | Delivery. Messages are written to the `outbox` table and shown on screen, labelled as not sent. **The token mechanics are real.** |
| Registers | `src/stubs/registers.ts` | The connectors. Nothing is called. **Both gates are real** and are reported honestly. |
| Signature | `src/stubs/signature.ts` | The provider. Nothing is executed. |
| Text extraction | `src/web/uploads.ts` (`documentTextExtractor`) → `src/web/extract-text.ts` | **What is still not read:** a **scanned** PDF (page images, no text operators — that is OCR), an **encrypted** PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, `.doc`, `.xlsx`, `.pptx`. Each returns **one marker line**, so on those the receipt strip runs over a marker rather than over the document. **NARROWED 9 September 2026 (Phase 113c):** `.docx` and PDFs whose text sits in uncompressed or FlateDecode streams **are now read and are stripped**, proved end to end by a name planted in each and removed by the receipt policy. The row changes wording rather than disappearing — added to this table and to `STUBS` on 9 September 2026 (Phase 108), when it had declared itself a stub in its own file and appeared in no list. |

**Everything else is real.** Each stub is one named module behind an interface,
so replacing it is a swap and not a search. **`STUBS` in `src/app.ts` is the
machine-readable copy of this table**, it is served at `GET /api/health`, and a
test asserts that a module calling itself a stub in prose is in it.

**The two gates are not ours to open.** Free register calls wait on a published
privacy notice; paid calls wait on a signed engagement asserted server-side plus
one operator click. A shut gate reports `NOT_PERMITTED_YET` — **nothing refuses
and nothing throws**, because an unknown stays unknown (N4).

## The seed

Six invented businesses across all five sectors at six different stages, plus
one user per role. **No real client, no real person, no real property.**

It obeys the name exclusion register (**N2**) by being **wired into it**: every
seeded register record goes through `assertNoUnauthorisedName`, so the seed
cannot demonstrate a shape the real ingestion would reject. It carries **no
personal names at all** — stricter than N2 requires, because a developer reads
the seed as the schema. Postcodes are from the `ZZ` range reserved for fiction.

## The back office — Phase 105

**Settings, the filled assessments, and the calendar.** `/staff/*`, gated once by
`backoffice.enter` for the whole prefix, with every section still authorising its own
objects behind it.

### Working times are the booking system's only input

`src/web/schedule.ts` holds **one function that decides whether a moment is bookable**, and
the staff calendar, the staff booking page and the client's own funnel-close picker all ask
it. The write path asks it **again** at the moment of writing, so a time that never appeared
on a screen is refused: **a picker is a courtesy, the refusal is the control.**

Setting working times and being bookable are **different permissions** — everybody on the
staff has hours; only the roles on `booking.write` can own a client call, and
`bookableUserIds` asks `can()` rather than carrying a list of role names.

**Nobody available is an answer, not an empty list.** Four states, because "nobody set any
hours", "the window is full", "there is nobody to set them" and "those hours have already
passed" lead to four different actions.

### Stored times are UTC. Screens show UK time. — Phase 113a

**One file names a timezone and nothing else does**: `src/web/localtime.ts`, `DISPLAY_ZONE`.
Every `starts_at`, `created_at` and audit `at` is ISO-8601 UTC and stays that way — they sort,
they survive a Postgres port, and they cannot be confused about seconds and milliseconds.
**The conversion is at the edges only**: the four functions that print a moment, and the two
that read a day or an hour a person named.

**Working times are LOCAL minutes against a LOCAL weekday**, converted per candidate day when
slots are generated. A person's hours are local hours: nine to five means nine to five in
January and in July, and storing UTC minutes would move everybody's day by an hour twice a
year and make them re-enter it. `schedule.ts` decision 3 has the full reasoning.

**The offset is asked of `Intl`, never assumed.** A hard-coded `+1` is wrong for four months
of the year, a `0` for eight, and both are wrong on the two mornings that matter — so
`instantsForLocalMinute` returns **zero** instants for a local time in the March gap and
**two** for one in the October overlap. `test/localtime.test.ts` asserts everything twice, on
real dates either side of both 2026 transitions, and **fails on either constant**; that was
proved by inserting them.

### A client can move their own call — Phase 113a

`POST /portal/bookings/{id}`, authorised by **`booking.move_own`** — a rule of its own, CLIENT
only, `ownBusiness`. It is deliberately not `CLIENT` added to `booking.write`: that action
means *own and arrange a client call*, it builds the diary through `bookableUserIds`, and it
gates the back-office calendar section.

The times come from `publicSlots` — **the same function the funnel-close picker uses, people
taken out**. The write asks `isBookable` again at the moment of writing. The move lands in
`booking_changes` with the client named, and the staff booking page's existing history renders
it without a line of new code.

**Two hours' notice**, at both ends: a client may not move a call inside two hours of it, nor
into the next two hours. **There is no self-service cancel and that is a decision** — a cancel
with no replacement time is a lead going cold. What they get instead is *release*: the slot
goes back into the pool, the enquiry and its channel survive, and the call reappears in the
back office's "asked for a time and has not got one" list. The alternatives are drawn above
the way out.

### The client's number and the staff's number are one number

`src/web/shown-range.ts` converts pounds to pence **exactly once**. Four screens render the
same function of the same integer, so the two views cannot differ by a double rounding —
which is what used to make £1,234.4999 read as £1,234 on one screen and £1,235 on the other.

### The profile photograph

Same hardened path as a client document, with three differences, each on purpose: a narrower
allow-list (**PNG only**), a smaller cap (2 MB), and **nothing the user sent is stored at
all**. The bytes are decoded to pixels and a new file is written from those pixels, so a
payload in a `tEXt` chunk or appended after `IEND` is gone by construction rather than by
being stripped. `src/web/images.ts` does the decoding with `node:zlib` and no dependency;
decompression bombs are refused from IHDR before any inflate.

**Admin power is over an account, not inside it.** `user.change_own_profile` and
`user.set_photo` are `self` for every role including ADMIN.

### Settings is mounted twice

`/staff/settings` and `/portal/settings` are **one implementation**, so a password change
cannot rotate the session on one and forget on the other. What differs is the shell and which
sections are drawn; every authorisation is the same `can()` call, and a client posting to the
working-times route is refused by the rule rather than by the absence of a form.

### What is stubbed here, and it says so on screen

**Outbound email and calendar invitations.** Both write to the `outbox` table, `sent_at`
stays NULL, and the settings page shows the outbox so that "not sent" is something a person
can look at rather than a claim in a footer.
