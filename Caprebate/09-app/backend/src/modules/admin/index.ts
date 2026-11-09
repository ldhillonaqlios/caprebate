/**
 * ADMIN'S FRONT DOOR: users' settings, roles, templates, connections, configuration and lists. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { ADMIN_ACTIONS } from './actions.ts';
export { adminSettingsGate, SETTINGS_TILES, settingsBody, settingsTiles } from './admin-tiles.ts';
export { handleConfiguration } from './configuration-pages.ts';
export { handleConnections, listsToImport } from './connections.ts';
export { handleRoleEditor, madeRoleChoices } from './role-editor-pages.ts';
export * as settingsModule from './settings.ts';
export * as templatesModule from './templates.ts';
export { activeTemplates, carriesBankDetails, freeTextRefusal, mergePlain, mergeValues, templateRefusal, tipsOff } from './templates.ts';
export { mayTake, priorityRank, taskChoices, vocabChoice, vocabLabel, vocabulary } from './vocabularies.ts';
export type { TaskChoices } from './vocabularies.ts';
export { getDocumentTypesCodeByCode, getDocumentTypesCodeLabelByCode, getDocumentTypesHandlerTypeActiveByCode, getDocumentTypesHandlerTypeByCode, getDocumentTypesLabelByCode, getDocumentTypesLabelByCode2, getDocumentTypesM, getDocumentTypesOrdByCode, getEmailSenderA, getEmailTemplatesLabelSubjectByIdActive, getReasonListsCodeLabelByListCode, getReasonListsLabelByListCode, getVocabulariesActivityTypeCountByCode, insertDocumentTypes, insertEmailSender, listDocumentTypesCodeLabel, listDocumentTypesCodeLabel2, listDocumentTypesCodeLabelByActiveHandlerType, listDocumentTypesCodeLabelByActiveHandlerType2, listReasonListsCodeLabelActiveByList, updateDocumentTypesLabelReadersByCode } from './data.ts';
