'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AdminTitle } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { RequireAdmin } from '@/components/RequireAdmin';
import { api, ApiError } from '@/lib/api';

interface FormState {
  title: string;
  type: 'movie' | 'series';
  year: string;
  tagline: string;
  overview: string;
  genres: string;
  cast: string;
  director: string;
  categories: string;
  maturityRating: string;
  runtimeMinutes: string;
  priceMajor: string;
  currency: string;
  status: 'draft' | 'published';
  isPremiere: boolean;
  premiereStartAt: string;
  videoKey: string;
  posterKey: string;
  heroKey: string;
}

const EMPTY: FormState = {
  title: '', type: 'movie', year: String(new Date().getFullYear()), tagline: '', overview: '',
  genres: '', cast: '', director: '', categories: 'trending', maturityRating: '', runtimeMinutes: '',
  priceMajor: '', currency: 'NGN', status: 'draft', isPremiere: false, premiereStartAt: '',
  videoKey: '', posterKey: '', heroKey: '',
};

const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

type UploadProgress = { kind: string; pct: number; loaded: number; total: number; bps: number };

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** PUT upload with real progress via XMLHttpRequest (fetch can't report upload progress). */
function xhrPut(url: string, file: File, headers: Record<string, string>, onProgress: (loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

function Editor() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .adminGetMovie(id)
      .then((m: AdminTitle) => {
        setForm({
          title: m.title, type: m.type, year: String(m.year), tagline: m.tagline ?? '',
          overview: m.overview, genres: m.genres.join(', '), cast: m.cast.join(', '),
          director: m.director ?? '', categories: m.categories.join(', '),
          maturityRating: m.maturityRating ?? '', runtimeMinutes: m.runtimeMinutes ? String(m.runtimeMinutes) : '',
          priceMajor: m.priceMinor ? String(m.priceMinor / 100) : '', currency: m.currency,
          status: m.status, isPremiere: m.isPremiere,
          premiereStartAt: m.premiereStartAt ? m.premiereStartAt.slice(0, 16) : '',
          videoKey: m.videoKey ?? '', posterKey: m.posterUrl ? '' : '', heroKey: '',
        });
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load'));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (kind: 'video' | 'poster' | 'hero', file: File) => {
    setUploading(kind);
    setError(null);
    const startedAt = Date.now();
    setProgress({ kind, pct: 0, loaded: 0, total: file.size, bps: 0 });
    try {
      const presigned = await api.adminPresign(kind, file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'));
      if (presigned.enabled && presigned.uploadUrl) {
        await xhrPut(presigned.uploadUrl, file, presigned.headers, (loaded, total) => {
          const secs = Math.max(0.001, (Date.now() - startedAt) / 1000);
          setProgress({ kind, pct: total ? Math.round((loaded / total) * 100) : 0, loaded, total, bps: loaded / secs });
        });
        setProgress({ kind, pct: 100, loaded: file.size, total: file.size, bps: 0 });
        setNotice(`${kind === 'video' ? 'Video master' : kind[0].toUpperCase() + kind.slice(1)} uploaded (${formatBytes(file.size)}).`);
      } else {
        setNotice(`Uploads aren’t configured in this environment — using key ${presigned.key} (upload the file to that key out-of-band).`);
      }
      const keyField = kind === 'video' ? 'videoKey' : kind === 'poster' ? 'posterKey' : 'heroKey';
      set(keyField as keyof FormState, presigned.key as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setProgress(null);
    } finally {
      setUploading(null);
      // leave the completed bar briefly, then clear
      setTimeout(() => setProgress((p) => (p?.pct === 100 ? null : p)), 1500);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      title: form.title,
      type: form.type,
      year: Number(form.year),
      tagline: form.tagline || undefined,
      overview: form.overview,
      genres: toList(form.genres),
      cast: toList(form.cast),
      director: form.director || undefined,
      categories: toList(form.categories),
      maturityRating: form.maturityRating || undefined,
      runtimeMinutes: form.runtimeMinutes ? Number(form.runtimeMinutes) : undefined,
      priceMinor: form.priceMajor ? Math.round(Number(form.priceMajor) * 100) : 0,
      currency: form.currency,
      status: form.status,
      isPremiere: form.isPremiere,
      premiereStartAt: form.isPremiere && form.premiereStartAt ? new Date(form.premiereStartAt).toISOString() : undefined,
      videoKey: form.videoKey || undefined,
      posterKey: form.posterKey || undefined,
      heroKey: form.heroKey || undefined,
    };
    try {
      if (id) {
        await api.adminUpdateMovie(id, body);
        setNotice('Saved.');
      } else {
        const created = await api.adminCreateMovie(body);
        router.replace(`/admin/movie?id=${created.id}`);
        setNotice('Created.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="mb-1 text-3xl font-extrabold">{id ? 'Edit movie' : 'New movie'}</h1>
        <p className="mb-5 text-sm text-[var(--text-secondary)]">Mobile-cinema title — pay once, watch once.</p>

        {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
        {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

        <div className="grid gap-4">
          <GlassPanel className="grid gap-4 p-5">
            <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                Type
                <select
                  className="glass rounded-glass px-4 py-3 text-[var(--text-primary)]"
                  value={form.type}
                  onChange={(e) => set('type', e.target.value as 'movie' | 'series')}
                >
                  <option value="movie">Movie</option>
                  <option value="series">Series</option>
                </select>
              </label>
              <TextField label="Year" type="number" value={form.year} onChange={(e) => set('year', e.target.value)} />
            </div>
            <TextField label="Tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
              Overview
              <textarea
                className="glass rounded-glass px-4 py-3 text-[var(--text-primary)]"
                rows={4}
                value={form.overview}
                onChange={(e) => set('overview', e.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Genres (comma-separated)" value={form.genres} onChange={(e) => set('genres', e.target.value)} />
              <TextField label="Cast (comma-separated)" value={form.cast} onChange={(e) => set('cast', e.target.value)} />
              <TextField label="Director" value={form.director} onChange={(e) => set('director', e.target.value)} />
              <TextField label="Rows / categories" hint="e.g. trending, new-releases" value={form.categories} onChange={(e) => set('categories', e.target.value)} />
              <TextField label="Maturity rating" value={form.maturityRating} onChange={(e) => set('maturityRating', e.target.value)} />
              <TextField label="Runtime (minutes)" type="number" value={form.runtimeMinutes} onChange={(e) => set('runtimeMinutes', e.target.value)} hint="Sets the single-view window" />
            </div>
          </GlassPanel>

          <GlassPanel className="grid gap-4 p-5">
            <h2 className="font-semibold">Pricing</h2>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <TextField label="Price (per view)" type="number" value={form.priceMajor} onChange={(e) => set('priceMajor', e.target.value)} hint="Leave blank or 0 for free" />
              <TextField label="Currency" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
            </div>
          </GlassPanel>

          <GlassPanel className="grid gap-4 p-5">
            <h2 className="font-semibold">Media</h2>
            <UploadRow label="Video master" kind="video" accept="video/*" value={form.videoKey} uploading={uploading === 'video'} progress={progress?.kind === 'video' ? progress : null} onUpload={upload} onKey={(k) => set('videoKey', k)} />
            <UploadRow label="Poster" kind="poster" accept="image/*" value={form.posterKey} uploading={uploading === 'poster'} progress={progress?.kind === 'poster' ? progress : null} onUpload={upload} onKey={(k) => set('posterKey', k)} />
            <UploadRow label="Hero image" kind="hero" accept="image/*" value={form.heroKey} uploading={uploading === 'hero'} progress={progress?.kind === 'hero' ? progress : null} onUpload={upload} onKey={(k) => set('heroKey', k)} />
          </GlassPanel>

          <GlassPanel className="grid gap-4 p-5">
            <h2 className="font-semibold">Premiere & publishing</h2>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={form.isPremiere} onChange={(e) => set('isPremiere', e.target.checked)} />
              Schedule as a live premiere (enables live chat at showtime)
            </label>
            {form.isPremiere && (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                Premiere showtime
                <input
                  type="datetime-local"
                  className="glass rounded-glass px-4 py-3 text-[var(--text-primary)]"
                  value={form.premiereStartAt}
                  onChange={(e) => set('premiereStartAt', e.target.value)}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
              Status
              <select
                className="glass rounded-glass px-4 py-3 text-[var(--text-primary)]"
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'draft' | 'published')}
              >
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (on sale)</option>
              </select>
            </label>
          </GlassPanel>

          <div className="flex gap-3">
            <Button variant="primary" loading={saving} onClick={save}>{id ? 'Save changes' : 'Create movie'}</Button>
            <Button variant="ghost" onClick={() => router.push('/admin')}>Back to studio</Button>
          </div>
        </div>
      </main>
    </>
  );
}

function UploadRow({
  label, kind, accept, value, uploading, progress, onUpload, onKey,
}: {
  label: string;
  kind: 'video' | 'poster' | 'hero';
  accept: string;
  value: string;
  uploading: boolean;
  progress: UploadProgress | null;
  onUpload: (kind: 'video' | 'poster' | 'hero', file: File) => void;
  onKey: (key: string) => void;
}) {
  const done = progress?.pct === 100;
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={accept}
          disabled={uploading}
          className="text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white disabled:opacity-50"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(kind, f);
          }}
        />
        {uploading && !progress && <span className="text-xs text-[var(--text-secondary)]">Preparing…</span>}
      </div>

      {/* Upload progress */}
      {progress && (
        <div className="rounded-glass border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className={`font-semibold ${done ? 'text-emerald-400' : 'text-[#8082ff]'}`}>
              {done ? '✓ Upload complete' : `Uploading ${label.toLowerCase()}…`}
            </span>
            <span className="tabular-nums text-[var(--text-secondary)]">{progress.pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#090b12]">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#6c6ffc] to-[#4f46e5]'}`}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-[var(--text-secondary)]">
            <span>{formatBytes(progress.loaded)} / {formatBytes(progress.total)}</span>
            {!done && progress.bps > 0 && (
              <span>
                {formatBytes(progress.bps)}/s
                {progress.total > progress.loaded && ` · ${Math.max(1, Math.round((progress.total - progress.loaded) / progress.bps))}s left`}
              </span>
            )}
          </div>
        </div>
      )}

      <input
        className="glass rounded-glass px-3 py-2 text-xs text-[var(--text-primary)]"
        placeholder="object key (or paste an existing one)"
        value={value}
        onChange={(e) => onKey(e.target.value)}
      />
    </div>
  );
}

export default function MovieEditorPage() {
  return (
    <RequireAdmin>
      <Suspense fallback={null}>
        <Editor />
      </Suspense>
    </RequireAdmin>
  );
}
