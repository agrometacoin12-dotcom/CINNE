import type { EnhancementState } from '../../electron/enhancement';
/** Typed access to the preload bridge (window.studio). */

export interface StudioBridge {
  convertFull(id:string): Promise<EnhancementState | null>;
  enhanceCurrent(): Promise<EnhancementState | null>;
  enhanceChoose(): Promise<EnhancementState | null>;
  enhancePreview(id:string,start:number,duration:number): Promise<EnhancementState>;
  enhanceState(id:string): Promise<EnhancementState>;
  enhanceCancel(id:string): Promise<void>;
  enhanceFull(id:string): Promise<EnhancementState | null>;
  enhanceReveal(id:string): Promise<void>;
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
const unavailable = async (): Promise<never> => { throw new Error('Local enhancement is available in the desktop app.'); };
const fallback: StudioBridge = {
  enhanceCurrent: async () => null, enhanceChoose: unavailable, enhancePreview: unavailable, enhanceState: unavailable,
  convertFull: unavailable, enhanceCancel: unavailable, enhanceFull: unavailable, enhanceReveal: unavailable,
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
