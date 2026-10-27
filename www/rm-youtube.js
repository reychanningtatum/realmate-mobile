/* rm-youtube.js — the ONE place a YouTube link is read (window.RMYouTube).
 * Used by the Home video (home-dashboard.js) and Admin › Home Video
 * (home-video-admin.js). Only real YouTube hosts are accepted and the video id
 * must be YouTube's 11-character id, so nothing else can reach an <iframe src>.
 */
(function (g) {
  'use strict';
  var ID = /^[A-Za-z0-9_-]{11}$/;
  var HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;

  // "https://www.youtube.com/watch?v=ID", "youtu.be/ID", "/live/ID", "/shorts/ID",
  // "/embed/ID" → "ID"; anything else → null.
  function videoId(url) {
    var u;
    try { u = new URL(String(url || '').trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    var id = null, host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') id = parts[0];
    else if (HOSTS.test(host)) {
      if (parts[0] === 'watch') id = u.searchParams.get('v');
      else if (['live', 'shorts', 'embed', 'v'].indexOf(parts[0]) !== -1) id = parts[1];
    }
    return id && ID.test(id) ? id : null;
  }

  function embedUrl(url) {
    var id = videoId(url);
    return id ? 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&modestbranding=1' : null;
  }

  // The Home video player page (home-video-player.html) on a real website origin:
  // autoplay + loop, sound where allowed. origin = "https://staging.realmate.ph" etc.
  function playerUrl(url, origin) {
    var id = videoId(url);
    if (!id || !/^https?:\/\/[^/?#]+$/i.test(String(origin || ''))) return null;
    return origin + '/home-video-player.html?v=' + id;
  }

  g.RMYouTube = { videoId: videoId, embedUrl: embedUrl, playerUrl: playerUrl };
})(typeof window !== 'undefined' ? window : this);
