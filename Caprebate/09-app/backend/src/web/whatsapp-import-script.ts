/**
 * PHASE 156c, 5 October 2026 — THE WHATSAPP PAGES' ONE SCRIPT: OPEN AN EXPORTED CHAT ON THE PERSON'S OWN COMPUTER.
 *
 * Why it exists: the test website takes about 4.5 MB a request, and a real export with its photos is far bigger (the
 * first one tried was 53 MB, the whole history of the chat). So, for a .zip over 3.5 MB:
 *   - on the WhatsApp page, it reads the .zip here, and sends only the chat's text and the list of file names; the
 *     server's check page follows. The file itself is remembered in this browser (IndexedDB) for the next step.
 *   - on the check page, once saved, it asks the server which files are still needed (only those from the dates kept)
 *     and sends each one on its own. Without the remembered file, the person chooses the .zip again.
 * Nothing else leaves the computer. With no script (or an old browser), the forms still work as plain uploads: a small
 * .zip or the .txt in one go, and the photos one at a time.
 *
 * No inline script, no innerHTML: words are set with textContent; a refusal page from the server is shown whole.
 */
export const WHATSAPP_IMPORT_JS = `(function () {
  'use strict';
  var BIG = 3.5 * 1024 * 1024;
  var ONE_REQUEST = 4.4 * 1024 * 1024;
  var CHAT = /(^|\\/)(_chat\\.txt|WhatsApp Chat[^\\/]*\\.txt)$/i;
  var canInflate = typeof DecompressionStream === 'function';
  // The browser's own fetch, named through root like the other page scripts (test/phase146b: only http.ts calls fetch on the server).
  var root = typeof window !== 'undefined' ? window : globalThis;

  function say(el, words) { if (el) el.textContent = words; }
  function base(n) { var p = n.split(/[\\\\\\/]/); return p[p.length - 1]; }

  /* ---- A zip, read from its central directory (stored or deflated entries; no zip64). ---- */
  function readZip(file) {
    var tail = Math.min(file.size, 66000 + 22);
    return file.slice(file.size - tail).arrayBuffer().then(function (buf) {
      var v = new DataView(buf), eocd = -1;
      for (var i = buf.byteLength - 22; i >= 0; i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
      if (eocd < 0) throw new Error('not a zip');
      var count = v.getUint16(eocd + 10, true), size = v.getUint32(eocd + 12, true), off = v.getUint32(eocd + 16, true);
      return file.slice(off, off + size).arrayBuffer().then(function (cd) {
        var d = new DataView(cd), p = 0, out = [], dec = new TextDecoder('utf-8');
        for (var n = 0; n < count; n++) {
          if (d.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
          var method = d.getUint16(p + 10, true), comp = d.getUint32(p + 20, true), real = d.getUint32(p + 24, true);
          var nl = d.getUint16(p + 28, true), xl = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true), local = d.getUint32(p + 42, true);
          out.push({ name: dec.decode(new Uint8Array(cd, p + 46, nl)), method: method, comp: comp, size: real, local: local });
          p += 46 + nl + xl + cl;
        }
        return out;
      });
    });
  }
  function entryBlob(file, e) {
    return file.slice(e.local, e.local + 30).arrayBuffer().then(function (h) {
      var v = new DataView(h), start = e.local + 30 + v.getUint16(26, true) + v.getUint16(28, true);
      var raw = file.slice(start, start + e.comp);
      if (e.method === 0) return raw;
      if (e.method !== 8 || !canInflate) throw new Error('cannot open');
      return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    });
  }

  /* ---- The file, remembered between the two pages (this browser only; forgotten when all is added). ---- */
  function store(op, value) {
    return new Promise(function (ok) {
      try {
        var r = indexedDB.open('caprebate-whatsapp', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
        r.onerror = function () { ok(null); };
        r.onsuccess = function () {
          try {
            var tx = r.result.transaction('f', op === 'get' ? 'readonly' : 'readwrite'), s = tx.objectStore('f');
            var q = op === 'get' ? s.get('export') : op === 'put' ? s.put(value, 'export') : s.delete('export');
            q.onsuccess = function () { ok(op === 'get' ? q.result || null : true); };
            q.onerror = function () { ok(null); };
          } catch (e) { ok(null); }
        };
      } catch (e) { ok(null); }
    });
  }

  function showPage(res) { return res.text().then(function (t) { document.open(); document.write(t); document.close(); }); }

  /* ---- Step 1: the WhatsApp page's upload ---- */
  var up = document.getElementById('wa-import');
  if (up) up.addEventListener('submit', function (ev) {
    var input = document.getElementById('wa-imp-file'), note = document.getElementById('wa-imp-note');
    var file = input && input.files && input.files[0];
    if (!file || !/\\.zip$/i.test(file.name) || file.size <= BIG) return;
    ev.preventDefault();
    if (!canInflate) { say(note, 'This browser cannot open a big .zip here. Unzip it on the computer and choose the chat\\u2019s .txt file instead; add the photos after saving.'); return; }
    say(note, 'Opening the export on this computer\\u2026');
    readZip(file).then(function (entries) {
      var chat = entries.filter(function (e) { return CHAT.test(e.name); })[0];
      if (!chat) throw new Error('no chat');
      return entryBlob(file, chat).then(function (text) {
        var fd = new FormData();
        fd.append('contact_id', up.querySelector('[name=contact_id]').value);
        fd.append('filename', file.name);
        fd.append('chat', text, 'chat.txt');
        fd.append('names', new Blob([entries.map(function (e) { return e.name; }).join('\\n')], { type: 'text/plain' }), 'names.txt');
        say(note, 'Sending the chat\\u2019s words (not the photos yet)\\u2026');
        return store('put', file).then(function () { return root.fetch(up.action, { method: 'POST', body: fd, credentials: 'same-origin' }); });
      });
    }).then(function (res) {
      if (res.redirected) { location.assign(res.url); return; }
      return showPage(res);
    }).catch(function (e) {
      say(note, e && e.message === 'no chat' ? 'That .zip has no WhatsApp chat in it. On the phone: open the chat, tap the name, then Export chat.' : 'That .zip could not be opened here. Export the chat again and choose the new file.');
    });
  });

  /* ---- Step 3: the photos and files, after saving ---- */
  var box = document.getElementById('wa-files');
  if (box) {
    var form = document.getElementById('wa-files-form'), note2 = document.getElementById('wa-files-note');
    var send = function (file) {
      say(note2, 'Finding the files to add\\u2026');
      return root.fetch(box.getAttribute('data-waiting'), { credentials: 'same-origin', headers: { accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (w) {
          var wanted = w.waiting || [];
          return readZip(file).then(function (entries) {
            var todo = entries.filter(function (e) { return wanted.indexOf(base(e.name)) >= 0; });
            var done = 0, skipped = 0, i = 0;
            var next = function () {
              if (i >= todo.length) {
                if (done + skipped === 0 && wanted.length > 0) { say(note2, 'None of the files still to add is in that .zip. Choose the export of this chat.'); return; }
                if (skipped === 0) store('delete');
                say(note2, 'Added ' + done + (skipped ? '; ' + skipped + ' too big for the website (over 4.4 MB) \\u2014 add those one at a time from the unzipped folder' : '') + '.');
                setTimeout(function () { location.reload(); }, 800);
                return;
              }
              var e = todo[i++];
              if (e.size > ONE_REQUEST) { skipped++; return next(); }
              say(note2, 'Adding ' + (done + skipped + 1) + ' of ' + todo.length + '\\u2026');
              return entryBlob(file, e).then(function (b) {
                var fd = new FormData(); fd.append('name', base(e.name)); fd.append('file', b, base(e.name));
                return root.fetch(box.getAttribute('data-file'), { method: 'POST', body: fd, credentials: 'same-origin', headers: { accept: 'application/json' } });
              }).then(function (r) { if (r.ok) done++; else skipped++; return next(); });
            };
            return next();
          });
        }).catch(function () { say(note2, 'The files could not be added from here. Choose one photo or file at a time instead.'); });
    };
    if (form) form.addEventListener('submit', function (ev) {
      var input = document.getElementById('wa-files-zip'), file = input && input.files && input.files[0];
      if (!file || !/\\.zip$/i.test(file.name) || !canInflate) return;
      ev.preventDefault(); send(file);
    });
    store('get').then(function (file) { if (file && canInflate) send(file); });
  }
})();
`;
