/**
 * THE CRM'S FRONT DOOR: organisations, leads, the pipeline, tasks, automation, messages, the calendar and introducers. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { addLocalDays, CLIENT_MOVE_NOTICE_MINUTES, clockToMinutes, distinctMoments, HORIZON_DAYS, isBookable, minutesToClock, publicSlots, replaceWorkingTimes, SLOT_MINUTES, staffSlots, startOfLocalDay, startOfLocalWeek, WEEKDAY_NAMES, WorkingTimeError, workingTimesFor } from './schedule.ts';
export { bookingInviteFile, sendVideoInvite } from './booking-invite.ts';
export { getAutomationRulesCOUNTByActiveTaskPriority, getBookingsChannelSmsVariantByBusinessId, getBookingsChannelSmsVariantByLeadId, getBookingsIdBusinessIdById, getBookingsSById, getBusinessesClaimantTypeById, getBusinessesCompanyNumberById, getBusinessesContactEmailNameById, getBusinessesContactEmailNameById2, getBusinessesCountByClientStatus, getBusinessesCountByIdClientStatus, getBusinessesEById, getBusinessesIdById, getBusinessesIdByRowid, getBusinessesIdNameById, getBusinessesIdNameById3, getBusinessesIdNameById4, getBusinessesNameById, getBusinessesNameCompanyNumberById, getBusinessesNameLegalNameById, getBusinessesNameSectorById, getBusinessesRowidById, getBusinessesSectorById, getBusinessesStageById, getClientMessageFilesIdDirectionByLogicalDocumentId, getClientTasksCountByKindState, getClientTasksIdBusinessIdById, getClientTasksIdBusinessIdById2, getClientTasksIdBusinessIdById3, getClientTasksIdBusinessIdById4, getClientTasksIdClaimIdByBusinessIdKind, getClientTasksIdClaimIdByIdKind, getClientTasksOpenSentByBusinessId, getContactsBusinessIdById, getContactsContactEmailNameByLeadId, getContactsCountByBusinessId, getContactsCountByClientStatus, getContactsFullNameById, getContactsIdBusinessIdById2, getContactsIdByBusinessIdContactType, getContactsIdByBusinessIdContactType2, getContactsIdById, getContactsIdByIdBusinessId, getContactsIdEmailByIdBusinessId, getContactsIdFullNameById, getContactsNByBusinessIdLeadId, getContactsXByBusinessId, getLeadsIdBusinessIdById5, getLeadsIdById, getLeadsIdByOriginStatus, getLeadsIdByRowid, getLeadsRowidById, getStaffTasksIdByCompanySubjectStatus, getStaffTasksIdByPropertyIdTitle, getStaffTasksIdTitleByClaimIdRuleId, getStaffTasksTitleDueOnByClaimIdIsNextAction, insertBookingChanges, insertBookingChanges2, insertBookingChanges3, insertBookingChanges4, insertBookings, insertBookings2, insertBookings3, insertBusinesses, insertBusinesses2, insertClientTasks, insertClientTasks2, insertClientTasks3, insertContacts2, insertContacts3, insertContacts4, insertInternalNotes, insertLeads3, insertStaffTasks2, insertWorkingTimes, listBookingsIdChannelByBusinessId, listBusinessesIdName, listBusinessesIdName4, listBusinessesNameLegalName, listClientTasksAnswerStateByBusinessIdFactId, listClientTasksFactIdByBusinessIdClaimId, listClientTasksFactIdByBusinessIdState, listClientTasksFactIdStateByBusinessIdFactId, listClientTasksIdAnswerByBusinessIdFactId, listClientTasksIdFactIdByBusinessIdKind, listClientTasksIdQuestionByBusinessIdState, listClientTasksIdRequestedTypeByBusinessIdKind, listClientTasksQuestionKindByBusinessIdState, listContactsEmailNameByBusinessIdEmail, listContactsFullNameByBusinessId, listContactsFullNameJobRoleByBusinessId, listContactsIdByBusinessId, listContactsIdFullName, listContactsIdFullNameByBusinessId, listContactsIdNameByBusinessIdContactType, listContactsIdNameByBusinessIdContactType2, listIntroducerShareConsentsIdDecisionByBusinessId, listIntroducerShareConsentsRecordedAtDecisionByBusinessId, listLeadsIdStatusByBusinessId, listLeadsIdUpdatedAtByEnquiryIdStatus, listLeadsProspectOrganisationProspectPostcode, listLeadsUpdatedAtByEnquiryIdStatus, listStaffTasksIdTitleByContactId, listStaffTasksIdTitleByPropertyIdTitle, listWorkingTimesUserIdN, updateBookingsCancelledAtCancelledByById, updateBookingsStartsAtEndsAtById, updateBookingsStartsAtEndsAtById2, updateBookingsStartsAtEndsAtById3, updateBusinessesClaimantTypeById, updateBusinessesClientStatusById, updateBusinessesLegalNameCompanyNumberById2, updateBusinessesSourceUpdatedAt, updateBusinessesStageUpdatedAtById, updateClientTasksStateAnswerStateById, updateClientTasksStateAnswerStateByIdState, updateClientTasksStateWithdrawnAtByIdState, updateContactsContactConsentUpdatedAtById, updateContactsMarketingOptinUpdatedAtById, updateLeadsEnquiryIdById } from './data.ts';
export { importPremises, PREMISES_SOURCES } from './premises-import.ts';
export { roomsFor, SOURCE_DOCUMENT } from './rooms.ts';
export { slotDayProblem, slotPicker } from './slot-picker.ts';
export { addBlock, removeBlock } from './time-blocks.ts';
export { pipelineBoardGate } from './crm.permissions.ts';
export { VIDEO_CALL_JS } from './video-call-script.ts';
export { activeMeeting, booksATime, callLengthOf, callLengthWords, checkCallLength, clientJoinUrl, clientMayJoin, joinPanel, meetingHost, reconcileVideoMeeting, SAME_TIME_WORDS, VIDEO_PAGE_HEADERS, videoCallsAtSameTime, withJoinScripts, zoomBlockers, zoomDeps, zoomPlanLine } from './video-calls.ts';
export { WHATSAPP_IMPORT_JS } from './whatsapp-import-script.ts';
export { automationGate, fireAutomation, rulesPage } from './automation.ts';
export * as crmModule from './crm.ts';
export { backfillClaimFor, CLAIMANT_TYPES, claimantTypeForGate, claimObjFor, derivedJurisdiction, insertClaim, isCompanyOrRoleToken, isReachable, JURISDICTIONS, loadClaimRow, OWNER_ROLE_TOKENS, pipelineBoard, propertyJurisdiction, WORKSTREAMS } from './crm.ts';
export { assertIntroducerSection, CLIENT_SHARE_GIVE, clientShareChoices, feeList, intakeReferral, onClause13Credit, onFeeInvoiced, PROSPECT_EVENTS, recordShareConsentByClient, REFERRAL_FORM, referralFormOpen, rewardModelGate } from './introducers.ts';
export { assertLeadSection, backfillLeadFor, createLead, LEAD_ORIGINS, LEAD_STATUSES, linkBookingToLead, NO_RANGE_NO_ASSESSMENT, openLeadForGatedExit, openLeadForSubmission, RANGE_NOT_SHOWN, SECTORS } from './leads.ts';
export { addMonths, MESSAGE_RETENTION, MESSAGE_RETENTION_QUESTION, sweepMessages } from './message-retention.ts';
export * as tasksModule from './tasks.ts';
export { addDaysToDate, dueReading, insertTask, mayCreateTask, myWork, nextActionsGate, NO_DUE_DATE, RECIPROCITY_ACTIVITY_TYPES, taskObj } from './tasks.ts';
export * as clientChecksModule from './client-checks.ts';
export { waitingForCheck } from './client-checks.ts';
export { clientList, clientListPage } from './client-list.ts';
export { handleClientPage } from './client-page.ts';
export { handleCrm } from './crm.routes.ts';
export { handleDashboard } from './dashboard-pages.ts';
export { assertDashboard } from './dashboard.ts';
export { handleFreeEmail } from './free-email-pages.ts';
export { senderSetting, setSender } from './free-email.ts';
export * as inboundEmailModule from './inbound-email.ts';
export { mayReadQueue, readMailbox, readRepliesIfDue } from './inbound-email.ts';
export { handleIntroducers } from './introducers-pages.ts';
export { handleStaffMessages, portalMessagesBody, readPortalSend, sendFromPortal, surveyorThreadPanel } from './messages-pages.ts';
export * as messagesModule from './messages.ts';
export { clientMessage, postClientMessage, unreadCount } from './messages.ts';
export { handlePipeline } from './pipeline-pages.ts';
export { clientStageForClaim, enteredAt, feeTriggerReached, gateOut, liveFeeInvoiceCount, loadPipelineClaim, raiseBusinessStage, raiseToResearch, recordOpened, reportDeliveredOn } from './pipeline.ts';
export { dashboard, dashView } from './staff-dashboard.ts';
export { handleTasks } from './tasks-pages.ts';
export { clientProgress, tellAndMoveOn, whyNotMoved } from './tell-and-move.ts';
export { handleWhatsAppImport } from './whatsapp-import-pages.ts';
export { receiveWhatsApp } from './whatsapp.ts';
export type { Availability, WorkingTime, WorkingTimeInput } from './schedule.ts';
export type { RoomType, SectorRooms } from './rooms.ts';
export type { RuleView, RunOutcome } from './automation.ts';
export type { ClaimRow, ClaimSummary, CrmDeps, Fields } from './crm.ts';
export type { ClientShareChoice, FeeView } from './introducers.ts';
export type { LeadRow } from './leads.ts';
export type { DueReading, TaskInsert } from './tasks.ts';
export type { ToCheck } from './client-checks.ts';
export type { ClientSort } from './client-list.ts';
export type { ThreadMessage } from './messages.ts';
export type { FeeTrigger, Need, PipelineClaim } from './pipeline.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { crmAssets, crmCallPage, crmReferralForm } from './routes.ts';
// What the CRM listens for (the modules below announce; src/core/events.ts). Last, as it reaches the CRM's own files.
import './events.ts';
