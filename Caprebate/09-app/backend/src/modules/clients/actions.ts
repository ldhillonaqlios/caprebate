/**
 * THE CLIENT RECORD'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The actions the
 * client record's own code asks, moved from the CRM's table (src/modules/crm/actions.ts) word for word as that code moved
 * here; the core puts every module's together when the module loads (registerActions), and authorise() decides exactly
 * as before. An action has one owner, so each is MOVED, never copied. Loaded first by the front door, and by the data
 * file, so every path into the module can ask them.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, ownBusiness, ownWorkingTime } = PREDICATES;

export const CLIENTS_ACTIONS = registerActions('clients', {
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
  'automation_rule.read': { ADMIN: always, SALES: always },
  'automation_rule.write': { ADMIN: always },
  'introducer_reward.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_fee.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_fee.disclose': { ADMIN: always, SALES: always },
  'introducer_fee.record_settled': { ADMIN: always, ACCOUNTING: always },
});
