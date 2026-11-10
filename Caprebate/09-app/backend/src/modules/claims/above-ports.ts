/**
 * WHAT THE CLAIMS ASK THE AREAS ABOVE THEM (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2). The claims sit below the
 * survey, finance, compliance, admin, the portal and the public site in the order, so they never import them. Where a
 * claim's rule must read something one of them keeps (the survey's approved versions and its legal check, the portal's
 * accountant confirmations and the client's acceptance, the fee invoice, two switches the
 * case stamp records), it asks here: these are PORTS THE CLAIMS OWN, and each of those areas hands its own functions in,
 * unchanged, as its front door loads (its `claims-ports.ts`).
 *
 * Asked before an area has handed its part in, a port refuses rather than guess: an empty answer would quietly change a
 * claim (a gate passed, a version not found). Asked only while code runs, never while files load. Each is declared with
 * `var`, so a hand-in that comes while this file is still loading is kept.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import type { LegalVerdict } from '../survey/index.ts';
import type { ConfirmKind, ConfirmRow, ReturnFiling } from '../portal/index.ts';

/** A read of one row, as every data file's reads are. */
type GetRow = <T extends Row = Row>(db: Db, params?: readonly Param[]) => T | undefined;
/** A read of many rows. */
type ListRows = <T extends Row = Row>(db: Db, params?: readonly Param[]) => T[];

function refused(area: string): never {
  throw new Error(`What the claims ask ${area} is not set up. ${area[0]?.toUpperCase() ?? ''}${area.slice(1)} sets it up when it loads, so nothing was decided.`);
}

/* ================================================================== *
 * THE SURVEY: its approved versions, its legal check, its jobs and its anchor log
 * ================================================================== */

export type SurveyAsked = {
  /** The legal check on the claim's survey pack, as it reads today (src/modules/survey/pack-legal.ts). */
  readonly legalVerdictForClaim: (db: Db, claim_id: string, nowIso: string) => LegalVerdict | null;
  readonly getSurveyPackApprovalsJsonExtractSnapshotJsonFById: GetRow;
  readonly getSurveyorCommitmentsIdJobIdByClaimId: GetRow;
  readonly getSurveyPackApprovalsSnapshotJsonByClaimId: GetRow;
  readonly getSurveyPackApprovalsIdVersionByClaimId: GetRow;
  readonly getSurveyPackApprovalsClaimIdBusinessIdById: GetRow;
  readonly getSurveyPackApprovalsVersionSnapshotJsonByClaimId: GetRow;
  readonly getAnchorLogHash: GetRow;
  readonly getAnchorLogCountByJobIdClaimId: GetRow;
  readonly getAnchorLogSeqHashByJobIdClaimId: GetRow;
  readonly listSurveyorJobsIdSurveyorIdByClaimId: ListRows;
  /** The approved versions on a building's packs, or on packs naming no building whose job's claim is one of these. */
  readonly listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds: ListRows;
  /** Every approved version on a claim's survey jobs, with its figure, newest first. */
  readonly listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId: ListRows;
  /** The legal check's newest G9d on a building's packs, or on packs naming no building whose job's claim is one of these. */
  readonly getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d: GetRow;
  /** The surveyors with a job on any of these claims, each once. */
  readonly listSurveyorJobsSurveyorIdByClaimIds: ListRows;
};
var surveyAsked: SurveyAsked | undefined;
export function setSurveyAsked(p: SurveyAsked): void { surveyAsked = p; }
function survey(): SurveyAsked { return surveyAsked ?? refused('the survey'); }

export function legalVerdictForClaim(db: Db, claim_id: string, nowIso: string): LegalVerdict | null { return survey().legalVerdictForClaim(db, claim_id, nowIso); }
export function getSurveyPackApprovalsJsonExtractSnapshotJsonFById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackApprovalsJsonExtractSnapshotJsonFById<T>(db, params); }
export function getSurveyorCommitmentsIdJobIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyorCommitmentsIdJobIdByClaimId<T>(db, params); }
export function getSurveyPackApprovalsSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackApprovalsSnapshotJsonByClaimId<T>(db, params); }
export function getSurveyPackApprovalsIdVersionByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackApprovalsIdVersionByClaimId<T>(db, params); }
export function getSurveyPackApprovalsClaimIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackApprovalsClaimIdBusinessIdById<T>(db, params); }
export function getSurveyPackApprovalsVersionSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackApprovalsVersionSnapshotJsonByClaimId<T>(db, params); }
export function getAnchorLogHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getAnchorLogHash<T>(db, params); }
export function getAnchorLogCountByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getAnchorLogCountByJobIdClaimId<T>(db, params); }
export function getAnchorLogSeqHashByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getAnchorLogSeqHashByJobIdClaimId<T>(db, params); }
export function listSurveyorJobsIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] { return survey().listSurveyorJobsIdSurveyorIdByClaimId<T>(db, params); }
export function listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] { return survey().listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds<T>(db, params); }
export function listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] { return survey().listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId<T>(db, params); }
export function getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return survey().getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d<T>(db, params); }
export function listSurveyorJobsSurveyorIdByClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] { return survey().listSurveyorJobsSurveyorIdByClaimIds<T>(db, params); }

/* ================================================================== *
 * THE PORTAL: the accountant's confirmations and the client's acceptance of the report
 * ================================================================== */

export type PortalAsked = {
  readonly latestAnswer: (db: Db, claim_id: string, kind: ConfirmKind, since?: string, period_end?: string) => ConfirmRow['answer'] | null;
  readonly returnFilings: (db: Db, claim_id: string, todayIso: string) => ReturnFiling[] | null;
  readonly getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing: GetRow;
  readonly getClientReportAcceptancesCountByClaimId: GetRow;
};
var portalAsked: PortalAsked | undefined;
export function setPortalAsked(p: PortalAsked): void { portalAsked = p; }
function portal(): PortalAsked { return portalAsked ?? refused('the portal'); }

export function latestAnswer(db: Db, claim_id: string, kind: ConfirmKind, since = '', period_end?: string): ConfirmRow['answer'] | null { return portal().latestAnswer(db, claim_id, kind, since, period_end); }
export function returnFilings(db: Db, claim_id: string, todayIso: string): ReturnFiling[] | null { return portal().returnFilings(db, claim_id, todayIso); }
export function getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return portal().getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing<T>(db, params); }
export function getClientReportAcceptancesCountByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined { return portal().getClientReportAcceptancesCountByClaimId<T>(db, params); }

/* ================================================================== *
 * FINANCE: the claim's fee invoice
 * ================================================================== */

export type FinanceAsked = { readonly getInvoiceNumbersSeqByInvoiceIdKind: GetRow };
var financeAsked: FinanceAsked | undefined;
export function setFinanceAsked(p: FinanceAsked): void { financeAsked = p; }
export function getInvoiceNumbersSeqByInvoiceIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return (financeAsked ?? refused('finance')).getInvoiceNumbersSeqByInvoiceIdKind<T>(db, params);
}

/* ================================================================== *
 * THE CASE STAMP'S SWITCHES KEPT ABOVE: whether each is on, read when a stamp is taken (src/modules/claims/case-stamp.ts)
 * ================================================================== */

/** DISCLOSURE_LOG is compliance's (src/modules/compliance/disclosure-log.ts). (ENQUIRY_RETENTION is the client record's since
 * Phase 161l2, src/modules/clients/enquiry-retention.ts, and the stamp reads it through the clients' door.) */
export type StampedSwitch = 'DISCLOSURE_LOG';
var stampedSwitches: Partial<Record<StampedSwitch, () => boolean>> | undefined;
export function setStampedSwitch(name: StampedSwitch, on: () => boolean): void { stampedSwitches = { ...stampedSwitches, [name]: on }; }
/** Whether the switch is on now. */
export function stampedSwitchOn(name: StampedSwitch): boolean {
  const on = stampedSwitches?.[name];
  return on === undefined ? refused('compliance') : on();
}
