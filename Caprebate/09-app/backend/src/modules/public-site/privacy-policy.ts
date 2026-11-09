/**
 * THE PRIVACY POLICY AND THE CLIENT'S PORTAL TERMS. Both DRAFTS.
 *
 * The owner: "draft the privacy policy" (from the Phase 160f notice, for the live website and the client
 * portal) and "draft the client's terms and their links". src/modules/public-site/legal-pages.ts serves them with the other legal
 * pages, each with its Draft line until an approval is recorded (src/modules/compliance/legal-approvals.ts).
 *
 * NOTHING HERE IS INVENTED. Every fact nobody has given us (the ICO number, the data protection officer's name and
 * contact, a telephone number, where the live website's host keeps data) is a marked gap: `LATER` on the page, listed
 * in LEGAL_GAPS. The free lookups are LEGITIMATE INTERESTS, never consent (standing rule 13(b)): the only consent here is
 * the optional analytics cookie. The outside services come from OUTSIDE_SERVICES (src/integrations/outside-services.ts), tied to
 * SECRET_KEYS by a test; the retention periods come from RETENTION_PARAMETERS (src/modules/compliance/compliance-identity.ts), the
 * retention schedule, and say they are not yet approved while they are not.
 *
 * The engagement letter's own clauses are not touched here: it governs the work, and these terms say so.
 */
import { h, raw, type Safe } from '../../shared/index.ts';
import { OUTSIDE_SERVICES, TRANSFER_TO_CONFIRM } from '../../integrations/index.ts';
import { BACKUP_KEEP_DAYS } from '../../core/index.ts';
import { RETENTION_PARAMETERS } from '../compliance/index.ts';

export const COMPANY = 'CAP REBATE LTD';
export const COMPANY_NUMBER = '17307313';
export const OFFICE = '1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA';
export const CONTACT = 'contact@caprebate.co.uk';
export const DP_MAIL = 'data.protection@caprebate.co.uk';
export const SECURITY = 'security@caprebate.co.uk';

export const mail = (a: string): Safe => h`<a href="mailto:${a}">${a}</a>`;
/** A fact nobody has given us. */
export const LATER = h`<span class="gap">to be added</span>`;

/* ------------------------------------------------------------------ *
 * THE PRIVACY POLICY
 * ------------------------------------------------------------------ */

/** One row of the retention table: what, how long, and whether that period is approved yet. */
function retentionRows(): Safe {
  const ret = (ref: string): { says: string; approved: boolean } => {
    const p = RETENTION_PARAMETERS[ref];
    return { says: p?.says ?? 'Not yet set.', approved: p?.state === 'APPROVED' };
  };
  const rows: readonly (readonly [string, { says: string; approved: boolean }])[] = [
    ['Your claim, the documents for it, and what we found', ret('RET-7')],
    ['Our tax records about the claim', ret('RET-1')],
    ['A request you make about your data', ret('RET-4')],
    ['A complaint you make', ret('RET-6')],
    ['A record of a data breach', ret('RET-5')],
    ['An enquiry from our website that does not become a claim', { says: 'Twelve months after we close it.', approved: false }],
    ['Messages with a client who has no claim with us', { says: 'Twelve months.', approved: false }],
    // The live website's nightly backup (src/core/backup.ts, BACKUP_KEEP_DAYS); Word question 292.
    ['A copy in our nightly backup', { says: `${BACKUP_KEEP_DAYS} days. Something we delete leaves the backup ${BACKUP_KEEP_DAYS} days later.`, approved: false }],
  ];
  return h`${rows.map(([what, r]) => h`<tr><td>${what}</td><td>${r.says}</td><td>${r.approved ? 'Approved' : 'Proposed. Not yet approved by our data protection officer.'}</td></tr>`)}`;
}

function servicesRows(): Safe {
  return h`${OUTSIDE_SERVICES.filter((s) => s.personalData).map((s) => h`<tr><td><strong>${s.name}</strong>, ${s.role}</td>
    <td>${s.sent}</td><td>${s.why}</td><td>${s.where}${s.transfer === null ? raw('') : h` Safeguard for sending it outside the UK: <span class="gap">${s.transfer}</span>.`}</td><td>${s.inUse}</td></tr>`)}`;
}

export function privacyPolicyBody(updated: string): Safe {
  return h`
  <p>This policy says what personal data we collect, why, who we share it with, how long we keep it, and your rights.
  It covers our website and our client portal. Last updated: ${updated}.</p>

  <h2 id="who">Who we are</h2>
  <p>We are ${COMPANY}, trading as Cap Rebate. We are a company registered in England and Wales, number
  ${COMPANY_NUMBER}. Our registered office is ${OFFICE}. We decide how your personal data is used, so we are its
  "controller".</p>
  <ul>
    <li>Email about your data: ${mail(DP_MAIL)}</li>
    <li>Post: ${COMPANY}, ${OFFICE}</li>
    <li>Telephone: ${LATER}</li>
    <li>Our data protection officer: ${LATER}</li>
    <li>Our registration number with the Information Commissioner: ${LATER}</li>
  </ul>

  <h2 id="collect">What we collect, and where it comes from</h2>
  <ul>
    <li><strong>From you, on our website:</strong> your name, email address, phone number and business, and your
    answers to our free assessment. We also collect what you write in our contact form.</li>
    <li><strong>From you, as a client:</strong> your login, the documents you upload and your messages to us. We
    keep the engagement letter you sign, with when and where you signed it. We also keep the details for an identity
    check.</li>
    <li><strong>From your browser:</strong> your internet address, kept in our security log. Also the cookies
    in our <a href="/cookies/">cookie policy</a>.</li>
    <li><strong>From public registers:</strong> facts about the building and the business, such as its floor area,
    its sale price and who controls the company. Our <a href="/notices/">public notices</a> list each register.</li>
    <li><strong>From other people:</strong> an accountant who introduced you to us, and documents a client gives us,
    which can name people who are not our client. Our <a href="/notices/">public notices</a> are written for them.</li>
  </ul>

  <h2 id="why">Why we use it, and our lawful basis</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>What we do</th><th>Our lawful basis</th></tr></thead>
    <tbody>
      <tr><td>Give you a free estimate, and check public registers for it</td><td>Our legitimate interests: working out
      what you could claim. We tell you about it here and at the address question. We do not ask for consent for this.</td></tr>
      <tr><td>Answer your enquiry and book a call</td><td>Steps you ask us to take before a contract</td></tr>
      <tr><td>Do the work in your engagement letter, and run your portal account</td><td>Our contract with you</td></tr>
      <tr><td>Check who you are</td><td>A legal duty, where the rules against money laundering apply to our work. Our
      data protection officer is to confirm this: ${LATER}.</td></tr>
      <tr><td>Keep tax and business records</td><td>A legal duty</td></tr>
      <tr><td>Keep our systems and your account safe</td><td>Our legitimate interests</td></tr>
      <tr><td>Count visits with Google Analytics</td><td>Your consent, only if you press "Accept all". You can take it back
      at any time in our <a href="/cookies/#choice">cookie policy</a>.</td></tr>
    </tbody>
  </table></div>
  <p>We have weighed our interests against yours, where we rely on them. You can ask us for that check, and you can
  object (see Your rights).</p>

  <h2 id="share">Who receives it</h2>
  <p>We share your data only when we need to. These people may receive it for your claim:</p>
  <ul>
    <li>the chartered surveyor who values the fittings in your building;</li>
    <li>the chartered tax adviser who checks how your claim is filed;</li>
    <li>your own accountant, if they introduced you or you ask us to work with them;</li>
    <li>HM Revenue and Customs, which receives what a filed claim holds.</li>
  </ul>
  <p>We do not sell your data. We do not share it for anyone else's marketing.</p>

  <h2 id="services">The outside services we use</h2>
  <p>These companies hold or receive personal data for us. Each must act only on our instructions and keep it safe.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Service</th><th>What we send</th><th>Why</th><th>Where it is held</th><th>In use</th></tr></thead>
    <tbody>${servicesRows()}</tbody>
  </table></div>
  <p>Some registers get no personal data from us. They get only a postcode or a company number. Our
  <a href="/notices/">public notices</a> list them.</p>

  <h2 id="abroad">Sending data outside the UK</h2>
  <p>Some services above may hold data outside the UK. Where they do, the law asks for a safeguard, such as an
  agreement in a form the UK approves. For each one, the safeguard is ${TRANSFER_TO_CONFIRM}. We will name it here
  before the service holds anything about you.</p>

  <h2 id="keep">How long we keep it</h2>
  <p>We keep data only as long as we need it. Then we delete it. A legal hold, such as an open enquiry by HM Revenue and
  Customs, can mean we keep it for longer.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>What</th><th>How long</th><th>Status</th></tr></thead>
    <tbody>${retentionRows()}</tbody>
  </table></div>
  <p>Cookies last as long as our <a href="/cookies/">cookie policy</a> says.</p>

  <h2 id="rights">Your rights</h2>
  <ul>
    <li><strong>Access:</strong> ask what we hold about you, and get a copy.</li>
    <li><strong>Correction:</strong> ask us to correct what is wrong.</li>
    <li><strong>Deletion:</strong> ask us to delete it. We may need to keep some of it, for example for a tax claim.
    If so, we will tell you why.</li>
    <li><strong>Restriction:</strong> ask us to limit how we use it while a question is sorted out.</li>
    <li><strong>Objection:</strong> object to what we do on the basis of legitimate interests.</li>
    <li><strong>Portability:</strong> for data you gave us under our contract, ask for it in a form you can move.</li>
    <li><strong>Consent:</strong> take back a consent at any time. This does not undo what was done before.</li>
  </ul>
  <p>To use a right, email ${mail(DP_MAIL)} or write to us at the address above. Any words will do. We will answer
  within one month. We may take up to two more months for a complex request. If so, we will tell you why within the
  first month. Using your rights is free.</p>
  <p>No decision about you is made by a computer alone.</p>

  <h2 id="complaints">Complaints</h2>
  <p>If you are unhappy with how we use your data, please tell us first. Use the form on our
  <a href="/notices/#complaints">public notices</a> page, or email ${mail(DP_MAIL)}. We will reply within 30 days.</p>
  <p>You can also complain to the Information Commissioner at any time. You do not have to come to us first. Visit
  ico.org.uk, or call 0303 123 1113.</p>

  <h2 id="cookies">Cookies</h2>
  <p>Our <a href="/cookies/">cookie policy</a> lists every cookie we use and lets you change your answer.</p>

  <h2 id="changes">Changes to this policy</h2>
  <p>We will update this page when what we do changes. The date at the top says when it last changed.</p>`;
}

/* ------------------------------------------------------------------ *
 * THE CLIENT'S PORTAL TERMS
 * ------------------------------------------------------------------ */
export function portalTermsBody(updated: string): Safe {
  return h`
  <p>These terms cover using our client portal. Please read them with our <a href="/terms/">website terms of use</a>
  and our <a href="/privacy-policy/">privacy policy</a>. Last updated: ${updated}.</p>

  <h2>What the portal is for</h2>
  <p>The portal is where you follow your claim, sign your engagement letter, upload documents and send us messages.
  It is only for the business that engaged us, and the people that business names.</p>

  <h2>Your engagement letter comes first</h2>
  <p>Our work for you, our fees and what each of us must do are set out in your engagement letter. These terms do not
  change it. If these terms and your engagement letter ever say different things, the engagement letter wins.</p>

  <h2>Your login</h2>
  <ul>
    <li>Your login is for you alone. Do not share it.</li>
    <li>You can add a second step to your sign-in, such as a code from an app or an email. We advise it. If you do,
    keep it and your recovery codes safe too.</li>
    <li>Tell us at once at ${mail(SECURITY)} if you think someone else has used your login.</li>
  </ul>
  <p>You are responsible for what is done with your login until you tell us.</p>

  <h2>What you upload</h2>
  <ul>
    <li>Upload only documents your business has the right to share with us.</li>
    <li>If a document names other people, you must be allowed to give it to us. Our
    <a href="/notices/">public notices</a> tell those people how we use it.</li>
    <li>Do not upload anything with a virus or other harmful code.</li>
    <li>What you tell us must be true, to the best of your knowledge.</li>
  </ul>

  <h2>If the portal is misused</h2>
  <p>We may suspend or close a login that breaks these terms or our <a href="/acceptable-use/">acceptable use
  policy</a>, or that puts other people's data at risk. Where we can, we will tell you first and say why.</p>

  <h2>When the portal is not available</h2>
  <p>We work to keep the portal running, but we cannot promise it will never stop. If it does, you can email us at
  ${mail(CONTACT)}. Your deadlines in the engagement letter stay the same.</p>

  <h2>Your data</h2>
  <p>Our <a href="/privacy-policy/">privacy policy</a> says how we use your data and your rights.</p>

  <h2>Changes to these terms</h2>
  <p>We may change these terms. If we do, we will ask you to read the new version when you next sign in.</p>

  <h2>The law that applies</h2>
  <p>These terms are governed by the law of England and Wales. Any dispute about them will be dealt with by the courts
  of England and Wales.</p>`;
}
