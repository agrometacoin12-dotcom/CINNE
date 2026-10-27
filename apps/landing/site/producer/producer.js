(() => {
  'use strict';
  const API = 'https://api.cinnetemple.com';
  const TOK = 'ct.landing.tokens';
  const $ = id => document.getElementById(id);
  let key = null;
  let loading = false;
  try {
    const supplied = new URLSearchParams(location.hash.slice(1)).get('key');
    history.replaceState(null, '', location.pathname);
    if (supplied && /^[\w-]{32,128}$/.test(supplied)) sessionStorage.setItem('ct.producerKey', supplied);
    key = sessionStorage.getItem('ct.producerKey');
  } catch { $('message').textContent = 'Allow browser storage to sign in.'; }
  function tokens() { try { return JSON.parse(localStorage.getItem(TOK) || 'null'); } catch { return null; } }
  function signIn() {
    try {
      sessionStorage.removeItem('ct.producerKey');
      localStorage.removeItem(TOK);
      sessionStorage.setItem('ct.resume', '/producer/register/');
      location.assign(API + '/v1/auth/google');
    } catch { $('message').textContent = 'Allow browser storage, then try again.'; }
  }
  async function request(path, body, retry = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['x-producer-key'] = key;
    else if (tokens()?.accessToken) headers.Authorization = 'Bearer ' + tokens().accessToken;
    const response = await fetch(API + '/v1/' + path, { method: body ? 'POST' : 'GET', headers, ...(body ? {body: JSON.stringify(body)} : {}) });
    if (response.status === 401 && !key && retry && tokens()?.refreshToken) {
      const refreshed = await fetch(API + '/v1/auth/refresh', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refreshToken: tokens().refreshToken}) });
      if (refreshed.ok) { localStorage.setItem(TOK, JSON.stringify(await refreshed.json())); return request(path, body, false); }
    }
    if (!response.ok) { const error = new Error('Request failed'); error.status = response.status; throw error; }
    return response.json();
  }
  function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
  const money = value => new Intl.NumberFormat('en-NG', {style:'currency', currency:'NGN', maximumFractionDigits:0}).format(value / 100);
  function render(data) {
    $('gate').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    $('welcome').textContent = data.producer.name || 'Your dashboard';
    $('email').textContent = data.producer.email;
    $('stats').replaceChildren();
    for (const [label, value] of [['Movie views', data.totals.views.toLocaleString()], ['Tickets sold', data.totals.ticketsSold.toLocaleString()], ['Total earnings', money(data.totals.earningsMinor)], ['Available balance', money(data.balance.availableMinor)]]) {
      const item = text('div', label); item.className = 'stat'; item.append(text('strong', value)); $('stats').append(item);
    }
    $('films').replaceChildren(); $('empty').hidden = data.films.length !== 0;
    for (const film of data.films) {
      const card = document.createElement('article'); card.className = 'film';
      if (film.posterUrl) {
        try { const url = new URL(film.posterUrl); if (url.protocol === 'https:') { const img = document.createElement('img'); img.src = url.href; img.alt = ''; img.loading = 'lazy'; card.append(img); } } catch { /* no poster */ }
      }
      card.append(text('h3', film.title), text('p', `${film.views.toLocaleString()} views · ${film.ticketsSold.toLocaleString()} tickets`), text('p', `Your share: ${film.revenueShareBps / 100}% of net ticket revenue`), text('p', `Earnings: ${money(film.earningsMinor)}`));
      $('films').append(card);
    }
    $('withdrawals').replaceChildren();
    for (const withdrawal of data.withdrawals) { const row = text('p', `${money(withdrawal.amountMinor)} · ${withdrawal.status.replaceAll('_', ' ')}`); row.className = 'withdrawal'; $('withdrawals').append(row); }
    if (!data.withdrawals.length) $('withdrawals').append(text('p', 'No withdrawals yet.'));
  }
  async function load() {
    if (loading) return;
    loading = true; $('refresh').disabled = true; $('message').textContent = 'Loading your profile…';
    try { render(await request(key ? 'producer/dashboard' : 'producer/account/dashboard')); $('message').textContent = ''; }
    catch (error) {
      if (error.status === 404 && !key) {
        $('gate').hidden = false; $('signin').hidden = true; $('register').hidden = false; $('logout').hidden = false;
        $('message').textContent = 'Email verified. Enter your producer name to finish registration.';
      } else if (error.status === 401 || error.status === 403) {
        $('dashboard').hidden = true; $('gate').hidden = false; $('signin').hidden = false; $('register').hidden = true;
        $('message').textContent = 'Please continue with Google to access your producer profile.';
      } else $('message').textContent = 'Could not load your dashboard. Check your connection and try again.';
    } finally { loading = false; $('refresh').disabled = false; }
  }
  $('signin').onclick = signIn; $('switch').onclick = signIn; $('refresh').onclick = load;
  $('logout').onclick = () => { localStorage.removeItem(TOK); sessionStorage.removeItem('ct.producerKey'); location.replace('/producer/'); };
  $('register').onsubmit = async event => {
    event.preventDefault(); const button = $('register').querySelector('[type="submit"]'); button.disabled = true;
    const name = $('name').value.trim();
    if (name.length < 2) { $('message').textContent = 'Enter a producer name of at least two characters.'; button.disabled = false; return; }
    try { await request('producer/account/register', {name}); await load(); }
    catch (error) { $('message').textContent = error.status === 401 || error.status === 403 ? 'Please sign in with Google again.' : 'Registration failed. Please try again.'; }
    finally { button.disabled = false; }
  };
  if (key || tokens()?.accessToken) load();
})();
