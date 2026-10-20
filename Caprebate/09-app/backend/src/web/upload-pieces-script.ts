/**
 * THE UPLOAD FORMS' ONE SCRIPT — served at /assets/upload-pieces.js, and named only by a page with a form marked
 * `data-pieces` (`piecesPage` in src/web/upload-pieces.ts). PHASE 160e, 19 October 2026.
 *
 * A chosen file at or under the size Vercel takes in one request goes with the form, whole, as it always did. A bigger
 * one is sent in pieces first (`startPieces`, `putPiece`), and the form is then sent as before with the file box
 * emptied and the send's id in a field named `pieces`; the form's own handler takes the file from the pieces. With no
 * script (or an old browser) the form sends the file whole, exactly as before this phase.
 *
 * It sets no HTML from anything: it reads the chosen file's size, sends its bytes, and writes its own words into the
 * form's own note. Nothing is kept in the browser.
 */
import { PIECED_ABOVE } from './upload-pieces.ts';

export const UPLOAD_PIECES_JS = `(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  var root = window;
  if (!root.fetch) return;
  var ABOVE = ${String(PIECED_ABOVE)};
  var forms = document.querySelectorAll('form[data-pieces]');
  for (var i = 0; i < forms.length; i++) wire(forms[i]);

  function wire(form) {
    if (form.getAttribute('data-pieces-wired') === '1') return;
    form.setAttribute('data-pieces-wired', '1');
    form.addEventListener('submit', function (e) {
      var box = form.querySelector('input[type="file"]');
      var file = box && box.files && box.files[0];
      if (!file || file.size <= ABOVE) return;
      e.preventDefault();
      send(form, box, file);
    });
  }

  function say(form, words) {
    var note = form.querySelector('[data-pieces-note]');
    if (!note) {
      note = document.createElement('p');
      note.setAttribute('data-pieces-note', '');
      note.setAttribute('role', 'status');
      note.className = 'help';
      form.appendChild(note);
    }
    note.textContent = words;
  }

  function busy(form, on) {
    var b = form.querySelectorAll('button, input[type="submit"]');
    for (var i = 0; i < b.length; i++) b[i].disabled = on;
  }

  function answer(r) {
    return r.json().then(function (j) { return j; }, function () { return { ok: false, why: 'The website did not answer. Try again.' }; });
  }

  function send(form, box, file) {
    busy(form, true);
    say(form, 'Sending your file. Keep this page open.');
    root.fetch('/upload/pieces/start', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'size=' + encodeURIComponent(String(file.size))
    }).then(answer).then(function (s) {
      if (!s.ok) throw new Error(s.why);
      var n = 0;
      function next() {
        if (n >= s.pieces) return Promise.resolve();
        var from = n * s.piece_bytes;
        var piece = file.slice(from, Math.min(file.size, from + s.piece_bytes));
        say(form, 'Sending your file: ' + String(Math.round((from / file.size) * 100)) + '%. Keep this page open.');
        return root.fetch('/upload/pieces/' + encodeURIComponent(s.id) + '/' + String(n), {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': 'application/octet-stream' }, body: piece
        }).then(answer).then(function (p) {
          if (!p.ok) throw new Error(p.why);
          n++;
          return next();
        });
      }
      return next().then(function () {
        say(form, 'Sending your file: 100%. Nearly done.');
        var id = document.createElement('input');
        id.type = 'hidden'; id.name = 'pieces'; id.value = s.id;
        form.appendChild(id);
        box.disabled = true;
        form.submit();
      });
    }).catch(function (err) {
      busy(form, false);
      say(form, (err && err.message) ? err.message : 'Your file was not sent. Try again.');
    });
  }
})();
`;
