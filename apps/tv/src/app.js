import { createMovieIntro } from './movie-intro.js';
var movieIntro = null;
import { TvApi } from './api.js';
import { escapeHtml as h, mediaUrl, nextFocus, remoteAction, progressBody, timeLabel } from './core.js';

var config = window.CT_TV_CONFIG;
var storage;
try { storage = window.localStorage; } catch (_) { storage = null; }
var api = new TvApi(config.apiBaseUrl, storage);
var root = document.getElementById('app');
var view = document.getElementById('view');
var nav = document.getElementById('navigation');
var playerRoot = document.getElementById('player');
var toastTimer;
var user = null;
var route = { page: 'home' };
var history = [];
var epoch = 0;
var detail = null;
var player = null;
var acting = false;

function button(label, action, value, extra) {
  return '<button data-action="' + h(action) + '" data-value="' + h(value || '') + '" ' + (extra || '') + '>' + h(label) + '</button>';
}
function toast(message) {
  var el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 6000);
}
function focusFirst() {
  var el = view.querySelector('[autofocus], button:not([disabled]), input') || nav.querySelector('button');
  if (el) el.focus();
}
function header() {
  var tabs = [['home', 'Home'], ['search', 'Search'], ['premieres', 'Premieres'], ['tickets', 'My tickets'], ['list', 'My list']];
  nav.innerHTML = tabs.map(function (tab) {
    return button(tab[1], 'nav', tab[0], route.page === tab[0] ? 'aria-current="page"' : '');
  }).join('') + button(user ? user.displayName || 'Account' : 'Sign in', 'nav', 'account', 'class="account"');
  document.getElementById('platform').textContent = config.platform === 'webos' ? 'LG webOS' : 'Hisense VIDAA';
}
function art(url, className) {
  var safe = mediaUrl(url, config.apiBaseUrl);
  return safe ? '<img class="' + className + '" src="' + h(safe) + '" alt="">' : '';
}
function card(item, index) {
  return '<button class="poster tone-' + (index % 4) + '" data-action="title" data-value="' + h(item.id || item.titleId) + '">' +
    '<span class="poster-art">' + art(item.posterUrl, '') + '<span class="poster-fallback">' + h(item.title) + '</span></span>' +
    '<span class="poster-name">' + h(item.title) + '</span><span class="muted">' + h(item.year || '') +
    (item.type ? ' · ' + h(item.type === 'series' ? 'Series' : 'Film') : '') + '</span></button>';
}
function rail(title, items) {
  return '<section class="rail"><h2>' + h(title) + '</h2><div class="rail-items">' + items.map(card).join('') + '</div></section>';
}
function grid(title, items, empty) {
  return '<section class="page"><p class="eyebrow">YOUR CINEMA, AT HOME</p><h1>' + h(title) + '</h1>' +
    (items.length ? '<div class="grid">' + items.map(card).join('') + '</div>' : '<p class="empty">' + h(empty || 'No titles here yet.') + '</p>') + '</section>';
}
function errorView(error) {
  view.innerHTML = '<section class="page message"><p class="eyebrow">LET’S TRY THAT AGAIN</p><h1>' +
    (error.status === 401 ? 'Sign in to continue' : 'Couldn’t load this screen') + '</h1><p>' + h(error.message) + '</p>' +
    button('Try again', 'retry') + button('Home', 'nav', 'home') +
    (error.status === 401 ? button('Sign in', 'nav', 'account') : '') + '</section>';
  focusFirst();
}
function loginScreen() {
  return '<section class="login page"><div><p class="eyebrow">WELCOME TO CINNETEMPLE</p><h1>A bigger screen.<br>The same great stories.</h1>' +
    '<p>Sign in with your CinneTemple account to watch your tickets and saved films.</p>' +
    '<p class="muted">Create an account or reset your password on<br><strong>cinnetemple.com</strong></p></div>' +
    '<form id="login-form" class="panel"><h2>Sign in on your TV</h2><label>Email<input id="email" type="email" autocomplete="username" required autofocus></label>' +
    '<label>Password<input id="password" type="password" autocomplete="current-password" required></label>' +
    '<p id="login-error" class="form-error" role="alert"></p><button type="submit" class="primary">Sign in</button>' +
    '<p class="muted small">Use OK to open your TV keyboard.</p></form></section>';
}

async function render() {
  var ticket = ++epoch;
  detail = null;
  header();
  view.innerHTML = '<div class="loading" role="status">Loading your cinema…</div>';
  view.scrollTop = 0;
  try {
    var html = '';
    var data;
    if (route.page === 'account') {
      html = user ? '<section class="page message"><p class="eyebrow">YOUR ACCOUNT</p><h1>' + h(user.displayName || 'Welcome back') +
        '</h1><p>' + h(user.email) + '</p>' + button('My tickets', 'nav', 'tickets', 'class="primary"') + button('Sign out', 'logout') +
        '<p class="muted">CinneTemple TV · ' + h(config.platform) + ' · ' + h(config.version) + '</p></section>' : loginScreen();
    } else if (route.page === 'home') {
      data = await api.request('/v1/catalogue/browse');
      if (ticket !== epoch) return;
      if (data.hero) {
        var hero = data.hero;
        html = '<section class="hero">' + art(hero.heroUrl || hero.posterUrl, 'hero-art') +
          '<div class="hero-shade"></div><div class="hero-copy"><p class="eyebrow">THE CINNETEMPLE SPOTLIGHT</p><h1>' + h(hero.title) + '</h1>' +
          '<p class="meta">' + h(hero.year) + ' · ' + h((hero.genres || []).join(' / ')) + '</p><p class="overview">' + h(hero.overview || hero.tagline || '') + '</p>' +
          button('Explore film', 'title', hero.id, 'class="primary"') + '<span class="hero-note">Pay once. Watch once. Make it a movie night.</span></div></section>';
      }
      if (user) {
        try {
          var progress = await api.request('/v1/playback/continue', { auth: true });
          if (progress.length) html += rail('Continue watching', progress);
        } catch (_) { /* Public catalogue remains useful while account requests fail. */ }
      }
      html += (data.rows || []).map(function (row) { return rail(row.title, row.items); }).join('');
      if (!html) html = grid('Your next story starts here', [], 'New films are coming soon.');
    } else if (route.page === 'search') {
      var query = route.query || '';
      data = query ? await api.request('/v1/catalogue/search?q=' + encodeURIComponent(query)) : { results: [] };
      html = '<section class="page"><p class="eyebrow">FIND YOUR NEXT FILM</p><h1>Search</h1><form id="search-form" class="search-form">' +
        '<input id="query" type="search" value="' + h(query) + '" placeholder="Search films, series and stories" aria-label="Search catalogue" autofocus>' +
        '<button type="submit" class="primary">Search</button></form><div class="grid">' + data.results.map(card).join('') + '</div>' +
        (query && !data.results.length ? '<p class="empty">No results for “' + h(query) + '”. Try another title.</p>' : '') + '</section>';
    } else if (route.page === 'premieres') {
      data = await api.request('/v1/premieres');
      html = grid('Premieres', data, 'The next premiere will appear here.');
    } else if (route.page === 'tickets' || route.page === 'list') {
      if (!user) html = loginScreen();
      else {
        data = await api.request(route.page === 'tickets' ? '/v1/entitlements' : '/v1/watchlist', { auth: true });
        var items = data.filter(function (entry) { return entry.title && (route.page !== 'tickets' || entry.status === 'ACTIVE'); }).map(function (entry) { return entry.title; });
        html = grid(route.page === 'tickets' ? 'My tickets' : 'My list', items,
          route.page === 'tickets' ? 'Buy a ticket on cinnetemple.com, then refresh here to watch.' : 'Save a film from its detail screen to find it here.');
        html += '<div class="page-actions">' + button('Refresh', 'retry') + '</div>';
      }
    } else if (route.page === 'title') {
      var titleId = encodeURIComponent(route.id);
      data = await api.request('/v1/catalogue/titles/' + titleId, { auth: !!user });
      var status = null;
      var saved = false;
      if (user) {
        status = await api.request('/v1/playback/' + titleId + '/status', { auth: true });
        var list = await api.request('/v1/watchlist', { auth: true });
        saved = list.some(function (entry) { return entry.titleId === route.id; });
      }
      if (ticket !== epoch) return;
      detail = { title: data, status: status, saved: saved };
      html = titleScreen(detail);
    }
    if (ticket !== epoch) return;
    view.innerHTML = html;
    focusFirst();
    if (route.focus) {
      var targets = view.querySelectorAll('[data-value]');
      for (var i = 0; i < targets.length; i++) if (targets[i].getAttribute('data-value') === route.focus) { targets[i].focus(); break; }
    }
  } catch (error) {
    if (movieIntro) { movieIntro.cancel(); movieIntro = null; } if (ticket === epoch) errorView(error); }
}

function titleScreen(info) {
  var title = info.title;
  var status = info.status;
  var canWatch = status && status.hasAccess && (!status.premiere || status.premiereLive);
  var actions = '';
  if (!user) actions += button('Sign in to watch', 'nav', 'account', 'class="primary"');
  else if (canWatch && title.type !== 'series') actions += button(status.started ? 'Resume film' : 'Watch now', 'watch', '', 'class="primary"');
  else if (status && status.premiere && !status.premiereLive) {
    actions += '<p class="notice">Premiere opens ' + h(title.premiereStartAt ? new Date(title.premiereStartAt).toLocaleString() : 'soon') + '.</p>';
  } else if (!canWatch && title.priceMinor === 0) actions += button('Get free ticket', 'free', '', 'class="primary"');
  else if (!canWatch) actions += button('Get a ticket', 'purchase', '', 'class="primary"');
  if (title.hasTrailer) actions += button('Watch trailer', 'trailer');
  if (user) actions += button(info.saved ? 'Remove from my list' : '+ My list', 'save');
  actions += button('Refresh ticket', 'retry');
  var html = '<section class="detail">' + art(title.heroUrl || title.posterUrl, 'detail-art') +
    '<div class="detail-shade"></div><div class="detail-copy"><p class="eyebrow">' + h(title.type === 'series' ? 'CINNETEMPLE SERIES' : 'CINNETEMPLE CINEMA') +
    '</p><h1>' + h(title.title) + '</h1><p class="meta">' + h(title.year) + ' · ' + h((title.genres || []).join(' / ')) +
    (title.runtimeMinutes ? ' · ' + h(title.runtimeMinutes) + ' min' : '') + '</p><p class="overview">' + h(title.overview) + '</p><div class="actions">' + actions + '</div></div></section>';
  if (title.type === 'series') {
    html += '<section class="episodes page"><h2>Episodes</h2>';
    (title.seasonsList || []).forEach(function (season) {
      html += '<h3>Season ' + h(season.number) + (season.name ? ' · ' + h(season.name) : '') + '</h3>';
      season.episodes.forEach(function (episode) {
        var disabled = episode.consumed || !episode.hasVideo || !canWatch;
        html += button(episode.number + '. ' + episode.name + (episode.consumed ? ' · Watched' : !episode.hasVideo ? ' · Coming soon' : ''),
          'episode', episode.id, 'class="episode"' + (disabled ? ' disabled' : ''));
      });
    });
    html += '</section>';
  }
  return html;
}

function navigate(next, replace) {
  stopPlayback();
  if (!replace) {
    route.focus = document.activeElement && document.activeElement.getAttribute('data-value');
    history.push(route);
  }
  route = next;
  render();
}
function back() {
  if (player) { stopPlayback(); render(); return; }
  if (document.getElementById('dialog').hidden === false) { closeDialog(); return; }
  if (history.length) { route = history.pop(); render(); }
  else showDialog('Leave CinneTemple?', '<p>Your next movie night is a remote click away.</p>' + button('Keep browsing', 'close-dialog', '', 'class="primary"') + button('Exit app', 'exit'));
}
var dialogFocus;
function showDialog(title, content) {
  dialogFocus = document.activeElement;
  var dialog = document.getElementById('dialog');
  dialog.innerHTML = '<div class="dialog-panel"><h2 id="dialog-title">' + h(title) + '</h2>' + content + '</div>';
  dialog.hidden = false;
  dialog.querySelector('button').focus();
}
function closeDialog() {
  document.getElementById('dialog').hidden = true;
  if (dialogFocus && document.contains(dialogFocus)) dialogFocus.focus();
}

async function startPlayback(episodeId, trailer) {
  if (!detail) return;
  if (movieIntro) movieIntro.cancel();
  var intro = trailer ? null : createMovieIntro();
  movieIntro = intro;
  var info = detail;
  var ticket = epoch;
  var id = encodeURIComponent(info.title.id);
  var resume = 0;
  var session;
  if (trailer) session = await api.request('/v1/catalogue/titles/' + id + '/trailer');
  else {
    if (!episodeId) {
      var progress = await api.request('/v1/playback/continue', { auth: true });
      progress.forEach(function (p) { if (p.titleId === info.title.id) resume = p.positionSeconds; });
    }
    if (ticket !== epoch || (intro && intro.cancelled)) { if (intro) intro.cancel(); return; }
    session = await api.request('/v1/playback/' + id + '/start', {
      auth: true, method: 'POST', body: episodeId ? { episodeId: episodeId } : {}
    });
  }
  if (ticket !== epoch || (intro && intro.cancelled)) { if (intro) intro.cancel(); return; }
  var url = mediaUrl(session.url, config.apiBaseUrl);
  if (!url) throw new Error('This video is unavailable. Please try again later.');
  playerRoot.innerHTML = '<video id="video" playsinline preload="metadata"></video>' +
    '<div class="watermark">' + h(session.watermark || '') + '</div><div class="playback-top"><span>' + h(session.episodeName || session.title || info.title.title) +
    (trailer ? ' · Trailer' : '') + '</span>' + button('Back to film', 'stop') + '</div>' +
    '<div id="playback-message" role="status"></div><div class="transport"><div class="progress-track"><div id="progress-fill"></div></div>' +
    '<div class="transport-buttons">' + button('−15 sec', 'rewind') + button('Pause', 'toggle', '', 'id="play-toggle"') + button('+15 sec', 'forward') +
    '<span id="time">0:00 / 0:00</span><span class="muted">Back to close · OK to select</span></div></div>';
  playerRoot.hidden = false;
  root.hidden = true;
  var video = document.getElementById('video');
  var state = { video: video, session: session, episodeId: episodeId, titleId: info.title.id, trailer: trailer,
    introActive: !!intro, pendingAutoplay: true, started: false, resume: resume, progressQueue: Promise.resolve(), expired: false, closed: false, timer: null, hideTimer: null, lastSave: 0 };
  player = state;
  video.onloadedmetadata = function () {
    if (resume > 0 && isFinite(video.duration)) video.currentTime = Math.min(resume, video.duration * 0.94);
  };
  video.onplaying = function () { state.started = true; playerMessage(''); document.getElementById('play-toggle').textContent = 'Pause'; showControls(); };
  video.onpause = function () {
    if (state.closed) return;
    saveProgress(state);
    document.getElementById('play-toggle').textContent = 'Play';
    showControls();
  };
  video.onended = function () {
    saveProgress(state, true);
    if (!state.trailer) state.expired = true;
    showControls();
    playerMessage('Finished. Press Back to return to the film.');
  };
  video.onwaiting = function () { playerMessage('Buffering…'); };
  video.onerror = function () { playerMessage('This video could not play. Check your connection or return to the film and try again.'); };
  video.ontimeupdate = function () {
    var duration = isFinite(video.duration) ? video.duration : session.durationSeconds || 0;
    document.getElementById('time').textContent = timeLabel(video.currentTime) + ' / ' + timeLabel(duration);
    document.getElementById('progress-fill').style.width = (duration ? Math.min(100, video.currentTime / duration * 100) : 0) + '%';
  };
  state.timer = setInterval(function () {
    if (session.expiresAt && Date.now() >= Date.parse(session.expiresAt)) {
      state.expired = true;
      video.pause();
      playerMessage('Your viewing window has ended. Press Back to return.');
    }
    if (!video.paused && Date.now() - state.lastSave >= 10000) { state.lastSave = Date.now(); saveProgress(state); }
  }, 1000);
  video.preload = 'auto';
  video.src = url;
  video.load();
  if (intro) await intro.promise;
  if (state.closed || (intro && intro.cancelled)) return;
  state.introActive = false;
  if (movieIntro === intro) movieIntro = null;
  document.getElementById('play-toggle').focus();
  if (!document.hidden) playVideo();
}
function playerMessage(text) {
  var el = document.getElementById('playback-message');
  if (el) { el.textContent = text; el.hidden = !text; }
}
function showControls() {
  if (!player) return;
  playerRoot.classList.remove('controls-hidden');
  clearTimeout(player.hideTimer);
  if (!player.video.paused && !player.expired) {
    player.hideTimer = setTimeout(function () { if (player) playerRoot.classList.add('controls-hidden'); }, 4500);
  }
}
function playVideo() {
  if (!player || player.expired || document.hidden) return;
  if (player.introActive) { if (movieIntro) movieIntro.finish(); return; }
  player.pendingAutoplay = false;
  var state = player;
  var result = player.video.play();
  if (result && result.catch) result.catch(function (error) {
    if (player !== state) return;
    playerMessage(error.name === 'NotAllowedError' ? 'Select Play to start the video.' :
      'This video could not play. Check your connection or return to the film and try again.');
  });
}
function saveProgress(state, ended) {
  if (!state.started || state.trailer) return;
  var duration = isFinite(state.video.duration) ? state.video.duration : state.session.durationSeconds;
  var body = progressBody(ended ? duration : state.video.currentTime, duration, state.episodeId);
  if (!body) return;
  // Preserve order so a slower old heartbeat cannot overwrite the final position.
  state.progressQueue = state.progressQueue.catch(function () {}).then(function () {
    return api.request('/v1/playback/' + encodeURIComponent(state.titleId) + '/progress', { auth: true, method: 'PUT', body: body });
  }).catch(function () { if (!state.closed) toast('Watch progress could not sync. Check your connection.'); });
}
function stopPlayback() {
  if (movieIntro) { movieIntro.cancel(); movieIntro = null; }
  if (!player) return;
  var old = player;
  saveProgress(old);
  old.closed = true;
  clearInterval(old.timer);
  clearTimeout(old.hideTimer);
  playerRoot.classList.remove('controls-hidden');
  old.video.onloadedmetadata = old.video.onplaying = old.video.onpause = old.video.onended =
    old.video.onwaiting = old.video.onerror = old.video.ontimeupdate = null;
  old.video.pause();
  old.video.removeAttribute('src');
  old.video.load();
  player = null;
  playerRoot.hidden = true;
  playerRoot.innerHTML = '';
  root.hidden = false;
}
function seek(delta) {
  if (!player || player.introActive || player.expired || !isFinite(player.video.duration)) return;
  player.video.currentTime = Math.max(0, Math.min(player.video.duration, player.video.currentTime + delta));
}

async function action(name, value) {
  if (name === 'nav') { closeDialog(); navigate({ page: value }); return; }
  if (name === 'title') { navigate({ page: 'title', id: value }); return; }
  if (name === 'retry') { render(); return; }
  if (name === 'close-dialog') { closeDialog(); return; }
  if (name === 'exit') { window.close(); closeDialog(); return; }
  if (name === 'stop') { stopPlayback(); render(); return; }
  if (name === 'toggle' && player) { if (player.video.paused) playVideo(); else player.video.pause(); return; }
  if (name === 'rewind' || name === 'forward') { seek(name === 'rewind' ? -15 : 15); return; }
  if (acting) return;
  acting = true;
  var ticket = epoch;
  try {
    if (name === 'logout') { user = null; header(); await api.logout(); navigate({ page: 'home' }, true); history = []; }
    else if (name === 'watch' || name === 'episode' || name === 'trailer') await startPlayback(name === 'episode' ? value : null, name === 'trailer');
    else if (name === 'purchase' && detail) {
      showDialog('Your ticket, your movie night', '<p>On your phone or computer, open:</p><p class="purchase-url">' + h(config.websiteUrl + '/title?id=' + detail.title.id) +
        '</p><p>Sign in to the same account and buy a ticket. Then refresh your ticket here.</p>' + button('I have my ticket', 'close-refresh', '', 'class="primary"') + button('Back', 'close-dialog'));
    } else if (name === 'close-refresh') { closeDialog(); await render(); }
    else if (name === 'save' && detail) {
      await api.request('/v1/watchlist' + (detail.saved ? '/' + encodeURIComponent(detail.title.id) : ''), {
        auth: true, method: detail.saved ? 'DELETE' : 'POST', body: detail.saved ? undefined : { titleId: detail.title.id }
      });
      if (ticket === epoch) await render();
    } else if (name === 'free' && detail) {
      var purchase = await api.request('/v1/purchases', { auth: true, method: 'POST', body: { titleId: detail.title.id } });
      if (purchase.status !== 'paid' && purchase.status !== 'already_entitled') throw new Error('This title requires checkout. Please complete your purchase on cinnetemple.com.');
      if (ticket === epoch) await render();
    }
  } catch (error) {
    if (movieIntro) { movieIntro.cancel(); movieIntro = null; } toast(error.message); }
  finally { acting = false; }
}

document.addEventListener('click', function (event) {
  if (player) showControls();
  var target = event.target.closest('[data-action]');
  if (target && !target.disabled) action(target.getAttribute('data-action'), target.getAttribute('data-value'));
});
document.addEventListener('submit', async function (event) {
  event.preventDefault();
  if (event.target.id === 'search-form') { navigate({ page: 'search', query: document.getElementById('query').value.trim() }, true); return; }
  if (event.target.id !== 'login-form' || acting) return;
  acting = true;
  var form = event.target;
  var submit = form.querySelector('button');
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  var ticket = epoch;
  try {
    var signedIn = await api.login(document.getElementById('email').value.trim(), document.getElementById('password').value);
    user = signedIn;
    if (ticket === epoch) navigate({ page: route.page === 'tickets' || route.page === 'list' ? route.page : 'home' }, true);
    else header();
  } catch (error) {
    if (movieIntro) { movieIntro.cancel(); movieIntro = null; }
    if (ticket === epoch) form.querySelector('#login-error').textContent = error.message;
  } finally {
    acting = false;
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});
document.addEventListener('keydown', function (event) {
  var active = document.activeElement;
  var input = active && active.tagName === 'INPUT';
  var key = remoteAction(event);
  if (document.querySelector('.movie-intro')) {
    if (key === 'back' || key === 'stop') { event.preventDefault(); stopPlayback(); return; }
    if (key === 'enter' || key === 'play' || key === 'toggle') { event.preventDefault(); if (movieIntro) movieIntro.finish(); return; }
    if (['left', 'right', 'up', 'down'].indexOf(key) >= 0 || event.key === 'Tab') { event.preventDefault(); return; }
  }
  if (player && key !== 'back') {
    var wasHidden = playerRoot.classList.contains('controls-hidden');
    showControls();
    if (wasHidden && ['left', 'right', 'up', 'down', 'enter'].indexOf(key) >= 0) { event.preventDefault(); return; }
  }
  if (event.key === 'Tab' && (player || !document.getElementById('dialog').hidden)) {
    var trap = !document.getElementById('dialog').hidden ? document.getElementById('dialog') : playerRoot;
    var controls = trap.querySelectorAll('button:not([disabled]), input');
    if (controls.length && (event.shiftKey ? active === controls[0] : active === controls[controls.length - 1])) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0].focus();
    }
    return;
  }
  // Let the TV keyboard handle text, cursor movement and Backspace while editing.
  if (input && (event.keyCode === 8 || key === 'left' || key === 'right' || key === 'enter')) return;
  if (key === 'back') { event.preventDefault(); if (input) { active.blur(); nav.querySelector('button').focus(); } else back(); return; }
  if (player && ['play', 'pause', 'toggle', 'stop', 'forward', 'rewind'].indexOf(key) >= 0) {
    event.preventDefault();
    if (key === 'play') playVideo();
    else if (key === 'pause') player.video.pause();
    else action(key);
    return;
  }
  if (['left', 'right', 'up', 'down'].indexOf(key) < 0) return;
  event.preventDefault();
  var dialog = document.getElementById('dialog');
  var scope = !dialog.hidden ? dialog : player ? playerRoot : root;
  var elements = Array.prototype.slice.call(scope.querySelectorAll('button:not([disabled]), input'));
  elements = elements.filter(function (el) { return el.offsetWidth > 0 && el.offsetHeight > 0; });
  if (!elements.length) return;
  if (elements.indexOf(active) < 0) { elements[0].focus(); return; }
  var index = nextFocus(active.getBoundingClientRect(), elements.filter(function (el) { return el !== active; }).map(function (el) {
    return { id: elements.indexOf(el), rect: el.getBoundingClientRect() };
  }), key);
  if (index !== null) elements[index].focus();
});
document.addEventListener('focusin', function (event) {
  if (event.target.scrollIntoView) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
document.addEventListener('error', function (event) {
  if (event.target.tagName === 'IMG') event.target.style.display = 'none';
}, true);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    if (movieIntro) movieIntro.finish();
    if (player) player.video.pause();
  } else if (player && player.pendingAutoplay && !player.introActive) playVideo();
});
window.addEventListener('pagehide', function () { stopPlayback(); });
function resize() {
  var stage = document.getElementById('stage');
  var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = 'scale(' + scale + ')';
  stage.style.left = (window.innerWidth - 1920 * scale) / 2 + 'px';
  stage.style.top = (window.innerHeight - 1080 * scale) / 2 + 'px';
}
window.addEventListener('resize', resize);
resize();
header();
api.onSessionLost = function () { user = null; header(); };
(async function () {
  if (api.refreshToken) {
    try { user = await api.request('/v1/auth/me', { auth: true }); }
    catch (error) { toast(error.status === 401 ? 'Please sign in again.' : 'Couldn’t restore your session. Sign in to retry.'); }
  }
  render();
})();
