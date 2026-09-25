/**
 * THE SITE AREA'S SCREEN: A POINT AND A NEIGHBOURING COUNCIL, ENTERED BY A PERSON ON THE PROPERTY PAGE. Phase 151c,
 * 25 September 2026.
 *
 * The site area is worked out from HM Land Registry's land boundary at one point on the site (src/connectors/
 * site-area.ts). The point can come from the paid address lookup (Homedata's own easting and northing). Where it did
 * not, or where it is wrong, a person enters it here: a British National Grid easting and northing, in metres, read
 * off a map. And where a site sits on the line between two councils, HM Land Registry puts its polygon in both
 * councils' files — so a person can add the neighbouring council, and both files are read.
 *
 * WHO. Admin or Sales — `property.write`, the right to change the property — and ONLY ONCE THE ENGAGEMENT LETTER IS
 * SIGNED, asserted on the server against the signature record (`assertSignedEngagement`), never on anything the page
 * sent. The research run that uses these is itself after signing.
 *
 * KEPT WITH WHO AND WHEN (migration 052, site_area_inputs, append-only) and AUDITED (SITE_POINT_ENTERED,
 * SITE_COUNCIL_ADDED). The research run passes both on (src/web/site-area-run.ts): the latest point is used before
 * Homedata's, and every council added is read beside the postcode's own.
 *
 * NOTHING HERE LOOKS ANYTHING UP. Saving a point sends nothing anywhere; the land boundary is read only by "Run the
 * research", and that is switched off.
 */
import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import { pointInBritishNationalGrid, councilOfPostcode, homedataPointOf } from '../connectors/site-area.ts';
import { INSPIRE_COUNCILS, inspireFileForLad } from '../connectors/inspire-councils.ts';
import { assertSignedEngagement } from './research.ts';
import { enteredCouncils, enteredPoint } from './site-area-run.ts';
import { postcodeStore } from './postcode.ts';
import type { PostcodeStore } from './postcode-port.ts';

export type SiteInputDeps = { readonly db: Db; readonly audit: AuditLog; readonly now: () => string; readonly newId: () => string };
export type SiteInputResult = { readonly ok: true } | { readonly ok: false; readonly why: string };

type PropertyRef = { readonly id: string; readonly business_id: string; readonly postcode: string | null };

function propertyOf(db: Db, property_id: string): PropertyRef | null {
  return db.get<PropertyRef>('SELECT id, business_id, postcode FROM properties WHERE id = ?', [property_id]) ?? null;
}

const writeObj = (p: PropertyRef) => ({ type: 'property' as const, id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] as string[] });

const NOT_SIGNED = 'You can enter this once the engagement letter is signed.';

/** Admin or Sales, on this property, and the letter signed — all asked on the server. A refusal of the right throws. */
function mayEnter(db: Db, actor: Actor, p: PropertyRef): SiteInputResult {
  authorise(actor, 'property.write', writeObj(p));
  const e = assertSignedEngagement(db, p.business_id);
  return e.signed === true ? { ok: true } : { ok: false, why: `${NOT_SIGNED} Right now ${e.why}.` };
}

/** "520 050", "520,050" and "520050.5" are all 520050(.5). Anything else is not a number of metres. */
export function metres(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const t = v.replace(/[\s,]/g, '');
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(t)) return null;
  return Number(t);
}

/** Saves the point a person read off a map. Refused, in words, unless both figures are metres inside the grid. */
export function enterSitePoint(d: SiteInputDeps, actor: Actor, property_id: string, form: { readonly easting?: string | null; readonly northing?: string | null }): SiteInputResult {
  const p = propertyOf(d.db, property_id);
  if (p === null) return { ok: false, why: 'We could not find that property.' };
  const may = mayEnter(d.db, actor, p);
  if (!may.ok) return may;
  const easting = metres(form.easting); const northing = metres(form.northing);
  if (easting === null || northing === null) {
    return { ok: false, why: 'Type the easting and the northing as whole metres, for example 520050 and 180050. Nothing was saved.' };
  }
  const check = pointInBritishNationalGrid({ easting, northing }, null);
  if (!check.ok) return { ok: false, why: `${check.why} Nothing was saved.` };
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      "INSERT INTO site_area_inputs (id, business_id, property_id, kind, easting, northing, lad_code, entered_by, entered_at) VALUES (?, ?, ?, 'POINT', ?, ?, NULL, ?, ?)",
      [d.newId(), p.business_id, p.id, easting, northing, actor.id, at],
    );
  });
  d.audit.append({
    at, kind: 'SITE_POINT_ENTERED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'property', object_id: p.id, detail: { business: p.business_id },
  });
  return { ok: true };
}

/** Adds a neighbouring council whose land boundary file is read too. It must be one of HM Land Registry's files. */
export function addNeighbourCouncil(
  d: SiteInputDeps, actor: Actor, property_id: string, lad_code: string | null | undefined, store: PostcodeStore | null = postcodeStore(),
): SiteInputResult {
  const p = propertyOf(d.db, property_id);
  if (p === null) return { ok: false, why: 'We could not find that property.' };
  const may = mayEnter(d.db, actor, p);
  if (!may.ok) return may;
  const c = inspireFileForLad(lad_code);
  if (!c.ok) return { ok: false, why: `${c.why} Nothing was saved.` };
  const own = councilOfPostcode(p.postcode, store);
  if (own.ok && own.lad_code === c.lad_code) return { ok: false, why: `${c.council} is already read: it is the council of the property's postcode. Nothing was saved.` };
  if (enteredCouncils(d.db, p.id).some((x) => x.lad_code === c.lad_code)) return { ok: false, why: `${c.council} is already added. Nothing was saved.` };
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      "INSERT INTO site_area_inputs (id, business_id, property_id, kind, easting, northing, lad_code, entered_by, entered_at) VALUES (?, ?, ?, 'NEIGHBOUR_COUNCIL', NULL, NULL, ?, ?, ?)",
      [d.newId(), p.business_id, p.id, c.lad_code, actor.id, at],
    );
  });
  d.audit.append({
    at, kind: 'SITE_COUNCIL_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'property', object_id: p.id, detail: { business: p.business_id, lad_code: c.lad_code },
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ what the property page shows */

export type SitePointView = {
  /** The point a person entered, with who and when; null when nobody has. */
  readonly point: { readonly easting: number; readonly northing: number; readonly by: string; readonly at: string } | null;
  /** Whether the paid address lookup gave the property a point, used when nobody has entered one. */
  readonly homedata_point: boolean;
  /** The postcode's own council, by name, or why it is not known. */
  readonly own_council: { readonly name: string } | { readonly why: string };
  readonly councils: readonly { readonly name: string; readonly by: string; readonly at: string }[];
  /** Whether this person may use the two forms now. */
  readonly may_enter: boolean;
  /** Why not, when they hold the right but the letter is not signed; null otherwise. */
  readonly why_not: string | null;
  /** Every council HM Land Registry publishes a file for, by name, for the form's list. */
  readonly choices: readonly { readonly lad_code: string; readonly name: string }[];
};

function nameOf(db: Db, user_id: string): string {
  return db.get<{ display_name: string | null }>('SELECT display_name FROM users WHERE id = ?', [user_id])?.display_name ?? 'a member of staff';
}

/** The block's view. Anyone who may read the property reads it; only Admin or Sales, after signing, gets the forms. */
export function sitePointView(db: Db, actor: Actor, property_id: string, store: PostcodeStore | null = postcodeStore()): SitePointView | null {
  const p = propertyOf(db, property_id);
  if (p === null) return null;
  const point = enteredPoint(db, p.id);
  const own = councilOfPostcode(p.postcode, store);
  const writes = can(actor, 'property.write', writeObj(p));
  const signed = writes && assertSignedEngagement(db, p.business_id).signed === true;
  const hd = homedataPointOf(db, p.business_id, p.id);
  return {
    point: point === null ? null : { easting: point.easting, northing: point.northing, by: nameOf(db, point.entered_by), at: point.entered_at },
    homedata_point: hd !== null && 'easting' in hd,
    own_council: own.ok ? { name: INSPIRE_COUNCILS.find((c) => c.lad_code === own.lad_code)?.ons_name ?? own.lad_code } : { why: own.why },
    councils: enteredCouncils(db, p.id).map((c) => ({
      name: INSPIRE_COUNCILS.find((x) => x.lad_code === c.lad_code)?.ons_name ?? c.lad_code, by: nameOf(db, c.entered_by), at: c.entered_at,
    })),
    may_enter: writes && signed,
    why_not: writes && !signed ? NOT_SIGNED : null,
    choices: [...INSPIRE_COUNCILS].map((c) => ({ lad_code: c.lad_code, name: c.ons_name })).sort((a, b) => a.name.localeCompare(b.name, 'en-GB')),
  };
}
