import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '../lib/app-context';
import {
  TAG_KIND_LABELS,
  diffClassification,
  draftFromDto,
  effectiveAccess,
  effectiveFormat,
  genreLabelMap,
  groupGenres,
  groupTags,
  hasChanges,
  legacyGenreNames,
  parseCodes,
  toggleValue,
  validateDraft,
  type ClassificationDraft,
} from '../lib/classification';
import type { ClassificationDto, Taxonomy } from '../lib/types';
import { ChipToggle, ErrorState, TableSkeleton } from './ui';

/** Removable chips plus a text box that accepts comma/space-separated codes. */
function CodeChips({
  id,
  codes,
  kind,
  existing,
  placeholder,
  labelFor,
  onChange,
}: {
  id: string;
  codes: string[];
  kind: 'country' | 'language';
  /** Codes that count as duplicates in addition to `codes`. */
  existing?: string[];
  placeholder: string;
  labelFor?: (code: string) => string;
  onChange: (codes: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const commit = () => {
    if (!text.trim()) return;
    const parsed = parseCodes(text, kind, existing ?? codes);
    setInvalid(parsed.invalid);
    if (parsed.codes.length) onChange([...codes, ...parsed.codes]);
    setText(parsed.invalid.join(' '));
  };
  return (
    <div>
      <div className="chip-group">
        {codes.map((c) => (
          <span key={c} className="tag-chip on removable">
            {labelFor ? labelFor(c) : c}
            <button
              type="button"
              aria-label={`Remove ${c}`}
              onClick={() => onChange(codes.filter((x) => x !== c))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="input code-input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid([]);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
      {invalid.length ? (
        <div className="hint error-text">
          Not a valid {kind === 'country' ? 'ISO country code (2 letters)' : 'language code (2–3 letters)'}:{' '}
          {invalid.join(', ')}
        </div>
      ) : null}
    </div>
  );
}

/** Taxonomy languages as toggles plus free 2–3 letter codes. */
function LanguagePicker({
  id,
  value,
  languages,
  onChange,
}: {
  id: string;
  value: string[];
  languages: Taxonomy['languages'];
  onChange: (codes: string[]) => void;
}) {
  const known = new Set(languages.map((l) => l.code));
  const extras = value.filter((c) => !known.has(c));
  return (
    <div>
      <div className="chip-group">
        {languages.map((l) => (
          <ChipToggle
            key={l.code}
            label={l.name}
            title={l.code}
            on={value.includes(l.code)}
            onClick={() => onChange(toggleValue(value, l.code))}
          />
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <CodeChips
          id={id}
          kind="language"
          codes={extras}
          existing={value}
          placeholder="Other code, e.g. ff"
          onChange={(next) => onChange([...value.filter((c) => known.has(c)), ...next])}
        />
      </div>
    </div>
  );
}

/**
 * Classification editor for an existing movie or series, plus the homepage
 * placement preview the server computes from it. Saves only changed fields.
 */
export function ClassificationPanel({
  titleId,
  type,
  priceMinor,
  onSaved,
}: {
  titleId: string;
  type: 'movie' | 'series';
  /** Used to explain the default access type (₦0 = Free, otherwise Pay-per-view). */
  priceMinor?: number;
  /** Called after a successful save with the legacy genre names the server mirrored. */
  onSaved?: (dto: ClassificationDto, legacyGenres: string[]) => void;
}) {
  const { client, toast } = useStudio();
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [dto, setDto] = useState<ClassificationDto | null>(null);
  const [draft, setDraft] = useState<ClassificationDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genreQuery, setGenreQuery] = useState('');

  const load = useCallback(() => {
    setLoadError(null);
    setDto(null);
    Promise.all([client.getTaxonomy(), client.getClassification(titleId)])
      .then(([tx, c]) => {
        setTaxonomy(tx);
        setDto(c);
        setDraft(draftFromDto(c));
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load classification'),
      );
  }, [client, titleId]);

  useEffect(load, [load]);

  const changes = useMemo(
    () => (dto && draft ? diffClassification(dto, draft) : {}),
    [dto, draft],
  );
  const dirty = hasChanges(changes);
  const genreLabels = useMemo(() => genreLabelMap(taxonomy?.genres ?? []), [taxonomy]);
  const genreGroups = useMemo(
    () => groupGenres(taxonomy?.genres ?? [], genreQuery),
    [taxonomy, genreQuery],
  );
  const tagGroups = useMemo(() => groupTags(taxonomy?.tags ?? []), [taxonomy]);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!taxonomy || !dto || !draft) return <TableSkeleton rows={5} cols={3} />;

  const set = <K extends keyof ClassificationDraft>(k: K, v: ClassificationDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const label = <T extends string>(list: { value: T; label: string }[], v: T) =>
    list.find((x) => x.value === v)?.label ?? v;

  const autoIndustries = dto.industries.filter((i) => i.source === 'auto');
  const autoSlugs = new Set(autoIndustries.map((i) => i.slug));
  const defaultFormat = effectiveFormat(type, '');
  const defaultAccess =
    priceMinor !== undefined
      ? effectiveAccess('', priceMinor)
      : dto.accessType === null
        ? dto.effectiveAccess
        : null;

  const save = async () => {
    const problem = validateDraft(draft);
    if (problem) {
      setSaveError(problem);
      return;
    }
    if (!dirty) return;
    setBusy(true);
    setSaveError(null);
    try {
      await client.updateClassification(titleId, changes);
      // Reload so auto industries, effective values and placement are the server's.
      const fresh = await client.getClassification(titleId);
      setDto(fresh);
      setDraft(draftFromDto(fresh));
      toast('Classification saved');
      onSaved?.(fresh, legacyGenreNames(fresh.genres, taxonomy.genres));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const fid = (name: string) => `cls-${titleId}-${name}`;

  return (
    <div className="class-panel">
      <fieldset disabled={busy} className="producer-fields">
        <div className="field-row">
          <div className="field">
            <label htmlFor={fid('format')}>Content format</label>
            <select
              id={fid('format')}
              className="select"
              value={draft.contentFormat}
              onChange={(e) => set('contentFormat', e.target.value as ClassificationDraft['contentFormat'])}
            >
              <option value="">Default — {label(taxonomy.formats, defaultFormat)}</option>
              {taxonomy.formats.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={fid('release')}>Release date</label>
            <input
              id={fid('release')}
              type="date"
              className="input"
              value={draft.releaseDate}
              onChange={(e) => set('releaseDate', e.target.value)}
            />
            <div className="hint">Empty = 1 January of the title's year.</div>
          </div>
        </div>

        {/* Genres */}
        <div className="field">
          <label htmlFor={fid('genre-search')}>Genres</label>
          <div className="chip-group" style={{ marginBottom: 8 }}>
            {draft.genres.length === 0 ? <span className="hint">No genres selected.</span> : null}
            {draft.genres.map((slug) => (
              <span key={slug} className="tag-chip on removable">
                {genreLabels.get(slug) ?? slug}
                <button
                  type="button"
                  aria-label={`Remove ${slug}`}
                  onClick={() => set('genres', draft.genres.filter((g) => g !== slug))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            id={fid('genre-search')}
            className="input"
            placeholder="Search genres and subgenres…"
            value={genreQuery}
            onChange={(e) => setGenreQuery(e.target.value)}
          />
          <div className="genre-list">
            {genreGroups.length === 0 ? <div className="hint">No genre matches.</div> : null}
            {genreGroups.map((g) => (
              <div key={g.slug} className="genre-group">
                <ChipToggle
                  label={g.name}
                  on={draft.genres.includes(g.slug)}
                  onClick={() => set('genres', toggleValue(draft.genres, g.slug))}
                />
                <div className="chip-group sub">
                  {g.subgenres.map((s) => (
                    <ChipToggle
                      key={s.slug}
                      label={s.name}
                      title={s.slug}
                      on={draft.genres.includes(s.slug)}
                      onClick={() => set('genres', toggleValue(draft.genres, s.slug))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="hint">
            A row for a parent genre also shows titles tagged with its subgenres. Selection order is
            kept.
          </div>
        </div>

        {/* Tags */}
        {tagGroups.map((group) => (
          <div className="field" key={group.kind}>
            <label>{TAG_KIND_LABELS[group.kind]} tags</label>
            <div className="chip-group">
              {group.tags.map((t) => (
                <ChipToggle
                  key={t.slug}
                  label={t.name}
                  on={draft.tags.includes(t.slug)}
                  onClick={() => set('tags', toggleValue(draft.tags, t.slug))}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Origin */}
        <div className="field">
          <label htmlFor={fid('countries')}>Production countries</label>
          <CodeChips
            id={fid('countries')}
            kind="country"
            codes={draft.productionCountries}
            placeholder="ISO code, e.g. NG"
            onChange={(v) => set('productionCountries', v)}
          />
        </div>
        <div className="field">
          <label htmlFor={fid('orig-lang')}>Original languages</label>
          <LanguagePicker
            id={fid('orig-lang')}
            value={draft.originalLanguages}
            languages={taxonomy.languages}
            onChange={(v) => set('originalLanguages', v)}
          />
        </div>
        <div className="field">
          <label htmlFor={fid('audio-lang')}>Audio languages</label>
          <LanguagePicker
            id={fid('audio-lang')}
            value={draft.audioLanguages}
            languages={taxonomy.languages}
            onChange={(v) => set('audioLanguages', v)}
          />
        </div>
        <div className="field">
          <label>Industries</label>
          <div className="chip-group">
            {autoIndustries.map((i) => (
              <span
                key={i.slug}
                className="tag-chip locked"
                title="Assigned automatically from production countries and original languages"
              >
                🔒 {i.name} <span className="auto-badge">auto</span>
              </span>
            ))}
            {taxonomy.industries
              .filter((i) => !autoSlugs.has(i.slug))
              .map((i) => (
                <ChipToggle
                  key={i.slug}
                  label={i.name}
                  on={draft.industries.includes(i.slug)}
                  onClick={() => set('industries', toggleValue(draft.industries, i.slug))}
                />
              ))}
          </div>
          <div className="hint">
            Auto industries are recomputed from production countries and original languages when
            you save. Selected chips are manual and are kept.
          </div>
        </div>
        {/* Audience & rating */}
        <div className="field-row-3">
          <div className="field">
            <label htmlFor={fid('audience')}>Audience</label>
            <select
              id={fid('audience')}
              className="select"
              value={draft.audience}
              onChange={(e) => set('audience', e.target.value as ClassificationDraft['audience'])}
            >
              <option value="">—</option>
              {taxonomy.audiences.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={fid('age')}>Certified age rating</label>
            <input
              id={fid('age')}
              className="input"
              placeholder="e.g. 18, PG-13"
              value={draft.ageRating}
              onChange={(e) => set('ageRating', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={fid('jurisdiction')}>Rating jurisdiction</label>
            <input
              id={fid('jurisdiction')}
              className="input"
              placeholder="e.g. NG (NFVCB)"
              value={draft.ratingJurisdiction}
              onChange={(e) => set('ratingJurisdiction', e.target.value)}
            />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
          Audience is who the title is aimed at; it never sets the age rating. Enter the certified
          rating and the board or country that issued it separately.
        </div>

        {/* Access & availability */}
        <div className="field">
          <label htmlFor={fid('access')}>Access type</label>
          <select
            id={fid('access')}
            className="select"
            value={draft.accessType}
            onChange={(e) => set('accessType', e.target.value as ClassificationDraft['accessType'])}
          >
            <option value="">
              Default{defaultAccess ? ` — ${label(taxonomy.accessTypes, defaultAccess)}` : ''}
            </option>
            {taxonomy.accessTypes.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <div className="hint">
            Classification only: checkout still charges the ticket price once (pay-per-view). This
            only decides which homepage rows the title fits.
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor={fid('from')}>Available from</label>
            <input
              id={fid('from')}
              type="datetime-local"
              className="input"
              value={draft.availableFrom}
              onChange={(e) => set('availableFrom', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={fid('until')}>Available until</label>
            <input
              id={fid('until')}
              type="datetime-local"
              className="input"
              value={draft.availableUntil}
              onChange={(e) => set('availableUntil', e.target.value)}
            />
          </div>
        </div>
        {type === 'series' ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.seriesComplete}
              onChange={(e) => set('seriesComplete', e.target.checked)}
            />
            Series complete (no more episodes planned)
          </label>
        ) : null}

        {/* Collections */}
        <div className="field">
          <label>Editorial collections</label>
          <div className="chip-group">
            {taxonomy.collections
              .filter((c) => c.kind === 'EDITORIAL')
              .map((c) => (
                <ChipToggle
                  key={c.slug}
                  label={c.name}
                  on={draft.collections.includes(c.slug)}
                  onClick={() => set('collections', toggleValue(draft.collections, c.slug))}
                />
              ))}
          </div>
          <label style={{ marginTop: 10 }}>Legacy browse rows</label>
          <div className="chip-group">
            {taxonomy.collections
              .filter((c) => c.kind === 'SYSTEM')
              .map((c) => (
                <ChipToggle
                  key={c.slug}
                  label={c.name}
                  title={c.slug}
                  on={draft.collections.includes(c.slug)}
                  onClick={() => set('collections', toggleValue(draft.collections, c.slug))}
                />
              ))}
          </div>
        </div>

        {saveError ? (
          <div role="alert" className="producer-error">
            {saveError}
          </div>
        ) : null}
        <div className="row-flex spread">
          <span className="hint" style={{ margin: 0 }}>
            {dirty
              ? `${Object.keys(changes).length} unsaved change${Object.keys(changes).length === 1 ? '' : 's'}`
              : 'No unsaved changes'}
          </span>
          <div className="row-flex">
            {dirty ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDraft(draftFromDto(dto));
                  setSaveError(null);
                }}
              >
                Discard
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!dirty || busy}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save classification'}
            </button>
          </div>
        </div>
      </fieldset>

      <div className="section-title">Homepage placement preview</div>
      <div className="placement-list">
        {dto.placement.length === 0 ? (
          <div className="hint">No enabled homepage section matches this title yet.</div>
        ) : (
          dto.placement.map((p) => (
            <div key={p.slug} className="placement-row">
              <span>{p.title}</span>
              {p.eligible ? (
                <span className="pill published">Eligible</span>
              ) : (
                <span className="pill draft">{p.reason ?? 'Not eligible'}</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="hint">
        Actual placement requires publication and eligibility checks.
        {dirty ? ' Save to refresh this preview.' : ''}
      </div>
    </div>
  );
}
