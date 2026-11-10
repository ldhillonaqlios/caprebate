/**
 * WHAT THE CLAIMS ASK COMPLIANCE, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts):
 * whether the disclosure log is switched on, which a claim's case stamp records. Loaded last by compliance's front door.
 */
import { setStampedSwitch } from '../claims/index.ts';
import { DISCLOSURE_LOG } from './disclosure-log.ts';

setStampedSwitch('DISCLOSURE_LOG', () => DISCLOSURE_LOG.enabled);
