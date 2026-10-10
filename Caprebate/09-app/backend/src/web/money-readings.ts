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
};

const ALL_ON: MoneyReadings = Object.freeze({ grant_untraced_full: true, transaction_tax_in_base: true, legal_fees_in_base: true, s185_plus_own_s25: true, vat_shared_with_land: true });
const ALL_OFF: MoneyReadings = Object.freeze({ grant_untraced_full: false, transaction_tax_in_base: false, legal_fees_in_base: false, s185_plus_own_s25: false, vat_shared_with_land: false });

/** True on the test system: the test website, or a copy started with CAPREBATE_COST_MODEL_TEST=1. */
export function testSystemHere(env: Env = process.env): boolean {
  return onTestWebsite(env) || (env['CAPREBATE_COST_MODEL_TEST'] ?? '').trim() === '1';
}

/** The readings for this copy: all on on the test system, all off elsewhere. */
export function moneyReadingsHere(env: Env = process.env): MoneyReadings {
  return testSystemHere(env) ? ALL_ON : ALL_OFF;
}

export const MONEY_READINGS_ON = ALL_ON;
export const MONEY_READINGS_OFF = ALL_OFF;
