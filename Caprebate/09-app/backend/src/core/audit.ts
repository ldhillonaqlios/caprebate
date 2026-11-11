/**
 * The audit log — append-only and tamper-evident.
 *
 * Already a data protection officer determination, not a design choice.
 *
 * APPEND-ONLY IS ENFORCED IN TWO PLACES, because one of them is not enough.
 * The database has BEFORE UPDATE and BEFORE DELETE triggers that abort, so an
 * application bug cannot rewrite history. And the rows are HASH-CHAINED, so
 * somebody who bypasses the application entirely — sqlite3 on the file — still
 * cannot remove or reorder an entry without `verify()` noticing.
 *
 * The chain is the SAME scheme caprebate-anchor-quarantine.ts uses for its own
 * log: sha256 over the canonical entry plus the previous hash, from a genesis
 * of sixty-four zeroes. Deliberately the same, so an auditor learns one scheme
 * and the two logs can be checked with one description. There is a test that
 * the two agree on a hash rather than merely looking alike.
 *
 * NO PERSONAL DATA IN LOG LINES. `detail` is screened on the way in against a
 * key deny-list and a value shape check. Ids, role names and outcomes go in;
 * names, email addresses and anything that looks like a secret do not. The
 * screen REFUSES rather than redacting, because a redacting logger teaches
 * callers that it is safe to pass anything.
 */

import { createHash } from 'node:crypto';
import type { Db } from './db.ts';
import { carriesSecret } from './secrets.ts';
import { getAuditLogSeqHash, insertAuditLog, listAuditLog } from './data.ts';

/**
 * THE HASH BEFORE THE FIRST ENTRY of a chain: this audit log's, and the survey's quarantine log's, which re-exports it
 * (src/modules/survey/anchor-quarantine.ts), so the two chains start from the one value. Defined here, in
 * the core, so the audit log loads no business module.
 */
export const GENESIS = '0'.repeat(64);

export type AuditKind =
  | 'LOGIN_SUCCEEDED' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'SESSION_ROTATED' | 'SESSION_REVOKED'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED'
  /** The steps between a right password and a session (src/core/sign-in.ts), and the super user's part. */
  | 'SIGN_IN_STEP_STARTED' | 'SIGN_IN_STEP_REFUSED' | 'SIGN_IN_CODE_SENT'
  | 'TWO_FACTOR_SET_UP' | 'TWO_FACTOR_REMOVED' | 'TEMPORARY_PASSWORD_ISSUED'
  /* `node src/app/cli.ts seal-app-secrets` sealed the app secrets still kept as text - a count, never a secret. */
  | 'APP_SECRETS_SEALED'
  /* Recovery codes made (a count and why, never a code), and one used (how many are left, never the code). */
  | 'RECOVERY_CODES_MADE' | 'RECOVERY_CODE_USED'
  | 'RATE_LIMITED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DISABLED' | 'ROLE_ASSIGNED'
  /** A role the super admin made, changed, or tried to make and was refused (src/modules/admin/role-editor.ts). */
  | 'ROLE_CREATED' | 'ROLE_CHANGED' | 'ROLE_REFUSED'
  | 'DOCUMENT_ACCESSED'
  | 'RESEARCH_FIRED'
  /**
   * One call to an outside service, made through src/integrations/connectors/http.ts — the only
   * way out. The service, the endpoint as a template, the NAMES of the query parameters (never their values), the
   * result, the time taken, the tries, and both gates and the source's switch as they stood. Never a key, never a
   * value typed into a search.
   */
  | 'CONNECTOR_CALLED'
  /**
   * One reading of a client document by the Claude API (src/integrations/connectors/claude.ts),
   * beside the CONNECTOR_CALLED row of the call itself. The document type, which segments were sent (kind and page,
   * never their words), the model that answered, how much it read and wrote, and how many fields came back.
   * NEVER THE TEXT — not what was sent and not what came back. DOCUMENT_PAGES_READ_BY_MODEL is the same for a scanned
   * PDF's page images turned into text: the page numbers and the counts, never the words or the pictures.
   */
  | 'DOCUMENT_READ_BY_MODEL' | 'DOCUMENT_PAGES_READ_BY_MODEL'
  /**
   * WHAT LEFT THE BUILDING, once per document, written by the upload flow
   * (src/modules/claims/uploads.ts) from the pipeline's own egress record when steps 9 and 10 run. The payload's fingerprint,
   * the KIND and PAGE of each segment sent and each segment the strip dropped with its reason, and the fields asked
   * for. NEVER A WORD OF THE DOCUMENT. It is the answer to "what exactly did you send", and it is the pipeline's
   * record rather than the reader's: the reader's own row is DOCUMENT_READ_BY_MODEL, beside it.
   */
  | 'DOCUMENT_SENT_TO_MODEL'
  /**
   * MAIL_SERVER_CONNECTED is one conversation with the IONOS mail server, sending or
   * reading: the service, what for, the outcome, the reply code, how many messages, how long. Never a password, an
   * address or the server's words. EMAIL_BOUNCED is one email the server would not deliver: HARD or SOFT, and the
   * code. ENGAGEMENT_SIGNED is the built-in signature (src/modules/claims/signing.ts): the signature record's own SHA-256, the
   * SHA-256 of the exact letter shown and of the signed PDF, and the session's id. The signer's name, role and
   * address are in the signature record, which this row's hash binds; they are not written here, because no log
   * line carries a name (the rule at the top of this file).
   */
  | 'MAIL_SERVER_CONNECTED' | 'EMAIL_BOUNCED' | 'ENGAGEMENT_SIGNED'
  /** The engagement letter sent (or sent again) to the client's logins; whether it was a re-send, and how many. */
  | 'ENGAGEMENT_LETTER_SENT'
  // Staff recorded who must sign the letter
  | 'ENGAGEMENT_SIGNERS_SET'
  // Staff opened a survey job on a claim (src/modules/survey/survey-open.ts); whether an estimate was sealed with it. No figure.
  | 'SURVEY_JOB_OPENED'
  // A client accepted the survey report released to them (src/modules/portal/report-accept.ts). The version, never a figure.
  | 'CLIENT_REPORT_ACCEPTED'
  | 'ACCOUNTANT_CONFIRM_SENT'
  | 'ACCOUNTANT_CONFIRM_ANSWERED'
  /**
   * A member of staff said an address that bounced for good works again
   * (src/modules/admin/settings.ts). Whether a lift happened, and nothing else: the address itself is the new row in
   * email_suppressions, which carries who lifted it and when. No log line carries an address.
   */
  | 'EMAIL_ADDRESS_LIFTED'
  /**
   * Two events that had no honest kind before it, and were nearly
   * logged as DOCUMENT_ACCESSED for want of one — which would have made the
   * document-access record, the one requirement DB-W1-T6 is about, unreadable.
   *
   * SURVEYOR_COMMITTED is the moment a surveyor's own figures are recorded and
   * our estimate is released to them. It is the identity log's note of it; the
   * evidential record is the anchor log, which is hash-chained per the
   * quarantine module's own scheme and carries the figures themselves.
   *
   * INVOICE_UPDATED covers Caprebate's own finance. NEVER AN AMOUNT — the
   * detail screen would not refuse one, because a fee is not personal data,
   * but an audit line is a record that something happened and the invoice row
   * is the record of what it says.
   */
  | 'SURVEYOR_COMMITTED'
  | 'INVOICE_UPDATED'
  /**
   * A call being given a time, moved to another, or released back
   * to us with no time at all. It was being logged as USER_UPDATED, which was
   * the nearest honest kind available and was not honest enough: nothing about
   * a user changes, and an audit whose kinds do not name what happened is read
   * by nobody twice.
   *
   * ONE KIND FOR BOTH ROUTES. A staff member moving a call and a client moving
   * their own are the same event about the same object; WHO did it is
   * `actor_id` and `actor_role`, which is where that belongs. The detail
   * carries whether it was a first scheduling, a move or a release — never the
   * time itself, because `booking_changes` is the record of what it says.
   */
  | 'BOOKING_MOVED'
  /**
   * A call cancelled outright — by the client in the portal. The
   * booking row survives with `cancelled_at` and `cancelled_by` set; the detail
   * says who (CLIENT or STAFF) and never the time.
   */
  | 'BOOKING_CANCELLED'
  /** The client's own written filing confirmation, where there is no accountant — which answers were a yes, never the text. */
  | 'CLIENT_FILING_CONFIRMED'
  /** A multi-site discount proposed on a claim's fee — recorded, never applied; the share and state, never the reason. */
  | 'FEE_DISCOUNT_RECORDED'
  /**
   * CRM 1 of 10. One kind per record and per verb, so the audit names what
   * happened. THE DETAIL CARRIES WHICH FIELDS CHANGED AND NEVER THEIR VALUES —
   * an address, a name or a note in a log line is personal data in a record
   * that cannot be deleted, and the row is the record of what it says.
   *
   * WHO CREATED A RECORD AND WHO LAST CHANGED IT ARE READ FROM HERE. There is
   * no `created_by` column beside it to disagree with it.
   */
  | 'ORGANISATION_UPDATED'
  | 'CONTACT_CREATED' | 'CONTACT_UPDATED'
  | 'PROPERTY_CREATED' | 'PROPERTY_UPDATED'
  | 'CLAIM_CREATED' | 'CLAIM_UPDATED'
  /**
   * CRM 2 of 10. A lead's life, the enquiry gate's checks, and every move of a
   * claim through the procedure — who, from, to, and the reason's CODE.
   *
   * NEVER THE REASON'S TEXT, and never a note. A hold reason or an exit note is
   * staff prose that can carry a name, and this log cannot be deleted; the text
   * lives in `claim_stage_moves`, and the line here names the row. A REFUSED
   * CLAIM_STAGE_MOVED is a move a gate would not allow: the attempt is evidence.
   */
  | 'LEAD_CREATED' | 'LEAD_UPDATED' | 'LEAD_CONVERTED'
  | 'ENQUIRY_CHECK_RECORDED'
  | 'CLAIM_STAGE_MOVED' | 'CLAIM_MILESTONE_RECORDED'
  /**
   * CRM 3 of 10. A staff task's life, a claim's next action, a rule that ran —
   * or did not, and why — a rule or a template changed, a merged email queued to
   * the outbox, and an internal note written against a claim or a property.
   *
   * NEVER A TITLE, A NOTE, A REASON'S TEXT OR A MERGED BODY. Each carries staff
   * prose or a contact's name, and this log cannot be deleted; the row is the
   * record of what it says, and the line names the row.
   */
  | 'STAFF_TASK_CREATED' | 'STAFF_TASK_UPDATED' | 'STAFF_TASK_STATUS_CHANGED' | 'NEXT_ACTION_SET'
  | 'AUTOMATION_RAN' | 'AUTOMATION_RULE_CREATED' | 'AUTOMATION_RULE_UPDATED'
  | 'EMAIL_TEMPLATE_CREATED' | 'EMAIL_TEMPLATE_UPDATED' | 'EMAIL_QUEUED'
  | 'INTERNAL_NOTE_ADDED'
  /**
   * CRM 4 of 10. A document type added or changed, an upload started as a
   * version of a document, a document linked to a claim or a property and the
   * link ended, and a document request raised, received by an upload, or
   * withdrawn.
   *
   * NEVER A FILE NAME, A REASON'S TEXT OR WHAT A REQUEST SAYS IT IS FOR. The
   * row is the record of what it says, and the line names the row, the type
   * code and the version number.
   */
  | 'DOCUMENT_TYPE_CREATED' | 'DOCUMENT_TYPE_UPDATED'
  | 'DOCUMENT_VERSION_STARTED' | 'DOCUMENT_LINKED' | 'DOCUMENT_UNLINKED'
  | 'DOCUMENT_REQUESTED' | 'DOCUMENT_REQUEST_RECEIVED' | 'DOCUMENT_REQUEST_WITHDRAWN'
  /**
   * CRM 5 of 10. An introducing firm created or changed, the client's answer on
   * sharing progress with it, every stage notice that fell due — queued, or
   * REFUSED with the reason — the reward setting switched, or refused because
   * clause 1 of the letter is blank, and a model-B fee accrued, disclosed and
   * recorded as paid to the firm, or refused for want of the disclosure. Contact
   * with a firm is a staff task and is audited as one.
   *
   * NEVER A NOTE, A NAME, A NOTICE'S BODY OR AN AMOUNT. The rows are the record of
   * what they say; the line names the row, the decision and the reason's code.
   */
  | 'INTRODUCER_CREATED' | 'INTRODUCER_UPDATED'
  | 'SHARE_CONSENT_RECORDED' | 'INTRODUCER_NOTICE'
  /** A firm's signature of our introducer terms recorded (migration 094). */
  | 'INTRODUCER_TERMS_SIGNED'
  | 'INTRODUCER_REWARD_SWITCHED' | 'INTRODUCER_FEE_ACCRUED' | 'INTRODUCER_PERCENTAGE_ACCRUED' | 'INTRODUCER_PERCENTAGE_REVERSED' | 'INTRODUCER_FEE_DISCLOSED' | 'INTRODUCER_FEE_PAID'
  /**
   * CRM 6 of 10. A claim fact recorded — or refused because a better source
   * already derives it — a grant or an owner in the chain recorded or withdrawn,
   * the tax adviser's sign-off record written, the reconciliation opened and its
   * filing, variance tag and outcome recorded, a deliverable drafted or issued,
   * an HMRC enquiry opened or closed, and the fee clawback of clause 13 not
   * applied because its switch is off or the letter's clause is blank.
   *
   * NEVER A VALUE, A NOTE, A SCOPE, A METHOD NOTE, AN ADVISER OR AN AMOUNT. The
   * rows are the record of what they say; the line names the row, the fact's
   * key, the kind and the state.
   */
  | 'CLAIM_FACT_RECORDED' | 'CLAIM_GRANT_RECORDED' | 'CLAIM_GRANT_WITHDRAWN'
  | 'CLAIM_OWNER_RECORDED' | 'CLAIM_OWNER_WITHDRAWN'
  | 'TAX_SIGNOFF_RECORDED' | 'RECONCILIATION_OPENED' | 'RECONCILIATION_UPDATED'
  | 'DELIVERABLE_RECORDED' | 'HMRC_ENQUIRY_OPENED' | 'HMRC_ENQUIRY_CLOSED' | 'FEE_CLAWBACK_NOT_APPLIED'
  /**
   * CRM 7 of 10. A claim's invoice raised — or refused, with the refusal's code —
   * sent or cancelled; a credit note issued; money recorded as received, or that
   * record voided; a finance setting recorded; and the VAT check run.
   *
   * NEVER AN AMOUNT, A REASON'S TEXT OR A SETTING'S VALUE. The rows are the record
   * of what they say; the line names the row, the number, the kind, the basis, the
   * band and the code.
   */
  | 'INVOICE_RAISED' | 'INVOICE_SENT' | 'INVOICE_CANCELLED' | 'CREDIT_NOTE_ISSUED'
  | 'MONEY_RECEIVED_RECORDED' | 'MONEY_RECEIVED_VOIDED' | 'FINANCE_SETTING_RECORDED' | 'VAT_CHECK_RUN'
  /**
   * CRM 8 of 10. The compliance registers: a compliance setting recorded; an
   * officer appointed or ended, and the firm-wide risk assessment dated; a due
   * diligence check opened, changed, finished or withdrawn, an owner, a PSC
   * decision and a monitoring note recorded; a rights request logged, changed, a
   * limb recorded, the search run, a letter queued and the request closed; a hold
   * set or lifted; a cross-reference made; a complaint logged, classified, told of
   * progress, changed and closed; a breach entry opened, changed, its awareness
   * corrected, its decision, a notification phase and who else was told recorded,
   * and closed; a person recorded in, read from, searched for or changed in the
   * identity store; a consent answer recorded; the retention list read.
   *
   * NEVER A NAME, A SEARCH TERM, A REQUEST'S OR A COMPLAINT'S WORDS, A REASON'S
   * TEXT OR A CONTACT ROUTE. Every one of those is personal data in a log that
   * cannot be deleted. The line names the row, the reference, the limb, the kind,
   * the decision's code and the person_ref — and an identity read or search names
   * the person_ref or the search log's row, never who or what was looked for.
   */
  | 'COMPLIANCE_SETTING_RECORDED' | 'AML_OFFICER_RECORDED' | 'AML_RISK_ASSESSMENT_RECORDED'
  | 'CDD_CHECK_CREATED' | 'CDD_CHECK_UPDATED' | 'CDD_CHECK_COMPLETED' | 'CDD_CHECK_WITHDRAWN'
  | 'CDD_OWNER_RECORDED' | 'CDD_PSC_DECISION_RECORDED' | 'CDD_MONITORING_NOTED'
  | 'RIGHTS_REQUEST_LOGGED' | 'RIGHTS_REQUEST_UPDATED' | 'RIGHTS_REQUEST_LIMB_RECORDED' | 'RIGHTS_REQUEST_CLOSED'
  | 'RIGHTS_SEARCH_RUN' | 'COMPLIANCE_LETTER_QUEUED'
  | 'LEGAL_HOLD_SET' | 'LEGAL_HOLD_LIFTED' | 'COMPLIANCE_LINKED'
  | 'COMPLAINT_LOGGED' | 'COMPLAINT_CLASSIFIED' | 'COMPLAINT_PROGRESS_RECORDED' | 'COMPLAINT_UPDATED' | 'COMPLAINT_CLOSED'
  // A complaint sent through the public notices page's form (src/modules/public-site/notices-site.ts).
  | 'COMPLAINT_FORM_RECEIVED'
  // Staff checked what a client sent through their portal (src/modules/claims/client-checks.ts): accepted, or asked
  // again with a reason. The ids only.
  | 'CLIENT_SENT_ACCEPTED'
  | 'CLIENT_SENT_ASKED_AGAIN'
  | 'BREACH_OPENED' | 'BREACH_UPDATED' | 'BREACH_AWARENESS_CORRECTED' | 'BREACH_DECISION_RECORDED'
  | 'BREACH_PHASE_RECORDED' | 'BREACH_NOTIFICATION_RECORDED' | 'BREACH_CLOSED'
  /** The restricted names list — a name added, the list read, a read refused. */
  | 'BREACH_NAME_ADDED' | 'BREACH_NAMES_READ' | 'BREACH_NAMES_REFUSED' | 'PREMISES_IMPORTED' | 'REGISTER_FILE_IMPORTED'
  | 'IDENTITY_RECORDED' | 'IDENTITY_READ' | 'IDENTITY_SEARCHED' | 'IDENTITY_UPDATED'
  | 'CONSENT_RECORDED' | 'RETENTION_LIST_READ'
  /**
   * CRM 9 of 10. A list exported as CSV — the list, the columns, the row count, the filter keys and the sort, never
   * a value — and a saved view made or retired, with its list and whether it is shared, never its name or its words.
   */
  | 'LIST_EXPORTED' | 'SAVED_VIEW_CREATED' | 'SAVED_VIEW_RETIRED'
  /**
   * CRM 9 of 10. A value added to a configurable list or changed — relabelled or retired — and the same for a lost
   * or exit reason, naming the list, the code and the fields changed, never a label; a setting no screen may move,
   * asked for and REFUSED, naming the setting's key; and a firm merged onto another, naming both and the counts moved.
   */
  | 'CONFIGURATION_VALUE_ADDED' | 'CONFIGURATION_VALUE_CHANGED' | 'REASON_ADDED' | 'REASON_CHANGED' | 'CONFIGURATION_REFUSED'
  | 'INTRODUCER_MERGED'
  /**
   * The CRM follow-on. An organisation's accountant or adviser linked to a claim's team, and the link ended — naming
   * the link, the claim and the contact's id, never the person's name; and the audit log itself read, naming the
   * filter keys and the row count, never a value from an entry.
   */
  | 'CLAIM_TEAM_LINKED' | 'CLAIM_TEAM_UNLINKED' | 'AUDIT_LOG_READ'
  /**
   * A disclosure of a client's personal data to a recipient, recorded in the per-disclosure log — which is
   * switched off, so nothing writes this line yet. Codes and a count only: never a recipient's or a client's name.
   */
  | 'DISCLOSURE_RECORDED'
  /**
   * A sealed case stamped as a deliverable is issued — the engine version, the rulebook
   * versions, every switch and the sign-off references, in `claim_version_stamps` — and a defence pack manifest built,
   * which the generator's switch keeps from happening today. Ids, kinds, counts and hashes only.
   */
  | 'CASE_STAMPED' | 'DEFENCE_PACK_GENERATED'
  /** A person hid the welcome card on their home page. The user's id only. */
  | 'WELCOME_DISMISSED'
  /** A person kept a page section open or closed for themselves. The section's key only. */
  | 'SECTION_PREFERENCE_SET'
  /**
   * 21 September 2026: a fact ticked as checked or the tick taken off; a step told to the client, or taken back
   * by Admin. The fact's reference, the step's key and the claim's id only — never a value, and never the reason, which
   * is in the row the event names.
   */
  | 'FACT_APPROVED' | 'FACT_UNAPPROVED' | 'CLIENT_STEP_TOLD' | 'CLIENT_STEP_TAKEN_BACK'
  /**
   * Staff said whether the client can see one of the company's files; a kept original
   * opened by a member of staff; a kept original deleted when its time was up. The document's id and the version's
   * only — never a file name, never what the file says.
   */
  | 'DOCUMENT_SHOWN_TO_CLIENT' | 'DOCUMENT_HIDDEN_FROM_CLIENT' | 'DOCUMENT_ORIGINAL_OPENED' | 'DOCUMENT_ORIGINAL_DELETED'
  /**
   * A member of staff saved a free-typed email to a company's contact, and Admin changed who
   * every email comes from. Ids, a count of files and whether sending was on — never the subject, the body or an address.
   */
  | 'EMAIL_WRITTEN' | 'EMAIL_SENDER_SET'
  /**
   * A message written on a company's "With the client" thread — by staff or by the client —
   * and a reply to contact@caprebate.co.uk read in by the mailbox reader, filed by staff from the queue, or one of its
   * files saved to the company's Files. Ids, the direction, a count of files and the outcome — never the words, never an
   * address. (A "Team only" message is an internal note and keeps its own kind, INTERNAL_NOTE_ADDED.)
   */
  | 'CLIENT_MESSAGE_WRITTEN' | 'INBOUND_EMAIL_RECEIVED' | 'INBOUND_EMAIL_FILED' | 'INBOUND_EMAIL_FILE_SAVED'
  /**
   * A run of the message clean-up job (MESSAGE_RETENTION, off) — every id it removed and
   * the counts, never the words; and a new-message alert queued (EMAIL_SENDING, off) — the message, the outbox rows and
   * who was told, by user id, never an address and never the words.
   */
  | 'MESSAGES_DELETED' | 'CLIENT_MESSAGE_ALERT'
  /**
   * The website's enquiry form received, and Sales opening an enquiry as a lead or
   * closing it; a person asking for their own client login after the assessment, and confirming it from the email.
   * Ids, the sector code and the decision only — never the name, the address or what the person wrote.
   */
  /**
   * One person resolving one close-but-not-certain register match
   * (src/modules/claims/match-review.ts). The lookup, whether anything was chosen, what the matcher scored it, the confidence
   * grade the choice mints, and whether a record was stored. NEVER THE CANDIDATE, NEVER ITS LABEL: what a person
   * read on the way to the decision is the register's own address line, and A.8 point 8 says it is neither stored
   * nor logged. Who made it is the row's own actor.
   */
  | 'REGISTER_MATCH_PICKED'
  /**
   * One person answering, for one document, whether a name belongs to an
   * organisation rather than to somebody (src/modules/claims/document-reading.ts). Two CLIENT_DOC fields are kept on that
   * footing alone and the register cannot check it, because it classifies by field name and never sees a value.
   * The row carries the field, the answer and what it replaced. NEVER THE NAME ITSELF: the answer is about a value
   * this build refuses to log, and the document it came from has already been read and deleted.
   */
  | 'DOCUMENT_FIELD_VOUCHED'
  /**
   *: a document tied to the piece of work on a building it proves, or untied —
   * the event it now names and the one it named before (ids only), so each event counts its own documents.
   */
  | 'DOCUMENT_EVENT_SET'
  /**
   * The two one-way doors given a way back, each with its own
   * kind beside the one that opened it. REGISTER_MATCH_TAKEN_BACK: a person's pick for a close match taken back — the
   * lookup, the reason in their own words, that the one record the pick wrote was removed, and what must be looked at
   * again as kinds and counts. DOCUMENT_FIELD_VOUCH_WITHDRAWN: a 'yes' about a name on a client document taken back —
   * the field, the reason, and how many records the field was taken out of. NEVER THE ENTRY, THE NAME OR THE VALUE,
   * and the reason passes the same screen as every other detail (src/modules/claims/take-back.ts refuses one that would not).
   */
  | 'REGISTER_MATCH_TAKEN_BACK' | 'DOCUMENT_FIELD_VOUCH_WITHDRAWN'
  /**
   * HM Land Registry's title register is looked up by hand (src/modules/claims/title-by-hand.ts).
   * TITLE_RECORDED_BY_HAND: a person recorded what the official copy says — the property, and WHICH facts were given,
   * never their values. TITLE_BY_HAND_TAKEN_BACK: that entry taken back, with the reason and what to look at again.
   */
  | 'TITLE_RECORDED_BY_HAND' | 'TITLE_BY_HAND_TAKEN_BACK'
  /**
   * The online identity check (src/modules/compliance/identity-checks.ts). A check sent, or not sent and
   * why in words; the outside service's signed result received, or refused because its signature did not hold or it
   * named no check we sent. Ids, the outcome and the service's status word only — NEVER a name, a document number, a
   * date of birth or an image. What the service tells us is kept in the check's own row, not here.
   */
  | 'IDENTITY_CHECK_SENT' | 'IDENTITY_CHECK_NOT_SENT' | 'IDENTITY_RESULT_RECEIVED' | 'IDENTITY_RESULT_REFUSED'
  /**
   * Phase 161m1: an Admin sent a check to someone who is not a director or an owner of the client as we hold them, for
   * that one check: the check, the organisation and contact ids, the rule's code and the Admin's reason (screened, as a
   * take-back's is). Written beside the IDENTITY_CHECK_SENT row, which says `rule_bypassed`.
   */
  | 'IDENTITY_CHECK_RULE_BYPASSED'
  /**
   * WhatsApp with each client (src/modules/crm/whatsapp.ts). Sent, or not sent and why; received and filed (or left
   * for a person to file); a webhook body refused because Meta's signature did not hold; filed by hand. Ids, counts and
   * outcomes only — NEVER a number or the words.
   */
  | 'WHATSAPP_SENT' | 'WHATSAPP_NOT_SENT' | 'WHATSAPP_RECEIVED' | 'WHATSAPP_REFUSED' | 'WHATSAPP_FILED'
  // A person blocking off, or freeing, time in their own diary (src/modules/clients/time-blocks.ts).
  | 'TIME_BLOCKED' | 'TIME_FREED'
  // Admin saved a key's new value (sealed), or went back to the key file's (src/core/saved-keys.ts). The name only.
  | 'KEY_SAVED' | 'KEY_UNSAVED'
  // The Communication tab — a Zoom call staff started or booked, a telephone call staff logged, a video call
  // first opened by its host (src/modules/crm/communication.ts). Ids and outcomes only.
  | 'BOOKING_CREATED' | 'CALL_LOGGED' | 'VIDEO_CALL_OPENED'
  // A video call made under the shared Zoom host because its member of staff has no Zoom user.
  | 'VIDEO_CALL_SHARED_HOST'
  // How long a video call lasted, asked of Zoom by a member of staff. The state only, never Zoom's answer.
  | 'VIDEO_CALL_LENGTH_CHECKED'
  // A file someone sent us on WhatsApp, fetched from Meta and kept sealed (or not, and why in words on the page).
  | 'WHATSAPP_MEDIA_FETCHED' | 'WHATSAPP_MEDIA_NOT_FETCHED'
  // A chat exported on the WhatsApp phone, uploaded for checking, then saved to the record (counts only).
  | 'WHATSAPP_EXPORT_UPLOADED' | 'WHATSAPP_EXPORT_SAVED'
  /** A person added an event to a building on its claim (src/modules/claims/property-events.ts): ids and the kind — never a cost. */
  | 'PROPERTY_EVENT_ADDED'
  /** A person recorded an event's VAT on its claim: the event and the field — never an amount. */
  | 'PROPERTY_EVENT_CHANGED'
  /** A surveyor changed the survey pack (src/modules/survey/survey-pack.ts): what, which line, which fields — never a value. */
  | 'SURVEY_PACK_CHANGED'
  /** 2 Oct 2026: the surveyor approved a version of the survey pack (src/modules/survey/pack-approve.ts): the version and its fingerprint. */
  | 'SURVEY_PACK_APPROVED'
  /** The survey report emailed to the client's accountant for sign-off; their answer by the private link
   *  (src/modules/survey/report-signoff.ts). Ids, the version and the outcome — never the link, never a figure. */
  | 'REPORT_SENT_FOR_SIGNOFF' | 'REPORT_SIGNOFF_ANSWERED'
  /** A client's photo for the survey checklist (src/modules/survey/survey-evidence.ts). The photo's id and item only. */
  | 'SURVEY_EVIDENCE_ADDED'
  /** Photos sent in one go put under checklist items by Admin or Sales, or taken back. Counts only. */
  | 'SURVEY_PHOTOS_SORTED'
  /** A site plan fetched for a survey job's report (src/modules/survey/site-plan.ts): how many buildings, and how the
   *  client's was picked. Never the postcode, never a coordinate. */
  | 'SITE_PLAN_FETCHED'
  /** A signed word from the service that the check is still under way, or about something other than a
   *  check's status. Acknowledged and not kept as a result. The status word and why only. */
  | 'IDENTITY_RESULT_NOT_KEPT'
  /** Accounting recording that it chased an unpaid invoice — the invoice, the day and how. Never the words. */
  | 'INVOICE_CHASED'
  /**
   * Whether the person who signed the engagement letter appears on a public register as
   * able to act for the client. The source and YES, NO or NOT_CHECKED only — never a name read from the register.
   */
  | 'SIGNATORY_CHECKED'
  /** A person chose to answer the property questions themselves instead of the lookups. */
  | 'LOOKUPS_DECLINED'
  /**
   * A person entering, on the property page, the point the site area is looked for at (a British National
   * Grid easting and northing), or a neighbouring council whose land boundary file must also be read. The property,
   * the kind, and for a council its ONS code. The point's figures are kept in site_area_inputs, not here.
   */
  | 'SITE_POINT_ENTERED' | 'SITE_COUNCIL_ADDED'
  | 'WEBSITE_ENQUIRY_RECEIVED' | 'WEBSITE_ENQUIRY_HANDLED'
  /** An enquiry refused by the contact form's security check (src/integrations/connectors/turnstile.ts). Nothing kept. */
  | 'WEBSITE_ENQUIRY_REFUSED'
  | 'CLIENT_SIGNUP_REQUESTED' | 'CLIENT_SIGNUP_VERIFIED'
  | 'AUTHORISATION_REFUSED'
  /** A signed-in person's form refused for a missing, wrong or used token (src/core/form-token.ts). */
  | 'FORM_TOKEN_REFUSED'
  /** An admin recorded the DPO's approval of a legal page's version (src/modules/compliance/legal-approvals.ts). Before
   *  Phase 161m1 it could also be a solicitor's; those entries stay as they were. */
  | 'LEGAL_PAGE_APPROVED'
  /** A client ticked that they have read the portal terms, the website terms and the privacy policy; the versions are kept. */
  | 'TERMS_AGREED'
  /* One module told the modules above it that something happened (src/core/events.ts): the announcement, then each
     listener that heard it. Inside the transaction of the change itself, so a listener that fails undoes both. */
  | 'EVENT_ANNOUNCED' | 'EVENT_HEARD';

export type Outcome = 'ALLOWED' | 'REFUSED' | 'ERROR';

export type AuditEntry = {
  seq: number;
  at: string;
  kind: AuditKind;
  actor_id: string | null;
  actor_role: string | null;
  object_type: string | null;
  object_id: string | null;
  outcome: Outcome;
  detail: Record<string, unknown>;
  prev_hash: string;
  hash: string;
};

/** Byte-for-byte the scheme in caprebate-anchor-quarantine.ts. */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/**
 * Keys that must never reach a log line. Matched on the key, case-insensitively
 * and as a substring, so `user_email`, `emailAddress` and `EMAIL` all fail.
 */
const FORBIDDEN_DETAIL_KEYS = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'authorization', 'authorisation',
  'cookie', 'session_token', 'hash_of_password', 'password_hash',
  'email', 'name', 'display_name', 'first_name', 'last_name', 'surname',
  'phone', 'telephone', 'address', 'postcode', 'dob', 'date_of_birth',
];

export class AuditError extends Error {
  readonly code = 'E_AUDIT_DETAIL_REFUSED';
}

/**
 * Refuses rather than redacts. A caller that wanted to log an email address
 * gets an exception with the offending key named, and fixes the call.
 */
export function screenDetail(detail: Record<string, unknown>): void {
  for (const key of Object.keys(detail)) {
    const k = key.toLowerCase();
    for (const bad of FORBIDDEN_DETAIL_KEYS) {
      if (k.includes(bad)) {
        throw new AuditError(
          `audit detail key '${key}' looks like personal data or a secret and is refused. ` +
            'Log an identifier instead: an id, a role, a count, an outcome.',
        );
      }
    }
    const v = detail[key];
    /* A supplier key loaded from the key file (src/core/secrets.ts) never reaches the chain, under any key. */
    if (v !== undefined && carriesSecret(typeof v === 'string' ? v : JSON.stringify(v) ?? '')) {
      throw new AuditError(`audit detail '${key}' carries a supplier key — refused. Log that a key was used, never the key.`);
    }
    if (typeof v === 'string' && v.includes('@')) {
      throw new AuditError(
        `audit detail '${key}' contains '@' and looks like an email address — refused. ` +
          'Log the user id instead.',
      );
    }
  }
}

/** How many times an append reads the chain again after another copy took its number. */
export const APPEND_ATTEMPTS = 20;

/** Another writer took this row's place: SQLite's and libSQL's words for a clash on audit_log's key. */
function isSeqClash(err: unknown): boolean {
  const m = String((err as { message?: unknown } | null)?.message ?? '');
  return /UNIQUE constraint failed: audit_log\.seq\b/.test(m);
}

export class AuditLog {
  #db: Db;
  constructor(db: Db) { this.#db = db; }

  append(e: {
    at: string;
    kind: AuditKind;
    actor_id?: string | null;
    actor_role?: string | null;
    object_type?: string | null;
    object_id?: string | null;
    outcome: Outcome;
    detail?: Record<string, unknown>;
  }): AuditEntry {
    const detail = e.detail ?? {};
    screenDetail(detail);

    /* TWO COPIES ON ONE DATABASE. The test website's copies share one lasting database
      , so two can append at once. Until today this read the last hash and then, in a SECOND statement,
       the next number: a row written between the two gave a new row the right number and the wrong previous hash (a
       broken chain), and a row written between the reads and the write took this row's number, so the insert hit
       seq's key and the request was lost. Now ONE statement reads both from the same row, and a clash on seq —
       another copy got there first — is read again and retried. The key on seq is what keeps the chain from forking:
       two rows can never claim the same place. What a hash covers is unchanged. */
    for (let attempt = 1; ; attempt++) {
      const last = getAuditLogSeqHash<{ seq: number; hash: string }>(this.#db);
      const prev_hash = last ? last.hash : GENESIS;
      const seq = last ? Number(last.seq) + 1 : 1;

      const body = {
        seq,
        kind: e.kind,
        at: e.at,
        actor_id: e.actor_id ?? null,
        actor_role: e.actor_role ?? null,
        object_type: e.object_type ?? null,
        object_id: e.object_id ?? null,
        outcome: e.outcome,
        detail,
        prev_hash,
      };
      const hash = createHash('sha256').update(canonical(body)).digest('hex');

      try {
        insertAuditLog(this.#db, [seq, body.at, body.kind, body.actor_id, body.actor_role, body.object_type, body.object_id,
            body.outcome, JSON.stringify(detail), prev_hash, hash]);
      } catch (err) {
        if (attempt < APPEND_ATTEMPTS && isSeqClash(err)) continue;
        throw err;
      }
      return { ...body, hash };
    }
  }

  entries(): AuditEntry[] {
    return listAuditLog<{
        seq: number; at: string; kind: string; actor_id: string | null; actor_role: string | null;
        object_type: string | null; object_id: string | null; outcome: string; detail: string;
        prev_hash: string; hash: string;
      }>(this.#db)
      .map((r) => ({
        seq: r.seq, at: r.at, kind: r.kind as AuditKind,
        actor_id: r.actor_id, actor_role: r.actor_role,
        object_type: r.object_type, object_id: r.object_id,
        outcome: r.outcome as Outcome,
        detail: JSON.parse(r.detail) as Record<string, unknown>,
        prev_hash: r.prev_hash, hash: r.hash,
      }));
  }

  /**
   * Recomputes the whole chain from the rows. Verifying through the object that
   * wrote them would prove nothing; this reads them back and does the sums.
   */
  verify(): { intact: boolean; broken_at: number | null } {
    let prev = GENESIS;
    for (const e of this.entries()) {
      const body = {
        seq: e.seq, kind: e.kind, at: e.at, actor_id: e.actor_id, actor_role: e.actor_role,
        object_type: e.object_type, object_id: e.object_id, outcome: e.outcome,
        detail: e.detail, prev_hash: prev,
      };
      const hash = createHash('sha256').update(canonical(body)).digest('hex');
      if (hash !== e.hash || e.prev_hash !== prev) return { intact: false, broken_at: e.seq };
      prev = e.hash;
    }
    return { intact: true, broken_at: null };
  }
}

/** Exported for the test that the two logs agree on a hash rather than looking alike. */
export const _canonical = canonical;
