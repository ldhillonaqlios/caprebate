/**
 * THE SURVEY'S EVIDENCE — ITS PAGES. 2 October 2026; the mock-up Lakhbir approved that day (src/web/survey-evidence.ts).
 *
 * THE CLIENT'S PORTAL — "Show us your building":
 *   GET  /portal/building[?job=]            the ways (the photo checklist, a video, a video call - recorded on a paid Zoom plan only, Phase 156d) and the checklist
 *   GET  /portal/building/item/{key}?job=   one item, as a phone shows it, with the next item after it
 *   GET  /portal/building/guide?job=        the filming guide, for the call
 *   POST /portal/building/photo             one photo for one item (a form with a file; no script)
 *   POST /portal/building/mark              "not in our building", "not safe or not ours", or that taken back
 *   POST /portal/building/photo/{id}/remove take a photo back
 *   GET  /portal/building/photo/{id}        the photo itself
 *   POST /portal/building/ask               ask for a recorded video call
 * THE SURVEYOR'S PACK — chapter 2 "Your inspection", and each line's photos in chapter 10:
 *   GET  /staff/survey/{job}/pack/photos[?line=]    every photo, or a line's
 *   GET  /staff/survey/{job}/pack/photo/{id}        one photo
 *   POST /staff/survey/{job}/pack/photo/{id}/withdraw  take one back (Admin, Sales), with why
 *   POST /staff/survey/{job}/pack/basis             how the surveyor inspected
 *   POST /staff/survey/{job}/pack/walkthrough       book the recorded video call
 *   POST /staff/survey/{job}/pack/recording         fetch its recording from Zoom
 *   GET  /staff/survey/{job}/pack/recording/{id}    open it (recorded), on Zoom
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, NotAuthorised, type Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import type { FsObjectStore } from './objectstore.ts';
import * as E from './survey-evidence.ts';
import { GROUPS, NOBODY_IN_SHOT } from './survey-checklist.ts';
import { manyFiles, singleFile } from './multipart.ts';
import { packJob } from './surveyor.ts';
import { staffSlots, addLocalDays, startOfLocalDay } from './schedule.ts';
import { localDate, localClock, ukDate } from './localtime.ts';
import { activeMeeting, clientJoinUrl } from './video-calls.ts';
import { zoomPlanIsFree } from '../connectors/zoom.ts';
import * as U from './photo-upload.ts';
import * as SV from './survey-video.ts';
import { coverageOf, deskFirstReading, videoCoverage, type Coverage } from './desk-first.ts';

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/** A photo, sent in pieces of 1 MB, so a full-size one is streamed rather than held to the test website's 4.5 MB answer. */
function sendImage(res: ServerResponse, img: { bytes: Buffer; content_type: string }): void {
  res.writeHead(200, { 'content-type': img.content_type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'", 'content-disposition': 'inline' });
  for (let at = 0; at < img.bytes.length; at += 1024 * 1024) res.write(img.bytes.subarray(at, at + 1024 * 1024));
  res.end();
}

/** A range of a video, at most one piece: 206 with its place in the whole; 416 for a range not in it; 404 for none. */
function playVideo(res: ServerResponse, r: Awaited<ReturnType<typeof SV.videoBytes>>): 'handled' {
  if (r === null) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('That video is not here.'); return 'handled'; }
  if (r === 'BAD_RANGE') { res.writeHead(416, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('That part is not in the video.'); return 'handled'; }
  res.writeHead(206, { 'content-type': r.content_type, 'content-range': `bytes ${String(r.start)}-${String(r.end)}/${String(r.total)}`, 'accept-ranges': 'bytes',
    'content-length': String(r.bytes.length), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" });
  res.end(r.bytes);
  return 'handled';
}

const when = (iso: string) => `${ukDate(localDate(iso))}, ${localClock(iso)}`;

/* ================================================================== *
 * THE CLIENT'S PORTAL
 * ================================================================== */

export type PortalEvidenceDeps = {
  app: App; store: FsObjectStore; newId: () => string; nav: Safe;
  form: (r: IncomingMessage) => Promise<URLSearchParams>;
  readBody: (r: IncomingMessage, max?: number) => Promise<Buffer>;
};

function photoForm(job: string, item: string, back: string): Safe {
  return h`<form method="post" action="/portal/building/photo" enctype="multipart/form-data" class="ev-take">
    <input type="hidden" name="job" value="${job}"><input type="hidden" name="item" value="${item}"><input type="hidden" name="back" value="${back}">
    <label class="ev-file">Take or choose a photo <input type="file" name="file" accept="image/jpeg,image/png" required></label>
    <label class="ck"><input type="checkbox" name="nobody" value="yes" required> Nobody is in this photo: no people, screens or records.</label>
    <label class="ev-note">A note, if it helps (optional) <input class="fi" name="note" maxlength="500" placeholder="For example: this is the second boiler"></label>
    <button class="cta" type="submit">Send the photo</button></form>`;
}

function markForms(job: string, item: E.ItemView, back: string, inList = false): Safe {
  const f = (mark: string, words: string, cls = 'btn-quiet') => h`<form method="post" action="/portal/building/mark" class="inline"><input type="hidden" name="job" value="${job}"><input type="hidden" name="item" value="${item.key}"><input type="hidden" name="mark" value="${mark}"><input type="hidden" name="back" value="${back}"><button class="${cls}" type="submit">${words}</button></form>`;
  if (item.mark === 'NOT_HERE') return f('CLEARED', 'I do have this');
  if (item.mark !== null) return f('CLEARED', 'Change this');
  if (item.photos.length > 0) return raw('');
  // 2 Oct 2026, Lakhbir: the list needs "I don't have this", which takes the item off the list.
  return inList ? f('NOT_HERE', 'I don’t have this') : h`${f('NOT_HERE', 'I don’t have this')} ${f('NOT_SAFE', 'Not safe or not ours')}`;
}

function status(i: E.ItemView): Safe {
  if (i.photos.length > 0) return h`<span class="ev-st ev-ok">${String(i.photos.length)} photo${i.photos.length === 1 ? '' : 's'}</span>`;
  if (i.mark === 'NOT_HERE') return h`<span class="ev-st ev-skip">You don’t have this</span>`;
  if (i.mark === 'NOT_SAFE') return h`<span class="ev-st ev-skip">Not safe or not ours</span>`;
  return h`<span class="ev-st ev-todo">to do</span>`;
}

function thumbs(photos: readonly E.PhotoRow[], src: (id: string) => string, limit = 6): Safe {
  return h`${photos.slice(0, limit).map((p) => h`<a href="${src(p.id)}"><img class="ev-thumb" src="${src(p.id)}" alt="A photo sent ${when(p.taken_at)}"></a>`)}`;
}

/** Send lots of photos at once: Admin or Sales sort them into the checklist. */
function manyForm(job: string, unsorted: number): Safe {
  return h`<section class="ev-box" id="many"><h2>Send lots of photos at once</h2>
    <p>Took photos already? Choose them all here. <strong>We sort them into the checklist for you.</strong></p>
    <form method="post" action="/portal/building/photos" enctype="multipart/form-data" class="ev-take" id="many-form">
      <input type="hidden" name="job" value="${job}">
      <label class="ev-file">Choose photos <input type="file" name="files" accept="image/jpeg,image/png" multiple required></label>
      <label class="ck"><input type="checkbox" name="nobody" value="yes" required> Nobody is in any of these photos: no people, screens or records.</label>
      <label class="ev-note">A note, if it helps (optional) <input class="fi" name="note" maxlength="500" placeholder="For example: the plant room and the kitchen"></label>
      <p class="help" id="many-limit">You can send up to 15 photos and 4.4 MB at a time. That is often 1 or 2 full-size phone photos, or more smaller ones. If it is too much, send the rest in another go.</p>
      <p class="help" id="many-lock" hidden><span class="ev-lock">Locked on your phone</span> Each photo is locked before it leaves your phone, and only we can open it.</p>
      <button class="cta" type="submit">Send these photos</button></form>
    <div id="many-progress" class="ev-progress" hidden><h3>Sending your photos</h3>
      <div class="ev-bar"><i id="many-bar" class="pk-w0"></i></div>
      <p class="help" id="many-count" role="status"></p>
      <ul id="many-list" class="ev-sendlist"></ul>
      <div id="many-end" hidden><p class="ev-done" id="many-end-words" role="status"></p><p><a class="cta" href="/portal/building/photos?job=${job}&amp;done=photos#many">Back to the checklist</a></p></div></div>
    ${unsorted === 0 ? raw('') : h`<p class="ev-wait" role="status">${String(unsorted)} photo${unsorted === 1 ? ' is' : 's are'} waiting for us to sort. You do not need to do anything.</p>`}</section>`;
}

const crumb = (job: string, here: string): Safe => h`<p class="ev-crumb"><a href="/portal/building?job=${job}">Show us your building</a> › <strong>${here}</strong></p>`;

/* 2 Oct 2026: three plain drawings for the three choices — no picture files, no style, nothing to load. */
const ICONS: Readonly<Record<'photos' | 'video' | 'call', Safe>> = Object.freeze({
  photos: raw('<svg class="ev-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>'),
  video: raw('<svg class="ev-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="6.5" width="12.5" height="11" rx="1.5"/><path d="M15.5 10.5l5.5-3v9l-5.5-3z"/></svg>'),
  call: raw('<svg class="ev-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 3.5l3 3-1.8 2.2a11 11 0 0 0 7.6 7.6l2.2-1.8 3 3-2 2.5C11 19.5 4.5 13 4 5.5z"/></svg>'),
});

type CallState = { next: E.Walkthrough | null; meeting: ReturnType<typeof activeMeeting>; asked: { at: string; by_name: string } | undefined };
function callState(d: PortalEvidenceDeps, job: string): CallState {
  const walks = E.walkthroughsOf(d.app.db, job).filter((w) => !w.cancelled && w.starts_at !== null);
  const next = walks.find((w) => (w.starts_at ?? '') >= d.app.now()) ?? null;
  return { next, meeting: next === null ? undefined : activeMeeting(d.app.db, next.booking_id), asked: E.asksOf(d.app.db, job)[0] };
}

/** "Show us your building": three choices, each to its own page (the mock-up Lakhbir approved, 2 Oct 2026). */
function overview(d: PortalEvidenceDeps, v: E.ChecklistView, jobs: readonly E.EvidenceJob[], q: URLSearchParams): Safe {
  const job = v.job.id;
  const pct = v.total === 0 ? 0 : Math.round(((v.done + v.marked) * 100) / v.total);
  const videos = SV.videosOf(d.app.db, job);
  const minutes = Math.round(videos.reduce((a, x) => a + x.duration_ms, 0) / 60_000);
  const call = callState(d, job);
  const notes: Record<string, string> = { asked: 'Thank you. We will offer you a time for the call.' };
  const done = q.get('done');
  return h`
    ${done !== null && notes[done] !== undefined ? h`<div class="gate" role="status">${notes[done]!}</div>` : raw('')}
    <h1>Show us your building</h1>
    ${jobs.length > 1 ? h`<p class="help">For: ${jobs.map((j, k) => {
      // The same place surveyed twice is told apart by its number.
      const name = jobs.filter((x) => x.place === j.place).length > 1 ? `${j.place} (survey ${String(k + 1)})` : j.place;
      return j.id === job ? h`<strong>${name}</strong> ` : h`<a href="/portal/building?job=${j.id}">${name}</a> `;
    })}</p>` : h`<p class="help">For: ${v.job.place}</p>`}
    <p>Your surveyor values the fixtures inside your building, so they need to see it. Choose any way that suits you. One is enough, and more is better.</p>
    <p class="ev-rule">${NOBODY_IN_SHOT}</p>
    <div class="ev-three">
      <section class="ev-choice">${ICONS.photos}<h2>Photos</h2><p>Go room by room with a checklist, or send lots of photos at once.</p>
        <div class="ev-bar" role="img" aria-label="${String(pct)} per cent done"><i class="pk-w${String(Math.round(pct / 5) * 5)}"></i></div>
        <p class="ev-state">${String(v.done + v.marked)} of ${String(v.total)} done${v.unsorted === 0 ? '' : ` · ${String(v.unsorted)} waiting for us to sort`}</p>
        <a class="cta" href="/portal/building/photos?job=${job}">Send photos</a></section>
      <section class="ev-choice">${ICONS.video}<h2>A video</h2><p>Film a slow walk round on your phone and send it to us. Up to 10 minutes a video.</p>
        <p class="ev-state">${videos.length === 0 ? 'None sent yet' : `${String(videos.length)} video${videos.length === 1 ? '' : 's'} sent, ${SV.minutesWords(minutes)}`}</p>
        <a class="cta" href="/portal/building/video?job=${job}">Send a video</a></section>
      <section class="ev-choice">${ICONS.call}<h2>${W(d).name}</h2><p>${W(d).choice}</p>
        <p class="ev-state">${call.next !== null && call.next.starts_at !== null ? `Booked: ${when(call.next.starts_at)}` : call.asked !== undefined ? 'Asked for: we will offer you a time' : 'Not asked for yet'}</p>
        <a class="cta" href="/portal/building/call?job=${job}">${call.next !== null || call.asked !== undefined ? 'See the call' : 'Ask for a call'}</a></section>
    </div>
    <p class="help">Not sure what to film? <a href="/portal/building/guide?job=${job}">Read the filming guide</a>. It lists every room and everything we need to see.</p>`;
}

/** Photos: send lots at once, then the checklist item by item. An item the client does not have leaves the list. */
function photosPage(v: E.ChecklistView, actor: Actor, q: URLSearchParams): Safe {
  const job = v.job.id;
  const may = actor.role === 'CLIENT';
  const showHidden = q.get('hidden') === '1';
  const hidden = v.items.filter((i) => i.mark === 'NOT_HERE' && i.photos.length === 0);
  const notes: Record<string, string> = { photos: 'Thank you. We have your photos, and we will sort them into the checklist.', photo: 'Thank you. We have the photo.', marked: 'Saved.', removed: 'That photo is taken back. Nobody will see it.' };
  const done = q.get('done');
  const listed = (i: E.ItemView) => showHidden || !hidden.includes(i);
  const back = (i: E.ItemView) => `/portal/building/photos?job=${job}${showHidden ? '&hidden=1' : ''}#i-${i.key}`;
  return h`
    ${done !== null && notes[done] !== undefined ? h`<div class="gate" role="status">${notes[done]!}</div>` : raw('')}
    ${crumb(job, 'Photos')}
    <h1>Photos</h1>
    <p class="ev-rule">${NOBODY_IN_SHOT}</p>
    ${may ? manyForm(job, v.unsorted) : raw('')}
    <section class="ev-box" id="items"><h2>Or go item by item</h2>
      <p class="help">The checklist, in the filming guide’s order: it starts outside and ends above the ceiling. ${String(v.done + v.marked)} of ${String(v.total)} done.</p>
      <p class="help">Covered so far: ${coverageWords(coverageOf(v))}</p>
      ${hidden.length === 0 ? raw('') : h`<p class="help">${showHidden
        ? h`Showing the ${String(hidden.length)} item${hidden.length === 1 ? '' : 's'} you don’t have. <a href="/portal/building/photos?job=${job}#items">Hide them</a>`
        : h`${String(hidden.length)} item${hidden.length === 1 ? '' : 's'} you don’t have ${hidden.length === 1 ? 'is' : 'are'} hidden. <a href="/portal/building/photos?job=${job}&amp;hidden=1#items">Show ${hidden.length === 1 ? 'it' : 'them'}</a>`}</p>`}
      ${GROUPS.map((g, gi) => {
        const all = v.items.filter((i) => i.group === g);
        const items = all.filter(listed);
        if (items.length === 0) return raw('');
        return h`<section class="ev-group"><h3>${String(gi + 1)} · ${g} <span>${String(all.filter((i) => i.done).length)} of ${String(all.length)} done</span></h3>
          ${items.map((i) => h`<div class="ev-item" id="i-${i.key}"><div><a href="/portal/building/item/${i.key}?job=${job}"><b>${i.title}</b></a>${i.each === true ? ' (each one)' : ''}. ${i.what}</div>
            <div class="ev-right">${thumbs(i.photos, (id) => `/portal/building/photo/${id}`, 3)} ${status(i)} ${may ? markForms(job, i, back(i), true) : raw('')}
              ${may && i.mark === null ? h`<a class="btn" href="/portal/building/item/${i.key}?job=${job}">${i.photos.length > 0 ? 'Add another' : 'Take a photo'}</a>` : raw('')}</div></div>`)}</section>`;
      })}</section>`;
}

/** A video: what to film, the send, and the client's videos. */
function videoPage(d: PortalEvidenceDeps, v: E.ChecklistView, actor: Actor, q: URLSearchParams): Safe {
  const job = v.job.id;
  const may = actor.role === 'CLIENT';
  const videos = SV.videosOf(d.app.db, job);
  const notes: Record<string, string> = { removed: 'That video is taken back. Nobody will see it.', script: 'Your browser could not send the video. Please try again on an up-to-date phone or computer browser.' };
  const done = q.get('done');
  const mmss = (ms: number) => `${String(Math.floor(ms / 60_000))}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`;
  return h`
    ${done !== null && notes[done] !== undefined ? h`<div class="gate" role="status">${notes[done]!}</div>` : raw('')}
    ${crumb(job, 'A video')}
    <h1>Send a video</h1>
    <ul class="ev-rules"><li>Walk slowly, room by room. Turn the lights on.</li><li>Hold the phone sideways. Pause on each boiler, meter and fuse board.</li>
      <li>${NOBODY_IN_SHOT}</li><li>Up to 10 minutes and 1 GB a video. A big building can be two or three videos.</li></ul>
    ${may ? h`<section class="ev-box" id="video">
      <form method="post" action="/portal/building/video" class="ev-take" id="video-form">
        <input type="hidden" name="job" value="${job}">
        <label class="ev-file">Choose or record a video <input type="file" name="video" accept="video/*" required></label>
        <label class="ck"><input type="checkbox" name="nobody" value="yes" required> Nobody is in this video: no people, screens or records.</label>
        <label class="ev-note">Which part of the building? (optional) <input class="fi" name="note" maxlength="500" placeholder="For example: the ground floor and the plant room"></label>
        <p class="help" id="video-lock" hidden><span class="ev-lock">Locked on your phone</span> The video is locked before it leaves your phone, and only we can open it.</p>
        <button class="cta" type="submit">Send the video</button></form>
      <div id="video-progress" class="ev-progress" hidden><h3>Sending your video</h3>
        <div class="ev-bar"><i id="video-bar" class="pk-w0"></i></div>
        <p class="help" id="video-count" role="status"></p>
        <div id="video-end" hidden><p class="ev-done" id="video-end-words" role="status"></p><p><a class="cta" href="/portal/building/video?job=${job}">Back to your videos</a></p></div></div>
    </section>` : raw('')}
    <section class="ev-box"><h2>Your videos</h2>
      ${videos.length === 0 ? h`<p class="help">None sent yet.</p>` : videos.map((x) => h`<div class="ev-vrow"><div><strong>${x.note ?? 'A video'}</strong>
          <span class="help">${mmss(x.duration_ms)} · ${(x.byte_size / 1048576).toFixed(0)} MB · sent ${when(x.taken_at)}</span></div>
        <video class="ev-video" controls preload="none" src="/portal/building/video/${x.id}/play"></video>
        ${may ? h`<form method="post" action="/portal/building/video/${x.id}/remove" class="inline"><button class="linkish" type="submit">Take it back</button></form>` : raw('')}</div>`)}
    </section>`;
}

/** PHASE 156d: the walkthrough call's words for our Zoom plan (src/web/survey-evidence.ts, WALK_WORDS). */
function W(d: { app: App }): E.WalkWords { return E.walkWords(zoomPlanIsFree(d.app.secrets)); }

/** The walkthrough video call: ask for one, or the time booked and the way in. */
function callPage(d: PortalEvidenceDeps, v: E.ChecklistView, actor: Actor, q: URLSearchParams): Safe {
  const job = v.job.id;
  const c = callState(d, job);
  return h`
    ${q.get('done') === 'asked' ? h`<div class="gate" role="status">Thank you. We will offer you a time for the call.</div>` : raw('')}
    ${crumb(job, W(d).name)}
    <h1>${W(d).name}</h1>
    <p>${W(d).lead}</p>
    <p class="ev-rule">${NOBODY_IN_SHOT}</p>
    <section class="ev-box">
      ${c.next !== null && c.next.starts_at !== null ? h`<p><strong>Booked: ${when(c.next.starts_at)}</strong></p>${c.meeting === undefined ? raw('') : h`<p><a class="cta" href="${clientJoinUrl('', c.meeting.client_token)}">Join the call</a></p>`}`
        : c.asked !== undefined ? h`<p>You asked for a call on ${when(c.asked.at)}. We will offer you a time.</p>`
        : actor.role === 'CLIENT' ? h`<form method="post" action="/portal/building/ask"><input type="hidden" name="job" value="${job}"><button class="cta" type="submit">${W(d).ask}</button></form>` : raw('')}
      <p><a href="/portal/building/guide?job=${job}">Read the filming guide</a> before the call.</p></section>`;
}

function itemPage(d: PortalEvidenceDeps, actor: Actor, v: E.ChecklistView, key: string, q: URLSearchParams): Safe | null {
  const idx = v.items.findIndex((i) => i.key === key);
  const i = v.items[idx];
  if (i === undefined) return null;
  const job = v.job.id;
  const nextItem = v.items.slice(idx + 1).find((x) => !x.done) ?? v.items[idx + 1];
  const inGroup = v.items.filter((x) => x.group === i.group);
  const back = `/portal/building/item/${i.key}?job=${job}`;
  const done = q.get('done');
  return h`<div class="ev-phone">
    ${done === 'photo' ? h`<div class="gate" role="status">Thank you. We have the photo.${i.each === true ? ' Add the next one, or move on.' : ''}</div>` : raw('')}
    <p class="help">${i.group} · ${String(inGroup.indexOf(i) + 1)} of ${String(inGroup.length)}</p>
    <h1>${i.title}</h1>
    <p>${i.what}</p>
    <ul class="ev-rules"><li>Lights on. Nobody in shot.</li><li>Do not open anything that is screwed shut.</li></ul>
    ${i.photos.length === 0 ? raw('') : h`<div class="ev-have">${i.photos.map((p) => h`<figure><img class="ev-thumb" src="/portal/building/photo/${p.id}" alt="A photo sent ${when(p.taken_at)}">
      ${actor.role === 'CLIENT' ? h`<form method="post" action="/portal/building/photo/${p.id}/remove"><input type="hidden" name="back" value="${back}"><button class="linkish" type="submit">Take it back</button></form>` : raw('')}</figure>`)}</div>`}
    ${actor.role === 'CLIENT' && i.mark === null ? photoForm(job, i.key, back) : raw('')}
    ${actor.role === 'CLIENT' ? h`<p>${markForms(job, i, back)}</p>` : raw('')}
    ${i.mark === null ? raw('') : h`<p>${status(i)}</p>`}
    <p class="ev-nav"><a href="/portal/building/photos?job=${job}#i-${i.key}">The whole list</a>${nextItem === undefined ? raw('') : h` · <a href="/portal/building/item/${nextItem.key}?job=${job}">Next: ${nextItem.title} →</a>`}</p>
  </div>`;
}

function guidePage(v: E.ChecklistView, words: E.WalkWords = E.WALK_WORDS.paid): Safe {
  return h`<div class="ev-guide"><h1>The filming guide</h1>
    <p>${words.guide} Read it once before you start.</p>
    <h2>Before you start</h2>
    <ul><li><strong>Film when the building is empty</strong>, out of hours if you can. ${NOBODY_IN_SHOT} If someone walks into shot, stop and start that room again.</li>
      <li><strong>Do not put yourself at risk.</strong> Skip anything that is not safe, or not yours to open, and say so.</li>
      <li><strong>Talk as you go.</strong> Say which room you are in and what you are pointing at. “I don’t know what that is” is a good thing to say.</li>
      <li>Lights on, blinds open, and do not film into a window.</li></ul>
    <h2>The order</h2>
    <ol>${GROUPS.map((g) => {
      const items = v.items.filter((i) => i.group === g);
      return items.length === 0 ? raw('') : h`<li><strong>${g}</strong><ul>${items.map((i) => h`<li>${i.title}: ${i.what}</li>`)}</ul></li>`;
    })}
      <li><strong>Anything you skipped</strong><ul><li>Last of all, say out loud what you skipped and why, or write it in a note. A gap you tell us about is fine.</li></ul></li></ol>
    <p><a href="/portal/building?job=${v.job.id}">Back to “Show us your building”</a></p></div>`;
}

export async function handlePortalEvidence(
  d: PortalEvidenceDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor, business_id: string,
): Promise<'handled' | 'not-mine'> {
  const path = url.pathname;
  if (path !== '/portal/building' && !path.startsWith('/portal/building/')) return 'not-mine';
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const html = (status: number, title: string, body: Safe) => { res.writeHead(status, HTML_HEADERS); res.end(page({ title, nav: d.nav, wide: true, body })); return 'handled' as const; };
  const jobs = E.jobsOfBusiness(d.app.db, business_id);
  const pick = (id: string | null) => jobs.find((j) => j.id === id) ?? jobs[0];

  const photo = /^\/portal\/building\/photo\/([A-Za-z0-9-]+)$/.exec(path);
  if (photo !== null && method === 'GET') {
    const img = await E.photoBytes(deps, d.store, actor, photo[1] ?? '');
    if (img === null) return html(404, 'Photo', h`<div class="card"><h1>That photo is not here</h1><p><a href="/portal/building">Back</a></p></div>`);
    sendImage(res, img);
    return 'handled';
  }
  const remove = /^\/portal\/building\/photo\/([A-Za-z0-9-]+)\/remove$/.exec(path);
  if (remove !== null && method === 'POST') {
    const f = await d.form(req);
    const r = E.withdrawPhoto(deps, actor, remove[1] ?? '', '');
    if (!r.ok) return html(400, 'Not done', h`<div class="card" role="alert"><h1>Not done</h1><p>${r.why}</p><p><a href="/portal/building">Back</a></p></div>`);
    redirect(res, safeBack(f.get('back'), '/portal/building/photos', 'removed'));
    return 'handled';
  }
  if (path === '/portal/building/photo' && method === 'POST') {
    const body = await d.readBody(req, E.MAX_PHOTO_BYTES + 64 * 1024);
    const got = singleFile(new Uint8Array(body), req.headers['content-type']);
    if (!got.ok) return html(400, 'Not sent', h`<div class="card" role="alert"><h1>The photo was not sent</h1><p>${got.why.charAt(0).toUpperCase() + got.why.slice(1)}.</p><p><a href="/portal/building">Back</a></p></div>`);
    const job = got.fields['job'] ?? '';
    const r = await E.addPhoto(deps, d.store, actor, { job_id: job, item_key: got.fields['item'] ?? '', bytes: got.part.bytes, nobody: got.fields['nobody'] ?? '', note: got.fields['note'] ?? '' });
    if (!r.ok) return html(400, 'Not sent', h`<div class="card" role="alert"><h1>The photo was not sent</h1><p>${r.why}</p><p><a href="${safeBack(got.fields['back'] ?? null, `/portal/building/photos?job=${job}`)}">Back</a></p></div>`);
    redirect(res, safeBack(got.fields['back'] ?? null, `/portal/building/photos?job=${job}`, 'photo'));
    return 'handled';
  }
  /* 2 Oct 2026: a send straight to the file store, each photo locked on the phone (src/web/photo-upload.ts). JSON for the
     page's script only. */
  if (path === '/portal/building/upload/start' && method === 'POST') {
    const f = await d.form(req);
    await U.sweepUploads(deps, d.store);
    return json(res, U.startUpload(deps, d.store, actor, { job_id: f.get('job') ?? '', photos: f.get('photos') ?? '', nobody: f.get('nobody') ?? '', note: f.get('note') ?? '' }));
  }
  const slotAsk = /^\/portal\/building\/upload\/([A-Za-z0-9-]+)\/slot$/.exec(path);
  if (slotAsk !== null && method === 'POST') {
    const f = await d.form(req);
    return answer(res, 'This photo could not be given a place in our file store', () => U.slotFor(deps, d.store, actor, slotAsk[1] ?? '', { n: f.get('n') ?? '', size: f.get('size') ?? '' }));
  }
  const slotPut = /^\/portal\/building\/upload\/([A-Za-z0-9-]+)\/slot\/([A-Za-z0-9-]+)$/.exec(path);
  if (slotPut !== null && method === 'PUT') {
    let body: Buffer;
    try { body = await d.readBody(req, U.MAX_LOCKED_BYTES); } catch (e) { if (e instanceof Error && e.name === 'PayloadTooLarge') return json(res, { ok: false, why: 'That photo is too big. The most is 25 MB.' }, 413); throw e; }
    return answer(res, 'This photo could not be kept on the way', () => U.putLocal(deps, d.store, actor, slotPut[1] ?? '', slotPut[2] ?? '', new Uint8Array(body)));
  }
  const slotDone = /^\/portal\/building\/upload\/([A-Za-z0-9-]+)\/slot\/([A-Za-z0-9-]+)\/done$/.exec(path);
  if (slotDone !== null && method === 'POST') return answer(res, 'This photo arrived but could not be kept', () => U.finishSlot(deps, d.store, actor, slotDone[1] ?? '', slotDone[2] ?? ''));
  if (path === '/portal/building/photos' && method === 'POST') {
    const tooMuch = () => html(413, 'Not sent', h`<div class="card" role="alert"><h1>The photos were not sent</h1><p>Those photos are too big together. The most is 4.4 MB in one go. Send fewer at a time.</p><p><a href="/portal/building/photos#many">Back</a></p></div>`);
    let body: Buffer;
    try { body = await d.readBody(req, E.MAX_PHOTO_BYTES + 64 * 1024); } catch (e) { if (e instanceof Error && e.name === 'PayloadTooLarge') return tooMuch(); throw e; }
    const got = manyFiles(new Uint8Array(body), req.headers['content-type'], E.MAX_PHOTOS_AT_ONCE);
    if (!got.ok) return html(400, 'Not sent', h`<div class="card" role="alert"><h1>The photos were not sent</h1><p>${got.why.charAt(0).toUpperCase() + got.why.slice(1)}.</p><p><a href="/portal/building/photos#many">Back</a></p></div>`);
    const job = got.fields['job'] ?? '';
    const r = await E.addPhotos(deps, d.store, actor, { job_id: job, files: got.files.map((f) => f.bytes), nobody: got.fields['nobody'] ?? '', note: got.fields['note'] ?? '' });
    if (!r.ok) return html(400, 'Not sent', h`<div class="card" role="alert"><h1>The photos were not sent</h1><p>${r.why}</p><p><a href="/portal/building/photos?job=${job}#many">Back</a></p></div>`);
    redirect(res, `/portal/building/photos?job=${job}&done=photos#many`);
    return 'handled';
  }
  if (path === '/portal/building/mark' && method === 'POST') {
    const f = await d.form(req);
    const r = E.markItem(deps, actor, { job_id: f.get('job') ?? '', item_key: f.get('item') ?? '', mark: f.get('mark') ?? '' });
    if (!r.ok) return html(400, 'Not saved', h`<div class="card" role="alert"><h1>Not saved</h1><p>${r.why}</p><p><a href="/portal/building">Back</a></p></div>`);
    redirect(res, safeBack(f.get('back'), `/portal/building/photos?job=${f.get('job') ?? ''}`, 'marked'));
    return 'handled';
  }
  if (path === '/portal/building/ask' && method === 'POST') {
    const f = await d.form(req);
    const r = E.askWalkthrough(deps, actor, f.get('job') ?? '', zoomPlanIsFree(d.app.secrets));
    if (!r.ok) return html(400, 'Not sent', h`<div class="card" role="alert"><h1>Not sent</h1><p>${r.why}</p><p><a href="/portal/building">Back</a></p></div>`);
    redirect(res, `/portal/building/call?job=${f.get('job') ?? ''}&done=asked`);
    return 'handled';
  }
  /* 2 Oct 2026: A VIDEO, in locked pieces straight to the file store (src/web/survey-video.ts). JSON for the page's script. */
  if (path === '/portal/building/video' && method === 'POST') {
    // Only a browser that could not run the page's script posts the form itself: a video cannot go without it.
    redirect(res, `/portal/building/video?job=${(await d.form(req)).get('job') ?? ''}&done=script`);
    return 'handled';
  }
  if (path === '/portal/building/video/start' && method === 'POST') {
    const f = await d.form(req);
    await SV.sweepVideos(deps, d.store);
    return answer(res, 'The video could not be started', async () => SV.startVideo(deps, d.store, actor, { job_id: f.get('job') ?? '', size: f.get('size') ?? '', nobody: f.get('nobody') ?? '', note: f.get('note') ?? '' }));
  }
  const vSlot = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/slot$/.exec(path);
  if (vSlot !== null && method === 'POST') {
    const f = await d.form(req);
    return answer(res, 'A piece of the video could not be given a place in our file store', () => SV.videoSlot(deps, d.store, actor, vSlot[1] ?? '', { n: f.get('n') ?? '', size: f.get('size') ?? '' }));
  }
  const vPut = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/slot\/([A-Za-z0-9-]+)$/.exec(path);
  if (vPut !== null && method === 'PUT') {
    let body: Buffer;
    try { body = await d.readBody(req, SV.MAX_LOCKED_PIECE); } catch (e) { if (e instanceof Error && e.name === 'PayloadTooLarge') return json(res, { ok: false, why: 'That piece is too big.' }, 413); throw e; }
    return answer(res, 'A piece of the video could not be kept on the way', () => SV.putVideoLocal(deps, d.store, actor, vPut[1] ?? '', vPut[2] ?? '', new Uint8Array(body)));
  }
  const vDone = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/slot\/([A-Za-z0-9-]+)\/done$/.exec(path);
  if (vDone !== null && method === 'POST') return answer(res, 'A piece of the video arrived but could not be kept', () => SV.finishPiece(deps, d.store, actor, vDone[1] ?? '', vDone[2] ?? ''));
  const vFinish = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/finish$/.exec(path);
  if (vFinish !== null && method === 'POST') return answer(res, 'The video arrived but could not be kept', () => SV.finishVideo(deps, d.store, actor, vFinish[1] ?? ''));
  const vPlay = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/play$/.exec(path);
  if (vPlay !== null && method === 'GET') return playVideo(res, await SV.videoBytes(deps, d.store, actor, vPlay[1] ?? '', req.headers['range']));
  const vRemove = /^\/portal\/building\/video\/([A-Za-z0-9-]+)\/remove$/.exec(path);
  if (vRemove !== null && method === 'POST') {
    const r = SV.withdrawVideo(deps, actor, vRemove[1] ?? '', '');
    if (!r.ok) return html(400, 'Not done', h`<div class="card" role="alert"><h1>Not done</h1><p>${r.why}</p><p><a href="/portal/building/video">Back</a></p></div>`);
    redirect(res, '/portal/building/video?done=removed');
    return 'handled';
  }
  if (method !== 'GET') return 'not-mine';
  const j = pick(url.searchParams.get('job'));
  if (j === undefined) return html(404, 'Show us your building', h`<div class="card"><h1>Show us your building</h1><p>There is no survey for your building yet. We will tell you when there is.</p><p><a href="/portal">Back to your portal</a></p></div>`);
  const v = E.checklistView(d.app.db, j.id);
  if (v === null) return 'not-mine';
  if (path === '/portal/building') return html(200, 'Show us your building', overview(d, v, jobs, url.searchParams));
  if (path === '/portal/building/photos' || path === '/portal/building/video') {
    const video = path.endsWith('/video');
    res.writeHead(200, { ...HTML_HEADERS, 'content-security-policy': photoPageCsp(d.store.incomingOrigin, video) });
    res.end(withUploadScript(page({ title: video ? 'Send a video' : 'Photos', nav: d.nav, wide: true,
      body: video ? videoPage(d, v, actor, url.searchParams) : photosPage(v, actor, url.searchParams) })));
    return 'handled';
  }
  if (path === '/portal/building/call') return html(200, W(d).name, callPage(d, v, actor, url.searchParams));
  if (path === '/portal/building/guide') return html(200, 'The filming guide', guidePage(v, W(d)));
  const item = /^\/portal\/building\/item\/([A-Z0-9-]{2,60})$/.exec(path);
  if (item !== null) {
    const body = itemPage(d, actor, v, item[1] ?? '', url.searchParams);
    if (body === null) return html(404, 'Not on the list', h`<div class="card"><h1>That is not on the checklist</h1><p><a href="/portal/building?job=${j.id}">Back</a></p></div>`);
    return html(200, v.items.find((x) => x.key === item[1])?.title ?? 'The checklist', body);
  }
  return 'not-mine';
}

/** A path back into the checklist: the list or an item, for one job, and an item's place on the list. */
const BACK_INTO_CHECKLIST = /^\/portal\/building(\/item\/[A-Z0-9-]{2,60}|\/photos)?\?job=[A-Za-z0-9-]+(&hidden=1)?(#i-[A-Z0-9-]{2,60})?$/;

/**
 * 2 Oct 2026: a step of a send that fails ANSWERS IN WORDS, with what went wrong (U.failureWords: never an address or a
 * token), and says it in the log — so a failure on the test website is never only "the website did not answer". A
 * refusal of who may do it is not caught: it is the router's 403, as everywhere.
 */
async function answer(res: ServerResponse, step: string, run: () => Promise<object>): Promise<'handled'> {
  try {
    return json(res, await run());
  } catch (e) {
    if (e instanceof NotAuthorised) throw e;
    const why = U.failureWords(e);
    console.error(`photo upload: ${step}: ${why}`);
    return json(res, { ok: false, why: `${step}. Please try again later; we have been told. (${why})` }, 500);
  }
}

function json(res: ServerResponse, body: object, status?: number): 'handled' {
  const ok = (body as { ok?: unknown }).ok === true;
  res.writeHead(status ?? (ok ? 200 : 400), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
  return 'handled';
}

/**
 * The photo page's security policy: every page's, plus OUR OWN script (/assets/photo-upload.js) and, on the test
 * website, the file store's upload address as the one other site the page may send to. Nothing inline, ever.
 */
export function photoPageCsp(incomingOrigin: string | null, video = false): string {
  // The video page also plays the client's videos (from this site) and reads a chosen video's length (a blob: of it).
  return `default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; ${video ? "media-src 'self' blob:; " : ''}` +
    `connect-src 'self'${incomingOrigin === null ? '' : ` ${incomingOrigin}`}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
}

/** The page with its one script, named last so the page reads without it. */
export function withUploadScript(html: string): string {
  return html.replace('</body>', '<script src="/assets/photo-upload.js" defer></script></body>');
}

/** Only a path back into the checklist, never somewhere else. */
function safeBack(back: string | null | undefined, fallback: string, done?: string): string {
  const b = back !== null && back !== undefined && BACK_INTO_CHECKLIST.test(back) ? back : fallback;
  if (done === undefined) return b;
  const [path, hash] = b.split('#');
  return `${path ?? ''}${(path ?? '').includes('?') ? '&' : '?'}done=${done}${hash === undefined ? '' : `#${hash}`}`;
}

/** The portal home's card: show us your building. */
export function portalEvidenceCard(db: App['db'], business_id: string): Safe {
  const jobs = E.jobsOfBusiness(db, business_id);
  const j = jobs[0];
  if (j === undefined) return raw('');
  const v = E.checklistView(db, j.id);
  if (v === null) return raw('');
  const left = v.total - v.done - v.marked;
  return h`<section class="card ev-card" id="show-us"><h2>Show us your building</h2>
    <p>${left === 0 ? 'Thank you: every item on the photo checklist is done.' : `${String(v.done + v.marked)} of ${String(v.total)} done on the photo checklist. Your surveyor uses these to value the fixtures.`}</p>
    <p class="help">Covered: ${coverageWords(videoCoverage(db, j.id))}</p>
    <p><a class="cta" href="/portal/building">${v.done + v.marked === 0 ? 'Start' : 'Carry on'}</a></p></section>`;
}

/* ================================================================== *
 * THE SURVEYOR'S PACK
 * ================================================================== */

export type StaffEvidenceDeps = {
  app: App; store: FsObjectStore; newId: () => string; nav: (actor: Actor) => Safe; origin: string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

export async function handleStaffEvidence(
  d: StaffEvidenceDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const m = /^\/staff\/survey\/([A-Za-z0-9-]+)\/pack\/(photos|sort|videos|video\/[A-Za-z0-9-]+|video\/[A-Za-z0-9-]+\/withdraw|photo\/[A-Za-z0-9-]+|photo\/[A-Za-z0-9-]+\/withdraw|basis|walkthrough|recording|recording\/[A-Za-z0-9-]+)$/.exec(url.pathname);
  if (m === null) return 'not-mine';
  const job = m[1] ?? '';
  const what = m[2] ?? '';
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const back = `/staff/survey/${job}/pack?ch=2`;
  if (method === 'GET' && what.startsWith('photo/')) {
    const img = await E.photoBytes(deps, d.store, actor, what.slice(6));
    if (img === null) return d.problem(res, actor, 'No photo', 'That photo is not here, or it was taken back.', back);
    sendImage(res, img);
    return 'handled';
  }
  /* 2 Oct 2026: the client's videos, watched in pieces; Admin or Sales may take one back. */
  if (method === 'GET' && what.startsWith('video/')) return playVideo(res, await SV.videoBytes(deps, d.store, actor, what.slice(6), req.headers['range']));
  if (method === 'GET' && what === 'videos') {
    const { obj, job: pj } = packJob(d.app.db, actor, job);
    if (!can(actor, 'surveyor_job.read', obj)) return 'not-mine';
    const videos = SV.videosOf(d.app.db, job);
    const mayWithdraw = can(actor, 'email.queue', { type: 'email', id: pj.business_id, business_id: pj.business_id });
    res.writeHead(200, { ...HTML_HEADERS, 'content-security-policy': "default-src 'none'; style-src 'self'; img-src 'self' data:; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    res.end(page({ title: `Videos · ${pj.business_name}`, nav: d.nav(actor), wide: true, body: h`
      <p class="eyebrow">${pj.business_name} · Survey pack · the client’s videos</p>
      <h1>The client’s videos</h1>
      ${url.searchParams.get('done') === 'withdrawn' ? h`<div class="gate" role="status">Taken back. Nobody will see it.</div>` : raw('')}
      <p><a href="${back}">Back to chapter 2</a></p>
      ${videos.length === 0 ? h`<p class="help">No videos yet.</p>` : videos.map((x) => h`<section class="ev-group"><h2>${x.note ?? 'A video'} <span>${String(Math.round(x.duration_ms / 1000))} seconds · ${(x.byte_size / 1048576).toFixed(0)} MB</span></h2>
        <div class="ev-vstaff"><video class="ev-video-big" controls preload="metadata" src="/staff/survey/${job}/pack/video/${x.id}"></video>
        <p class="help">Sent ${when(x.taken_at)} by ${x.taken_by_name}.</p>
        ${mayWithdraw ? h`<form method="post" action="/staff/survey/${job}/pack/video/${x.id}/withdraw" class="inline"><label class="vh" for="vw-${x.id}">Why take it back?</label><input id="vw-${x.id}" class="fi" name="reason" maxlength="300" required placeholder="Why take it back?"><button class="btn-quiet" type="submit">Take it back</button></form>` : raw('')}</div></section>`)}` }));
    return 'handled';
  }
  if (method === 'POST' && what.startsWith('video/') && what.endsWith('/withdraw')) {
    const f = await form(req);
    const r = SV.withdrawVideo(deps, actor, what.slice(6, -9), f.get('reason') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not done', r.why, `/staff/survey/${job}/pack/videos`);
    redirect(res, `/staff/survey/${job}/pack/videos?done=withdrawn`);
    return 'handled';
  }
  if (what === 'sort') {
    const { job: pj } = packJob(d.app.db, actor, job);
    if (!can(actor, 'email.queue', { type: 'email', id: pj.business_id, business_id: pj.business_id })) return 'not-mine';
    if (method === 'POST') {
      const f = await form(req);
      const choices: Record<string, string> = {};
      for (const [k, v] of f) if (k.startsWith('to-')) choices[k.slice(3)] = v;
      const r = E.sortPhotos(deps, actor, job, choices);
      if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/survey/${job}/pack/sort`);
      redirect(res, `/staff/survey/${job}/pack/sort?done=${String(r.sorted)}-${String(r.taken_back)}`);
      return 'handled';
    }
    if (method !== 'GET') return 'not-mine';
    const v = E.checklistView(d.app.db, job);
    if (v === null) return 'not-mine';
    const waiting = E.unsortedOf(d.app.db, job);
    const done = /^(\d+)-(\d+)$/.exec(url.searchParams.get('done') ?? '');
    res.writeHead(200, HTML_HEADERS);
    res.end(page({ title: `Sort the photos · ${v.job.place}`, nav: d.nav(actor), wide: true, body: h`
      <p class="eyebrow">${v.job.place} · Survey pack · the client’s photos</p>
      <h1>Sort the client’s photos</h1>
      ${done === null ? raw('') : h`<div class="gate" role="status">Saved: ${done[1] ?? '0'} put under the checklist, ${done[2] ?? '0'} taken back.</div>`}
      <p class="help">${waiting.length === 0 ? 'Nothing is waiting to be sorted.' : `${String(waiting.length)} waiting. Put each one under its checklist item. The surveyor sees it there, and on its line in chapter 10.`}</p>
      ${waiting.length === 0 ? raw('') : h`<form method="post" action="/staff/survey/${job}/pack/sort"><div class="ev-sort">${waiting.map((p) => h`<figure class="ev-card-photo">
        <a href="/staff/survey/${job}/pack/photo/${p.id}"><img class="ev-big" src="/staff/survey/${job}/pack/photo/${p.id}" alt="A photo sent ${when(p.taken_at)}"></a>
        <figcaption>${when(p.taken_at)} · ${p.taken_by_name}${p.note === null ? '' : ` · “${p.note}”`}
          <label for="to-${p.id}">Put it under</label>
<select class="fi" id="to-${p.id}" name="to-${p.id}"><option value="">Leave for now</option>${GROUPS.map((g) => {
            const items = v.items.filter((i) => i.group === g);
            return items.length === 0 ? raw('') : h`<optgroup label="${g}">${items.map((i) => h`<option value="${i.key}">${i.title}</option>`)}</optgroup>`;
          })}<option value="${E.TAKE_BACK}">Not useful: take it back</option></select></figcaption></figure>`)}</div>
        <p class="help">One click saves them all. Each move is kept with your name and the time. Nothing is deleted.</p>
        <button class="cta" type="submit">Save all</button></form>`}
      <p><a href="/staff/survey/${job}/pack?ch=2">Back to chapter 2</a></p>` }));
    return 'handled';
  }
  if (method === 'GET' && what === 'photos') {
    const { obj } = packJob(d.app.db, actor, job);
    if (!can(actor, 'surveyor_job.read', obj)) return 'not-mine';
    const v = E.checklistView(d.app.db, job);
    if (v === null) return 'not-mine';
    const line = url.searchParams.get('line');
    const items = v.items.filter((i) => i.photos.length > 0 && (line === null || i.lines.includes(line)));
    const mayWithdraw = can(actor, 'email.queue', { type: 'email', id: v.job.business_id, business_id: v.job.business_id });
    res.writeHead(200, HTML_HEADERS);
    res.end(page({ title: `Photos · ${v.job.place}`, nav: d.nav(actor), wide: true, body: h`
      <p class="eyebrow">${v.job.place} · Survey pack · the client’s photos</p>
      <h1>${line === null ? 'Every photo' : `The photos for ${line}`}</h1>
      <p><a href="${back}">Back to chapter 2</a>${line === null ? raw('') : h` · <a href="/staff/survey/${job}/pack/photos">Every photo</a>`}</p>
      ${line === null && v.unsorted > 0 ? h`<p class="ev-wait">${String(v.unsorted)} more sent in one go, not sorted yet.${mayWithdraw ? h` <a href="/staff/survey/${job}/pack/sort">Sort them</a>` : raw('')}</p>` : raw('')}
      ${items.length === 0 ? h`<p class="help">No photos yet.</p>` : items.map((i) => h`<section class="ev-group"><h2>${i.group} · ${i.title}</h2>
        <div class="ev-gallery">${i.photos.map((p) => h`<figure><a href="/staff/survey/${job}/pack/photo/${p.id}"><img class="ev-big" src="/staff/survey/${job}/pack/photo/${p.id}" alt="${i.title}, ${when(p.taken_at)}"></a>
          <figcaption>${when(p.taken_at)} · ${p.taken_by_name}${p.note === null ? '' : ` · “${p.note}”`}
          ${mayWithdraw ? h`<form method="post" action="/staff/survey/${job}/pack/photo/${p.id}/withdraw" class="inline"><label class="vh" for="wd-${p.id}">Why take it back?</label><input id="wd-${p.id}" class="fi" name="reason" maxlength="300" required placeholder="Why take it back?"><button class="btn-quiet" type="submit">Take it back</button></form>` : raw('')}</figcaption></figure>`)}</div></section>`)}` }));
    return 'handled';
  }
  if (method === 'GET' && what.startsWith('recording/')) {
    const to = E.watchRecording(deps, actor, job, what.slice(10));
    if (to === null) return d.problem(res, actor, 'No recording', 'That recording is not one of this job’s.', back);
    redirect(res, to);
    return 'handled';
  }
  if (method !== 'POST') return 'not-mine';
  const f = await form(req);
  let r: E.Result & { zoom?: boolean };
  if (what.endsWith('/withdraw')) r = E.withdrawPhoto(deps, actor, what.slice(6, -9), f.get('reason') ?? '');
  else if (what === 'basis') r = E.setBasis(deps, actor, job, { basis: f.get('basis') ?? '', note: f.get('note') ?? '' });
  else if (what === 'walkthrough') r = await E.bookWalkthrough(d.app, d.newId, actor, job, { slot: f.get('slot') ?? '', to: f.get('to') ?? '', origin: d.origin });
  else if (what === 'recording') r = await E.fetchRecording(d.app, d.newId, actor, job, f.get('walkthrough') ?? '');
  else return 'not-mine';
  if (!r.ok) return d.problem(res, actor, 'Not done', r.why, `${back}#inspection`, r.field);
  const done = what === 'walkthrough' ? (r.zoom === true ? 'booked' : 'booked-no-zoom') : what === 'recording' ? 'recording' : what === 'basis' ? 'basis' : 'withdrawn';
  redirect(res, what.endsWith('/withdraw') ? `/staff/survey/${job}/pack/photos?done=withdrawn` : `${back}&done=${done}#inspection`);
  return 'handled';
}

/** Chapter 2 of the pack: what the client sent, the walkthrough call, and how the surveyor inspected. */
export function inspectionChapter(app: App, actor: Actor, job_id: string, q: URLSearchParams): Safe {
  const v = E.checklistView(app.db, job_id);
  if (v === null) return raw('');
  const { obj, job } = packJob(app.db, actor, job_id);
  const isSurveyor = can(actor, 'surveyor_job.commit', obj);
  const mayArrange = isSurveyor || can(actor, 'email.queue', { type: 'email', id: job.business_id, business_id: job.business_id });
  const mayBook = can(actor, 'booking.write', { type: 'booking', id: 'walkthrough', business_id: job.business_id });
  const maySort = can(actor, 'email.queue', { type: 'email', id: job.business_id, business_id: job.business_id });
  const walks = E.walkthroughsOf(app.db, job_id);
  const asks = E.asksOf(app.db, job_id);
  const basis = E.basisOf(app.db, job_id);
  const base = `/staff/survey/${job_id}/pack`;
  const words = E.walkWords(zoomPlanIsFree(app.secrets));
  const notes: Record<string, string> = { booked: words.booked, 'booked-no-zoom': 'Booked, but Zoom made no meeting, so it will not be recorded. See the Communication tab for why.',
    recording: 'We have the recording from Zoom.', basis: 'Saved, under your name.' };
  const done = q.get('done');
  const slots = (() => {
    const s = staffSlots(app.db, app.now(), addLocalDays(startOfLocalDay(app.now()), 14), { onlyUser: actor.id, now: app.now() });
    return s.available ? s.slots.slice(0, 60) : [];
  })();
  const emails = app.db.all<{ email: string; name: string }>("SELECT email, full_name AS name FROM contacts WHERE business_id = ? AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", [job.business_id]);
  return h`<div id="inspection">
    ${done !== null && notes[done] !== undefined ? h`<div class="gate" role="status">${notes[done]!}</div>` : raw('')}
    <p class="lede">What the client sent so you can see inside the building, ${words.staffLede}, and how you inspected. How you inspected goes in the report.</p>
    <table class="pk-table"><thead><tr><th>Evidence from the client</th><th>Done</th><th></th></tr></thead><tbody>
      <tr><td>The photo checklist</td><td>${String(v.done)} of ${String(v.total)} items, ${String(v.photos)} photo${v.photos === 1 ? '' : 's'}${v.marked === 0 ? '' : ` · ${String(v.marked)} marked not in the building or not safe`}</td>
        <td>${v.photos === 0 ? raw('') : h`<a href="${base}/photos">See every photo</a>`}</td></tr>
      ${(() => {
        const vids = SV.videosOf(app.db, job_id);
        const secs = Math.round(vids.reduce((a, x) => a + x.duration_ms, 0) / 1000);
        return h`<tr><td>Videos from the client</td><td>${vids.length === 0 ? 'None sent.' : `${String(vids.length)} video${vids.length === 1 ? '' : 's'}, ${SV.lengthWords(secs)}`}</td>
          <td>${vids.length === 0 ? raw('') : h`<a href="${base}/videos">Watch them</a>`}</td></tr>`;
      })()}
      ${v.unsorted === 0 ? raw('') : h`<tr><td>Sent all at once, not sorted yet</td><td>${String(v.unsorted)} photo${v.unsorted === 1 ? '' : 's'}${maySort ? '' : ' · Admin or Sales sort them'}</td>
        <td>${maySort ? h`<a class="btn" href="${base}/sort">Sort them</a>` : raw('')}</td></tr>`}
      ${walks.length === 0 ? h`<tr><td>${words.staffName}</td><td>${asks.length === 0 ? 'None asked for or booked.' : `The client asked for one on ${when(asks[0]!.at)}.`}</td><td></td></tr>`
        : walks.map((w) => h`<tr><td>Walkthrough call${w.starts_at === null ? '' : `, ${when(w.starts_at)}`}${w.cancelled ? ' (cancelled)' : ''}<br><span class="help">Booked by ${w.booked_by_name}</span></td>
          <td>${w.recordings.length === 0 ? (w.meeting_id === null ? 'No Zoom meeting, so no recording.' : words.noRecording)
            : w.recordings.map((r) => h`<div>${String(r.minutes)} minutes, ${when(r.recorded_at)}${r.passcode === null ? '' : ` · passcode ${r.passcode}`} · opened ${String(r.views)} time${r.views === 1 ? '' : 's'}</div>`)}</td>
          <td>${w.recordings.map((r) => h`<a class="btn" href="${base}/recording/${r.id}">Watch the recording</a> `)}
            ${mayArrange && w.meeting_id !== null && !w.cancelled && w.recordings.length === 0 && words !== E.WALK_WORDS.free ? h`<form method="post" action="${base}/recording" class="inline"><input type="hidden" name="walkthrough" value="${w.id}"><button class="btn-quiet" type="submit">Get the recording from Zoom</button></form>` : raw('')}</td></tr>`)}
    </tbody></table>
    ${!mayBook ? (isSurveyor && walks.length === 0 ? h`<p class="help">${words.surveyorHelp}</p>` : raw(''))
      : emails.length === 0 ? h`<p class="help">The company has no contact with an email address, so a call cannot be booked.</p>`
      : slots.length === 0 ? h`<p class="help">You have no free times in the next 14 days, so a call cannot be booked. Set your working times on the calendar.</p>`
      : h`<details class="pk-add"${asks.length > 0 && walks.length === 0 ? raw(' open') : raw('')}><summary>${words.book}</summary>
        <form method="post" action="${base}/walkthrough"><div class="pk-fields">
          <label>With
<select class="fi" name="to">${emails.map((e) => h`<option value="${e.email}">${e.name} (${e.email})</option>`)}</select></label>
          <label>When (your free times)
<select class="fi" name="slot">${slots.map((s) => h`<option value="${s.starts_at}">${when(s.starts_at)}</option>`)}</select></label></div>
          <p class="help">${words.staffHelp}</p>
          <button class="cta" type="submit">Book it</button></form></details>`}
    ${(() => {
      // PHASE 153e (Word questions 129 to 131): the desk-first reading. The surveyor sees the level only; staff also see why.
      const r = deskFirstReading(app.db, job_id);
      if (r === null) return raw('');
      return h`<div class="pk-add"><h2>How much evidence this job needs (a test reading)</h2>
        <p><strong>${r.level_words}</strong></p>
        <p class="help">Photo checklist coverage: ${coverageWords(r.coverage)}</p>
        ${isSurveyor ? raw('') : h`<details><summary>Why (staff only: it names the value band)</summary><ul>${r.why.map((w) => h`<li>${w}</li>`)}</ul>
          ${r.signs.length === 0 ? raw('') : h`<p class="help">Warning signs that force a visit:</p><ul>${r.signs.map((w) => h`<li>${w}</li>`)}</ul>`}</details>`}</div>`;
    })()}
    <div class="pk-add"><h2>How you inspected</h2>
      ${basis === null ? h`<p class="help">Not said yet. It goes in the report, and approval waits for it.</p>` : h`<p><strong>${basis.words}</strong>${basis.note === null ? '' : `: “${basis.note}”`} <span class="pk-src pk-sv">${basis.by_name} · ${when(basis.at)}</span></p>`}
      ${isSurveyor ? h`<form method="post" action="${base}/basis"><div class="pk-fields"><label>How
<select class="fi" name="basis">${Object.entries(E.BASIS_WORDS).map(([k, w]) => h`<option value="${k}"${basis?.basis === k ? raw(' selected') : raw('')}>${w}</option>`)}</select></label>
        <label>A note (optional) <input class="fi" name="note" maxlength="500" placeholder="For example: the client’s photos of every room; the plant room by video" value="${basis?.note ?? ''}"></label></div>
        <button class="cta" type="submit">Save</button></form>` : h`<p class="help">The assigned surveyor says this.</p>`}</div>
  </div>`;
}

/**
 * PHASE 153e (Word question 130): the coverage of the filming guide's required items, and the PLACEHOLDER pass mark.
 * It measures how much of the guide was captured, never whether the figure is right.
 */
function coverageWords(c: Coverage | null): string {
  if (c === null) return '';
  return `${String(c.covered)} of ${String(c.required)} required items (${String(c.percent)}%). Our test pass mark is ${String(c.pass_mark_percent)}%: a placeholder until the surveyor sets it.`;
}

/** A pack line's photos, as a chip linking to them. */
export function lineEvidence(map: Map<string, { count: number; items: string[] }>, job_id: string, element_id: string | null): Safe {
  if (element_id === null) return raw('');
  const e = map.get(element_id);
  if (e === undefined) return raw('');
  return h`<a class="ev-chip" href="/staff/survey/${job_id}/pack/photos?line=${element_id}">${String(e.count)} photo${e.count === 1 ? '' : 's'} · ${e.items.slice(0, 2).join(', ')}${e.items.length > 2 ? '…' : ''}</a>`;
}
