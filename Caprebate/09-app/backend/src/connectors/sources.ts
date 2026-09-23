/**
 * WHERE EACH OUTSIDE SERVICE IS, AND HOW HARD WE MAY CALL IT. Phase 146b, 22 September 2026.
 *
 * One row per service a connector calls. src/connectors/http.ts takes the base address from HERE and from nowhere
 * else: a connector passes a path, never a full address, so no connector can point a call somewhere this list does
 * not name.
 *
 * TIED TO THE SOURCE REGISTER, NOT A SECOND ONE. caprebate-source-register.ts (04-phase-work/phase3) is the register
 * of what we consult and why; its `endpoint` is the publisher's address. A test checks that every row below with a
 * `register_source` sits on the same internet domain as that source's `endpoint`, so the two cannot come apart. The
 * address here is the API's own, which is sometimes a different host on that domain (the energy certificate
 * service's API is api.get-energy-performance-data…, its website get-energy-performance-data…).
 *
 * UK OR EU ONLY, UNLESS A TRANSFER IS APPROVED. `region` is where the service says it holds the data. http.ts refuses
 * a call to any other region unless `international_transfer_approved` is true, and today it is true for none. The
 * Claude API is the only row outside the UK and EU; approving that transfer is the data protection officer's, and
 * Phase 146e carries it.
 *
 * RATE LIMITS are the publisher's own, where it publishes one, and a cautious guess where it does not — said so in
 * `rate_basis`. We stay under the published figure rather than on it. Phase 146c read every figure again from the
 * publishers' pages on 23 September 2026 and wrote down in `rate_basis` what each page does and does not say.
 */

export type Region = 'UK' | 'EU' | 'US';

export type CallPolicy = {
  readonly service_id: string;
  /** The source register's id where this service is a register source; null for a processor (the Claude API). */
  readonly register_source: string | null;
  /** https only. Null where the address is not yet confirmed from the supplier's documents: every call is refused. */
  readonly base_url: string | null;
  readonly region: Region;
  readonly international_transfer_approved: boolean;
  readonly rate: { readonly limit: number; readonly window_ms: number };
  /**
   * Phase 146c: rows that share one published limit count against one window. Companies House's limit is the key's,
   * across its Public Data API and its Document API, so both rows name the bucket COMPANIES_HOUSE. Absent: the row's own.
   */
  readonly rate_bucket?: string;
  /** Phase 146c: a second, daily cap where the publisher asks for one (PlanIt: about 300 a day). */
  readonly daily_limit?: number;
  readonly rate_basis: string;
  readonly timeout_ms: number;
  readonly max_bytes: number;
  /** Tries in all, including the first. Retries happen only on 429 and 5xx. */
  readonly max_attempts: number;
};

const FIVE_MIN = 5 * 60 * 1000;
const MB = 1024 * 1024;

export const CALL_POLICIES: Readonly<Record<string, CallPolicy>> = Object.freeze({
  COMPANIES_HOUSE: {
    service_id: 'COMPANIES_HOUSE', register_source: 'CH_COMPANY',
    base_url: 'https://api.company-information.service.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 600, window_ms: FIVE_MIN }, rate_bucket: 'COMPANIES_HOUSE',
    rate_basis: 'published: "up to 600 requests within a five-minute period" (developer-specs rate limiting guide, read 23 Sep 2026)',
    timeout_ms: 10_000, max_bytes: 2 * MB, max_attempts: 3,
  },
  COMPANIES_HOUSE_DOCUMENTS: {
    /* Phase 146c: the Document API, for whether a filing has an iXBRL copy. Same key, same published limit — so the
       same bucket as the Public Data API, and the two together never pass 600 in five minutes. */
    service_id: 'COMPANIES_HOUSE_DOCUMENTS', register_source: 'CH_COMPANY',
    base_url: 'https://document-api.company-information.service.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 600, window_ms: FIVE_MIN }, rate_bucket: 'COMPANIES_HOUSE',
    rate_basis: 'the key\u2019s published 600 in five minutes, shared with the Public Data API',
    timeout_ms: 10_000, max_bytes: 1 * MB, max_attempts: 3,
  },
  CQC: {
    service_id: 'CQC', register_source: 'CQC',
    base_url: 'https://api.service.cqc.org.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 600, window_ms: FIVE_MIN },
    rate_basis: 'NOT PUBLISHED: the current developer portal (read 23 Sep 2026) states no limit. The 2,000 a minute on ' +
      'CQC\u2019s old portal is for the old keyless API, so it is not used. Kept as cautious as Companies House',
    timeout_ms: 10_000, max_bytes: 4 * MB, max_attempts: 3,
  },
  EPC: {
    service_id: 'EPC', register_source: 'EPC',
    base_url: 'https://api.get-energy-performance-data.communities.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 3000, window_ms: FIVE_MIN }, rate_basis: 'published: 6,000 requests in 5 minutes per address; we use half',
    timeout_ms: 15_000, max_bytes: 4 * MB, max_attempts: 3,
  },
  HMLR_PPD: {
    service_id: 'HMLR_PPD', register_source: 'HMLR_PPD',
    base_url: 'https://landregistry.data.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 300, window_ms: FIVE_MIN }, rate_basis: 'not published on the pages read (23 Sep 2026); cautious',
    timeout_ms: 20_000, max_bytes: 4 * MB, max_attempts: 3,
  },
  PLANNING: {
    service_id: 'PLANNING', register_source: 'PLANNING',
    base_url: 'https://www.planit.org.uk', region: 'UK', international_transfer_approved: false,
    /* Phase 146c: PlanIt's own guidance, read 23 September 2026 — "you can safely make one request to the
       /api/applics endpoint every minute", and "a daily request cap of 300". One try only: a retry inside the minute
       would break the first, so a busy answer is reported and a person tries again later. */
    rate: { limit: 1, window_ms: 60 * 1000 }, daily_limit: 300,
    rate_basis: 'published: one request a minute and about 300 a day (PlanIt API page and FAQ, read 23 Sep 2026)',
    timeout_ms: 50_000, max_bytes: 1000 * 1024, max_attempts: 1,
  },
  PLANNING_DATA: {
    /* Phase 146c: planning.data.gov.uk, the government's planning data platform — no key. Its planning application
       dataset says of itself, read 23 September 2026, that it "is incomplete and is not yet ready for use", so a lookup
       that finds nothing there goes on to PlanIt. */
    service_id: 'PLANNING_DATA', register_source: 'PLANNING',
    base_url: 'https://www.planning.data.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 60, window_ms: FIVE_MIN },
    rate_basis: 'not published: its documentation asks only for "polite rate-limiting between requests" (read 23 Sep 2026); cautious',
    timeout_ms: 20_000, max_bytes: 4 * MB, max_attempts: 2,
  },
  HOMEDATA_ADDRESS: {
    service_id: 'HOMEDATA_ADDRESS', register_source: 'HOMEDATA_ADDRESS',
    base_url: 'https://api.homedata.co.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 100, window_ms: FIVE_MIN }, rate_basis: 'not published; each call costs money, so cautious',
    timeout_ms: 10_000, max_bytes: 1 * MB, max_attempts: 2,
  },
  HMLR_TITLE: {
    service_id: 'HMLR_TITLE', register_source: 'HMLR_TITLE',
    /* The Business Gateway's live and test addresses are the developer's to confirm under the network access
       agreement (Phase 146d). Until then there is no address, and http.ts refuses every call. */
    base_url: null, region: 'UK', international_transfer_approved: false,
    rate: { limit: 30, window_ms: FIVE_MIN }, rate_basis: 'about £7 a title, so kept low on purpose',
    timeout_ms: 30_000, max_bytes: 2 * MB, max_attempts: 2,
  },
  CLAUDE_DOCUMENTS: {
    service_id: 'CLAUDE_DOCUMENTS', register_source: null,
    base_url: 'https://api.anthropic.com', region: 'US', international_transfer_approved: false,
    rate: { limit: 50, window_ms: 60 * 1000 }, rate_basis: 'depends on the account tier; cautious',
    timeout_ms: 120_000, max_bytes: 8 * MB, max_attempts: 3,
  },
});

/** The service a register source is called through. CH_PSC shares Companies House with CH_COMPANY. */
export const SERVICE_OF_SOURCE: Readonly<Record<string, string>> = Object.freeze({
  /* Phase 146c: a source's MAIN service. CH_COMPANY also reads COMPANIES_HOUSE_DOCUMENTS, and PLANNING asks
     PLANNING_DATA before PlanIt; ONS_POSTCODE has no service at all — its table is read on this server. */
  CH_COMPANY: 'COMPANIES_HOUSE',
  CH_PSC: 'COMPANIES_HOUSE',
  CQC: 'CQC',
  EPC: 'EPC',
  HMLR_PPD: 'HMLR_PPD',
  PLANNING: 'PLANNING',
  HOMEDATA_ADDRESS: 'HOMEDATA_ADDRESS',
  HMLR_TITLE: 'HMLR_TITLE',
});
