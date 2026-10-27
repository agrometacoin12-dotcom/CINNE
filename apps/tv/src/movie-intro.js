// A separate branded clip while the authorized movie buffers, without advancing it.
export function createMovieIntro() {
  var resolve;
  var done = false;
  var overlay = document.createElement('div');
  overlay.className = 'movie-intro';
  var clip = document.createElement('video');
  clip.src = 'splash.mp4';
  clip.muted = true; // Embedded TV/browser autoplay policies require muted intros.
  clip.setAttribute('playsinline', '');
  clip.preload = 'auto';
  var skip = document.createElement('button');
  skip.textContent = 'Skip intro';
  var handle = { cancelled: false, promise: new Promise(function (r) { resolve = r; }), finish: finish,
    cancel: function () { handle.cancelled = true; finish(); } };
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    clip.onended = clip.onerror = null;
    clip.pause();
    clip.removeAttribute('src');
    clip.load();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    resolve();
  }
  var timer = setTimeout(finish, 5000);
  skip.onclick = finish;
  clip.onended = clip.onerror = finish;
  overlay.appendChild(clip); overlay.appendChild(skip); document.body.appendChild(overlay);
  skip.focus();
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else {
    var playing = clip.play();
    if (playing && playing.catch) playing.catch(finish);
  }
  return handle;
}
