/**
 * WHAT THE CLIENT RECORD ASKS THE SURVEY, handed in to the port it owns (src/modules/clients/walkthrough-port.ts) as the
 * survey's front door loads (Phase 161l2): whether a booking is a survey walk-through. The statement is the survey's
 * own (data.ts), text unchanged from the client record's borrowed file.
 */
import { setWalkthroughBookingReader } from '../clients/index.ts';
import { getSurveyWalkthroughsXByBookingId } from './data.ts';

setWalkthroughBookingReader((db, booking_id) => getSurveyWalkthroughsXByBookingId(db, [booking_id]) !== undefined);
