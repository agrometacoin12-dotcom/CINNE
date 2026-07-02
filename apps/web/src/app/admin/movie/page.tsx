'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AdminTitle } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import { api, ApiError } from '@/lib/api';

/* eslint-disable @next/next/no-img-element */
/**
 * Studio › Movie editor — indigo liquid-glass console. Metadata, pricing,
 * media (real progress uploads that work against S3 or the local media
 * driver, with poster/hero previews), premiere scheduling and publishing.
 */

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
  title: '',
  type: 'movie',
  year: String(new Date().getFullYear()),
  tagline: '',
  overview: '',
  genres: '',
  cast: '',
  director: '',
  categories: 'trending',
  maturityRating: '',
  runtimeMinutes: '',
  priceMajor: '',
  currency: 'NGN',
  status: 'draft',
  isPremiere: false,
  premiereStartAt: '',
  videoKey: '',
  posterKey: '',
  heroKey: '',
};

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

type UploadProgress = { kind: string; pct: number; loaded: number; total: number; bps: number };

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** PUT upload with real progress via XMLHttpRequest (fetch can't report upload progress). */
function xhrPut(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

const inputCls =
  'lg-input h-11 w-full rounded-[12px] px-4 text-[13.5px] text-white placeholder:text-white/40 outline-none';
const labelCls = 'flex flex-col gap-2 text-[12.5px] font-semibold text-white/70';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="lg-glass rounded-[18px] p-6"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <h2 className="mb-5 font-readex text-lg font-semibold text-white">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Editor() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [preview, setPreview] = useState<{ posterUrl: string | null; heroUrl: string | null }>({
    posterUrl: null,
    heroUrl: null,
  });
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
          title: m.title,
          type: m.type,
          year: String(m.year),
          tagline: m.tagline ?? '',
          overview: m.overview,
          genres: m.genres.join(', '),
          cast: m.cast.join(', '),
          director: m.director ?? '',
          categories: m.categories.join(', '),
          maturityRating: m.maturityRating ?? '',
          runtimeMinutes: m.runtimeMinutes ? String(m.runtimeMinutes) : '',
          priceMajor: m.priceMinor ? String(m.priceMinor / 100) : '',
          currency: m.currency,
          status: m.status,
          isPremiere: m.isPremiere,
          premiereStartAt: m.premiereStartAt ? m.premiereStartAt.slice(0, 16) : '',
          videoKey: m.videoKey ?? '',
          posterKey: m.posterKey ?? '',
          heroKey: m.heroKey ?? '',
        });
        setPreview({ posterUrl: m.posterUrl, heroUrl: m.heroUrl });
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load'));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const upload = async (kind: 'video' | 'poster' | 'hero', file: File) => {
    setUploading(kind);
    setError(null);
    const startedAt = Date.now();
    setProgress({ kind, pct: 0, loaded: 0, total: file.size, bps: 0 });
    try {
      const presigned = await api.adminPresign(
        kind,
        file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      );
      if (presigned.enabled && presigned.uploadUrl) {
        await xhrPut(presigned.uploadUrl, file, presigned.headers, (loaded, total) => {
          const secs = Math.max(0.001, (Date.now() - startedAt) / 1000);
          setProgress({
            kind,
            pct: total ? Math.round((loaded / total) * 100) : 0,
            loaded,
            total,
            bps: loaded / secs,
          });
        });
        setProgress({ kind, pct: 100, loaded: file.size, total: file.size, bps: 0 });
        setNotice(
          `${kind === 'video' ? 'Video master' : kind[0].toUpperCase() + kind.slice(1)} uploaded (${formatBytes(file.size)}). Save to attach it to the title.`,
        );
      } else {
        setNotice(
          `Uploads aren’t configured in this environment — using key ${presigned.key} (upload the file to that key out-of-band).`,
        );
      }
      const keyField = kind === 'video' ? 'videoKey' : kind === 'poster' ? 'posterKey' : 'heroKey';
      set(keyField as keyof FormState, presigned.key as never);
      // Local preview for images
      if (kind !== 'video') {
        const url = URL.createObjectURL(file);
        setPreview((p) => (kind === 'poster' ? { ...p, posterUrl: url } : { ...p, heroUrl: url }));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setProgress(null);
    } finally {
      setUploading(null);
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
      premiereStartAt:
        form.isPremiere && form.premiereStartAt
          ? new Date(form.premiereStartAt).toISOString()
          : undefined,
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
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl pb-12">
        <div className="flex items-end justify-between pt-2">
          <div>
            <h1 className="font-readex text-[28px] font-bold text-white">
              {id ? 'Edit movie' : 'New movie'}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Mobile-cinema title — pay once, watch once.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-[#6c6ffc]">
            ← Back to Studio
          </Link>
        </div>

        {error && (
          <p className="mt-4 rounded-[12px] border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-[12px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
            {notice}
          </p>
        )}

        <div className="mt-6 grid gap-5">
          <Panel title="Details">
            <label className={labelCls}>
              Title
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Type
                <select
                  className={`${inputCls} appearance-none`}
                  value={form.type}
                  onChange={(e) => set('type', e.target.value as 'movie' | 'series')}
                >
                  <option value="movie">Movie</option>
                  <option value="series">Series</option>
                </select>
              </label>
              <label className={labelCls}>
                Year
                <input
                  className={inputCls}
                  type="number"
                  value={form.year}
                  onChange={(e) => set('year', e.target.value)}
                />
              </label>
            </div>
            <label className={labelCls}>
              Tagline
              <input
                className={inputCls}
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </label>
            <label className={labelCls}>
              Overview
              <textarea
                className="lg-input w-full rounded-[12px] px-4 py-3 text-[13.5px] text-white outline-none"
                rows={4}
                value={form.overview}
                onChange={(e) => set('overview', e.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Genres (comma-separated)
                <input
                  className={inputCls}
                  value={form.genres}
                  onChange={(e) => set('genres', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Cast (comma-separated)
                <input
                  className={inputCls}
                  value={form.cast}
                  onChange={(e) => set('cast', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Director
                <input
                  className={inputCls}
                  value={form.director}
                  onChange={(e) => set('director', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Rows / categories
                <input
                  className={inputCls}
                  placeholder="e.g. trending, new-releases"
                  value={form.categories}
                  onChange={(e) => set('categories', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Maturity rating
                <input
                  className={inputCls}
                  value={form.maturityRating}
                  onChange={(e) => set('maturityRating', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Runtime (minutes)
                <input
                  className={inputCls}
                  type="number"
                  value={form.runtimeMinutes}
                  onChange={(e) => set('runtimeMinutes', e.target.value)}
                />
              </label>
            </div>
          </Panel>

          <Panel title="Pricing">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <label className={labelCls}>
                Price per view (0 or blank = free)
                <input
                  className={inputCls}
                  type="number"
                  value={form.priceMajor}
                  onChange={(e) => set('priceMajor', e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Currency
                <input
                  className={inputCls}
                  value={form.currency}
                  onChange={(e) => set('currency', e.target.value)}
                />
              </label>
            </div>
          </Panel>

          <Panel title="Media">
            <UploadRow
              label="Video master"
              kind="video"
              accept="video/*"
              value={form.videoKey}
              uploading={uploading === 'video'}
              progress={progress?.kind === 'video' ? progress : null}
              onUpload={upload}
              onKey={(k) => set('videoKey', k)}
            />
            <UploadRow
              label="Poster"
              kind="poster"
              accept="image/*"
              value={form.posterKey}
              previewUrl={preview.posterUrl}
              uploading={uploading === 'poster'}
              progress={progress?.kind === 'poster' ? progress : null}
              onUpload={upload}
              onKey={(k) => set('posterKey', k)}
            />
            <UploadRow
              label="Hero image"
              kind="hero"
              accept="image/*"
              value={form.heroKey}
              previewUrl={preview.heroUrl}
              wide
              uploading={uploading === 'hero'}
              progress={progress?.kind === 'hero' ? progress : null}
              onUpload={upload}
              onKey={(k) => set('heroKey', k)}
            />
          </Panel>

          <Panel title="Premiere & publishing">
            <label className="flex items-center gap-3 text-sm text-white/85">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#6c6ffc]"
                checked={form.isPremiere}
                onChange={(e) => set('isPremiere', e.target.checked)}
              />
              Schedule as a live premiere (enables live chat at showtime)
            </label>
            {form.isPremiere && (
              <label className={labelCls}>
                Premiere showtime
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.premiereStartAt}
                  onChange={(e) => set('premiereStartAt', e.target.value)}
                />
              </label>
            )}
            <label className={labelCls}>
              Status
              <select
                className={`${inputCls} appearance-none`}
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'draft' | 'published')}
              >
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (on sale)</option>
              </select>
            </label>
          </Panel>

          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="lg-glass-indigo-35 h-12 rounded-[12px] px-8 text-[14.5px] font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : id ? 'Save changes' : 'Create movie'}
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="lg-glass h-12 rounded-[12px] px-6 text-[14.5px] font-semibold text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function UploadRow({
  label,
  kind,
  accept,
  value,
  previewUrl,
  wide,
  uploading,
  progress,
  onUpload,
  onKey,
}: {
  label: string;
  kind: 'video' | 'poster' | 'hero';
  accept: string;
  value: string;
  previewUrl?: string | null;
  wide?: boolean;
  uploading: boolean;
  progress: UploadProgress | null;
  onUpload: (kind: 'video' | 'poster' | 'hero', file: File) => void;
  onKey: (key: string) => void;
}) {
  const done = progress?.pct === 100;
  return (
    <div className="grid gap-2.5">
      <span className="text-[12.5px] font-semibold text-white/70">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            className={`${wide ? 'h-14 w-24' : 'h-16 w-11'} rounded-[8px] border border-white/15 object-cover`}
          />
        )}
        <label
          className={`lg-glass grid h-10 cursor-pointer place-items-center rounded-[10px] px-5 text-[12.5px] font-semibold text-white ${uploading ? 'opacity-50' : ''}`}
          style={{ background: 'rgba(99,102,241,0.22)' }}
        >
          {uploading ? 'Uploading…' : value ? 'Replace file' : 'Choose file'}
          <input
            type="file"
            accept={accept}
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(kind, f);
              e.target.value = '';
            }}
          />
        </label>
        {value && !progress && (
          <span className="max-w-[300px] truncate text-[11px] text-white/40">{value}</span>
        )}
      </div>

      {progress && (
        <div
          className="lg-glass rounded-[12px] p-3"
          style={{ background: 'rgba(214,214,214,0.05)' }}
        >
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className={`font-semibold ${done ? 'text-emerald-400' : 'text-[#8082ff]'}`}>
              {done ? '✓ Upload complete' : `Uploading ${label.toLowerCase()}…`}
            </span>
            <span className="tabular-nums text-white/55">{progress.pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#090b12]">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#6c6ffc] to-[#4f46e5]'}`}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-white/55">
            <span>
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </span>
            {!done && progress.bps > 0 && (
              <span>
                {formatBytes(progress.bps)}/s
                {progress.total > progress.loaded &&
                  ` · ${Math.max(1, Math.round((progress.total - progress.loaded) / progress.bps))}s left`}
              </span>
            )}
          </div>
        </div>
      )}
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
