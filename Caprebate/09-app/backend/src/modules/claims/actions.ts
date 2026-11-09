/**
 * CLAIMS'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type Actor, type DocumentFacts, type ObjType, type Rule } from '../../core/index.ts';

const { accountingDocument, always, clientDeliverable, clientDocument, isOwnBusiness, ownBusiness, salesDocument, surveyorDocument, throughAssignedJob } = PREDICATES;

export const CLAIMS_ACTIONS = registerActions('claims', {
  'engagement.read': {
    ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>,
  },
  /* Prepare the engagement letter and send it to the client's logins (src/modules/claims/engagement-send.ts). */
  'engagement.send': { ADMIN: always, SALES: always },
  'research.run': { ADMIN: always, SALES: always },
  'research.read': { ADMIN: always, SALES: always },
  'register_record.read': { ADMIN: always, SALES: always, SURVEYING: always },
  /*
   * CHECKED AND APPROVED, AND TELLING THE CLIENT. Ticking a fact as checked, and pressing "Tell the client" on
   * a step, are ADMIN's and SALES's — the people who work the client. TAKING A STEP BACK, after the client has been told,
   * is ADMIN's alone. The client reads what it was told, on its own company, and nothing else: the view model
   * (src/modules/claims/approvals.ts, `clientSteps`) carries a step's words and a date, never a fact, a value or a reason.
   */
  'fact.approve': { ADMIN: always, SALES: always },
  'property.enter': { ADMIN: always, SALES: always, SURVEYING: always },
  'property.read': {
    ADMIN: always, SALES: always,
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'property.write': { ADMIN: always, SALES: always },
  'claim.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
  'claim.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // client, reference and money — see the block above
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'claim.read_value': { ADMIN: always, SALES: always },
  'claim.create': { ADMIN: always, SALES: always },
  'claim.write': { ADMIN: always, SALES: always },
  /*
   * A CLIENT SEES THEIR OWN COMPANY'S CLAIMS: each one's property and how far it has got, in the portal's six
   * client words (src/modules/portal/portal.ts). `ownBusiness` on the claim itself, asked of every claim on every request. Nothing
   * else about a claim reaches a client through it: not the ten staff stages, a hold reason, an exit note, a value, a
   * next action or a person. ADMIN and SALES may look at a client's portal, as they may today.
   */
  'claim.progress_read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },

  /* --- documents on the claim. CRM 4 of 10 ---------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * claims/documents.test.ts asserts the refusal for each one, per action, and
   * `document.read` per role PER READER CLASS.
   *
   * `document.read` IS ASKED OF THE DOCUMENT ITSELF, never of its organisation:
   * `business.read` admits ACCOUNTING to every client's name, and a document
   * authorised that way would have admitted it to every client's lease.
   *
   * `document.read_original` IS THE FILE, AND IT IS NARROWER. The Dashboard Data
   * Specification's access table gives the surveyor and the accountant NO access
   * to the raw document store, and names no Sales row. Under the fail-closed
   * settings there is no original to serve in any case; the route still asks.
   *
   * TYPES ARE ADMIN'S TO CHANGE, AND A REQUEST IS ADMIN'S OR SALES'S TO RAISE.
   * The client reads their own requests in the portal and answers one only by
   * uploading — there is no action for answering, because there is no click that
   * receives a document.
   * ------------------------------------------------------------------------ */
  'document.read': {
    ADMIN: always,
    SALES: salesDocument as Rule<ObjType>,
    ACCOUNTING: accountingDocument as Rule<ObjType>,
    SURVEYING: surveyorDocument as Rule<ObjType>,
    CLIENT: clientDocument as Rule<ObjType>,
  },
  /* Sales, Admin and the data protection officer may open a kept original. Sales
     on the same documents it may read, never the fee invoice. Kept originals exist only while KEEP_ORIGINALS is on. */
  /* Sales opens a kept original only
     on a client it owns — the organisation's owner, or the owner of one of its claims. Another salesperson's client is
     refused, and an owner not recorded admits nobody (N4). Reading the document itself (`document.read`) is unchanged. */
  'document.read_original': { ADMIN: always, SALES: ((a: Actor, o: DocumentFacts) => salesDocument(a, o) && Array.isArray(o.owner_ids) && o.owner_ids.includes(a.id)) as Rule<ObjType>, CLIENT: clientDocument as Rule<ObjType> },
  'document.upload': { ADMIN: always, SALES: always, CLIENT: isOwnBusiness as Rule<ObjType> },
  'document.link': { ADMIN: always, SALES: always },
  /** Whether the client can see a file — the two roles that upload one. Never the client, never a surveyor. */
  'document.show_to_client': { ADMIN: always, SALES: always },
  /**
   * Saying whether a name on a document belongs to an organisation rather than to somebody. Two
   * CLIENT_DOC fields are kept on that footing alone and it cannot be inferred from the document, so it is a
   * person's answer. THE TWO ROLES THAT WORK THE CLIENT AND NOBODY ELSE — not a surveyor, not Accounting, and
   * never the client, who would be vouching for their own document.
   */
  'document.vouch': { ADMIN: always, SALES: always },
  'document_type.read': { ADMIN: always, SALES: always },
  'document_type.write': { ADMIN: always },
  'document_request.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  'document_request.create': { ADMIN: always, SALES: always },
  'document_request.withdraw': { ADMIN: always, SALES: always },

  /* --- the claim's facts, figures, sign-off, deliverables and aftercare. CRM 6 of 10 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * claims/claim-record.test.ts asserts the refusal for each one, per action.
   *
   * THE FACTS ARE ADMIN'S AND SALES'S. ACCOUNTING IS ON NONE OF THESE ROWS: a
   * fact about the tax position, an election or a grant is not money.
   * `claim_facts.read_released` IS THE SURVEYOR'S, on an assigned job only, and
   * it reaches the RELEASED inputs alone — src/payload.ts assembles them forwards
   * from a list that holds no figure, amount, window or profit position.
   *
   * THE FIGURES ARE ADMIN'S AND SALES'S, as `claim.read_value` is (N1): the
   * indicative estimate, the researched estimate's state, the surveyor's
   * committed figure, the tax adviser's figure and the reconciliation. Recording
   * the sign-off record, the reconciliation, a deliverable and an enquiry is
   * ADMIN's and SALES's — the people who hold the claim's papers.
   *
   * A DELIVERABLE IS READ BY THE CLIENT ONLY THROUGH `clientDeliverable` above.
   * ------------------------------------------------------------------------ */
  'claim_facts.read': { ADMIN: always, SALES: always },
  'claim_facts.read_released': { SURVEYING: throughAssignedJob as Rule<ObjType> },
  'claim_facts.record': { ADMIN: always, SALES: always },
  'claim_figures.read': { ADMIN: always, SALES: always },
  'tax_signoff.record': { ADMIN: always, SALES: always },
  'reconciliation.record': { ADMIN: always, SALES: always },
  'deliverable.read': { ADMIN: always, SALES: always, CLIENT: clientDeliverable as Rule<ObjType> },
  'deliverable.record': { ADMIN: always, SALES: always },
  'hmrc_enquiry.record': { ADMIN: always, SALES: always },
  /* A multi-site discount is proposed by the people who agree terms with a client, and read by them and by
     finance. It is a record and is never applied: see src/modules/claims/fee-discounts.ts. */
  'fee_discount.record': { ADMIN: always, SALES: always },
  'fee_discount.read': { ADMIN: always, SALES: always, ACCOUNTING: always },

  /* --- the defence pack generator. ---------------
   *
   * NEW, AND EVERY ROLE NOT NAMED IS REFUSED — test/claims/defence-pack-and-case-stamp.test.ts asserts
   * the refusal for each one. The generator is switched off (`DEFENCE_PACK_GENERATOR`
   * in src/modules/claims/defence-pack.ts), so today this row admits a person to a refusal that
   * says so. Switched on it builds a manifest from the claim's sealed records and
   * issues nothing: ADMIN and SALES, who hold the claim's figures and its papers, as
   * `claim_figures.read` and `deliverable.record` are. No route asks it yet.
   * ------------------------------------------------------------------------ */
  'defence_pack.generate': { ADMIN: always, SALES: always },

  /* --- the CRM follow-on ------------------------------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/crm/introducer-source-claim-team.test.ts
   * asserts the refusal for each one, per action.
   *
   * THE CLAIM TEAM. Reading the team is the actions its parts already need — `contact.read` for the organisation's
   * accountant and adviser, `claim_figures.read` for the tax adviser's sign-off record — so a surveyor is drawn the
   * owner and the surveyor it already reads and nothing else. LINKING A CONTACT TO A CLAIM, and ending the link, is
   * ADMIN's and SALES's, the people who keep the organisation's contacts. A contact is never a user.
   *
   * THE DOCUMENT CENTRE is a list over every document, and every row on it is still asked of `document.read` on the
   * document itself — so a role that enters sees only the documents that rule admits, and a surveyor the claim evidence
   * of its own jobs. CLIENT is not on it: the portal is the client's list.
   */
  'claim_team.write': { ADMIN: always, SALES: always },
  'document_centre.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
});
