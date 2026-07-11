'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BROWSE_ROWS, type AdminTitle } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import { ConfirmDialog } from '@/components/admin/ui';
import { api, ApiError } from '@/lib/api';

/* eslint-disable @next/next/no-img-element */
/**
 * Studio › Movie editor — indigo liquid-glass console. Metadata, pricing,
 * media (real progress uploads verified against storage before they can be
 * attached), premiere scheduling, publishing, and deletion.
 */

type MediaKind = 'video' | 'poster' | 'hero';

/** Accepted upload formats the presign/upload pipeline enforces. */
const ACCEPT: Record<MediaKind, { input: string; label: string; exts: string[]; mimes: string[] }> =
  {
    video: {
      input: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm',
      label: 'MP4, MOV or WEBM',
      exts: ['mp4', 'mov', 'webm'],
      mimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    },
    poster: {
      input: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
      label: 'JPG, PNG or WEBP',
      exts: ['jpg', 'jpeg', 'png', 'webp'],
      mimes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    hero: {
      input: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
      label: 'JPG, PNG or WEBP',
      exts: ['jpg', 'jpeg', 'png', 'webp'],
      mimes: ['image/jpeg', 'image/png', 'image/webp'],
    },
  };

/** Client-side format guard mirroring what the upload endpoint rejects. */
function rejectReason(kind: MediaKind, file: File): string | null {
  const spec = ACCEPT[kind];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeOk = !file.type || spec.mimes.includes(file.type);
  const extOk = spec.exts.includes(ext);
  if (!mimeOk && !extOk) {
    return `Unsupported ${kind === 'video' ? 'video' : 'image'} format — must be ${spec.label}.`;
  }
  return null;
}

interface FormState {
  title: string;
  type: 'movie' | 'series';
  year: string;
  tagline: string;
  overview: string;
  genres: string;
  cast: string;
  director: string;
  categories: string[];
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
  categories: [],
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

/**
 * Per-kind media verification state. `null` = an existing/attached key that is
 * trusted; anything else was touched this session and gates Save until it is
 * verified against storage.
 */
type MediaStatus =
  | { status: 'uploading' | 'verifying' }
  | { status: 'verified'; size: number }
  | { status: 'error'; message: string };

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [media, setMedia] = useState<Record<MediaKind, MediaStatus | null>>({
    video: null,
    poster: null,
    hero: null,
  });

  // Delete flow
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ soldTickets: number } | null>(null);

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
          categories: m.categories,
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
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Could not load this title.'));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleCategory = (slug: string) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(slug)
        ? f.categories.filter((c) => c !== slug)
        : [...f.categories, slug],
    }));

  const upload = async (kind: MediaKind, file: File) => {
    const reason = rejectReason(kind, file);
    if (reason) {
      setError(reason);
      return;
    }
    setUploading(kind);
    setError(null);
    setMedia((m) => ({ ...m, [kind]: { status: 'uploading' } }));
    const startedAt = Date.now();
    setProgress({ kind, pct: 0, loaded: 0, total: file.size, bps: 0 });
    const keyField = kind === 'video' ? 'videoKey' : kind === 'poster' ? 'posterKey' : 'heroKey';
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
      } else {
        setNotice(
          `Uploads aren’t configured in this environment — using key ${presigned.key} (upload the file to that key out-of-band).`,
        );
      }
      set(keyField as keyof FormState, presigned.key as never);

      // Verify the object actually landed in storage before we let it be
      // attached — a failed PUT must never persist a 404 key.
      setMedia((m) => ({ ...m, [kind]: { status: 'verifying' } }));
      const stat = await api.adminUploadStat(presigned.key);
      if (stat.exists && stat.size > 0) {
        setMedia((m) => ({ ...m, [kind]: { status: 'verified', size: stat.size } }));
        setNotice(
          `${kind === 'video' ? 'Video master' : kind[0].toUpperCase() + kind.slice(1)} verified (${formatBytes(stat.size)}). Save to attach it to the title.`,
        );
        if (kind !== 'video') {
          const url = URL.createObjectURL(file);
          setPreview((p) =>
            kind === 'poster' ? { ...p, posterUrl: url } : { ...p, heroUrl: url },
          );
        }
      } else {
        setMedia((m) => ({
          ...m,
          [kind]: {
            status: 'error',
            message: 'Upload could not be verified in storage — please try again.',
          },
        }));
        setError('Upload verification failed — the file did not land in storage. Please retry.');
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      setError(message);
      setProgress(null);
      setMedia((m) => ({ ...m, [kind]: { status: 'error', message } }));
    } finally {
      setUploading(null);
      setTimeout(() => setProgress((p) => (p?.pct === 100 ? null : p)), 1500);
    }
  };

  const mediaPending = (['video', 'poster', 'hero'] as MediaKind[]).some((k) => {
    const s = media[k];
    return s != null && s.status !== 'verified';
  });

  const save = async () => {
    // Premiere requires a showtime.
    if (form.isPremiere && !form.premiereStartAt) {
      setError('Set a premiere showtime before saving (or turn off “live premiere”).');
      return;
    }
    setSaving(true);
    setError(null);
    // Optional fields send `null` when emptied so the backend clears them.
    const body: Record<string, unknown> = {
      title: form.title,
      type: form.type,
      year: Number(form.year),
      tagline: form.tagline.trim() || null,
      overview: form.overview,
      genres: toList(form.genres),
      cast: toList(form.cast),
      director: form.director.trim() || null,
      categories: form.categories,
      maturityRating: form.maturityRating.trim() || null,
      runtimeMinutes: form.runtimeMinutes ? Number(form.runtimeMinutes) : null,
      priceMinor: form.priceMajor ? Math.round(Number(form.priceMajor) * 100) : 0,
      currency: form.currency,
      status: form.status,
      isPremiere: form.isPremiere,
      premiereStartAt:
        form.isPremiere && form.premiereStartAt
          ? new Date(form.premiereStartAt).toISOString()
          : null,
      videoKey: form.videoKey || null,
      posterKey: form.posterKey || null,
      heroKey: form.heroKey || null,
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
      setMedia({ video: null, poster: null, hero: null });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!id) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const r = await api.adminDeleteMovie(id);
      setDeleteResult({ soldTickets: r.soldTickets });
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Load error state (no infinite spinner) ──────────────────────────────
  if (loadError) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
          <span
            className="grid h-12 w-12 place-items-center rounded-full text-2xl"
            style={{ background: 'rgba(239,68,68,0.16)' }}
          >
            ⚠️
          </span>
          <div>
            <p className="font-readex text-lg font-semibold text-white">Couldn’t load this title</p>
            <p className="mt-1 text-sm text-white/55">{loadError}</p>
          </div>
          <Link
            href="/admin"
            className="lg-glass-indigo-35 grid h-11 place-items-center rounded-[12px] px-6 text-sm font-semibold text-white"
          >
            ← Back to Studio
          </Link>
        </div>
      </AppShell>
    );
  }

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

            {/* Browse rows / categories — checkboxes from the canonical list */}
            <div className="grid gap-2.5">
              <span className="text-[12.5px] font-semibold text-white/70">Browse rows</span>
              <div className="flex flex-wrap gap-2">
                {BROWSE_ROWS.map((row) => {
                  const on = form.categories.includes(row.slug);
                  return (
                    <button
                      key={row.slug}
                      type="button"
                      onClick={() => toggleCategory(row.slug)}
                      className={`lg-glass flex items-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-semibold transition ${
                        on ? 'text-white' : 'text-white/55 hover:text-white/80'
                      }`}
                      style={{
                        background: on ? 'rgba(99,102,241,0.28)' : 'rgba(214,214,214,0.06)',
                      }}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center rounded-[5px] border ${
                          on ? 'border-transparent bg-[#6c6ffc]' : 'border-white/30'
                        }`}
                      >
                        {on && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3.5"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {row.title}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-white/40">
                Choose which browse rows this title appears in.
              </p>
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
              value={form.videoKey}
              status={media.video}
              uploading={uploading === 'video'}
              progress={progress?.kind === 'video' ? progress : null}
              onUpload={upload}
            />
            <UploadRow
              label="Poster"
              kind="poster"
              value={form.posterKey}
              previewUrl={preview.posterUrl}
              status={media.poster}
              uploading={uploading === 'poster'}
              progress={progress?.kind === 'poster' ? progress : null}
              onUpload={upload}
            />
            <UploadRow
              label="Hero image"
              kind="hero"
              value={form.heroKey}
              previewUrl={preview.heroUrl}
              wide
              status={media.hero}
              uploading={uploading === 'hero'}
              progress={progress?.kind === 'hero' ? progress : null}
              onUpload={upload}
            />
          </Panel>

          <Panel title="Premiere & publishing">
            <label className="flex items-center gap-3 text-sm text-white/85">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#6c6ffc]"
                checked={form.isPremiere}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    isPremiere: e.target.checked,
                    // Clear the showtime when premiere is turned off.
                    premiereStartAt: e.target.checked ? f.premiereStartAt : '',
                  }))
                }
              />
              Schedule as a live premiere (enables live chat at showtime)
            </label>
            {form.isPremiere && (
              <label className={labelCls}>
                Premiere showtime (required)
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

          {mediaPending && (
            <p className="rounded-[12px] border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-amber-300">
              Finish or clear the pending upload — Save is disabled until every uploaded file is
              verified in storage.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving || mediaPending}
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
            {id && (
              <button
                onClick={() => {
                  setDeleteError(null);
                  setDeleteResult(null);
                  setDeleteOpen(true);
                }}
                className="ml-auto h-12 rounded-[12px] px-6 text-[14.5px] font-semibold text-red-300"
                style={{ background: 'rgba(239,68,68,0.14)' }}
              >
                Delete movie
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={deleteResult ? 'Movie deleted' : 'Delete this movie?'}
        body={
          deleteResult ? (
            <>
              The title has been permanently removed.{' '}
              {deleteResult.soldTickets > 0 ? (
                <span className="font-semibold text-white">
                  {deleteResult.soldTickets} ticket{deleteResult.soldTickets === 1 ? '' : 's'} had
                  been sold
                </span>
              ) : (
                'No tickets had been sold'
              )}
              .
            </>
          ) : (
            <>
              This permanently removes “{form.title || 'this title'}” and its media. This can’t be
              undone. Any tickets already sold will be reported after deletion.
            </>
          )
        }
        confirmLabel={deleteResult ? 'Back to Studio' : 'Delete'}
        danger={!deleteResult}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => {
          if (deleteResult) router.push('/admin');
          else doDelete();
        }}
        onCancel={() => {
          if (!deleteBusy && !deleteResult) setDeleteOpen(false);
        }}
      />
    </AppShell>
  );
}

function UploadRow({
  label,
  kind,
  value,
  previewUrl,
  wide,
  status,
  uploading,
  progress,
  onUpload,
}: {
  label: string;
  kind: MediaKind;
  value: string;
  previewUrl?: string | null;
  wide?: boolean;
  status: MediaStatus | null;
  uploading: boolean;
  progress: UploadProgress | null;
  onUpload: (kind: MediaKind, file: File) => void;
}) {
  const done = progress?.pct === 100;
  const spec = ACCEPT[kind];
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
            accept={spec.input}
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(kind, f);
              e.target.value = '';
            }}
          />
        </label>
        {status?.status === 'verified' && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-400">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            Verified {formatBytes(status.size)}
          </span>
        )}
        {status?.status === 'verifying' && (
          <span className="text-[12px] font-semibold text-[#8082ff]">Verifying…</span>
        )}
        {status?.status === 'error' && (
          <span className="max-w-[320px] text-[12px] font-semibold text-red-300">
            {status.message}
          </span>
        )}
        {!status && value && !progress && (
          <span className="max-w-[300px] truncate text-[11px] text-white/40">{value}</span>
        )}
      </div>

      <p className="text-[11px] text-white/40">Accepted: {spec.label}.</p>

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
