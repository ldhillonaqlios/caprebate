/**
 * THE SHARED PARTS' FRONT DOOR: page templates and components, dates and working days, PDF and ZIP, the document store, plain words, and the claim calculator's adapter. No business rule lives in shared/. Another area imports it only from this file.
 * Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
 * needs it, never a whole file.
 */
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
// The document store first of all: the upload handler hands it its keys while it loads (setDocumentKeys), and the
// handler can be reached from the core, which html.ts below reaches.
export { FsObjectStore, INCOMING_PREFIX, SEALED_PREFIX, VIDEO_PREFIX, WHATSAPP_IMPORT_PREFIX, WHATSAPP_PREFIX, setDocumentKeys } from './objectstore.ts';
export { BLOB_API_VERSION, BLOB_UPLOAD_ORIGIN, SHARED_PREFIX, SharedObjectStore, uploadLinkSecret, vercelBlobClient } from './shared-objectstore.ts';
export { CSS_HEADERS, PNG_HEADERS, SITE_CSS } from './assets.ts';
export { LOGO_INK_PNG } from './brand-logo.ts';
export { SECTION_STATUS_WORDS, badge, brandName, breadcrumb, card, claimHref, claimName, claimRef, claimStageBar, claimTiles, clientStageBar, dataLink, fields, highlights, moreDetail, nextStepCard, noticeAtAddress, propertyIn, recordLayout, recordTabs, savedMessage, section, sectionList, sidePanel, statusFromNeeds, welcomeCard, why } from './components.ts';
export { BAND, BENEFIT, BOOKING, CB, CTA, FEE, FRONTDOOR, FUNNEL, GATE, GATE_CONFIG, RATES, REGISTRY, amendmentWindow, clientVatFromWorks, ctaSwitchReadings, electionNotifiedInTime, estimate, feeDisplay, feeGuard, feeRate, getSector, marginalRateRange, multiSiteDiscount, newSession, noClaimThreshold, registryGate } from './engine.ts';
export { extractPages, isScanMarker, pdfPageImages } from './extract-text.ts';
export { FINDING_LABELS, findingSeen } from './finding-source.ts';
export { HTML_HEADERS, SITE_JS_HEADERS, Safe, escapeHtml, h, page, raw } from './html.ts';
export { IMAGE_LIMITS, ImageError, reEncodeAvatar } from './images.ts';
export { WEEKDAY_NAMES, addLocalDaysMs, dueReading, dueWords, instantsForLocalMinute, localClock, localDate, localPartsOf, localStamp, localWhen, startOfLocalDayMs, ukDate, ukDatesIn, zoneNotice } from './localtime.ts';
export { LEGAL_ENGINE_SWITCHES, moneyReadingsHere, packSwitchReadings } from './money-readings.ts';
export { claimNextStep, leadNextStep, plainNeed } from './next-step.ts';
export { KEEP_ORIGINALS, KEEP_ORIGINALS_TEST_WEBSITE, READ_AND_DELETED, sealKeyFromEnv } from './originals.ts';
export { PAGE, buildCanvasPdf, textWidth, wrapText } from './pdf-canvas.ts';
export { buildPdf, flow } from './pdf.ts';
export { plainDashLines, plainDashText, plainDashes } from './plain-dashes.ts';
export { onTestWebsite } from './test-website.ts';
export { RANGE_QUALIFIER, formatPence, formatShownRange, toPence } from './shown-range.ts';
export { SIGNATURE_PAD_JS } from './signature-pad-script.ts';
export { CLOSED_STAGE, EXITS, EXIT_KEYS, LEGACY_STAGE_TO_PROCEDURE, ON_HOLD_STAGE, PROCEDURE_KEYS, PROCEDURE_STAGES, STAGES, anyStageLabel, claimStage, clientStageFor, exitStage, nextProcedureKey, procedureIndex, procedureStage, progressFor, stage, stageIndex } from './stages.ts';
export { LATE_AFTER_WORKING_DAYS, isLateNewLead, waitedWords, workingDaysSince } from './working-days.ts';
export { DOCX_DOCUMENT_ENTRIES, docxParagraphTexts, listZipEntries, readZipEntry, readZipEntryFromBuffer } from './zip.ts';
export type { Job, Need, QuickAction, RecordTab, SectionContext, SectionSpec, SectionStatus, Tone } from './components.ts';
export type { BenefitContext, EngineResult, EngineWindow, EntityKey, FeeComparison, FeeDisplay, GateDecision, NoClaimVatReading, RecommendationThreshold, SectorId, Session } from './engine.ts';
export type { ExtractedPage, PageImage } from './extract-text.ts';
export type { MoneyReadings } from './money-readings.ts';
export type { KeepOriginals } from './originals.ts';
export type { DocumentKeys, FsObjectStoreOptions, IncomingTarget } from './objectstore.ts';
export type { BlobClient, SharedObjectStoreOptions, SharedPutOptions, VercelBlobSdk } from './shared-objectstore.ts';
export type { Op, PdfFont, Rgb } from './pdf-canvas.ts';
export type { PdfLine } from './pdf.ts';
export type { ShownRange } from './shown-range.ts';
export type { Env } from './test-website.ts';
export type { ExitKey, ProcedureKey, Progress, StageKey } from './stages.ts';
export { dateField, has, requiredText, textField, words } from './form-fields.ts';
export type { Check, Fields as FormFields, Vocab } from './form-fields.ts';
// Phase 161m: the rules registers (what a rule is, the lock, what a sealed result records) and the shared area's register.
export { ENGINE_PACKAGE_PATH, FIRST_RECORDED, FIRST_RECORDED_ON, RulesRegisterError, canonicalValue, defineRules, engineVersion, lockProblems, mapEntries, readResultVersions, recordInLock, resultVersions, ruleValueHash, settingsOf, switchEntry, versionChanges } from './rules-register.ts';
export type { LockVersion, ResultVersions, RuleEntry, RuleValue, RulesLock, VersionChange } from './rules-register.ts';
export { MONEY_READING_NAMES, SHARED_RULES, rulesThroughShared } from './logic/rules.ts';
