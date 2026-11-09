/**
 * Seeded data — AND EVERY WORD OF IT IS INVENTED.
 *
 * NO REAL CLIENT, NO REAL PERSON, NO REAL PROPERTY, EVER, in something handed
 * to a third party. This file is read by a developer who has never met the
 * business, and it is the first thing they will copy.
 *
 * IT OBEYS THE NAME EXCLUSION REGISTER (N2) — WIRED IN, NOT RESTATED. Every
 * seeded register record goes through `ingestRegisterRecord`, which runs
 * caprebate-name-exclusion.ts over it. A field that is neither kept nor
 * excepted is REFUSED, so this seed cannot demonstrate a shape the real
 * ingestion would reject.
 *
 * AND IT CARRIES NO PERSONAL NAMES AT ALL — not even invented ones.
 *
 *   That is stricter than N2 requires, and deliberately so. N2 governs fields a
 *   REGISTER would have supplied. But a developer reads the seed as the schema:
 *   put "Sarah Whitcombe, registered manager" in it and a registered-manager
 *   column appears in someone's code by Thursday. So businesses have a contact
 *   CHANNEL rather than a contact person, and the five users are named for
 *   their ROLE. Postcodes are from the ranges reserved for fiction and
 *   documentation, and no invented company shares a name with a real one that
 *   a search could find.
 *
 * SIX BUSINESSES ACROSS ALL FIVE SECTORS, AT DIFFERENT STAGES — one that has
 * only submitted an assessment, one mid-research, one with the engagement
 * signed, one at survey, one invoiced, one paid — because a pipeline seeded
 * entirely at one stage tests nothing about the pipeline.
 */

import { AuditLog, createUser, newId } from '../core/index.ts';
import type { AppRole, Db, PasswordHasher } from '../core/index.ts';
import { seedSignatureRecord } from '../modules/claims/index.ts';
import { ingestRegisterRecord, insertResearchSourcesNotPermittedYet } from '../integrations/index.ts';
import { catalogue } from '../modules/claims/index.ts';
import { backfillClaimFor, insertClaim } from '../modules/crm/index.ts';
import { allocateNumber } from '../modules/finance/index.ts';
import { backfillLeadFor } from '../modules/crm/index.ts';
import { recordOpened } from '../modules/crm/index.ts';
import { insertTask, type TaskInsert } from '../modules/crm/index.ts';
import { insertEnquiryChecks2 } from '../modules/public-site/index.ts';
import { getContactsCountByBusinessId, getContactsIdByBusinessIdContactType, getLeadsIdByOriginStatus, insertBookings, insertBusinesses2, insertContacts2, insertLeads3, insertStaffTasks2, insertWorkingTimes, updateBusinessesClaimantTypeById, updateBusinessesClientStatusActiveById, updateBusinessesClientStatusById, updateBusinessesLegalNameCompanyNumberById2, updateBusinessesSourceUpdatedAt } from '../modules/crm/index.ts';
import { getClaimsIdByBusinessIdAssessmentId, getClaimsIdByBusinessIdAssessmentIdNotNull, getClaimsIdByBusinessIdAssessmentIdNull, listEngagementsBusinessIdByLetterStateSigned, getClaimsIdByBusinessIdLabel, getPropertiesIdByBusinessId, getPropertiesIdByBusinessId3, insertClaimDeliverables2, insertClaimFacts2, insertClaimMilestones2, insertClaimStageMoves3, insertEngagements2, insertProperties2, insertProperties3, insertProperties5, insertTaxAdviserSignoffs2, updateClaimDeliverablesStateIssuedOnById2, updateClaimsOwnerIdPriorityByBusinessId, updatePropertiesAddressLine1TownByBusinessId, updatePropertiesTenureTownById } from '../modules/claims/index.ts';
import { getAssessmentsIdByBusinessId, insertAssessmentAnswers, insertAssessments2, insertEstimates2 } from '../modules/assessment/index.ts';
import { insertInvoicePayments, insertInvoices2 } from '../modules/finance/index.ts';
import { insertSurveyorCommitments, insertSurveyorJobs } from '../modules/survey/index.ts';

/**
 * Development credentials. Printed by `npm run seed`, never a default in any
 * deployed configuration: `src/app/cli.ts` refuses to seed, and `tools/demo-server.ts`
 * refuses to start, unless CAPREBATE_ALLOW_SEED is set, so this cannot arrive in
 * production by being forgotten. `app.ts` does not check the flag; those two do.
 */
export const SEED_PASSWORD = 'change-this-seed-password';

const USERS: readonly { email: string; display_name: string; role: AppRole }[] = [
  { email: 'admin@example.invalid', display_name: 'Admin User', role: 'ADMIN' },
  { email: 'sales@example.invalid', display_name: 'Sales User', role: 'SALES' },
  { email: 'accounting@example.invalid', display_name: 'Accounting User', role: 'ACCOUNTING' },
  { email: 'surveying@example.invalid', display_name: 'Surveying User', role: 'SURVEYING' },
];

/**
 * THE CONTACT CHANNEL IS CB_BOOKING'S, AND IT USED NOT TO BE.
 *
 * This list once carried 'virtual' and 'post'. 'virtual' is VIDEO,
 * which CB_BOOKING deliberately removed and whose own
 * comment says "do not quietly re-add it here"; 'post' was never a channel at
 * all. Neither is a thing a client can choose, so the seed was demonstrating a
 * shape the funnel cannot produce — and a developer reads the seed as the
 * schema, which is how video would have come back.
 *
 * Migration 004 narrows the column to CB_BOOKING's three ids at the database,
 * and it refused this file until it was corrected. That is the sequence to
 * repeat: put the rule where the data is, and let it fail the seed.
 */
type SeedBusiness = {
  key: string;
  name: string;
  sector: 'care_homes' | 'dental' | 'supported_living' | 'gp' | 'private_hospital';
  stage: string;
  postcode: string;
  /**
   * A CB_BOOKING channel id. There are three and these are they.
   * IT IS WRITTEN TO THE BOOKING ROW. There used to be a second home for it,
   * `businesses.preferred_contact`; migration 004 retired that column and
   * migration 007 removed it, so the booking row is now the only place a
   * contact channel exists at all. The field name here is kept because it is
   * what a reader of the seed calls this fact — it is not a column name.
   */
  preferred_contact: 'phone' | 'sms_whatsapp' | 'email';
  /** CB_BOOKING.ENTRY_POINTS — where in the journey they asked. */
  entry_point: 'funnel_close' | 'after_refined_range' | 'gated_exit';
};

/** ZZ postcodes are reserved and match no real property. */
const BUSINESSES: readonly SeedBusiness[] = [
  { key: 'b1', name: 'Aldergate Care Group Limited',        sector: 'care_homes',       stage: 'ASSESSMENT_SUBMITTED', postcode: 'ZZ1 1AA', preferred_contact: 'email', entry_point: 'funnel_close' },
  { key: 'b2', name: 'Brackenfell Dental Partnership LLP',  sector: 'dental',           stage: 'RESEARCH_PART_RUN',    postcode: 'ZZ2 2BB', preferred_contact: 'phone', entry_point: 'funnel_close' },
  { key: 'b3', name: 'Corvale Supported Living Limited',    sector: 'supported_living', stage: 'ENGAGEMENT_SIGNED',    postcode: 'ZZ3 3CC', preferred_contact: 'phone', entry_point: 'gated_exit' },
  { key: 'b4', name: 'Dunmarrow Medical Practice Limited',  sector: 'gp',               stage: 'AT_SURVEY',            postcode: 'ZZ4 4DD', preferred_contact: 'email', entry_point: 'funnel_close' },
  { key: 'b5', name: 'Elverton Private Hospital Limited',   sector: 'private_hospital', stage: 'INVOICED',             postcode: 'ZZ5 5EE', preferred_contact: 'sms_whatsapp', entry_point: 'after_refined_range' },
  { key: 'b6', name: 'Fenmoor Nursing Homes Limited',       sector: 'care_homes',       stage: 'PAID',                 postcode: 'ZZ6 6FF', preferred_contact: 'phone', entry_point: 'funnel_close' },
];

export type SeedResult = {
  users: { id: string; email: string; role: AppRole }[];
  businesses: { id: string; key: string; name: string }[];
  password: string;
};

export async function seed(db: Db, hasher: PasswordHasher, now: () => string): Promise<SeedResult> {
  const t = now();
  const hash = await hasher.hash(SEED_PASSWORD);
  const out: SeedResult = { users: [], businesses: [], password: SEED_PASSWORD };
  const idOf = new Map<string, string>();

  for (const b of BUSINESSES) {
    const id = newId();
    idOf.set(b.key, id);
    insertBusinesses2(db, [id, b.name, b.sector, b.stage,
        // A CHANNEL, not a person. No mailbox is named for an individual.
        `enquiries@${b.key}.example.invalid`, '01632 960000', t]);
    insertProperties5(db, [newId(), id, `${b.name} — main site`, b.postcode, t]);
    out.businesses.push({ id, key: b.key, name: b.name });
  }

  for (const u of USERS) {
    const created = createUser(db, now, { ...u, password_hash: hash });
    out.users.push({ id: created.id, email: created.email, role: created.role });
  }

  // One CLIENT, belonging to exactly one business. The CHECK constraints on
  // `users` refuse a client without a business and a staff user with one.
  const clientBusiness = idOf.get('b3');
  if (clientBusiness === undefined) throw new Error('seed: b3 missing');
  const client = createUser(db, now, {
    email: 'client@example.invalid', display_name: 'Client User',
    role: 'CLIENT', password_hash: hash, business_id: clientBusiness,
  });
  out.users.push({ id: client.id, email: client.email, role: client.role });

  seedPipeline(db, now, idOf, out.users);
  seedRegisterRecords(db, now, idOf);
  seedWorkingTimesAndBookings(db, now, idOf, out.users);
  seedCrm(db, now, idOf, out.users);
  seedTasks(db, now, idOf, out.users);
  seedClaimAtInvoice(db, now, idOf, out.users);
  seedAContactForEveryClient(db, now, idOf);
  return out;
}

/**
 * — EVERY INVENTED CLIENT HAS A CONTACT WE CAN REACH. Contact details are not
 * optional (line 6), so a client with none is flagged; the owner asked for one invented contact on each seeded client
 * that had none, so the demo and the test website show clients as they should be. Dunmarrow keeps its two. A CHANNEL,
 * not a person, as everywhere in this file: a role name and a role mailbox, and a number in Ofcom's drama range.
 */
function seedAContactForEveryClient(db: Db, now: () => string, idOf: Map<string, string>): void {
  const t = now();
  for (const b of BUSINESSES) {
    const id = idOf.get(b.key);
    if (id === undefined) throw new Error(`seed: ${b.key} missing`);
    if ((getContactsCountByBusinessId<{ n: number }>(db, [id])?.n ?? 0) > 0) continue;
    insertContacts2(db, [newId(), id, 'Main Contact', t, 'DECISION_MAKER', 1, `contact@${b.key}.example.invalid`, '01632 960001', t]);
  }
}

/**
 * A CLAIM AT THE INVOICE STAGE, READY FOR OUR FEE — the CRM follow-on. Invented, like everything here.
 *
 * WHY IT EXISTS. No seeded claim stood at INVOICE, so "Raise our fee" could not be shown in training, and the guide's
 * exercise for it could not be run. This is a second property of Dunmarrow's — a branch surgery, on the organisation whose
 * survey job the surveyor already holds, so the surveyor's reach grows by this claim and by no other organisation — opened
 * by staff and walked to INVOICE with the records every gate on the way reads, so the fee can be raised through the real
 * store and nothing about it is typed:
 *
 *   · a survey job on the claim with the surveyor's commitment, which the sign-off record is made against;
 *   · the tax adviser's sign-off record, recorded after the claim entered the sign-off stage — the figure the fee derives from;
 *   · both reports issued in the deliverables register — the client report and the accountant's computation pack;
 *   · the amendment window open: a company, the branch surgery acquired inside the recorded accounting period;
 *   · the fee trigger reached at its most cautious reading — HMRC has processed the relief — confirmed at INVOICE;
 *   · a next action owned by Accounting, and NO fee invoice, so the finance view counts it as a fee expected.
 *
 * WRITTEN AS ROWS, as every seeded row is, and each passes the database's own triggers. THE FIGURES ARE CHOSEN SO THAT NO
 * DIGIT RUN OF THEM IS ONE OF THE SEALED ESTIMATE'S SEVEN VALUES — tools/payload-proof.ts searches for those as raw text.
 */
function seedClaimAtInvoice(
  db: Db, now: () => string, idOf: Map<string, string>,
  users: readonly { id: string; email: string; role: AppRole }[],
): void {
  const b4 = idOf.get('b4');
  const sales = users.find((u) => u.role === 'SALES')?.id;
  const accounting = users.find((u) => u.role === 'ACCOUNTING')?.id;
  const surveying = users.find((u) => u.role === 'SURVEYING')?.id;
  if (b4 === undefined || sales === undefined || accounting === undefined || surveying === undefined) throw new Error('seed: the claim at INVOICE is missing a record it needs');
  const assessment = getAssessmentsIdByBusinessId<{ id: string }>(db, [b4]);
  if (assessment === undefined) throw new Error('seed: Dunmarrow has no assessment');

  // Dunmarrow is already a company, with its claimant type recorded; the branch surgery is its second property.
  const t = now();
  const branch = newId();
  insertProperties2(db, [branch, b4, 'Dunmarrow Medical Practice Limited — branch surgery', 'ZZ4 4DE', t, 'LEASEHOLD', '2025-06-30', t]);
  const claim = insertClaim(db, now, newId, {
    business_id: b4, property_id: branch, assessment_id: null, workstream: 'PLANT_AND_MACHINERY',
    stage: 'INVOICE', owner_id: sales, surveyor_id: surveying,
  });
  recordOpened({ db, now, newId }, null, claim.id, 'ENQUIRY', 'opened by staff on a property; its enquiry checks are recorded on the claim');

  const move = (from: string, to: string): void => {
    insertClaimStageMoves3(db, [newId(), claim.id, now(), sales, from, to]);
  };
  const fact = (key: string, value: string, kind: 'text' | 'date'): void => {
    insertClaimFacts2(db, [newId(), claim.id, key, kind === 'text' ? value : null, kind === 'date' ? value : null, sales, now()]);
  };

  let at = 'ENQUIRY';
  for (const to of ['ASSESSMENT', 'ENGAGEMENT', 'DATA_GATHERING'] as const) { move(at, to); at = to; }
  fact('ELECTION_EXISTS', 'NO', 'text');
  move(at, 'SURVEY'); at = 'SURVEY';
  const job = newId();
  const committed = now();
  insertSurveyorJobs(db, [job, b4, assessment.id, surveying, 'COMMITTED_AND_RELEASED', committed, committed, claim.id]);
  const commitment = newId();
  insertSurveyorCommitments(db, [commitment, job, surveying, 16_450_000, 52_300_000, 3_900_000, 0.23,
      'Invented for the seed: the branch surgery measured from the drawings the client supplied.', committed, 'e'.repeat(64), committed]);
  for (const to of ['VALUATION'] as const) { move(at, to); at = to; }
  fact('GRANTS_EXIST', 'NO', 'text');
  move(at, 'TAX_ADVISER_SIGNOFF'); at = 'TAX_ADVISER_SIGNOFF';
  const signoff = newId();
  insertTaxAdviserSignoffs2(db, [signoff, claim.id, 16_450_000, commitment, 'd'.repeat(64), sales, now()]);
  move(at, 'REPORTS'); at = 'REPORTS';
  for (const [kind, type] of [['CLIENT_REPORT', 'CA_REPORT'], ['ACCOUNTANT_COMPUTATION_PACK', 'TAX_COMPUTATION']] as const) {
    const d = newId();
    const drafted = now();
    insertClaimDeliverables2(db, [d, claim.id, kind, type, sales, drafted, sales, drafted]);
    updateClaimDeliverablesStateIssuedOnById2(db, [sales, now(), d]);
  }
  fact('ACCOUNTING_PERIOD_START', '2025-04-01', 'date');
  fact('ACCOUNTING_PERIOD_END', '2026-03-31', 'date');
  move(at, 'INVOICE');
  insertClaimMilestones2(db, [newId(), claim.id, 'Invented for the seed: the accountant confirmed HMRC processed the amended return.', sales, now()]);
  insertTask(db, now, newId, {
    title: 'Raise our fee: the claim is at the invoice stage and HMRC has processed the relief', description: null,
    owner_id: accounting, owner_role: null, due_on: '2026-09-30', priority: null, activity_type: 'TASK',
    business_id: b4, property_id: branch, claim_id: claim.id, lead_id: null, contact_id: null, fact_id: null, recurrence: null,
    recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null, created_by: sales,
  });
}

/**
 * WORKING TIMES FIRST, THEN BOOKINGS — the same order the calendar builds in, and
 * for the same reason: a booking that does not fall inside somebody's hours is
 * a booking the calendar could not have made, and a seed that contained one
 * would be demonstrating a state the application refuses to produce.
 *
 * MONDAY TO FRIDAY, 09:00 TO 17:00 UTC, for ADMIN, SALES AND ACCOUNTING —
 * AND ONLY TWO OF THOSE THREE PRODUCE A BOOKABLE SLOT. That is the point of
 * seeding all three.
 *
 * SETTING WORKING TIMES AND BEING BOOKABLE ARE DIFFERENT PERMISSIONS. Everybody
 * on the staff has hours; only ADMIN and SALES are on `booking.write`, so only
 * their diaries are offered for a client call. `bookableUserIds` in
 * src/modules/crm/schedule.ts asks the rule table rather than carrying a list, and the
 * finance user is here so that a developer can see the distinction working
 * instead of reading about it. Until it existed, an unassigned booking was
 * auto-assigned to whoever's hours covered the slot — and on this very data
 * that was the finance user, which is what a screenshot of the calendar showed.
 *
 * SURVEYING GETS NO HOURS AT ALL. Not an omission: the surveyor's diary is a
 * different calendar with a different owner — CB_BOOKING says so where it
 * explains why video was removed — and giving them client-call hours here would
 * invite the next reader to book a sales call into a survey slot.
 */
function seedWorkingTimesAndBookings(
  db: Db, now: () => string, idOf: Map<string, string>,
  users: readonly { id: string; email: string; role: AppRole }[],
): void {
  const t = now();
  const bookable = users.filter((u) => u.role === 'ADMIN' || u.role === 'SALES' || u.role === 'ACCOUNTING');
  for (const u of bookable) {
    for (const weekday of [1, 2, 3, 4, 5]) {
      insertWorkingTimes(db, [newId(), u.id, weekday, 9 * 60, 17 * 60]);
    }
  }

  /**
   * ONE BOOKING PER BUSINESS, THROUGH THE CHANNEL THEY CHOSE, AND NO TIMES.
   *
   * Every one lands with `starts_at` NULL, which is exactly what the funnel
   * close writes when a client asks for a call without picking a moment — so
   * the seeded back office opens on a real work queue rather than on a diary
   * that somebody has already tidied. Booking one of these in and watching it
   * appear in the client's own portal is the demonstration the booking work
   * asks for, and it cannot be demonstrated on data that arrived pre-booked.
   */
  for (const b of BUSINESSES) {
    const business = idOf.get(b.key);
    if (business === undefined) throw new Error(`seed: business ${b.key} missing`);
    insertBookings(db, [newId(), business, b.preferred_contact,
       b.preferred_contact === 'sms_whatsapp' ? 'sms' : null, b.entry_point, t]);
  }
}

function seedPipeline(
  db: Db, now: () => string, idOf: Map<string, string>,
  users: readonly { id: string; email: string; role: AppRole }[],
): void {
  const t = now();
  const get = (k: string): string => {
    const v = idOf.get(k);
    if (v === undefined) throw new Error(`seed: business ${k} missing`);
    return v;
  };

  const engagement: readonly [string, 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED'][] = [
    ['b1', 'NOT_SENT'], ['b2', 'SENT'], ['b3', 'SIGNED'],
    ['b4', 'SIGNED'], ['b5', 'SIGNED'], ['b6', 'SIGNED'],
  ];
  for (const [k, state] of engagement) {
    insertEngagements2(db, [newId(), get(k), state, state === 'SIGNED' ? t : null, t]);
    // AssertSignedEngagement reads the signature record, so a seeded signed letter carries one — marked SEED.
    if (state === 'SIGNED') seedSignatureRecord({ db, audit: new AuditLog(db), now: () => t, newId }, get(k), t);
  }

  // An assessment for every business, each with a handful of answers that show
  // all three answer states — because "I don't know" and "skipped" are
  // first-class answers throughout this system and a seed that only shows
  // ANSWERED teaches the wrong schema.
  for (const b of BUSINESSES) {
    const businessId = get(b.key);
    const aId = newId();
    insertAssessments2(db, [aId, businessId, b.sector, t, 20_000_000, 40_000_000, t]);
    const answers: readonly [string, string, 'ANSWERED' | 'DONT_KNOW' | 'SKIPPED', string | null][] = [
      ['Q0', 'What kind of property is this assessment for?', 'ANSWERED', b.sector],
      ['Q1', 'How is the business set up?', 'ANSWERED', 'company'],
      ['Q2', 'Is there a tax bill for allowances to reduce?', 'ANSWERED', 'yes'],
      ['Q7', 'How much Annual Investment Allowance headroom is left this period?', 'DONT_KNOW', null],
      ['Q9', 'Was a section 198 election made on purchase?', 'SKIPPED', null],
    ];
    answers.forEach(([qid, text, state, value], i) => {
      insertAssessmentAnswers(db, [newId(), aId, i, qid, text, state, value]);
    });

    insertEstimates2(db, [newId(), aId, businessId, 30_000_000, 0.3, 18_000_000, 12_000_000, 5_000_000, 0.25,
        7_500_000, t, 'seed-not-a-real-hash']);

    // Both tiers, and both gates shut. NOT_PERMITTED_YET is the honest state
    // today: the privacy notice is not published and no connector exists.
    //
    // THE LIST AND THE TIERS COME FROM THE CATALOGUE, NOT FROM HERE. Until
    // a later check this was five hand-written pairs, and by the time that check
    // read them two were WRONG: HMLR Price Paid and VOA open data were marked
    // PAID, where the Build Order's two-tier table and the Provenance Map both
    // put them in tier 1. A seed is what a developer reads as the schema, so a
    // seed that tiers a source differently from the screen is a seed that
    // teaches the wrong rule. `catalogue()` is derived from
    // caprebate-source-register.ts and tiered from those two documents, so this
    // now agrees with the panel by construction rather than by remembering.
    for (const entry of catalogue()) {
      insertResearchSourcesNotPermittedYet(db,
        [newId(), businessId, entry.source_id, entry.tier, 'NOT_PERMITTED_YET',
          entry.tier === 'FREE'
            ? 'free lookups wait until our privacy notice is published'
            : 'paid lookups wait until the engagement letter is signed',
          entry.publisher, entry.licence_id],
      );
    }
  }

  /**
   * CRM 7 of 10: CAPREBATE'S OWN FINANCE IS SEEDED ON THE CLAIMS, BELOW, once the
   * claims exist — an invoice belongs to a claim. The reasoning that follows is
   * unchanged and applies to those rows.
   *
   * Caprebate's own finance. Not VAT registered — confirmed, not assumed.
   *
   * THE FEE IS 3% OF THE CLAIM VALUE AND IS WRITTEN OUT RATHER THAN INHERITED.
   * £300,000 of allowances identified, £9,000 of fee. 16 September
   * 2026: a flat 3%, no bands and no minimum (it was 5% and £15,000 from Q55,
   *). The rate is on the ALLOWANCES, not on the tax saved — a fourfold difference
   * for the same job, and a seed that got it wrong would teach the wrong basis
   * to the first developer who read it.
   *
   * `entity_type` IS `company` ON ALL SIX AND IT AGREES WITH THE ANSWERS.
   * Every seeded assessment answers Q1 "How is the business set up?" as
   * `company`, so anything else here would be a seed contradicting itself —
   * which is the class of defect once found in this same file when two
   * source tiers disagreed with the two documents that decided them.
   *
   * `tax_rate` IS DELIBERATELY LEFT NULL, and it is the more interesting half.
   * There is no one marginal rate for a company — 19% under £50,000, 25% over
   * £250,000, an effective 26.5% between — and nothing in this system asks for
   * the profits that would decide it. So the finance view runs the comparison
   * at both ends of CB_RATES' own band and reports both, which is what it will
   * do on real data too. Seeding a rate would hide that behaviour behind a
   * number nobody chose.
   *
   * THE POOL SPLIT IS LEFT NULL FOR THE SAME REASON on four of the six, and
   * set on two, so the seeded data shows both shapes: a bounded range where
   * the split is unknown, and a single determined figure where it is not.
   */

  /**
   * TWO SURVEY JOBS, BOTH ASSIGNED, AND NEITHER COMMITTED.
   *
   * Until the surveyor workspace there was one, unassigned — and an unassigned job belongs
   * to NOBODY, because `assignedSurveyor` says so. So the surveying user
   * signed in, opened the section and correctly saw an empty list, which reads
   * exactly like a broken screen. A seed whose only demonstration of a feature
   * is a refusal is a seed that teaches the wrong thing.
   *
   * BOTH ARE SEALED. That is the state the whole block is about: the estimate
   * exists, it is quarantined, and committing figures is what releases it.
   * Seeding one already committed would hand a developer the released case
   * without ever showing them the withheld one, which is the case that matters.
   *
   * TWO RATHER THAN ONE, so the rate library has somewhere to be proposed back
   * INTO. A surveyor's first job in a sector shows empty rate fields and their
   * second shows their own figures returned to them, labelled as theirs — and
   * that is only demonstrable with two jobs. They are in different sectors, so
   * the two room schedules are both reachable.
   */
  const surveying = users.find((u) => u.role === 'SURVEYING');
  for (const k of ['b4', 'b6']) {
    // Phase 161l1: the assessment's id from the assessment, the job written by the survey (each through its front door).
    const assessment = getAssessmentsIdByBusinessId<{ id: string }>(db, [get(k)]);
    if (assessment !== undefined) insertSurveyorJobs(db, [newId(), get(k), assessment.id, surveying?.id ?? null, 'SEALED', null, t, null]);
  }
}

/**
 * Register data, through the real ingestion boundary. If any of this violated
 * N2 the seed would THROW rather than write — which is the point of running it
 * through `ingestRegisterRecord` instead of inserting rows directly.
 *
 * Every field below is on its source's `keptFields` list. There is not one
 * personal-name field anywhere, so no documented exception is relied on and no
 * Article 14 record is owed.
 */
function seedRegisterRecords(db: Db, now: () => string, idOf: Map<string, string>): void {
  const b2 = idOf.get('b2');
  const b4 = idOf.get('b4');
  if (b2 === undefined || b4 === undefined) throw new Error('seed: businesses missing');
  // A property register's record says which property it is about — Dunmarrow's main site, the one it describes.
  const site = getPropertiesIdByBusinessId3<{ id: string }>(db, [b4])?.id ?? null;

  ingestRegisterRecord(db, newId, now, b4, {
    sourceId: 'CQC', entityId: 'INVENTED-LOC-0001',
    fields: {
      registration_status: 'Registered', beds_registered: 0,
      regulated_activities: 'Treatment of disease, disorder or injury',
      service_types: 'Doctors consultation service', registration_date: '2019-04-01',
      cqc_location_id: 'INVENTED-LOC-0001', cqc_provider_id: 'INVENTED-PRV-0001',
    },
  }, { property_id: site });

  ingestRegisterRecord(db, newId, now, b4, {
    sourceId: 'EPC', entityId: 'INVENTED-RRN-0001',
    fields: {
      epc_total_floor_area_m2: 640, epc_property_type: 'Health care',
      epc_construction_age_band: '1996-2002', epc_tenure: 'Owner-occupied',
      epc_lodgement_date: '2023-06-12', epc_rrn: 'INVENTED-RRN-0001',
    },
  }, { property_id: site });

  ingestRegisterRecord(db, newId, now, b2, {
    sourceId: 'CH_COMPANY', entityId: 'INVENTED-CO-0002',
    fields: {
      company_number: 'INVENTED-CO-0002', company_status: 'active',
      sic_codes: '86230', accounts_year_end: '03-31', incorporation_date: '2012-09-14',
      company_name: 'Brackenfell Dental Partnership LLP',
    },
  });
}

/**
 * THE CRM BACKBONE — CRM 1 of 10. Invented, like everything
 * above, and it carries NO PERSONAL NAMES: a contact is named for its role, the
 * way the users are, and every address is a ZZ postcode.
 *
 * ONE CLAIM PER BUSINESS FIRST, derived exactly as migration 009 backfills an
 * existing database — `backfillClaimFor` is that INSERT, column for column — so
 * a seeded business and a migrated one look the same.
 *
 * THEN THE SHAPE THIS PHASE EXISTS FOR, which a seed of one property per
 * business could not show at all:
 *   · Elverton (b5) has TWO PROPERTIES, and its main site has TWO CLAIMS —
 *     plant and machinery from the funnel, and structures and buildings opened
 *     by staff with no assessment, which no surveyor can reach.
 *   · Dunmarrow (b4) is filled in: legal name, company number, claimant type,
 *     addresses, an owner, two contacts, and a property with its acquisition —
 *     and its prior-claim position recorded as UNKNOWN, while Elverton's main
 *     site was never asked. The two must read the same, and a test says so.
 *   · Brackenfell (b2) has a Companies House register record, so its legal
 *     name and number are DERIVED and the page does not ask for them.
 *   · Fenmoor (b6) is DO_NOT_CONTACT, so the control can be seen refusing.
 *
 * THE ACQUISITION PRICE IS CHOSEN SO THAT NO DIGIT RUN OF IT IS ONE OF THE
 * SEALED ESTIMATE'S SEVEN VALUES. tools/payload-proof.ts searches a surveyor's
 * response for those values as raw text, and a seed that happened to contain
 * one would make the proof fail for a reason that is not a leak.
 */
function seedCrm(
  db: Db, now: () => string, idOf: Map<string, string>,
  users: readonly { id: string; email: string; role: AppRole }[],
): void {
  const t = now();
  const get = (k: string): string => {
    const v = idOf.get(k);
    if (v === undefined) throw new Error(`seed: business ${k} missing`);
    return v;
  };
  const sales = users.find((u) => u.role === 'SALES')?.id ?? null;

  for (const b of BUSINESSES) backfillClaimFor(db, now, newId, get(b.key));

  /**
   * CAPREBATE'S OWN FINANCE, ON THE CLAIMS — CRM 7 of 10.
   *
   * THREE INVOICES, ONE PER STATE THE MONEY CAN BE IN, each on the organisation's
   * assessed claim: raised and unsent with nothing received; sent with part
   * received, and the bank-details confirmation NEVER ASKED; sent and received in
   * full, confirmed on another channel. £300,000 of allowances, £9,000 of fee —
   * 3% on the allowances, as the reasoning above says. No VAT: the recorded
   * position is not registered. DUE 14 DAYS AFTER THE INVOICE DATE: clause 4's payment terms, completed.
   *
   * WRITTEN AS ROWS, as every seeded row is — the claims are not at the invoice
   * stage, so the store would rightly refuse to raise them. The numbers come from
   * the series itself, so the seeded invoices are CB-000001 to CB-000003 and the
   * first one anybody raises is the next. The pool split is set on two, so the
   * finance view shows both a bounded and a determined comparison.
   */
  const raisedBy = users.find((u) => u.role === 'ACCOUNTING')?.id;
  if (raisedBy === undefined) throw new Error('seed: no accounting user to raise the invoices');
  const seededInvoices: readonly {
    key: string; sent_on: string | null; split: readonly [number, number] | null;
    received: readonly { on: string; pence: number; confirmed: string | null }[];
  }[] = [
    { key: 'b4', sent_on: null, split: null, received: [] },
    { key: 'b5', sent_on: '2026-09-03', split: [18_000_000, 12_000_000], received: [{ on: '2026-09-05', pence: 500_000, confirmed: null }] },
    { key: 'b6', sent_on: '2026-09-03', split: [18_000_000, 12_000_000], received: [{ on: '2026-09-04', pence: 900_000, confirmed: 'OTHER_CHANNEL' }] },
  ];
  for (const inv of seededInvoices) {
    const claim = getClaimsIdByBusinessIdAssessmentId<{ id: string }>(db, [get(inv.key)]);
    if (claim === undefined) throw new Error(`seed: no assessed claim for ${inv.key} to invoice`);
    const invoiceId = newId();
    insertInvoices2(db, [invoiceId, get(inv.key), claim.id, 'FEE', 30_000_000, 900_000, 0.03, inv.sent_on === null ? 'RAISED' : 'SENT', 'UNPAID',
        'Cap Rebate is not VAT registered; no VAT is charged on this fee', 'finance-setting-vat-position-2026-08-28', 0,
        // Clause 4 now states the payment terms — within 14 days of the date of the invoice.
        '2026-09-02', '2026-09-16', 'due within 14 days of the invoice, as clause 4 states',
        inv.sent_on, '3% of the allowances identified, £300,000.00 — £9,000.00 (the seed); every fee control off', null, raisedBy, t,
        'company', null, inv.split === null ? null : inv.split[0], inv.split === null ? null : inv.split[1], null]);
    allocateNumber(db, 'INVOICE', invoiceId, null, raisedBy, t);
    for (const p of inv.received) {
      insertInvoicePayments(db, [newId(), invoiceId, p.on, p.pence, 'BANK_TRANSFER', p.confirmed, raisedBy, t]);
    }
  }

  // Derived as migration 009 derives them: signed is ACTIVE, the funnel is WEBSITE.
  updateBusinessesSourceUpdatedAt(db, [t]);
  // Phase 161l1: the signed letters from the claims, each organisation marked by the CRM (each through its front door).
  for (const e of listEngagementsBusinessIdByLetterStateSigned<{ business_id: string }>(db)) updateBusinessesClientStatusActiveById(db, [e.business_id]);
  updateBusinessesClientStatusById(db, [get('b6')]);
  updateBusinessesClaimantTypeById(db, [get('b2')]);

  const b4 = get('b4');
  updateBusinessesLegalNameCompanyNumberById2(db, ['Dunmarrow Medical Practice Limited', 'INVENTED-CO-0004', 'COMPANY',
      'Unit 4, Invented Business Park, Nowhere Town, ZZ4 4DD',
      'Unit 4, Invented Business Park, Nowhere Town, ZZ4 4DD',
      'https://dunmarrow.example.invalid', sales, b4]);
  for (const c of [
    { name: 'Decision Maker Contact', type: 'DECISION_MAKER', dm: 1, mailbox: 'decisions' },
    { name: 'Finance Contact', type: 'FINANCE', dm: 0, mailbox: 'finance' },
  ]) {
    insertContacts2(db, [newId(), b4, c.name, t, c.type, c.dm, `${c.mailbox}@b4.example.invalid`, '01632 960000', t]);
  }
  updatePropertiesAddressLine1TownByBusinessId(db, ['Unit 4, Invented Business Park', 'Nowhere Town', 'GP_SURGERY', 'Primary care', 'FREEHOLD',
      'Dunmarrow Medical Practice Limited', '2019-03-15', 64_250_000, '2019-04-01', 'DEVELOPER', 'UNKNOWN', t, b4]);
  // CRM 3 of 10: the next action this seeded as free text is a task now — `seedTasks` below.
  updateClaimsOwnerIdPriorityByBusinessId(db, [sales, 'NORMAL', b4]);

  const b5 = get('b5');
  const main = getPropertiesIdByBusinessId<{ id: string }>(db, [b5]);
  if (main === undefined) throw new Error('seed: b5 has no property');
  updatePropertiesTenureTownById(db, ['LEASEHOLD', 'Nowhere Town', main.id]);
  const annexe = newId();
  insertProperties3(db, [annexe, b5, 'Elverton Private Hospital Limited — outpatient annexe', 'ZZ5 5EF', t, 'FREEHOLD', t, 'Nowhere Town']);
  // CRM 2 of 10: a claim a person opens starts at the enquiry, with its checks not yet recorded.
  const second = insertClaim(db, now, newId, {
    business_id: b5, property_id: main.id, assessment_id: null, workstream: 'STRUCTURES_AND_BUILDINGS',
    stage: 'ENQUIRY', owner_id: sales, surveyor_id: null,
  });
  recordOpened({ db, now, newId }, null, second.id, 'ENQUIRY',
    'opened by staff on a property; its enquiry checks are recorded on the claim');
  /* ONE COMPANY, TWO PROPERTIES, THREE CLAIMS. The annexe gets a claim of its own, so Elverton shows the shape
     the owner asked about: one client page, three claim tiles, one timeline, and one portal listing three claims. */
  const third = insertClaim(db, now, newId, {
    business_id: b5, property_id: annexe, assessment_id: null, workstream: 'PLANT_AND_MACHINERY',
    stage: 'ENQUIRY', owner_id: sales, surveyor_id: null,
  });
  recordOpened({ db, now, newId }, null, third.id, 'ENQUIRY',
    'opened by staff on a property; its enquiry checks are recorded on the claim');

  seedLeads(db, now, idOf, sales);
}

/**
 * STAFF TASKS AND NEXT ACTIONS — CRM 3 of 10. Invented, and
 * naming nobody: every task is about a claim, an organisation, a contact's role
 * or a lead, and is owned by a role's user.
 *
 * THE ONE-NEXT-ACTION RULE, SHOWN BOTH WAYS. Dunmarrow's claim carries the next
 * action CRM 1 of 10 seeded as free text, now a task owned by Sales. Aldergate's
 * is OVERDUE, so the flag can be seen. Corvale's has an owner and NO DUE DATE,
 * and Brackenfell's has NONE AT ALL — both break the rule, and the list of claims
 * breaking it shows them. Elverton's two claims and Fenmoor's keep the rule.
 *
 * AND WORK FOR EVERY STAFF ROLE, so "my tasks" is empty for nobody who opens the
 * back office: the surveyor's task on the job assigned to them, a finance task
 * waiting with Accounting, a follow-up with Dunmarrow's finance contact, and a
 * follow-up on the referral that has not converted.
 */
function seedTasks(
  db: Db, now: () => string, idOf: Map<string, string>,
  users: readonly { id: string; email: string; role: AppRole }[],
): void {
  const sales = users.find((u) => u.role === 'SALES')?.id ?? null;
  const admin = users.find((u) => u.role === 'ADMIN')?.id ?? null;
  const surveying = users.find((u) => u.role === 'SURVEYING')?.id ?? null;
  if (sales === null || admin === null || surveying === null) throw new Error('seed: staff users missing');
  const get = (k: string): string => {
    const v = idOf.get(k);
    if (v === undefined) throw new Error(`seed: business ${k} missing`);
    return v;
  };
  const claim = (k: string, withAssessment: boolean): string => {
    const c = (withAssessment ? getClaimsIdByBusinessIdAssessmentIdNotNull : getClaimsIdByBusinessIdAssessmentIdNull)<{ id: string }>(db, [get(k)]);
    if (c === undefined) throw new Error(`seed: no claim for ${k}`);
    return c.id;
  };
  const base: TaskInsert = {
    title: '', description: null, owner_id: sales, owner_role: null, due_on: null, priority: null, activity_type: 'TASK',
    business_id: null, property_id: null, claim_id: null, lead_id: null, contact_id: null, fact_id: null, recurrence: null,
    recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: admin,
  };
  const task = (t: Partial<TaskInsert> & { title: string }): string => insertTask(db, now, newId, { ...base, ...t });
  const nextAction = (k: string, withAssessment: boolean, t: Partial<TaskInsert> & { title: string }): string =>
    task({ business_id: get(k), claim_id: claim(k, withAssessment), is_next_action: true, ...t });

  nextAction('b4', true, { title: 'Confirm the surveyor has the floor plans', due_on: '2026-09-30' });
  nextAction('b1', true, { title: 'Call to talk through the range they were shown', activity_type: 'CALL', due_on: '2026-09-01' });
  nextAction('b3', true, { title: 'Chase the documents the signed letter asks for', activity_type: 'DOCUMENT_REQUEST' });
  nextAction('b5', true, { title: 'Ask the surveyor when they can review the annexe drawings', due_on: '2026-09-25' });
  nextAction('b5', false, { title: 'Record the enquiry checks for the structures claim', due_on: '2026-09-19' });
  const annexeClaim = getClaimsIdByBusinessIdLabel<{ id: string }>(db, [get('b5')]);
  if (annexeClaim === undefined) throw new Error('seed: no annexe claim for b5');
  task({ title: 'Ask for the annexe’s fit-out invoices', business_id: get('b5'), claim_id: annexeClaim.id, is_next_action: true, due_on: '2026-09-29' });
  nextAction('b6', true, { title: 'Record why this client asked not to be contacted', owner_id: admin, due_on: '2026-09-22' });

  task({
    title: 'Check the floor plans against the room schedule', activity_type: 'SURVEY', owner_id: surveying,
    business_id: get('b4'), claim_id: claim('b4', true), due_on: '2026-09-18',
  });
  task({
    title: 'Record the part payment against the invoice when it arrives', owner_id: null, owner_role: 'ACCOUNTING',
    business_id: get('b5'), claim_id: claim('b5', true),
  });
  const finance = getContactsIdByBusinessIdContactType<{ id: string }>(db, [get('b4')]);
  if (finance !== undefined) {
    task({
      title: 'Follow up about the fixed asset register', activity_type: 'CALL', business_id: get('b4'), contact_id: finance.id,
      due_on: '2026-09-15',
    });
  }
  const referral = getLeadsIdByOriginStatus<{ id: string }>(db);
  if (referral !== undefined) {
    task({ title: 'First follow-up on the referral', activity_type: 'CALL', lead_id: referral.id, due_on: '2026-09-24' });
  }
}

/**
 * LEADS — CRM 2 of 10. Invented, and carrying no person.
 *
 * EVERY ORGANISATION'S LEAD FIRST, derived exactly as migration 010 backfills an
 * existing database — `backfillLeadFor` is that INSERT — so all six are
 * CONVERTED onto the claim their assessment holds.
 *
 * THEN ONE REFERRAL that has not converted, because a lead list of nothing but
 * conversions shows nothing a lead list is for. Its organisation does not exist
 * yet — a referral arrives before the assessment creates it — and its enquiry
 * checks show the N4 case both ways: two recorded YES, ownership recorded as
 * NOT KNOWN, and the claim-conflict check never asked. The two read the same and
 * neither passes, so the lead cannot be qualified, and a test says so.
 */
function seedLeads(db: Db, now: () => string, idOf: Map<string, string>, sales: string | null): void {
  if (sales === null) throw new Error('seed: no sales user');
  for (const b of BUSINESSES) {
    const id = idOf.get(b.key);
    if (id === undefined) throw new Error(`seed: business ${b.key} missing`);
    backfillLeadFor(db, newId, id);
  }
  const t = now();
  const referral = newId();
  insertLeads3(db, [referral, 'REFERRAL', 'REFERRAL', 'Gorsebrook Invented Care Homes Limited', 'care_homes', t, sales, 'NORMAL', 'CONTACTED', t, t]);
  // CRM 9 of 10: the lead's next action is a task on the lead (migration 018), no longer a column.
  insertStaffTasks2(db, [newId(), 'Confirm who owns the building, and that we would be acting for them', sales, '2026-09-24', 'OPEN', 'CALL', referral, 'STAFF', sales, t, t]);
  for (const [check, answer] of [
    ['UK_HEALTHCARE_PROPERTY', 'YES'], ['TRADING_CLIENT', 'YES'], ['OWNER_OR_AUTHORISED', 'UNKNOWN'],
  ] as const) {
    insertEnquiryChecks2(db, [newId(), referral, check, answer, sales, now()]);
  }
}
