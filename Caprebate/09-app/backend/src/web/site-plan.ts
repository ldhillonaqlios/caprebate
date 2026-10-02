/**
 * THE REPORT'S SITE PLAN — the client's building, and the buildings round it, from Ordnance Survey's free maps.
 * 2 October 2026, the survey pack, stage 6. Migration 078; the calls are src/connectors/os-buildings.ts.
 *
 * Lakhbir, 1 Oct 2026: the report's cover shows the building from Ordnance Survey's free building outlines; the site
 * boundary (INSPIRE) is never in a report. 2 Oct 2026: the client's building is picked automatically.
 *
 * WHO, AND WHERE. Whoever may change the pack (`surveyor_job.commit`: the assigned surveyor) fetches it, in
 * chapter 9, with one button. Like the free lookups, it is fetched on the test website only for now
 * (src/connectors/registers.ts, `lookupsWaivedHere`), and only with the Ordnance Survey key.
 *
 * WHAT IS KEPT. Each fetch is a new row; the newest is shown. Outlines are kept in decimetres from the postcode's point,
 * so the plan draws the same every time. An approved version copies the plan into its own JSON (src/web/pack-approve.ts),
 * so the report it makes never changes after approval, whatever is fetched later.
 *
 * HOW IT IS DRAWN. One model, two drawings, as the report: an SVG in the page (presentation attributes only, so the
 * page's style policy holds) and boxes of paths in the PDF (src/web/pdf-canvas.ts, `poly`). The client's building is
 * dark, the others light grey. North is up. A 20 m scale bar. The credit line Ordnance Survey's licence asks for.
 */
import type { Actor } from '../authz.ts';
import { authorise } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import type { Db } from '../db.ts';
import type { Transport } from '../connectors/http.ts';
import type { RateLimiter } from '../connectors/http.ts';
import type { SecretStore } from '../secrets.ts';
import type { Env } from '../connectors/place.ts';
import { lookupsWaivedHere } from '../connectors/registers.ts';
import { buildingsAround, OS_ATTRIBUTION, PLAN_HALF_M, PLAN_MAX_BUILDINGS, pickBuilding, pointOfPostcode, type Asker } from '../connectors/os-buildings.ts';
import { packJob } from './surveyor.ts';
import { packView } from './survey-pack.ts';
import { h, raw, type Safe } from './html.ts';
import type { Op, Rgb } from './pdf-canvas.ts';

/** A site plan as kept and as drawn. Rings are [east, north] in DECIMETRES from the postcode's point. */
export type SitePlan = {
  readonly postcode: string;
  readonly half_m: number;
  readonly buildings: readonly (readonly (readonly (readonly [number, number])[])[])[];
  /** Which building is the client's; null when there was none in the square. */
  readonly chosen: number | null;
  readonly how: 'INSIDE' | 'NEAREST' | null;
  readonly metres: number | null;
  readonly attribution: string;
  readonly fetched_at: string;
};

export type SitePlanDeps = {
  readonly db: Db; readonly audit: AuditLog; readonly now: () => string; readonly newId: () => string;
  readonly transport: Transport; readonly secrets: SecretStore;
  /** Where this copy runs. Absent: the process's. */
  readonly env?: Env;
  readonly limiter?: RateLimiter;
  readonly sleep?: (ms: number) => Promise<void>;
};

type Row = { postcode: string; half_m: number; buildings_json: string; chosen: number | null; how: string | null; metres: number | null; attribution: string; fetched_at: string };

/** The newest site plan for a survey job, or null. Read as the pack is: whoever may read the job. */
export function sitePlanOf(db: Db, job_id: string): SitePlan | null {
  const r = db.get<Row>('SELECT postcode, half_m, buildings_json, chosen, how, metres, attribution, fetched_at FROM site_plans WHERE job_id = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1', [job_id]);
  if (r === undefined) return null;
  return {
    postcode: r.postcode, half_m: r.half_m, buildings: JSON.parse(r.buildings_json) as SitePlan['buildings'],
    chosen: r.chosen, how: r.how === 'INSIDE' || r.how === 'NEAREST' ? r.how : null, metres: r.metres, attribution: r.attribution, fetched_at: r.fetched_at,
  };
}

/** Fetch the site plan for a survey job and keep it. Words when it cannot. */
export async function fetchSitePlan(d: SitePlanDeps, actor: Actor, job_id: string): Promise<{ ok: true; buildings: number } | { ok: false; why: string }> {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  if (!lookupsWaivedHere(d.env)) return { ok: false, why: 'Site plans are fetched on the test website only, for now.' };
  const key = (d.secrets.forOwner('OS_MAPS').get('OS_DATA_HUB_API_KEY') ?? '').trim();
  if (key === '') return { ok: false, why: 'Add the Ordnance Survey key first: OS_DATA_HUB_API_KEY.' };
  const v = packView({ db: d.db, audit: d.audit, now: d.now, newId: d.newId }, actor, job_id);
  if (v.property === null) return { ok: false, why: 'Choose which property this pack is for first.' };
  if (v.property.postcode === null || v.property.postcode.trim() === '') return { ok: false, why: 'The property has no postcode, so we cannot place it on the map.' };
  const deps = { audit: d.audit, now: d.now, transport: d.transport, ...(d.env === undefined ? {} : { env: d.env }),
    ...(d.limiter === undefined ? {} : { limiter: d.limiter }), ...(d.sleep === undefined ? {} : { sleep: d.sleep }) };
  const who: Asker = { id: actor.id, role: actor.role, gate: { free_gate_open: true, engagement_signed: false, switched_on: true } };
  const at = await pointOfPostcode(deps, v.property.postcode, who);
  if (!at.ok) return at;
  const got = await buildingsAround(deps, key, at.value, who);
  if (!got.ok) return got;
  const outlines = got.value.slice(0, PLAN_MAX_BUILDINGS);
  const pick = pickBuilding(outlines, at.value);
  const dm = (v: number, o: number): number => Math.round((v - o) * 10);
  const buildings = outlines.map((o) => o.map((ring) => ring.map(([e, n]) => [dm(e, at.value.easting), dm(n, at.value.northing)] as const)));
  const now = d.now();
  d.db.run('INSERT INTO site_plans (id, job_id, postcode, easting, northing, half_m, buildings_json, chosen, how, metres, attribution, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [d.newId(), job_id, v.property.postcode.trim().toUpperCase(), Math.round(at.value.easting), Math.round(at.value.northing), PLAN_HALF_M,
      JSON.stringify(buildings), pick?.index ?? null, pick?.how ?? null, pick?.metres ?? null, OS_ATTRIBUTION, actor.id, now]);
  d.audit.append({ at: now, kind: 'SITE_PLAN_FETCHED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'surveyor_job', object_id: job_id,
    detail: { buildings: buildings.length, picked: pick?.how ?? 'NONE' } });
  return { ok: true, buildings: buildings.length };
}

/** In words, for the pack and the report: how the client's building was picked. */
export function pickWords(p: SitePlan): string {
  if (p.chosen === null) return 'Ordnance Survey shows no building near the postcode.';
  return p.how === 'INSIDE'
    ? 'The dark building is the one the postcode’s map point falls in.'
    : `The dark building is the nearest to the postcode’s map point, ${String(p.metres ?? 0)} m away.`;
}

const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();

/** One building as an SVG path, in metres with north up (y is minus north). */
function pathOf(rings: SitePlan['buildings'][number]): string {
  return rings.map((ring) => `M${ring.map(([x, y]) => `${f1(x / 10)} ${f1(-y / 10)}`).join('L')}Z`).join('');
}

/** The plan as an SVG for a page. Presentation attributes only: the page's style policy allows no inline style. */
export function sitePlanSvg(p: SitePlan, label: string): Safe {
  const H = p.half_m;
  const bar = 20;
  return h`<svg class="rp-plan-map" viewBox="${`${String(-H)} ${String(-H)} ${String(2 * H)} ${String(2 * H)}`}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${String(-H)}" y="${String(-H)}" width="${String(2 * H)}" height="${String(2 * H)}" fill="#f4f7f5"/>
    ${p.buildings.map((b, i) => i === p.chosen ? raw('') : h`<path d="${pathOf(b)}" fill="#d5dbd7" stroke="#b9c2bc" stroke-width="0.4" fill-rule="evenodd"/>`)}
    ${p.chosen === null ? raw('') : h`<path d="${pathOf(p.buildings[p.chosen] ?? [])}" fill="#14261d" stroke="#14261d" stroke-width="0.6" fill-rule="evenodd"/>`}
    <g fill="#14261d" font-family="Helvetica, Arial, sans-serif" font-size="7"><path d="${`M${String(H - 10)} ${String(-H + 18)}l-4 4h8z`}"/><text x="${String(H - 10)}" y="${String(-H + 14)}" text-anchor="middle">N</text>
    <rect x="${String(-H + 8)}" y="${String(H - 10)}" width="${String(bar)}" height="2"/><text x="${String(-H + 8 + bar + 3)}" y="${String(H - 8)}">20 m</text></g>
  </svg>`;
}

/** The plan as PDF drawing, in a square `size` points wide at (x, y) from the page's top-left. */
export function sitePlanOps(p: SitePlan, x: number, y: number, size: number): Op[] {
  const H = p.half_m;
  const k = size / (2 * H);
  const toPage = (e: number, n: number): readonly [number, number] => [x + (e / 10 + H) * k, y + (H - n / 10) * k];
  const grey: Rgb = [213, 219, 215];
  const edge: Rgb = [185, 194, 188];
  const ink: Rgb = [20, 38, 29];
  const ops: Op[] = [{ k: 'rect', x, y, w: size, h: size, fill: [244, 247, 245] }];
  p.buildings.forEach((b, i) => {
    if (i === p.chosen) return;
    ops.push({ k: 'poly', rings: b.map((ring) => ring.map(([e, n]) => toPage(e, n))), fill: grey, stroke: edge, lw: 0.4 });
  });
  const mine = p.chosen === null ? undefined : p.buildings[p.chosen];
  if (mine !== undefined) ops.push({ k: 'poly', rings: mine.map((ring) => ring.map(([e, n]) => toPage(e, n))), fill: ink, stroke: ink, lw: 0.6 });
  // North, and 20 metres.
  const nx = x + size - 10 * k;
  ops.push({ k: 'poly', rings: [[[nx, y + 14 * k], [nx - 4 * k, y + 18 * k], [nx + 4 * k, y + 18 * k]]], fill: ink });
  ops.push({ k: 'text', x: nx, y: y + 12 * k, s: 'N', font: 'Helvetica-Bold', size: 7, color: ink, align: 'center' });
  ops.push({ k: 'rect', x: x + 8 * k, y: y + size - 10 * k, w: 20 * k, h: 2 * k, fill: ink });
  ops.push({ k: 'text', x: x + 31 * k, y: y + size - 7.5 * k, s: '20 m', font: 'Helvetica', size: 7, color: ink });
  return ops;
}
