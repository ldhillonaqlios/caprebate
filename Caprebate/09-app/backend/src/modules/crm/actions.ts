/**
 * THE CRM'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, isOwnBusiness, ownBusiness, ownOrPooledTask, ownTaskOnAssignedJob, ownWorkingTime, throughAssignedJob } = PREDICATES;

export const CRM_ACTIONS = registerActions('crm', {
  'working_time.write': {
    ADMIN: always,
    SALES: ownWorkingTime as Rule<ObjType>,
    ACCOUNTING: ownWorkingTime as Rule<ObjType>,
    SURVEYING: ownWorkingTime as Rule<ObjType>,
  },
  /**
   * Reading working times. WIDER THAN WRITING THEM, and deliberately so.
   *
   * ADMIN and SALES read everybody's, because the calendar cannot offer a slot
   * without knowing whose hours it falls in and cannot assign a call without
   * knowing who is free. ACCOUNTING and SURVEYING read only their own — they
   * have their own hours to set and no business with anyone else's diary.
   * CLIENT reads none at all: the client's own picker is served by
   * `publicSlots`, which returns moments with the people taken out and asks
   * this table without ever asking this rule, because a visitor with no account
   * is not an actor.
   */
  'working_time.read': {
    ADMIN: always,
    SALES: always,
    ACCOUNTING: ownWorkingTime as Rule<ObjType>,
    SURVEYING: ownWorkingTime as Rule<ObjType>,
  },

  /* --- the pipeline --- */
  'business.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // the client NAME, for an invoice. Nothing else follows from it.
    CLIENT: isOwnBusiness as Rule<ObjType>,
  },
  'booking.read': {
    ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>,
  },
  'booking.write': { ADMIN: always, SALES: always },
  /**
   * A CLIENT MOVES THEIR OWN CALL. And it is a
   * DECISION rather than a gap being filled — so it is written here as its own
   * row with its own reasoning, which is the whole reason it did not become
   * `CLIENT: ownBusiness` bolted onto `booking.write` above.
   *
   * WHY NOT LOOSEN `booking.write`. That action means "own and arrange a client
   * call": it decides whose diary a booking may be put into, it is what
   * `bookableUserIds` asks of every staff member to build the diary, and it is
   * the gate on the whole back-office calendar section through the sentinel
   * object. A CLIENT on that row would have appeared in the answer to "who
   * could take this call", which is absurd, and would have passed the section
   * gate, which is a leak. THE ACTIONS ARE GENUINELY DIFFERENT and one of them
   * did not exist until a client needed it.
   *
   * WHAT IT ADMITS, EXACTLY: the CLIENT role alone, on `ownBusiness`, on their
   * own booking object. No staff role is on it — a staff member moving a call
   * is `booking.write`, on the row above, and neither route is the other's back
   * door. Nothing else about a booking changes: reading it is still
   * `booking.read`, and the write path re-checks `isBookable` at the moment of
   * writing exactly as the staff path does.
   */
  'booking.move_own': { CLIENT: ownBusiness as Rule<ObjType> },
  'internal_note.read': { ADMIN: always, SALES: always },
  'internal_note.write': { ADMIN: always, SALES: always },
  /*
   * THE THREAD WITH THE CLIENT. Admin and Sales, who work the client, and the client on its own company. The
   * TEAM thread is `internal_note.*` above, and the client is on neither of its rows. THE SURVEYOR READS THE THREAD
   * WITH THE CLIENT, AND NOTHING MORE: the owner answered "Should the surveyor see a client's chat?" —
   * "With the client" only. A surveyor reads it on a company where they hold an assigned survey job (`throughAssignedJob`,
   * failing closed on an object without the list), never writes on it, and is on no row of the TEAM thread. Accounting is not on them either: its view is invoices, settled.
   * A REPLY BY EMAIL waits for Admin or Sales, who read the queue and file what the mailbox reader could not.
   */
  'client_message.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>, SURVEYING: throughAssignedJob as Rule<ObjType> },
  'client_message.write': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  'inbound_email.read': { ADMIN: always, SALES: always },
  'inbound_email.file': { ADMIN: always, SALES: always },

  /* --- the CRM backbone. CRM 1 of 10 ---------------------
   *
   * EVERY ROW BELOW IS NEW, AND EVERY ROLE NOT NAMED ON A ROW IS REFUSED IT —
   * test/crm/crm.test.ts asserts the refusal for each one, per action, rather than
   * trusting that an absent key means what it should.
   *
   * THE ORGANISATION IS THE `business` OBJECT. It is the same row, extended;
   * a second object type for it would be a second place to authorise one thing.
   * `business.read` above is untouched — it is still the client NAME, for an
   * invoice, and it is what ACCOUNTING holds. `organisation.read` is the whole
   * record, and ACCOUNTING is not on it.
   *
   * CONTACTS ARE ADMIN AND SALES ONLY. They carry people's names, routes and
   * internal notes, and nothing about the survey or the money needs them.
   *
   * PROPERTIES AND CLAIMS ARE REACHABLE BY SURVEYING ONLY `throughAssignedJob`.
   * The section gates `property.enter` and `claim.enter` are their own actions
   * for the reason `surveyor_job.enter` is: a sentinel object cannot satisfy a
   * test on the specific object without being built to pass it.
   *
   * N1 — `claim.read_value` IS ADMIN AND SALES AND NOBODY ELSE. The claim value,
   * the tax benefit and every sealed estimate field hang off it. A claim page
   * built for any other role is built forwards without them, and the payload
   * proof searches the response for all seven.
   *
   * ACCOUNTING READS A CLAIM AS CLIENT, REFERENCE AND MONEY. `claim.read`
   * admits it; src/modules/crm/crm.ts builds its view from those three and the money
   * comes through `invoice.read`, which it already holds. No join to the
   * answers, the register data, the notes, the workings or the estimate.
   *
   * CLIENT IS ON NONE OF THEM. The portal is unchanged by this phase.
   * ------------------------------------------------------------------------ */
  'organisation.read': { ADMIN: always, SALES: always },
  'organisation.write': { ADMIN: always, SALES: always },
  'contact.read': { ADMIN: always, SALES: always },
  'contact.write': { ADMIN: always, SALES: always },

  /* --- leads and the pipeline. CRM 2 of 10 --------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * crm/pipeline.test.ts asserts the refusal for each one, per action.
   *
   * LEADS ARE ADMIN AND SALES. A lead is a prospect being worked, with the
   * estimate the client was shown beside it; nothing about it is money or
   * survey work, so ACCOUNTING and SURVEYING are on none of these rows.
   *
   * `claim.move` IS A MOVE THROUGH A GATE, and the gate is asked on the server
   * at every write — src/modules/crm/pipeline.ts. Holding this action lets a person ASK
   * for a move; it never lets them past a gate that is shut. `claim.reopen`,
   * the one move backwards, is ADMIN alone and needs a reason.
   *
   * THE BOARD IS ADMIN AND SALES. A card's value is still asked per card of
   * `claim.read_value`, so a role added here later would get no value on a
   * card without being added there too.
   * ------------------------------------------------------------------------ */
  'lead.read': { ADMIN: always, SALES: always },
  'lead.write': { ADMIN: always, SALES: always },
  'lead.convert': { ADMIN: always, SALES: always },
  'pipeline.read': { ADMIN: always, SALES: always },
  'claim.move': { ADMIN: always, SALES: always },
  'claim.reopen': { ADMIN: always },

  /* --- tasks, the timeline, automation and templates. CRM 3 of 10 ----------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * crm/tasks.test.ts asserts the refusal for each one, per action.
   *
   * A TASK IS READ AND WORKED BY WHOEVER IT BELONGS TO. ADMIN and SALES read and
   * change every task. ACCOUNTING reads and progresses its own tasks and the ones
   * waiting with Accounting — the finance task the invoice stage raises — and
   * nothing about them is a join to the answers, the register data, the notes,
   * the workings or the estimate. SURVEYING does the same, and only on a claim an
   * assigned survey job reaches. Creating a task, and changing or cancelling one,
   * is ADMIN and SALES.
   *
   * THE TIMELINE ADMITS ACCOUNTING AND IS BUILT FORWARDS FOR IT. `timeline.read`
   * lets ACCOUNTING open a claim's timeline — it is already on `claim.read` — and
   * src/modules/crm/timeline.ts builds that timeline from `invoice.read` alone, so it
   * holds financial events and nothing else. SURVEYING reaches only the timeline
   * of a claim an assigned job is on, built from that job's reach.
   *
   * AN AUTOMATION RULE AND A TEMPLATE ARE ADMIN'S TO CHANGE. SALES reads both and
   * queues a merged email; nobody else is on any of these rows.
   * ------------------------------------------------------------------------ */
  'staff_task.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: ownOrPooledTask as Rule<ObjType>,
    SURVEYING: ownTaskOnAssignedJob as Rule<ObjType>,
  },
  'staff_task.create': { ADMIN: always, SALES: always },
  'staff_task.write': { ADMIN: always, SALES: always },
  'staff_task.progress': {
    ADMIN: always, SALES: always,
    ACCOUNTING: ownOrPooledTask as Rule<ObjType>,
    SURVEYING: ownTaskOnAssignedJob as Rule<ObjType>,
  },
  'timeline.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // financial events only — see the block above
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'automation_rule.read': { ADMIN: always, SALES: always },
  'automation_rule.write': { ADMIN: always },

  /* --- introducers and the referral channel. CRM 5 of 10 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * crm/introducers.test.ts asserts the refusal for each one, per action.
   *
   * AN INTRODUCER IS A FIRM AND NEVER A USER. No row here, and no row anywhere,
   * gives a firm or a person at it a way in: CLIENT and SURVEYING are on none.
   *
   * THE FIRM IS ADMIN'S AND SALES'S TO READ AND KEEP. `introducer.read_value` —
   * the estimated claim value of what it referred — is ADMIN and SALES, as
   * `claim.read_value` is. `introducer.read_money` — the fees invoiced and paid
   * from those claims — is ADMIN and ACCOUNTING, as `invoice.read` is, and
   * ACCOUNTING opens a firm with that alone: src/modules/crm/introducers.ts builds its
   * view forwards from the money, with no join to the answers, the register data,
   * the notes, the workings or the estimate.
   *
   * THE CLIENT'S OPT-IN is recorded by ADMIN or SALES, who ask the client.
   *
   * THE REWARD SETTING IS ADMIN'S TO SWITCH, and the switch still refuses while
   * clause 1 of the letter is blank. A model-B fee's disclosure is recorded by the
   * people who talk to the client, ADMIN and SALES; that it was settled with the
   * firm, by the people who keep the money, ADMIN and ACCOUNTING. NOTHING HERE
   * TAKES MONEY: `record_settled` records that Caprebate paid a firm, and
   * test/finance/accounting-view.test.ts still refuses any action named for taking a payment.
   *
   * CONTACT WITH A FIRM IS A STAFF TASK (row E48), so logging or planning it also
   * asks `staff_task.create`, which is ADMIN's and SALES's already.
   * ------------------------------------------------------------------------ */
  'introducer.enter': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer.read': { ADMIN: always, SALES: always },
  'introducer.read_value': { ADMIN: always, SALES: always },
  'introducer.read_money': { ADMIN: always, ACCOUNTING: always },
  'introducer.write': { ADMIN: always, SALES: always },
  'share_consent.read': { ADMIN: always, SALES: always },
  'share_consent.record': { ADMIN: always, SALES: always },
  'introducer_reward.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_reward.switch': { ADMIN: always },
  'introducer_fee.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_fee.disclose': { ADMIN: always, SALES: always },
  'introducer_fee.record_settled': { ADMIN: always, ACCOUNTING: always },

  /* --- dashboards, search, saved views, export and admin settings. CRM 9 of 10 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/crm/management-dashboard.test.ts
   * asserts the refusal for each one, per action.
   *
   * `dashboard.enter` OPENS THE MANAGEMENT DASHBOARD AND NOTHING INSIDE IT. Every tile
   * asks the actions its own figures already need — `pipeline.read`, `claim.read_value`,
   * `invoice.read`, `claim_figures.read`, `compliance.read` and the rest — so a role that
   * enters sees only the tiles those rows admit, and SURVEYING, which holds none of them,
   * sees its own survey jobs and nothing else. A tile is never a second rule.
   * ------------------------------------------------------------------------ */
  'dashboard.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
  /*
   * MERGING A FIRM — the public referral form's new firm onto the one already recorded. ADMIN alone: it moves who
   * referred what, and migration 019's trigger admits a person's move between firms only inside the merge.
   */
  'introducer.merge': { ADMIN: always },
});
