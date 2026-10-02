/**
 * THE PHOTO PAGE'S ONE SCRIPT — served at /assets/photo-upload.js, and named only by "Show us your building" (the
 * client portal), whose security policy alone allows it (src/web/evidence-pages.ts, photoPageCsp). 2 October 2026.
 *
 * It takes over "Send lots of photos at once": each photo chosen is checked (JPEG or PNG by its first bytes, at most
 * 25 MB), LOCKED ON THE PHONE (a fresh AES-256-GCM key for each photo, itself locked with the send's public key, RSA-OAEP
 * with SHA-256 — src/web/photo-upload.ts opens it), sent straight to the file store at the one-time address the server
 * gives, and then reported done. The page shows each photo's state and the count. No photo is read by anything but this
 * script and our server.
 *
 * IF IT CANNOT RUN (no script, an old browser, no Web Crypto), nothing changes: the form posts to the page as before,
 * up to 15 photos and 4.4 MB a send. It sets no style (the security policy allows none): it only sets classes, text and
 * the `hidden` attribute. `lockPhoto` is also on CapRebatePhotoLock, so a test can lock a photo exactly as a phone does.
 */
export const PHOTO_UPLOAD_JS = `(function () {
  'use strict';
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  var MAGIC = [0x43, 0x42, 0x55, 0x50, 0x31];
  var MAX_BYTES = 25 * 1024 * 1024;
  var MAX_PHOTOS = 100;

  function fromBase64(b64) {
    var s = atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* One photo, locked: CBUP1, the locked key's length (2 bytes), the locked key, the nonce (12), the photo and its tag. */
  async function lockPhoto(publicKeyBase64, bytes) {
    var subtle = root.crypto.subtle;
    var pub = await subtle.importKey('spki', fromBase64(publicKeyBase64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    var raw = root.crypto.getRandomValues(new Uint8Array(32));
    var aes = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var body = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, bytes));
    var wrapped = new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw));
    raw.fill(0);
    var out = new Uint8Array(7 + wrapped.length + 12 + body.length);
    out.set(MAGIC, 0);
    out[5] = wrapped.length >> 8;
    out[6] = wrapped.length & 255;
    out.set(wrapped, 7);
    out.set(iv, 7 + wrapped.length);
    out.set(body, 7 + wrapped.length + 12);
    return out;
  }
  root.CapRebatePhotoLock = { lockPhoto: lockPhoto };

  if (typeof document === 'undefined') return;
  var form = document.getElementById('many-form');
  var box = document.getElementById('many-progress');
  if (!form || !box || !root.fetch || !root.crypto || !root.crypto.subtle || !root.URLSearchParams) return;
  var list = document.getElementById('many-list');
  var count = document.getElementById('many-count');
  var bar = document.getElementById('many-bar');
  var end = document.getElementById('many-end');
  var endWords = document.getElementById('many-end-words');
  var limit = document.getElementById('many-limit');
  var lock = document.getElementById('many-lock');
  if (limit) limit.textContent = 'You can send up to 100 photos at once, up to 25 MB each — full size is fine. If some do not go, send those again.';
  if (lock) lock.hidden = false;

  function megabytes(n) { return (n / 1048576).toFixed(1) + ' MB'; }
  function mark(el, cls, words) { el.className = cls; el.textContent = words; }
  function progress(done, total) {
    var pct = total === 0 ? 0 : Math.round((done * 100) / total);
    if (bar) bar.className = 'pk-w' + String(Math.round(pct / 5) * 5);
    if (count) count.textContent = String(done) + ' of ' + String(total) + ' done. Please keep this page open.';
  }
  async function post(url, fields) {
    try {
      var r = await root.fetch(url, { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new root.URLSearchParams(fields).toString() });
      var j = await r.json();
      return j && typeof j.ok === 'boolean' ? j : { ok: false, why: 'The website did not answer. Please try again.' };
    } catch (e) { return { ok: false, why: 'The website did not answer. Please try again.' }; }
  }
  async function kind(file) {
    var b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    return null;
  }
  var typeSkipped = false;
  function finish(job, sent, skipped, why) {
    var words = why ? why : sent === 0 ? 'No photo arrived.' :
      'Thank you. ' + String(sent) + (sent === 1 ? ' photo arrived' : ' photos arrived') + '. We will sort them into the checklist.';
    if (!why && skipped > 0) words += ' ' + String(skipped) + ' did not: the list says why.';
    if (!why && typeSkipped) words += ' On an iPhone, choose a skipped photo again here and it is sent as a JPEG.';
    if (endWords) { endWords.textContent = words; endWords.className = why || sent === 0 ? 'ev-fail' : 'ev-done'; }
    if (end) end.hidden = false;
    if (count && !why) count.textContent = String(sent + skipped) + ' of ' + String(sent + skipped) + ' done.';
  }

  async function send(files, job, note) {
    form.hidden = true;
    box.hidden = false;
    var states = files.map(function (f) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = f.name + ' · ' + megabytes(f.size);
      var st = document.createElement('span');
      mark(st, 'ev-wt', 'Waiting');
      li.appendChild(name);
      li.appendChild(st);
      list.appendChild(li);
      return st;
    });
    progress(0, files.length);
    if (files.length > MAX_PHOTOS) { finish(job, 0, 0, 'You chose ' + String(files.length) + ' photos. Send at most 100 at a time.'); return; }
    var start = await post('/portal/building/upload/start', { job: job, photos: String(files.length), nobody: 'yes', note: note });
    if (!start.ok) { finish(job, 0, 0, start.why); return; }
    var sent = 0;
    var skipped = 0;
    for (var i = 0; i < files.length; i++) {
      var st = states[i];
      var f = files[i];
      try {
        if (f.size > MAX_BYTES) { mark(st, 'ev-bad', 'Too big (the most is 25 MB) — skipped'); skipped++; }
        else if ((await kind(f)) === null) { mark(st, 'ev-bad', 'Not a JPEG or PNG — skipped'); skipped++; typeSkipped = true; }
        else {
          mark(st, 'ev-wt', 'Sending…');
          var locked = await lockPhoto(start.key, new Uint8Array(await f.arrayBuffer()));
          var slot = await post('/portal/building/upload/' + start.session + '/slot', { n: String(i + 1), size: String(locked.length) });
          if (!slot.ok) { mark(st, 'ev-bad', slot.why); skipped++; }
          else {
            var headers = { 'content-type': 'application/octet-stream' };
            for (var h in slot.headers) headers[h] = slot.headers[h];
            var put = await root.fetch(slot.url, { method: 'PUT', headers: headers, body: new Blob([locked], { type: 'application/octet-stream' }),
              credentials: slot.url.charAt(0) === '/' ? 'same-origin' : 'omit' });
            if (!put.ok) { mark(st, 'ev-bad', 'Not sent: the connection failed. Send it again.'); skipped++; }
            else {
              var done = await post('/portal/building/upload/' + start.session + '/slot/' + slot.slot + '/done', {});
              if (done.ok) { mark(st, 'ev-ok2', 'Sent'); sent++; } else { mark(st, 'ev-bad', done.why); skipped++; }
            }
          }
        }
      } catch (e) { mark(st, 'ev-bad', 'Not sent: something went wrong. Send it again.'); skipped++; }
      progress(i + 1, files.length);
    }
    finish(job, sent, skipped, null);
  }

  form.addEventListener('submit', function (e) {
    var input = form.querySelector('input[name="files"]');
    var tick = form.querySelector('input[name="nobody"]');
    var job = form.querySelector('input[name="job"]');
    var note = form.querySelector('input[name="note"]');
    if (!input || !input.files || input.files.length === 0 || !tick || !tick.checked || !job) return;
    e.preventDefault();
    send(Array.prototype.slice.call(input.files), job.value, note ? note.value : '');
  });
})();
`;
