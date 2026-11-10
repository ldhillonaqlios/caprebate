/**
 * WHAT THE CLAIMS ASK THE SURVEY, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts): the
 * legal check as it reads today, the approved versions of a claim's packs, its surveyors' jobs and commitments, and the
 * anchor log. Each is this module's own function, unchanged. Loaded last by the survey's front door.
 */
import { setSurveyAsked } from '../claims/index.ts';
import { legalVerdictForClaim } from './pack-legal.ts';
import {
  getAnchorLogCountByJobIdClaimId, getAnchorLogHash, getAnchorLogSeqHashByJobIdClaimId, getSurveyorCommitmentsIdJobIdByClaimId,
  getSurveyPackApprovalsClaimIdBusinessIdById, getSurveyPackApprovalsIdVersionByClaimId, getSurveyPackApprovalsJsonExtractSnapshotJsonFById,
  getSurveyPackApprovalsSnapshotJsonByClaimId, getSurveyPackApprovalsVersionSnapshotJsonByClaimId, getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d,
  listSurveyorJobsIdSurveyorIdByClaimId, listSurveyorJobsSurveyorIdByClaimIds, listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId,
  listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds,
} from './data.ts';

setSurveyAsked({
  legalVerdictForClaim,
  getSurveyPackApprovalsJsonExtractSnapshotJsonFById, getSurveyorCommitmentsIdJobIdByClaimId, getSurveyPackApprovalsSnapshotJsonByClaimId,
  getSurveyPackApprovalsIdVersionByClaimId, getSurveyPackApprovalsClaimIdBusinessIdById, getSurveyPackApprovalsVersionSnapshotJsonByClaimId,
  getAnchorLogHash, getAnchorLogCountByJobIdClaimId, getAnchorLogSeqHashByJobIdClaimId, listSurveyorJobsIdSurveyorIdByClaimId,
  listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds, listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId,
  getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d, listSurveyorJobsSurveyorIdByClaimIds,
});
