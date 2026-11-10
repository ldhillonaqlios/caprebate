/**
 * THE CLAIMS' ADDRESSES: the Connections page's script (the accountant's private sign-off link went to the survey's
 * addresses with the report, Phase 161l2: src/modules/survey/routes.ts). The router shell
 * (src/app/router.ts) asks each function at the point where its addresses have always been matched, so the order in
 * which every address is tried is unchanged.
 */
import type { WebRequest, WebResult } from '../../core/index.ts';
import { SITE_JS_HEADERS } from '../../shared/index.ts';
import { REGISTER_IMPORT_JS } from './register-import-script.ts';

/** The Connections page's script. */
export async function claimsAssets(w: WebRequest): Promise<WebResult | undefined> {
  const { res, path, method } = w;
  // The Connections page's one script, which trims a care regulator's list on the Admin's computer.
  if (path === '/assets/register-import.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(REGISTER_IMPORT_JS); return 'handled';
  }
  return undefined;
}
