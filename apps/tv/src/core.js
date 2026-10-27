export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

export function mediaUrl(value, base) {
  if (!value) return '';
  try {
    var url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (_) { return ''; }
}

// Orthogonal overlap gets priority so moving down stays in the same column.
export function nextFocus(current, candidates, direction) {
  var horizontal = direction === 'left' || direction === 'right';
  var sign = direction === 'left' || direction === 'up' ? -1 : 1;
  var cx = (current.left + current.right) / 2;
  var cy = (current.top + current.bottom) / 2;
  var best = null;
  var score = Infinity;
  candidates.forEach(function (candidate) {
    var r = candidate.rect;
    var dx = (r.left + r.right) / 2 - cx;
    var dy = (r.top + r.bottom) / 2 - cy;
    var primary = (horizontal ? dx : dy) * sign;
    if (primary <= 1) return;
    var cross = Math.abs(horizontal ? dy : dx);
    var overlap = horizontal
      ? r.bottom > current.top && r.top < current.bottom
      : r.right > current.left && r.left < current.right;
    var value = primary + cross * 2 + (overlap ? 0 : 10000);
    if (value < score) { score = value; best = candidate.id; }
  });
  return best;
}

export function progressBody(position, duration, episodeId) {
  if (!isFinite(position) || !isFinite(duration) || duration < 1) return null;
  var body = {
    positionSeconds: Math.max(0, Math.min(Math.floor(position), Math.floor(duration))),
    durationSeconds: Math.floor(duration)
  };
  if (episodeId) body.episodeId = episodeId;
  return body;
}

export function timeLabel(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  var n = Math.floor(seconds);
  return Math.floor(n / 60) + ':' + ('0' + (n % 60)).slice(-2);
}

export function remoteAction(event) {
  var keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    Escape: 'back', BrowserBack: 'back', GoBack: 'back', MediaPlayPause: 'toggle',
    MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop', MediaFastForward: 'forward',
    MediaRewind: 'rewind', Enter: 'enter' };
  var codes = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
    27: 'back', 8: 'back', 461: 'back', 10009: 'back', 415: 'play', 19: 'pause',
    10252: 'toggle', 179: 'toggle', 413: 'stop', 417: 'forward', 412: 'rewind' };
  return keys[event.key] || codes[event.keyCode] || null;
}
