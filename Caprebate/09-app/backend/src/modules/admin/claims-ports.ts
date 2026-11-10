/**
 * WHAT THE CLAIMS ASK ADMIN, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts): the
 * document types' names. This module's own reads, unchanged. Loaded last by admin's front door.
 */
import { setAdminAsked } from '../claims/index.ts';
import { getDocumentTypesLabelByCode, listDocumentTypesCodeLabel } from './data.ts';

setAdminAsked({ listDocumentTypesCodeLabel, getDocumentTypesLabelByCode });
