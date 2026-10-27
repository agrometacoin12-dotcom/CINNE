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
    document.querySelector<HTMLTableRowElement>('table.data tbody tr')?.click();
    await sleep(STEP_MS);
    await studio.captureScreenshot('movie-editor');
    document.querySelector<HTMLElement>('.drawer-body')?.scrollTo({top: 1200});
    await sleep(STEP_MS);
    await studio.captureScreenshot('movie-producer');
    const enhancement = await studio.enhanceCurrent();
    if (enhancement) {
      for(let attempt=0;attempt<60;attempt++) {
        if((await studio.enhanceState(enhancement.id)).phase !== 'previewing') break;
        await sleep(1000);
      }
      await sleep(1200);
      const panel=document.querySelector<HTMLElement>('.enhancement-panel')!;
      panel.scrollIntoView({block:'start'});
      const approval=panel.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const processButton=[...panel.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Approve & process'));
      if(!approval || !processButton || !processButton.disabled) throw new Error('Full processing must require sample approval');
      for(const video of panel.querySelectorAll('video')) { video.currentTime=0.2; }
      await sleep(1200);
      await studio.captureScreenshot('enhancement-comparison');
      approval.click();await sleep(100);
      if(processButton.disabled)throw new Error('Reviewed sample did not enable processing');
      approval.click();
    }
    // Exercise producer assignment and unchanged-save behavior without sending real email.
    let assignments = 0;
    client.lookupProducer = async email => ({producer: email === 'producer@example.test' ? {id:'00000000-0000-4000-8000-000000000001', email, name:'Studio QA Producer'} : null});
    const originalAssign = client.assignProducer.bind(client);
    client.assignProducer = async (...args) => { assignments++; return originalAssign(...args); };
    const fill = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill('#producer-name', 'Studio QA Producer');
    await sleep(50);
    fill('#producer-email', 'producer@example.test');
    await sleep(50);
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Find registered producer')!.click();
    await sleep(100);
    if (!document.body.textContent?.includes('Selected producer: Studio QA Producer')) throw new Error('Producer lookup failed');
    fill('#producer-share', '82.5');
    await sleep(50);
    document.querySelector<HTMLButtonElement>('.drawer-foot .btn-primary')!.click();
    await sleep(STEP_MS);
    if (!document.body.textContent?.includes('Dashboard link sent to producer@example.test')) throw new Error('Producer assignment failed');
    document.querySelector<HTMLButtonElement>('.drawer-foot .btn-primary')!.click();
    await sleep(STEP_MS);
    if (assignments !== 1) throw new Error('Unchanged save resent producer link');
    const assignedMovie = (await client.listMovies())[0];
    if (!assignedMovie) throw new Error('Missing fixture movie');
    const linked = (await client.getProducer(assignedMovie.id)).producer;
    if (linked?.revenueShareBps !== 8250) throw new Error('Revenue percentage did not persist');
    await studio.captureScreenshot('producer-flow-passed');
    client.assignProducer = originalAssign;
    document.querySelector<HTMLButtonElement>('.drawer-head button')?.click();

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
