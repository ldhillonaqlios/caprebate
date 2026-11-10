/**
 * WHAT THE MODULES BELOW THE PORTAL ASK IT, HANDED IN TO THE PORTS THEY OWN (Phase 161l2; 09-app/docs/ARCHITECTURE.md
 * rule 2): the client sign-up the assessment offers at its end (src/modules/assessment/signup-port.ts), and the
 * accountant's own confirmations the CRM's claim page and Reports gate read (src/modules/crm/accountant-port.ts). Each
 * is the portal's own function, unchanged. Loaded last by the portal's front door; nothing asks a port while files load.
 */
import { setSignupParts } from '../assessment/index.ts';
import { setAccountantConfirmations } from '../crm/index.ts';
import { accountantConfirmBlock } from './accountant-confirm-pages.ts';
import { accountantFitNeed } from './accountant-confirm.ts';
import { confirmSignup, MIN_PASSWORD, offerSignup, requestSignup, verifyOpen } from './signup.ts';

setSignupParts({
  offerSignup, requestSignup, verifyOpen, confirmSignup, MIN_PASSWORD,
});

setAccountantConfirmations({ accountantFitNeed, accountantConfirmBlock });
