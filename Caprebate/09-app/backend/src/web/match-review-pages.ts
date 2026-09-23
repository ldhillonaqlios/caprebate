/**
 * THE CLOSE-MATCH LIST, DRAWN — Phase 146h, 23 September 2026.
 *
 * Draws what src/web/match-review.ts returns and decides nothing: which lookup may be picked from, whether the
 * engagement is signed, whether the switch is on and what the register said are all settled there, on the server,
 * against the record. A renderer that decided whether to show a candidate would be a screen omitting a fact, which
 * is presentation pretending to be a control.
 *
 * THE LIST ON THIS PAGE IS NOT STORED ANYWHERE. It was fetched for this request and it is gone when the response
 * ends — no cache, no hidden field carrying it forward, no row. Choosing sends back ONE key, which the server looks
 * for in a list it fetches again (A.8 point 8, and condition CA5).
 *
 * THE PAGE RUNS NO SCRIPT, like every other page here, so each choice is its own small form with one button and
 * "None of these is this building" is a form of its own beside them.
 */

import { h, raw, page, type Safe } from './html.ts';
import { why } from './components.ts';
import { localStamp } from './localtime.ts';
import type { PickOffer } from './match-review.ts';

/** A score as a person reads it: two figures, and the words that say what it is. Never a percentage — it is not one. */
function scoreWords(score: number): string {
  return score.toFixed(2);
}

function candidateRow(business_id: string, source_id: string, c: { key: string; score: number; label: string; register: string | null }): Safe {
  return h`<tr>
    <td>${c.label}${c.register === null ? raw('') : h`<br><span class="help">from ${c.register}</span>`}</td>
    <td data-label="How close" class="when">${scoreWords(c.score)}</td>
    <td data-label="Choose"><form method="post" action="/staff/clients/${business_id}/research/pick/choose" class="inline">
      <input type="hidden" name="source_id" value="${source_id}">
      <input type="hidden" name="chosen_key" value="${c.key}">
      <button class="linkish" type="submit">This is the building</button></form></td>
  </tr>`;
}

export function pickPage(nav: Safe, business_id: string, business_name: string, offer: PickOffer): string {
  const back = `/staff/clients/${business_id}#sources`;
  const already = offer.already;
  const body = offer.ok
    ? h`
      <h1>Which one is this building?</h1>
      <p class="say">${offer.why}</p>
      <p class="help">${offer.publisher} holds these entries near this address. We could not choose between them
        ourselves, so nothing has been kept from this lookup${why(h`We only fill a figure in on our own when the
        address matches closely enough that there is no real doubt. Below that we ask a person, because a wrong
        building’s figures in a claim file is worse than no figures at all.`)}.</p>
      ${already === null ? raw('') : h`<p class="help"><strong>Somebody has already looked.</strong> ${already.chosen_key === null
        ? 'They said none of these is this building.'
        : 'They chose one of these.'} ${localStamp(already.picked_at)}. Choosing again replaces it.</p>`}

      <table class="stack"><thead><tr><th>What the register holds</th><th>How close</th><th>Choose</th></tr></thead>
        <tbody>${offer.candidates.map((c) => candidateRow(business_id, offer.source_id, c))}</tbody></table>

      <form method="post" action="/staff/clients/${business_id}/research/pick/choose">
        <input type="hidden" name="source_id" value="${offer.source_id}">
        <input type="hidden" name="chosen_key" value="">
        <button type="submit">None of these is this building</button>
        <span class="help"> We keep that answer, so nobody has to look through the same list again. Every question
          this lookup would have answered stays asked.</span>
      </form>

      <p class="help">What we keep is the one entry you choose, and the fact that you chose it. This list is not
        kept: it was fetched to show you and it goes when you leave this page.</p>
      <p><a href="${back}">Back to ${business_name}</a></p>`
    : h`
      <h1>Nothing to choose between</h1>
      <div class="stop"><strong>No list was shown.</strong> ${offer.why}</div>
      <p><a href="${back}">Back to ${business_name}</a></p>`;
  return page({ title: 'Which one is this building?', body, nav });
}
