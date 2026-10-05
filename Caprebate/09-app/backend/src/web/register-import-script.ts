/**
 * PHASE 156e, 5 October 2026 — THE CONNECTIONS PAGE'S ONE SCRIPT: TRIM A CARE REGULATOR'S LIST ON THE ADMIN'S COMPUTER.
 *
 * Why it exists: the Scottish datastore is about 10 MB and the test website takes about 4.5 MB a request. So, when an
 * import form is sent, this reads the chosen file here, in the publisher's own encoding (the Scottish file is
 * Windows-1252), keeps only the columns named on the form (`data-columns`: the ones src/web/register-files.ts reads),
 * and sends that as UTF-8 with `trimmed=1`. Names, telephone numbers and emails in the file never leave this computer.
 * A column the file does not have is simply not sent, so the server refuses the import whole and names it (N4).
 * With no script, the form still works as a plain upload for a file under 4.4 MB.
 *
 * No inline script, no innerHTML: words are set with textContent; a refusal page from the server is shown whole.
 */
export const REGISTER_IMPORT_JS = `(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;

  function say(el, words) { if (el) el.textContent = words; }

  /* A delimited file into rows, quotes and doubled quotes understood; a line break inside quotes stays in the cell. */
  function rows(text, delim) {
    var out = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { q = false; } }
        else { cell += ch; }
      } else if (ch === '"') { q = true; }
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\\n' || ch === '\\r') {
        if (ch === '\\r' && text[i + 1] === '\\n') i++;
        row.push(cell); cell = '';
        if (!(row.length === 1 && row[0] === '')) out.push(row);
        row = [];
      } else { cell += ch; }
    }
    if (cell !== '' || row.length > 0) { row.push(cell); out.push(row); }
    return out;
  }

  function quoted(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }

  /* Only the named columns, the header first. Exported for the test (test/phase156e.test.ts runs this file). */
  function trim(text, delim, wanted) {
    var all = rows(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, delim);
    if (all.length === 0) return '';
    var head = all[0].map(function (h) { return h.trim(); });
    var keep = [];
    wanted.forEach(function (w) { var i = head.indexOf(w); if (i >= 0) keep.push(i); });
    return all.map(function (r, n) {
      return keep.map(function (i) { return quoted(n === 0 ? head[i] : (r[i] === undefined ? '' : r[i])); }).join(',');
    }).join('\\n') + '\\n';
  }
  root.__registerTrim = trim;

  function wire(form) {
    var note = form.querySelector('.conn-note');
    form.addEventListener('submit', function (ev) {
      var input = form.querySelector('input[type=file]');
      var file = input && input.files && input.files[0];
      if (!file || typeof TextDecoder !== 'function' || typeof file.arrayBuffer !== 'function') return; // the plain upload
      ev.preventDefault();
      var wanted;
      try { wanted = JSON.parse(form.getAttribute('data-columns') || '[]'); } catch (e) { wanted = []; }
      say(note, 'Reading the file on this computer\\u2026');
      file.arrayBuffer().then(function (buf) {
        var text = new TextDecoder(form.getAttribute('data-encoding') || 'utf-8').decode(buf);
        var small = trim(text, form.getAttribute('data-delimiter') || ',', wanted);
        var fd = new FormData();
        fd.append('trimmed', '1');
        fd.append('filename', file.name);
        fd.append('file', new Blob([small], { type: 'text/csv' }), 'trimmed.csv');
        say(note, 'Sending only the columns we keep\\u2026');
        return root.fetch(form.action, { method: 'POST', body: fd, credentials: 'same-origin' });
      }).then(function (res) {
        if (res.redirected) { location.assign(res.url); return; }
        return res.text().then(function (html) { document.open(); document.write(html); document.close(); });
      }).catch(function () {
        say(note, 'That file could not be read here. Download it again from the publisher and choose the new file.');
      });
    });
  }

  if (typeof document !== 'undefined') {
    var forms = document.querySelectorAll('form.conn-import');
    for (var i = 0; i < forms.length; i++) wire(forms[i]);
  }
})();
`;
