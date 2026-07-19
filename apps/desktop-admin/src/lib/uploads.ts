import type { ApiClient } from './api-client';
import type { PresignKind } from './types';

/**
 * Global upload manager. Presigns via the ApiClient, then PUTs the File with
 * XMLHttpRequest so multi-GB files stream straight from disk (never buffered
 * into memory) and we get granular progress events. Feeds the UploadTray.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  label: string;
  fileName: string;
  fileSize: number;
  kind: PresignKind;
  status: UploadStatus;
  progress: number; // 0..1
  bytesSent: number;
  speedBps: number;
  error: string | null;
  key: string | null;
}

interface InternalItem extends UploadItem {
  file: File;
  xhr: XMLHttpRequest | null;
  onAttached: (key: string) => Promise<void> | void;
}

type Listener = (items: UploadItem[]) => void;

let counter = 0;

export class UploadManager {
  private items: InternalItem[] = [];
  private listeners = new Set<Listener>();

  constructor(private getClient: () => ApiClient) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): UploadItem[] {
    return this.items.map(({ file: _f, xhr: _x, onAttached: _o, ...pub }) => ({ ...pub }));
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  enqueue(opts: {
    file: File;
    kind: PresignKind;
    label: string;
    /** Called with the storage key once the PUT completes; attach it via PATCH. */
    onAttached: (key: string) => Promise<void> | void;
  }): string {
    const id = `up-${++counter}`;
    const item: InternalItem = {
      id,
      label: opts.label,
      fileName: opts.file.name,
      fileSize: opts.file.size,
      kind: opts.kind,
      status: 'queued',
      progress: 0,
      bytesSent: 0,
      speedBps: 0,
      error: null,
      key: null,
      file: opts.file,
      xhr: null,
      onAttached: opts.onAttached,
    };
    this.items.unshift(item);
    this.emit();
    void this.start(item);
    return id;
  }

  cancel(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.xhr) item.xhr.abort();
    if (item.status === 'queued' || item.status === 'uploading') {
      item.status = 'cancelled';
      item.xhr = null;
      this.emit();
    }
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return;
    item.status = 'queued';
    item.progress = 0;
    item.bytesSent = 0;
    item.speedBps = 0;
    item.error = null;
    this.emit();
    void this.start(item);
  }

  dismiss(id: string): void {
    this.items = this.items.filter((i) => i.id !== id || i.status === 'uploading');
    this.emit();
  }

  clearFinished(): void {
    this.items = this.items.filter((i) => i.status === 'queued' || i.status === 'uploading');
    this.emit();
  }

  private async start(item: InternalItem): Promise<void> {
    try {
      const contentType = item.file.type || 'application/octet-stream';
      const presign = await this.getClient().presignUpload(item.kind, contentType);
      if (item.status === 'cancelled') return;
      item.key = presign.key;

      if (!presign.enabled || !presign.uploadUrl) {
        // Mock mode / storage disabled: simulate a short upload so flows work.
        await this.simulate(item);
      } else {
        await this.put(item, presign.uploadUrl, {
          ...presign.headers,
          'Content-Type': contentType,
        });
      }
      if ((item.status as UploadStatus) === 'cancelled') return;

      item.status = 'done';
      item.progress = 1;
      item.bytesSent = item.fileSize;
      this.emit();
      await item.onAttached(item.key);
    } catch (err) {
      if ((item.status as UploadStatus) === 'cancelled') return;
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Upload failed';
      this.emit();
    }
  }

  private put(item: InternalItem, url: string, headers: Record<string, string>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      item.xhr = xhr;
      item.status = 'uploading';
      this.emit();

      let lastTime = Date.now();
      let lastLoaded = 0;

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt > 0.4) {
          item.speedBps = (e.loaded - lastLoaded) / dt;
          lastTime = now;
          lastLoaded = e.loaded;
        }
        item.bytesSent = e.loaded;
        item.progress = e.total > 0 ? e.loaded / e.total : 0;
        this.emit();
      };
      xhr.onload = () => {
        item.xhr = null;
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Storage rejected the upload (${xhr.status})`));
      };
      xhr.onerror = () => {
        item.xhr = null;
        reject(new Error('Network error during upload'));
      };
      xhr.onabort = () => {
        item.xhr = null;
        reject(new Error('cancelled'));
      };

      xhr.open('PUT', url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      // Passing the File streams from disk; the renderer never buffers it.
      xhr.send(item.file);
    });
  }

  private async simulate(item: InternalItem): Promise<void> {
    item.status = 'uploading';
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      if ((item.status as UploadStatus) === 'cancelled') throw new Error('cancelled');
      await new Promise((r) => setTimeout(r, 90));
      item.progress = i / steps;
      item.bytesSent = Math.round(item.fileSize * item.progress);
      item.speedBps = item.fileSize / (steps * 0.09);
      this.emit();
    }
  }
}
