/**
 * THE CLAIMS' ADDRESSES: the Connections page's script and the accountant's private sign-off link. The router shell
 * (src/app/router.ts) asks each function at the point where its addresses have always been matched, so the order in
 * which every address is tried is unchanged.
 */
import { form, type WebRequest, type WebResult } from '../../core/index.ts';
import { SITE_JS_HEADERS } from '../public-site/index.ts';
import { REGISTER_IMPORT_JS } from './register-import-script.ts';
import { handleSignoffLink } from './report-pages.ts';

/** The Connections page's script. */
export async function claimsAssets(w: WebRequest): Promise<WebResult | undefined> {
  const { res, path, method } = w;
  // The Connections page's one script, which trims a care regulator's list on the Admin's computer.
  if (path === '/assets/register-import.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(REGISTER_IMPORT_JS); return 'handled';
  }
  return undefined;
}

/** The accountant's private sign-off link. */
export async function claimsSignoffLink(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, newId } = w;
  /* THE ACCOUNTANT'S PRIVATE SIGN-OFF LINK (src/modules/claims/report-pages.ts). No login: the link is the key, kept only
     as its SHA-256, answered once, for 30 days. */
  if (path.startsWith('/signoff/')) {
    const r = await handleSignoffLink(d.app, newId, req, res, url, method, form);
    if (r === 'handled') return 'handled';
  }
  return undefined;
}
