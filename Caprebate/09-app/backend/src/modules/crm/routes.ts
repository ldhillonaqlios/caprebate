/**
 * THE CRM'S ADDRESSES: its two scripts, the client's video-call join page and the public referral form. The router
 * shell (src/core/router.ts) asks each function at the point where its addresses have always been matched, so the
 * order in which every address is tried is unchanged.
 */
import { clockOf, form, html, nav, simple, type Actor, type WebRequest, type WebResult } from '../../core/index.ts';
import { h, page, raw, type Safe } from '../../shared/index.ts';
import { joinSignature } from '../../integrations/index.ts';
import { SITE_JS_HEADERS } from '../public-site/index.ts';
import { getContactsNByBusinessIdLeadId } from './data.ts';
import { getVideoMeetingsBookingIdMeetingIdByClientTokenCancelledAt } from './data-borrowed.ts';
import { PROSPECT_EVENTS, REFERRAL_FORM, intakeReferral, referralFormOpen } from './introducers.ts';
import { SECTORS } from './leads.ts';
import { VIDEO_CALL_JS } from './video-call-script.ts';
import { VIDEO_PAGE_HEADERS, clientMayJoin, joinPanel, withJoinScripts } from './video-calls.ts';
import { WHATSAPP_IMPORT_JS } from './whatsapp-import-script.ts';

/** The join pages' script and the WhatsApp pages' script. */
export async function crmAssets(w: WebRequest): Promise<WebResult | undefined> {
  const { res, path, method } = w;
  // The join pages' one script (src/modules/crm/video-call-script.ts).
  if (path === '/assets/video-call.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(VIDEO_CALL_JS); return 'handled';
  }
  // The WhatsApp pages' one script, which opens an exported chat on the person's computer.
  if (path === '/assets/whatsapp-import.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(WHATSAPP_IMPORT_JS); return 'handled';
  }
  return undefined;
}

/** The client's video-call join page, by the link we sent them. */
export async function crmCallPage(w: WebRequest): Promise<WebResult | undefined> {
  const { d, res, path, method, actor, now } = w;
  /* THE CLIENT'S JOIN PAGE, /call/<token>. The token is the only key: 64 hex characters, made when the
     meeting was made and sent only to the client. It opens from half an hour before the call until an hour after. */
  const callMatch = /^\/call\/([0-9a-f]{64})$/.exec(path);
  if (callMatch && method === 'GET') {
    const m = getVideoMeetingsBookingIdMeetingIdByClientTokenCancelledAt<{ booking_id: string; meeting_id: string; join_url: string; passcode: string | null; starts_at: string | null; ends_at: string | null; cancelled_at: string | null; business_id: string | null; lead_id: string | null }>(
      d.app.db, [callMatch[1] ?? '']);
    if (m === undefined || m.starts_at === null || m.ends_at === null || m.cancelled_at !== null) {
      res.writeHead(404, VIDEO_PAGE_HEADERS);
      res.end(page({ title: 'Video call', nav: nav(actor), body: h`<h1>This call is not available</h1>
        <p>The link may be for a call that was moved or cancelled. Please check the latest email from us, or reply to it and we will help.</p>` }));
      return 'handled';
    }
    const when = clientMayJoin(m.starts_at, m.ends_at, now());
    const who = getContactsNByBusinessIdLeadId<{ n: string }>(d.app.db, [m.business_id, m.lead_id])?.n ?? 'Guest';
    const sig = when === 'open' ? joinSignature(d.app.secrets, m.meeting_id, 0, now()) : null;
    const head = h`<h1>Your video call with Cap Rebate</h1><p><strong>${clockOf(m.starts_at)}</strong>, for an hour.</p>`;
    const zoomApp = h`<p class="help">Rather use the Zoom app, or on a phone? <a href="${m.join_url}" rel="noopener noreferrer">Open the call in Zoom</a>${m.passcode === null ? '' : ` (passcode ${m.passcode})`}.</p>`;
    const body = when === 'early' ? h`${head}<p>The call opens here half an hour before it starts. Come back then, or keep the email we sent you.</p>${zoomApp}`
      : when === 'over' ? h`${head}<p>This call has finished. If you missed it, reply to our email and we will arrange another.</p>`
      : sig === null ? h`${head}<p>The call cannot open on this page just now.</p>${zoomApp}`
      : h`${head}${joinPanel({ meeting_id: m.meeting_id, passcode: m.passcode, signature: sig.signature, sdk_key: sig.sdk_key, user_name: who.slice(0, 60), zak: null }, 'client')}${zoomApp}`;
    const out = page({ title: 'Your video call', nav: nav(actor), body, wide: true });
    res.writeHead(200, VIDEO_PAGE_HEADERS); res.end(sig === null ? out : withJoinScripts(out)); return 'handled';
  }
  return undefined;
}

/** The public referral form, only while its gate is open. */
export async function crmReferralForm(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, path, method, actor, newId, now } = w;
  /* ----------------------------------- the public referral form (CRM 5 of 10) */
  /* SHIPPED OFF. It collects another firm's client's details, so it waits on a published privacy notice that says
     so. WHILE THE GATE IS SHUT THE ROUTE DOES NOT EXIST: nothing is drawn, nothing is read from the body, and the
     request falls through exactly as a path that does not exist does — to a visitor with no session, the server's
     401, and to a signed-in one, its 404. When it is open it is the funnel's hardened path — a capped
     body, every field validated on the server, every value escaped on output, no script — and it writes through
     the same intake a member of staff uses, as a new firm that staff then check. */
  if (path === '/refer' && referralFormOpen(d.referralForm ?? REFERRAL_FORM)) {
    if (method === 'GET') { html(res, 200, referralFormPage(actor, undefined)); return 'handled'; }
    if (method === 'POST') {
      const f = await form(req);
      const fields: Record<string, string | null> = {};
      for (const k of ['firm_name', 'contact_name', 'contact_email', 'contact_phone', 'prospect_organisation', 'prospect_sector',
        'prospect_postcode', 'prospect_event', 'prospect_event_year', 'attest']) fields[k] = f.get(k);
      const r = intakeReferral({ db: d.app.db, audit: d.app.audit, now, newId }, null, fields, 'PUBLIC_FORM');
      if (!r.ok) { html(res, 400, referralFormPage(actor, r.why)); return 'handled'; }
      html(res, 200, simple('Thank you — the referral is with us',
        'We will contact your client ourselves. Nothing about their claim is shared with you unless they tell us they want it to be.'));
      return 'handled';
    }
  }
  return undefined;
}

/**
 * THE PUBLIC REFERRAL FORM — CRM 5 of 10, and drawn only while its gate is open.
 * The paper's section 5 step 2: practice, contact, the client business's name,
 * sector and property basics. No script; every value escaped; the accountant
 * confirms their client agreed to the details being passed on.
 */
function referralFormPage(actor: Actor | undefined, why: string | undefined): string {
  const opt = (vocab: Readonly<Record<string, string>>): Safe =>
    h`<option value="">not known</option>${Object.entries(vocab).map(([k, l]) => h`<option value="${k}">${l}</option>`)}`;
  return page({
    title: 'Refer a client', nav: nav(actor),
    body: h`<h1>Refer a client</h1>
      ${why === undefined ? raw('') : h`<p class="err">${why}</p>`}
      <p>Tell us about a client whose property might carry unclaimed capital allowances. We contact them ourselves,
      and nothing about their claim is shared with you unless they tell us they want it to be.</p>
      <form method="post" action="/refer">
        <label>Your practice <input name="firm_name" required maxlength="300"></label>
        <label>Your name <input name="contact_name" required maxlength="200"></label>
        <label>Your email <input name="contact_email" type="email" required maxlength="254"></label>
        <label>Your telephone <input name="contact_phone" maxlength="40"></label>
        <label>Your client's business <input name="prospect_organisation" required maxlength="300"></label>
        <label>Its sector <select name="prospect_sector">${opt(SECTORS)}</select></label>
        <label>The property's postcode, or its first half <input name="prospect_postcode" maxlength="10"></label>
        <label>What happened at the property <select name="prospect_event">${opt(PROSPECT_EVENTS)}</select></label>
        <label>In which year <input name="prospect_event_year" inputmode="numeric" maxlength="4"></label>
        <label class="ck"><input type="checkbox" name="attest"> My client has agreed to my passing their business's details to Cap Rebate.</label>
        <button type="submit">Send the referral</button>
      </form>`,
  });
}
