/**
 * THE PHOTO CHECKLIST — what a client photographs so the surveyor can see inside the building. 2 October 2026.
 *
 * Lakhbir: "a recorded phone walkthrough … and add the option for … a guided photo checklist in the client portal";
 * the mock-up approved the same day ("Yes, build it as shown").
 *
 * IN THE FILMING GUIDE'S ORDER (04-phase-work/phase9/video-walkthrough-capture-script-v1.md, Part B): the outside, the
 * plant room, the electrics, comms and data, water, then every room type of the sector (src/web/rooms.ts), then
 * corridors and life safety, the kitchen and utility, and last the ceiling and floor voids — building-wide things
 * first, the fiddly ones last. Each item says what to photograph in the guide's own words, and which lines of the
 * survey pack it is evidence for (the fixture list's ids, Caprebate-Fixture-Taxonomy-v1.csv), so the surveyor sees
 * each photo against the line it supports. An item for a line the pack does not have links to nothing; it is still
 * worth a photograph.
 *
 * Nothing here is stored: the list is made from the sector each time, and only what the client did is kept
 * (src/web/survey-evidence.ts). An item's key never changes once used, so a photo stays with its item.
 */
import { roomsFor } from './rooms.ts';

export type ChecklistItem = {
  /** Stable: a building item's name, or ROOM-<room id>. */
  readonly key: string;
  readonly group: string;
  readonly title: string;
  readonly what: string;
  /** The fixture-list ids this item is evidence for. */
  readonly lines: readonly string[];
  /** A room type: photograph each one of them. */
  readonly each?: true;
};

export const GROUPS: readonly string[] = Object.freeze([
  'Outside', 'The plant room', 'The electrics', 'Comms and data', 'Water', 'Each room', 'Corridors and safety', 'Kitchen and utility', 'Ceiling and floor voids',
]);

/** The client's rule, said on every page of the checklist. */
export const NOBODY_IN_SHOT = 'Please make sure nobody is in shot: no patients, residents, staff, screens or records.';

const BUILDING: readonly ChecklistItem[] = [
  { key: 'OUT-FRONT', group: 'Outside', title: 'The front of the building', what: 'Stand far enough back to see the whole building. If part of it is an extension, photograph that too.', lines: [] },
  { key: 'OUT-PLANT', group: 'Outside', title: 'Plant outside', what: 'Air-con units and a generator. Oil or gas tanks, and an oxygen store. Any plant at the roof edge. Do not go on the roof.', lines: ['LS-SR-004', 'LS-GP-009'] },
  { key: 'OUT-SHADE', group: 'Outside', title: 'Shading and solar panels', what: 'Any external blinds, louvres or brise-soleil, and any solar panels.', lines: ['LS-SR-006', 'LS-SR-008'] },
  { key: 'PLANT-BOILER', group: 'The plant room', title: 'The boiler(s)', what: 'Each boiler, and the data plate on each — the label with the model and serial number. Hold still so it is readable.', lines: ['LS-SR-003'] },
  { key: 'PLANT-CYLINDER', group: 'The plant room', title: 'The hot water cylinder', what: 'The hot water cylinder or calorifier, and its data plate.', lines: ['LS-SR-003', 'LS-SR-002'] },
  { key: 'PLANT-PIPES', group: 'The plant room', title: 'Pumps, valves and the pipework', what: 'The pumps and valves, and the pipes leaving the plant room. Follow the pipes as far as you can see them.', lines: ['LS-SR-003', 'LS-SR-002'] },
  { key: 'PLANT-AIR', group: 'The plant room', title: 'Ventilation or air-handling units', what: 'Any ventilation or air-handling unit, and its data plate.', lines: ['LS-SR-004', 'LS-GP-008'] },
  { key: 'PLANT-CONTROLS', group: 'The plant room', title: 'The controls panel', what: 'The box with the screen or dials, and any building management system screen.', lines: ['LS-SR-003', 'LS-SR-004'] },
  { key: 'ELEC-METER', group: 'The electrics', title: 'The electricity meter(s)', what: 'Each meter. Hold still on the serial number.', lines: ['LS-SR-001'] },
  { key: 'ELEC-BOARD', group: 'The electrics', title: 'The main fuse board', what: 'The main board. If its door opens without tools, open it and photograph the breakers and their labels. Do not unscrew anything.', lines: ['LS-SR-001'] },
  { key: 'ELEC-OTHER', group: 'The electrics', title: 'Other fuse boards', what: 'Any other boards around the building, one photo each.', lines: ['LS-SR-001'] },
  { key: 'COMMS-CABINET', group: 'Comms and data', title: 'The comms cabinet', what: 'Open the door and photograph the inside, close enough to read the numbered sockets.', lines: ['LS-MP-008', 'LS-GP-006'] },
  { key: 'COMMS-PANELS', group: 'Comms and data', title: 'Alarm, call and camera panels', what: 'The fire alarm panel and the burglar alarm panel. Any nurse-call or staff-call panel. The CCTV recorder. A zone list beside a panel is very useful.', lines: ['LS-MP-003', 'LS-MP-005', 'LS-MP-006', 'LS-MP-007', 'LS-GP-005'] },
  { key: 'WATER-MAIN', group: 'Water', title: 'The water main and stopcock', what: 'Where the water comes in, and the stopcock.', lines: ['LS-SR-002'] },
  { key: 'WATER-TANK', group: 'Water', title: 'Water tanks and treatment', what: 'Any cold water tank, water softener or treatment unit. Only if you can reach it safely.', lines: ['LS-SR-002'] },
  { key: 'CIRC-STAIRS', group: 'Corridors and safety', title: 'Corridors, stairs and lifts', what: 'Each corridor and stair, and any lift or hoist, with its data plate if you can see it.', lines: ['LS-SR-005', 'LS-GP-012', 'LS-MP-014'] },
  { key: 'CIRC-FIRE', group: 'Corridors and safety', title: 'Fire safety', what: 'Smoke alarms, fire call points and emergency lights. Sprinkler heads, and the door-entry system.', lines: ['LS-MP-003', 'LS-MP-004', 'LS-MP-007', 'LS-SR-001'] },
  { key: 'CIRC-WC', group: 'Corridors and safety', title: 'Toilets and washrooms', what: 'Each toilet and washroom: the basins, toilets, showers, hand dryers and fittings.', lines: ['LS-MP-001'] },
  { key: 'KITCHEN', group: 'Kitchen and utility', title: 'The kitchen, laundry and utility rooms', what: 'Fitted units, sinks, extract hoods and any laundry or utility equipment.', lines: ['LS-MP-002', 'LS-MP-001', 'LS-SR-004'] },
  { key: 'VOIDS', group: 'Ceiling and floor voids', title: 'Above one ceiling tile', what: 'Only if it is safe: lift one ceiling tile and photograph the cables and pipes above it. Skip this if you are not sure.', lines: ['LS-SR-001', 'LS-SR-003', 'LS-MP-008', 'LS-GP-014'] },
];

/** In every room, without exception (the guide's B.8). */
const IN_EVERY_ROOM = 'The sockets, lights and heating. Any vent or extract fan. Data sockets and the smoke alarm. The floor, and the fitted furniture. Say in the note if something is freestanding.';
const ROOM_LINES = ['LS-SR-001', 'LS-SR-003', 'LS-MP-008', 'LS-MP-003', 'LS-MP-012', 'LS-MP-013', 'LS-MP-002', 'LS-MP-001', 'LS-MP-011'];

/** Lines a sector's room type also supports, beyond those in every room. */
const ROOM_EXTRA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'GP-R1': ['LS-GP-001', 'LS-GP-002', 'LS-GP-003', 'LS-GP-004'], 'GP-R2': ['LS-GP-001', 'LS-GP-002', 'LS-GP-003'],
  'GP-R3': ['LS-GP-007', 'LS-GP-008', 'LS-GP-009'], 'GP-R4': ['LS-GP-005', 'LS-MP-009'], 'GP-R5': ['LS-GP-010'],
  'GP-R6': ['LS-GP-011'], 'GP-R7': ['LS-GP-001', 'LS-GP-002'],
});

/** The checklist for a sector, in the guide's order. */
export function checklistFor(sector: string): readonly ChecklistItem[] {
  const rooms: ChecklistItem[] = (roomsFor(sector)?.rooms ?? []).map((r) => ({
    key: `ROOM-${r.room_id}`, group: 'Each room', title: r.label, each: true as const,
    what: `Photograph each one. ${IN_EVERY_ROOM}`, lines: [...ROOM_LINES, ...(ROOM_EXTRA[r.room_id] ?? [])],
  }));
  const before = BUILDING.filter((i) => GROUPS.indexOf(i.group) < GROUPS.indexOf('Each room'));
  const after = BUILDING.filter((i) => GROUPS.indexOf(i.group) > GROUPS.indexOf('Each room'));
  return Object.freeze([...before, ...rooms, ...after]);
}
