/**
 * THE CRM'S PARTS OF THE BACK OFFICE'S MENU (src/core/navigation.ts, provideNav): the core names no module, so each module
 * hands the menu its own gates and counts. Loaded last by the front door, as it reaches the module's own files.
 */
import { provideNav } from '../../core/index.ts';
import { assertIntroducerSection, rewardModelGate } from './introducers.ts';
import { assertLeadSection } from './leads.ts';
import { unreadCount } from './messages.ts';
import { pipelineBoardGate } from './crm.permissions.ts';
import { searchGate } from './search.ts';
import { mayCreateTask, myWork, nextActionsGate } from './tasks.ts';

provideNav({
  gates: {
    search: searchGate, leads: assertLeadSection, pipeline: pipelineBoardGate, introducers: assertIntroducerSection,
    'introducer-rewards': rewardModelGate, 'next-actions': nextActionsGate,
  },
  mayCreateTask, myWork, unreadCount,
});
