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
  /**
   * PHASE 146d: WHAT ONE CALL COSTS US, IN PENCE, where the publisher prices its calls. Absent on a free service —
   * absent means "this service does not charge", never "we do not know", and a test checks that every PAID row has
   * one. It goes on the audit row (`cost_pence`) beside the charge the supplier reports, so a cost report is built
   * from what was actually spent rather than from a price list somebody retyped.
   *
   * Homedata's is a WEIGHT, not a fixed price: its calls cost a number of tokens that depends on the path and the
   * slugs asked for, at 100 tokens to the pound, so one token is one penny (its pricing page, read 23 September
   * 2026). `cost_pence` here is the cheapest call on the row; the connector works out the real figure per call and
   * puts it on the audit row.
   */
  readonly cost_pence?: number;
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
    /* PHASE 146d, 23 September 2026 — SETTLED ON A LIVE RESPONSE, NOT ON THE PROSE, because the supplier's own pages
       disagree with each other. Its endpoint reference states "Base URL: https://api.homedata.co.uk/api" while every
       worked example on the same page omits the /api. Both forms are routed — a path that cannot exist answers 404
       under either, a real one answers 403 for the missing key — so neither a 403 nor a 404 on a metered path settles
       it. WHAT SETTLES IT IS THE ONE CALL THAT NEEDS NO KEY: the supplier documents /ping and /health as open, and
       GET https://api.homedata.co.uk/ping answered 200 {"status":"ok"} while /api/ping answered 404
       RESOURCE_NOT_FOUND. Its published OpenAPI document (https://api.homedata.co.uk/schema/yaml/, also open) declares
       all 155 of its paths without the prefix. So the base is the host alone and every path this connector sends
       begins "/address/…" or "/property/…". The source register's endpoint was corrected to match. */
    base_url: 'https://api.homedata.co.uk', region: 'UK', international_transfer_approved: false,
    /* PHASE 146d: STILL UNPUBLISHED. The supplier's pricing page states only "Rate limits are applied per API key.
       Exceeding the limit returns HTTP 429 — requests are not queued, retry with backoff" and "a 429 costs nothing".
       No number appears on it, on the authentication page or in the OpenAPI document, all read 23 September 2026, and
       the coverage matrix is "available on request". So the cautious 100 in five minutes stays a guess of ours and
       says so. The retry does better than a guess: http.ts honours the Retry-After the supplier sends. */
    rate: { limit: 100, window_ms: FIVE_MIN }, rate_bucket: 'HOMEDATA',
    rate_basis: 'NOT PUBLISHED: the pricing, authentication and endpoint pages and the OpenAPI document (all read ' +
      '23 Sep 2026) state that limits are per API key and answer 429, and give no number anywhere. The coverage ' +
      'matrix is "available on request" too. 100 in five minutes is OUR cautious guess, not the supplier\u2019s figure',
    timeout_ms: 10_000, max_bytes: 1 * MB, max_attempts: 2,
    /* The cheapest call on this row: /address/postcode/{postcode}/ at 2 tokens, and 100 tokens = £1. */
    cost_pence: 2,
  },
  HOMEDATA_PLANNING: {
    /* PHASE 146d: THE SAME SUPPLIER, THE SAME KEY, A DIFFERENT REGISTER SOURCE. Homedata can answer planning too, by
       UPRN, and item 18 of this phase says to build that route, leave it switched off and NOT decide whether it
       replaces PlanIt — which stays the source of record. Its own row because `register_source` is what ties a
       service to the register of what we consult, and this one is PLANNING; its own bucket is Homedata's, because
       one API key is what the supplier limits. 5 tokens: the planning_history slug's published weight. */
    service_id: 'HOMEDATA_PLANNING', register_source: 'PLANNING',
    base_url: 'https://api.homedata.co.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 100, window_ms: FIVE_MIN }, rate_bucket: 'HOMEDATA',
    rate_basis: 'NOT PUBLISHED, as for the address lookup: per API key, 429, no number given anywhere (read 23 Sep 2026)',
    timeout_ms: 10_000, max_bytes: 2 * MB, max_attempts: 2,
    cost_pence: 5,
  },
  HMLR_TITLE: {
    /* PHASE 146d, 23 September 2026 — THE LIVE BUSINESS GATEWAY. Phase 146b left this row with no address, so every
       call was refused. The address is HM Land Registry's own, published in the Business Gateway developer pack
       (landregistry.github.io/bgtechdoc, read 23 September 2026) and recorded in SUPPLIER_DOCS. Having the address
       does NOT make a call possible: the Gateway needs a user account AND the client certificate HM Land Registry
       issues under the network access agreement, both of which are the developer's to obtain and install, and the
       switch is off. What it changes is that a refusal now says "no certificate" rather than "no address" — the
       first is true and actionable, the second was true only because nobody had looked it up.

       THE BASE IS THE HOST ALONE, NOT A SERVICE PREFIX, because the Gateway serves two families on one host and this
       connector uses both: the REST services under /bg2 (live) and /bg2test (test), and the SOAP services under
       /b2b/BGSoapEngine (live) and /b2b/BGStubService (test). Those four prefixes are published; the WSDL path of
       each individual SOAP service is not, and comes with the developer pack under the network access agreement.
       src/connectors/hmlr-title.ts names which of its paths are published and which the developer must confirm. */
    service_id: 'HMLR_TITLE', register_source: 'HMLR_TITLE',
    base_url: 'https://businessgateway.landregistry.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 30, window_ms: FIVE_MIN }, rate_bucket: 'HMLR_TITLE',
    rate_basis: 'not published in the developer pack (read 23 Sep 2026); about £7 a title, so kept low on purpose',
    timeout_ms: 30_000, max_bytes: 2 * MB, max_attempts: 2,
    /* HM Land Registry's fee for an official copy of the register, in pence. The published fee, not an estimate. */
    cost_pence: 700,
  },
  HMLR_TITLE_TEST: {
    /* PHASE 146d: THE VENDOR TEST ENVIRONMENT, which is where this connector is built and proved. Same certificate,
       same user account, same shapes, invented titles and no fee. It shares HMLR_TITLE's window so a test run cannot
       be used to make more calls than we allow ourselves in all. `cost_pence` is 0 because the test environment
       charges nothing — and that is a fact about it, not an unknown. */
    service_id: 'HMLR_TITLE_TEST', register_source: 'HMLR_TITLE',
    base_url: 'https://bgtest.landregistry.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 30, window_ms: FIVE_MIN }, rate_bucket: 'HMLR_TITLE',
    rate_basis: 'the vendor test environment; the same cautious limit as the live one',
    timeout_ms: 30_000, max_bytes: 2 * MB, max_attempts: 2,
    cost_pence: 0,
  },
  HMLR_INSPIRE: {
    /* PHASE 150, 24 September 2026 — HM Land Registry's INSPIRE Index Polygons, one .zip of GML per local authority,
       from the download page read that day (SUPPLIER_DOCS in the source register). No key. A FILE, NOT A LOOKUP: the
       only thing sent is the council's name, never anything about a client, and the polygon is found on our own
       server. So the limits are about politeness and size, not cost. The files are not small and their size is not
       published: a city council's runs to many megabytes zipped, so the cap is generous and the time limit long.
       One download a council a month is all the data ever needs (it is republished on the first Sunday of the month). */
    service_id: 'HMLR_INSPIRE', register_source: 'HMLR_INSPIRE',
    base_url: 'https://use-land-property-data.service.gov.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 5, window_ms: FIVE_MIN }, daily_limit: 40,
    rate_basis: 'NOT PUBLISHED on the dataset, download, guidance or API pages (read 24 Sep 2026); five in five ' +
      'minutes and forty a day is OUR cautious guess for whole-file downloads',
    timeout_ms: 300_000, max_bytes: 400 * MB, max_attempts: 2,
  },
  POSTCODES_IO: {
    /* PHASE 151, 24 September 2026 — the free postcode check at the address question (src/connectors/postcode-check.ts),
       BUILT AND SWITCHED OFF behind the free-tier gate. No key. Only a postcode is sent. Its documentation (read that
       day, SUPPLIER_DOCS) publishes no rate limit and no hosting location; UK below is the service's own country (Ideal
       Postcodes Ltd), and a postcode is not personal data. */
    service_id: 'POSTCODES_IO', register_source: 'POSTCODES_IO',
    base_url: 'https://api.postcodes.io', region: 'UK', international_transfer_approved: false,
    rate: { limit: 60, window_ms: 60 * 1000 },
    rate_basis: 'NOT PUBLISHED on postcodes.io/docs (read 24 Sep 2026); sixty a minute is OUR cautious guess - one a visitor, at the address question',
    timeout_ms: 5_000, max_bytes: 64 * 1024, max_attempts: 2,
  },
  OS_FEATURES: {
    /* 2 OCTOBER 2026 — the building outlines for the report's site plan (the survey pack, stage 6;
       src/connectors/os-buildings.ts). Ordnance Survey's Features API, on the free OS OpenData plan, serving OS Open
       Zoomstack's local buildings: open data under the Open Government Licence, shown with "Contains OS data © Crown
       copyright and database right". Only a small square of map around the postcode's point is
       asked for, never a name or an address. Ordnance Survey is in Southampton, so UK. Its key is a project key from
       osdatahub.os.uk. The OS Data Hub's open plan publishes 600 transactions a minute; ten a minute is ours. */
    service_id: 'OS_FEATURES', register_source: null,
    base_url: 'https://api.os.uk', region: 'UK', international_transfer_approved: false,
    rate: { limit: 10, window_ms: 60 * 1000 },
    rate_basis: 'the OS Data Hub publishes 600 a minute on the open plan; ten a minute is OUR cautious limit - one site plan is one call, asked for by a person',
    timeout_ms: 15_000, max_bytes: 2 * MB, max_attempts: 2,
  },
  WHATSAPP_MEDIA: {
    /* PHASE 153f, 4 October 2026 — A FILE SOMEONE SENT US ON WHATSAPP (src/connectors/whatsapp.ts, fetchWhatsAppMedia).
       Meta gives each photo, voice note or document an address on its own file host for a few minutes; we fetch it there
       with our WhatsApp token, only when a member of staff presses "Get it". The same processor and the same transfer
       as WHATSAPP_CLOUD (approved for testing on 30 September 2026), so the same answer here. Nothing is sent but the
       token; the file comes back. A GET, so a second try is safe. Our own limit on size: 16 MB. */
    service_id: 'WHATSAPP_MEDIA', register_source: null,
    base_url: 'https://lookaside.fbsbx.com', region: 'US', international_transfer_approved: true,
    rate: { limit: 30, window_ms: 60 * 1000 },
    rate_basis: 'Meta does not publish a limit for media downloads (read 4 Oct 2026); thirty a minute is OUR cautious limit - one file a click',
    timeout_ms: 30_000, max_bytes: 16 * MB, max_attempts: 2,
  },
  DIDIT_IDV: {
    /* PHASE 151f, 25 September 2026 — Didit, the online identity check for the money-laundering rules
       (src/connectors/identity-check.ts), BUILT AND SWITCHED OFF, in place of Veriff (Phase 151) on Lakhbir's
       instruction. A PROCESSOR, not a register source, like the Claude API: it holds the client's ID and selfie for us.
       Processed and stored in the EU (AWS) by default, docs.didit.me/getting-started/security-compliance. Its address,
       the session call and its rate limit are from docs.didit.me/sessions-api/create-session (all read 25 Sep 2026).
       ITS PRICE IS IN US DOLLARS: the first 500 full checks a month are free, then US$0.33 a check
       (didit.me/pricing). 33 below is that published figure in US CENTS, not pence, and it is the price AFTER the
       free 500: a cost read from here overstates a month under 500, never understates one. */
    service_id: 'DIDIT_IDV', register_source: null,
    base_url: 'https://verification.didit.me', region: 'EU', international_transfer_approved: false,
    rate: { limit: 20, window_ms: 60 * 1000 },
    rate_basis: 'Didit publishes 600 a minute for creating sessions (read 25 Sep 2026); twenty a minute is OUR cautious limit - a check is started by a person, one at a time',
    timeout_ms: 20_000, max_bytes: 256 * 1024, max_attempts: 2, cost_pence: 33,
  },
  CLOUDFLARE_TURNSTILE: {
    /* 29 SEPTEMBER 2026 — the home page contact form's security check (src/connectors/turnstile.ts). A PROCESSOR, not a
       register source: the server sends Cloudflare the widget's answer and the visitor's address, and Cloudflare says
       whether the answer is real. Address and call from developers.cloudflare.com/turnstile/get-started/server-side-
       validation (read 29 Sep 2026). Cloudflare, Inc. is a US company with a global network; it publishes no region
       for this call, so the row says US and the transfer is NOT APPROVED: until the data protection officer approves
       it, nothing is sent and every enquiry is kept unchecked (src/connectors/turnstile.ts says so in the log). The
       widget in the visitor's browser already talks to Cloudflare, so the privacy notice needs a line either way.
       ONE TRY: an answer is good once, so a retry would be refused as a duplicate. Turnstile is free. */
    service_id: 'CLOUDFLARE_TURNSTILE', register_source: null,
    base_url: 'https://challenges.cloudflare.com', region: 'US', international_transfer_approved: false,
    rate: { limit: 60, window_ms: 60 * 1000 },
    rate_basis: 'NOT PUBLISHED for siteverify (read 29 Sep 2026); sixty a minute is OUR cautious limit - one check an enquiry, and enquiries are limited per address',
    timeout_ms: 8_000, max_bytes: 16 * 1024, max_attempts: 1,
  },
  ZOOM_OAUTH: {
    /* 30 SEPTEMBER 2026 — video calls (src/connectors/zoom.ts). A PROCESSOR. Zoom's Server-to-Server OAuth: the server
       swaps its app's id and secret for an hour's access token. Address from developers.zoom.us (read 30 Sep 2026).
       Zoom Video Communications, Inc. is a US company, so the row says US and the transfer is NOT APPROVED: until the
       data protection officer approves it, no meeting is made, and the team sends a link as before. What is sent is
       the time of the call and the words "Cap Rebate call"; no client's name, email or number. The call itself (the
       client's voice and picture) runs through Zoom whichever way it is joined, which is what the approval is about.
       ONE TRY for the token: a refused secret stays refused. */
    /* THE TRANSFER: Approved 30 September 2026 by Sadique Maskeen (data protection officer), as relayed by Lakhbir in the chat with Claude: "saqiue approves". A test build; the approval is for testing and is to be confirmed before real clients. */
    service_id: 'ZOOM_OAUTH', register_source: null,
    base_url: 'https://zoom.us', region: 'US', international_transfer_approved: true,
    rate: { limit: 30, window_ms: 60 * 1000 },
    rate_basis: 'Zoom does not publish a limit for the token call (read 30 Sep 2026); thirty a minute is OUR cautious limit, and a token lasts an hour',
    timeout_ms: 10_000, max_bytes: 16 * 1024, max_attempts: 1,
  },
  ZOOM_API: {
    /* 30 SEPTEMBER 2026 — make, move and cancel a video call's meeting, and the host's start token (ZAK), through
       api.zoom.us (developers.zoom.us, read 30 Sep 2026). US, not approved, as ZOOM_OAUTH. ONE TRY: making a meeting is
       not safe to repeat (a retry after a lost answer makes two). Zoom's plans allow about a hundred meetings made a day
       per user; twenty a minute is OUR cautious limit. */
    /* THE TRANSFER: approved with ZOOM_OAUTH, 30 September 2026 (Sadique Maskeen, relayed by Lakhbir). */
    service_id: 'ZOOM_API', register_source: null,
    base_url: 'https://api.zoom.us', region: 'US', international_transfer_approved: true,
    rate: { limit: 20, window_ms: 60 * 1000 },
    rate_basis: 'Zoom rate-limits by plan and call type (read 30 Sep 2026); twenty a minute is OUR cautious limit, one meeting a call booked',
    timeout_ms: 15_000, max_bytes: 64 * 1024, max_attempts: 1,
  },
  WHATSAPP_CLOUD: {
    /* 30 SEPTEMBER 2026 — WhatsApp with each client from the back office (src/connectors/whatsapp.ts). A PROCESSOR:
       Meta's WhatsApp Cloud API, graph.facebook.com (developers.facebook.com, read 30 Sep 2026; Graph API v25.0). Meta
       keeps Cloud API messages in its data centres, in the United States unless a local storage region is set up, so
       the row is US and the transfer is NOT APPROVED: until the data protection officer approves it, nothing is sent
       and the back office says so. What is sent: the number and the words staff typed. ONE TRY: a retry after a lost
       answer would send the message twice. Meta's limit for a new number is far above ours; sixty a minute is OURS. */
    /* THE TRANSFER: approved for testing on 30 September 2026 by Sadique Maskeen (data protection officer), relayed by
       Lakhbir in chat: "Sadique approves WhatsApp, the contact box is enough for testing". To be confirmed before real
       clients. */
    service_id: 'WHATSAPP_CLOUD', register_source: null,
    base_url: 'https://graph.facebook.com', region: 'US', international_transfer_approved: true,
    rate: { limit: 60, window_ms: 60 * 1000 },
    rate_basis: 'Meta limits by the number’s messaging tier (read 30 Sep 2026); sixty a minute is OUR cautious limit',
    timeout_ms: 15_000, max_bytes: 64 * 1024, max_attempts: 1,
  },
  GOADDRESS: {
    /* 30 SEPTEMBER 2026 — "Find my address" at the assessment (src/connectors/address-lookup.ts). A PROCESSOR: GoAddress,
       https://portal.goaddress.io/api/address/{postcode} with a bearer token (goaddress.io/docs.html, read 30 Sep 2026).
       Its site names no company and no hosting place, so the row says US (outside the UK) until GoAddress says where,
       and the transfer was APPROVED FOR TESTING on 30 September 2026 by Sadique Maskeen, relayed by Lakhbir ("sadique
       approves"). What is sent: a postcode, nothing else. The free plan is 100 lookups; paid plans count a day's lookups,
       so sixty a minute is OUR cautious limit. A lookup is safe to repeat. */
    service_id: 'GOADDRESS', register_source: null,
    base_url: 'https://portal.goaddress.io', region: 'US', international_transfer_approved: true,
    rate: { limit: 60, window_ms: 60 * 1000 },
    rate_basis: 'GoAddress limits lookups a day by plan (read 30 Sep 2026); sixty a minute is OUR cautious limit',
    timeout_ms: 8_000, max_bytes: 512 * 1024, max_attempts: 2,
  },
  CLAUDE_DOCUMENTS: {
    /* THE TRANSFER: Approved FOR TESTING on 5 October 2026 - Sadique Maskeen (data protection officer) approved Anthropic
       as the document reader and the director signed, as relayed by Lakhbir in the chat with Claude (Phase 156e A2):
       "Yes, for testing". Invented documents only. This opens the transfer and nothing else: both reading switches
       (src/connectors/claude.ts, CLAUDE_SWITCHES) stay OFF, and ANTHROPIC_API_KEY is in the key file only, not in
       Vercel and not in TEST_DEPLOY_KEYS, so the test website reads nothing. To be confirmed before real clients. */
    service_id: 'CLAUDE_DOCUMENTS', register_source: null,
    base_url: 'https://api.anthropic.com', region: 'US', international_transfer_approved: true,
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
  HMLR_INSPIRE: 'HMLR_INSPIRE',
});
