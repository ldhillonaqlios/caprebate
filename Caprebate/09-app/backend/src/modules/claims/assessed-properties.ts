/**
 * THE CLAIMS' WRITES FOR A SUBMITTED ASSESSMENT, HANDED IN TO THE PORT THE ASSESSMENT OWNS (Phase 161l2;
 * src/modules/assessment/property-writer.ts). Each building the client told us about is kept as a property, and what
 * happened to it as its events, by this module's own statement and function, unchanged. Loaded by the claims' front
 * door; nothing asks the port while files load.
 */
import { setAssessedPropertyWriter } from '../assessment/index.ts';
import { insertProperties } from './data.ts';
import { writeAssessmentEvents } from './property-events.ts';

setAssessedPropertyWriter({
  writeProperty: (db, p) => {
    insertProperties(db, [p.id, p.business_id, p.label, p.postcode, p.address_line_1, p.town, p.uprn, p.at, p.at,
      p.claimant_role, p.claimant_role_source, p.council_area, p.council_area_source]);
  },
  writeEvents: writeAssessmentEvents,
});
