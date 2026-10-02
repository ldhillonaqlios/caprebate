/**
 * THE SHARED LOOK — UI TIDY PHASE 1, 2 October 2026.
 *
 * Lakhbir chose "design 2" from the mock-ups (https://claude.ai/artifact/G74T4SbqtQLJX7AeamdgBW) and asked for colours
 * and darker boxes, so a busy person reads a page at a glance. The plan is 00-START-HERE/hub/UI-TIDY-PLAN.md. This module
 * draws the pieces every tidied page shares; the colours are tokens in src/web/assets.ts, each pairing checked at 4.5:1
 * by test/phase133c.test.ts, and the pieces are proved in test/ui-tidy-look.test.ts.
 *
 * - **A colour for each group of claim stages.** The ten steps of the procedure and Closed fall into five groups. A stage
 *   that is not a step (on hold, or one of the ways a claim ends) has no group and is drawn in the plain badge.
 * - **Solid number boxes** at the top of a page: what is late in red, what nobody owns in brown, money in green, a total
 *   in black with its figure in mint.
 * - **A bar of the groups**, each as wide as its count.
 *
 * Nothing here decides what a person may see: a page passes in only what its own gates already let it show.
 */

import { h, raw, type Safe } from './html.ts';
import { PROCEDURE_STAGES, CLOSED_STAGE } from './stages.ts';

export type GroupKey = 'win' | 'gather' | 'survey' | 'sign' | 'paid';

export type StageGroup = { readonly key: GroupKey; readonly name: string; readonly stages: readonly string[] };

/** The five groups, in the order a claim passes through them. Every step of the procedure, and Closed, is in exactly one. */
export const STAGE_GROUPS: readonly StageGroup[] = Object.freeze([
  { key: 'win', name: 'Winning it', stages: ['ENQUIRY', 'ASSESSMENT', 'ENGAGEMENT'] },
  { key: 'gather', name: 'Gathering', stages: ['DATA_GATHERING'] },
  { key: 'survey', name: 'Surveying', stages: ['SURVEY', 'VALUATION'] },
  { key: 'sign', name: 'Signing off', stages: ['TAX_ADVISER_SIGNOFF', 'REPORTS', 'DEFENCE_PACK'] },
  { key: 'paid', name: 'Getting paid', stages: ['INVOICE', 'CLOSED'] },
]);

/** The group a claim's stage is in, or null for one that is not a step (on hold, or a way a claim ends). */
export function stageGroupOf(stageKey: string | null | undefined): StageGroup | null {
  if (stageKey === null || stageKey === undefined) return null;
  return STAGE_GROUPS.find((g) => g.stages.includes(stageKey)) ?? null;
}

/** A stage's own name, as the procedure gives it. */
export function stageLabel(stageKey: string): string {
  if (stageKey === CLOSED_STAGE.key) return CLOSED_STAGE.label;
  return PROCEDURE_STAGES.find((s) => s.key === stageKey)?.label ?? stageKey;
}

/** A stage as a coloured label. `label` replaces the stage's own name where a page words it differently. */
export function stageBadge(stageKey: string, label?: string): Safe {
  const g = stageGroupOf(stageKey);
  const text = label ?? stageLabel(stageKey);
  return g === null ? h`<span class="badge">${text}</span>` : h`<span class="badge g-${g.key}">${text}</span>`;
}

/** A solid coloured heading band over a group's rows. */
export function groupBand(group: StageGroup | null, text: string): Safe {
  return h`<p class="band g-${group?.key ?? 'none'}">${text}</p>`;
}

/** "3 days late" in solid red; anything else a page says about a date, in grey. */
export function lateBadge(text: string): Safe { return h`<span class="badge b-late">${text}</span>`; }
export function noDateBadge(text: string): Safe { return h`<span class="badge b-nodate">${text}</span>`; }
/** "Nobody yet", where a claim or task has no owner. */
export function nobodyBadge(text: string): Safe { return h`<span class="badge b-nobody">${text}</span>`; }

export type KpiTone = 'total' | 'late' | 'warn' | 'money' | 'plain' | GroupKey;
export type Kpi = { readonly label: string; readonly value: string; readonly tone: KpiTone; readonly href?: string };

const TONE_CLASS: Readonly<Record<KpiTone, string>> = Object.freeze({
  total: 'k-total', late: 'k-late', warn: 'k-warn', money: 'k-money', plain: 'k-plain',
  win: 'k-win', gather: 'k-gather', survey: 'k-survey', sign: 'k-sign', paid: 'k-paid',
});

/** The row of solid number boxes at the top of a page. A box with an address is a link to the list it counts. */
export function kpiRow(items: readonly Kpi[]): Safe {
  if (items.length === 0) return raw('');
  return h`<ul class="kpis">${items.map((k) => {
    const inner = h`<span class="kpi-label">${k.label}</span><span class="kpi-value">${k.value}</span>`;
    return k.href === undefined
      ? h`<li class="kpi ${TONE_CLASS[k.tone]}">${inner}</li>`
      : h`<li><a class="kpi ${TONE_CLASS[k.tone]}" href="${k.href}">${inner}</a></li>`;
  })}</ul>`;
}

/** The widths a group bar can draw: a share is rounded into 1 to 10 parts, so the stylesheet needs no inline style. */
const BAR_PARTS = 10;

/**
 * The groups as one bar, each as wide as its count; a group with none is left out of the bar and named in `empty`.
 * Returns nothing when there is nothing to count.
 */
export function groupBar(counts: Readonly<Partial<Record<GroupKey, number>>>): { bar: Safe; empty: readonly string[] } {
  const total = STAGE_GROUPS.reduce((n, g) => n + (counts[g.key] ?? 0), 0);
  if (total === 0) return { bar: raw(''), empty: STAGE_GROUPS.map((g) => g.name) };
  const shown = STAGE_GROUPS.filter((g) => (counts[g.key] ?? 0) > 0);
  const empty = STAGE_GROUPS.filter((g) => (counts[g.key] ?? 0) === 0).map((g) => g.name);
  const bar = h`<div class="groupbar" role="img" aria-label="${shown.map((g) => `${g.name} ${String(counts[g.key])}`).join(', ')}">${shown.map((g) => {
    const n = counts[g.key] ?? 0;
    const parts = Math.min(BAR_PARTS, Math.max(1, Math.round((n / total) * BAR_PARTS)));
    return h`<span class="g-${g.key} gw-${parts}">${g.name} · ${n}</span>`;
  })}</div>`;
  return { bar, empty };
}
