/**
 * WHAT THE CLAIMS ASK THE PUBLIC SITE, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts):
 * whether the closed-enquiry clean-up is switched on, which a claim's case stamp records. Loaded last by the public
 * site's front door.
 */
import { setStampedSwitch } from '../claims/index.ts';
import { ENQUIRY_RETENTION } from './enquiry-retention.ts';

setStampedSwitch('ENQUIRY_RETENTION', () => ENQUIRY_RETENTION.enabled);
