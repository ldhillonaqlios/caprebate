/**
 * THE SURVEY'S ADDRESSES THE ROUTER SHELL ASKS: the photo page's script, and the accountant's private sign-off link for
 * the survey report (Phase 161l2: the script sat in the shell, the link came from the claims' addresses with the
 * report's pages). The router shell (src/app/router.ts) asks each function at the point where its addresses have always
 * been matched, so the order in which every address is tried is unchanged. The back office's survey pages are asked by
 * src/app/staff.ts through their own handlers (src/modules/survey/surveyor-pages.ts, survey-pack-pages.ts,
 * evidence-pages.ts).
 */
import { form, type WebRequest, type WebResult } from '../../core/index.ts';
import { SITE_JS_HEADERS } from '../../shared/index.ts';
import { PHOTO_UPLOAD_JS } from './photo-upload-script.ts';
import { handleSignoffLink } from './report-pages.ts';

/** The photo page's script. */
export async function surveyAssets(w: WebRequest): Promise<WebResult | undefined> {
  const { res, path, method } = w;
  // The photo page's one script (src/modules/survey/photo-upload-script.ts).
  if (path === '/assets/photo-upload.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(PHOTO_UPLOAD_JS); return 'handled';
  }
  return undefined;
}

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
