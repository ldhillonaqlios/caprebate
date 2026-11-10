/**
 * WHERE A SUBMITTED ASSESSMENT PUTS EACH BUILDING (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2). The assessment's
 * submit opens the organisation, and each building the client told us about becomes a property, with what happened to
 * it in order. The properties and their events are the claims' tables, and the claims sit above the assessment, so the
 * assessment may not import them. So this is A PORT THE ASSESSMENT OWNS: the claims hand their own two writes in as
 * their front door loads (src/modules/claims/assessed-properties.ts), unchanged, and the submit asks here, inside its
 * transaction. Asked before it is handed in, it refuses, and the whole submission is undone with it: nothing is saved
 * half way. Asked only while code runs, never while files load. Declared with `var`, so a hand-in that comes while this
 * file is still loading is kept.
 */
import type { Db } from '../../core/index.ts';

/** One building as the assessment heard it, ready to be kept as a property of the new organisation. */
export type AssessedProperty = {
  readonly id: string;
  readonly business_id: string;
  readonly label: string;
  readonly postcode: string | null;
  readonly address_line_1: string | null;
  readonly town: string | null;
  readonly uprn: string | null;
  readonly at: string;
  readonly claimant_role: string | null;
  readonly claimant_role_source: string | null;
  readonly council_area: string | null;
  readonly council_area_source: string | null;
};

/** One event the funnel gathered for a building (CB_FUNNEL.eventsOf), as it gives them. */
export type AssessedEvent = { type?: unknown; cost?: unknown; cost_unknown?: unknown; date?: unknown; date_unknown?: unknown };

export type AssessedPropertyWriter = {
  /** Keeps one building as a property. */
  readonly writeProperty: (db: Db, p: AssessedProperty) => void;
  /** Keeps what happened to one building, in order; returns how many events were kept. */
  readonly writeEvents: (
    db: Db, newId: () => string,
    p: { property_id: string; business_id: string; assessment_id: string; at: string },
    events: readonly AssessedEvent[],
  ) => number;
};

var writer: AssessedPropertyWriter | undefined;

/** Handed in by the claims as their front door loads. */
export function setAssessedPropertyWriter(w: AssessedPropertyWriter): void { writer = w; }

/** The claims' writes, for the submit. Refuses when the claims have not handed them in. */
export function assessedPropertyWriter(): AssessedPropertyWriter {
  if (writer === undefined) throw new Error('Keeping the buildings is not set up. The claims set it up when they load, so the assessment was not saved.');
  return writer;
}
