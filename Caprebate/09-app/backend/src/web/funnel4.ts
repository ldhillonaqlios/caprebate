/**
 * THE FOUR-STAGE FUNNEL — "Am I eligible?", rebuilt. 30 September 2026.
 *
 * Lakhbir, 29-30 September 2026: "we need to think of more of a funnel for this ... building anticipation prior to
 * asking for their address details"; "if someone answers no why are we then showing the 'what kind' and 'how much'";
 * a type of business per building with "add another"; "different buildings maybe held by different companies but
 * same directors, so again this needs to be per property"; "each building may be a different business name and of
 * course each will have different addresses"; and last "the big reveal around the amount. It should be a climbing
 * number", with three ways to be reached under it.
 *
 *   STAGE 1  YOUR BUILDINGS   buildings (a type of business per building, "add another")
 *                             spend-on  (what was spent on each)
 *                             amounts   (roughly how much, and when, each)
 *   STAGE 2  CHECKS           tax, claims, works — each asked PER BUILDING, with "same as Building 1"
 *   STAGE 3  YOUR DETAILS     details   (per building: the business that owns it, its legal form, the address)
 *   STAGE 4  YOUR FIGURE      the climbing reveal, then how to reach you: telephone, video call or email
 *
 * THE FIGURE IS SHOWN ONLY AT STAGE 4 (Lakhbir: "providing the full figure here means no one will give the
 * details"). Stage 2 ends in words about what their buildings hold, and stage 3 opens on "your figure is ready" with
 * the amount hidden. The page never carries the number before stage 4, not even hidden in the markup.
 *
 * A FOLLOW-UP IS ASKED ONLY WHEN ITS ANSWER CALLS FOR IT: "is it profitable" only after "yes, it pays UK tax"; "did
 * the seller claim" only for a building that was bought; "what kind, how much, when" only after "yes, there was other
 * work". The page shows and hides them with CSS (no script), and the SERVER decides: a follow-up that does not apply
 * is thrown away, and one that does is asked for again, with the screen kept, until it is answered.
 *
 * THE SUMS ARE THE ENGINE'S. Each building's ceiling is CB_FUNNEL.figure over that building alone (the sector band,
 * CB_BAND); a building whose owner pays no UK tax is left out and named; the words under the figure are the engine's
 * assumptions, with each building's tax condition added under its own name. Nothing here is a new number.
 *
 * THE OLD SIX SCREENS (Q1 to Q3) STILL WORK for a draft that uses them — every earlier link and test — but a draft
 * becomes a four-stage draft the moment its first building is saved, and `/assessment` now opens stage 1.
 */

import { h, raw, type Safe } from './html.ts';
import { FUNNEL, FRONTDOOR } from './engine.ts';
import { OPTIONS, addressFrom, submit, type Draft, type FunnelState } from './assessment.ts';
import { openLeadForGatedExit } from './leads.ts';
import type { Db } from '../db.ts';
import { normalisePostcode } from '../connectors/postcode-check.ts';
import type { CompanyCandidate } from '../connectors/company-search.ts';
import { localWhen, zoneNotice } from './localtime.ts';

export const F4_SCREENS = ['buildings', 'spend-on', 'amounts', 'tax', 'claims', 'works', 'details'] as const;
export type F4Screen = (typeof F4_SCREENS)[number];
export const F4_ROUTE = /^\/assessment\/(buildings|spend-on|amounts|tax|claims|works|details)$/;
export const MAX_BUILDINGS = 10;

export const STAGES = Object.freeze([
  { name: 'Your buildings', screens: ['buildings', 'spend-on', 'amounts'] },
  { name: 'Checks', screens: ['tax', 'claims', 'works'] },
  { name: 'Your details', screens: ['details'] },
  { name: 'Your figure', screens: [] },
] as const);

/** What each screen asks. Plain words; the question titles cover every answer offered. */
export const F4_TEXT: Readonly<Record<F4Screen, { heading: string; help: string }>> = Object.freeze({
  buildings: { heading: 'What type of business do you have?',
    help: 'Choose one for each building. If you have more than one building, add another.' },
  'spend-on': { heading: 'What did you spend on each building?', help: 'Choose the one that fits best for each building.' },
  amounts: { heading: 'Roughly how much, and when?', help: 'A rough figure is fine. If you do not know, tick the box.' },
  tax: { heading: 'Does the business that owns each building pay UK tax?',
    help: 'Capital allowances reduce a bill for UK income tax or corporation tax, so there has to be one to claim against. Buildings owned by different companies can have different answers.' },
  claims: { heading: 'Has anyone claimed on these buildings before?',
    help: 'Most people do not know, and that is fine. It does not stop a claim.' },
  works: { heading: 'Any other work done to these buildings?', help: 'Work done after you bought, built or fitted out the building.' },
  details: { heading: 'Who owns each building, and where is it?',
    help: 'Each building can belong to a different business. We use these to prepare your figure and to find the right records.' },
});

/** What each answer to "what did you spend" is called on the page, and on each building after. */
export const SPEND_ON: Readonly<Record<string, string>> = Object.freeze({
  purchase: 'We bought it',
  new_build: 'We built it (new build)',
  refurb: 'We refurbished or extended it',
  fit_out: 'We fitted out a building we lease',
});

/** What each kind of building holds that can qualify — the home page's sector cards' own words. */
export const HOLDS: Readonly<Record<string, string>> = Object.freeze({
  care_homes: 'nurse call, lifts, heating and hot water, and fire alarms',
  dental: 'the pipes and suction in each surgery, air lines, fans and lighting',
  gp: 'the sinks and pipes in each room, heating, lighting and data cables',
  supported_living: 'the shared parts of the building: corridors, stairs, lifts, plant rooms and staff areas',
  private_hospital: 'theatre ventilation, medical gases, lifts and standby power',
});

/** The three ways to be reached, as the figure's page offers them. `booking` is the bookings table's channel. */
export const REACH = Object.freeze([
  { id: 'phone', label: 'Telephone', books: true, capture: 'phone' },
  { id: 'video', label: 'Video call', books: true, capture: 'email' },
  { id: 'email', label: 'Email', books: false, capture: 'email' },
] as const);

type B = Record<string, unknown>;
type S = Record<string, unknown>;
const st = (d: { state: FunnelState }): S => d.state as unknown as S;

export function buildings(s: S): B[] {
  const p = s['properties'];
  return Array.isArray(p) ? p as B[] : [];
}
export function isFunnel4(s: FunnelState | S): boolean { return (s as S)['funnel'] === 4; }
export function markFunnel4(s: S): void {
  s['funnel'] = 4;
  if (buildings(s).length === 0) s['properties'] = [FUNNEL.blankProperty() as B];
}

const SECTOR = FUNNEL.SECTOR_LABEL as Record<string, string>;
const ENTITY = FUNNEL.ENTITY_LABEL as Record<string, string>;
export function label(b: B, i: number): string {
  const sec = typeof b['sector'] === 'string' ? SECTOR[b['sector']] : undefined;
  return sec === undefined ? `Building ${i + 1}` : `Building ${i + 1} · ${sec}`;
}

const pick = (v: string | null, allowed: readonly { value: string }[]): string | null =>
  v !== null && allowed.some((o) => o.value === v) ? v : null;
const clip = (v: string | null, max: number): string | null => {
  const t = (v ?? '').trim().replace(/\s+/g, ' ');
  return t === '' ? null : t.slice(0, max);
};
/** Digits only, and an unparseable figure stays NULL. It never becomes 0. */
function num(v: string | null): number | null {
  if (v === null) return null;
  const cleaned = v.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const MONTH_YEAR = /^(0?[1-9]|1[0-2])\/(19|20)\d{2}$|^(19|20)\d{2}$/;
const YEAR = /^(19|20)\d{2}$/;

/* ------------------------------------------------------------------ what is still missing */

/** The first screen that is not complete, or null when every screen is. The server keeps a person there. */
export function firstIncomplete(s: S): F4Screen | null {
  const bs = buildings(s);
  if (bs.length === 0 || bs.some((b) => typeof b['sector'] !== 'string')) return 'buildings';
  if (bs.some((b) => typeof b['trigger'] !== 'string')) return 'spend-on';
  if (bs.some((b) => (b['spend'] === null || b['spend'] === undefined) && b['spend_unknown'] !== true
    || (b['date'] === null || b['date'] === undefined) && b['date_unknown'] !== true)) return 'amounts';
  if (bs.some((b) => typeof b['is_uk_taxpayer'] !== 'string' || (b['is_uk_taxpayer'] === 'yes' && typeof b['current_year_position'] !== 'string'))) return 'tax';
  if (bs.some((b) => typeof b['own_prior_claim'] !== 'string' || (b['trigger'] === 'purchase' && typeof b['previous_owner_claimed'] !== 'string'))) return 'claims';
  if (bs.some((b) => typeof b['works'] !== 'string')) return 'works';
  if (bs.some((b) => typeof b['business_name'] !== 'string' || typeof b['entity_type'] !== 'string'
    || typeof b['line1'] !== 'string' || typeof b['postcode'] !== 'string')) return 'details';
  return null;
}

/** Every building's owner pays no UK tax: the reasoned negative, through the engine's own gate. */
export function allGated(s: S): boolean {
  const bs = buildings(s);
  return bs.length > 0 && bs.every((b) => b['is_uk_taxpayer'] === 'no');
}

/** The whole-assessment answers the engine and the old pages read, from the buildings'. */
function mirror(s: S): void {
  const bs = buildings(s);
  const tax = bs.map((b) => b['is_uk_taxpayer']);
  s['is_uk_taxpayer'] = tax.length > 0 && tax.every((t) => t === 'no') ? 'no' : tax.includes('yes') ? 'yes' : tax.length > 0 ? 'not sure' : null;
  s['current_year_position'] = (bs.find((b) => b['is_uk_taxpayer'] === 'yes')?.['current_year_position'] as string | undefined) ?? null;
  s['own_prior_claim'] = (bs[0]?.['own_prior_claim'] as string | undefined) ?? null;
  s['previous_owner_claimed'] = (bs.find((b) => b['trigger'] === 'purchase')?.['previous_owner_claimed'] as string | undefined) ?? null;
  s['trigger_default'] = (bs[0]?.['trigger'] as string | undefined) ?? null;
}

/* ------------------------------------------------------------------ reading each screen */

export type Applied = { errors: string[]; stay?: boolean };

export function applyF4(s: S, id: F4Screen, f: URLSearchParams): Applied {
  markFunnel4(s);
  const bs = buildings(s);
  const errors: string[] = [];
  const same = (i: number, what: string): boolean => i > 0 && f.get(`b${i}_same_${what}`) === 'on';
  const copy = (i: number, keys: readonly string[]): void => { for (const k of keys) { const v = bs[0]?.[k]; bs[i]![k] = v === undefined ? null : v; } };

  if (id === 'buildings') {
    bs.forEach((b, i) => {
      const sec = f.get(`b${i}_sector`);
      b['sector'] = sec !== null && Object.hasOwn(SECTOR, sec) ? sec : (typeof b['sector'] === 'string' ? b['sector'] : null);
    });
    const remove = f.get('remove');
    if (remove !== null) {
      const i = Number(remove);
      if (Number.isInteger(i) && i > 0 && i < bs.length) bs.splice(i, 1);
      return { errors, stay: true };
    }
    if (f.get('add') !== null) {
      if (bs.length < MAX_BUILDINGS) bs.push(FUNNEL.blankProperty() as B);
      return { errors, stay: true };
    }
    bs.forEach((b, i) => { if (typeof b['sector'] !== 'string') errors.push(`Choose the type of business for Building ${i + 1}.`); });
  }

  if (id === 'spend-on') {
    bs.forEach((b, i) => {
      const t = f.get(`b${i}_trigger`);
      b['trigger'] = t !== null && Object.hasOwn(SPEND_ON, t) ? t : null;
      if (b['trigger'] === null) errors.push(`Choose what you spent on ${label(b, i)}.`);
    });
  }

  if (id === 'amounts') {
    bs.forEach((b, i) => {
      b['spend_unknown'] = f.get(`b${i}_spend_unknown`) === 'on';
      b['spend'] = b['spend_unknown'] === true ? null : num(f.get(`b${i}_spend`));
      b['date_unknown'] = f.get(`b${i}_date_unknown`) === 'on';
      const date = clip(f.get(`b${i}_date`), 10);
      b['date'] = b['date_unknown'] === true ? null : date;
      if (b['spend'] === null && b['spend_unknown'] !== true) errors.push(`Tell us roughly how much for ${label(b, i)}, or tick "I don't know".`);
      if (b['date_unknown'] !== true) {
        if (date === null) errors.push(`Tell us roughly when for ${label(b, i)}, or tick "I don't know".`);
        else if (!MONTH_YEAR.test(date)) { b['date'] = null; errors.push(`For ${label(b, i)}, write the date as month and year, like 06/2021, or just the year.`); }
      }
    });
  }

  if (id === 'tax') {
    bs.forEach((b, i) => {
      if (same(i, 'tax')) { copy(i, ['is_uk_taxpayer', 'current_year_position']); b['same_tax'] = true; return; }
      b['same_tax'] = false;
      b['is_uk_taxpayer'] = pick(f.get(`b${i}_tax`), OPTIONS.is_uk_taxpayer);
      b['current_year_position'] = b['is_uk_taxpayer'] === 'yes' ? pick(f.get(`b${i}_profit`), OPTIONS.current_year_position) : null;
      if (b['is_uk_taxpayer'] === null) errors.push(`Tell us whether the business that owns ${label(b, i)} pays UK tax.`);
      else if (b['is_uk_taxpayer'] === 'yes' && b['current_year_position'] === null) errors.push(`Tell us whether the business that owns ${label(b, i)} is currently profitable.`);
    });
  }

  if (id === 'claims') {
    bs.forEach((b, i) => {
      if (same(i, 'claims')) {
        copy(i, ['own_prior_claim']);
        b['previous_owner_claimed'] = b['trigger'] === 'purchase' ? (bs[0]?.['trigger'] === 'purchase' ? bs[0]['previous_owner_claimed'] ?? null : pick(f.get(`b${i}_seller`), OPTIONS.previous_owner_claimed)) : null;
        b['same_claims'] = true;
      } else {
        b['same_claims'] = false;
        b['own_prior_claim'] = pick(f.get(`b${i}_prior`), OPTIONS.own_prior_claim);
        b['previous_owner_claimed'] = b['trigger'] === 'purchase' ? pick(f.get(`b${i}_seller`), OPTIONS.previous_owner_claimed) : null;
      }
      if (b['own_prior_claim'] === null || b['own_prior_claim'] === undefined) errors.push(`Tell us whether anyone has claimed on ${label(b, i)} before.`);
      if (b['trigger'] === 'purchase' && (b['previous_owner_claimed'] === null || b['previous_owner_claimed'] === undefined)) errors.push(`Tell us whether you know if the seller of ${label(b, i)} claimed.`);
    });
  }

  if (id === 'works') {
    bs.forEach((b, i) => {
      if (same(i, 'works')) {
        copy(i, ['works', 'works_type', 'works_spend', 'works_spend_unknown', 'works_year', 'works_year_unknown']);
        b['same_works'] = true;
        return;
      }
      b['same_works'] = false;
      b['works'] = pick(f.get(`b${i}_works`), OPTIONS.works);
      if (b['works'] !== 'yes') {
        // "No" asks nothing more, and anything typed under "yes" before is not kept.
        for (const k of ['works_type', 'works_spend', 'works_year']) b[k] = null;
        b['works_spend_unknown'] = false; b['works_year_unknown'] = false;
        if (b['works'] === null) errors.push(`Tell us whether any other work was done to ${label(b, i)}.`);
        return;
      }
      b['works_type'] = pick(f.get(`b${i}_works_type`), OPTIONS.works_type);
      b['works_spend_unknown'] = f.get(`b${i}_works_spend_unknown`) === 'on';
      b['works_spend'] = b['works_spend_unknown'] === true ? null : num(f.get(`b${i}_works_spend`));
      b['works_year_unknown'] = f.get(`b${i}_works_year_unknown`) === 'on';
      const y = clip(f.get(`b${i}_works_year`), 4);
      b['works_year'] = b['works_year_unknown'] === true ? null : y !== null && YEAR.test(y) ? y : null;
      if (b['works_type'] === null) errors.push(`Tell us what kind of work was done to ${label(b, i)}.`);
      if (b['works_spend'] === null && b['works_spend_unknown'] !== true) errors.push(`Tell us roughly how much the work on ${label(b, i)} cost, or tick "I don't know".`);
      if (b['works_year'] === null && b['works_year_unknown'] !== true) errors.push(`Tell us the year of the work on ${label(b, i)}, like 2023, or tick "I don't know".`);
    });
  }

  if (id === 'details') {
    bs.forEach((b, i) => {
      const results = (b['company_results'] ?? []) as CompanyCandidate[];
      if (same(i, 'business')) {
        copy(i, ['business_name', 'company_number', 'entity_type']);
        b['same_business'] = true;
      } else {
        b['same_business'] = false;
        const picked = f.get(`b${i}_company_number`);
        const chosen = picked !== null && picked !== 'none' ? results.find((c) => c.number === picked) : undefined;
        if (chosen !== undefined) { b['company_number'] = chosen.number; b['business_name'] = chosen.name; b['company_name_chosen'] = chosen.name; }
        else {
          const typed = clip(f.get(`b${i}_business`), 200);
          b['business_name'] = typed;
          if (picked === 'none' || typed !== b['company_name_chosen']) { b['company_number'] = null; b['company_name_chosen'] = null; }
        }
        const ent = f.get(`b${i}_entity`);
        b['entity_type'] = ent !== null && Object.hasOwn(ENTITY, ent) ? ent : null;
      }
      const before = b['postcode'];
      b['line1'] = clip(f.get(`b${i}_line1`), 200);
      b['town'] = clip(f.get(`b${i}_town`), 100);
      const pcTyped = clip(f.get(`b${i}_postcode`), 10);
      const pc = pcTyped === null ? null : normalisePostcode(pcTyped);
      b['postcode'] = pc;
      if (pc !== before) delete b['postcode_check'];
      const address = addressFrom({ line1: b['line1'] as string | null, town: b['town'] as string | null, postcode: pc ?? pcTyped });
      if (address !== null) b['address'] = address;
      if (b['business_name'] === null || b['business_name'] === undefined) errors.push(`Tell us the name of the business that owns ${label(b, i)}.`);
      if (b['entity_type'] === null || b['entity_type'] === undefined) errors.push(`Tell us what kind of business owns ${label(b, i)}.`);
      if (b['line1'] === null) errors.push(`Tell us the building name or number, and the street, for ${label(b, i)}.`);
      if (pcTyped === null) errors.push(`Tell us the postcode for ${label(b, i)}.`);
      else if (pc === null) errors.push(`The postcode for ${label(b, i)} does not look like a UK postcode. Check it and try again.`);
    });
    // The first building's business is the name the last page and the organisation record carry by default.
    const c = (s['contact'] ??= {}) as Record<string, unknown>;
    c['business_name'] = bs[0]?.['business_name'] ?? null;
  }

  mirror(s);
  return { errors };
}

/* ------------------------------------------------------------------ the figure, per building */

export type BuildingFigure = {
  readonly index: number; readonly label: string; readonly address: string | null;
  readonly high: number | null; readonly low: number | null;
  /** Why this building is not counted, in words; null when it is. */
  readonly left_out: string | null;
};

export function figureF4(s: S): { high: number; low: number; parts: BuildingFigure[]; assumptions: string[] } {
  const bs = buildings(s);
  const parts: BuildingFigure[] = bs.map((b, i) => {
    const base = { index: i, label: label(b, i), address: typeof b['address'] === 'string' ? b['address'] : null };
    if (b['is_uk_taxpayer'] === 'no') {
      return { ...base, high: null, low: null, left_out: 'Not included: the business that owns it does not pay UK income tax or corporation tax, so there is no bill to reduce.' };
    }
    const one = FUNNEL.figure({ ...(s as object), properties: [b] } as unknown as FunnelState) as unknown as { total?: number; breakdown?: { low?: number; high?: number; ceiling?: number }[] };
    const row = one.breakdown?.[0];
    const high = typeof row?.ceiling === 'number' ? row.ceiling : typeof row?.high === 'number' ? row.high : null;
    return { ...base, high, low: typeof row?.low === 'number' ? row.low : null,
      left_out: high === null ? 'We need a rough figure for what was spent on this one before we can size it.' : null };
  });
  const counted = parts.filter((p) => p.high !== null);
  const high = counted.reduce((a, p) => a + (p.high ?? 0), 0);
  const low = counted.reduce((a, p) => a + (p.low ?? 0), 0);
  // The engine's own words, for a building that pays tax and has made no earlier claim; each building's own
  // condition is then added under its name, from the engine's gate.
  const plain = FUNNEL.assumptions({ ...(s as object), is_uk_taxpayer: 'yes', current_year_position: 'profitable', own_prior_claim: 'no',
    properties: bs.filter((b) => b['is_uk_taxpayer'] !== 'no') } as unknown as FunnelState) as string[];
  const out = [...plain];
  bs.forEach((b, i) => {
    if (b['is_uk_taxpayer'] === 'no') return;
    const g = FRONTDOOR.gateQ1b({ is_uk_taxpayer: b['is_uk_taxpayer'] as string | null, current_year_position: b['current_year_position'] as string | null } as never) as { condition?: string | null };
    if (typeof g.condition === 'string' && g.condition !== '') out.push(`${label(b, i)}: ${g.condition}`);
    if (b['own_prior_claim'] === 'yes' || b['own_prior_claim'] === 'not sure') {
      out.push(`${label(b, i)}: you told us a claim may already have been made on its fixtures. That does not stop the assessment, but an adviser will go through it with you before any figure is relied on.`);
    }
  });
  return { high, low, parts, assumptions: out };
}

/* ------------------------------------------------------------------ drawing */

export function stageBar(current: number): Safe {
  return h`<ol class="f4-stages" aria-label="Your progress">${STAGES.map((sg, i) => h`<li class="${i < current ? 'done' : i === current ? 'cur' : ''}"${i === current ? raw(' aria-current="step"') : raw('')}>${sg.name}</li>`)}</ol>`;
}
export function stageOf(id: F4Screen): number { return STAGES.findIndex((sg) => (sg.screens as readonly string[]).includes(id)); }

const checked = (a: unknown, b: string): Safe => raw(a === b ? ' checked' : '');
function radios(name: string, opts: readonly { value: string; label: string }[], selected: unknown, cls = ''): Safe {
  return h`<div class="opts ${cls}">${opts.map((o) => h`<label class="opt"><input type="radio" name="${name}" value="${o.value}"${checked(selected, o.value)}> ${o.label}</label>`)}</div>`;
}
function sameBox(i: number, what: string, on: unknown, text = 'Same answers as Building 1'): Safe {
  if (i === 0) return raw('');
  return h`<label class="ck f4-same"><input type="checkbox" name="b${i}_same_${what}"${raw(on === true ? ' checked' : '')}> ${text}</label>`;
}

/** The screen's own questions. The router puts them in the page, with the stage bar and the errors. */
export function screenBody(s: S, id: F4Screen, lookups: { company: boolean; postcode: boolean }): Safe {
  const bs = buildings(s);
  const sectorOpts = Object.keys(SECTOR).map((k) => ({ value: k, label: SECTOR[k] ?? k }));
  const spendOpts = Object.keys(SPEND_ON).map((k) => ({ value: k, label: SPEND_ON[k] ?? k }));
  const card = (b: B, i: number, inner: Safe): Safe => h`<fieldset class="f4-b" id="b${i}"><legend>${label(b, i)}</legend>${inner}</fieldset>`;

  if (id === 'buildings') {
    return h`${bs.map((b, i) => h`<fieldset class="f4-b" id="b${i}"><legend>Building ${i + 1}</legend>
        ${radios(`b${i}_sector`, sectorOpts, b['sector'], 'f4-cards')}
        ${i === 0 ? raw('') : h`<p><button type="submit" name="remove" value="${String(i)}" class="btn-quiet" formnovalidate>Remove Building ${i + 1}</button></p>`}
      </fieldset>`)}
      ${bs.length < MAX_BUILDINGS ? h`<p><button type="submit" name="add" value="1" class="btn-quiet f4-add" formnovalidate>+ Add another building</button></p>` : raw('')}`;
  }
  if (id === 'spend-on') return h`${bs.map((b, i) => card(b, i, radios(`b${i}_trigger`, spendOpts, b['trigger'])))}`;
  if (id === 'amounts') {
    return h`${bs.map((b, i) => {
      const f = FRONTDOOR.spendFieldsFor(b['trigger']) as { label?: string; dateLabel?: string } | null;
      return card(b, i, h`<p class="help">${SPEND_ON[String(b['trigger'])] ?? ''}</p>
        <label class="fl" for="b${i}-spend">${f?.label ?? 'Roughly what was spent'}</label>
        <input class="fi" id="b${i}-spend" name="b${i}_spend" inputmode="numeric" placeholder="£" value="${b['spend'] === null || b['spend'] === undefined ? '' : String(b['spend'])}">
        <label class="ck"><input type="checkbox" name="b${i}_spend_unknown"${raw(b['spend_unknown'] === true ? ' checked' : '')}> I don't know</label>
        <label class="fl" for="b${i}-date">${f?.dateLabel ?? 'Roughly when'}</label>
        <input class="fi" id="b${i}-date" name="b${i}_date" placeholder="MM/YYYY" value="${typeof b['date'] === 'string' ? b['date'] : ''}">
        <label class="ck"><input type="checkbox" name="b${i}_date_unknown"${raw(b['date_unknown'] === true ? ' checked' : '')}> I don't know</label>`);
    })}`;
  }
  if (id === 'tax') {
    return h`${teaser(bs)}${bs.map((b, i) => card(b, i, h`${sameBox(i, 'tax', b['same_tax'])}
      <div class="f4-own">
        <p class="fl">Does the business that owns this building pay UK income tax or corporation tax?</p>
        ${radios(`b${i}_tax`, OPTIONS.is_uk_taxpayer, b['is_uk_taxpayer'], 'f4-tax')}
        <div class="f4-follow f4-if-tax-yes"><p class="fl">Is that business currently running at a profit?</p>
          ${radios(`b${i}_profit`, OPTIONS.current_year_position, b['current_year_position'])}</div>
      </div>`))}`;
  }
  if (id === 'claims') {
    return h`${bs.map((b, i) => card(b, i, h`${sameBox(i, 'claims', b['same_claims'], 'Same answer as Building 1')}
      <div class="f4-own">
        <p class="fl">Has anyone already claimed on the fixtures in this building, such as the wiring and heating?</p>
        ${radios(`b${i}_prior`, OPTIONS.own_prior_claim, b['own_prior_claim'])}
      </div>
      ${b['trigger'] === 'purchase' ? h`<p class="fl">You bought this one. Do you know whether the seller claimed?</p>
        <p class="help">For purchases since April 2014, a seller who claimed is usually what makes your own claim possible.</p>
        ${radios(`b${i}_seller`, OPTIONS.previous_owner_claimed, b['previous_owner_claimed'])}` : raw('')}`))}`;
  }
  if (id === 'works') {
    return h`${bs.map((b, i) => card(b, i, h`${sameBox(i, 'works', b['same_works'], 'Same answer as Building 1')}
      <div class="f4-own">
        <p class="fl">Has any other work been done to this building since?</p>
        ${radios(`b${i}_works`, OPTIONS.works, b['works'], 'f4-works')}
        <div class="f4-follow f4-if-works-yes">
          <p class="fl">What kind?</p>
          ${radios(`b${i}_works_type`, OPTIONS.works_type, b['works_type'], 'f4-kind')}
          <p class="help f4-if-cosmetic">Worth knowing: cosmetic work usually counts as a repair. A repair is not a capital improvement. That is often better for you — it comes off your tax bill straight away — but it is a different claim from this one.</p>
          <label class="fl" for="b${i}-wspend">Roughly how much?</label>
          <input class="fi" id="b${i}-wspend" name="b${i}_works_spend" inputmode="numeric" placeholder="£" value="${b['works_spend'] === null || b['works_spend'] === undefined ? '' : String(b['works_spend'])}">
          <label class="ck"><input type="checkbox" name="b${i}_works_spend_unknown"${raw(b['works_spend_unknown'] === true ? ' checked' : '')}> I don't know</label>
          <label class="fl" for="b${i}-wyear">Roughly when? (the year)</label>
          <input class="fi" id="b${i}-wyear" name="b${i}_works_year" inputmode="numeric" placeholder="YYYY" value="${typeof b['works_year'] === 'string' ? b['works_year'] : ''}">
          <label class="ck"><input type="checkbox" name="b${i}_works_year_unknown"${raw(b['works_year_unknown'] === true ? ' checked' : '')}> I don't know</label>
        </div>
      </div>`))}`;
  }
  // details
  const entityOpts = Object.keys(ENTITY).map((k) => ({ value: k, label: ENTITY[k] ?? k }));
  return h`${ready(bs.length)}${bs.map((b, i) => {
    const results = (b['company_results'] ?? []) as CompanyCandidate[];
    const note = typeof b['company_note'] === 'string' ? b['company_note'] : null;
    const chosen = typeof b['company_number'] === 'string' ? b['company_number'] : null;
    const pcc = b['postcode_check'] as { postcode: string; council_area: string | null; region: string | null; country: string | null } | { not_found: string } | undefined;
    return card(b, i, h`${sameBox(i, 'business', b['same_business'], 'Same business as Building 1')}
      <div class="f4-own">
        <label class="fl" for="b${i}-business">The business that owns this building</label>
        <input class="fi" id="b${i}-business" name="b${i}_business" value="${typeof b['business_name'] === 'string' ? b['business_name'] : ''}" autocomplete="organization">
        ${lookups.company ? h`<p><button type="submit" name="find" value="company:${String(i)}" class="btn-quiet" formnovalidate>Find this company</button></p>` : raw('')}
        ${results.length === 0 ? raw('') : h`<div class="opts">${results.map((c) => h`<label class="opt"><input type="radio" name="b${i}_company_number" value="${c.number}"${checked(chosen, c.number)}>
          ${c.name} <span class="help">· company number ${c.number}${c.status === null ? '' : ` · ${c.status}`}${c.office_postcode === null ? '' : ` · registered office ${c.office_postcode}`}</span></label>`)}
          <label class="opt"><input type="radio" name="b${i}_company_number" value="none"> None of these</label></div>`}
        ${note === null ? raw('') : h`<p class="help">${note}</p>`}
        <p class="fl">What kind of business is it?</p>
        ${radios(`b${i}_entity`, entityOpts, b['entity_type'])}
      </div>
      <label class="fl" for="b${i}-line1">Building name or number, and street</label>
      <input class="fi" id="b${i}-line1" name="b${i}_line1" value="${typeof b['line1'] === 'string' ? b['line1'] : ''}" autocomplete="address-line1">
      <label class="fl" for="b${i}-town">Town</label>
      <input class="fi" id="b${i}-town" name="b${i}_town" value="${typeof b['town'] === 'string' ? b['town'] : ''}" autocomplete="address-level2">
      <label class="fl" for="b${i}-postcode">Postcode</label>
      <input class="fi" id="b${i}-postcode" name="b${i}_postcode" value="${typeof b['postcode'] === 'string' ? b['postcode'] : ''}" autocomplete="postal-code">
      ${lookups.postcode ? h`<p><button type="submit" name="find" value="postcode:${String(i)}" class="btn-quiet" formnovalidate>Check postcode</button></p>` : raw('')}
      ${pcc === undefined ? raw('') : 'not_found' in pcc ? h`<p class="help">${pcc.not_found}</p>`
        : h`<p class="help">We found the postcode ${pcc.postcode}${[pcc.council_area, pcc.region, pcc.country].filter((x) => x !== null).length > 0 ? `: ${[pcc.council_area, pcc.region, pcc.country].filter((x) => x !== null).join(', ')}` : ''}.</p>`}`);
  })}`;
}

/** After stage 1: what their buildings hold, in words. Never a number. */
function teaser(bs: readonly B[]): Safe {
  const kinds = [...new Set(bs.map((b) => b['sector']).filter((x): x is string => typeof x === 'string'))];
  if (kinds.length === 0) return raw('');
  const names = kinds.map((k) => (SECTOR[k] ?? k).toLowerCase().replace(/^gp/, 'GP'));
  return h`<div class="f4-teaser"><p class="f4-kicker">Good news</p>
    <p>${kinds.length === 1 ? `A ${names[0]}` : `Your ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`} ${kinds.length === 1 ? 'holds' : 'hold'} fixtures that can qualify:</p>
    <ul>${kinds.map((k) => h`<li><strong>${SECTOR[k] ?? k}:</strong> ${HOLDS[k] ?? ''}</li>`)}</ul>
    <p>Three quick checks for each building, so your figure holds up.</p></div>`;
}

/** Before stage 3: the figure is ready, and hidden. The number is not in the page, not even hidden. */
function ready(n: number): Safe {
  return h`<div class="f4-ready"><p class="f4-kicker">Your figure is ready</p>
    <p class="f4-hidden" aria-hidden="true">£&nbsp;<span>000,000</span></p>
    <p>We have worked out your figure for ${n === 1 ? 'your building' : `your ${String(n)} buildings`}. Tell us who owns ${n === 1 ? 'it' : 'each one'} and where ${n === 1 ? 'it is' : 'they are'}, and we will show it.</p></div>`;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The climbing number: one reel of digits per place, rolled to its digit by CSS alone. The real amount is text. */
export function revealAmount(pounds: number): Safe {
  const text = '£' + Math.round(pounds).toLocaleString('en-GB');
  const chars = [...text];
  let place = 0;
  const reels = chars.map((ch) => {
    if (!/[0-9]/.test(ch)) return h`<span class="f4-sep">${ch}</span>`;
    const p = place++;
    return h`<span class="f4-reel f4-r${ch} f4-p${String(Math.min(p, 9))}"><span>${DIGITS.map((n) => h`<i>${n}</i>`)}</span></span>`;
  });
  return h`<p class="f4-amount"><span class="vh">${text}</span><span class="f4-reels" aria-hidden="true">${reels}</span></p>`;
}

/** Stage 4: the reveal, the buildings under it, the words it rests on, and how to reach you. */
export function figureBody(s: S, slots: { available: true; slots: readonly { starts_at: string }[] } | { available: false; say: string }, error: string | undefined, roles: readonly (readonly [string, string])[]): Safe {
  const fig = figureF4(s);
  const c = (s['contact'] ?? {}) as Record<string, unknown>;
  const v = (k: string): string => (typeof c[k] === 'string' ? c[k] as string : '');
  const reach = typeof c['channel'] === 'string' ? c['channel'] as string : '';
  return h`<div class="f4-reveal">
      <p class="f4-kicker">Your figure</p>
      <p class="f4-lead">Your buildings could hold qualifying fixtures worth up to</p>
      ${revealAmount(fig.high)}
      <p class="help">A ceiling, not a forecast. Researching your buildings will move it down, not up.</p>
    </div>
    <div class="f4-parts">${fig.parts.map((p) => h`<div class="f4-part"><p class="f4-part-name">${p.label}${p.address === null ? '' : ` — ${p.address}`}</p>
      ${p.high === null ? h`<p class="help">${p.left_out ?? ''}</p>` : h`<p class="f4-part-figure">up to £${Math.round(p.high).toLocaleString('en-GB')}</p>`}</div>`)}</div>
    <details class="f4-assume"><summary>What this figure assumes</summary><ul>${fig.assumptions.map((a) => h`<li>${a}</li>`)}</ul></details>

    <h2 id="reach">How should we reach you?</h2>
    <p class="help">Turning this into a figure you can rely on takes a conversation with our team.</p>
    ${error === undefined ? raw('') : h`<p class="err" role="alert">${error}</p>`}
    <form method="post" action="/assessment/close" class="f4-reachform">
      <div class="f4-names">
        <div><label class="fl" for="r-first">First name</label><input class="fi" id="r-first" name="first_name" value="${v('first_name')}" autocomplete="given-name" required></div>
        <div><label class="fl" for="r-surname">Surname</label><input class="fi" id="r-surname" name="surname" value="${v('surname')}" autocomplete="family-name" required></div>
      </div>
      <label class="fl" for="r-role">Your position in the business</label>
      <select class="fi" id="r-role" name="job_role" required><option value="">Choose…</option>${roles.map(([k, l]) => h`<option value="${k}"${raw(v('job_role') === k ? ' selected' : '')}>${l}</option>`)}</select>
      <fieldset class="f4-channels"><legend>How would you like to talk?</legend>
        <div class="f4-channel-cards">${REACH.map((r) => h`<label class="f4-channel"><input type="radio" name="channel" value="${r.id}"${checked(reach, r.id)}> ${r.label}</label>`)}</div>
        <div class="f4-for-slot">
          <p class="fl">Choose a date and time</p>
          ${slots.available ? h`<p class="help">${zoneNotice(slots.slots[0]?.starts_at ?? '')}</p>
            <div class="opts f4-slots">${slots.slots.slice(0, 24).map((sl) => h`<label class="opt"><input type="radio" name="slot" value="${sl.starts_at}"${checked(v('slot'), sl.starts_at)}> ${localWhen(sl.starts_at)}</label>`)}
              <label class="opt"><input type="radio" name="slot" value=""${raw(v('slot') === '' ? ' checked' : '')}> None of these times suit me — please get in touch to arrange one</label></div>`
            : h`<div class="flag">${slots.say}</div>`}
        </div>
        <div class="f4-for-phone"><label class="fl" for="r-phone">Your telephone number</label>
          <input class="fi" id="r-phone" name="phone" type="tel" value="${reach === 'phone' ? v('contact_value') : ''}" autocomplete="tel"></div>
        <div class="f4-for-email"><label class="fl" for="r-email">Your email address</label>
          <input class="fi" id="r-email" name="email" type="email" value="${reach === 'video' || reach === 'email' ? v('contact_value') : ''}" autocomplete="email">
          <p class="help f4-for-video-note">We will email you the link for the video call.</p></div>
      </fieldset>
      <div class="f4-consent"><label class="ck"><input type="checkbox" name="contact_consent"${raw(c['contact_consent'] === true ? ' checked' : '')}> Yes, you may contact me about this enquiry.</label>
      <label class="ck"><input type="checkbox" name="marketing_optin"${raw(c['marketing_optin'] === true ? ' checked' : '')}> Separately, you may send me occasional updates. (Optional, and never a condition of sending.)</label></div>
      <button class="cta" type="submit">Send</button>
    </form>`;
}

/** Read "how should we reach you". Undefined when it is complete; otherwise what is missing, in words. */
export function applyReach(s: S, f: URLSearchParams, roles: readonly (readonly [string, string])[], problem: (channel: 'phone' | 'email', value: string) => string | undefined): string | undefined {
  const c = (s['contact'] ??= {}) as Record<string, unknown>;
  const first = clip(f.get('first_name'), 100);
  const surname = clip(f.get('surname'), 100);
  const role = f.get('job_role') ?? '';
  const channel = REACH.find((r) => r.id === f.get('channel'));
  c['first_name'] = first; c['surname'] = surname;
  c['job_role'] = roles.some(([k]) => k === role) ? role : null;
  c['marketing_optin'] = f.get('marketing_optin') === 'on';
  if (first === null || surname === null) return 'We need your first name and surname.';
  if (c['job_role'] === null) return 'Choose your position in the business.';
  if (channel === undefined) return 'Choose how you would like us to reach you: telephone, video call or email.';
  const value = ((channel.capture === 'phone' ? f.get('phone') : f.get('email')) ?? '').trim();
  c['channel'] = channel.id;
  c['contact_value'] = value;
  const wrong = problem(channel.capture, value);
  if (wrong !== undefined) return wrong;
  if (f.get('contact_consent') !== 'on') return 'We need your permission to contact you about this. It is not marketing consent.';
  c['full_name'] = `${first} ${surname}`;
  c['contact_consent'] = true;
  c['sms_variant'] = null;
  c['slot'] = channel.books ? (f.get('slot') ?? null) : null;
  return undefined;
}

/** The buildings grouped by the business that owns each: one organisation per business (Lakhbir, 30 Sep 2026). */
export function byBusiness(s: S): { name: string; company_number: string | null; entity_type: string | null; indexes: number[] }[] {
  const groups = new Map<string, { name: string; company_number: string | null; entity_type: string | null; indexes: number[] }>();
  buildings(s).forEach((b, i) => {
    const name = typeof b['business_name'] === 'string' ? b['business_name'].trim() : `Building ${i + 1}`;
    const number = typeof b['company_number'] === 'string' ? b['company_number'] : null;
    const key = number !== null ? `n:${number}` : `s:${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(limited|ltd|llp|plc)\b/g, '').trim()}`;
    const g = groups.get(key) ?? { name, company_number: number, entity_type: typeof b['entity_type'] === 'string' ? b['entity_type'] : null, indexes: [] };
    g.indexes.push(i);
    groups.set(key, g);
  });
  return [...groups.values()];
}

/** One business's share of the assessment, shaped as the engine and the old submission read a funnel. */
export function stateForBusiness(s: S, g: { name: string; company_number: string | null; indexes: number[] }): FunnelState {
  const bs = buildings(s).filter((_, i) => g.indexes.includes(i)).map((b) => ({ ...b }));
  const t: S = { ...s, properties: bs, company_number: g.company_number, contact: { ...((s['contact'] ?? {}) as object), business_name: g.name } };
  mirror(t);
  delete t['start'];
  return t as unknown as FunnelState;
}

/* ------------------------------------------------------------------ sending it */

export type EnquiryPart = {
  readonly name: string; readonly business_id: string | null; readonly assessment_id: string | null; readonly lead_id: string;
  readonly low_pence: number | null; readonly high_pence: number | null;
};

/**
 * ONE ORGANISATION PER BUSINESS THAT OWNS A BUILDING, each through the same `submit` the old funnel used — its own
 * organisation, properties, assessment, answers and lead — because each company signs and claims in its own name
 * (Lakhbir, 30 Sep 2026: "One record per company"). A business whose every building has no UK tax to relieve gets the
 * reasoned negative's lead instead, with its name and no figure. Every lead carries one `enquiry_id` (migration 061).
 */
export function submitEnquiry(db: Db, d: Draft, now: () => string, id: () => string): { enquiry_id: string; parts: EnquiryPart[] } {
  const s = d.state as unknown as S;
  const enquiry_id = id();
  const parts: EnquiryPart[] = [];
  for (const g of byBusiness(s)) {
    const gs = stateForBusiness(s, g);
    const gb = buildings(gs as unknown as S);
    if (gb.every((b) => b['is_uk_taxpayer'] === 'no')) {
      const lead_id = db.tx(() => openLeadForGatedExit(db, id, { prospect_organisation: g.name, at: now() }));
      parts.push({ name: g.name, business_id: null, assessment_id: null, lead_id, low_pence: null, high_pence: null });
      continue;
    }
    // A building in this business whose owner pays no UK tax is kept as a property, and counted as nothing.
    const counted = { ...(gs as unknown as S), properties: gb.map((b) => b['is_uk_taxpayer'] === 'no' ? { ...b, spend: null, spend_unknown: true } : b) } as unknown as FunnelState;
    const out = submit(db, { token: d.token, state: counted, screen: d.screen }, now, id);
    parts.push({ name: g.name, business_id: out.business_id, assessment_id: out.assessment_id, lead_id: out.lead_id, low_pence: out.low_pence, high_pence: out.high_pence });
  }
  db.tx(() => {
    for (const p of parts) db.run('UPDATE leads SET enquiry_id = ? WHERE id = ?', [enquiry_id, p.lead_id]);
    const first = parts.find((p) => p.assessment_id !== null);
    if (first !== undefined) db.run('UPDATE assessment_drafts SET submitted_assessment_id = ? WHERE token = ?', [first.assessment_id, d.token]);
  });
  return { enquiry_id, parts };
}
