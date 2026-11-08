/**
 * WHO MAY SEE OR DO WHAT IN THE DOCUMENT CENTRE — the gates of the centre and of the document types, who may write a
 * type, who may answer a name question before a document exists, and which links on a document's page a login may open.
 *
 * Kept apart from the rules in src/modules/claims/documents.ts so a change to who may do something is made in one small
 * file. Every view and write there still authorises on its own document as well.
 */
import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor, type Obj } from '../../core/index.ts';
import type { DocObj, LinkView, TypeRow } from './documents.ts';
import { getClaimsBusinessIdById, getPropertiesBusinessIdById } from './data.ts';
import { listSurveyorJobsSurveyorIdByBusinessIdSurveyorId2, listSurveyorJobsSurveyorIdByClaimIdSurveyorId } from './data-borrowed.ts';

/** The sentinel objects the section gates ask about: the document types, and the centre itself. */
export const TYPES_OBJ: Obj = { type: 'document_type', id: '__document_types__' };

export const CENTRE_OBJ: DocObj = {
  type: 'document', id: '__document_centre__', business_id: '__document_centre__', readers: 'CLAIM_TEAM', carries_value: true,
  letter_signed: false, assigned_surveyor_ids: [],
};

export function mayWriteTypes(actor: Actor): boolean {
  return can(actor, 'document_type.write', TYPES_OBJ);
}

/** May this login answer the question about a name, for a document of this type that does not exist yet? */
export function mayVouchFor(actor: Actor, business_id: string, t: TypeRow): boolean {
  return can(actor, 'document.vouch', {
    type: 'document', id: '__new__', business_id, readers: t.readers, carries_value: t.carries_value === 1,
    letter_signed: false, assigned_surveyor_ids: [],
  });
}

/** A link on a document's page is a live link only for staff who may open what it points at. */
export function staffMayOpen(db: Db, actor: Actor, k: LinkView): boolean {
  if (actor.role === 'CLIENT') return false;
  const id = (k.href ?? '').split('/').pop() ?? '';
  if (k.to === 'claim') {
    const c = getClaimsBusinessIdById<{ business_id: string }>(db, [id]);
    if (c === undefined) return false;
    const surveyors = listSurveyorJobsSurveyorIdByClaimIdSurveyorId<{ surveyor_id: string }>(db, [id]).map((r) => r.surveyor_id);
    return can(actor, 'claim.read', { type: 'claim', id, business_id: c.business_id, assigned_surveyor_ids: surveyors });
  }
  const p = getPropertiesBusinessIdById<{ business_id: string }>(db, [id]);
  if (p === undefined) return false;
  const surveyors = listSurveyorJobsSurveyorIdByBusinessIdSurveyorId2<{ surveyor_id: string }>(db, [p.business_id]).map((r) => r.surveyor_id);
  return can(actor, 'property.read', { type: 'property', id, business_id: p.business_id, assigned_surveyor_ids: surveyors });
}

/**
 * THE GATE OF THE DOCUMENT CENTRE, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function documentCentreGate(actor: Actor): void {
  authorise(actor, 'document_centre.enter', CENTRE_OBJ);
}

/**
 * THE GATE OF THE DOCUMENT TYPES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function documentTypesGate(actor: Actor): void {
  authorise(actor, 'document_type.read', TYPES_OBJ);
}
