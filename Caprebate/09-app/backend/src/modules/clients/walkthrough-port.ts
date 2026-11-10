/**
 * WHAT THE CLIENT RECORD ASKS THE SURVEY (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2). Whether a video call is a
 * survey walk-through (the survey's survey_walkthroughs), so the call is recorded for the surveyor to watch
 * (src/modules/clients/video-calls.ts). The survey sits above the client record, so it never imports it: it owns this
 * port, and the survey's front door fills it as it loads (src/modules/survey/client-ports.ts). Asked while a request
 * runs, never while files load (reading it through the survey's door from video-calls.ts looped while the doors loaded:
 * Phases 161l and 161l1).
 */
import type { Db } from '../../core/index.ts';

type WalkthroughReader = (db: Db, booking_id: string) => boolean;
var walkthrough: WalkthroughReader | undefined;
export function setWalkthroughBookingReader(read: WalkthroughReader): void { walkthrough = read; }
/** Whether the booking is a survey walk-through. Fails loudly when the survey has not handed in its reader. */
export function isSurveyWalkthrough(db: Db, booking_id: string): boolean {
  if (walkthrough === undefined) throw new Error('Whether a call is a survey walk-through is not set up. The survey sets it up when it loads, so the call was not arranged.');
  return walkthrough(db, booking_id);
}
