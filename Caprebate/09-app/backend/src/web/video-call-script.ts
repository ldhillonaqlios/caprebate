/**
 * THE JOIN PAGES' ONE SCRIPT — /assets/video-call.js. 30 September 2026 (src/web/video-calls.ts).
 *
 * Served from this site, never inline. It reads the meeting's values from the data attributes the server put on
 * #vc-root (the meeting number, the passcode, the join signature signed on the server, the name, and for staff the
 * host's start token), and only when the person presses the button does it start Zoom's component view there — so
 * nobody is asked for their camera just for opening the page. Anything that goes wrong is said in words, with the Zoom
 * app's link as the way round it.
 */
export const VIDEO_CALL_JS = `(function () {
  'use strict';
  var root = document.getElementById('vc-root');
  var btn = document.getElementById('vc-join');
  var status = document.getElementById('vc-status');
  if (!root || !btn) return;
  function say(t) { if (status) status.textContent = t; }
  btn.addEventListener('click', function () {
    if (typeof window.ZoomMtgEmbedded === 'undefined') {
      say('The video call could not load in this browser. Use the Zoom app link below instead.');
      return;
    }
    btn.disabled = true;
    say('Connecting…');
    var d = root.dataset;
    var width = Math.max(320, Math.min(1000, root.clientWidth || 1000));
    var client = window.ZoomMtgEmbedded.createClient();
    client.init({
      zoomAppRoot: root, language: 'en-US', patchJsMedia: true, leaveOnPageUnload: true,
      customize: { video: { isResizable: true, viewSizes: { default: { width: width, height: Math.round(width * 9 / 16) } } } }
    }).then(function () {
      var args = { signature: d.signature, meetingNumber: d.meeting, password: d.passcode || '', userName: d.name };
      if (d.zak) args.zak = d.zak;
      return client.join(args);
    }).then(function () {
      btn.hidden = true;
      say(d.role === 'host'
        ? 'You are the host. Let the client in from the waiting room when they arrive.'
        : 'You are connected. If you are in the waiting room, we will let you in shortly.');
    }).catch(function (e) {
      btn.disabled = false;
      var why = e && (e.reason || e.message) ? ' (' + String(e.reason || e.message).slice(0, 120) + ')' : '';
      say('The call could not start here' + why + '. Press the button to try again, or use the Zoom app link below.');
    });
  });
})();
`;
