// Runs only against local preview, with deterministic API fixtures and no real account.
// PLAYWRIGHT_MODULE may point at a separate tooling install (absolute module path).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const sampleVideo = await readFile(new URL('../../ios/CinneTemple/Resources/splash.mp4', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const film = { id: '11111111-1111-4111-8111-111111111111', type: 'movie', title: 'A Night in Lagos', year: 2026,
  genres: ['Drama'], overview: 'One city. A thousand stories. A film for your next movie night.', posterUrl: null,
  heroUrl: null, priceMinor: 100000, currency: 'NGN', hasVideo: true, hasTrailer: true, isPremiere: false, premiereLive: false };
const series = { ...film, id: '22222222-2222-4222-8222-222222222222', type: 'series', title: 'The Journey',
  seasonsList: [{ number: 1, name: null, episodes: [
    { id: '33333333-3333-4333-8333-333333333333', number: 1, name: 'A new beginning', hasVideo: true, consumed: false },
    { id: '44444444-4444-4444-8444-444444444444', number: 2, name: 'Yesterday', hasVideo: true, consumed: true }
  ] }] };
try {
  for (const platform of ['webos', 'vidaa']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    const starts = [];
    const heartbeats = [];
    page.on('pageerror', error => errors.push(error.message));
    let saved = false;
    let outage = false;
    let invalidMedia = false;
    await page.route('https://api.cinnetemple.com/**', async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      let body;
      if (url.pathname === '/v1/auth/login') body = { accessToken: 'test-access', refreshToken: 'test-refresh' };
      else if (url.pathname === '/v1/auth/me') body = { id: 'viewer', displayName: 'Test Viewer', email: 'viewer@example.test' };
      else if (url.pathname === '/v1/auth/logout') body = { success: true };
      else if (url.pathname === '/v1/catalogue/browse') {
        if (outage) { await route.fulfill({ status: 503, json: { detail: 'Temporary outage' } }); return; }
        body = { hero: film, rows: [{ title: 'Made for movie night', items: [film, series, { ...film, id: 'another', title: '<script>bad()</script>' }] }] };
      }
      else if (url.pathname === '/v1/catalogue/search') body = { results: [series] };
      else if (url.pathname === '/v1/premieres') body = [film];
      else if (url.pathname === '/v1/entitlements') body = [{ titleId: film.id, title: film, status: 'ACTIVE' }];
      else if (url.pathname === '/v1/watchlist') {
        if (method === 'POST') { saved = true; body = { success: true }; }
        else body = saved ? [{ titleId: film.id, title: film }] : [];
      }
      else if (url.pathname.startsWith('/v1/watchlist/')) { saved = false; body = { success: true }; }
      else if (url.pathname === '/v1/playback/continue') body = [];
      else if (url.pathname.endsWith('/status')) body = { hasAccess: true, started: false, premiere: false };
      else if (url.pathname.endsWith('/start')) {
        starts.push(route.request().postDataJSON());
        body = { titleId: film.id, title: film.title, url: 'https://api.cinnetemple.com/media/test.mp4', durationSeconds: 120,
          watermark: 'viewer@example.test · TEST', expiresAt: new Date(Date.now() + 60000).toISOString() };
      }
      else if (url.pathname.endsWith('/progress')) { heartbeats.push(route.request().postDataJSON()); body = {}; }
      else if (url.pathname === '/media/test.mp4') {
        await route.fulfill(invalidMedia ? { status: 404, body: '' } : { status: 200, contentType: 'video/mp4', body: sampleVideo });
        return;
      }
      else if (url.pathname.endsWith('/' + series.id)) body = series;
      else if (url.pathname.endsWith('/' + film.id)) body = film;
      else { throw new Error('Unexpected API path: ' + method + ' ' + url.pathname); }
      await route.fulfill({ status: 200, json: body });
    });
    await page.goto('http://localhost:4173/' + platform + '/');
    await page.getByRole('heading', { name: film.title, exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/cinnetemple-tv-' + platform + '.png' });
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator(':focus').evaluate(el => el.tagName), 'BUTTON');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('viewer@example.test');
    await page.getByLabel('Password', { exact: true }).fill('fixture-only');
    await page.locator('#login-form button').click();
    console.log(platform + ': submitted login');
    await page.getByRole('button', { name: 'Test Viewer', exact: true }).waitFor();
    await page.getByRole('button', { name: 'My tickets', exact: true }).click();
    await page.getByRole('heading', { name: 'My tickets', exact: true }).waitFor();
    await page.locator('.poster').first().click();
    await page.getByRole('button', { name: 'Watch now', exact: true }).waitFor();
    await page.getByRole('button', { name: '+ My list', exact: true }).click();
    await page.getByRole('button', { name: 'Remove from my list', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Watch now', exact: true }).click();
    console.log(platform + ': requested film playback');
    await page.locator('#video').waitFor();
    assert.equal(starts.length, 1);
    await page.locator('.movie-intro').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#video').evaluate(v => v.paused && v.currentTime === 0), true);
    assert.equal(heartbeats.length, 0);
    await page.screenshot({path:'/tmp/cinnetemple-intro-' + platform + '.png'});
    await page.locator('.movie-intro').waitFor({state:'detached'});
    assert.equal(await page.locator('.watermark').textContent(), 'viewer@example.test · TEST');
    await page.waitForFunction(() => { const v = document.querySelector('#video'); return v && v.currentTime > 0; });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#video').paused);
    await page.waitForTimeout(100);
    assert.ok(heartbeats.length > 0);
    assert.ok(heartbeats[0].durationSeconds > 0);
    assert.equal(heartbeats[0].episodeId, undefined);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Watch now', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Watch now', exact: true }).click();
    await page.locator('.movie-intro').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.movie-intro').count(), 0);
    assert.equal(await page.locator('#video').count(), 0);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox').fill('journey');
    await page.getByRole('searchbox').press('Enter');
    await page.locator('.poster').first().click();
    await page.getByRole('button', { name: '1. A new beginning', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '2. Yesterday · Watched', exact: true }).isDisabled(), true);
    invalidMedia = true;
    await page.getByRole('button', { name: '1. A new beginning', exact: true }).click();
    await page.locator('#video').waitFor();
    assert.equal(starts[starts.length - 1].episodeId, series.seasonsList[0].episodes[0].id);
    await page.getByRole('button', {name:'Skip intro', exact:true}).click();
    await page.getByText('This video could not play.', { exact: false }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Test Viewer', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('ct.tv.refresh')), null);
    await page.getByRole('heading', { name: film.title, exact: true }).waitFor();
    outage = true;
    await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByText('Temporary outage', { exact: true }).waitFor();
    outage = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: film.title, exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(platform + ': login, remote focus, tickets, watchlist, movie/episode authorization, player error/Back, search, logout, outage recovery passed');
    await page.close();
  }
} finally { await browser.close(); }
