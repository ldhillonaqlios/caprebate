/**
 * THE SIGNING PAD'S ONE SCRIPT — served at /assets/signature-pad.js, and named only by the engagement letter page while
 * the letter can be signed (src/web/router.ts, letterPage). PHASE 157c, 6 October 2026.
 *
 * Lakhbir: "cant it be a docusign style document which captures a signed digital copy?" The client draws their
 * signature in a box with a finger, a pen or a mouse. The strokes go back with the form as numbers from 0 to 1000
 * across and down the box (signature_strokes), and the signed PDF draws them as lines (src/web/pdf.ts, Ink). Nothing
 * is sent anywhere else, and nothing is kept in the browser.
 *
 * IF IT CANNOT RUN (no script, an old browser), the box says so and the client can still sign with their typed name,
 * by ticking "Use my typed name as my signature" (src/web/signing.ts accepts one or the other, never neither). It sets
 * no style and no HTML from anything typed: it only draws on its own canvas and fills its own hidden field.
 */
export const SIGNATURE_PAD_JS = `(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var pad = document.querySelector('[data-sig-pad]');
  if (!pad) return;
  var canvas = pad.querySelector('canvas');
  var field = document.querySelector('input[name="signature_strokes"]');
  var clear = pad.querySelector('button[data-sig-clear]');
  var note = pad.querySelector('[data-sig-note]');
  if (!canvas || !field || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var strokes = [], current = null, total = 0;
  var MAX_POINTS = 3000, MAX_STROKES = 60;
  pad.hidden = false;
  if (note) note.textContent = 'Draw your signature in the box.';

  function point(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.round(((e.clientX - r.left) / r.width) * 1000);
    var y = Math.round(((e.clientY - r.top) / r.height) * 1000);
    return [Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))];
  }
  function save() { field.value = strokes.length === 0 ? '' : JSON.stringify(strokes); }
  function draw(a, b) {
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo((a[0] / 1000) * canvas.width, (a[1] / 1000) * canvas.height);
    ctx.lineTo((b[0] / 1000) * canvas.width, (b[1] / 1000) * canvas.height);
    ctx.stroke();
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (strokes.length >= MAX_STROKES || total >= MAX_POINTS) return;
    e.preventDefault();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    current = [point(e)]; strokes.push(current); total++;
    draw(current[0], current[0]);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!current || total >= MAX_POINTS) return;
    e.preventDefault();
    var p = point(e), last = current[current.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 4) return;
    draw(last, p); current.push(p); total++;
  });
  function end() { if (current) { current = null; save(); } }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
  if (clear) clear.addEventListener('click', function () {
    strokes = []; current = null; total = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    save();
  });
})();
`;
