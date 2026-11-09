/**
 * RUNNING THE AUTOMATION RULES AN EVENT MATCHES, AS THE MODULES BELOW THE CRM ASK IT (Phase 161l1). The rules and their
 * runner are the CRM's (src/modules/crm/automation.ts, fireAutomation); the assessment (a lead created on the website)
 * and the claims (a document requested) start them. So this is A PORT THE CLIENT RECORD OWNS: the CRM hands its runner
 * in as its front door loads (src/modules/crm/ports.ts), and the modules below ask here, never the CRM.
 *
 * A port and not an event: the runner is called AFTER the change has committed, never inside its transaction, and each
 * rule runs in its own transaction, so one that fails is undone on its own and the change stands (an event runs inside
 * the change's transaction, where a failing rule could not be undone apart from it). Asked before the CRM hands the
 * runner in, it refuses rather than skip the rules silently. Asked only while code runs. Declared with `var`, so a
 * hand-in that comes while this file is still loading is kept.
 */
import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import type { Actor } from '../../core/index.ts';

export type AutomationDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type AutomationEvent =
  | { readonly trigger: 'LEAD_CREATED'; readonly lead_id: string }
  | { readonly trigger: 'STAGE_ENTERED'; readonly claim_id: string; readonly stage: string }
  | { readonly trigger: 'TASK_COMPLETED'; readonly task_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly claim_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly lead_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly task_id: string }
  /** No source raises this yet: CRM 4 of 10 builds document requests and calls it. */
  | { readonly trigger: 'DOCUMENT_REQUESTED'; readonly business_id: string; readonly claim_id: string | null };

export type RunOutcome = {
  readonly rule_id: string;
  readonly run_id: string;
  readonly outcome: 'RAN' | 'NOT_RUN';
  readonly reason: string | null;
  readonly tasks_created: number;
  readonly outbox_id: string | null;
};

export type AutomationRunner = (d: AutomationDeps, actor: Actor | null, event: AutomationEvent) => RunOutcome[];

var runner: AutomationRunner | undefined;

export function setAutomationRunner(run: AutomationRunner): void { runner = run; }

/** Run every active rule this event matches (the CRM's runner), after the event has committed. */
export function fireAutomation(d: AutomationDeps, actor: Actor | null, event: AutomationEvent): RunOutcome[] {
  if (runner === undefined) throw new Error('The automation rules are not set up. The CRM sets them up when it loads, so no rule ran.');
  return runner(d, actor, event);
}
