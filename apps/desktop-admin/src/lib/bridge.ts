/** Typed access to the preload bridge (window.studio). */

export interface StudioBridge {
  openExternal(url: string): Promise<void>;
  startAuthLoopback(): Promise<{ port: number }>;
  awaitAuthCode(): Promise<string>;
  stopAuthLoopback(): Promise<void>;
  saveTokens(json: string): Promise<void>;
  loadTokens(): Promise<string | null>;
  clearTokens(): Promise<void>;
  getVersion(): Promise<string>;
  getFlags(): Promise<{ mock: boolean; screenshotDir: string | null }>;
  captureScreenshot(name: string): Promise<void>;
  screenshotsDone(): Promise<void>;
}

declare global {
  interface Window {
    studio?: StudioBridge;
  }
}

/** No-op fallback so the renderer also runs in a plain browser during dev. */
const fallback: StudioBridge = {
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener');
  },
  startAuthLoopback: async () => ({ port: 0 }),
  awaitAuthCode: () => new Promise<string>(() => undefined),
  stopAuthLoopback: async () => undefined,
  saveTokens: async (json) => {
    window.localStorage.setItem('studio.tokens', json);
  },
  loadTokens: async () => window.localStorage.getItem('studio.tokens'),
  clearTokens: async () => {
    window.localStorage.removeItem('studio.tokens');
  },
  getVersion: async () => 'dev',
  getFlags: async () => ({ mock: false, screenshotDir: null }),
  captureScreenshot: async () => undefined,
  screenshotsDone: async () => undefined,
};

export const studio: StudioBridge = window.studio ?? fallback;
