/**
 * EVERY OUTSIDE SERVICE THAT CAN RECEIVE PERSONAL DATA — PHASE 161g, 5 November 2026.
 *
 * Lakhbir, 5 Nov 2026: the privacy policy "names every outside service that receives personal data, from the
 * connectors and SECRET_KEYS owners ... what is sent, why, and where it is held. Where it is held outside the UK, the
 * transfer basis is written 'to be confirmed by our DPO', never guessed. A test ties the list to SECRET_KEYS, so a new
 * connector cannot be added without a line."
 *
 * So: one entry for EVERY owner in SECRET_KEYS (src/secrets.ts), even the ones that receive nothing (they say so), and
 * one for each service that needs no key (the hosting company, the database, the document store, the free public
 * registers). test/phase161g.test.ts fails on a key owner with no entry, on an entry naming an owner that no longer
 * exists, and on any place outside the UK (or not yet known) whose transfer basis is not exactly TRANSFER_TO_CONFIRM.
 *
 * The privacy policy (src/web/privacy-policy.ts) draws its table from this list, and the review pack's "outside
 * services" attachment is printed from it. A FACT WE DO NOT HAVE IS NEVER MADE UP: where we do not know where a
 * service holds data, `where` says so and `outsideUk` is 'unknown'.
 *
 * Kept outside src/web/ on purpose, like src/analytics.ts: the analytics allow-list check scans every src/web view for
 * Google's tag names, and this list names Google.
 */
import type { SecretOwner } from './secrets.ts';

/** The words for every transfer basis we have not confirmed. Never anything else where data may leave the UK. */
export const TRANSFER_TO_CONFIRM = 'to be confirmed by our data protection officer';

export type OutsideService = {
  /** The SECRET_KEYS owner this service's keys belong to, or null for a service that needs no key. */
  readonly keyOwner: SecretOwner | null;
  /** The company, as a person would know it. */
  readonly name: string;
  /** What it does for us, in a few words. */
  readonly role: string;
  /** False when it receives no personal data at all (it is listed so nobody wonders). */
  readonly personalData: boolean;
  /** What we send it. */
  readonly sent: string;
  /** Why. */
  readonly why: string;
  /** Where it holds what we send, as far as we know it. */
  readonly where: string;
  /** Whether that is outside the UK: true, false, or 'unknown' when nobody has checked. */
  readonly outsideUk: boolean | 'unknown';
  /** The safeguard for sending it outside the UK: TRANSFER_TO_CONFIRM wherever outsideUk is not false; null otherwise. */
  readonly transfer: string | null;
  /** Whether it is in use today, in plain words. */
  readonly inUse: string;
};

const TBC = TRANSFER_TO_CONFIRM;

export const OUTSIDE_SERVICES: readonly OutsideService[] = Object.freeze([
  /* ---------------------------------------------------- the services whose keys are in SECRET_KEYS */
  { keyOwner: 'CLAUDE_DOCUMENTS', name: 'Anthropic (Claude)', role: 'reads uploaded documents for us', personalData: true,
    sent: 'The text of documents a client uploads, which can include the names of people in them.',
    why: 'To find the facts a claim needs (dates, costs, parties) faster, for a person on our team to check.',
    where: 'Anthropic’s service, which may be outside the UK. Not yet confirmed.', outsideUk: 'unknown', transfer: TBC,
    inUse: 'Built and switched off. Nothing is sent until our data protection officer approves it.' },
  { keyOwner: 'COMPANIES_HOUSE', name: 'Companies House', role: 'the public register of companies', personalData: true,
    sent: 'The name or number of a company our client has told us about.',
    why: 'To check the company’s details, and who controls it, for the allowance rules on companies under the same control.',
    where: 'The UK.', outsideUk: false, transfer: null, inUse: 'In use.' },
  { keyOwner: 'CQC', name: 'The Care Quality Commission', role: 'the register of care services in England', personalData: false,
    sent: 'The name or postcode of a care service. No person’s details.',
    why: 'To check how the building is registered and used.', where: 'The UK.', outsideUk: false, transfer: null, inUse: 'In use.' },
  { keyOwner: 'EPC', name: 'The energy certificate register', role: 'the government register of energy certificates', personalData: false,
    sent: 'A postcode or a property address. No person’s details.',
    why: 'To find the building’s floor area and age.', where: 'The UK.', outsideUk: false, transfer: null, inUse: 'In use.' },
  { keyOwner: 'HOMEDATA_ADDRESS', name: 'Homedata', role: 'our property and address data supplier', personalData: true,
    sent: 'A postcode at the free assessment. After an engagement letter is signed, the property’s address.',
    why: 'To find the right building, and its title, planning history and site boundary.',
    where: 'Not yet confirmed.', outsideUk: 'unknown', transfer: TBC, inUse: 'Built. Its key is not set on our test website.' },
  { keyOwner: 'HMLR_TITLE', name: 'HM Land Registry (Business Gateway)', role: 'the title register, by a direct connection', personalData: false,
    sent: 'Nothing. This connection is retired: we look up a title register by hand.',
    why: 'Not used.', where: 'The UK.', outsideUk: false, transfer: null, inUse: 'Retired. It sends nothing.' },
  { keyOwner: 'IONOS_EMAIL', name: 'IONOS (sending email)', role: 'our email provider, for the email we send', personalData: true,
    sent: 'The name and email address of the person we write to, and what we write.',
    why: 'To send sign-in codes, booking invitations, updates and replies.',
    where: 'IONOS says the UK or the European Economic Area, unless its service needs to send it elsewhere.',
    outsideUk: true, transfer: TBC, inUse: 'In use.' },
  { keyOwner: 'IONOS_MAILBOX', name: 'IONOS (our mailbox)', role: 'our email provider, for the replies we receive', personalData: true,
    sent: 'Nothing is sent. It holds the replies people send us, which our website reads.',
    why: 'To put a reply with the right client’s record.',
    where: 'IONOS says the UK or the European Economic Area, unless its service needs to send it elsewhere.',
    outsideUk: true, transfer: TBC, inUse: 'In use.' },
  { keyOwner: 'GOOGLE_ANALYTICS', name: 'Google (Google Analytics)', role: 'counts how people move through our free assessment', personalData: true,
    sent: 'Only after you press “Accept all”. We send which steps of the assessment you reached and the type of business. Google also gets details of your browser, and gives it a random number. We never send your name, business, address, postcode or any figure.',
    why: 'To make the assessment clearer.', where: 'Google, which may hold it in the United States.', outsideUk: true, transfer: TBC,
    inUse: 'Switched off. It loads nothing, even after “Accept all”, until we turn it on.' },
  { keyOwner: 'DIDIT_IDV', name: 'Didit', role: 'checks a person’s identity', personalData: true,
    sent: 'The photo identity document, a live photo of the face, the name and date of birth of the person being checked.',
    why: 'To confirm who we are working with, as the rules against money laundering ask.',
    where: 'Not yet confirmed.', outsideUk: 'unknown', transfer: TBC, inUse: 'Built. Switched on only on our test website.' },
  { keyOwner: 'SIGN_IN', name: 'Our own sign-in key', role: 'not an outside service', personalData: false,
    sent: 'Nothing. It is a key kept in our website’s own settings.', why: 'To keep each person’s second sign-in step safe.',
    where: 'Our website’s own settings, with our hosting company.', outsideUk: false, transfer: null, inUse: 'In use.' },
  { keyOwner: 'CLOUDFLARE_TURNSTILE', name: 'Cloudflare (Turnstile)', role: 'checks a person, not a robot, sent our contact form', personalData: true,
    sent: 'Details of your browser and your internet address, on the page with the contact form.',
    why: 'To stop automated spam.', where: 'Cloudflare, which may hold it outside the UK.', outsideUk: true, transfer: TBC,
    inUse: 'In use on the contact form.' },
  { keyOwner: 'ZOOM', name: 'Zoom', role: 'our video calls', personalData: true,
    sent: 'The name and email address of the person invited, the time of the call, and the call itself while it happens.',
    why: 'To hold a video call you have booked with us.', where: 'Zoom, which may hold it in the United States.', outsideUk: true, transfer: TBC,
    inUse: 'In use.' },
  { keyOwner: 'WHATSAPP', name: 'WhatsApp (Meta)', role: 'messages with clients on our WhatsApp phone', personalData: true,
    sent: 'Our system sends nothing: its connection to WhatsApp is switched off. When our team messages you from our WhatsApp phone, WhatsApp carries those messages. To keep a conversation, our team saves it and adds it to your record.',
    why: 'To talk with you in the way you choose.', where: 'WhatsApp (Meta), which may hold it outside the UK.', outsideUk: true, transfer: TBC,
    inUse: 'The phone is in use. The system’s connection is switched off.' },
  { keyOwner: 'OS_MAPS', name: 'Ordnance Survey', role: 'free maps of building outlines', personalData: false,
    sent: 'The map area around the property. No person’s details.', why: 'To draw the site plan in a survey report.',
    where: 'The UK.', outsideUk: false, transfer: null, inUse: 'In use.' },
  { keyOwner: 'REPLY_TIMER', name: 'cron-job.org (a timer)', role: 'wakes our website every few minutes to read email replies', personalData: false,
    sent: 'Nothing. It only knocks on our website’s door.', why: 'So replies are read on time.',
    where: 'Not applicable: it receives nothing about anyone.', outsideUk: false, transfer: null, inUse: 'In use.' },

  /* PHASE 161h, 7 Nov 2026: the live website's timers, its backup and its reference database. */
  { keyOwner: 'TIMERS', name: 'Vercel Cron (our timers)', role: 'wakes our live website on a timetable for its scheduled jobs', personalData: false,
    sent: 'Nothing. It only knocks on our website\u2019s door.', why: 'So emails, replies and clean-ups happen on time.',
    where: 'Not applicable: it receives nothing about anyone.', outsideUk: false, transfer: null, inUse: 'The live website is not yet open.' },
  { keyOwner: 'BACKUPS', name: 'Our backup store', role: 'keeps a copy of the database and the documents, made every night', personalData: true,
    sent: 'A copy of all our records and documents. Uploads still in the holding place are left out. Every copy is locked with our own key before it is sent, so the backup company cannot read it.',
    why: 'So nothing is lost if the website\u2019s own stores fail.',
    where: 'Not yet chosen. We recommend Amazon Web Services\u2019 storage in London (eu-west-2). Each copy is kept for 35 days.',
    outsideUk: 'unknown', transfer: TBC, inUse: 'Built and switched off until the backup store is chosen.' },
  { keyOwner: 'REFERENCE_DB', name: 'Turso (our reference database)', role: 'keeps the published postcode table and Ordnance Survey\u2019s map grid', personalData: false,
    sent: 'Nothing about anyone. It holds two free public tables, and we only read them.', why: 'To find a property\u2019s council area and place it on the map.',
    where: 'Turso, beside our database. It holds no personal data.', outsideUk: false, transfer: null, inUse: 'The live website is not yet open.' },

  /* ---------------------------------------------------- the services that need no key */
  /* PHASE 161h, 7 Nov 2026: where the live website keeps data, as the phase decided it (Word question 291 asks the
     developer and the data protection officer to agree). Vercel and Turso are US companies; Vercel's own records of each
     request, and Turso's database in Ireland, are outside the UK, so their safeguard is the DPO's to confirm. */
  { keyOwner: null, name: 'Our hosting company', role: 'runs our website and client portal', personalData: true,
    sent: 'Everything our website and portal hold.', why: 'To run the website.',
    where: 'Vercel Inc., a US company. It runs the live website in London. Its own records of each visit (its logs) may be kept outside the UK. Our test website runs on Vercel in the United States and holds invented information only.',
    outsideUk: true, transfer: TBC, inUse: 'The live website is not yet open.' },
  { keyOwner: null, name: 'Our database', role: 'keeps the records of our website and portal', personalData: true,
    sent: 'The records: enquiries, clients, claims, messages and sign-in records.', why: 'To keep the records.',
    where: 'Turso, a US company. It keeps the database in Ireland (Amazon\u2019s eu-west-1), its nearest place to London. If Turso offers London when the database is made, London. Our test website uses Turso in the United States (Virginia), with invented information only.',
    outsideUk: true, transfer: TBC, inUse: 'The live website is not yet open.' },
  { keyOwner: null, name: 'Our document store', role: 'keeps the documents clients upload', personalData: true,
    sent: 'The documents clients upload.', why: 'To keep them safely for the claim.',
    where: 'Vercel Blob (Vercel Inc., a US company), in London. Our test website uses Vercel Blob in the United States, with invented information only.',
    outsideUk: false, transfer: null, inUse: 'The live website is not yet open.' },
  { keyOwner: null, name: 'Microsoft (OneDrive and Microsoft 365)', role: 'our office files and email accounts', personalData: true,
    sent: 'Our working documents about a claim.', why: 'To do our work.',
    where: 'Microsoft says it keeps our email and files in the UK. Its terms let it send them to other countries.',
    outsideUk: true, transfer: TBC, inUse: 'In use.' },
  { keyOwner: null, name: 'Free public registers', role: 'such as HM Land Registry, planning.data.gov.uk, PlanIt, postcodes.io, and the Welsh and Scottish care regulators', personalData: false,
    sent: 'A postcode, a property address or a map area. No person’s details.', why: 'To check facts about the building.',
    where: 'The UK.', outsideUk: false, transfer: null, inUse: 'In use.' },
]);
