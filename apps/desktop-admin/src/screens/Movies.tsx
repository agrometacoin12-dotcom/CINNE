import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminTitle, TitleUpsert } from '../lib/types';
import { formatMoney, parseNairaToMinor } from '../lib/format';
import {
  ConfirmModal,
  Drawer,
  EmptyState,
  ErrorState,
  FileButton,
  PosterThumb,
  StatusPill,
  TableSkeleton,
} from '../components/ui';

const PAGE = 20;

export function MoviesScreen() {
  const { client, toast } = useStudio();
  const [all, setAll] = useState<AdminTitle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const [editing, setEditing] = useState<AdminTitle | 'new' | null>(null);

  const load = useCallback(() => {
    setError(null);
    setAll(null);
    client
      .listMovies()
      .then(setAll)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client]);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!all) return null;
    const movies = all.filter((t) => t.type === 'movie');
    if (!query.trim()) return movies;
    const q = query.trim().toLowerCase();
    return movies.filter((m) => m.title.toLowerCase().includes(q) || String(m.year).includes(q));
  }, [all, query]);

  const page = filtered?.slice(skip, skip + PAGE) ?? null;

  const onSaved = (saved: AdminTitle, wasNew: boolean) => {
    setAll((prev) => {
      if (!prev) return prev;
      return wasNew ? [saved, ...prev] : prev.map((m) => (m.id === saved.id ? saved : m));
    });
    setEditing(saved);
    toast(wasNew ? 'Movie created' : 'Movie saved');
  };

  return (
    <div>
      <div className="toolbar">
        <input
          className="input search"
          placeholder="Search movies…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSkip(0);
          }}
        />
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + New movie
        </button>
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : page === null ? (
          <TableSkeleton rows={8} cols={6} />
        ) : page.length === 0 ? (
          <EmptyState
            title={query ? 'No movies match your search' : 'No movies yet'}
            body={query ? undefined : 'Create your first movie to start selling tickets.'}
            action={
              !query ? (
                <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
                  + New movie
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th></th>
                    <th>Title</th>
                    <th>Year</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((m) => (
                    <tr key={m.id} onClick={() => setEditing(m)}>
                      <td style={{ width: 52 }}>
                        <PosterThumb url={m.posterUrl} title={m.title} />
                      </td>
                      <td>
                        <strong>{m.title}</strong>
                        {m.tagline ? <div className="muted">{m.tagline}</div> : null}
                      </td>
                      <td>{m.year}</td>
                      <td>
                        <StatusPill status={m.status} />
                      </td>
                      <td>{formatMoney(m.priceMinor, m.currency)}</td>
                      <td>
                        {m.featured ? (
                          <span className="star" title="Featured">
                            ★
                          </span>
                        ) : null}{' '}
                        {m.isPremiere ? <span className="pill info">Premiere</span> : null}{' '}
                        {!m.hasVideo ? <span className="chip missing">no video</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered && filtered.length > PAGE ? (
              <div className="pager">
                <span>
                  {skip + 1}–{Math.min(skip + PAGE, filtered.length)} of {filtered.length}
                </span>
                <div className="btns">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={skip === 0}
                    onClick={() => setSkip(Math.max(0, skip - PAGE))}
                  >
                    ← Prev
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={skip + PAGE >= filtered.length}
                    onClick={() => setSkip(skip + PAGE)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <MovieEditor
          movie={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={(id) => {
            setAll((prev) => prev?.filter((m) => m.id !== id) ?? prev);
            setEditing(null);
            toast('Movie deleted');
          }}
        />
      ) : null}
    </div>
  );
}

// ── Editor drawer ────────────────────────────────────────────────────────────

interface Draft {
  title: string;
  tagline: string;
  overview: string;
  year: string;
  genres: string;
  cast: string;
  director: string;
  maturityRating: string;
  runtimeMinutes: string;
  priceNaira: string;
}

function draftFrom(m: AdminTitle | null): Draft {
  return {
    title: m?.title ?? '',
    tagline: m?.tagline ?? '',
    overview: m?.overview ?? '',
    year: String(m?.year ?? new Date().getFullYear()),
    genres: m?.genres.join(', ') ?? '',
    cast: m?.cast.join(', ') ?? '',
    director: m?.director ?? '',
    maturityRating: m?.maturityRating ?? '',
    runtimeMinutes: m?.runtimeMinutes != null ? String(m.runtimeMinutes) : '',
    priceNaira: m ? String(m.priceMinor / 100) : '',
  };
}

function draftToBody(d: Draft): TitleUpsert | string {
  if (!d.title.trim()) return 'Title is required';
  if (!d.overview.trim()) return 'Overview is required';
  const year = Number(d.year);
  if (!Number.isInteger(year) || year < 1900) return 'Enter a valid year';
  const priceMinor = parseNairaToMinor(d.priceNaira);
  if (priceMinor === null) return 'Enter a valid price in ₦';
  const runtime = d.runtimeMinutes.trim() === '' ? undefined : Number(d.runtimeMinutes);
  if (runtime !== undefined && (!Number.isInteger(runtime) || runtime <= 0))
    return 'Runtime must be a whole number of minutes';
  const list = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    title: d.title.trim(),
    tagline: d.tagline.trim() === '' ? null : d.tagline.trim(),
    overview: d.overview.trim(),
    year,
    genres: list(d.genres),
    cast: list(d.cast),
    director: d.director.trim() === '' ? null : d.director.trim(),
    maturityRating: d.maturityRating === '' ? null : d.maturityRating,
    ...(runtime !== undefined ? { runtimeMinutes: runtime } : {}),
    priceMinor,
    currency: 'NGN',
  };
}

export function MovieEditor({
  movie,
  onClose,
  onSaved,
  onDeleted,
}: {
  movie: AdminTitle | null;
  onClose: () => void;
  onSaved: (saved: AdminTitle, wasNew: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const { client, uploads, toast } = useStudio();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(movie));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [premiereOpen, setPremiereOpen] = useState(false);
  const [premiereAt, setPremiereAt] = useState(
    movie?.premiereStartAt ? movie.premiereStartAt.slice(0, 16) : '',
  );

  const isNew = movie === null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (extra?: TitleUpsert): Promise<AdminTitle | null> => {
    const body = draftToBody(draft);
    if (typeof body === 'string') {
      toast(body, 'error');
      return null;
    }
    setBusy(true);
    try {
      const saved = isNew
        ? await client.createMovie({ ...body, type: 'movie', ...extra })
        : await client.updateMovie(movie.id, { ...body, ...extra });
      onSaved(saved, isNew);
      return saved;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const attachKey = async (patch: TitleUpsert, label: string) => {
    if (!movie) return;
    try {
      const saved = await client.updateMovie(movie.id, patch);
      onSaved(saved, false);
      toast(`${label} attached`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Failed to attach ${label}`, 'error');
    }
  };

  const enqueueArtwork = (kind: 'poster' | 'hero', file: File) => {
    if (!movie) {
      toast('Save the movie first, then upload artwork', 'error');
      return;
    }
    uploads.enqueue({
      file,
      kind,
      label: `${movie.title} — ${kind}`,
      onAttached: (key) =>
        attachKey(kind === 'poster' ? { posterKey: key } : { heroKey: key }, kind),
    });
  };

  const enqueueVideo = (file: File) => {
    if (!movie) {
      toast('Save the movie first, then upload the video', 'error');
      return;
    }
    uploads.enqueue({
      file,
      kind: 'video',
      label: `${movie.title} — video`,
      onAttached: (key) => attachKey({ videoKey: key }, 'video'),
    });
  };

  const togglePublish = async () => {
    if (!movie) return;
    setBusy(true);
    try {
      const next = movie.status === 'published' ? 'draft' : 'published';
      const saved = await client.updateMovie(movie.id, { status: next });
      onSaved(saved, false);
      toast(next === 'published' ? 'Movie published' : 'Movie unpublished');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleFeatured = async () => {
    if (!movie) return;
    try {
      const saved = await client.setFeatured(movie.id, !movie.featured);
      onSaved(saved, false);
      toast(saved.featured ? 'Set as featured hero' : 'Removed from featured');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const savePremiere = async (enable: boolean) => {
    if (!movie) return;
    try {
      const iso = enable && premiereAt ? new Date(premiereAt).toISOString() : undefined;
      const saved = await client.setPremiere(movie.id, enable, iso);
      onSaved(saved, false);
      setPremiereOpen(false);
      toast(enable ? 'Premiere scheduled' : 'Premiere cancelled');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  return (
    <Drawer
      title={isNew ? 'New movie' : `Edit — ${movie.title}`}
      onClose={onClose}
      footer={
        <>
          {!isNew ? (
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Delete
            </button>
          ) : null}
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          {!isNew ? (
            <button className="btn btn-ghost" onClick={() => void togglePublish()} disabled={busy}>
              {movie.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create movie' : 'Save changes'}
          </button>
        </>
      }
    >
      {!isNew ? (
        <div className="row-flex spread" style={{ marginBottom: 18 }}>
          <div className="row-flex">
            <StatusPill status={movie.status} />
            {movie.featured ? <span className="pill info">★ Featured</span> : null}
            {movie.isPremiere ? <span className="pill info">Premiere</span> : null}
          </div>
          <div className="row-flex">
            <button className="btn btn-ghost btn-sm" onClick={() => void toggleFeatured()}>
              {movie.featured ? '★ Unfeature' : '☆ Feature'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPremiereOpen(true)}>
              Premiere…
            </button>
          </div>
        </div>
      ) : null}

      <div className="field">
        <label>Title</label>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>
      <div className="field">
        <label>Tagline</label>
        <input
          className="input"
          value={draft.tagline}
          onChange={(e) => set('tagline', e.target.value)}
        />
      </div>
      <div className="field">
        <label>Overview</label>
        <textarea
          className="textarea"
          value={draft.overview}
          onChange={(e) => set('overview', e.target.value)}
        />
      </div>
      <div className="field-row-3">
        <div className="field">
          <label>Year</label>
          <input
            className="input"
            value={draft.year}
            onChange={(e) => set('year', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Runtime (min)</label>
          <input
            className="input"
            value={draft.runtimeMinutes}
            onChange={(e) => set('runtimeMinutes', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Rating</label>
          <select
            className="select"
            value={draft.maturityRating}
            onChange={(e) => set('maturityRating', e.target.value)}
          >
            <option value="">—</option>
            {['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-14', 'TV-MA'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Ticket price (₦)</label>
        <input
          className="input"
          placeholder="e.g. 2,500"
          value={draft.priceNaira}
          onChange={(e) => set('priceNaira', e.target.value)}
        />
        <div className="hint">
          Stored in kobo:{' '}
          {parseNairaToMinor(draft.priceNaira) !== null
            ? `${parseNairaToMinor(draft.priceNaira)?.toLocaleString()} kobo`
            : '—'}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Genres (comma-separated)</label>
          <input
            className="input"
            value={draft.genres}
            onChange={(e) => set('genres', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Director</label>
          <input
            className="input"
            value={draft.director}
            onChange={(e) => set('director', e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Cast (comma-separated)</label>
        <input className="input" value={draft.cast} onChange={(e) => set('cast', e.target.value)} />
      </div>

      {!isNew ? (
        <>
          <div className="section-title">Artwork</div>
          <div className="artwork-grid">
            <div>
              <div className="artwork-box poster">
                {movie.posterUrl ? <img src={movie.posterUrl} alt="poster" /> : 'Poster'}
              </div>
              <div style={{ marginTop: 8 }}>
                <FileButton
                  accept="image/*"
                  label="Upload poster"
                  onFile={(f) => enqueueArtwork('poster', f)}
                />
              </div>
            </div>
            <div>
              <div className="artwork-box hero">
                {movie.heroUrl ? <img src={movie.heroUrl} alt="hero" /> : 'Hero backdrop'}
              </div>
              <div style={{ marginTop: 8 }}>
                <FileButton
                  accept="image/*"
                  label="Upload hero"
                  onFile={(f) => enqueueArtwork('hero', f)}
                />
              </div>
            </div>
          </div>

          <div className="section-title">Video</div>
          <div className="card card-pad row-flex spread">
            <div>
              {movie.hasVideo ? (
                <>
                  <span className="chip ok">Video uploaded</span>
                  <div className="hint mono" style={{ marginTop: 6 }}>
                    {movie.videoKey}
                  </div>
                </>
              ) : (
                <span className="chip missing">No video yet</span>
              )}
            </div>
            <FileButton
              accept="video/*"
              className="btn btn-primary btn-sm"
              label={movie.hasVideo ? 'Replace video' : 'Upload video'}
              onFile={enqueueVideo}
            />
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Uploads run in the background — watch the tray in the corner. Progress, speed and cancel
            are per file.
          </div>
        </>
      ) : (
        <div className="hint">Create the movie first to unlock artwork and video uploads.</div>
      )}

      {confirmDelete && movie ? (
        <ConfirmModal
          title="Delete this movie?"
          body={
            <>
              This permanently deletes <strong>{movie.title}</strong>, its artwork and video keys.
              Sold tickets are recorded in purchase history but the title disappears from the
              catalogue.
            </>
          }
          typedPhrase={movie.title}
          confirmLabel="Delete forever"
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setBusy(true);
            client
              .deleteMovie(movie.id)
              .then(() => onDeleted(movie.id))
              .catch((e: unknown) =>
                toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
              )
              .finally(() => setBusy(false));
          }}
        />
      ) : null}

      {premiereOpen && movie ? (
        <ConfirmModal
          title="Premiere scheduler"
          danger={false}
          body={
            <span>
              Premieres unlock live chat and a synchronized start.{' '}
              {movie.isPremiere ? 'Currently scheduled.' : 'Not currently scheduled.'}
              <span style={{ display: 'block', marginTop: 12 }}>
                <input
                  type="datetime-local"
                  className="input"
                  style={{ width: '100%' }}
                  value={premiereAt}
                  onChange={(e) => setPremiereAt(e.target.value)}
                />
              </span>
              {movie.isPremiere ? (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={() => void savePremiere(false)}
                >
                  Cancel premiere
                </button>
              ) : null}
            </span>
          }
          confirmLabel="Schedule premiere"
          onCancel={() => setPremiereOpen(false)}
          onConfirm={() => void savePremiere(true)}
        />
      ) : null}
    </Drawer>
  );
}
