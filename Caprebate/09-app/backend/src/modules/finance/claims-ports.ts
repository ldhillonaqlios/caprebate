/**
 * WHAT THE CLAIMS ASK FINANCE, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts): the
 * claim's sent fee invoice and its number. This module's own read, unchanged. Loaded last by finance's front door.
 */
import { setFinanceAsked } from '../claims/index.ts';
import { getInvoiceNumbersSeqByInvoiceIdKind } from './data.ts';

setFinanceAsked({ getInvoiceNumbersSeqByInvoiceIdKind });
