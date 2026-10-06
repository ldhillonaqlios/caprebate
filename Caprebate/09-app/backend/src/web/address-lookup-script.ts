/**
 * THE ADDRESS BOX'S ONE SCRIPT — served at /assets/address-lookup.js, and named only by the assessment's "Your details"
 * screen while "Find my address" is on (src/web/router.ts, f4Html). Phase 156f, 6 October 2026.
 *
 * Lakhbir: "one address box on Homedata". As soon as the postcode typed is a complete UK postcode, the list of addresses
 * there fills (one 2p search, POST /assessment/details/addresses, which keeps the £1 a day cap); typing in the box above
 * the list then narrows it IN THE BROWSER, for nothing. Picking one fills the building and town boxes. "My address is not
 * in the list" is always there.
 *
 * IF IT CANNOT RUN (no script, an old browser), nothing changes: the "Find my address" button posts the page and the
 * server draws the same list. It sets no style and no HTML from an answer: it builds each line with textContent, and only
 * sets classes, text and the `hidden` attribute (the page's security policy allows no inline style or script).
 */
export const ADDRESS_LOOKUP_JS = `(function () {
  'use strict';
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  if (typeof document === 'undefined' || !root.fetch || !root.URLSearchParams) return;
  var FULL = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;

  function norm(v) { return String(v || '').toUpperCase().replace(/\\s+/g, ' ').trim(); }
  function words(v) { return String(v || '').toLowerCase().split(/[\\s,]+/).filter(function (w) { return w !== ''; }); }

  function option(i, value, text, line1, town, checked) {
    var label = document.createElement('label');
    label.className = 'opt';
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'b' + i + '_address_pick';
    input.value = value;
    if (checked) input.checked = true;
    if (line1 !== null) input.setAttribute('data-line1', line1);
    if (town !== null) input.setAttribute('data-town', town);
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + text));
    return label;
  }

  function wire(box) {
    var i = box.getAttribute('data-building');
    var postcode = document.getElementById('b' + i + '-postcode');
    var line1 = document.getElementById('b' + i + '-line1');
    var town = document.getElementById('b' + i + '-town');
    var button = document.querySelector('button[name="find"][value="address:' + i + '"]');
    if (!postcode) return;
    if (button) button.hidden = true;
    var last = norm(box.getAttribute('data-searched'));
    var status = document.createElement('p');
    status.className = 'help';
    status.setAttribute('role', 'status');

    function narrowBox(list) {
      var wrap = document.createElement('div');
      wrap.className = 'f4-narrow';
      var l = document.createElement('label');
      l.className = 'fl';
      l.setAttribute('for', 'b' + i + '-narrow');
      l.textContent = 'Start typing the building name or number to narrow the list';
      var n = document.createElement('input');
      n.className = 'fi';
      n.id = 'b' + i + '-narrow';
      n.type = 'search';
      n.autocomplete = 'off';
      n.addEventListener('input', function () {
        var want = words(n.value);
        var opts = list.querySelectorAll('label.opt');
        for (var k = 0; k < opts.length; k++) {
          var input = opts[k].querySelector('input');
          if (!input || input.value === 'none') continue;
          var text = (opts[k].textContent || '').toLowerCase();
          opts[k].hidden = !want.every(function (w) { return text.indexOf(w) >= 0; });
        }
      });
      wrap.appendChild(l);
      wrap.appendChild(n);
      return wrap;
    }

    function onPick(list) {
      list.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || t.name !== 'b' + i + '_address_pick' || t.value === 'none') return;
        if (line1 && t.getAttribute('data-line1') !== null) line1.value = t.getAttribute('data-line1');
        if (town && t.getAttribute('data-town') !== null) town.value = t.getAttribute('data-town');
      });
    }

    function draw(addresses, note) {
      while (box.firstChild) box.removeChild(box.firstChild);
      if (addresses.length === 0) {
        if (note) { status.textContent = note; box.appendChild(status); }
        return;
      }
      var fs = document.createElement('fieldset');
      fs.className = 'f4-addresses';
      var lg = document.createElement('legend');
      lg.className = 'fl';
      lg.textContent = 'Choose your address';
      fs.appendChild(lg);
      var list = document.createElement('div');
      list.className = 'opts f4-address-list';
      addresses.forEach(function (a) { list.appendChild(option(i, a.uprn, a.label, a.line1, a.town, false)); });
      list.appendChild(option(i, 'none', 'My address is not in the list — I will type it below', null, null, false));
      fs.appendChild(narrowBox(list));
      fs.appendChild(list);
      var tip = document.createElement('p');
      tip.className = 'help';
      tip.textContent = 'Picked yours? You do not need to type it below.';
      fs.appendChild(tip);
      box.appendChild(fs);
      onPick(list);
    }

    // A list the server already drew gets the narrowing box and the fill-in too.
    var drawn = box.querySelector('.f4-address-list');
    if (drawn) { drawn.parentNode.insertBefore(narrowBox(drawn), drawn); onPick(drawn); }

    function search() {
      var pc = norm(postcode.value);
      if (!FULL.test(pc) || pc === last) return;
      last = pc;
      status.textContent = 'Looking up addresses…';
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(status);
      var body = new root.URLSearchParams();
      body.set('building', i);
      body.set('postcode', pc);
      root.fetch('/assessment/details/addresses', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString(),
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (norm(postcode.value) !== pc) return;
        if (!j) { draw([], 'We could not look up addresses just now. Please type your address below.'); return; }
        draw(Array.isArray(j.addresses) ? j.addresses : [], j.why || null);
      }).catch(function () {
        draw([], 'We could not look up addresses just now. Please type your address below.');
      });
    }
    postcode.addEventListener('input', search);
    postcode.addEventListener('change', search);
  }

  var boxes = document.querySelectorAll('.f4-addr[data-building]');
  for (var k = 0; k < boxes.length; k++) wire(boxes[k]);
})();
`;
