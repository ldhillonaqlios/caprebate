/**
 * THE CLIENT RECORD'S FRONT DOOR (Phase 161l1): organisations, contacts, leads, bookings and the calendar, tasks,
 * messages and introducers, as data and plain rules. Another area imports this module only from here
 * (09-app/docs/ARCHITECTURE.md rule 1).
 *
 * It sits LOW in the order (rule 2), just above the outside services, so the modules that read or write a client
 * (assessment, claims, survey, finance, compliance, admin) import it without importing the CRM's screens, which sit
 * near the top. So it imports only the shared parts, the core and the outside services: never a module's door. What
 * it must ask a module above it, it asks through a port it owns, filled by that module's door as it loads.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { CLIENTS_ACTIONS } from './actions.ts';
// What the outside services ask it (their ports): handed in first, as it reaches only its own data and their door.
import './client-values.ts';
import './do-not-contact.ts';
import './research-subject.ts';
// The client record's own statements (its data file), and what it reads of other areas' tables in place of joins.
export {
  byId, deleteClientMessageFilesByMessageId, deleteClientMessagesById, deleteInternalNotesById, deleteWorkingTimesByUserId, getAutomationRulesCOUNTByActiveTaskPriority,
  getAutomationRulesIdLabelById, getAutomationRulesN, getBookingChangesCountByBookingId, getBookingsBusinessIdLeadIdById, getBookingsChannelById, getBookingsChannelSmsVariantByBusinessId,
  getBookingsChannelSmsVariantByLeadId, getBookingsChannelStartsAtById, getBookingsIdBusinessIdById, getBookingsIdByAssignedToCancelledAt, getBookingsIdByLeadIdBusinessId, getBookingsSById,
  getBookingsStartsAtEndsAtBusinessIdLeadIdById, getBookingsStartsAtEndsAtById, getBusinessesClaimantTypeById, getBusinessesClientStatusById, getBusinessesCompanyNumberById, getBusinessesContactEmailNameById,
  getBusinessesContactEmailNameById2, getBusinessesCountByClientStatus, getBusinessesCountByIdClientStatus, getBusinessesEById, getBusinessesIdById, getBusinessesIdByRowid,
  getBusinessesIdNameById, getBusinessesIdNameById2, getBusinessesIdNameById3, getBusinessesIdNameById4, getBusinessesIdOwnerIdById, getBusinessesIdSourceById,
  getBusinessesNameById, getBusinessesNameCompanyNumberById, getBusinessesNameLegalNameById, getBusinessesNameSectorById, getBusinessesRowidById, getBusinessesSById,
  getBusinessesSById2, getBusinessesSectorById, getBusinessesSourceById, getBusinessesStageById, getBusinessesXById, getChannelReadsAtByUserIdBusinessId,
  getClientMessageFilesIdBusinessIdByLogicalDocumentId, getClientMessageFilesIdDirectionByLogicalDocumentId, getClientMessagesBusinessIdDirectionById, getClientMessagesCountByBusinessIdDirection, getClientMessagesCountByBusinessIdDirection2, getClientMessagesExistsByBusinessId,
  getClientTaskChecksIdByTaskId, getClientTasksCountByKindState, getClientTasksIdBusinessIdById, getClientTasksIdBusinessIdById2, getClientTasksIdBusinessIdById3, getClientTasksIdBusinessIdById4,
  getClientTasksIdClaimIdByBusinessIdKind, getClientTasksIdClaimIdByIdKind, getClientTasksIdKindById, getClientTasksOpenSentByBusinessId, getContactsBusinessIdById, getContactsBusinessIdLeadIdById,
  getContactsContactEmailNameByLeadId, getContactsCountByBusinessId, getContactsCountByBusinessIdId, getContactsCountByClientStatus, getContactsCountByClientStatus2, getContactsEByBusinessIdEmail,
  getContactsEByLeadId, getContactsFullNameById, getContactsFullNamePhoneByBusinessId, getContactsFullNameWhatsappOptinById, getContactsIdBusinessIdById, getContactsIdBusinessIdById2,
  getContactsIdBusinessIdById3, getContactsIdBusinessIdById4, getContactsIdByBusinessId, getContactsIdByBusinessIdContactType, getContactsIdByBusinessIdContactType2, getContactsIdById,
  getContactsIdByIdBusinessId, getContactsIdByIdIntroducerId, getContactsIdEmailByIdBusinessId, getContactsIdFullNameById, getContactsIdFullNameByIdIntroducerId, getContactsIdFullNameByLeadId,
  getContactsNByBusinessIdLeadId, getContactsXByBusinessId, getContactsXByIdBusinessId, getHealthcarePremisesXBySourceIdSourceRef, getInternalNotesCountByBusinessIdAuthorId, getInternalNotesExistsByBusinessId,
  getIntroducerFeesCountByIntroducerId, getIntroducerFeesIdByClaimId, getIntroducerNoticesIdByLeadIdNotice, getIntroducerPercentageEntriesIdByInvoiceIdEntryKind, getIntroducerPercentageEntriesIntroducerIdClaimIdByInvoiceId, getIntroducerPercentageEntriesTByInvoiceId,
  getIntroducerTermsSignaturesTermsVersionSignedOnByIntroducer, getIntroducersFirmNameById, getIntroducersIdById, getIntroducersIdIntroducerTypeById, getIntroducersIdMergedIntoIdById, getLeadsBusinessIdById,
  getLeadsClaimIdById, getLeadsEnquiryIdById, getLeadsIdBusinessIdByBusinessIdIntroducerId, getLeadsIdBusinessIdByClaimId, getLeadsIdBusinessIdById, getLeadsIdBusinessIdById2,
  getLeadsIdBusinessIdById3, getLeadsIdBusinessIdById4, getLeadsIdBusinessIdById5, getLeadsIdBusinessIdById6, getLeadsIdBusinessIdById7, getLeadsIdByClaimId,
  getLeadsIdByClaimIdIntroducerId, getLeadsIdById, getLeadsIdByOriginStatus, getLeadsIdByRowid, getLeadsIntroducerIdByClaimIdIntroducerType, getLeadsIntroducerIdById,
  getLeadsRowidById, getStaffTasksAtByContactIdStatus, getStaffTasksCompletedAtActivityTypeByIntroducerIdStatus, getStaffTasksCountByIntroducerId, getStaffTasksDueOnNByContactIdStatus, getStaffTasksDueOnTitleByIntroducerIdStatus,
  getStaffTasksIdByCompanySubjectStatus, getStaffTasksIdByCreatedByOrigin, getStaffTasksIdByPropertyIdTitle, getStaffTasksIdTitleByClaimIdRuleId, getStaffTasksTitleDueOnByClaimIdIsNextAction, getStaffTasksTitleOwnerIdByLeadIdStatus,
  getThreadReadsAtByUserIdBusinessId, getTimeBlocksUserIdRemovedAtById, idsOf, insertAutomationRules, insertAutomationRuns, insertBookingChanges,
  insertBookingChanges2, insertBookingChanges3, insertBookingChanges4, insertBookings, insertBookings2, insertBookings3,
  insertBusinesses, insertBusinesses2, insertCallLogs, insertChannelReads, insertClientMessageFiles, insertClientMessages,
  insertClientMessages2, insertClientMessages3, insertClientTaskChecks, insertClientTaskChecks2, insertClientTasks, insertClientTasks2,
  insertClientTasks3, insertContacts, insertContacts2, insertContacts3, insertContacts4, insertContacts5,
  insertHealthcarePremises, insertInternalNotes, insertIntroducerFees, insertIntroducerMerges, insertIntroducerNotices, insertIntroducerPercentageEntries,
  insertIntroducerPercentageEntries2, insertIntroducerShareConsents, insertIntroducerShareConsents2, insertIntroducerTermsSignatures, insertIntroducers, insertIntroducers2,
  insertLeads, insertLeads2, insertLeads3, insertLeads4, insertLeads5, insertStaffTasks,
  insertStaffTasks2, insertThreadReads, insertTimeBlocks, insertWorkingTimes, listAutomationRulesIdLabel, listAutomationRulesIdLabelByActiveTriggerEvent,
  listAutomationRunsAtOutcomeByBusinessIdClaimId, listAutomationRunsAtOutcomeByClaimId, listAutomationRunsAtOutcomeByLeadId, listBookingsAssignedToStartsAtByStartsAtEndsAt, listBookingsIdAssignedToByStartsAtEndsAt, listBookingsIdBusinessIdByBusinessIdLeadId,
  listBookingsIdBusinessIdByLeadIdId, listBookingsIdByIdChannelOverlap, listBookingsIdChannelByBusinessId, listBusinessesIdName, listBusinessesIdName2, listBusinessesIdName3,
  listBusinessesIdName4, listBusinessesIdNameByIds, listBusinessesIdNameSectorByIds, listBusinessesNameLegalName, listClientMessageFilesLogicalDocumentIdByMessageId, listClientMessagesBusinessId,
  listClientMessagesBusinessIdNameByDirectionCreatedAt, listClientMessagesIdCreatedAtByBusinessId, listClientMessagesIdCreatedAtByIds, listClientTasksAnswerStateByBusinessIdFactId, listClientTasksFactIdByBusinessIdClaimId, listClientTasksFactIdByBusinessIdState,
  listClientTasksFactIdStateByBusinessIdFactId, listClientTasksIdAnswerByBusinessIdFactId, listClientTasksIdBusinessIdByStateDueOn, listClientTasksIdFactIdByBusinessIdKind, listClientTasksIdKindAnsweredByByBusinessIdClaimId, listClientTasksIdQuestionByBusinessIdState,
  listClientTasksIdRequestedTypeByAskedByKind, listClientTasksIdRequestedTypeByBusinessIdKind, listClientTasksQuestionCreatedAtAskedByByBusinessId, listClientTasksQuestionDueOnByAskedByState, listClientTasksQuestionDueOnByAskedByState2, listClientTasksQuestionDueOnByBusinessIdState,
  listClientTasksQuestionKindByBusinessIdState, listContactsEByBusinessIdEmail, listContactsEmailNameByBusinessIdEmail, listContactsFullNameByBusinessId, listContactsFullNameJobRoleByBusinessId, listContactsIdBusinessIdByBusinessId,
  listContactsIdBusinessIdByBusinessIdPhone, listContactsIdByBusinessId, listContactsIdCreatedAtByLeadId, listContactsIdFullName, listContactsIdFullNameByBusinessId, listContactsIdFullNameByBusinessId2,
  listContactsIdFullNameByBusinessIdContactType, listContactsIdFullNameByBusinessIdPhone, listContactsIdFullNameByIds, listContactsIdFullNameByIntroducerId, listContactsIdFullNameByLeadIdBusinessId, listContactsIdFullNameContactTypeByIds,
  listContactsIdNameByBusinessIdContactType, listContactsIdNameByBusinessIdContactType2, listInternalNotesIdCreatedAtByBusinessId, listIntroducerNoticesAtNoticeByLeadId, listIntroducerShareConsentsIdDecisionByBusinessId, listIntroducerShareConsentsRecordedAtDecisionByBusinessId,
  listIntroducersIdFirmName, listIntroducersIdName, listIntroducersIdNameByIdMergedIntoId, listLeadsClaimIdByIntroducerIdEvery, listLeadsClaimIdByIntroducerIdWithClaim, listLeadsIdBusinessId,
  listLeadsIdBusinessIdByStatus, listLeadsIdByBusinessId, listLeadsIdByClaimId, listLeadsIdFirmNameByBusinessId, listLeadsIdStatusByBusinessId, listLeadsIdUpdatedAtByEnquiryIdStatus,
  listLeadsLeadIdIntroducerIdByBusinessId, listLeadsLeadIdNameByEnquiryIdId, listLeadsProspectOrganisationProspectPostcode, listLeadsUpdatedAtByEnquiryIdStatus, listStaffTasksFactIdByBusinessIdFactId, listStaffTasksIdBusinessIdByStatus,
  listStaffTasksIdTitleByContactId, listStaffTasksIdTitleByPropertyIdTitle, listTimeBlocksIdAssignedToByRemovedAtStartsAt, listTimeBlocksIdUserIdByUserIdRemovedAt, listTimeBlocksUserIdStartsAtByRemovedAtStartsAt, listWorkingTimesIdUserId,
  listWorkingTimesIdUserIdByUserIdStartM, listWorkingTimesUserIdN, lookUp, sqlOrder, updateAutomationRulesLabelTriggerEventById, updateBookingsBusinessIdByLeadIdBusinessId,
  updateBookingsCancelledAtCancelledByById, updateBookingsStartsAtEndsAtById, updateBookingsStartsAtEndsAtById2, updateBookingsStartsAtEndsAtById3, updateBusinessesClaimantTypeById, updateBusinessesClientStatusActiveById,
  updateBusinessesClientStatusById, updateBusinessesLegalNameCompanyNumberById, updateBusinessesLegalNameCompanyNumberById2, updateBusinessesSourceUpdatedAt, updateBusinessesSourceUpdatedAtById, updateBusinessesStageUpdatedAtById,
  updateClientTasksStateAnswerStateById, updateClientTasksStateAnswerStateByIdState, updateClientTasksStateWithdrawnAtByIdState, updateContactsBusinessIdUpdatedAtByLeadIdBusinessId, updateContactsContactConsentUpdatedAtById, updateContactsFullNameJobRoleOtherById,
  updateContactsFullNameJobRoleOtherById2, updateContactsIntroducerIdUpdatedAtByIntroducerId, updateContactsMarketingOptinUpdatedAtById, updateIntroducerFeesDisclosureGivenAtDisclosureRecordedByByI, updateIntroducerFeesStatePaidAtById, updateIntroducerMergesCompletedAtLeadsMovedById,
  updateIntroducerRewardSettingModelFeePenceById, updateIntroducersFirmNameIntroducerTypeById, updateIntroducersMergedIntoIdMergedAtById, updateIntroducersNoticeContactIdUpdatedAtByIdNoticeContactId, updateLeadsBookingIdUpdatedAtByBusinessIdBookingId, updateLeadsEnquiryIdById,
  updateLeadsIntroducerIdUpdatedAtByIntroducerId, updateLeadsOwnerIdPriorityById, updateLeadsStatusConvertedAtById, updateLeadsUpdatedAtById, updateStaffTasksIntroducerIdUpdatedAtByIntroducerIdStatus, updateStaffTasksIsNextActionUpdatedAtByClaimIdIsNextAction,
  updateStaffTasksIsNextActionUpdatedAtById, updateStaffTasksStatusCancelledAtById, updateStaffTasksStatusCompletedAtById, updateStaffTasksStatusStartedAtById, updateStaffTasksStatusUpdatedAtById, updateStaffTasksTitleDescriptionById,
  updateTimeBlocksRemovedAtRemovedByByIdRemovedAt,
} from './data.ts';
// The retention list's counts of the client record's kinds (Phase 161l2, for compliance).
export { countClientRecordKind } from './data.ts';
// What the client record asks the claims and the survey (Phase 161l2): its ports, filled by their doors as they load.
export { claimRefsFor, setClaimRefsReader } from './claims-port.ts';
export { isSurveyWalkthrough, setWalkthroughBookingReader } from './walkthrough-port.ts';
// Read by a list of ids, for the areas above that joined these tables to their own rows (Phase 161l2).
export { listBookingsIdStartsAtCancelledAtByIds, listBusinessesIdNameSectorStageByIds } from './data.ts';
// Phase 161l2: the statements that waited in the borrowed file, at home in the data file (each split by owner: the
// users through the core's fillUsers; the claims' and the assessment's halves put together by the CRM,
// src/modules/crm/split-reads.ts, and the claims, src/modules/claims/claim-row.ts).
export {
  CLIENT_SEARCH_STATEMENTS, getBookingById, getBookingsFirstIdEntryPointByBusinessId, getBookingsIdEmailByIdDisabledAt, getBusinessesIdNameById5,
  getBusinessesIdSourceCreatedAtOwnerIdById, getClientMessagesIdBusinessIdByIdBusinessIdOwn, getClientTaskChecksOutcomeWhoByTaskId,
  getIntroducerFeesIdIntroducerIdByIdOwn, getIntroducerRewardSettingModelFeePenceById, getIntroducerShareConsentsIdDecisionByIntroducerIdLeadId,
  getIntroducersIdFirmNameById, getLeadRowByIdOwn, getLeadsAssessmentIdById, getLeadsIdStatusByAssessmentId, getLeadsIntroducerIdClaimIdByClaimId,
  getLeadsReferredOpenedByIntroducerId, getStaffTasksIdBusinessIdByIdOwn, getStaffTasksIdTitleByClaimIdIsNextAction, getTaskRowByIdOwn,
  getUsersCountByClientStatusEmailCanonical, insertEnquiryChecks, insertEnquiryChecks2, insertLeadsBackfilled, listAutomationRunsAtTriggerEventOwn,
  listBookingChangesAtFromStartsAtByBookingId, listBookingChangesFromStartsAtToStartsAtByBookingId, listBookingsCancelled, listBookingsIdChannelByBusinessIdChannel,
  listBookingsScheduled, listBookingsWithNoTime, listBusinessesIdName5, listBusinessesIdNameSectorSourceByIds, listCallLogsIdLoggedAtByBusinessId,
  listClientMessageLinesByBusinessIdClaimIdOwn, listClientMessageLinesByBusinessIdOwn, listClientMessagesIdBusinessIdByBusinessIdOwn,
  listEnquiryChecksRecordedAtCheckKeyByClaimId, listEnquiryChecksRecordedAtCheckKeyByLeadId, listEnquiryChecksSeqCheckKeyByClaimId, listEnquiryChecksSeqCheckKeyByLeadId,
  listInternalNotesIdAuthorIdByBusinessIdOwn, listIntroducerFeesIdIntroducerIdByIntroducerIdOwn, listIntroducerFeesIdIntroducerIdOwn,
  listIntroducerPercentageEntriesIdIntroducerIdByIntroducerIdOwn, listIntroducerPercentageEntriesIdIntroducerIdOwn, listIntroducersIdFirmName2, listLeadListLinesOwn,
  listLeadRowsOwn, listLeadsClaimIdSourceIntroducerByClaimIds, listLeadsIdOrganisationByIntroducerId, listNoteLinesByBusinessIdClaimIdOwn, listNoteLinesByBusinessIdOwn,
  listNoteLinesByPropertyIdClaimIdsOwn, listStaffTasksIdTitleByBusinessIdLeadId, listStaffTasksIdTitleByClaimId, listStaffTasksIdTitleByIntroducerIdStatus,
  listStaffTasksIdTitleByLeadId, listStaffTasksIdTitleByPropertyIdClaimIds, listStaffTasksNextActionByClaimIds, listTaskRowsByClaimIdOwn, listTaskRowsOpenByOwnerOwn,
  listTaskRowsOpenDueByOwn, listTaskRowsOpenOwn, listUsersIdDisplayNameByDisabledAt, searchContacts, searchNotes, searchOrganisationNames, searchOrganisations,
  searchProspects, withClaimRefs,
} from './data.ts';
// The calendar, the booking and its invitation, the video calls, the time blocks and the rooms a survey walks.
export { CLIENT_MOVE_NOTICE_MINUTES, HORIZON_DAYS, SLOT_MINUTES, WEEKDAY_NAMES, WorkingTimeError, addLocalDays, clockToMinutes, distinctMoments, isBookable, minutesToClock, publicSlots, replaceWorkingTimes, slotsBetween, staffSlots, startOfLocalDay, startOfLocalWeek, workingTimesFor } from './schedule.ts';
export { MAX_DAYS, slotDayProblem, slotPicker } from './slot-picker.ts';
export { INVITE_NOT_SENT, bookingInviteFile, callBookedPhoneEmail, callBookedVideoEmail, callChangedEmail, callWhen, callsLink, drawCallEmail, sendVideoInvite } from './booking-invite.ts';
export { SAME_TIME_WORDS, VIDEO_PAGE_CSP, VIDEO_PAGE_HEADERS, activeMeeting, booksATime, callLengthOf, callLengthWords, checkCallLength, clientJoinUrl, clientMayJoin, joinPanel, meetingHost, reconcileVideoMeeting, videoCallsAtSameTime, videoJoinWords, withJoinScripts, zoomBlockers, zoomDeps, zoomPlanLine } from './video-calls.ts';
export { VIDEO_CALL_JS } from './video-call-script.ts';
export { addBlock, blocksFor, mayBlockTime, removeBlock } from './time-blocks.ts';
export { SOURCE_DOCUMENT, allRoomIds, roomsFor } from './rooms.ts';
export type { Availability, WorkingTime, WorkingTimeInput } from './schedule.ts';
export type { RoomType, SectorRooms } from './rooms.ts';
// The vocabularies and small readings (carved from the CRM's crm.ts).
export { CLAIMANT_TYPES, JURISDICTIONS, OWNER_ROLE_TOKENS, WORKSTREAMS, isCompanyOrRoleToken, isReachable } from './vocab.ts';
export type { Fields } from './vocab.ts';
// Writing a task and reading when one is due (carved from the CRM's tasks.ts).
export { ACTIVITY_TYPES, NO_DUE_DATE, POOL_ROLES, RECIPROCITY_ACTIVITY_TYPES, addDaysToDate, addMonthsToDate, dueReading, insertTask, taskObj } from './tasks.ts';
export type { DueReading, DueState, TaskInsert } from './tasks.ts';
// The website's leads (carved from the CRM's leads.ts).
export { linkBookingToLead, openLeadForGatedExit, openLeadForSubmission } from './leads.ts';
// Writing on the thread with the client, its alert, and what is unread (carved from the CRM's messages.ts).
export { MAX_MESSAGE, NOTICE_SUBJECT_LEADS_WITH_COMPANY, alertNewMessage, alertWords, clientObj as clientThreadObj, company as threadCompany, lastChannelRead, lastRead as lastThreadRead, later as laterOf, messageRefusal, noteObj as teamThreadObj, noticeSubject, postClientMessage, setClaimOfBusinessReader, unreadCount } from './messages.ts';
export type { AlertResult, Channel, MessageDeps, Thread, WriteResult } from './messages.ts';
// The automation rules' words and their gate (carved from the CRM's automation.ts).
export { ASSIGN, ATTACH, EFFECTS, FORBIDDEN_EFFECTS, RULES_SECTION, RUN_REASONS, TRIGGERS, automationGate } from './automation-words.ts';
export type { RuleDbRow } from './automation-words.ts';
// The introducers' switches and the reward setting's gate (carved from the CRM's introducers.ts).
export { CLIENT_SHARE_GIVE, FEE_STATES, REFERRAL_FORM, REWARD_OBJECT, feeList, feeObj, rewardModelGate } from './introducers.ts';
export type { FeeDbRow, FeeView } from './introducers.ts';
// The chat clean-up job's switch (carved from the CRM's message-retention.ts).
export { MESSAGE_RETENTION, MESSAGE_RETENTION_QUESTION } from './message-retention.ts';
export type { MessageRetention } from './message-retention.ts';
// The client's step raised by the research (carved from the CRM's pipeline.ts).
export { raiseToResearch } from './stage.ts';
// Running the automation rules, through the port the CRM fills (src/modules/clients/automation-port.ts).
export { fireAutomation, setAutomationRunner } from './automation-port.ts';
export type { AutomationDeps, AutomationEvent, AutomationRunner, RunOutcome } from './automation-port.ts';
// Phase 161l2: what the claims read here in place of their borrowed statements (src/modules/claims/data-borrowed.ts).
export { listBusinessesBusinessIdNameSectorStageById, listBusinessesBusinessIdNameSectorStageNewest, listClientTasksDocumentRequestsByBusinessId, listClientTasksDocumentRequestsByBusinessIdClaimId, listClientTasksIdFactIdByBusinessIdKind2, listClientTasksQuestionAnswerByBusinessIdState, listInternalNotesIdBodyByBusinessId } from './data.ts';
// The website's enquiries (this module's table since Phase 161l2): the CRM's inbox reads and handles them, the public site's form adds them.
export { deleteWebsiteEnquiriesById, getWebsiteEnquiriesCountByStatus, getWebsiteEnquiriesIdCreatedAtById, insertWebsiteEnquiries, listWebsiteEnquiriesIdCreatedAtByStatus, listWebsiteEnquiriesIdHandledAtByStatus, updateWebsiteEnquiriesStatusHandledByByIdStatus, updateWebsiteEnquiriesStatusLeadIdById } from './data.ts';
// The closed-enquiry clean-up's switch, period and question (moved from the public site, Phase 161l2).
export { ENQUIRY_RETENTION, ENQUIRY_RETENTION_QUESTION, ENQUIRY_RETENTION_RULE, enquiryRetentionMissing } from './enquiry-retention.ts';
export type { EnquiryRetention } from './enquiry-retention.ts';
// Phase 161m: its rules register (logic/rules.ts), and every area's below it.
export { CLIENTS_RULES, rulesThroughClients } from './logic/rules.ts';
