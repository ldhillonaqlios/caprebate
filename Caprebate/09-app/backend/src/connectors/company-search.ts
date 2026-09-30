/**
 * "FIND MY COMPANY" AT THE START OF THE ASSESSMENT — a search of Companies House by name. 29 September 2026.
 *
 * Lakhbir: "with the am i eligible we should be asking for address and company name", and, for the first screen,
 * the company name with a search. The person types their business's name and presses "Find my company"; the SERVER
 * asks Companies House (its public search, /search/companies) and the page lists up to eight companies to choose from,
 * or "none of these". The page itself makes no call: every search is a form sent to this server, so the key stays here.
 *
 * WHAT IS KEPT FROM A RESULT, AND ONLY THAT: the company's name, its number, its status and its registered office's
 * POSTCODE — the source register's permitted fields for CH_COMPANY (company_number, company_status,
 * registered_office_postcode), and the name the person is choosing as their own. Not the company's type: the register
 * does not permit it and src/connectors/free-registers.ts deliberately does not map it to the legal form, so the
 * assessment still asks that. Never an officer, a director or an address line.
 *
 * SWITCHED OFF, LIKE THE POSTCODE CHECK (postcode-check.ts), until three things are true: the free-tier gate is open
 * (the privacy notice published and linked), Companies House is named in that notice for THIS use (a visitor's own
 * search, before any engagement), and this switch is on. And the key must be in the key file. Until then the screen
 * has no "Find" button and the name is typed; nothing is sent.
 */

import { callOutside, type CallDeps } from './http.ts';
import type { GateStatus } from './registers.ts';
import type { SecretStore } from '../secrets.ts';

export type CompanySearchConfig = {
  readonly enabled: boolean;
  /** Companies House is named in the published privacy notice for a visitor's own search at the assessment. */
  readonly named_in_privacy_notice: boolean;
  /** TESTING ONLY, as POSTCODE_CHECK's (postcode-check.ts): sent before the notice names the service. Absent is false. */
  readonly papers_waived_for_testing?: boolean;
  readonly waiver_record?: string | null;
};

/*
 * SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "switch on companies house and postcodes.io"), under the same
 * recorded waiver as the postcode check. The key is still needed: in the key file locally, and on the test website
 * COMPANIES_HOUSE_API_KEY in its settings (api/index.mjs reads it behind the test password). Without it there is no
 * "Find my company" button and the name is typed, as before.
 */
export const COMPANY_SEARCH: CompanySearchConfig = Object.freeze({
  enabled: true, named_in_privacy_notice: false,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon, 30 September 2026, in the chat with Claude: "switch on companies house and postcodes.io". The privacy notice is a draft and is not published; it does not yet name Companies House for this use. Test website, invented data only.',
});

export type CompanyCandidate = {
  readonly name: string;
  readonly number: string;
  readonly status: string | null;
  readonly office_postcode: string | null;
};

export type CompanySearch =
  | { readonly state: 'FOUND'; readonly candidates: readonly CompanyCandidate[] }
  | { readonly state: 'NONE' }
  | { readonly state: 'NOT_SEARCHED'; readonly why: string };

/** What must be true before a name is sent, in plain words. Empty means it can be sent. */
export function companySearchMissing(cfg: CompanySearchConfig, gate: GateStatus, secrets: SecretStore): string[] {
  const out: string[] = [];
  const waived = cfg.papers_waived_for_testing === true;
  if (!gate.free_enabled && !waived) out.push('Publish the privacy notice and link it from the assessment.');
  if (cfg.named_in_privacy_notice !== true && !waived) out.push('Name Companies House in the privacy notice, for a visitor’s own search.');
  if (cfg.enabled !== true) out.push('Then switch the company search on.');
  if ((secrets.forOwner('COMPANIES_HOUSE').get('COMPANIES_HOUSE_API_KEY') ?? '').trim() === '') out.push('Put the Companies House key in the key file.');
  return out;
}

/** Whether the "Find my company" button is shown at all. */
export function companySearchOffered(cfg: CompanySearchConfig, gate: GateStatus, secrets: SecretStore): boolean {
  return companySearchMissing(cfg, gate, secrets).length === 0;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const NUMBER = /^(\d{8}|[A-Z]{2}\d{6})$/;
const POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;

export async function searchCompanies(i: {
  readonly name: string;
  readonly gate: GateStatus;
  readonly deps: CallDeps;
  readonly secrets: SecretStore;
  /** TESTS ONLY. Absent, COMPANY_SEARCH governs, and it is off. */
  readonly config?: CompanySearchConfig;
}): Promise<CompanySearch> {
  const missing = companySearchMissing(i.config ?? COMPANY_SEARCH, i.gate, i.secrets);
  if (missing.length > 0) return { state: 'NOT_SEARCHED', why: missing.join(' ') };
  const q = i.name.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return { state: 'NOT_SEARCHED', why: 'Type at least two letters of the name.' };
  if (q.length > 160) return { state: 'NOT_SEARCHED', why: 'That name is longer than a company name can be.' };
  const key = i.secrets.forOwner('COMPANIES_HOUSE').get('COMPANIES_HOUSE_API_KEY') ?? '';
  const r = await callOutside(i.deps, {
    service_id: 'COMPANIES_HOUSE', endpoint: '/search/companies', query: { q, items_per_page: '8' },
    headers: { authorization: 'Basic ' + Buffer.from(`${key}:`).toString('base64') },
    actor_id: null, actor_role: null, claim_id: null,
    gate: { free_gate_open: i.gate.free_enabled, engagement_signed: false, switched_on: true },
  });
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_SEARCHED', why: 'We could not search Companies House just now. Type the name and carry on.' };
  let items: unknown;
  try { items = (JSON.parse(r.body) as { items?: unknown }).items; } catch { items = undefined; }
  if (!Array.isArray(items)) return { state: 'NOT_SEARCHED', why: 'We could not read Companies House’s answer. Type the name and carry on.' };
  const candidates: CompanyCandidate[] = [];
  for (const it of items.slice(0, 8)) {
    const o = it !== null && typeof it === 'object' ? it as Record<string, unknown> : {};
    const number = str(o['company_number'])?.toUpperCase() ?? null;
    const name = str(o['title']);
    if (number === null || name === null || !NUMBER.test(number)) continue;
    const addr = o['address'] !== null && typeof o['address'] === 'object' ? o['address'] as Record<string, unknown> : {};
    const pc = str(addr['postal_code']);
    candidates.push({ name, number, status: str(o['company_status']), office_postcode: pc !== null && POSTCODE.test(pc) ? pc.toUpperCase() : null });
  }
  return candidates.length === 0 ? { state: 'NONE' } : { state: 'FOUND', candidates };
}
