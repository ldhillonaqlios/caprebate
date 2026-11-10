/**
 * THE CRM'S FRONT DOOR: organisations, leads, the pipeline, tasks, automation, messages, the calendar and introducers. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { CRM_ACTIONS } from './actions.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
// The accountant's confirmations' port, filled by the portal's door (Phase 161l2).
export { setAccountantConfirmations } from './accountant-port.ts';
export type { AccountantConfirmations, AccountantNeed } from './accountant-port.ts';
// (Phase 161l1: the client record's data, calendar, tasks, messages and vocabularies are the clients area's now, read
// through src/modules/clients/index.ts; the claim's object, stage read and checks the claims', the claimant type the
// assessment's, the live fee invoices the finance's, the sender setting and the rules as read the admin's.)
export { importPremises, PREMISES_SOURCES } from './premises-import.ts';
export { pipelineBoardGate } from './crm.permissions.ts';
// The client page's layout and its folder tiles (moved from the portal, Phase 161l2); the staff Files page draws the tiles too.
export { folderTiles } from './client-layout.ts';
// The client's step names, as the portal draws them and the back office quotes them (moved from the portal, Phase 161l2).
export { portalStepLine, PROPOSED_STEP_NAMES, stepName } from './portal-steps.ts';
// The website's property types, as the public site's form offers them and Sales' inbox reads them (Phase 161l2).
export { PROPERTY_TYPES } from './enquiries.ts';
export type { EnquiryRow } from './enquiries.ts';
export { WHATSAPP_IMPORT_JS } from './whatsapp-import-script.ts';
export { fireAutomation } from './automation.ts';
export * as crmModule from './crm.ts';
export { backfillClaimFor, insertClaim, pipelineBoard } from './crm.ts';
export { assertIntroducerSection, clientShareChoices, intakeReferral, onClause13Credit, onFeeInvoiced, PROSPECT_EVENTS, recordShareConsentByClient, referralFormOpen } from './introducers.ts';
export { assertLeadSection, backfillLeadFor, createLead, LEAD_ORIGINS, LEAD_STATUSES, NO_RANGE_NO_ASSESSMENT, RANGE_NOT_SHOWN, SECTORS } from './leads.ts';
export { addMonths, sweepMessages } from './message-retention.ts';
export * as tasksModule from './tasks.ts';
export { mayCreateTask, myWork, nextActionsGate } from './tasks.ts';
export { clientList, clientListPage } from './client-list.ts';
export { claimListGate, leadsList } from './claim-lists.ts';
export { handleLists } from './claim-lists-pages.ts';
export { handleClientPage } from './client-page.ts';
export { handleCrm } from './crm.routes.ts';
export { handleDashboard } from './dashboard-pages.ts';
export { assertDashboard } from './dashboard.ts';
export { handleFreeEmail } from './free-email-pages.ts';
export * as inboundEmailModule from './inbound-email.ts';
export { mayReadQueue, readMailbox, readRepliesIfDue } from './inbound-email.ts';
export { handleIntroducers } from './introducers-pages.ts';
export { handleStaffMessages, portalMessagesBody, readPortalSend, sendFromPortal, surveyorThreadPanel } from './messages-pages.ts';
export * as messagesModule from './messages.ts';
export { clientMessage } from './messages.ts';
export { handlePipeline } from './pipeline-pages.ts';
export { feeTriggerReached, gateOut, recordOpened } from './pipeline.ts';
export { dashboard, dashView } from './staff-dashboard.ts';
// Home's rows of tiles (moved from the public site, Phase 161l2).
export { homeRows } from './home.ts';
export { handleTasks } from './tasks-pages.ts';
export { clientProgress, tellAndMoveOn, whyNotMoved } from './tell-and-move.ts';
export { handleWhatsAppImport } from './whatsapp-import-pages.ts';
export { receiveWhatsApp } from './whatsapp.ts';
export type { ClaimRow, ClaimSummary, CrmDeps } from './crm.ts';
export type { ClientShareChoice } from './introducers.ts';
export type { LeadRow } from './leads.ts';
export type { ClientSort } from './client-list.ts';
export type { LeadListRow } from './claim-lists.ts';
export type { ThreadMessage } from './messages.ts';

// The back office's filled assessments and calendar, read by the staff pages as one name.
export * as backOffice from './assessments-and-calendar.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { crmAssets, crmCallPage, crmReferralForm } from './routes.ts';
// What the CRM listens for (the modules below announce; src/core/events.ts). Last, as it reaches the CRM's own files.
import './events.ts';
// Its parts of the back office's menu (src/core/navigation.ts). Last, as it reaches the module's own files.
import './nav.ts';
// What the modules below ask the CRM (the ports they own, Phase 161l1). Last, as it reaches the module's own files.
import './ports.ts';
// The port the client portal fills as it loads (Phase 161l2: the client's acceptance of the report).
export { setReportAcceptanceReader } from './report-acceptance-port.ts';
