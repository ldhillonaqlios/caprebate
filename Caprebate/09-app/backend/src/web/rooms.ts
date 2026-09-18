/**
 * THE ROOM SCHEDULE — sector by sector, for the surveyor to count.
 *
 * TRANSCRIBED, NOT WRITTEN. Every room type below comes from
 * `04-phase-work/phase9/room-list-plain-english-v1.md` — "What we think is in
 * each room", version 1.0, 2 September 2026 — which is the authoritative
 * source and which this phase does not touch. Nothing here is a new judgement
 * about what is in a healthcare building.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE
 *
 * COUNTS. The source document says it twice and means it: "Nothing below says
 * 'three sluice rooms' or 'twelve nurse-call points'. A count is a fact about
 * one specific building and we have not seen one. The count itself is the
 * survey's job." So this file carries the room TYPES and what a count of each
 * would be measured against, and the workspace asks the surveyor for the
 * number. A seeded count would be this system inventing a property fact, which
 * is the one thing the whole discipline exists to prevent.
 *
 * AND THE ITEM-LEVEL SCHEDULE. The source lists roughly 150 individual
 * fixtures — DN-1 to DN-31, GP-1 onwards, and so on — each with why we think
 * it is there, what drives its count and how sure we are. That belongs to the
 * surveyor's own document and is where it already is. Copying 150 rows into
 * code would create a second copy to keep in step with the first, and the
 * first is the one a chartered surveyor signs. The workspace names the
 * document instead.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FOUR COUNT DRIVERS ARE THE SOURCE'S OWN, verbatim from its own table:
 * per room, per building, per square metre, and from the paperwork. Which one
 * applies "is a real decision, not a formality" — so it is carried through
 * rather than flattened into "how many".
 *
 * SECTOR IDS ARE THE ENGINE'S. `care_homes`, `dental`, `supported_living`,
 * `gp`, `private_hospital` — the same five SECTOR_IDS the assessment and the
 * estimate use. There is no sixth vocabulary for a sector in this project and
 * this file is not starting one.
 */

import type { SectorId } from './engine.ts';

/** The source document's own four drivers, in its own words. */
export type CountDriver = 'per room' | 'per building' | 'per square metre' | 'from the paperwork';

export type RoomType = {
  /** Stable id. Sector prefix plus a number, so a stored count survives a re-wording. */
  readonly room_id: string;
  readonly label: string;
  readonly driver: CountDriver;
  /** Present where the source flags the room type itself as uncertain. */
  readonly caveat?: string;
};

export type SectorRooms = {
  readonly sector: SectorId;
  /** The source's "What scales this sector" sentence, which decides what a count means. */
  readonly scales_on: string;
  readonly rooms: readonly RoomType[];
  /** Anything the source says about reading that sector differently. */
  readonly note?: string;
};

/**
 * DENTAL — seven room types. The source: "A one-surgery practice and a
 * six-surgery practice have the same room types."
 */
const DENTAL: SectorRooms = {
  sector: 'dental',
  scales_on: 'the number of surgeries (chairs)',
  rooms: [
    { room_id: 'DN-R1', label: 'Surgery / treatment room', driver: 'per room' },
    { room_id: 'DN-R2', label: 'Decontamination room', driver: 'per room' },
    { room_id: 'DN-R3', label: 'X-ray / imaging room', driver: 'per room' },
    { room_id: 'DN-R4', label: 'Reception and waiting area', driver: 'per room' },
    { room_id: 'DN-R5', label: 'Plant room or cupboard', driver: 'per building' },
    { room_id: 'DN-R6', label: 'Staff room, office and WCs', driver: 'per room' },
    {
      room_id: 'DN-R7', label: 'Residential flat above the practice', driver: 'per building',
      caveat: 'Everything inside it is excluded. Very common on a high street — confirm whether there is one.',
    },
  ],
};

/**
 * GP — eight room types. The source names this the one sector where a room's
 * existence is settled by a register lookup rather than by asking the client:
 * a dispensing practice is on the NHS register.
 */
const GP: SectorRooms = {
  sector: 'gp',
  scales_on: 'the number of consulting, treatment and minor-operations rooms',
  rooms: [
    { room_id: 'GP-R1', label: 'Consulting room', driver: 'per room' },
    { room_id: 'GP-R2', label: 'Treatment room', driver: 'per room' },
    { room_id: 'GP-R3', label: 'Minor-operations room', driver: 'per room' },
    { room_id: 'GP-R4', label: 'Reception and waiting area', driver: 'per room' },
    {
      room_id: 'GP-R5', label: 'Dispensary', driver: 'per building',
      caveat: 'A dispensing practice is on the NHS register, so this is checked rather than asked.',
    },
    { room_id: 'GP-R6', label: 'Vaccine / cold-chain store', driver: 'per room' },
    { room_id: 'GP-R7', label: 'Phlebotomy room', driver: 'per room' },
    { room_id: 'GP-R8', label: 'Circulation, WCs and staff areas', driver: 'per square metre' },
  ],
};

/** CARE HOMES — fourteen room types, scaled on the registered bed count. */
const CARE_HOMES: SectorRooms = {
  sector: 'care_homes',
  scales_on: 'the registered bed count',
  rooms: [
    { room_id: 'CH-R1', label: 'Resident bedroom (single)', driver: 'per room' },
    { room_id: 'CH-R2', label: 'Resident bedroom (shared)', driver: 'per room' },
    { room_id: 'CH-R3', label: 'En-suite, assisted bathroom, wet room', driver: 'per room' },
    { room_id: 'CH-R4', label: 'Sluice room / bedpan wash', driver: 'per room' },
    { room_id: 'CH-R5', label: 'Communal lounge and dining room', driver: 'per room' },
    { room_id: 'CH-R6', label: 'Commercial kitchen', driver: 'per building' },
    { room_id: 'CH-R7', label: 'Commercial laundry', driver: 'per building' },
    { room_id: 'CH-R8', label: 'Nurse station / staff office', driver: 'per room' },
    { room_id: 'CH-R9', label: 'Corridors and circulation', driver: 'per square metre' },
    {
      room_id: 'CH-R10', label: 'Dementia unit corridor', driver: 'per square metre',
      caveat: 'Confirm whether the home has a dedicated dementia unit at all.',
    },
    { room_id: 'CH-R11', label: 'Sensory / activity room', driver: 'per room' },
    { room_id: 'CH-R12', label: 'Hairdressing / therapy room', driver: 'per room' },
    { room_id: 'CH-R13', label: 'Reception and entrance', driver: 'per room' },
    { room_id: 'CH-R14', label: 'Plant / boiler room', driver: 'per building' },
  ],
};

/**
 * SUPPORTED LIVING — read differently from the other four, and the source says
 * so before it lists anything. Everything inside a resident's own home is
 * excluded, wherever the plant serving it happens to sit, so the list is split
 * into common parts (the small target) and the excluded interiors, which are
 * listed only so that nothing is claimed from them by accident.
 */
const SUPPORTED_LIVING: SectorRooms = {
  sector: 'supported_living',
  scales_on: 'the common parts, not the scheme',
  note:
    'Read this sector differently. Everything INSIDE a resident’s own home is excluded, wherever ' +
    'the plant that serves it sits. Before any of this applies: is this supported living with ' +
    'tenancies, or a registered care home with no separate tenancies? Get that wrong and the ' +
    'whole list is the wrong one.',
  rooms: [
    { room_id: 'SL-R1', label: 'Entrance lobby and circulation (common parts)', driver: 'per square metre' },
    { room_id: 'SL-R2', label: 'Communal plant / boiler room', driver: 'per building' },
    { room_id: 'SL-R3', label: 'Staff office, staff kitchen and staff areas', driver: 'per room' },
    { room_id: 'SL-R4', label: 'Common-parts WC', driver: 'per room' },
    { room_id: 'SL-R5', label: 'Sleep-in / waking-night room', driver: 'per room' },
    { room_id: 'SL-R6', label: 'Shared laundry', driver: 'per building' },
    { room_id: 'SL-R7', label: 'Assistive technology and accessible bathing', driver: 'per room' },
    {
      room_id: 'SL-R8', label: 'Inside a resident’s own home — EXCLUDED', driver: 'per room',
      caveat:
        'Counted so that nothing is claimed from it by accident. A count here is a count of what ' +
        'is OUT of the claim, and it is the one row where a number does not increase anything.',
    },
  ],
};

/**
 * PRIVATE CLINIC / HOSPITAL — twelve room types, and the source is emphatic
 * that this is a SUPERSET: "Most of the rooms below will not exist below acute
 * scale. Strike out what the facility does not have before using it." Which is
 * why every count starts unset rather than at zero.
 */
const PRIVATE_HOSPITAL: SectorRooms = {
  sector: 'private_hospital',
  scales_on: 'the number of theatres, intensive-care rooms, imaging rooms and sterile-services rooms',
  note:
    'Facility type gates this sector more than any other — a consulting-only clinic, a day-surgery ' +
    'centre and a full acute hospital sit on a gradient. This is the full superset and most of it ' +
    'will not exist below acute scale.',
  rooms: [
    { room_id: 'PH-R1', label: 'Consulting room (outpatient)', driver: 'per room' },
    { room_id: 'PH-R2', label: 'Operating theatre', driver: 'per room' },
    { room_id: 'PH-R3', label: 'Intensive care / critical care room', driver: 'per room' },
    { room_id: 'PH-R4', label: 'Imaging room — X-ray and CT', driver: 'per room' },
    { room_id: 'PH-R5', label: 'Imaging room — MRI', driver: 'per room' },
    { room_id: 'PH-R6', label: 'Sterile services', driver: 'per room' },
    { room_id: 'PH-R7', label: 'Endoscopy, dialysis, aseptic pharmacy, pathology', driver: 'per room' },
    { room_id: 'PH-R8', label: 'Ward / inpatient bed area', driver: 'per room' },
    {
      room_id: 'PH-R9', label: 'Mortuary', driver: 'per building',
      caveat: 'Acute facilities only — confirm presence.',
    },
    {
      room_id: 'PH-R10', label: 'Hydrotherapy pool', driver: 'per building',
      caveat:
        'Specialist rehabilitation only. A pool used in delivering rehabilitation is a different ' +
        'case from an amenity pool — confirm genuine clinical use.',
    },
    { room_id: 'PH-R11', label: 'Reception and administration', driver: 'per room' },
    { room_id: 'PH-R12', label: 'Plant rooms', driver: 'per building' },
  ],
};

const BY_SECTOR: Readonly<Record<SectorId, SectorRooms>> = Object.freeze({
  dental: DENTAL,
  gp: GP,
  care_homes: CARE_HOMES,
  supported_living: SUPPORTED_LIVING,
  private_hospital: PRIVATE_HOSPITAL,
});

/**
 * The room schedule for a sector.
 *
 * A SECTOR THIS DOES NOT KNOW RETURNS NULL rather than an empty schedule. An
 * empty list reads as "this building has no rooms", which a surveyor would
 * reasonably take at face value; null makes the screen say it has no schedule
 * for that sector, which is the true statement.
 */
export function roomsFor(sector: string): SectorRooms | null {
  return Object.prototype.hasOwnProperty.call(BY_SECTOR, sector)
    ? (BY_SECTOR[sector as SectorId] as SectorRooms)
    : null;
}

/** Every room id this file knows, for the test that ids are unique across sectors. */
export function allRoomIds(): string[] {
  return Object.values(BY_SECTOR).flatMap((s) => s.rooms.map((r) => r.room_id));
}

/** Where the item-level detail lives. Named on screen so nobody rebuilds it here. */
export const SOURCE_DOCUMENT =
  '04-phase-work/phase9/room-list-plain-english-v1.md — “What we think is in each room”, ' +
  'version 1.0, 2 September 2026. It carries the item-level schedule, why we think each ' +
  'fixture is there, and how sure we are. It is the document to mark up.';
