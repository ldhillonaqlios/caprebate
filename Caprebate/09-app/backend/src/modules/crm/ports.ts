/**
 * WHAT THE MODULES BELOW THE CRM ASK IT, HANDED IN TO THE PORTS THEY OWN (Phase 161l1; 09-app/docs/ARCHITECTURE.md
 * rule 2): the automation runner (the client record's), the pipeline's gates (the claims'), the clients list and
 * "tell the client and move on" (the claims' engaged pages), the fee trigger (the finance's) and the thread with the
 * client as the surveyor reads it (the survey's). Each is the CRM's own function, unchanged. Loaded last by the CRM's
 * front door, as it reaches the module's own files; nothing asks a port while files load.
 */
import { setAutomationRunner } from '../clients/index.ts';
import { setClientsPorts, setGateOutReader } from '../claims/index.ts';
import { setFeeTriggerReader } from '../finance/index.ts';
import { setSurveyorThreadPanel } from '../survey/index.ts';
import { fireAutomation } from './automation.ts';
import { feeTriggerReached, gateOut } from './pipeline.ts';
import { clientList, clientListPage } from './client-list.ts';
import { tellAndMoveOn } from './tell-and-move.ts';
import { surveyorThreadPanel } from './messages-pages.ts';

setAutomationRunner(fireAutomation);
setGateOutReader((db, c, from, opts) => gateOut(db, c, from, opts));
setClientsPorts({
  clientsListPage: (db, actor, nav, sort, nowIso, f) => clientListPage(nav, clientList(db, actor, sort, nowIso), sort, f),
  tellAndMoveOn,
});
setFeeTriggerReader(feeTriggerReached);
setSurveyorThreadPanel(surveyorThreadPanel);
