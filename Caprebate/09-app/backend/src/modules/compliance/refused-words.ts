/**
 * WHAT NO EMAIL, LETTER OR BREACH ENTRY MAY CARRY: bank details, an invoice, and anything that would tip somebody off.
 *
 * Moved here from src/modules/admin/templates.ts (Phase 161l2): the compliance registers ask it of every letter they
 * queue and of every breach entry's prose, and compliance sits below admin, so the list is compliance's and the
 * templates and free-typed emails (admin) read it through compliance's front door. The words and their order are
 * unchanged: the third to the ninth are the bank-detail words and shapes (the breach register's), the last six the
 * tipping-off words.
 * Migrations 012, 016 and 017 give the email tables' triggers the same words.
 */

export const REFUSED_WORDS: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/invoice/i, 'an invoice'],
  [/remittance/i, 'a remittance'],
  [/sort[\s-]*code/i, 'a sort code'],
  [/account\s*(number|no\b)/i, 'an account number'],
  [/\biban\b/i, 'an IBAN'],
  [/bank\s*(details?|account)/i, 'bank details'],
  [/\b\d{2}[\s-]\d{2}[\s-]\d{2}\b/, 'something shaped like a sort code'],
  [/\b\d{8}\b/, 'something shaped like an account number'],
  [/\b[A-Z]{2}\d{2}\s?[A-Z]{4}\s?\d{4}/i, 'something shaped like an IBAN'],
  // CRM 7 of 10: what an invoice email or a chasing email would carry under another word. Migration 016 widens the
  // table's trigger pair to the same words; the shapes above stay first, so a sort code is still named as one.
  [/remit/i, 'a remittance'],
  [/payment\s*details?/i, 'payment details'],
  [/bank\s*transfer/i, 'a bank transfer'],
  [/\bpay(?:ment)?\s+(?:to|into)\b/i, 'where to pay'],
  [/amount\s+(?:due|outstanding)/i, 'an amount due'],
  [/fee\s+note/i, 'a fee note'],
  [/statement\s+of\s+account/i, 'a statement of account'],
  // CRM 8 of 10: NO TIPPING OFF. Nothing a client or an accountant reads may say that anybody suspects anything, or
  // that a due diligence check is being run on them. Migration 017 widens the table's trigger pair to the same words.
  [/money\s+laundering/i, 'a reference to money laundering'],
  [/suspicio/i, 'a suspicion'],
  [/national\s+crime\s+agency/i, 'a reference to the National Crime Agency'],
  [/nominated\s+officer/i, 'a reference to the nominated officer'],
  [/due\s+diligence/i, 'a reference to due diligence'],
  [/tipping[\s-]+off/i, 'a reference to tipping off'],
] as const);

/** The shapes and words of a bank detail — the first nine refusals above. The breach register never records one. */
const BANK_DETAIL_REFUSALS = REFUSED_WORDS.slice(2, 9);

/** WHAT BANK DETAIL A TEXT CARRIES, OR NULL. The breach register (src/modules/compliance/compliance-breach.ts) asks it of every entry's prose. */
export function carriesBankDetails(text: string): string | null {
  for (const [pattern, what] of BANK_DETAIL_REFUSALS) if (pattern.test(text)) return what;
  return null;
}

/** WHAT A TEXT WOULD TIP SOMEBODY OFF WITH, OR NULL — asked of every letter the compliance registers queue. */
export function tipsOff(text: string): string | null {
  for (const [pattern, what] of REFUSED_WORDS.slice(-6)) if (pattern.test(text)) return what;
  return null;
}

