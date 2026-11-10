/**
 * THE CLIENT RECORD'S RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 * Its four switches keep their words where their code lives; this pins each one's position and period.
 */
import { defineRules, switchEntry, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughIntegrations } from '../../../integrations/index.ts';
import { CLIENT_SHARE_GIVE, REFERRAL_FORM } from '../introducers.ts';
import { MESSAGE_RETENTION } from '../message-retention.ts';
import { ENQUIRY_RETENTION } from '../enquiry-retention.ts';

export const CLIENTS_RULES: readonly RuleEntry[] = defineRules('clients', [
  switchEntry({ id: 'clients.REFERRAL_FORM', title: 'The public form a firm uses to refer a client', approver: 'the data protection officer',
    approval: 'Not approved yet: built and switched off until the privacy notice is published and linked from the form.',
    settings: REFERRAL_FORM, home: 'src/modules/clients/introducers.ts', tested_in: 'test/crm/introducers.test.ts' }),
  switchEntry({ id: 'clients.CLIENT_SHARE_GIVE', title: 'A client says in their portal whether their firm may see how the claim is going', approver: 'Lakhbir',
    approval: 'On: answered by Lakhbir; nothing is shared without the client\'s yes.',
    settings: CLIENT_SHARE_GIVE, home: 'src/modules/clients/introducers.ts', tested_in: 'test/compliance/compliance-registers.test.ts' }),
  switchEntry({ id: 'clients.MESSAGE_RETENTION', title: 'Client messages are deleted after seven years', approver: 'the data protection officer',
    approval: 'On at Lakhbir\'s answer (22 Sep 2026); the officer\'s approval is still asked for.',
    settings: MESSAGE_RETENTION, home: 'src/modules/clients/message-retention.ts', tested_in: 'test/crm/chat-cleanup-job.test.ts' }),
  switchEntry({ id: 'clients.ENQUIRY_RETENTION', title: 'A closed website enquiry is deleted after twelve months', approver: 'the data protection officer',
    approval: 'Not approved yet: built and switched off, with twelve months written in.',
    settings: ENQUIRY_RETENTION, home: 'src/modules/clients/enquiry-retention.ts', tested_in: 'test/compliance/data-protection-readings.test.ts' }),
]);

/** The client record's rules, and every area's below it. */
export function rulesThroughClients(): readonly RuleEntry[] { return [...rulesThroughIntegrations(), ...CLIENTS_RULES]; }
