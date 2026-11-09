/**
 * FINANCE'S PARTS OF THE BACK OFFICE'S MENU (src/core/navigation.ts, provideNav): the core names no module, so each module
 * hands the menu its own gates and counts. Loaded last by the front door, as it reaches the module's own files.
 */
import { provideNav } from '../../core/index.ts';
import { billingViewFor, clientsAreaGate } from './billing.ts';
import { assertFinanceSection } from './finance.ts';

provideNav({ gates: { clients: clientsAreaGate, finance: assertFinanceSection }, billingViewFor: (actor) => billingViewFor(actor) });
