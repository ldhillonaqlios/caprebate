/**
 * WHO CLAIMS, AND WHAT THE REGISTERS ALREADY SAY — PHASE 159g, 10 October 2026.
 *
 * The stress test of 9 October 2026 (the Lockwood Surgery live run, L2, L8 and L11; the coverage matrix 2.4, 2.5, 3.1
 * and 3.6). The live run picked a dormant company as the owner, and the registers held a real sale price and tenure
 * that nobody read. This file reads what the registers already hold, and says it where a person decides:
 *
 *   · the company on the register — its status, its latest accounts' type (a DORMANT company has no tax to relieve:
 *     no trade and no property business, CAA 2001 ss.11 and 15), and its accounting year end (L8);
 *   · how the client holds the building — owns and works from it, owns and lets it, or rents it — which decides whose
 *     claim it is: a landlord's (a property business is a qualifying activity, s.15(1)(b) to (d)) or a tenant's;
 *   · Price Paid's sale at the address (L11): a category B sale ("additional price paid": a sale to a company, a
 *     buy-to-let, a repossession) or one of type "Other" is a LEAD for the surveyor to confirm, never the price;
 *   · the tenure, a lease's end and the landlord, filled from the title check, Price Paid or the client, with the source;
 *   · a site area far larger than the building, flagged for the surveyor and never used as the plot;
 *   · a person named as owner on the title register, matched against the client's own people (item 6).
 *
 * N4 throughout: a fact not known is not known. Nothing here turns an absent answer into a yes, a no or a figure.
 * OUR READING, built and put as viability checks in the Word questions document: that a landlord letting a healthcare
 * building has a qualifying activity and is a client (263, the tax adviser); that the register's accounting year end is
 * the claim's (264, the accountant); that a category B or "Other" sale is a lead, not a price, and that a site ten times
 * the building is the warning point (265-266, the surveyor); and the owner-name check that keeps no name (267, the DPO).
 *
 * This file imports nothing from claim-facts.ts, which imports from here.
 */
import type { Db } from '../db.ts';
import { isDormant, DORMANT_WORDS } from '../connectors/companies-house.ts';

const json = (s: string | null | undefined): Record<string, unknown> => {
  if (typeof s !== 'string') return {};
  try { const v = JSON.parse(s) as unknown; return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
};
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/* ================================================================== *
 * 1 · THE COMPANY ON THE REGISTER (L2, L8)
 * ================================================================== */

export type RegisterCompany = {
  readonly number: string | null;
  readonly status: string | null;
  readonly accounts_type: string | null;
  readonly accounts_made_up_to: string | null;
  /** The accounting reference date, "MM-DD", as the register holds it. */
  readonly year_end: { readonly month: number; readonly day: number } | null;
  readonly dormant: boolean;
  readonly obtained_at: string;
};

/** The newest Companies House record held for this client, or null. */
export function registerCompany(db: Db, business_id: string): RegisterCompany | null {
  const r = db.get<{ fields_json: string; obtained_at: string }>(
    "SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY' ORDER BY obtained_at DESC, id DESC LIMIT 1",
    [business_id]);
  if (r === undefined) return null;
  const f = json(r.fields_json);
  const ye = text(f['accounts_year_end']);
  const m = ye === null ? null : /^(\d{2})-(\d{2})$/.exec(ye);
  const month = m === null ? NaN : Number(m[1]), day = m === null ? NaN : Number(m[2]);
  const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1
    && day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
  return {
    number: text(f['company_number']), status: text(f['company_status']),
    accounts_type: text(f['accounts_type']), accounts_made_up_to: text(f['accounts_made_up_to']),
    year_end: valid ? { month, day } : null, dormant: isDormant(f['accounts_type']), obtained_at: r.obtained_at,
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const yearEndWords = (ye: { month: number; day: number }): string => `${String(ye.day)} ${MONTH_NAMES[ye.month - 1] ?? ''}`;

export type YearEndReading = {
  /** The year end the claim uses: the register's for a company that has one, else the client's checked answer. */
  readonly used: { readonly month: number; readonly day: number } | null;
  readonly from: 'REGISTER' | 'CLIENT' | null;
  readonly client: { readonly month: number; readonly day: number } | null;
  readonly register: { readonly month: number; readonly day: number } | null;
  /** Both are known and they are not the same day. */
  readonly differs: boolean;
  readonly words: string;
};

/**
 * THE CLAIM'S YEAR END (L8). Companies House gave Lockwood's year end as 31 May; the run's year end was 31 March and
 * nothing compared the two. A company's accounts are made up to its accounting reference date, so where the register
 * holds one it is the claim's year end; the client's checked answer is compared with it, and a difference is said
 * plainly for a person to settle (a company that has just moved its year end, or a wrong answer). With no register
 * record, the client's checked answer stands alone, as before. Neither known: not known.
 */
export function yearEndFrom(client: { month: number; day: number } | null, reg: RegisterCompany | null): YearEndReading {
  const register = reg?.year_end ?? null;
  const differs = client !== null && register !== null && (client.month !== register.month || client.day !== register.day);
  if (register !== null) {
    return {
      used: register, from: 'REGISTER', client, register, differs,
      words: differs
        ? `Companies House gives the year end as ${yearEndWords(register)}, but the client said ${yearEndWords(client as { month: number; day: number })}. We use Companies House’s. Check with the client: if the company has moved its year end, record the period on the claim.`
        : `${yearEndWords(register)}, from Companies House${client !== null ? ', and the client said the same' : ''}.`,
    };
  }
  if (client !== null) return { used: client, from: 'CLIENT', client, register: null, differs: false, words: `${yearEndWords(client)}, the client’s own answer, checked.` };
  return { used: null, from: null, client: null, register: null, differs: false, words: 'Not known: the client has not given a year end and Companies House has not been read.' };
}

/** The dormant warning for a client, or null. */
export function dormantWarning(db: Db, business_id: string): string | null {
  const r = registerCompany(db, business_id);
  return r !== null && r.dormant ? `${DORMANT_WORDS}${r.accounts_made_up_to === null ? '' : ` (accounts made up to ${r.accounts_made_up_to})`}` : null;
}

/* ================================================================== *
 * 2 · HOW THE CLIENT HOLDS THE BUILDING — WHOSE CLAIM IT IS (item 2)
 * ================================================================== */

export type ClaimantRole = 'OWNER_OCCUPIER' | 'LANDLORD' | 'TENANT';

/** The assessment's answer to "who uses the building?", onto the property's claimant role. "Not sure" is not known. */
export const USE_TO_ROLE: Readonly<Record<string, ClaimantRole>> = Object.freeze({ own_use: 'OWNER_OCCUPIER', let_out: 'LANDLORD', rented: 'TENANT' });

export const ROLE_WORDS: Readonly<Record<ClaimantRole, string>> = Object.freeze({
  OWNER_OCCUPIER: 'Owns the building and works from it: an owner’s claim, through its trade or profession.',
  LANDLORD: 'Owns the building and lets it to another business: a landlord’s claim, through its property business, on the fixtures it owns.',
  TENANT: 'Rents the building: a tenant’s claim, on the fixtures it paid for itself. The landlord’s fixtures are the landlord’s to claim.',
});

/** The short name of each role, for a table. */
export const ROLE_LABELS: Readonly<Record<ClaimantRole, string>> = Object.freeze({ OWNER_OCCUPIER: 'Owner who uses it', LANDLORD: 'Landlord (lets it out)', TENANT: 'Tenant (rents it)' });

export type RoleReading = { readonly role: ClaimantRole | null; readonly source: string | null; readonly words: string };

/** How the client holds this building, with where that came from. */
export function claimantRole(db: Db, property_id: string | null): RoleReading {
  if (property_id === null) return { role: null, source: null, words: 'Not known: no property is recorded.' };
  const p = db.get<{ claimant_role: string | null; claimant_role_source: string | null }>('SELECT claimant_role, claimant_role_source FROM properties WHERE id = ?', [property_id]);
  const role = p?.claimant_role === 'OWNER_OCCUPIER' || p?.claimant_role === 'LANDLORD' || p?.claimant_role === 'TENANT' ? p.claimant_role : null;
  if (role === null) return { role: null, source: null, words: 'Not known: ask who owns the building and who uses it.' };
  return { role, source: p?.claimant_role_source ?? null, words: ROLE_WORDS[role] };
}

/**
 * THE QUALIFYING-ACTIVITY CHECK, IN WORDS — what the records say, for the person answering the enquiry check (it is
 * still a person who answers it). A dormant company is said first; then how the client holds each building.
 */
export function qualifyingActivityEvidence(db: Db, business_id: string): string[] {
  const out: string[] = [];
  const reg = registerCompany(db, business_id);
  if (reg !== null) {
    const kind = reg.accounts_type === null ? 'accounts type not known' : `${reg.accounts_type.replace(/-/g, ' ')} accounts`;
    out.push(`Companies House: ${reg.status ?? 'status not known'}, ${kind}${reg.accounts_made_up_to === null ? '' : ` made up to ${reg.accounts_made_up_to}`}.`);
    if (reg.dormant) out.push(DORMANT_WORDS);
  }
  for (const p of db.all<{ id: string; label: string }>('SELECT id, label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [business_id])) {
    const r = claimantRole(db, p.id);
    out.push(`${p.label}: ${r.role === null ? r.words : `${ROLE_LABELS[r.role]}. ${r.words}`}${r.source === null ? '' : ` (${r.source})`}`);
  }
  return out;
}

/* ================================================================== *
 * 3 · PRICE PAID: A LEAD, NOT A PRICE (item 3, L11)
 * ================================================================== */

export type PricePaidSale = {
  readonly price: number; readonly date: string | null; readonly tenure: string | null;
  readonly type: string | null; readonly category: 'A' | 'B' | null;
  /** True where the sale is a lead for the surveyor to confirm, never the price. */
  readonly lead: boolean;
  readonly words: string;
};

/**
 * A SALE THAT IS ONLY A LEAD. Category B ("additional price paid": sales to companies, buy-to-lets, repossessions,
 * transfers) and type "Other" are not a standard residential sale at full value; and a category not stated is not
 * known to be one (N4). Each is shown to the surveyor to confirm and never stands as the price.
 */
export function isPricePaidLead(f: Record<string, unknown>): boolean {
  const cat = f['ppd_category'];
  const type = typeof f['property_type_ppd'] === 'string' ? (f['property_type_ppd'] as string).trim().toLowerCase() : null;
  return cat !== 'A' || type === 'other';
}

/** Price Paid's sale held for this property, read as a lead or a price. Null when none is held. */
export function pricePaidSale(db: Db, business_id: string, property_id: string): PricePaidSale | null {
  const r = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_PPD' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1",
    [business_id, property_id]);
  if (r === undefined) return null;
  const f = json(r.fields_json);
  const price = typeof f['price_paid'] === 'number' && Number.isFinite(f['price_paid']) && (f['price_paid'] as number) > 0 ? f['price_paid'] as number : null;
  if (price === null) return null;
  const cat = f['ppd_category'] === 'A' || f['ppd_category'] === 'B' ? f['ppd_category'] : null;
  const lead = isPricePaidLead(f);
  const date = text(f['transaction_date']);
  const tenure = text(f['tenure']);
  const type = text(f['property_type_ppd']);
  const sale = `HM Land Registry’s Price Paid holds a sale${date === null ? '' : ` on ${date}`} for £${price.toLocaleString('en-GB')}${tenure === null ? '' : `, ${tenure}`}${type === null ? '' : `, type “${type}”`}${cat === null ? '' : `, category ${cat}`}.`;
  return {
    price, date, tenure, type, category: cat, lead,
    words: lead
      ? `${sale} A lead to confirm, not the price: ${cat === 'B' ? 'a category B sale may be to a company, a buy-to-let or a transfer' : type?.toLowerCase() === 'other' ? 'a sale of type “Other” is not an ordinary home sale' : 'the sale’s category is not stated'}. Check it against the title register and the client’s completion statement.`
      : sale,
  };
}

/* ================================================================== *
 * 4 · TENURE, THE LEASE AND THE OCCUPIER, FILLED FROM THE REGISTERS (item 4)
 * ================================================================== */

export type TenureReading = {
  readonly tenure: 'FREEHOLD' | 'LEASEHOLD' | null;
  readonly source: string | null;
  readonly lease_end_date: string | null;
  readonly landlord: string | null;
  readonly role: RoleReading;
  readonly words: string;
};

/** The property's tenure, lease and how the client holds it — read by the route (159d) and the legal check (159h). */
export function propertyTenure(db: Db, property_id: string | null): TenureReading {
  const role = claimantRole(db, property_id);
  const p = property_id === null ? undefined : db.get<{ tenure: string | null; tenure_source: string | null; lease_end_date: string | null; landlord: string | null }>(
    'SELECT tenure, tenure_source, lease_end_date, landlord FROM properties WHERE id = ?', [property_id]);
  const tenure = p?.tenure === 'FREEHOLD' || p?.tenure === 'LEASEHOLD' ? p.tenure : null;
  const parts = [tenure === null ? 'Tenure not known' : `${tenure === 'FREEHOLD' ? 'Freehold' : 'Leasehold'}${p?.tenure_source ? ` (${p.tenure_source})` : ''}`];
  if (tenure === 'LEASEHOLD') parts.push(p?.lease_end_date ? `the lease ends on ${p.lease_end_date}` : 'when the lease ends is not known');
  if (p?.landlord) parts.push(`the landlord is ${p.landlord}`);
  return { tenure, source: tenure === null ? null : p?.tenure_source ?? null, lease_end_date: p?.lease_end_date ?? null, landlord: p?.landlord ?? null, role, words: `${parts.join('; ')}.` };
}

/**
 * FILL THE TENURE FROM THE REGISTERS where nobody has recorded one: the title check typed by hand first (an official
 * copy of the register), then Price Paid's sale. Never over a tenure already recorded. Returns what it wrote, or null.
 */
export function fillTenureFromRegisters(db: Db, property_id: string, now: string): { tenure: 'FREEHOLD' | 'LEASEHOLD'; source: string } | null {
  const p = db.get<{ business_id: string; tenure: string | null }>('SELECT business_id, tenure FROM properties WHERE id = ?', [property_id]);
  if (p === undefined || p.tenure === 'FREEHOLD' || p.tenure === 'LEASEHOLD') return null;
  for (const [source, words] of [['HMLR_TITLE', 'from the title register'], ['HMLR_PPD', 'from HM Land Registry’s Price Paid']] as const) {
    const r = db.get<{ fields_json: string }>(
      'SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1',
      [p.business_id, source, property_id]);
    const t = text(json(r?.fields_json)['tenure'])?.toLowerCase();
    if (t === 'freehold' || t === 'leasehold') {
      const tenure = t === 'freehold' ? 'FREEHOLD' : 'LEASEHOLD';
      db.run('UPDATE properties SET tenure = ?, tenure_source = ?, updated_at = ? WHERE id = ?', [tenure, words, now, property_id]);
      return { tenure, source: words };
    }
  }
  return null;
}

/* ================================================================== *
 * 5 · A SITE AREA FAR LARGER THAN THE BUILDING (item 5)
 * ================================================================== */

/** A site more than this many times the building's floor area is flagged (Lockwood: 8,170 m² against 266 m², 31 times). */
export const SITE_AREA_FLAG_RATIO = 10;

/** The building's floor area for the comparison: the energy certificate's, else the client's checked answer. */
export function floorAreaForSite(db: Db, business_id: string, property_id: string): number | null {
  const e = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'EPC' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1",
    [business_id, property_id]);
  const a = json(e?.fields_json)['epc_total_floor_area_m2'];
  return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : null;
}

/** The site area held for a property: HM Land Registry's land boundary first, else Homedata's title outline. */
export function siteAreaOf(db: Db, business_id: string, property_id: string): number | null {
  const r = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_INSPIRE' AND entity_id = ?", [business_id, `property:${property_id}`])
    ?? db.get<{ fields_json: string }>(
      "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HOMEDATA_BOUNDARY' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1",
      [business_id, property_id]);
  const a = json(r?.fields_json)['site_area_m2'];
  return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : null;
}

/** The flag, or null: a site area far larger than the building may cover more than its own plot. Never used as the plot. */
export function siteAreaFlag(site_m2: number | null, floor_m2: number | null): string | null {
  if (site_m2 === null || floor_m2 === null || !(site_m2 > 0) || !(floor_m2 > 0)) return null;
  if (site_m2 <= floor_m2 * SITE_AREA_FLAG_RATIO) return null;
  const times = Math.round(site_m2 / floor_m2);
  return `Check this: the site area (${Math.round(site_m2).toLocaleString('en-GB')} m²) is ${String(times)} times the building’s floor area (${Math.round(floor_m2).toLocaleString('en-GB')} m²). It may cover more than this building’s own plot. Surveyor: confirm the plot. This area is never used as the plot.`;
}

/* ================================================================== *
 * 6 · A PERSON NAMED AS OWNER, MATCHED AGAINST THE CLIENT'S OWN PEOPLE (item 6)
 * ================================================================== */

/** Claimant types whose owner can be a person: the register names the person, not a company. */
export const PERSONAL_CLAIMANTS: readonly string[] = ['SOLE_TRADER', 'PARTNERSHIP', 'INDIVIDUAL'];

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'sir', 'dame', 'rev']);

/** A name's words, lower case, without titles or punctuation. */
export function nameWords(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter((w) => w !== '' && !TITLES.has(w));
}

/** The same person, as far as a name can say: the same first name and the same surname (middle names ignored). */
export function sameName(a: string, b: string): boolean {
  const x = nameWords(a), y = nameWords(b);
  if (x.length < 2 || y.length < 2) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/**
 * IS THE PERSON THE REGISTER NAMES ONE OF THE CLIENT'S OWN PEOPLE? Asked in memory, and only the answer is kept — as
 * the officers check does (Word answer 156). A sole trader's or a partnership's building is registered to the people
 * themselves, so the company number cannot match it (src/web/claim-route.ts stillOwned).
 */
export function personIsClients(db: Db, business_id: string, registerName: string): boolean {
  return db.all<{ full_name: string }>('SELECT full_name FROM contacts WHERE business_id = ?', [business_id]).some((c) => sameName(c.full_name, registerName));
}

/**
 * THE TITLE REGISTER NAMES ONE OF THE CLIENT'S OWN PEOPLE AS THE OWNER: from the title check typed by hand (its
 * `proprietor_personal_match`, asked when it was typed and the name never kept), or a name a lookup kept under name
 * exception 2 (`proprietor_name_personal`), compared now. Only for a claimant who holds property personally.
 */
export function registerNamesClientPerson(db: Db, business_id: string, property_id: string): boolean {
  const t = db.get<{ claimant_type: string | null }>('SELECT claimant_type FROM businesses WHERE id = ?', [business_id])?.claimant_type ?? null;
  if (t === null || !PERSONAL_CLAIMANTS.includes(t)) return false;
  const r = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1",
    [business_id, property_id]);
  if (r === undefined) return false;
  const f = json(r.fields_json);
  if (f['proprietor_personal_match'] === 'YES') return true;
  const name = text(f['proprietor_name_personal']);
  return name !== null && personIsClients(db, business_id, name);
}

/* ================================================================== *
 * 7 · THE COUNCIL AREA, KEPT ON THE PROPERTY (item 7)
 * ================================================================== */

/** Keep the council area on the property where none is kept yet. Never over one already kept. */
export function keepCouncilArea(db: Db, property_id: string, area: string | null, source: string, now: string): boolean {
  const a = text(area);
  if (a === null || a.length > 100) return false;
  const p = db.get<{ council_area: string | null }>('SELECT council_area FROM properties WHERE id = ?', [property_id]);
  if (p === undefined || p.council_area !== null) return false;
  db.run('UPDATE properties SET council_area = ?, council_area_source = ?, updated_at = ? WHERE id = ?', [a, source, now, property_id]);
  return true;
}

/** The council area kept on a property, or null. */
export function councilAreaOf(db: Db, property_id: string | null): { area: string; source: string | null } | null {
  if (property_id === null) return null;
  const p = db.get<{ council_area: string | null; council_area_source: string | null }>('SELECT council_area, council_area_source FROM properties WHERE id = ?', [property_id]);
  return p?.council_area ? { area: p.council_area, source: p.council_area_source } : null;
}
