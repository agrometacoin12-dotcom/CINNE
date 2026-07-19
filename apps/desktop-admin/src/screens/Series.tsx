import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type {
  AdminEpisode,
  AdminSeason,
  AdminSeriesDetail,
  AdminSeriesListResponse,
  TitleUpsert,
} from '../lib/types';
import { formatMoney, formatRuntime, parseNairaToMinor } from '../lib/format';
import {
  ConfirmModal,
  Drawer,
  EmptyState,
  ErrorState,
  FileButton,
  Modal,
  Pager,
  PosterThumb,
  StatusPill,
  TableSkeleton,
} from '../components/ui';

const PAGE = 20;

export function SeriesScreen() {
  const { client, toast, route, navigate } = useStudio();
  const [data, setData] = useState<AdminSeriesListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const [creating, setCreating] = useState(false);

  const openId = route.screen === 'series' ? route.openId : undefined;

  const load = useCallback(() => {
    setError(null);
    setData(null);
    client
      .listSeries({ query: query.trim() || undefined, take: PAGE, skip })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client, query, skip]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="toolbar">
        <input
          className="input search"
          placeholder="Search series…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSkip(0);
          }}
        />
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New series
        </button>
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon="📺"
            title={query ? 'No series match your search' : 'No series yet'}
            body={
              query ? undefined : 'One ticket buys the whole series; each episode is watch-once.'
            }
            action={
              !query ? (
                <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                  + New series
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
                    <th>Seasons</th>
                    <th>Episodes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id} onClick={() => navigate({ screen: 'series', openId: s.id })}>
                      <td style={{ width: 52 }}>
                        <PosterThumb url={s.posterUrl} title={s.title} />
                      </td>
                      <td>
                        <strong>{s.title}</strong>
                        {s.featured ? (
                          <span className="star" style={{ marginLeft: 6 }}>
                            ★
                          </span>
                        ) : null}
                      </td>
                      <td>{s.year}</td>
                      <td>
                        <StatusPill status={s.status} />
                      </td>
                      <td>{formatMoney(s.priceMinor, s.currency)}</td>
                      <td>{s.seasonCount}</td>
                      <td>{s.episodeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={data.total} skip={skip} take={PAGE} onPage={setSkip} />
          </>
        )}
      </div>

      {creating ? (
        <CreateSeriesModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            toast('Series created');
            load();
            navigate({ screen: 'series', openId: id });
          }}
        />
      ) : null}

      {openId ? (
        <SeriesEditor
          seriesId={openId}
          onClose={() => {
            navigate({ screen: 'series' });
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateSeriesModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { client, toast } = useStudio();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [overview, setOverview] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const priceMinor = parseNairaToMinor(price);
    if (
      !title.trim() ||
      !overview.trim() ||
      priceMinor === null ||
      !Number.isInteger(Number(year))
    ) {
      toast('Fill in title, overview, year and a valid ₦ price', 'error');
      return;
    }
    setBusy(true);
    try {
      const created = await client.createSeries({
        title: title.trim(),
        overview: overview.trim(),
        year: Number(year),
        priceMinor,
        currency: 'NGN',
        type: 'series',
      });
      onCreated(created.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Create failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3>New series</h3>
      <div className="field">
        <label>Title</label>
        <input
          className="input"
          style={{ width: '100%' }}
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Year</label>
          <input className="input" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="field">
          <label>Series ticket (₦)</label>
          <input
            className="input"
            placeholder="5,000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Overview</label>
        <textarea
          className="textarea"
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
        />
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
          {busy ? 'Creating…' : 'Create series'}
        </button>
      </div>
    </Modal>
  );
}

// ── Series editor ────────────────────────────────────────────────────────────

export function SeriesEditor({ seriesId, onClose }: { seriesId: string; onClose: () => void }) {
  const { client, uploads, toast } = useStudio();
  const [series, setSeries] = useState<AdminSeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [episodeEdit, setEpisodeEdit] = useState<{
    seasonId: string;
    episode: AdminEpisode | null;
  } | null>(null);
  const [seasonEdit, setSeasonEdit] = useState<AdminSeason | 'new' | null>(null);
  const [deleteSeason, setDeleteSeason] = useState<AdminSeason | null>(null);
  const [deleteEpisode, setDeleteEpisode] = useState<AdminEpisode | null>(null);

  // metadata draft
  const [meta, setMeta] = useState({
    title: '',
    tagline: '',
    overview: '',
    year: '',
    genres: '',
    priceNaira: '',
  });

  const load = useCallback(() => {
    setError(null);
    client
      .getSeries(seriesId)
      .then((s) => {
        setSeries(s);
        setMeta({
          title: s.title,
          tagline: s.tagline ?? '',
          overview: s.overview,
          year: String(s.year),
          genres: s.genres.join(', '),
          priceNaira: String(s.priceMinor / 100),
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load series'));
  }, [client, seriesId]);

  useEffect(load, [load]);

  const episodesWithVideo = series
    ? series.seasonsList.reduce((a, se) => a + se.episodes.filter((e) => e.hasVideo).length, 0)
    : 0;
  const canPublish = episodesWithVideo > 0;

  const saveMeta = async (extra?: TitleUpsert) => {
    if (!series) return;
    const priceMinor = parseNairaToMinor(meta.priceNaira);
    if (!meta.title.trim() || !meta.overview.trim() || priceMinor === null) {
      toast('Title, overview and a valid ₦ price are required', 'error');
      return;
    }
    setBusy(true);
    try {
      const saved = await client.updateSeries(series.id, {
        title: meta.title.trim(),
        tagline: meta.tagline.trim() === '' ? null : meta.tagline.trim(),
        overview: meta.overview.trim(),
        year: Number(meta.year) || series.year,
        genres: meta.genres
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        priceMinor,
        currency: 'NGN',
        ...extra,
      });
      setSeries(saved);
      toast('Series saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async () => {
    if (!series) return;
    const next = series.status === 'published' ? 'draft' : 'published';
    if (next === 'published' && !canPublish) {
      toast('Publish needs at least one episode with a video', 'error');
      return;
    }
    setBusy(true);
    try {
      const saved = await client.updateSeries(series.id, { status: next });
      setSeries(saved);
      toast(next === 'published' ? 'Series published' : 'Series unpublished');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Publish failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const enqueueArtwork = (kind: 'poster' | 'hero', file: File) => {
    if (!series) return;
    uploads.enqueue({
      file,
      kind,
      label: `${series.title} — ${kind}`,
      onAttached: async (key) => {
        const saved = await client.updateSeries(
          series.id,
          kind === 'poster' ? { posterKey: key } : { heroKey: key },
        );
        setSeries(saved);
        toast(`${kind} attached`);
      },
    });
  };

  const enqueueEpisodeVideo = (ep: AdminEpisode, file: File) => {
    if (!series) return;
    uploads.enqueue({
      file,
      kind: 'video',
      label: `${series.title} — E${ep.number} ${ep.name}`,
      onAttached: async (key) => {
        await client.updateEpisode(ep.id, { videoKey: key });
        toast(`Video attached to E${ep.number} — ${ep.name}`);
        load();
      },
    });
  };

  return (
    <Drawer
      wide
      title={series ? `Series — ${series.title}` : 'Series'}
      onClose={onClose}
      footer={
        series ? (
          <>
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Delete series
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => void togglePublish()}
              disabled={busy || (series.status !== 'published' && !canPublish)}
            >
              {series.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
            <button className="btn btn-primary" onClick={() => void saveMeta()} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : series === null ? (
        <TableSkeleton rows={7} cols={4} />
      ) : (
        <>
          <div className="row-flex spread" style={{ marginBottom: 16 }}>
            <div className="row-flex">
              <StatusPill status={series.status} />
              <span className="pill neutral">
                {series.seasonsList.length} season{series.seasonsList.length === 1 ? '' : 's'}
              </span>
              <span className="pill neutral">
                {series.seasonsList.reduce((a, s) => a + s.episodes.length, 0)} episodes
              </span>
            </div>
          </div>

          {series.status !== 'published' && !canPublish ? (
            <div className="publish-gate">
              <span>⚠</span>
              <span>
                <strong>Not ready to publish.</strong> A series needs at least one episode with an
                uploaded video before it can go live. Viewers buy one ticket for the whole series;
                each episode is watchable exactly once.
              </span>
            </div>
          ) : null}

          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Tagline</label>
              <input
                className="input"
                value={meta.tagline}
                onChange={(e) => setMeta({ ...meta, tagline: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Year</label>
              <input
                className="input"
                value={meta.year}
                onChange={(e) => setMeta({ ...meta, year: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Overview</label>
            <textarea
              className="textarea"
              value={meta.overview}
              onChange={(e) => setMeta({ ...meta, overview: e.target.value })}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Genres (comma-separated)</label>
              <input
                className="input"
                value={meta.genres}
                onChange={(e) => setMeta({ ...meta, genres: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Series ticket (₦)</label>
              <input
                className="input"
                value={meta.priceNaira}
                onChange={(e) => setMeta({ ...meta, priceNaira: e.target.value })}
              />
              <div className="hint">One ticket unlocks every episode, each watch-once.</div>
            </div>
          </div>

          <div className="section-title">Artwork</div>
          <div className="artwork-grid">
            <div>
              <div className="artwork-box poster">
                {series.posterUrl ? <img src={series.posterUrl} alt="poster" /> : 'Poster'}
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
                {series.heroUrl ? <img src={series.heroUrl} alt="hero" /> : 'Hero backdrop'}
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

          <div className="row-flex spread" style={{ marginTop: 26, marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              Seasons & episodes
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSeasonEdit('new')}>
              + Add season
            </button>
          </div>

          {series.seasonsList.length === 0 ? (
            <EmptyState
              icon="🎞"
              title="No seasons yet"
              body="Add Season 1 to start attaching episodes."
            />
          ) : (
            series.seasonsList.map((season) => (
              <div className="card season-card" key={season.id}>
                <div className="season-head">
                  <div className="t">
                    Season {season.number}
                    {season.name ? <span className="muted"> — {season.name}</span> : null}
                  </div>
                  <div className="row-flex">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEpisodeEdit({ seasonId: season.id, episode: null })}
                    >
                      + Episode
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSeasonEdit(season)}>
                      Rename
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteSeason(season)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {season.episodes.length === 0 ? (
                  <div className="state-block" style={{ padding: '22px 16px' }}>
                    <p style={{ margin: 0 }}>No episodes in this season yet.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Name</th>
                          <th>Runtime</th>
                          <th>Video</th>
                          <th style={{ width: 260 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {season.episodes.map((ep) => (
                          <tr key={ep.id} className="static">
                            <td className="muted">E{ep.number}</td>
                            <td>
                              <strong>{ep.name}</strong>
                              {ep.overview ? (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {ep.overview}
                                </div>
                              ) : null}
                            </td>
                            <td className="muted">{formatRuntime(ep.runtimeMinutes)}</td>
                            <td>
                              {ep.hasVideo ? (
                                <span className="chip ok">uploaded</span>
                              ) : (
                                <span className="chip missing">missing</span>
                              )}
                            </td>
                            <td>
                              <div className="row-flex" style={{ justifyContent: 'flex-end' }}>
                                <FileButton
                                  accept="video/*"
                                  className="btn btn-ghost btn-sm"
                                  label={ep.hasVideo ? 'Replace video' : 'Upload video'}
                                  onFile={(f) => enqueueEpisodeVideo(ep, f)}
                                />
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() =>
                                    setEpisodeEdit({ seasonId: season.id, episode: ep })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => setDeleteEpisode(ep)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {seasonEdit && series ? (
        <SeasonModal
          season={seasonEdit === 'new' ? null : seasonEdit}
          nextNumber={series.seasonsList.reduce((m, s) => Math.max(m, s.number), 0) + 1}
          onClose={() => setSeasonEdit(null)}
          onSave={async (number, name) => {
            try {
              if (seasonEdit === 'new') {
                await client.createSeason(series.id, { number, name: name || null });
                toast('Season added');
              } else {
                await client.updateSeason(seasonEdit.id, { number, name: name || null });
                toast('Season updated');
              }
              setSeasonEdit(null);
              load();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Season save failed', 'error');
            }
          }}
        />
      ) : null}

      {episodeEdit && series ? (
        <EpisodeModal
          episode={episodeEdit.episode}
          nextNumber={
            (series.seasonsList
              .find((s) => s.id === episodeEdit.seasonId)
              ?.episodes.reduce((m, e) => Math.max(m, e.number), 0) ?? 0) + 1
          }
          onClose={() => setEpisodeEdit(null)}
          onSave={async (body) => {
            try {
              if (episodeEdit.episode) {
                await client.updateEpisode(episodeEdit.episode.id, body);
                toast('Episode updated');
              } else {
                await client.createEpisode(
                  episodeEdit.seasonId,
                  body as { number: number; name: string },
                );
                toast('Episode added');
              }
              setEpisodeEdit(null);
              load();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Episode save failed', 'error');
            }
          }}
        />
      ) : null}

      {deleteSeason && series ? (
        <ConfirmModal
          title={`Delete Season ${deleteSeason.number}?`}
          body={`This removes the season and its ${deleteSeason.episodes.length} episode(s), including their video keys.`}
          typedPhrase={`season ${deleteSeason.number}`}
          confirmLabel="Delete season"
          onCancel={() => setDeleteSeason(null)}
          onConfirm={() => {
            client
              .deleteSeason(deleteSeason.id)
              .then(() => {
                toast('Season deleted');
                setDeleteSeason(null);
                load();
              })
              .catch((e: unknown) =>
                toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
              );
          }}
        />
      ) : null}

      {deleteEpisode ? (
        <ConfirmModal
          title={`Delete E${deleteEpisode.number} — ${deleteEpisode.name}?`}
          body="Viewers who already consumed this episode keep their history; the episode disappears from the series."
          confirmLabel="Delete episode"
          onCancel={() => setDeleteEpisode(null)}
          onConfirm={() => {
            client
              .deleteEpisode(deleteEpisode.id)
              .then(() => {
                toast('Episode deleted');
                setDeleteEpisode(null);
                load();
              })
              .catch((e: unknown) =>
                toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
              );
          }}
        />
      ) : null}

      {confirmDelete && series ? (
        <ConfirmModal
          title="Delete this series?"
          body={
            <>
              Permanently deletes <strong>{series.title}</strong> with every season and episode.
            </>
          }
          typedPhrase={series.title}
          confirmLabel="Delete forever"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            client
              .deleteSeries(series.id)
              .then(() => {
                toast('Series deleted');
                onClose();
              })
              .catch((e: unknown) =>
                toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
              );
          }}
        />
      ) : null}
    </Drawer>
  );
}

function SeasonModal({
  season,
  nextNumber,
  onClose,
  onSave,
}: {
  season: AdminSeason | null;
  nextNumber: number;
  onClose: () => void;
  onSave: (number: number, name: string) => Promise<void>;
}) {
  const [number, setNumber] = useState(String(season?.number ?? nextNumber));
  const [name, setName] = useState(season?.name ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose}>
      <h3>{season ? `Edit Season ${season.number}` : 'Add season'}</h3>
      <div className="field-row">
        <div className="field">
          <label>Number</label>
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="field">
          <label>Name (optional)</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Campaign"
          />
        </div>
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !Number.isInteger(Number(number)) || Number(number) < 1}
          onClick={() => {
            setBusy(true);
            void onSave(Number(number), name.trim()).finally(() => setBusy(false));
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function EpisodeModal({
  episode,
  nextNumber,
  onClose,
  onSave,
}: {
  episode: AdminEpisode | null;
  nextNumber: number;
  onClose: () => void;
  onSave: (body: {
    number: number;
    name: string;
    overview?: string | null;
    runtimeMinutes?: number | null;
  }) => Promise<void>;
}) {
  const [number, setNumber] = useState(String(episode?.number ?? nextNumber));
  const [name, setName] = useState(episode?.name ?? '');
  const [overview, setOverview] = useState(episode?.overview ?? '');
  const [runtime, setRuntime] = useState(
    episode?.runtimeMinutes != null ? String(episode.runtimeMinutes) : '',
  );
  const [busy, setBusy] = useState(false);

  return (
    <Modal onClose={onClose}>
      <h3>{episode ? `Edit E${episode.number}` : 'Add episode'}</h3>
      <div className="field-row">
        <div className="field">
          <label>Number</label>
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="field">
          <label>Runtime (min)</label>
          <input className="input" value={runtime} onChange={(e) => setRuntime(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          style={{ width: '100%' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!episode}
        />
      </div>
      <div className="field">
        <label>Overview</label>
        <textarea
          className="textarea"
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
        />
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !name.trim() || !Number.isInteger(Number(number)) || Number(number) < 1}
          onClick={() => {
            setBusy(true);
            void onSave({
              number: Number(number),
              name: name.trim(),
              overview: overview.trim() === '' ? null : overview.trim(),
              runtimeMinutes: runtime.trim() === '' ? null : Number(runtime),
            }).finally(() => setBusy(false));
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
