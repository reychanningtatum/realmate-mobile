/* home-video-settings.js — Settings › Home Video › "Autoplay Home video" + "Auto-mute Home video"
 * (DRAFT Home dashboard, STAGING ONLY). Stored on this device by RMYouTube
 * (rm-youtube.js); Home reads them each time it shows the video.
 */
(function () {
  'use strict';
  if (!window.RM_ENV || window.RM_ENV.name !== 'staging' || !window.RMYouTube) return;
  var Y = window.RMYouTube;

  function toast(msg, id) {
    if (typeof showSettingsNotificationToast === 'function') showSettingsNotificationToast(msg, 'success', id);
  }
  window.saveHomeVideoAutoplayPref = function (isOn) {
    Y.setAutoPlay(isOn);
    toast(isOn ? 'Home video will play on its own.' : 'Home video will wait until you tap play.', 'toggleHomeVideoAutoplay');
  };

  window.saveHomeVideoMutePref = function (isOn) {
    Y.setAutoMute(isOn);
    toast(isOn ? 'Home video will play muted.' : 'Home video will play with sound.', 'toggleHomeVideoMute');
  };

  function init() {
    var card = document.getElementById('homeVideoCard'), t = document.getElementById('toggleHomeVideoMute'),
        ap = document.getElementById('toggleHomeVideoAutoplay');
    if (!card || !t || !ap) return;
    ap.checked = Y.autoPlay();
    t.checked = Y.autoMute();
    card.style.display = '';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
