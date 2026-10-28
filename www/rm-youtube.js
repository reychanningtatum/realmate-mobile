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

  // Ask YouTube (public oEmbed) whether the video exists and its owner allows
  // embedding, and who made it — for crediting the creator. Resolves to
  //   { ok:true, title, channel, channelUrl, watchUrl }
  //   { ok:false, reason:'invalid'|'not_embeddable'|'not_found'|'unavailable' }
  function info(url, fetchFn) {
    var id = videoId(url), f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!id) return Promise.resolve({ ok: false, reason: 'invalid' });
    if (!f) return Promise.resolve({ ok: false, reason: 'unavailable' });
    var watchUrl = 'https://www.youtube.com/watch?v=' + id;
    return f('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(watchUrl)).then(function (r) {
      if (r.status === 401 || r.status === 403) return { ok: false, reason: 'not_embeddable' };
      if (r.status === 404 || r.status === 400) return { ok: false, reason: 'not_found' };
      if (!r.ok) return { ok: false, reason: 'unavailable' };
      return r.json().then(function (d) {
        var cu = String((d && d.author_url) || '');
        return {
          ok: true, watchUrl: watchUrl,
          title: String((d && d.title) || ''),
          channel: String((d && d.author_name) || ''),
          channelUrl: /^https:\/\/www\.youtube\.com\//.test(cu) ? cu : ''
        };
      });
    }, function () { return { ok: false, reason: 'unavailable' }; });
  }

  // Settings › Home Video › "Auto-mute Home video" (this device). Default ON.
  var AUTOMUTE_KEY = 'rm_home_video_automute';
  function autoMute() {
    try { return localStorage.getItem(AUTOMUTE_KEY) !== '0'; } catch (e) { return true; }
  }
  function setAutoMute(on) {
    try { localStorage.setItem(AUTOMUTE_KEY, on ? '1' : '0'); } catch (e) {}
  }

  g.RMYouTube = { videoId: videoId, embedUrl: embedUrl, playerUrl: playerUrl, info: info,
    autoMute: autoMute, setAutoMute: setAutoMute };
})(typeof window !== 'undefined' ? window : this);
