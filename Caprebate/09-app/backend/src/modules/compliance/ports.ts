/**
 * WHAT THE MODULES BELOW COMPLIANCE ASK IT, HANDED IN TO THE PORTS THEY OWN (Phase 161l2; 09-app/docs/ARCHITECTURE.md
 * rule 2): the terms' current versions and the tick that says they were read, which the assessment's sign-up asks
 * (src/modules/assessment/signup-port.ts). Each is compliance's own function, unchanged. Loaded last by compliance's
 * front door; nothing asks a port while files load.
 */
import { setTermsParts } from '../assessment/index.ts';
import { agreementTick, currentTermsVersions } from './legal-approvals.ts';

setTermsParts({ currentTermsVersions, agreementTick });
