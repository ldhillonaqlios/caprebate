/**
 * THE MONEY READINGS, SWITCHED ON IN TEST — PHASE 159i, 10 October 2026.
 *
 * Lakhbir, 29 September 2026: "anything you need signing off we build it, we then ask ... if its viable" — and 9 October
 * 2026, the target: "the highest figure we can defend". Each reading below is built in the survey pack, ON on the test
 * system (the test website, or a copy started with CAPREBATE_COST_MODEL_TEST=1, as the BCIS test figures are) and OFF
 * everywhere else, and each is a viability question to the tax adviser in the Word questions document (273-277):
 *
 *   grant_untraced_full     (Rulebook F, F-R12) a grant not traced to the items it paid for comes off in full, not as an
 *                           equal share of the price; a traced one comes off its items (grant_traced_to_elements)
 *   transaction_tax_in_base (#11) the stamp duty or land transaction tax paid is part of the price shared out
 *   legal_fees_in_base      (#13) the legal and other acquisition fees are part of the price shared out
 *   s185_plus_own_s25       (#1)  the buyer's own alterations to install plant (s.25) are claimed on top of the cap
 *   vat_shared_with_land    (C12) irrecoverable VAT, and those costs, are shared between the land and the building
 *
 * The public estimate's own switches (CB_CTA, in the site file) are not touched: the site harness asserts them off, and
 * they move the figure every visitor sees. The pack reads these instead, as arguments, so both ways are tested.
 */
import { onTestWebsite, type Env } from '../connectors/place.ts';

export type MoneyReadings = {
  readonly grant_untraced_full: boolean;
  readonly transaction_tax_in_base: boolean;
  readonly legal_fees_in_base: boolean;
  readonly s185_plus_own_s25: boolean;
  readonly vat_shared_with_land: boolean;
  /** PHASE 159k (item 2): plant with an expected life of 25 years or more goes to the special rate pool where a year's
   *  long-life spend passes £100,000 (s.90-104; src/web/allowances.ts). */
  readonly long_life_test: boolean;
  /** PHASE 159k (item 2): removing asbestos that was there when a company acquired the land is land remediation relief, a
   *  150% deduction (CTA 2009 Part 14), shown in the return entries — never an allowance. */
  readonly asbestos_lrr: boolean;
  /** PHASE 159k (item 2, #20): repairs to an integral feature that pass half its replacement cost in twelve months are
   *  capital (s.33B), read across the building's pieces of work (src/web/survey-pack.ts). */
  readonly s33b_aggregation: boolean;
};

const ALL_ON: MoneyReadings = Object.freeze({ grant_untraced_full: true, transaction_tax_in_base: true, legal_fees_in_base: true, s185_plus_own_s25: true, vat_shared_with_land: true,
  long_life_test: true, asbestos_lrr: true, s33b_aggregation: true });
const ALL_OFF: MoneyReadings = Object.freeze({ grant_untraced_full: false, transaction_tax_in_base: false, legal_fees_in_base: false, s185_plus_own_s25: false, vat_shared_with_land: false,
  long_life_test: false, asbestos_lrr: false, s33b_aggregation: false });

/** True on the test system: the test website, or a copy started with CAPREBATE_COST_MODEL_TEST=1. */
export function testSystemHere(env: Env = process.env): boolean {
  return onTestWebsite(env) || (env['CAPREBATE_COST_MODEL_TEST'] ?? '').trim() === '1';
}

/** The readings for this copy: all on on the test system, all off elsewhere. */
export function moneyReadingsHere(env: Env = process.env): MoneyReadings {
  return testSystemHere(env) ? ALL_ON : ALL_OFF;
}

/**
 * PHASE 159j (Lockwood finding L14), 10 October 2026: THE TAX ADVISER'S SWITCHES AS THE SURVEY PACK READS THEM. The pack
 * applies the readings above on the test system, but the claim page's facts panel and the sign-off form read the public
 * estimate's own switches (CB_CTA), which stay off, so a person signing off read "Off ... not added" beside a figure that
 * had added the stamp duty. Each CB_CTA switch the pack honours from these readings reads ON here when the pack applies
 * it; every other switch reads as CB_CTA says. Nothing here changes CB_CTA.
 */
export const PACK_SWITCH_OF: Readonly<Record<string, keyof MoneyReadings>> = Object.freeze({
  transaction_tax_in_base: 'transaction_tax_in_base', legal_fees_in_base: 'legal_fees_in_base',
  s185_plus_own_s25: 's185_plus_own_s25', grant_traced_to_elements: 'grant_untraced_full',
  s33b_aggregation: 's33b_aggregation',   // PHASE 159k
});

export function packSwitchReadings(cta: readonly { readonly switch: string; readonly on: boolean }[], money: MoneyReadings = moneyReadingsHere()):
  { readonly switch: string; readonly on: boolean }[] {
  return cta.map((s) => { const m = PACK_SWITCH_OF[s.switch]; return m !== undefined && money[m] ? { switch: s.switch, on: true } : { switch: s.switch, on: s.on }; });
}

export const MONEY_READINGS_ON = ALL_ON;
export const MONEY_READINGS_OFF = ALL_OFF;
