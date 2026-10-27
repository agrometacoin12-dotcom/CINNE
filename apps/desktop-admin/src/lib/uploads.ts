import type { ApiClient } from './api-client';
import type { CompletedUploadPart, PresignKind, PresignResponse } from './types';

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
  active: Set<XMLHttpRequest>;
  running: boolean;
  verified: boolean;
  multipart: { key: string; uploadId: string } | null;
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
    return this.items.map(({ file: _f, xhr: _x, multipart: _m, onAttached: _o, active: _a, running: _r, verified: _v, ...pub }) => ({
      ...pub,
    }));
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
      active: new Set(),
      running: false,
      verified: false,
      multipart: null,
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
    if (item.status !== 'queued' && item.status !== 'uploading') return;
    item.status = 'cancelled';
    for (const xhr of item.active) xhr.abort();
    if (item.xhr) item.xhr.abort();
    const multipart = item.multipart;
    item.multipart = null;
    if (multipart) {
      void this.getClient()
        .abortMultipartUpload(multipart.key, multipart.uploadId)
        .catch(() => undefined);
    }
    {
      item.status = 'cancelled';
      item.xhr = null;
      this.emit();
    }
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.running || (item.status !== 'error' && item.status !== 'cancelled')) return;
    item.status = 'queued';
    item.progress = 0;
    item.bytesSent = 0;
    item.speedBps = 0;
    item.error = null;
    item.multipart = null;
    this.emit();
    void this.start(item);
  }

  dismiss(id: string): void {
    this.items = this.items.filter((i) => i.id !== id || i.status === 'uploading' || i.status === 'queued');
    this.emit();
  }

  clearFinished(): void {
    this.items = this.items.filter((i) => i.status === 'queued' || i.status === 'uploading');
    this.emit();
  }

  private async start(item: InternalItem): Promise<void> {
    item.running = true;
    item.status = 'uploading';
    this.emit();
    try {
      if (item.verified && item.key) {
        await item.onAttached(item.key);
        if ((item.status as UploadStatus) !== 'cancelled') {
          item.status = 'done'; item.progress = 1; item.bytesSent = item.fileSize; this.emit();
        }
        return;
      }
      if (/\.mkv$/i.test(item.file.name)) throw new Error('Convert this MKV using Prepare video → Convert to MP4 for upload, then select the saved MP4.');
      const contentType = item.file.type || (/\.mp4$/i.test(item.file.name) ? 'video/mp4' : 'application/octet-stream');
      const presign = await this.getClient().presignUpload(item.kind, contentType, item.file.size);
      if ((item.status as UploadStatus) === 'cancelled') {
        if (presign.multipart) await this.getClient().abortMultipartUpload(presign.key, presign.multipart.uploadId);
        return;
      }
      item.key = presign.key;

      if (presign.multipart) {
        item.multipart = { key: presign.key, uploadId: presign.multipart.uploadId };
        const parts = await this.multipartPut(item, presign);
        if ((item.status as UploadStatus) === 'cancelled') return;
        await this.getClient().completeMultipartUpload(
          presign.key,
          presign.multipart.uploadId,
          parts,
        );
        item.multipart = null;
      } else if (!presign.enabled) {
        // Mock mode / storage disabled: simulate a short upload so flows work.
        await this.simulate(item);
      } else if (presign.uploadUrl) {
        await this.put(item, presign.uploadUrl, {
          ...presign.headers,
          'Content-Type': contentType,
        });
      } else {
        throw new Error('Storage did not provide an upload destination');
      }
      if ((item.status as UploadStatus) === 'cancelled') return;

      if (presign.enabled) {
        const stored = await this.getClient().uploadStat(presign.key);
        if (!stored.exists || stored.size !== item.fileSize) {
          throw new Error(
            `Storage verification failed (expected ${item.fileSize} bytes, found ${stored.size})`,
          );
        }
      }

      if ((item.status as UploadStatus) === 'cancelled') return;
      item.verified = true;
      await item.onAttached(item.key);
      if ((item.status as UploadStatus) === 'cancelled') return;
      item.status = 'done';
      item.progress = 1;
      item.bytesSent = item.fileSize;
      this.emit();
    } catch (err) {
      if ((item.status as UploadStatus) === 'cancelled') return;
      const multipart = item.multipart;
      item.multipart = null;
      if (multipart) {
        await this.getClient()
          .abortMultipartUpload(multipart.key, multipart.uploadId)
          .catch(() => undefined);
      }
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Upload failed';
      this.emit();
    } finally { item.running = false; }
  }

  private async multipartPut(
    item: InternalItem,
    presign: PresignResponse,
  ): Promise<CompletedUploadPart[]> {
    const multipart = presign.multipart;
    if (!multipart) throw new Error('Missing multipart upload plan');
    const completed: CompletedUploadPart[] = [];
    const loaded = new Map<number, number>();
    let next = 0;
    let failed: unknown;
    const started = Date.now();
    const progress = (number: number, bytes: number) => {
      loaded.set(number, bytes);
      item.bytesSent = Math.min([...loaded.values()].reduce((sum, value) => sum + value, 0), item.fileSize);
      item.progress = item.fileSize ? item.bytesSent / item.fileSize : 0;
      item.speedBps = item.bytesSent / Math.max(0.1, (Date.now() - started) / 1000);
      this.emit();
    };
    const worker = async () => {
      while (!failed && item.status !== 'cancelled') {
        const part = multipart.parts[next++];
        if (!part) return;
        const start = (part.partNumber - 1) * multipart.partSize;
        const blob = item.file.slice(start, Math.min(start + multipart.partSize, item.fileSize));
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (failed || (item.status as UploadStatus) === 'cancelled') return;
          try {
            const etag = await this.putPart(item, part.uploadUrl, blob, bytes => progress(part.partNumber, bytes));
            progress(part.partNumber, blob.size);
            completed.push({ partNumber: part.partNumber, etag });
            break;
          } catch (error) {
            if (failed || (item.status as UploadStatus) === 'cancelled') return;
            progress(part.partNumber, 0);
            if (attempt === 3) {
              failed = error;
              for (const xhr of item.active) xhr.abort();
              return;
            }
            await new Promise(resolve => setTimeout(resolve, attempt * 750));
          }
        }
      }
    };
    await Promise.all(Array.from({length: Math.min(3, multipart.parts.length)}, worker));
    if (failed) throw failed;
    if (item.status === 'cancelled') throw new Error('cancelled');
    return completed.sort((a, b) => a.partNumber - b.partNumber);
  }

  private putPart(
    item: InternalItem,
    url: string,
    blob: Blob,
    onProgress: (bytes: number) => void,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      item.active.add(xhr);
      item.status = 'uploading';
      this.emit();

      xhr.upload.onprogress = event => onProgress(event.loaded);
      xhr.timeout = 10 * 60 * 1000;
      xhr.ontimeout = () => { item.active.delete(xhr); reject(new Error('Upload part timed out')); };
      xhr.onload = () => {
        item.active.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader('ETag');
          if (etag) resolve(etag);
          else reject(new Error('Storage completed a part without an ETag'));
        } else {
          reject(new Error(`Storage rejected upload part (${xhr.status})`));
        }
      };
      xhr.onerror = () => {
        item.active.delete(xhr);
        reject(new Error('Network error during multipart upload'));
      };
      xhr.onabort = () => {
        item.active.delete(xhr);
        reject(new Error('cancelled'));
      };
      xhr.open('PUT', url);
      xhr.send(blob);
    });
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
