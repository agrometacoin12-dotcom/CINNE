import { VideoEnhancement } from '../components/VideoEnhancement';
import { ClassificationPanel } from '../components/ClassificationPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import type { ProducerInfo, ProducerIdentity } from '../lib/api-client';
const PAGE = 20;
type AssetKind = 'poster' | 'hero' | 'video' | 'trailer';

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
    setEditing(previous => previous && ((previous === 'new' && wasNew) || (previous !== 'new' && previous.id === saved.id)) ? saved : previous);
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
  // Legacy genres are only sent when edited here, so a movie save never
  // overwrites what the Classification panel stored.
  const genresBaseline = useRef(draftFrom(movie).genres);
  const [busy, setBusy] = useState(false);
  const savedId = useRef(movie?.id);
  const [files, setFiles] = useState<Partial<Record<AssetKind, File>>>({});
  const [art, setArt] = useState<{poster?: string; hero?: string}>({});
  const [producer, setProducer] = useState({ name: '', email: '', share: '90' });
  const [assigned, setAssigned] = useState<ProducerInfo | null>(null);
  const [producerReady, setProducerReady] = useState(!movie);
  const [producerError, setProducerError] = useState('');
  const [producerMessage, setProducerMessage] = useState('');
  const [selectedProducer, setSelectedProducer] = useState<ProducerIdentity | null>(null);
  const [newProducerEmail, setNewProducerEmail] = useState<string | null>(null);
  const [findingProducer, setFindingProducer] = useState(false);
  const lookupSequence = useRef(0);
  useEffect(() => {
    if (!movie?.id || savedId.current === movie.id && producerReady) return;
    let alive = true;
    client.getProducer(movie.id).then(({producer: p}) => {
      if (!alive) return;
      setAssigned(p);
      if (p) setProducer({name: p.name ?? '', email: p.email, share: String(p.revenueShareBps / 100)});
      setProducerReady(true);
    }).catch((e: Error) => { if (alive) setProducerError(e.message); });
    return () => { alive = false; };
  }, [client, movie?.id, producerReady]);
  useEffect(() => {
    const urls = { poster: files.poster ? URL.createObjectURL(files.poster) : undefined, hero: files.hero ? URL.createObjectURL(files.hero) : undefined };
    setArt(urls);
    return () => Object.values(urls).forEach(url => { if (url) URL.revokeObjectURL(url); });
  }, [files.poster, files.hero]);
  const selectFile = (kind: AssetKind, file: File) => setFiles(previous => ({...previous, [kind]: file}));

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
    const email = producer.email.trim().toLowerCase();
    const share = Number(producer.share);
    if ((email || producer.name.trim()) && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !producer.share.trim() || !Number.isFinite(share) || share < 0 || share > 100 || Math.abs(share * 100 - Math.round(share * 100)) > 0.000001)) {
      toast('Enter a valid producer email and a share between 0 and 100% (up to 2 decimals)', 'error'); return null;
    }
    if (email && email !== assigned?.email && selectedProducer?.email !== email && newProducerEmail !== email) { toast('Look up the producer email before saving.', 'error'); return null; }
    if (newProducerEmail === email && !producer.name.trim()) { toast('Enter a name for the new producer.', 'error'); return null; }
    if (!producerReady) { toast('Wait for producer details before saving.', 'error'); return null; }
    if (assigned && !email) { toast('Producer email cannot be cleared here', 'error'); return null; }
    setBusy(true);
    try {
      const wasNew = !savedId.current;
      if (!wasNew && draft.genres.trim() === genresBaseline.current.trim()) delete body.genres;
      const saved = wasNew
        ? await client.createMovie({ ...body, type: 'movie', ...extra })
        : await client.updateMovie(savedId.current!, { ...body, ...extra });
      savedId.current = saved.id;
      genresBaseline.current = draft.genres;
      onSaved(saved, wasNew);
      if (producerReady && email && (!assigned || assigned.email !== email || (assigned.name ?? '') !== producer.name.trim() || assigned.revenueShareBps !== Math.round(share * 100))) {
        try {
          const p = await client.assignProducer(saved.id, { producerId: selectedProducer?.id, email, name: producer.name.trim(), revenueShareBps: Math.round(share * 100) });
          setAssigned(p);
          setProducerError(p.dashboardEmailSent === false ? 'Producer assignment saved, but the dashboard email could not be sent. Retry the dashboard link after email service is restored.' : '');
          setProducerMessage(p.dashboardEmailSent === false ? `Producer saved: ${p.name ?? p.email} · ${p.revenueShareBps / 100}% share` : `Dashboard link sent to ${p.email}`);
        } catch (e) { setProducerError(`Movie saved. Producer assignment or email failed: ${e instanceof Error ? e.message : 'Please retry saving'}`); return null; }
      }
      for (const [kind, file] of Object.entries(files).filter(([, file]) => !!file) as [AssetKind, File][]) {
        uploads.enqueue({ file, kind, label: `${saved.title} — ${kind}`, onAttached: async key => {
          await client.updateMovie(saved.id, { [`${kind}Key`]: key });
          onSaved(await client.getMovie(saved.id), false);
          // Uploads may finish after the editor closes; never reopen it from a callback.
          toast(`${saved.title}: ${kind} uploaded and attached`);
        }});
      }
      setFiles({});
      return saved;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const closeEditor = () => { if (!busy && (!Object.values(files).some(Boolean) || window.confirm('Discard selected files?'))) onClose(); };

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
      wide
      title={isNew ? 'New movie' : `Edit — ${movie.title}`}
      onClose={closeEditor}
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
          <button className="btn btn-ghost" onClick={closeEditor} disabled={busy}>
            Close
          </button>
          {!isNew ? (
            <button className="btn btn-ghost" onClick={() => void togglePublish()} disabled={busy || (movie.status !== 'published' && (!movie.hasVideo || Object.values(files).some(Boolean)))}>
              {movie.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : Object.values(files).filter(Boolean).length ? 'Save & upload files' : 'Save movie & producer'}
          </button>
        </>
      }
    >
      <div className="movie-workspace"><fieldset disabled={busy} className="movie-form producer-fields">
      <div className="editor-intro"><span className="pill info">MOVIE STUDIO</span><h2>Bring your story to the screen.</h2><p>Enter the details, choose your files and assign the producer. Save once to start uploading.</p></div>
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

      <div className="section-title">01 · Movie details</div>
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
          <label>Legacy genres (comma-separated)</label>
          <input
            className="input"
            value={draft.genres}
            onChange={(e) => set('genres', e.target.value)}
          />
          <div className="hint">
            Kept for older apps. Use Classification below for genres, tags and homepage rows; saving
            it updates this field.
          </div>
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

      <div className="section-title">02 · Upload files</div>
      <p className="hint">Select files now; Save & upload starts them in the background. Large videos use parallel parts with automatic retries.</p>
      <div className="asset-grid">{(['poster', 'hero', 'video', 'trailer'] as AssetKind[]).map(kind => (
        <div className="asset-card" key={kind}>
          <strong>{({poster: 'Poster artwork', hero: 'Wide backdrop', video: 'Full movie', trailer: 'Public trailer'})[kind]}</strong>
          <p className="hint">{({poster: 'Portrait · recommended 2:3', hero: 'Landscape · recommended 16:9', video: 'Your full-length movie file', trailer: 'Optional · anyone can watch'})[kind]}</p>
          {(kind === 'poster' || kind === 'hero') && (art[kind] || movie?.[`${kind}Url`]) && <img className="asset-thumbnail" src={art[kind] || movie?.[`${kind}Url`] || ''} alt={`${kind} preview`} />}
          <FileButton accept={kind === 'poster' || kind === 'hero' ? 'image/*' : 'video/*'} label={files[kind] ? 'Change file' : 'Choose file'} onFile={f => selectFile(kind, f)} />
          <div className="asset-filename">{files[kind] ? `${files[kind]!.name} · ${(files[kind]!.size / 1024 / 1024).toFixed(1)} MB` : movie?.[`${kind}Key` as keyof AdminTitle] ? 'Already uploaded' : 'No file selected'}</div>
          {files[kind] && <button className="btn btn-ghost btn-sm" onClick={() => setFiles(previous => ({...previous, [kind]: undefined}))}>Remove selection</button>}
        </div>
      ))}</div>
      <VideoEnhancement onFile={file => selectFile('video', file)} />
      <div className="section-title">03 · Producer & earnings</div>
      <p className="hint">Producer registration: https://www.cinnetemple.com/producer/register/</p>
      <button type="button" className="btn btn-secondary" onClick={async () => {
        try { await navigator.clipboard.writeText('https://www.cinnetemple.com/producer/register/'); toast('Producer registration link copied'); }
        catch { toast('Copy the registration address shown above.', 'error'); }
      }}>Copy registration link</button>
      {producerError && <div role="alert" className="producer-error">{producerError}</div>}
      {producerMessage && <p role="status" className="producer-success">{producerMessage}</p>}
      {!producerReady && <p className="hint">Producer details unavailable or still loading. Reopen this movie to retry.</p>}
      <fieldset disabled={busy || !producerReady} className="producer-fields">
        <div className="field"><label htmlFor="producer-name">Producer name</label><input id="producer-name" className="input" maxLength={120} value={producer.name} onChange={e => setProducer({...producer, name: e.target.value})} /></div>
        <div className="field-row"><div className="field"><label htmlFor="producer-email">Producer email</label><input id="producer-email" type="email" className="input" value={producer.email} onChange={e => { lookupSequence.current++; setSelectedProducer(null); setNewProducerEmail(null); setProducerMessage(''); setProducer({...producer, email: e.target.value}); }} /></div>
        <div className="field"><label htmlFor="producer-share">Revenue share (%)</label><input id="producer-share" type="number" min="0" max="100" step="0.01" className="input" value={producer.share} onChange={e => setProducer({...producer, share: e.target.value})} /></div></div>
        <button type="button" className="btn btn-secondary" disabled={findingProducer || !producer.email.trim()} onClick={async () => {
          const sequence = ++lookupSequence.current;
          setFindingProducer(true); setProducerError(''); setNewProducerEmail(null); setSelectedProducer(null); setProducerMessage('');
          try {
            const result = await client.lookupProducer(producer.email.trim().toLowerCase());
            if (sequence !== lookupSequence.current) return;
            setSelectedProducer(result.producer);
            if (!result.producer) {
              setNewProducerEmail(producer.email.trim().toLowerCase());
              setProducerMessage('New producer: enter their name and revenue share. Save movie & producer will create their record, assign this movie, and email their private dashboard link.');
              return;
            }
            setProducer(current => ({...current, email: result.producer!.email, name: result.producer!.name ?? ''}));
            setProducerMessage(`Selected producer: ${result.producer.name ?? result.producer.email} (${result.producer.email})`);
          } catch (e) { if (sequence === lookupSequence.current) { setSelectedProducer(null); setProducerError(e instanceof Error ? e.message : 'Producer search failed'); } }
          finally { setFindingProducer(false); }
        }}>{findingProducer ? 'Finding…' : 'Look up producer email'}</button>
        <p className="hint">Share of net ticket revenue. Saving new or changed producer details emails their private dashboard link. A new link replaces their previous link. Leave name and email empty to assign later.</p>
        {assigned && <button className="btn btn-ghost" onClick={async () => {
          if (!savedId.current) return;
          setBusy(true);
          try { const p = await client.resendProducer(savedId.current); setAssigned(p); setProducerError(''); setProducerMessage(`Fresh dashboard link sent to ${p.email}`); }
          catch (e) { setProducerError(e instanceof Error ? e.message : 'Email failed'); }
          finally { setBusy(false); }
        }}>Resend dashboard link to {assigned.email}</button>}
      </fieldset>
      <div className="section-title">04 · Classification & homepage</div>
      {movie ? (
        <ClassificationPanel
          key={movie.id}
          titleId={movie.id}
          type="movie"
          priceMinor={movie.priceMinor}
          onSaved={(_dto, legacyGenres) => {
            const names = legacyGenres.join(', ');
            genresBaseline.current = names;
            set('genres', names);
          }}
        />
      ) : (
        <p className="hint">Save the movie first, then classify it here: genres, tags, industries, collections and homepage placement.</p>
      )}
      </fieldset><aside className="preview-column"><div className="section-title">Mobile preview</div><p className="hint">Updates as you edit · approximate layout</p>
        <div className="phone-preview"><div className="phone-brand">CINNETEMPLE</div>
          <div className="phone-art">{art.hero || movie?.heroUrl || art.poster || movie?.posterUrl ? <img src={art.hero || movie?.heroUrl || art.poster || movie?.posterUrl || ''} alt="Movie preview artwork" /> : <span>Your movie artwork</span>}</div>
          <div className="phone-copy"><h2>{draft.title || 'Your movie title'}</h2><p>{draft.tagline || 'Your tagline appears here'}</p><div className="phone-meta">{draft.year} · {draft.runtimeMinutes || '—'} min · {draft.maturityRating || 'Unrated'}</div><div className="phone-ticket">Get ticket · ₦{draft.priceNaira || '0'}</div><p>{draft.overview || 'Tell viewers what makes this story worth watching. Your synopsis will appear here.'}</p><div className="phone-meta">{draft.genres || 'Genres'}{draft.director && <p>Director · {draft.director}</p>}</div></div>
        </div><p className="hint">Saved movies stay in draft until you publish. Check upload completion in the upload tray before publishing.</p>
      </aside></div>

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
