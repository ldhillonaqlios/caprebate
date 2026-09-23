/**
 * THE TITLE REGISTER — HM LAND REGISTRY BUSINESS GATEWAY. ABOUT £7 A TITLE, AFTER A SIGNED ENGAGEMENT, ON A CLICK.
 * Phase 146d, 23 September 2026. Switched off: REGISTER_SWITCHES.HMLR_TITLE is false.
 *
 * WHY THIS ONE IS WORTH £7 WHEN EVERYTHING ELSE HERE IS FREE. The engine needs what the client paid for the building,
 * because the purchase price is the starting point for an apportionment. HM Land Registry's free Price Paid Data
 * answers that for HOMES ONLY — it "includes information on all residential property sales", and it excludes
 * commercial property entirely. Four of our five sectors are commercial: a care home, a dental practice, a surgery, a
 * hospital. For those four THERE IS NO FREE SOURCE OF A PRICE PAID AT ALL, and the official copy of the register —
 * which since April 2000 records the price paid, or the value stated where no price was paid — is the only one there
 * is. That is the whole reason this connector exists, and it is why the penny pre-check in src/connectors/homedata.ts
 * can narrow the spend but can never replace it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT ASKS FOR, AND WHAT IT KEEPS
 *
 *   title_number, tenure, price paid or value stated and its date, the restrictions, and the prior-owner chain.
 *   THE PROPRIETOR'S NAME under name exception 2 and no other way: kept only where the property is held PERSONALLY,
 *   because it is then the claimant's own identity rather than a third party's. Where the proprietor is a company the
 *   value is a company name and no exception is engaged at all. The source register carries the exception; this file
 *   does not restate it, and `charge_holder_individual_*` and `former_proprietor_*` are excluded there.
 *
 * THE PRICE PAID WAITS WITH OUR ESTIMATE. It is an amount agreed between a buyer and a seller, so the same rule the
 * sale-price lookup already follows applies: it is withheld from the surveyor's job
 * (REGISTER_AMOUNTS_WITHHELD in src/web/surveyor.ts) so that a surveyor cannot anchor on it. The rest of the record —
 * the tenure, the dates, the title number — goes to them as usual.
 *
 * ONWARD SUPPLY TO THE CLIENT'S ACCOUNTANT IS SHUT. The HMLR_TITLE licence in the source register has
 * `legal_review_required: true` and its note says the accountant-report position "needs solicitor confirmation". Until
 * the solicitor answers, nothing from this source reaches an accountant pack, and that is the register's refusal, not
 * a setting here.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE THREE STEPS, AND WHICH PATHS ARE PUBLISHED AND WHICH ARE NOT
 *
 *   1. ADDRESS → TITLE NUMBER.  Search by Property Description, a SOAP service. "Use this service to find out the
 *      title number and tenure of a property based on the address supplied" (the Business Gateway service list, read
 *      23 September 2026).
 *   2. IS THERE AN OFFICIAL COPY TO BUY?  GET /{rest}/s1/v1/titles/{title_number}/official-copies/availability —
 *      PUBLISHED, in the REST developer guide, and it "Returns the OC1 document availability (title register and
 *      title plan)". Free to ask, so it is asked before the £7 is spent.
 *   3. THE REGISTER ITSELF.  Official Copy Title Known, a SOAP service: "an official copy of the register". This is
 *      the call that costs about £7.
 *
 * WHAT IS CONFIRMED AND WHAT IS NOT, SAID PLAINLY RATHER THAN GUESSED AT. The four path prefixes are published and
 * are in src/connectors/sources.ts. The REST path in step 2 is published, word for word, in the REST developer guide.
 * THE TWO SOAP SERVICE PATHS ARE NOT PUBLISHED ANYWHERE PUBLIC: the developer pack that carries each service's WSDL
 * comes with the network access agreement, which is the developer's to sign. `SOAP_PATHS` below is built from the one
 * SOAP address HM Land Registry does publish — its Application Enquiry poll service, at
 * /b2b/BGSoapEngine/{Service}WebService live and /b2b/BGStubService/{Service}WebService on test — and IS MARKED
 * UNCONFIRMED. A question is open with the developer to confirm them from the pack. Nothing turns on the guess today:
 * the switch is off, there is no certificate, and no call can be made.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE CERTIFICATE. The Gateway needs a user name and password on every request AND the client certificate HM Land
 * Registry issues under the network access agreement, presented when the connection is made. `fetch` cannot present
 * one, so src/connectors/http.ts carries `certificateTransport` and this connector is the only thing that asks for
 * it. No certificate, or no passphrase, is a REFUSED call with a sentence naming the key that is missing BY NAME —
 * never a value, never a throw, never a screen error.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { certificatePaths } from './http.ts';
import { defineSteppedConnector, type Bundle, type LookupResult, type StepRequest } from './registers.ts';
import { postcodeKey } from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';

export type TitleQuery = {
  readonly property: TypedProperty | null;
  readonly nation: Nation | null;
  /**
   * PHASE 146d, ITEM 15: WHAT THE PENNY PRE-CHECK FOUND, where it ran on this same click. Null when it did not run —
   * and a null is NOT a reason to skip the £7 call. "We did not look" and "we looked and there is no title" are
   * different facts, and only the second one saves money (N4 applied to a spending decision).
   */
  readonly pre_check?: { readonly has_title: boolean; readonly title_number: string | null } | null;
  /** True on the vendor test environment, where the same shapes cost nothing. */
  readonly test_environment?: boolean;
};

/** The published REST prefixes, live and test. */
export const REST_PREFIX: Readonly<Record<'live' | 'test', string>> = Object.freeze({ live: '/bg2', test: '/bg2test' });

/**
 * THE SOAP PREFIXES, published; the SERVICE NAMES after them are NOT, and are the developer's to confirm from the
 * Business Gateway developer pack. Kept in one place so confirming them is one edit.
 */
export const SOAP_PREFIX: Readonly<Record<'live' | 'test', string>> = Object.freeze({
  live: '/b2b/BGSoapEngine', test: '/b2b/BGStubService',
});

/** UNCONFIRMED — see the note above. Each is the service's name as HM Land Registry's own service list writes it. */
export const SOAP_PATHS = Object.freeze({
  search_by_property_description: 'SearchByPropertyDescriptionV2_0WebService',
  official_copy_title_known: 'OfficialCopyTitleKnownV2_1WebService',
});

/** Whether a path is one this connector believes it has confirmed from published documentation. */
export function pathIsPublished(path: string): boolean {
  return /\/bg2(test)?\/s\d\/v\d\//.test(path);
}

const basic = (s: OwnerSecrets | null): string => {
  const user = s?.get('HMLR_BG_USERNAME') ?? '';
  const pass = s?.get('HMLR_BG_PASSWORD') ?? '';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/**
 * ONE ELEMENT'S TEXT FROM A SOAP ANSWER, by local name, ignoring whatever namespace prefix the Gateway used. A tiny
 * reader on purpose: this build has no XML parser, these answers have a flat shape, and adding a dependency to read
 * three elements would put a parser between us and a document we buy. Returns null when the element is absent — never
 * an empty string, which would read as a fact we hold.
 */
export function soapText(xml: string, local: string): string | null {
  const m = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${local}>`).exec(xml);
  const raw = m?.[1];
  if (raw === undefined) return null;
  /* Numeric character references are decoded as well as the five named ones. An official copy states a price as
     "&#163;1,250,000" — a £ the Gateway escaped — and a reader that left it escaped would turn a price into a
     number it could not parse, which is to say into no price at all. */
  const text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim()
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return text === '' ? null : text;
}

/** Every occurrence, in document order. For the prior-owner chain. */
export function soapTextAll(xml: string, local: string): string[] {
  const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${local}>`, 'g');
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const one = soapText(`<x>${m[1] ?? ''}</x>`, 'x');
    if (one !== null) out.push(one);
  }
  return out;
}

/** An amount in pounds as the register states it ("£450,000", "450000.00"), or null. Never 0 for absent. */
export function amount(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw.replace(/[£,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A date the register states, as ISO. Accepts 2004-06-11 and 11 June 2004 and 11/06/2004. */
export function registerDate(raw: string | null): string | null {
  if (raw === null) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slash) return `${slash[3]}-${(slash[2] ?? '').padStart(2, '0')}-${(slash[1] ?? '').padStart(2, '0')}`;
  const long = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw);
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  if (long) {
    const i = months.indexOf((long[2] ?? '').toLowerCase());
    if (i >= 0) return `${long[3]}-${String(i + 1).padStart(2, '0')}-${(long[1] ?? '').padStart(2, '0')}`;
  }
  return null;
}

/**
 * WHAT THE OFFICIAL COPY GIVES US, AS THE WHITELIST NAMES IT.
 *
 * `proprietor_name_personal` is written ONLY when the register says the proprietor is a private individual. Where it
 * is a company the company's registered number goes in `proprietor_company_number` and the NAME IS NOT WRITTEN AT
 * ALL — a company name is not personal data, but it is also not a field this source's whitelist carries, and a field
 * that is not on the whitelist is not written whatever it contains.
 */
export function registerFields(xml: string): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const number = soapText(xml, 'TitleNumber');
  if (number !== null) f.title_number = number;
  const tenure = soapText(xml, 'ClassOfTitle') ?? soapText(xml, 'Tenure');
  const t = tenure?.toLowerCase() ?? null;
  if (t !== null && (t.includes('freehold') || t.includes('leasehold'))) f.tenure = t.includes('freehold') ? 'freehold' : 'leasehold';
  const price = amount(soapText(xml, 'PricePaid') ?? soapText(xml, 'AmountOrValueStated'));
  if (price !== null) f.price_paid = price;
  const when = registerDate(soapText(xml, 'PricePaidDate') ?? soapText(xml, 'RegistrationDate'));
  if (when !== null) f.transaction_date = when;
  const term = soapText(xml, 'LeaseTerm');
  if (term !== null) f['lease_term_text'] = term;
  const restrictions = soapTextAll(xml, 'RestrictionText');
  if (restrictions.length > 0) f['restriction_count'] = restrictions.length;
  const kind = soapText(xml, 'ProprietorKind')?.toLowerCase() ?? null;
  const company = soapText(xml, 'CompanyRegistrationNumber');
  if (company !== null) f.proprietor_company_number = company;
  else if (kind === 'individual' || kind === 'private individual') {
    const name = soapText(xml, 'ProprietorName');
    if (name !== null) f.proprietor_name_personal = name;
  }
  return f;
}

/** The prior-owner chain: how many earlier proprietors the register records. Counts only; no former owner's name. */
export function priorOwnerCount(xml: string): number | null {
  const n = soapTextAll(xml, 'PriorProprietor').length;
  return n > 0 ? n : null;
}

function envelope(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' + body +
    '</soapenv:Body></soapenv:Envelope>';
}

export const hmlrTitle = defineSteppedConnector<TitleQuery>({
  source_id: 'HMLR_TITLE', service_id: 'HMLR_TITLE', owner: 'HMLR_TITLE',
  needs: ['HMLR_BG_USERNAME', 'HMLR_BG_PASSWORD', 'HMLR_BG_CERT_PATH', 'HMLR_BG_CERT_PASSPHRASE'],
  also: ['HMLR_TITLE_TEST'],
  first: (q, s) => ({
    endpoint: `${SOAP_PREFIX.live}/${SOAP_PATHS.search_by_property_description}`, method: 'POST',
    headers: { authorization: basic(s), 'content-type': 'text/xml; charset=utf-8' },
    body: envelope(`<SearchByPropertyDescription><Postcode>${postcodeKey(q.property?.postcode)}</Postcode></SearchByPropertyDescription>`),
  }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    if (q.nation === null) {
      return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in, and this register covers England and Wales' };
    }
    if (jurisSource(q.nation, 'price_paid') !== 'HMLR_PPD') {
      return { kind: 'NOT_COVERED', why: 'HM Land Registry registers titles in England and Wales, and the property is elsewhere. Scotland and Northern Ireland keep their own registers' };
    }
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };
    }
    /* ITEM 15: the pre-check narrows the spend, and only in the one direction it honestly can. A pre-check that
       looked and found no registered title stops us buying nothing for £7. A pre-check that did not run tells us
       nothing, so the call goes ahead. */
    if (q.pre_check?.has_title === false) {
      return { kind: 'NOT_COVERED', why: 'the penny pre-check found no registered title at this property, so no official copy was bought' };
    }
    /* The certificate is checked before anything is sent, so a missing one reads as what it is. */
    const cert = certificatePaths(secrets);
    if (cert.path === null || cert.passphrase === null) {
      const missing = cert.path === null ? 'HMLR_BG_CERT_PATH' : 'HMLR_BG_CERT_PASSPHRASE';
      return {
        kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', calls: [],
        why: `the Land Registry connection needs a certificate and the key file has no ${missing}, so nothing was sent`,
      };
    }

    const where = q.test_environment === true ? 'test' : 'live';
    const service = q.test_environment === true ? 'HMLR_TITLE_TEST' : 'HMLR_TITLE';
    const soap = (name: string): string => `${SOAP_PREFIX[where]}/${name}`;
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => {
      const c = await step({
        ...r, service_id: service,
        headers: { authorization: basic(secrets), ...r.headers },
      });
      calls.push(c);
      return c;
    };

    // 1 · the address to a title number. Free to ask; it is the search, not the copy, that costs nothing.
    const found = await call({
      endpoint: soap(SOAP_PATHS.search_by_property_description), method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8' },
      body: envelope(`<SearchByPropertyDescription><Postcode>${pc}</Postcode></SearchByPropertyDescription>`),
    });
    if (found.outcome !== 'OK' || found.body === null) return { kind: 'CALL_FAILED', call: found, calls };
    const title = q.pre_check?.title_number ?? soapText(found.body, 'TitleNumber');
    if (title === null) {
      return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'HM Land Registry found no registered title at that address', calls };
    }

    // 2 · is there an official copy to buy? Published REST path, and free.
    const rest = REST_PREFIX[where];
    const availability = await call({
      endpoint: `${rest}/s1/v1/titles/{title_number}/official-copies/availability`, params: { title_number: title },
    });
    if (availability.outcome === 'OK' && availability.body !== null) {
      let available: unknown = null;
      try { available = obj(JSON.parse(availability.body))?.['registerAvailable']; } catch { available = null; }
      if (available === false) {
        return { kind: 'NOT_COVERED', why: `HM Land Registry holds title ${title} but says no official copy of its register can be supplied, so nothing was bought` };
      }
    }

    // 3 · the official copy. THIS IS THE CALL THAT COSTS ABOUT £7.
    const copy = await call({
      endpoint: soap(SOAP_PATHS.official_copy_title_known), method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8' },
      body: envelope(`<OfficialCopyTitleKnown><TitleNumber>${title}</TitleNumber></OfficialCopyTitleKnown>`),
    });
    if (copy.outcome !== 'OK' || copy.body === null) return { kind: 'CALL_FAILED', call: copy, calls };
    const fields = registerFields(copy.body);
    if (fields['title_number'] === undefined) fields['title_number'] = title;
    const priors = priorOwnerCount(copy.body);
    if (priors !== null) fields['prior_owner_count'] = priors;
    /* NAME EXCEPTION 2 CARRIES A DISCRIMINANT, AND THE ONE DOOR CHECKS IT. `proprietor_name_personal` may be written
       only where the proprietor is a natural person, and the record has to SAY which kind it is —
       assertNoUnauthorisedName refuses the name outright when `proprietorType` is anything but 'individual'. So the
       kind is set from the same reading that produced the name, and it is set for a company too, because "we read
       the register and it is a company" is a fact worth carrying. */
    const kind: 'individual' | 'company' | undefined =
      fields['proprietor_name_personal'] !== undefined ? 'individual'
      : fields['proprietor_company_number'] !== undefined ? 'company'
      : undefined;
    const bundle: Bundle = {
      records: [{ sourceId: 'HMLR_TITLE', entityId: title, fields, ...(kind === undefined ? {} : { proprietorType: kind }) }],
      facts: { ...fields },
    };
    const price = fields['price_paid'] === undefined
      ? ' The register states no price paid or value for it, so that question stays asked.'
      : ' It states the price paid, which waits with our own estimate rather than going to the surveyor.';
    return {
      kind: 'READ', bundle, calls,
      note: `bought the official copy of title ${title} from HM Land Registry.${price}`,
    };
  },
});
