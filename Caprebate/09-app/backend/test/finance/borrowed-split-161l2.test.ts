/**
 * FINANCE'S AND ADMIN'S LAST BORROWED STATEMENTS, SPLIT (Phase 161l2). The invoice lists, a claim's heading on an invoice
 * and a template's claim line each joined the organisation (businesses), the client record's (src/modules/clients/, below
 * finance and admin). Each now reads its own rows (and the claim through the claims' door) and asks the client record for
 * the organisation's name or sector. Each pin keeps the statement as it was before any split (Phase 161l1 split off the
 * users and claims), word for word, and expects the same rows on a seeded database with awkward rows added: an invoice
 * or claim whose organisation is not there, equal sort keys (two of a client's
 * own invoices at the same moment under the same name, and under names that sort apart), a page shorter than the list.
 */
import type { Db } from '../../src/core/index.ts';
import * as FINANCE from '../../src/modules/finance/data.ts';
import * as ADMIN from '../../src/modules/admin/data.ts';
import { looseSeededDb, pinAll, put } from '../split-pins.ts';

interface World { db: Db; claims: string[]; invoices: string[] }
let world: Promise<World> | null = null;
function theWorld(): Promise<World> {
  world ??= (async () => {
    const db = await looseSeededDb();
    const claim = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims ORDER BY claim_ref LIMIT 1')!;
    const biz = claim.business_id;
    const staff = db.get<{ id: string }>("SELECT id FROM users WHERE role <> 'CLIENT' ORDER BY email LIMIT 1")!.id;
    const t = (n: number): string => `2026-10-0${n}T09:00:00.000Z`;
    put(db, 'businesses', { id: 'biz-a', name: 'Aardvark Dental', sector: 'dental', stage: 'ENQUIRY', created_at: t(1) });
    put(db, 'businesses', { id: 'biz-z', name: 'Zebra Dental', sector: 'dental', stage: 'ENQUIRY', created_at: t(1) });
    // a claim whose organisation is not there
    put(db, 'claims', { id: 'cl-orphan', claim_ref: 'CR-2026-8888', business_id: 'biz-none', workstream: 'PLANT_AND_MACHINERY', stage: 'ENQUIRY', created_at: t(1), updated_at: t(1) });
    // invoices on claims: on a claim, on an organisation not there, equal dates, one with only a credit note's number
    const inv = (id: string, v: Record<string, string | number | null>): void => put(db, 'invoices', { id, kind: 'FEE', invoice_status: 'RAISED', fee_pence: 100, created_at: t(1), ...v });
    inv('fi-1', { business_id: biz, claim_id: claim.id, invoice_date: '2026-10-01', raised_by: staff, cancelled_by: 'u-gone' });
    inv('fi-2', { business_id: 'biz-none', claim_id: claim.id, invoice_date: '2026-10-02', raised_by: null });
    inv('fi-4', { business_id: biz, claim_id: claim.id, invoice_date: '2026-10-02', raised_by: staff });
    inv('fi-5', { business_id: biz, claim_id: claim.id, invoice_date: '2026-10-02', raised_by: staff });
    put(db, 'invoice_numbers', { seq: 7001, kind: 'INVOICE', invoice_id: 'fi-1' });
    put(db, 'invoice_numbers', { seq: 7002, kind: 'INVOICE', invoice_id: 'fi-4' });
    put(db, 'invoice_numbers', { seq: 7003, kind: 'CREDIT_NOTE', invoice_id: 'fi-5' });
    // a client's own invoices (no claim): the same moment under the same name, names that sort apart, one with no organisation
    inv('fo-1', { business_id: 'biz-z', claim_id: null, created_at: t(3) });
    inv('fo-2', { business_id: 'biz-a', claim_id: null, created_at: t(3) });
    inv('fo-3', { business_id: 'biz-a', claim_id: null, created_at: t(3) });
    inv('fo-4', { business_id: 'biz-none', claim_id: null, created_at: t(4) });
    inv('fo-5', { business_id: 'biz-z', claim_id: null, created_at: t(2) });
    const claims = [...db.all<{ id: string }>('SELECT id FROM claims ORDER BY id').map((r) => r.id), 'claim-none'];
    const invoices = [...db.all<{ id: string }>('SELECT id FROM invoices ORDER BY id').map((r) => r.id), 'inv-none'];
    return { db, claims, invoices };
  })();
  return world;
}

pinAll<World>('161l2 finance and admin', theWorld, (w) => [
  {
    name: 'finance.getClaimsCreatedAtNameById', get: true,
    old: 'SELECT c.created_at, b.name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?',
    call: FINANCE.getClaimsCreatedAtNameById, params: w.claims.map((c) => [c]), atLeast: 3,
  },
  {
    name: 'finance.getClaimsIdBusinessIdById', get: true,
    old: 'SELECT c.id, c.business_id, c.claim_ref, c.stage, c.created_at, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?',
    call: FINANCE.getClaimsIdBusinessIdById, params: w.claims.map((c) => [c]), atLeast: 3,
  },
  {
    name: 'finance.getInvoicesIdBusinessIdById', get: true,
    old: 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.id = ?',
    call: FINANCE.getInvoicesIdBusinessIdById, params: w.invoices.map((i) => [i]), atLeast: 3,
  },
  {
    name: 'finance.listInvoicesIdBusinessId',
    old: 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by ORDER BY i.invoice_date DESC, n.seq DESC LIMIT ?',
    call: FINANCE.listInvoicesIdBusinessId, params: [[1000], [3], [1], [0]], atLeast: 5,
  },
  {
    name: 'finance.listInvoicesIdBusinessIdByClaimId',
    old: 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC',
    call: FINANCE.listInvoicesIdBusinessIdByClaimId, params: w.claims.filter((c) => c !== 'claim-none').map((c) => [c]), atLeast: 3,
  },
  {
    name: 'finance.getInvoicesIdBusinessIdByIdClaimId', get: true,
    old: 'SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.id = ? AND i.claim_id IS NULL',
    call: FINANCE.getInvoicesIdBusinessIdByIdClaimId, params: w.invoices.map((i) => [i]), atLeast: 4,
  },
  {
    name: 'finance.listInvoicesIdBusinessIdByClaimId2',
    old: 'SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.claim_id IS NULL ORDER BY i.created_at DESC, b.name ASC LIMIT ?',
    call: FINANCE.listInvoicesIdBusinessIdByClaimId2, params: [[100], [3], [1], [0]], atLeast: 4,
  },
  {
    name: 'admin.getClaimsClaimRefBusinessNameById', get: true,
    old: 'SELECT c.claim_ref, b.name AS business_name, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?',
    call: ADMIN.getClaimsClaimRefBusinessNameById, params: w.claims.map((c) => [c]), atLeast: 3,
  },
]);
