/**
 * ADMIN'S FRONT DOOR: users' settings, roles, templates, connections, configuration and lists. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { ADMIN_ACTIONS } from './actions.ts';
// What the outside services ask it (their ports): handed in first, as it reaches only its own data and their door.
import './email-sender.ts';
// The sender setting and the automation rules as read (moved from the CRM, Phase 161l1).
export { senderSetting, setSender } from './sender-setting.ts';
export type { SenderDeps } from './sender-setting.ts';
export { recentRuns, rulesPage } from './automation-rules.ts';
export type { RuleView, RulesPage, RunView } from './automation-rules.ts';
export { SETTINGS_TILES, settingsBody, settingsTiles } from './admin-tiles.ts';
export { adminSettingsGate } from './admin.permissions.ts';
export { handleConfiguration } from './configuration-pages.ts';
export { handleConnections, listsToImport } from './connections.ts';
// Phase 161m: every rule in force, read only.
export { handleRulesPage, positionWords, rulesInForcePage, RULES_IN_FORCE_PATH } from './rules-page.ts';
export { handleRoleEditor, madeRoleChoices } from './role-editor-pages.ts';
export { keysView, refreshSavedKeys, saveKey, serviceOn } from './saved-keys.ts';
export * as settingsModule from './settings.ts';
export * as templatesModule from './templates.ts';
export { activeTemplates, freeTextRefusal, mergePlain, mergeValues, templateRefusal } from './templates.ts';
export { mayTake, priorityRank, taskChoices, vocabChoice, vocabLabel, vocabulary } from './vocabularies.ts';
export type { TaskChoices } from './vocabularies.ts';
export { getEmailSenderA, getEmailTemplatesLabelSubjectByIdActive, getReasonListsCodeLabelByListCode, getReasonListsLabelByListCode, getSavedViewsIdListById, getVocabulariesActivityTypeCountByCode, insertEmailSender, insertSavedViews, listReasonListsCodeLabelActiveByList, listSavedViewsIdListByListRetiredAt, updateSavedViewsRetiredAtRetiredByById } from './data.ts';
// Its parts of the back office's menu (src/core/navigation.ts). Last, as it reaches the module's own files.
import './nav.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/clients/data-borrowed.ts, emptied in Phase 161l2).
export { listReasonListsCodeLabelByList } from './data.ts';
// Phase 161l2: the document types are the claims' table now (the document centre's); named here as before for the CRM
// and the portal, which read them through this door.
export { getDocumentTypesHandlerTypeActiveByCode, getDocumentTypesLabelByCode2, listDocumentTypesCodeLabel, listDocumentTypesCodeReadersLabelByCodes } from '../claims/index.ts';
