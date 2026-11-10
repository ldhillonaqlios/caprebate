/**
 * THE CLIENT RECORD'S VOCABULARIES AND SMALL READINGS (Phase 161l1, carved from src/modules/crm/crm.ts unchanged): the
 * claimant types, the jurisdictions, the workstreams, the roles a previous owner may be recorded as, and whether a
 * contact can be reached. Plain values and pure functions, read by the CRM's screens and by the modules below it.
 */

type Vocab = Readonly<Record<string, string>>;

/** A form's fields as posted: absent keys are untouched, `null` clears. */
export type Fields = Readonly<Record<string, string | null>>;

/** Tax Implication Summary variants and the AML/KYC Position Paper §5. */
export const CLAIMANT_TYPES: Vocab = Object.freeze({
  COMPANY: 'Limited company',
  LLP: 'Limited liability partnership',
  PARTNERSHIP: 'Partnership',
  SOLE_TRADER: 'Sole trader',
  INDIVIDUAL: 'An individual holding the property personally',
  CHARITY: 'Charity',
  // Which kind of charity decides which tax return it files, and so its deadline.
  CHARITY_COMPANY: 'Charitable company (files a company tax return)',
  CHARITABLE_TRUST: 'Charitable trust (files a trust tax return)',
  UNKNOWN: 'Not known',
});

export const JURISDICTIONS: Vocab = Object.freeze({
  england: 'England', wales: 'Wales', scotland: 'Scotland', northern_ireland: 'Northern Ireland',
});

/** The rulebooks' reliefs: Registers A and D; Register I §4 and F; Register H. */
export const WORKSTREAMS: Vocab = Object.freeze({
  PLANT_AND_MACHINERY: 'Plant and machinery',
  STRUCTURES_AND_BUILDINGS: 'Structures and buildings',
  LAND_REMEDIATION: 'Land remediation',
  UNKNOWN: 'Not yet known',
});

/**
 * THE ROLES A PREVIOUS OWNER OR AN OCCUPIER MAY BE RECORDED AS, where it is not
 * a company. N2: a person is never named on a property. Where the previous owner
 * WAS a person, that fact is recorded as INDIVIDUAL_NOT_RECORDED and nothing
 * more — their identity, if it is ever needed, belongs in the identity store.
 */
export const OWNER_ROLE_TOKENS: Vocab = Object.freeze({
  INDIVIDUAL_NOT_RECORDED: 'An individual — not named here',
  DEVELOPER: 'A developer',
  LOCAL_AUTHORITY: 'A local authority',
  NHS_BODY: 'An NHS body',
  HOUSING_ASSOCIATION: 'A housing association',
  CHARITY: 'A charity',
  PUBLIC_BODY: 'Another public body',
  UNKNOWN: 'Not known',
});

/**
 * A COMPANY DESIGNATION AT THE END OF A NAME. A registered company is required
 * to carry one (Limited, LLP, plc, CIC, and their Welsh forms); a person's name
 * does not. That is the whole test and it is deliberately a refusal rather than
 * a guess: a value that is neither a designated company name nor a role token
 * is refused, so the store cannot be talked into holding a person's name.
 */
const COMPANY_DESIGNATION =
  /(?:^|\s)(?:limited|ltd\.?|llp|l\.l\.p\.|plc|p\.l\.c\.|cic|c\.i\.c\.|community interest company|cyfyngedig|cyf\.?|ccc|c\.c\.c\.|unlimited|nhs foundation trust|nhs trust|council)$/i;

export function isCompanyOrRoleToken(raw: string): boolean {
  const v = raw.trim();
  if (v === '') return false;
  if (Object.hasOwn(OWNER_ROLE_TOKENS, v)) return true;
  return v.length >= 4 && COMPANY_DESIGNATION.test(v);
}

/** Whether a contact has an email address or a telephone number. Blank is not a value. */
export function isReachable(c: { readonly email: string | null; readonly phone: string | null }): boolean {
  return (c.email ?? '').trim() !== '' || (c.phone ?? '').trim() !== '';
}
