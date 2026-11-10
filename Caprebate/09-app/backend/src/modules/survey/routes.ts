/**
 * THE SURVEY'S ADDRESSES: the accountant's private sign-off link for the survey report (Phase 161l2: it came from the
 * claims' addresses with the report's pages). The router shell (src/app/router.ts) asks it at the point where it has
 * always been matched, so the order in which every address is tried is unchanged.
 */
import { form, type WebRequest, type WebResult } from '../../core/index.ts';
import { handleSignoffLink } from './report-pages.ts';

/** The accountant's private sign-off link. */
export async function surveySignoffLink(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, newId } = w;
  /* THE ACCOUNTANT'S PRIVATE SIGN-OFF LINK (src/modules/survey/report-pages.ts). No login: the link is the key, kept only
     as its SHA-256, answered once, for 30 days. */
  if (path.startsWith('/signoff/')) {
    const r = await handleSignoffLink(d.app, newId, req, res, url, method, form);
    if (r === 'handled') return 'handled';
  }
  return undefined;
}
