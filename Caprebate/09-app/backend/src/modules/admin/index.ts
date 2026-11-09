/**
 * ADMIN'S FRONT DOOR: users' settings, roles, templates, connections, configuration and lists. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { ADMIN_ACTIONS } from './actions.ts';
// What the outside services ask it (their ports): handed in first, as it reaches only its own data and their door.
import './email-sender.ts';
export { adminSettingsGate, SETTINGS_TILES, settingsBody, settingsTiles } from './admin-tiles.ts';
export { handleConfiguration } from './configuration-pages.ts';
export { handleConnections, listsToImport } from './connections.ts';
export { handleRoleEditor, madeRoleChoices } from './role-editor-pages.ts';
export { keysView, refreshSavedKeys, saveKey, serviceOn } from './saved-keys.ts';
export * as settingsModule from './settings.ts';
export * as templatesModule from './templates.ts';
export { activeTemplates, carriesBankDetails, freeTextRefusal, mergePlain, mergeValues, templateRefusal, tipsOff } from './templates.ts';
export { mayTake, priorityRank, taskChoices, vocabChoice, vocabLabel, vocabulary } from './vocabularies.ts';
export type { TaskChoices } from './vocabularies.ts';
export { getDocumentTypesCodeByCode, getDocumentTypesCodeLabelByCode, getDocumentTypesHandlerTypeActiveByCode, getDocumentTypesHandlerTypeByCode, getDocumentTypesLabelByCode, getDocumentTypesLabelByCode2, getDocumentTypesM, getDocumentTypesOrdByCode, getEmailSenderA, getEmailTemplatesLabelSubjectByIdActive, getReasonListsCodeLabelByListCode, getReasonListsLabelByListCode, getSavedViewsIdListById, getVocabulariesActivityTypeCountByCode, insertDocumentTypes, insertEmailSender, insertSavedViews, listDocumentTypesCodeLabel, listDocumentTypesCodeLabel2, listDocumentTypesCodeLabelByActiveHandlerType, listDocumentTypesCodeLabelByActiveHandlerType2, listReasonListsCodeLabelActiveByList, listSavedViewsIdListByListRetiredAt, updateDocumentTypesLabelReadersByCode, updateSavedViewsRetiredAtRetiredByById } from './data.ts';
// Its parts of the back office's menu (src/core/navigation.ts). Last, as it reaches the module's own files.
import './nav.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/crm/data-borrowed.ts).
export { listDocumentTypesCodeReadersLabelByCodes, listReasonListsCodeLabelByList } from './data.ts';
