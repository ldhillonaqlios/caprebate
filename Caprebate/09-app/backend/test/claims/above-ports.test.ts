/**
 * THE CLAIMS' PORTS FOR WHAT THEY ASK THE AREAS ABOVE THEM (Phase 161l2; src/modules/claims/above-ports.ts).
 *
 * The survey, the portal, finance, compliance and the public site each hand their part in as their front door
 * loads. This test checks that, once the app is built, every port is filled with that area's own function (the same
 * answer as asking the area itself), and that a port asked before its area has loaded refuses, by name, rather than
 * guess: a file that loads the ports alone, with no area above, gets an error from every one.
 *
 * Phase 161l2 (helper A2): the document types became the claims' own table and the client's filing confirmation moved
 * to the claims with its table, so admin's port and the portal's filing route are no longer asked here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import * as P from '../../src/modules/claims/above-ports.ts';
import * as SD from '../../src/modules/survey/data.ts';
import { legalVerdictForClaim } from '../../src/modules/survey/pack-legal.ts';
import * as PD from '../../src/modules/portal/data.ts';
import { latestAnswer, returnFilings } from '../../src/modules/portal/accountant-confirm.ts';
import { getInvoiceNumbersSeqByInvoiceIdKind } from '../../src/modules/finance/data.ts';
import { DISCLOSURE_LOG } from '../../src/modules/compliance/disclosure-log.ts';
import { ENQUIRY_RETENTION } from '../../src/modules/public-site/enquiry-retention.ts';

const PORTS = join(import.meta.dirname, '..', '..', 'src', 'modules', 'claims', 'above-ports.ts');

test('every port is filled by its area as the app loads, and answers as the area itself does', async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const db = app.db;
  const today = '2026-11-10T09:00:00.000Z';
  const claims = db.all<{ id: string; business_id: string }>('SELECT id, business_id FROM claims ORDER BY id');
  assert.ok(claims.length > 0);
  const same = (a: unknown, b: unknown, what: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), what);
  for (const c of claims) {
    same(P.legalVerdictForClaim(db, c.id, today), legalVerdictForClaim(db, c.id, today), 'the legal check');
    for (const n of ['getSurveyorCommitmentsIdJobIdByClaimId', 'getSurveyPackApprovalsSnapshotJsonByClaimId', 'getSurveyPackApprovalsIdVersionByClaimId',
      'getSurveyPackApprovalsVersionSnapshotJsonByClaimId', 'getAnchorLogCountByJobIdClaimId', 'getAnchorLogSeqHashByJobIdClaimId',
      'listSurveyorJobsIdSurveyorIdByClaimId', 'listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId'] as const) {
      same(P[n](db, [c.id]), SD[n](db, [c.id]), n);
    }
    same(P.listSurveyorJobsSurveyorIdByClaimIds(db, [JSON.stringify([c.id])]), SD.listSurveyorJobsSurveyorIdByClaimIds(db, [JSON.stringify([c.id])]), 'the surveyors');
    same(P.latestAnswer(db, c.id, 'FILED'), latestAnswer(db, c.id, 'FILED'), 'the latest answer');
    same(P.returnFilings(db, c.id, today), returnFilings(db, c.id, today), 'the return filings');
    same(P.getClientReportAcceptancesCountByClaimId(db, [c.id]), PD.getClientReportAcceptancesCountByClaimId(db, [c.id]), 'the acceptances');
    same(P.getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing(db, [c.id, 'f', '']), PD.getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing(db, [c.id, 'f', '']), 'the acceptance');
    same(P.getInvoiceNumbersSeqByInvoiceIdKind(db, [c.id]), getInvoiceNumbersSeqByInvoiceIdKind(db, [c.id]), 'the fee invoice');
  }
  same(P.getAnchorLogHash(db), SD.getAnchorLogHash(db), 'the anchor log head');
  assert.equal(P.stampedSwitchOn('DISCLOSURE_LOG'), DISCLOSURE_LOG.enabled);
  assert.equal(P.stampedSwitchOn('ENQUIRY_RETENTION'), ENQUIRY_RETENTION.enabled);
  app.close();
});

test('a port asked before its area has loaded refuses, by name, rather than guess', () => {
  const script = `
    const P = await import(${JSON.stringify(PORTS)});
    const out = [];
    const ask = (what, f) => { try { f(); out.push(what + ': answered'); } catch (e) { out.push(what + ': ' + e.message); } };
    ask('survey', () => P.getAnchorLogHash(null));
    ask('legal', () => P.legalVerdictForClaim(null, 'c', ''));
    ask('portal', () => P.latestAnswer(null, 'c', 'FILED'));
    ask('finance', () => P.getInvoiceNumbersSeqByInvoiceIdKind(null, ['c']));
    ask('compliance', () => P.stampedSwitchOn('DISCLOSURE_LOG'));
    ask('public site', () => P.stampedSwitchOn('ENQUIRY_RETENTION'));
    console.log(JSON.stringify(out));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim()) as string[];
  assert.deepEqual(out, [
    'survey: What the claims ask the survey is not set up. The survey sets it up when it loads, so nothing was decided.',
    'legal: What the claims ask the survey is not set up. The survey sets it up when it loads, so nothing was decided.',
    'portal: What the claims ask the portal is not set up. The portal sets it up when it loads, so nothing was decided.',
    'finance: What the claims ask finance is not set up. Finance sets it up when it loads, so nothing was decided.',
    'compliance: What the claims ask compliance is not set up. Compliance sets it up when it loads, so nothing was decided.',
    'public site: What the claims ask the public site is not set up. The public site sets it up when it loads, so nothing was decided.',
  ]);
});
