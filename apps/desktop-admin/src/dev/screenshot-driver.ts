import { studio } from '../lib/bridge';
import type { ApiClient } from '../lib/api-client';
import type { Route } from '../lib/app-context';

/**
 * Dev-only verification driver. Active only when launched with
 * `--mock --screenshot-dir=PATH`. Once the app reaches the ready state it
 * walks Dashboard -> Movies -> Series editor -> Users, capturing a PNG at
 * each stop (~1.2s apart), then asks main to quit.
 */

let started = false;

const STEP_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runScreenshotSequence(
  client: ApiClient,
  navigate: (route: Route) => void,
): Promise<void> {
  if (started) return;
  started = true;

  try {
    // Let the dashboard settle its data before the first capture.
    await sleep(STEP_MS);
    navigate({ screen: 'dashboard' });
    await sleep(STEP_MS);
    await studio.captureScreenshot('dashboard');

    navigate({ screen: 'movies' });
    await sleep(STEP_MS);
    await studio.captureScreenshot('movies');

    const list = await client.listSeries({ take: 1 });
    const first = list.items[0];
    navigate({ screen: 'series', openId: first?.id });
    await sleep(STEP_MS);
    await studio.captureScreenshot('series');

    navigate({ screen: 'users' });
    await sleep(STEP_MS);
    await studio.captureScreenshot('users');
  } finally {
    await studio.screenshotsDone();
  }
}
