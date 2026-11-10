/**
 * THE AUTOMATION RULES AS THE CONFIGURATION SCREEN AND THE RULES PAGE READ THEM (Phase 161l1, moved from
 * src/modules/crm/automation.ts unchanged): each rule in plain words, where a seeded rule came from, and the recent runs.
 * It names activity types through the admin's own vocabularies; the rules' words and the runs' rows are the client
 * record's; writing a rule and running one stay with the CRM.
 */
import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { anyStageLabel, localStamp } from '../../shared/index.ts';
import { ATTACH, EFFECTS, FORBIDDEN_EFFECTS, POOL_ROLES, RULES_SECTION, RUN_REASONS, TRIGGERS, listAutomationRulesIdLabel, type RuleDbRow } from '../clients/index.ts';
import { claimWords } from '../claims/index.ts';
import { listAutomationRunsAtTriggerEvent } from './data.ts';
import { vocabLabel } from './vocabularies.ts';
import { listDocumentTypesCodeLabelByActiveHandlerType2 } from '../claims/index.ts';

type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

export type RuleView = {
  readonly id: string;
  readonly label: string;
  readonly trigger: { readonly key: string; readonly label: string; readonly stage: string | null; readonly activity: string | null };
  readonly effect: { readonly key: string; readonly label: string };
  readonly task: {
    readonly title: string | null; readonly description: string | null; readonly activity: string | null;
    readonly priority: string | null; readonly due_in_days: number | null;
  } | null;
  readonly assign: { readonly to: string | null; readonly role: string | null; readonly label: string };
  readonly attach_to: { readonly key: string; readonly label: string };
  readonly active: boolean;
  readonly source: string;
  readonly updated: string;
  /** CRM 9 of 10: the document type a REQUEST_DOCUMENT rule asks the client for. */
  readonly request_type: string | null;
};

/**
 * WHERE EACH SEEDED RULE CAME FROM, IN PLAIN WORDS. Migration 012 stored each seeded rule's `source` in the
 * words of the design notes ("It fires for…", "the DERIVED missing list", "the engagement gate"). A migration already
 * run is never edited, so the screen shows these words for the nine seeded rules instead; the stored text is unchanged,
 * and a rule an Admin adds shows its own.
 */
const SEEDED_RULE_WHY: Readonly<Record<string, string>> = Object.freeze({
  'rule-lead-first-follow-up': 'Our specification, 14.1. A new lead gets an owner and a first follow-up. If the lead has no owner, it waits with Sales until someone takes it. This works for a lead with no company too.',
  'rule-engaged-information-requests': 'Our specification, 14.2. A claim reaches data gathering only once the letter is signed. Then we ask for each fact nobody has asked for yet, one task each, from the list on the client page.',
  'rule-survey-brief': 'Our specification, 14.3 and 14.4. When data gathering is done, the survey starts, and this is the next task. No visit is booked here: the survey starts at a desk.',
  'rule-committed-valuation': 'Our specification, 14.5. A claim leaves the survey step only when the surveyor commits, so this task starts then.',
  'rule-committed-reports': 'Our specification, 14.5. The report task that goes with the one above.',
  'rule-reports-follow-up': 'Our specification, 14.6. When the client starts reading the report, we set a date to follow up.',
  'rule-invoice-finance-task': 'Our specification, 14.7. At the invoice step, Accounting gets a task. It is never an invoice email.',
  'rule-stage-notify-owner': 'Our specification, 14.9. When a claim moves on, its owner is told by email. It goes only to their own work address, and never about a company marked do not contact.',
  'rule-owner-notify': 'Our specification, 14.9. When the owner changes, the new owner is told by email.',
});

function ruleView(db: Db, r: RuleDbRow): RuleView {
  const when = r.trigger_event === 'STAGE_ENTERED'
    ? `${words(TRIGGERS, r.trigger_event, r.trigger_event)}: ${r.trigger_stage === null ? 'any stage' : anyStageLabel(r.trigger_stage)}`
    : r.trigger_event === 'TASK_COMPLETED'
      ? `${words(TRIGGERS, r.trigger_event, r.trigger_event)}: ${r.trigger_activity === null ? 'any activity' : vocabLabel(db, 'ACTIVITY_TYPE', r.trigger_activity, r.trigger_activity)}`
      : words(TRIGGERS, r.trigger_event, r.trigger_event);
  return {
    id: r.id, label: r.label,
    trigger: { key: r.trigger_event, label: when, stage: r.trigger_stage, activity: r.trigger_activity },
    effect: { key: r.effect, label: words(EFFECTS, r.effect, r.effect) },
    task: r.effect === 'NOTIFY_OWNER' ? null : {
      title: r.task_title, description: r.task_description, activity: r.task_activity_type,
      priority: r.task_priority, due_in_days: r.due_in_days,
    },
    assign: {
      to: r.assign_to, role: r.assign_role,
      label: r.effect === 'NOTIFY_OWNER' ? 'the owner'
        : r.assign_to === 'ROLE' ? `waits with ${words(POOL_ROLES, r.assign_role, 'no team')}`
          : `the owner, or ${r.assign_role === null ? 'nobody' : words(POOL_ROLES, r.assign_role, r.assign_role)} where there is none`,
    },
    attach_to: { key: r.attach_to, label: words(ATTACH, r.attach_to, r.attach_to) },
    active: r.active === 1,
    source: SEEDED_RULE_WHY[r.id] ?? r.source,
    updated: localStamp(r.updated_at),
    request_type: r.request_type,
  };
}

export type RunView = {
  readonly at: string;
  readonly rule: string;
  readonly trigger: string;
  readonly ran: boolean;
  readonly reason: string | null;
  readonly tasks_created: number;
  readonly outbox: boolean;
  readonly about: string;
};

export type RulesPage = {
  readonly rules: readonly RuleView[];
  readonly runs: readonly RunView[];
  readonly may_write: boolean;
  readonly forbidden: readonly { readonly key: string; readonly why: string }[];
  /** CRM 9 of 10: the document types a REQUEST_DOCUMENT rule may ask for — active, and something can receive them. */
  readonly request_types: Readonly<Record<string, string>>;
};

export function rulesPage(db: Db, actor: Actor): RulesPage {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
  return {
    rules: listAutomationRulesIdLabel<RuleDbRow>(db).map((r) => ruleView(db, r)),
    runs: recentRuns(db, actor),
    may_write: can(actor, 'automation_rule.write', RULES_SECTION),
    forbidden: Object.entries(FORBIDDEN_EFFECTS).map(([key, why]) => ({ key, why })),
    request_types: Object.fromEntries(listDocumentTypesCodeLabelByActiveHandlerType2<{ code: string; label: string }>(db).map((t) => [t.code, t.label])),
  };
}

export function recentRuns(db: Db, actor: Actor, limit = 100): RunView[] {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
  return listAutomationRunsAtTriggerEvent<{
    at: string; trigger_event: string; outcome: string; reason: string | null; tasks_created: number; outbox_id: string | null;
    claim_id: string | null; lead_id: string | null; task_id: string | null; label: string;
  }>(db, [limit]).map((r) => ({
    at: localStamp(r.at), rule: r.label, trigger: words(TRIGGERS, r.trigger_event, r.trigger_event),
    ran: r.outcome === 'RAN', reason: r.reason === null ? null : words(RUN_REASONS, r.reason, r.reason),
    tasks_created: r.tasks_created, outbox: r.outbox_id !== null,
    about: r.claim_id !== null ? claimWords(db, r.claim_id) : r.lead_id !== null ? 'a lead' : r.task_id !== null ? 'a task' : 'a company',
  }));
}
