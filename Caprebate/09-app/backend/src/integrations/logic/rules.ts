/**
 * THE OUTSIDE SERVICES' RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register
 * is). Each switch keeps its words (its waiver record, its question) where its code lives; this pins its position, so
 * a switch turned on or off without a new version here is a red test. Each lookup's own switch and the document
 * reader's are read key by key, so a lookup added to either map is a new rule the same day.
 */
import { defineRules, mapEntries, switchEntry, type RuleEntry } from '../../shared/index.ts';
import { rulesThroughCore } from '../../core/index.ts';
import { EMAIL_SENDING } from '../email/email-provider.ts';
import { INBOUND_EMAIL } from '../email/email-inbound.ts';
import { IDENTITY_CHECK } from '../connectors/identity-check.ts';
import { POSTCODE_CHECK } from '../connectors/postcode-check.ts';
import { ADDRESS_LOOKUP } from '../connectors/address-lookup.ts';
import { COMPANY_SEARCH, COMPANY_TYPE_FROM_REGISTER } from '../connectors/company-search.ts';
import { HOMEDATA_DIMENSIONS } from '../connectors/homedata.ts';
import { REGISTER_SWITCHES } from '../connectors/registers.ts';
import { CLAUDE_SWITCHES } from '../connectors/claude.ts';

const TESTING = 'On for testing on Lakhbir\'s word, with invented data; the data protection officer checks it before real clients.';
const OFF = 'Not approved yet: built and switched off.';

export const INTEGRATIONS_RULES: readonly RuleEntry[] = defineRules('integrations', [
  switchEntry({ id: 'integrations.EMAIL_SENDING', title: 'Send email from our own address', approver: 'the data protection officer', approval: TESTING,
    settings: EMAIL_SENDING, home: 'src/integrations/email/email-provider.ts', tested_in: 'test/crm/free-typed-email.test.ts' }),
  switchEntry({ id: 'integrations.INBOUND_EMAIL', title: 'Read the replies to our own address', approver: 'the data protection officer', approval: TESTING,
    settings: INBOUND_EMAIL, home: 'src/integrations/email/email-inbound.ts', tested_in: 'test/crm/client-chat.test.ts' }),
  switchEntry({ id: 'integrations.IDENTITY_CHECK', title: 'The online identity check', approver: 'the data protection officer', approval: TESTING,
    settings: IDENTITY_CHECK, home: 'src/integrations/connectors/identity-check.ts', tested_in: 'test/compliance/identity-check-on-for-testing.test.ts' }),
  switchEntry({ id: 'integrations.POSTCODE_CHECK', title: 'The free postcode check', approver: 'the data protection officer', approval: TESTING,
    settings: POSTCODE_CHECK, home: 'src/integrations/connectors/postcode-check.ts', tested_in: 'test/compliance/identity-check-and-custom-roles.test.ts' }),
  switchEntry({ id: 'integrations.ADDRESS_LOOKUP', title: '"Find my address", from Homedata', approver: 'the data protection officer', approval: TESTING,
    settings: ADDRESS_LOOKUP, home: 'src/integrations/connectors/address-lookup.ts', tested_in: 'test/assessment/homedata-address-lookup.test.ts' }),
  switchEntry({ id: 'integrations.COMPANY_SEARCH', title: '"Find my company", from Companies House', approver: 'the data protection officer', approval: TESTING,
    settings: COMPANY_SEARCH, home: 'src/integrations/connectors/company-search.ts', tested_in: 'test/assessment/funnel-stages.test.ts' }),
  switchEntry({ id: 'integrations.COMPANY_TYPE_FROM_REGISTER', title: 'Take the company type from Companies House', approver: 'Lakhbir', approval: OFF,
    settings: COMPANY_TYPE_FROM_REGISTER, home: 'src/integrations/connectors/company-search.ts', tested_in: 'test/claims/tax-readings.test.ts' }),
  switchEntry({ id: 'integrations.HOMEDATA_DIMENSIONS', title: 'Use Homedata\'s estimate of the floor area', approver: 'the surveyor', approval: OFF,
    settings: HOMEDATA_DIMENSIONS, home: 'src/integrations/connectors/homedata.ts', tested_in: 'test/survey/surveyor-workbench.test.ts' }),
  ...mapEntries({ prefix: 'integrations.REGISTER_SWITCHES', map: REGISTER_SWITCHES, title: (k) => `The ${k} register lookup`,
    approver: 'the data protection officer', approval: (on) => (on ? 'Switched on.' : OFF),
    home: 'src/integrations/connectors/registers.ts', tested_in: 'test/claims/register-research-sources.test.ts' }),
  ...mapEntries({ prefix: 'integrations.CLAUDE_SWITCHES', map: CLAUDE_SWITCHES as unknown as Readonly<Record<string, boolean>>,
    title: (k) => (k === 'DOCUMENT_READING' ? 'Claude reads the documents a client uploads' : 'Claude reads scanned pages'),
    approver: 'the data protection officer', approval: (on) => (on ? 'Switched on.' : OFF),
    home: 'src/integrations/connectors/claude.ts', tested_in: 'test/claims/upload-reading-steps.test.ts' }),
]);

/** The outside services' rules, and every area's below them. */
export function rulesThroughIntegrations(): readonly RuleEntry[] { return [...rulesThroughCore(), ...INTEGRATIONS_RULES]; }
