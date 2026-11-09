/**
 * THE OUTSIDE SERVICES' FRONT DOOR: every connector, the email sender and reader, the register intake, the postcode and grid lookups, and the outside services list. Another area imports them only from this file; only connectors/http.ts calls the network.
 * Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
 * needs it, never a whole file.
 */
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { ga4MeasurementId, sitePageFor } from './analytics.ts';
export { ADDRESS_LOOKUP, ADDRESS_SEARCH_CAP, addressLookupMissing, findAddresses, searchesToday } from './connectors/address-lookup.ts';
export { DORMANT_WORDS, isDormant } from './connectors/companies-house.ts';
export { COMPANY_SEARCH, COMPANY_TYPE_FROM_REGISTER, accountsTypeWords, companySearchOffered, entityFromCompanyType, searchCompanies } from './connectors/company-search.ts';
export { amount } from './connectors/hmlr-title.ts';
export { preferHomedataPlanning, supersededPlanning } from './connectors/homedata-planning.ts';
export { ESTIMATED_AREA_LABEL, HOMEDATA_DIMENSIONS } from './connectors/homedata.ts';
export { RateLimiter, liveTransport } from './connectors/http.ts';
export { IDENTITY_CHECK, IDENTITY_PROVIDER_NAME, identityCheckMissing, identityResultCopy, identityTestingWarning, readIdentityDecision, sentUnderTestingWaiver, startIdentityCheck } from './connectors/identity-check.ts';
export { INSPIRE_COUNCILS, inspireFileForLad } from './connectors/inspire-councils.ts';
export { INSPIRE_KEEP_DAYS, inspireStoreFromEnv } from './connectors/inspire-store.ts';
export { UNMEASURED_MATCH_GRADE_CAP, postcodeKey } from './connectors/matching.ts';
export { nationFromCountry } from './connectors/nations.ts';
export { OS_ATTRIBUTION, PLAN_HALF_M, PLAN_MAX_BUILDINGS, buildingsAround, pickBuilding, pointOfPostcode } from './connectors/os-buildings.ts';
export { ostn15Grid } from './connectors/ostn15.ts';
export { PAID_CONNECTORS, PAID_ORDER, pounds, totalBeforePence, uprnFrom } from './connectors/paid-registers.ts';
export { onTestWebsite } from './connectors/place.ts';
export { POSTCODE_CHECK, checkPostcode, normalisePostcode, postcodeCheckMissing } from './connectors/postcode-check.ts';
export { PRICE_PAID_ATTRIBUTION } from './connectors/price-paid.ts';
export { PLANNING_ROUTE, REGISTER_SWITCHES, TEST_WEBSITE_LOOKUPS, freeGateWaived, gateStatus, lookupsWaivedHere, runConnector, switchedOn, switchesHere } from './connectors/registers.ts';
export { s3LoginFrom, s3Target } from './connectors/s3-backup.ts';
export { SIGNATORY_SOURCES, checkSignatory, notYet, outcome, signatoryWords } from './connectors/signatory-check.ts';
export { TITLE_BOUNDARY_LABEL, TITLE_BOUNDARY_SOURCE_ID } from './connectors/title-boundary.ts';
export { TURNSTILE_FIELD, checkTurnstile, refusalWords, turnstileSiteKey, turnstileWhy, withSiteKey } from './connectors/turnstile.ts';
export { parseChat } from './connectors/whatsapp-export.ts';
export { MAX_WHATSAPP_TEXT, WINDOW_HOURS, fetchWhatsAppMedia, readWebhook, sendWhatsAppOpening, sendWhatsAppText, signatureHolds, waNumber, webhookChallenge, whatsappMissing } from './connectors/whatsapp.ts';
export { FREE_PLAN_LINE, NOT_ON_PLAN_WORDS, ZOOM_SDK_BASE, cancelZoomMeeting, hostZak, joinSignature, makeZoomMeeting, moveZoomMeeting, zoomMissing, zoomPastCall, zoomPlanIsFree, zoomRecording } from './connectors/zoom.ts';
export { deleteInboundEmailById, deleteInboundEmailFileSavesByInboundEmailFileIdInboundEmailI, deleteInboundEmailFilesByInboundEmailId, deleteInboundEmailFilingsByInboundEmailId, deleteRegisterFileRowsBySourceId, deleteRegisterMatchPicksByBusinessIdSourceId, getInboundBounceNoticesIdByMailboxUid, getInboundEmailFileSavesIdByInboundEmailFileId, getInboundEmailFilesIdPartNoById, getInboundEmailIdByMailboxUid, getInboundEmailIdFromAddressByIdOutcome, getInboundEmailN, getInboundEmailXByMailboxUid, getMailboxReadsAtFailedById, getMailboxReadsLastOkAtLastFailedById, getMailboxWatermarkUidById, getOutboxAtBySentAt, getOutboxAtBySentAt2, getOutboxAttachmentsCountByOutboxId, getOutboxCOALESCEThreadKeyKById, getOutboxIdBusinessIdByProviderRefSentAt, getOutboxIdByProviderRefSentAt, getOutboxRById, getRegisterFileImportsAtBySourceId, getRegisterFileRowsCountBySourceId, getRegisterMatchPicksChosenKeyReasonByBusinessIdSourceId, getRegisterMatchPicksChosenKeyScoreByBusinessIdSourceId, getRegisterMatchPicksIdChosenKeyByBusinessIdSourceId, getRegisterRecordsFieldsJsonByBusinessIdSourceId, getRegisterRecordsFieldsJsonByBusinessIdSourceId11, getRegisterRecordsFieldsJsonByBusinessIdSourceId2, getRegisterRecordsFieldsJsonByBusinessIdSourceId3, getRegisterRecordsFieldsJsonByBusinessIdSourceId4, getRegisterRecordsFieldsJsonByBusinessIdSourceId5, getRegisterRecordsFieldsJsonByBusinessIdSourceId6, getRegisterRecordsFieldsJsonByBusinessIdSourceId7, getRegisterRecordsFieldsJsonByBusinessIdSourceId8, getRegisterRecordsFieldsJsonByBusinessIdSourceId9, getRegisterRecordsFieldsJsonById, getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId, getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId2, getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId3, getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId4, getRegisterRecordsIdByBusinessIdSourceId, getRegisterRecordsIdSourceIdByIdBusinessId, getRegisterRecordsObtainedAtByBusinessIdSourceId, getResearchRunsCostPenceAtByBusinessId, getResearchRunsCountByBusinessIdKind, getResearchSourcesCountByBusinessIdState, getResearchSourcesCountByBusinessIdState2, getResearchSourcesIdAttemptsByBusinessIdSourceId, getResearchSourcesIdStateByBusinessIdSourceId, getResearchSourcesStateFailureCodeByBusinessIdSourceId, getVideoMeetingsCallMinutesCallPeopleByBookingIdCancelledAt, getVideoMeetingsIdBookingIdByBookingIdCancelledAt, getWhatsappImportLinesExistsByFingerprint, getWhatsappImportsByIdBusinessId, getWhatsappMediaMediaIdByMessageId, getWhatsappMediaMessageIdBusinessIdByMessageId, getWhatsappMessagesAtByPhoneDirection, getWhatsappMessagesCByBusinessIdContactId, getWhatsappMessagesCountByBusinessIdDirection, getWhatsappMessagesIdStatusByWaIdDirection, insertInboundBounceNotices, insertInboundEmail, insertInboundEmailFileSaves, insertInboundEmailFiles, insertInboundEmailFilings, insertInboundEmailFilings2, insertMailboxReads, insertMailboxWatermark, insertMailboxWatermarkByUid, insertRegisterFileImports, insertRegisterFileRows, insertRegisterMatchPicks, insertResearchRuns, insertResearchRuns2, insertResearchSources, insertVideoMeetings, insertWhatsappImportLines, insertWhatsappImports, insertWhatsappMedia, insertWhatsappMedia2, insertWhatsappMessages, insertWhatsappMessages2, insertWhatsappMessages3, listEmailSuppressionsAddressAtByStateId, listInboundEmailFilesIdPartNoByClientMessageId, listInboundEmailFilesIdReceivedAtByInboundEmailIdOutcome, listInboundEmailIdByClientMessageId, listInboundEmailIdFromAddressByOutcomeBusinessId, listInboundEmailIdReceivedAtByOutcomeInboundEmailId, listOutboxCreatedAtToEmailByBusinessId, listOutboxCreatedAtToEmailByOutboxId, listOutboxIdCreatedAtByBusinessIdKind, listOutboxIdCreatedAtByLeadIdKind, listOutboxIdToEmailBySendRequestedSentAt, listOutboxIdToEmailBySendRequestedSentAt2, listRegisterFileRowsRefAddressBySourceIdPostcodeKey, listRegisterMatchPicksChosenKeyTakenBackAtByBusinessIdSource, listRegisterMatchPicksSourceIdByBusinessIdTakenBackAt, listRegisterMatchPicksSourceIdTakenBackAtByBusinessIdTakenBa, listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId, listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId2, listRegisterRecordsIdSourceIdByBusinessId, listRegisterRecordsSourceIdEntityIdByBusinessId, listRegisterRecordsSourceIdEntityIdByBusinessIdPropertyId, listRegisterRecordsSourceIdFieldsJsonByBusinessId, listRegisterRecordsSourceIdFieldsJsonByBusinessIdSourceId, listResearchSourcesSourceIdStateByBusinessId, listWhatsappImportLinesAttachmentByImportIdAttachment, listWhatsappImportLinesMessageIdByImportIdAttachment, listWhatsappImportLinesPhoneLastAtByBusinessId, listWhatsappMessagesIdPhoneByBusinessIdDirection, updateOutboxLastErrorByIdLastError, updateOutboxLastErrorByIdLastError2, updateOutboxLastErrorByIdLastError3, updateOutboxLastErrorByIdLastError4, updateOutboxLastErrorByIdSentAt, updateOutboxLastErrorByIdSentAt2, updateRegisterMatchPicksRecordIdRemovedRecordIdById, updateResearchSourcesDetailByBusinessIdSourceId, updateResearchSourcesStateFailureCodeByBusinessIdSourceId, updateVideoMeetingsCallCheckStateCallCheckedAtById, updateVideoMeetingsCallMinutesCallPeopleById, updateVideoMeetingsCancelledAtById, updateVideoMeetingsHostOpenedAtHostOpenedByByIdHostOpenedAt, updateWhatsappImportsStatusById, updateWhatsappImportsStatusUsNameById, updateWhatsappMediaObjectKeyBytesByMessageIdFetchedAt, updateWhatsappMessagesBusinessIdFiledByByIdBusinessId, updateWhatsappMessagesStatusStatusAtById } from './data.ts';
export { countRegisterRecordsSince, insertResearchSourcesNotPermittedYet, updateResearchSourcesAfterRun } from './data.ts';
export { inviteFile } from './email/calendar.ts';
export { INBOUND_EMAIL, imapLoginFromKeyFile, imapMailbox, parseBounceReport, parseEmail, readingMissing, readingOn } from './email/email-inbound.ts';
export { EMAIL_SENDING, SENT_SECRET_KINDS, auditMailConnections, dispatchOutbox, emailPlaceRefusal, liftSuppression, mailWhere, recordBounce, sendingMissing, sendingOn, smtpLoginFromKeyFile, smtpProvider } from './email/email-provider.ts';
export { SAVED_NOT_SENT, STUB_NOTICE, currentSender, isDoNotContact, isInventedAddress, outboxTransport } from './email/email.ts';
export { OUTSIDE_SERVICES, TRANSFER_TO_CONFIRM } from './outside-services.ts';
export { referenceLocation, referenceOstn15Grid } from './postcodes/reference-db.ts';
export { ingestRegisterRecord, removeRegisterField, removeRegisterRecord } from './register-ingest.ts';
export { BOUNDARY_FETCHING_SWITCHED_ON } from './registers/boundary-import.ts';
export { NameExclusionError, assertNoUnauthorisedName } from './registers/name-exclusion.ts';
export { LICENCES, SOURCES, worstGrade } from './registers/source-register.ts';
export { builtInSignatureProvider } from './signature.ts';
// Phase 161l: the postcode table, for the command line (src/app/cli.ts).
export { postcodeStore } from './postcodes/postcode.ts';
export type { AddressLookupConfig, FoundAddress } from './connectors/address-lookup.ts';
export type { CompanyCandidate, CompanySearchConfig } from './connectors/company-search.ts';
export type { GateSnapshot, Transport } from './connectors/http.ts';
export type { IdentityCheckConfig, IdentityOutcome, IdentitySignature } from './connectors/identity-check.ts';
export type { InspireFileStore } from './connectors/inspire-store.ts';
export type { PickQuery, ReviewCandidate } from './connectors/matching.ts';
export type { Asker } from './connectors/os-buildings.ts';
export type { Ostn15Grid } from './connectors/ostn15.ts';
export type { Env } from './connectors/place.ts';
export type { PostcodeCheck, PostcodeCheckConfig } from './connectors/postcode-check.ts';
export type { Bundle, ConnectorContext, GateStatus } from './connectors/registers.ts';
export type { BackupTarget } from './connectors/s3-backup.ts';
export type { SignatoryGates, SignatoryOutcome, SignatoryReason, SignatoryResult, SignatorySource } from './connectors/signatory-check.ts';
export type { CallPolicy } from './connectors/sources.ts';
export type { ExportMessage, ParsedChat } from './connectors/whatsapp-export.ts';
export type { WhatsAppDeps } from './connectors/whatsapp.ts';
export type { MadeMeeting, PastCall, ZoomDeps } from './connectors/zoom.ts';
export type { InviteMethod } from './email/calendar.ts';
export type { ImapLogin, InboundEmail, Mailbox, ParsedEmail, RawEmail } from './email/email-inbound.ts';
export type { Connector, EmailSending, MailWhere, SmtpLogin } from './email/email-provider.ts';
export type { EmailTransport, InlineFile, Sender } from './email/email.ts';
export type { IngestedRecord } from './registers/name-exclusion.ts';
export type { Grade } from './registers/source-register.ts';
export type { SignatureProvider } from './signature.ts';
