/**
 * THE CLAIMS' RULES REGISTER (Phase 161m, 10 Nov 2026; src/shared/rules-register.ts says what a register is).
 *
 *   the claims' switches   each keeps its words (its question, what it waits on) where its code lives; this pins its
 *                          position, so a switch moved without a new version here is a red test
 *   the eleven rulebooks   the file each one is, as 01-rulebooks/README.md lists them. THE FILENAME IS THE ONLY CARRIER
 *                          OF A RULEBOOK'S OWN VERSION ("-v2"); a rulebook re-issued as v3 is a new version of its
 *                          entry here, and every result sealed before it still says the old one. Moved here from
 *                          src/modules/claims/case-stamp.ts, which reads them from here.
 *
 * BUILT WHEN FIRST ASKED, NOT AS THE FILE LOADS: the claim record and the case stamp import each other, and this reads
 * the claim record's switch, so nothing here touches another file's exports until a register is asked for.
 */
import { defineRules, switchEntry, FIRST_RECORDED, FIRST_RECORDED_ON, type RuleEntry } from '../../../shared/index.ts';
import { rulesThroughAssessment } from '../../assessment/index.ts';
import { FEE_CLAWBACK } from '../claim-record.ts';
import { CONVEYANCING_STRIP } from '../conveyancing-strip.ts';
import { FEE_CONTROLS } from '../fee-controls.ts';
import { MANDATORY_DOCUMENTS } from '../mandatory-documents.ts';
import { ENGAGEMENT_SIGNING, ENGAGEMENT_SIGNING_TEST } from '../signing.ts';
import { DEFENCE_PACK_GENERATOR } from '../defence-pack.ts';
import { ALLOWANCE_PROFIT_COMPARISON } from '../allowance-profit-comparison.ts';
import { PICK_SWITCHES } from '../match-review.ts';

export type RulebookModule = {
  readonly module: string;
  readonly version: string;
  readonly file: string;
  readonly board_item: string;
  readonly monday_doc: string | null;
};

/** THE ELEVEN RULEBOOK FILES, AS 01-rulebooks/README.md LISTS THEM (test/claims/defence-pack-and-case-stamp.test.ts reads the README). */
export const RULEBOOK_MODULES: readonly RulebookModule[] = Object.freeze([
  { module: 'A', version: 'v2', file: 'Caprebate-Statutory-Rules-Register-A-Claim-Timing-v2.md', board_item: '12830178875', monday_doc: null },
  { module: 'B', version: 'v2', file: 'Caprebate-Entitlement-Branch-Truth-Table-B-v2.md', board_item: '12830182172', monday_doc: null },
  { module: 'C', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-C-Elections-v1.md', board_item: '12841288962', monday_doc: null },
  { module: 'D', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-D-What-Qualifies-As-Plant-v1.md', board_item: '12851645135', monday_doc: null },
  { module: 'E', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-E-Dwelling-House-v1.md', board_item: '12910751557', monday_doc: null },
  { module: 'F', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-F-Contributions-And-Grants-v1.md', board_item: '12910769642', monday_doc: null },
  { module: 'G', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-G-Repairs-vs-Capital-v1.md', board_item: '12830061107', monday_doc: '18427873138' },
  { module: 'H', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-H-Land-Remediation-Relief-v1.md', board_item: '12830043662', monday_doc: '18427873476' },
  { module: 'I', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-I-Rates-And-Reliefs-Table-v1.md', board_item: '12830060773', monday_doc: '18427874000' },
  { module: 'I-ADDENDUM-1', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-I-Addendum-1-Scottish-Income-Tax-v1.md', board_item: '12889350666', monday_doc: '18428034700' },
  { module: 'A-ADDENDUM-1', version: 'v1', file: 'Caprebate-Statutory-Rules-Register-A-Addendum-1-Two-Year-Fixed-Value-Window-v1.md', board_item: '12921255840', monday_doc: '18428623683' },
].map((m) => Object.freeze(m)));

const OFF = 'Not approved yet: built and switched off.';
const HOME = 'src/modules/claims/';

let built: readonly RuleEntry[] | undefined;

/** The claims' own register. */
export function claimsRules(): readonly RuleEntry[] {
  if (built !== undefined) return built;
  built = defineRules('claims', [
    switchEntry({ id: 'claims.FEE_CLAWBACK', title: 'Our fee follows a claim HMRC reduces (clause 13)', approver: 'the solicitor', approval: OFF,
      settings: FEE_CLAWBACK, home: `${HOME}claim-record.ts`, tested_in: 'test/claims/engagement-terms-and-fees.test.ts' }),
    switchEntry({ id: 'claims.CONVEYANCING_STRIP', title: 'Company names are kept on conveyancing papers', approver: 'the data protection officer', approval: OFF,
      settings: CONVEYANCING_STRIP, home: `${HOME}conveyancing-strip.ts`, tested_in: 'test/compliance/data-protection-switches.test.ts' }),
    switchEntry({ id: 'claims.FEE_CONTROLS.above_benefit', title: 'What happens when our fee is more than the benefit', approver: 'Lakhbir', approval: OFF,
      settings: FEE_CONTROLS.above_benefit, home: `${HOME}fee-controls.ts`, tested_in: 'test/finance/invoices-and-fee-controls.test.ts' }),
    switchEntry({ id: 'claims.FEE_CONTROLS.break_and_abort', title: 'The break fee and the abort fee', approver: 'Lakhbir', approval: OFF,
      settings: FEE_CONTROLS.break_and_abort, home: `${HOME}fee-controls.ts`, tested_in: 'test/finance/invoices-and-fee-controls.test.ts' }),
    switchEntry({ id: 'claims.FEE_CONTROLS.uplifts', title: 'The extra charges for complicated jobs', approver: 'Lakhbir', approval: OFF,
      settings: FEE_CONTROLS.uplifts ?? { enabled: false }, home: `${HOME}fee-controls.ts`, tested_in: 'test/claims/rate-card-uplifts.test.ts' }),
    switchEntry({ id: 'claims.MANDATORY_DOCUMENTS', title: 'The documents a claim needs before it moves on', approver: 'Lakhbir', approval: 'On, on Lakhbir\'s answer.',
      settings: MANDATORY_DOCUMENTS, home: `${HOME}mandatory-documents.ts`, tested_in: 'test/crm/introducer-source-claim-team.test.ts' }),
    switchEntry({ id: 'claims.ENGAGEMENT_SIGNING', title: 'A client signs the engagement letter in the portal', approver: 'the solicitor',
      approval: 'Not approved yet: built and switched off until the solicitor confirms a typed name is a good enough signature.',
      settings: ENGAGEMENT_SIGNING, home: `${HOME}signing.ts`, tested_in: 'test/claims/signing-for-testing.test.ts' }),
    switchEntry({ id: 'claims.ENGAGEMENT_SIGNING_TEST', title: 'Signing the test copy of the letter, on the test website only', approver: 'the solicitor',
      approval: 'On for testing on Lakhbir\'s word (6 Oct 2026); the real letter cannot be signed under it.',
      settings: ENGAGEMENT_SIGNING_TEST, home: `${HOME}signing.ts`, tested_in: 'test/claims/signing-for-testing.test.ts' }),
    switchEntry({ id: 'claims.DEFENCE_PACK_GENERATOR', title: 'Make the defence pack for an HMRC enquiry', approver: 'the tax adviser',
      approval: 'Not approved yet: built and switched off until the tax adviser signs off the defence pack.',
      settings: DEFENCE_PACK_GENERATOR, home: `${HOME}defence-pack.ts`, tested_in: 'test/claims/defence-pack-and-case-stamp.test.ts' }),
    switchEntry({ id: 'claims.ALLOWANCE_PROFIT_COMPARISON', title: 'Compare the claim with and without the allowance against the profit', approver: 'the tax adviser',
      approval: 'Not approved yet: built and switched off until real clients answer the questions it needs.',
      settings: ALLOWANCE_PROFIT_COMPARISON, home: `${HOME}allowance-profit-comparison.ts`, tested_in: 'test/assessment/allowance-profit-comparison.test.ts' }),
    switchEntry({ id: 'claims.PICK_SWITCHES.MATCH_REVIEW_PICK', title: 'Staff pick a register entry for a close match', approver: 'the data protection officer',
      approval: OFF, settings: { enabled: PICK_SWITCHES['MATCH_REVIEW_PICK'] === true }, home: `${HOME}match-review.ts`, tested_in: 'test/claims/register-match-review.test.ts' }),
    ...RULEBOOK_MODULES.map((m) => ({
      id: `claims.rulebook.${m.module}`, title: `Rulebook ${m.module} (${m.version})`, version: 1, effective_from: FIRST_RECORDED_ON,
      approver: 'the tax adviser', approval: 'Written; awaiting the tax adviser\'s review.',
      value: { file: m.file, rulebook_version: m.version }, home: '01-rulebooks/README.md', change: FIRST_RECORDED,
      tested_in: 'test/claims/defence-pack-and-case-stamp.test.ts',
    })),
  ]);
  return built;
}

/** The claims' rules, and every area's below them. */
export function rulesThroughClaims(): readonly RuleEntry[] { return [...rulesThroughAssessment(), ...claimsRules()]; }
