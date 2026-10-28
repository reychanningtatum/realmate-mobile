/* home-video-settings.js — Settings › Home Video › "Auto-mute Home video"
 * (DRAFT Home dashboard, STAGING ONLY). Stored on this device by RMYouTube
 * (rm-youtube.js); Home reads it each time the video starts playing.
 */
(function () {
  'use strict';
  if (!window.RM_ENV || window.RM_ENV.name !== 'staging' || !window.RMYouTube) return;
  var Y = window.RMYouTube;

  window.saveHomeVideoMutePref = function (isOn) {
    Y.setAutoMute(isOn);
    var msg = isOn ? 'Home video will play muted.' : 'Home video will play with sound.';
    if (typeof showSettingsNotificationToast === 'function') showSettingsNotificationToast(msg, 'success', 'toggleHomeVideoMute');
  };

  function init() {
    var card = document.getElementById('homeVideoCard'), t = document.getElementById('toggleHomeVideoMute');
    if (!card || !t) return;
    t.checked = Y.autoMute();
    card.style.display = '';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
