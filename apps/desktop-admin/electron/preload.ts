import { contextBridge, ipcRenderer } from 'electron';

/**
 * The ONLY bridge between the sandboxed renderer and Node/Electron.
 * Every method proxies a whitelisted ipcMain.handle in main.ts.
 */
const studio = {
  /** Open an https URL on cinnetemple.com hosts in the default browser. */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('studio:openExternal', url),

  /** Start the 127.0.0.1 loopback server for the device-link callback. */
  startAuthLoopback: (): Promise<{ port: number }> => ipcRenderer.invoke('studio:authStart'),
  /** Resolves with the single-use auth code once the browser redirects back. */
  awaitAuthCode: (): Promise<string> => ipcRenderer.invoke('studio:authAwait'),
  stopAuthLoopback: (): Promise<void> => ipcRenderer.invoke('studio:authStop'),

  /** Token pair persistence via Electron safeStorage (encrypted at rest). */
  saveTokens: (json: string): Promise<void> => ipcRenderer.invoke('studio:saveTokens', json),
  loadTokens: (): Promise<string | null> => ipcRenderer.invoke('studio:loadTokens'),
  clearTokens: (): Promise<void> => ipcRenderer.invoke('studio:clearTokens'),

  getVersion: (): Promise<string> => ipcRenderer.invoke('studio:getVersion'),
  getFlags: (): Promise<{ mock: boolean; screenshotDir: string | null }> =>
    ipcRenderer.invoke('studio:getFlags'),

  /** Dev-only verification hooks (no-ops without --screenshot-dir). */
  captureScreenshot: (name: string): Promise<void> =>
    ipcRenderer.invoke('studio:captureScreenshot', name),
  screenshotsDone: (): Promise<void> => ipcRenderer.invoke('studio:screenshotsDone'),
};

export type StudioBridge = typeof studio;

contextBridge.exposeInMainWorld('studio', studio);
