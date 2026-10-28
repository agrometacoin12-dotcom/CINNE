import { studio } from '../lib/bridge';
import { ApiError, type ApiClient } from '../lib/api-client';
import type { Route } from '../lib/app-context';
import { rulesToJson, sameRules } from '../lib/classification';
import type { HomeSectionPatch, SectionRules } from '../lib/types';

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
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Look up producer email')!.click();
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

    // Series editor includes the Classification panel (series-only fields).
    document.querySelector<HTMLElement>('.class-panel')?.scrollIntoView({ block: 'start' });
    await sleep(STEP_MS);
    await studio.captureScreenshot('series-classification');

    navigate({ screen: 'users' });
    await sleep(STEP_MS);
    await studio.captureScreenshot('users');

    // Movie classification: toggle a tag, save only that change, check placement reloads.
    navigate({ screen: 'movies' });
    await sleep(STEP_MS);
    document.querySelector<HTMLTableRowElement>('table.data tbody tr')?.click();
    await sleep(STEP_MS * 2);
    const panel = document.querySelector<HTMLElement>('.class-panel');
    if (!panel) throw new Error('Classification panel missing from movie editor');
    panel.scrollIntoView({ block: 'start' });
    await sleep(300);
    await studio.captureScreenshot('movie-classification');
    const sent: unknown[] = [];
    const originalUpdate = client.updateClassification.bind(client);
    client.updateClassification = async (id, input) => { sent.push(input); return originalUpdate(id, input); };
    [...panel.querySelectorAll<HTMLButtonElement>('.tag-chip')].find((b) => b.textContent === 'Village')!.click();
    await sleep(100);
    [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save classification')!.click();
    await sleep(STEP_MS);
    client.updateClassification = originalUpdate;
    if (sent.length !== 1 || JSON.stringify(Object.keys(sent[0] as object)) !== '["tags"]')
      throw new Error(`Classification save should send only tags, sent ${JSON.stringify(sent)}`);
    document.querySelector<HTMLElement>('.placement-list')?.scrollIntoView({ block: 'center' });
    await sleep(300);
    await studio.captureScreenshot('movie-placement');
    document.querySelector<HTMLButtonElement>('.drawer-head button')?.click();

    navigate({ screen: 'homepage' });
    await sleep(STEP_MS * 2);
    if (document.querySelectorAll('.home-section').length !== 51) throw new Error('Expected 51 homepage sections');
    await studio.captureScreenshot('homepage');
    [...document.querySelectorAll<HTMLButtonElement>('.home-section button')].find((b) => b.textContent === 'Pins…')!.click();
    await sleep(300);
    await studio.captureScreenshot('homepage-pins');
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Preview homepage')!.click();
    await sleep(STEP_MS);
    await studio.captureScreenshot('homepage-preview');
    document.querySelector<HTMLButtonElement>('.drawer-head button')?.click();
    await sleep(300);

    await exerciseRulesEditor(client);
  } catch (err) {
    // Make a failed check visible in the capture set (the renderer console is not forwarded).
    const banner = document.createElement('div');
    banner.textContent = `Screenshot driver failed: ${err instanceof Error ? err.message : String(err)}`;
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:999;padding:16px 20px;background:#7f1d1d;color:#fff;font:13px ui-monospace,monospace;white-space:pre-wrap';
    document.body.appendChild(banner);
    await sleep(100);
    await studio.captureScreenshot('driver-error');
    throw err;
  } finally {
    await studio.screenshotsDone();
  }
}

// ── Homepage rules editor ───────────────────────────────────────────────────

const rowFor = (slug: string) => {
  const row = [...document.querySelectorAll<HTMLElement>('.home-section')].find(
    (r) => r.querySelector('.mono')?.textContent === slug,
  );
  if (!row) throw new Error(`Homepage row ${slug} not found`);
  return row;
};
const buttonIn = (root: ParentNode, text: string) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === text);
  if (!b) throw new Error(`Button "${text}" not found`);
  return b;
};
const drawer = () => {
  const d = document.querySelector<HTMLElement>('.drawer');
  if (!d) throw new Error('Drawer is not open');
  return d;
};
/** Set a React-controlled input/textarea/select the way typing or picking would. */
const setValue = (selector: string, value: string, root: ParentNode = document) => {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (!el) throw new Error(`Missing form control ${selector}`);
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};
const expect = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
/** True when an undefined/null sits anywhere inside `v`. */
const hasHoles = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'object' && Object.values(v as object).some(hasHoles));

/**
 * Row sort select, then the rules editor on "Action-Packed Movies": swap the
 * genre for an industry, trip the inline validation, add two anyOf branches,
 * change the sort, round-trip through the JSON tab, show a server 400, save,
 * and check the PATCH body plus the refreshed row and preview.
 */
async function exerciseRulesEditor(client: ApiClient): Promise<void> {
  const patches: HomeSectionPatch[] = [];
  const originalPatch = client.updateHomeSection.bind(client);
  const recordingPatch: ApiClient['updateHomeSection'] = async (id, body) => {
    patches.push(structuredClone(body));
    return originalPatch(id, body);
  };
  client.updateHomeSection = recordingPatch;
  try {
    // Sort straight from the row.
    setValue('select', 'RATING_DESC', rowFor('popular'));
    await sleep(STEP_MS);
    expect(JSON.stringify(patches.at(-1)) === '{"sort":"RATING_DESC"}', `Row sort sent ${JSON.stringify(patches.at(-1))}`);
    expect(rowFor('popular').querySelector('select')!.value === 'RATING_DESC', 'Row sort select did not keep the new sort');

    const action = rowFor('action-packed');
    expect(action.textContent?.includes('genres: action'), 'Action-Packed summary should start as genres: action');
    buttonIn(action, 'Rules…').click();
    await sleep(STEP_MS);
    expect(drawer().textContent?.includes('Rules · Action-Packed Movies'), 'Rules editor did not open');
    expect(drawer().querySelector('.tab.on')?.textContent === 'Form', 'Seeded rules should open in the form');
    await studio.captureScreenshot('rules-editor');

    // Swap the genre for an industry; a negative runtime is flagged inline and blocks Save.
    drawer().querySelector<HTMLButtonElement>('button[aria-label="Remove Action"]')!.click();
    await sleep(80);
    setValue('#rules-industries', 'nollywood', drawer());
    setValue('#rules-minRuntimeMinutes', '-5', drawer());
    await sleep(150);
    expect(drawer().textContent?.includes('Must be a non-negative number'), 'Negative runtime not flagged');
    expect(buttonIn(drawer(), 'Save rules').disabled, 'Save must be disabled while a field is invalid');
    drawer().querySelector('#rules-minRuntimeMinutes')!.scrollIntoView({ block: 'center' });
    await sleep(150);
    await studio.captureScreenshot('rules-editor-invalid');
    setValue('#rules-minRuntimeMinutes', '', drawer()); // empty → key omitted

    // Two anyOf branches and a new sort.
    buttonIn(drawer(), '+ Add branch').click();
    await sleep(100);
    setValue('#rules-anyOf-0-minPlays7d', '1', drawer());
    buttonIn(drawer(), '+ Add branch').click();
    await sleep(100);
    setValue('#rules-anyOf-1-collections', 'editors-picks', drawer());
    setValue('#rules-sort', 'RELEASE_DESC', drawer());
    await sleep(200);
    drawer().querySelector('.rule-branch')!.scrollIntoView({ block: 'start' });
    await sleep(150);
    await studio.captureScreenshot('rules-editor-edited');

    // The JSON tab shows exactly what the form built.
    const fromForm: SectionRules = {
      industriesAny: ['nollywood'],
      anyOf: [{ minPlays7d: 1 }, { collectionsAny: ['editors-picks'] }],
    };
    buttonIn(drawer(), 'Advanced (JSON)').click();
    await sleep(200);
    const json = () => drawer().querySelector<HTMLTextAreaElement>('#rules-json')!;
    expect(json().value === rulesToJson(fromForm), `JSON tab out of sync with the form: ${json().value}`);
    drawer().querySelector('.drawer-body')?.scrollTo({ top: 0 });
    await studio.captureScreenshot('rules-editor-json');

    // Client-side validation mirrors parseSectionRules: unknown key → inline error, no Save, no switch.
    setValue('#rules-json', json().value.replace('"industriesAny"', '"industries"'), drawer());
    await sleep(150);
    expect(drawer().textContent?.includes('Unknown rule key "industries" at rules'), 'Unknown key not flagged inline');
    expect(buttonIn(drawer(), 'Save rules').disabled, 'Save must be disabled for invalid JSON');
    buttonIn(drawer(), 'Form').click();
    await sleep(150);
    expect(drawer().textContent?.includes('Fix the JSON error before switching to the form.'), 'Switch with bad JSON not blocked');
    await studio.captureScreenshot('rules-editor-json-error');

    // Edit in JSON, then back to the form: the branch field follows.
    const edited: SectionRules = { ...fromForm, anyOf: [{ minPlays7d: 2 }, { collectionsAny: ['editors-picks'] }] };
    setValue('#rules-json', JSON.stringify(edited), drawer());
    await sleep(150);
    buttonIn(drawer(), 'Form').click();
    await sleep(150);
    expect(drawer().querySelector('.tab.on')?.textContent === 'Form', 'Valid JSON should switch back to the form');
    buttonIn(drawer().querySelector('.rule-branch')!, 'Edit').click();
    await sleep(100);
    expect(drawer().querySelector<HTMLInputElement>('#rules-anyOf-0-minPlays7d')!.value === '2', 'Form did not pick up the JSON edit');

    // A server 400 shows its detail in the editor.
    client.updateHomeSection = async () => {
      throw new ApiError(400, 'Bad Request', 'Invalid rules: rules.anyOf[0].minPlays7d must be a non-negative number (simulated server 400)');
    };
    buttonIn(drawer(), 'Save rules').click();
    await sleep(300);
    expect(drawer().textContent?.includes('(simulated server 400)'), 'Server 400 detail not shown');
    drawer().querySelector('.drawer-body')!.scrollTo({ top: 99_999 });
    await sleep(150);
    await studio.captureScreenshot('rules-editor-server-error');

    // Save for real: { rules, sort } with no holes; the row's summary, sort and counts refresh.
    client.updateHomeSection = recordingPatch;
    const before = patches.length;
    buttonIn(drawer(), 'Save rules').click();
    await sleep(STEP_MS);
    const sent = patches[before];
    expect(patches.length === before + 1 && sent, 'Save did not send one PATCH');
    expect(JSON.stringify(Object.keys(sent!)) === '["rules","sort"]', `Save sent ${JSON.stringify(sent)}`);
    expect(sameRules(sent!.rules!, edited) && !hasHoles(sent!.rules), `Saved rules ${JSON.stringify(sent!.rules)}`);
    expect(sent!.sort === 'RELEASE_DESC', 'Sort not sent');
    expect(!document.querySelector('.drawer'), 'Rules editor should close after saving');
    expect(document.body.textContent?.includes('Rules saved'), 'No save confirmation');
    const saved = rowFor('action-packed');
    expect(saved.textContent?.includes('industries: nollywood · any of (minPlays7d: 2 | collections: editors-picks)'), `Row summary not refreshed: ${saved.textContent}`);
    expect(saved.querySelector('select')!.value === 'RELEASE_DESC', 'Row sort not refreshed');
    const dto = (await client.listHomeSections()).find((x) => x.slug === 'action-packed')!;
    expect(saved.textContent?.includes(`${dto.eligibleCount} eligible`), 'Eligible count not refreshed');
    saved.scrollIntoView({ block: 'center' });
    await sleep(300);
    await studio.captureScreenshot('homepage-rules-saved');

    // Rules nested deeper than the form opens in JSON only.
    const latest = (await client.listHomeSections()).find((x) => x.slug === 'latest-releases')!;
    await originalPatch(latest.id, { rules: { anyOf: [{ anyOf: latest.rules.anyOf ?? [] }] } });
    buttonIn(document, 'Refresh').click();
    await sleep(STEP_MS);
    buttonIn(rowFor('latest-releases'), 'Rules…').click();
    await sleep(STEP_MS);
    expect(drawer().querySelector('.tab.on')?.textContent === 'Advanced (JSON)', 'Deeply nested rules should open as JSON');
    buttonIn(drawer(), 'Form').click();
    await sleep(150);
    expect(drawer().textContent?.includes("The form can't show these rules"), 'Form fallback not explained');
    await studio.captureScreenshot('rules-editor-json-only');
    buttonIn(drawer(), 'Cancel').click();
    await originalPatch(latest.id, { rules: latest.rules });

    // The preview follows the saved rules and sort.
    buttonIn(document, 'Preview homepage').click();
    await sleep(STEP_MS);
    const previewRow = [...document.querySelectorAll<HTMLElement>('.preview-row')].find((r) =>
      r.querySelector('strong')?.textContent === 'Action-Packed Movies',
    );
    expect(Boolean(previewRow) === dto.live, `Preview disagrees with live=${dto.live}`);
    previewRow?.scrollIntoView({ block: 'center' });
    await sleep(300);
    await studio.captureScreenshot('homepage-preview-after');
  } finally {
    client.updateHomeSection = originalPatch;
  }
}
