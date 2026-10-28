import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '../lib/app-context';
import {
  HOME_SORTS,
  KIND_LABELS,
  RULE_FIELD_LABELS,
  SECTION_RULE_KEYS,
  SLUG_RE,
  SORT_LABELS,
  TAG_KIND_LABELS,
  TITLE_TYPES,
  draftFromRules,
  emptyRulesDraft,
  emptyRulesForm,
  formUnsupportedReason,
  genreLabelMap,
  groupTags,
  isPersonalKind,
  manualCollection,
  moveItem,
  parseRulesJson,
  rulesFromDraft,
  rulesFromForm,
  rulesToJson,
  sameRules,
  searchTitles,
  slugify,
  summarizeRules,
  toggleValue,
  type RuleNumberKey,
  type RulesDraft,
  type RulesForm,
  type TriState,
} from '../lib/classification';
import type {
  HomePreview,
  HomeSectionDto,
  HomeSectionPatch,
  HomeSort,
  SectionRules,
  Taxonomy,
  TaxonomyCollection,
} from '../lib/types';
import {
  ChipToggle,
  Drawer,
  EmptyState,
  ErrorState,
  PosterThumb,
  TableSkeleton,
} from '../components/ui';

interface PickableTitle {
  id: string;
  title: string;
  type: 'movie' | 'series';
  year: number;
  posterUrl: string | null;
}

const errText = (e: unknown, fallback = 'Request failed') =>
  e instanceof Error ? e.message : fallback;

export function HomepageScreen() {
  const { client, toast } = useStudio();
  const [sections, setSections] = useState<HomeSectionDto[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [collections, setCollections] = useState<TaxonomyCollection[]>([]);
  const [titles, setTitles] = useState<PickableTitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rulesFor, setRulesFor] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setSections(null);
    Promise.all([
      client.listHomeSections(),
      client.getTaxonomy(),
      client.listMovies(),
      client.listSeries({ take: 200 }),
    ])
      .then(([secs, tx, movies, series]) => {
        setSections(secs);
        setTaxonomy(tx);
        setCollections(tx.collections);
        setTitles([
          ...movies
            .filter((m) => m.type === 'movie')
            .map((m) => ({ id: m.id, title: m.title, type: 'movie' as const, year: m.year, posterUrl: m.posterUrl })),
          ...series.items.map((s) => ({ id: s.id, title: s.title, type: 'series' as const, year: s.year, posterUrl: s.posterUrl })),
        ]);
      })
      .catch((e: unknown) => setError(errText(e, 'Failed to load homepage sections')));
  }, [client]);

  useEffect(load, [load]);

  /** Re-read counts/live flags quietly (a change to one section can move another past the row cap). */
  const refreshQuietly = useCallback(() => {
    client.listHomeSections().then(setSections).catch(() => undefined);
  }, [client]);

  const patch = async (id: string, body: HomeSectionPatch): Promise<boolean> => {
    setBusy(true);
    try {
      const saved = await client.updateHomeSection(id, body);
      setSections((prev) => prev?.map((s) => (s.id === id ? saved : s)) ?? prev);
      refreshQuietly();
      return true;
    } catch (e) {
      toast(errText(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    if (!sections) return;
    const ids = moveItem(
      sections.map((s) => s.id),
      index,
      delta,
    );
    setBusy(true);
    try {
      setSections(await client.reorderHomeSections(ids));
    } catch (e) {
      toast(errText(e, 'Reorder failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const liveCount = sections?.filter((s) => s.live).length ?? 0;
  // Collections created on this screen show up in the rules editor straight away.
  const editorTaxonomy = useMemo(
    () => (taxonomy ? { ...taxonomy, collections } : null),
    [taxonomy, collections],
  );
  const editing = rulesFor ? sections?.find((s) => s.id === rulesFor) : undefined;

  const rulesSaved = (saved: HomeSectionDto) => {
    setSections((prev) => prev?.map((s) => (s.id === saved.id ? saved : s)) ?? prev);
    // Other rows can move past the row cap, so re-read every count and live flag.
    refreshQuietly();
    setRulesFor(null);
    toast(
      `Rules saved · ${saved.eligibleCount ?? 0} eligible · ${saved.live ? 'live' : 'hidden'}`,
    );
  };

  return (
    <div>
      <div className="toolbar">
        <div className="muted">
          {sections
            ? `${sections.length} sections · ${liveCount} live on the homepage`
            : 'Loading sections…'}
        </div>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={load} disabled={busy}>
          Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setPreviewOpen(true)}>
          Preview homepage
        </button>
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : sections === null ? (
          <TableSkeleton rows={10} cols={5} />
        ) : sections.length === 0 ? (
          <EmptyState icon="🏠" title="No homepage sections" body="The backend has not seeded any sections yet." />
        ) : (
          <div className="home-sections">
            {sections.map((s, i) => (
              <SectionRow
                key={s.id}
                section={s}
                index={i}
                count={sections.length}
                busy={busy}
                titles={titles}
                expanded={expanded === s.id}
                onToggleExpand={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
                onEditRules={() => setRulesFor(s.id)}
                onPatch={(body) => patch(s.id, body)}
                onMove={(delta) => void move(i, delta)}
              />
            ))}
          </div>
        )}
      </div>

      <CollectionsCard
        collections={collections}
        onChanged={(next) => setCollections(next)}
      />

      {editing && editorTaxonomy ? (
        <RulesDrawer
          key={editing.id}
          section={editing}
          taxonomy={editorTaxonomy}
          onClose={() => setRulesFor(null)}
          onSaved={rulesSaved}
        />
      ) : null}

      {previewOpen ? <PreviewDrawer onClose={() => setPreviewOpen(false)} /> : null}
    </div>
  );
}

// ── One section row ─────────────────────────────────────────────────────────

function NumberCell({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (v: number) => Promise<boolean>;
}) {
  const { toast } = useStudio();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = async () => {
    const v = Number(text);
    if (text.trim() === String(value)) return;
    if (!Number.isInteger(v) || v < 1 || v > 50) {
      toast(`${label} must be a whole number from 1 to 50`, 'error');
      setText(String(value));
      return;
    }
    if (!(await onCommit(v))) setText(String(value));
  };
  return (
    <label className="num-cell">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min={1}
        max={50}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function SectionRow({
  section: s,
  index,
  count,
  busy,
  titles,
  expanded,
  onToggleExpand,
  onEditRules,
  onPatch,
  onMove,
}: {
  section: HomeSectionDto;
  index: number;
  count: number;
  busy: boolean;
  titles: PickableTitle[];
  expanded: boolean;
  onToggleExpand: () => void;
  onEditRules: () => void;
  onPatch: (body: HomeSectionPatch) => Promise<boolean>;
  onMove: (delta: number) => void;
}) {
  const personal = isPersonalKind(s.kind);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(s.title);
  useEffect(() => setTitleText(s.title), [s.title]);

  const saveTitle = async () => {
    const t = titleText.trim();
    if (!t || t === s.title) {
      setEditingTitle(false);
      setTitleText(s.title);
      return;
    }
    if (await onPatch({ title: t })) setEditingTitle(false);
  };

  const rules = personal ? '' : summarizeRules(s.rules) || 'Every eligible title (no rule filters)';

  return (
    <div className={`home-section${s.enabled ? '' : ' disabled'}`}>
      <div className="home-section-main">
        <div className="move-btns">
          <span className="pos">{index + 1}</span>
          <button
            className="icon-btn"
            aria-label="Move up"
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
          >
            ▲
          </button>
          <button
            className="icon-btn"
            aria-label="Move down"
            disabled={busy || index === count - 1}
            onClick={() => onMove(1)}
          >
            ▼
          </button>
        </div>

        <div className="home-section-title">
          {editingTitle ? (
            <div className="row-flex">
              <input
                className="input"
                value={titleText}
                autoFocus
                onChange={(e) => setTitleText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTitle();
                  if (e.key === 'Escape') {
                    setEditingTitle(false);
                    setTitleText(s.title);
                  }
                }}
              />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveTitle()}>
                Save
              </button>
            </div>
          ) : (
            <div className="row-flex">
              <strong>{s.title}</strong>
              {!personal ? (
                <button className="link-btn" onClick={() => setEditingTitle(true)}>
                  Rename
                </button>
              ) : null}
            </div>
          )}
          <div className="home-section-meta">
            <span className="mono faint">{s.slug}</span>
            {personal ? (
              <span className="pill neutral">App rail · {KIND_LABELS[s.kind]}</span>
            ) : (
              <label className="sort-cell" title="How titles are ordered in this row">
                <span>Sort</span>
                <SortSelect
                  small
                  value={s.sort}
                  disabled={busy}
                  onChange={(sort) => void onPatch({ sort })}
                />
              </label>
            )}
            {!personal && (s.pinnedTitleIds.length || s.excludedTitleIds.length) ? (
              <span className="faint">
                {s.pinnedTitleIds.length} pinned · {s.excludedTitleIds.length} excluded
              </span>
            ) : null}
          </div>
          {rules ? (
            <div className="faint rules-summary row-rules" title={rules}>
              {rules}
            </div>
          ) : null}
        </div>

        <div className="home-section-controls">
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={s.enabled}
              disabled={busy}
              onChange={(e) => void onPatch({ enabled: e.target.checked })}
            />
            Enabled
          </label>
          {!personal ? (
            <>
              <NumberCell
                label="Min"
                value={s.minItems}
                disabled={busy}
                onCommit={(v) => onPatch({ minItems: v })}
              />
              <NumberCell
                label="Limit"
                value={s.limit}
                disabled={busy}
                onCommit={(v) => onPatch({ limit: v })}
              />
            </>
          ) : null}
        </div>

        <div className="home-section-status">
          {personal ? (
            <span className="pill info">App rail</span>
          ) : (
            <>
              <span className="muted" title="Eligible titles after pins/excludes, before the limit">
                {s.eligibleCount ?? 0} eligible
              </span>
              {s.live ? (
                <span className="pill published">Live</span>
              ) : (
                <span className="pill draft">Hidden</span>
              )}
            </>
          )}
        </div>

        <div className="home-section-actions">
          {!personal ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onEditRules}>
                Rules…
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onToggleExpand}>
                {expanded ? 'Close' : 'Pins…'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {expanded && !personal ? (
        <PinEditor section={s} titles={titles} busy={busy} onPatch={onPatch} />
      ) : null}
    </div>
  );
}

// ── Sort ────────────────────────────────────────────────────────────────────

function SortSelect({
  id,
  value,
  disabled,
  small,
  onChange,
}: {
  id?: string;
  value: HomeSort;
  disabled?: boolean;
  small?: boolean;
  onChange: (sort: HomeSort) => void;
}) {
  return (
    <select
      id={id}
      className={`select${small ? ' select-sm' : ''}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as HomeSort)}
    >
      {HOME_SORTS.map((v) => (
        <option key={v} value={v}>
          {SORT_LABELS[v]}
        </option>
      ))}
    </select>
  );
}

// ── Rules editor ────────────────────────────────────────────────────────────

interface PickOption {
  value: string;
  label: string;
}
interface Picker {
  groups: { label?: string; options: PickOption[] }[];
  /** value → chip label */
  labels: Map<string, string>;
}
type PickerKey = 'formats' | 'genresAny' | 'tagsAny' | 'collectionsAny' | 'industriesAny';
/** Everything the rule form offers, built once per taxonomy. */
type RuleOptions = Record<PickerKey, Picker> & {
  audiences: Taxonomy['audiences'];
  accessTypes: Taxonomy['accessTypes'];
};

function picker(groups: Picker['groups'], labels?: Map<string, string>): Picker {
  return {
    groups,
    labels: labels ?? new Map(groups.flatMap((g) => g.options.map((o) => [o.value, o.label]))),
  };
}

function buildRuleOptions(tx: Taxonomy): RuleOptions {
  return {
    audiences: tx.audiences,
    accessTypes: tx.accessTypes,
    formats: picker([{ options: tx.formats.map((f) => ({ value: f.value, label: f.label })) }]),
    genresAny: picker(
      tx.genres.map((g) => ({
        label: g.name,
        options: [
          { value: g.slug, label: `${g.name} (any subgenre)` },
          ...g.subgenres.map((sg) => ({ value: sg.slug, label: sg.name })),
        ],
      })),
      genreLabelMap(tx.genres),
    ),
    tagsAny: picker(
      groupTags(tx.tags).map((g) => ({
        label: TAG_KIND_LABELS[g.kind],
        options: g.tags.map((t) => ({ value: t.slug, label: t.name })),
      })),
    ),
    collectionsAny: picker([
      {
        label: 'Editorial',
        options: tx.collections
          .filter((c) => c.kind === 'EDITORIAL')
          .map((c) => ({ value: c.slug, label: c.name })),
      },
      {
        label: 'System (legacy browse rows)',
        options: tx.collections
          .filter((c) => c.kind === 'SYSTEM')
          .map((c) => ({ value: c.slug, label: c.name })),
      },
    ]),
    industriesAny: picker([
      { options: tx.industries.map((i) => ({ value: i.slug, label: i.name })) },
    ]),
  };
}

/** Chosen values as removable chips, plus an "add" select (grouped) for the rest. */
function MultiPick({
  id,
  label,
  noun,
  values,
  options,
  onChange,
}: {
  id: string;
  label: string;
  noun: string;
  values: string[];
  options: Picker;
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set(values);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="chip-group">
        {values.map((v, i) => {
          const name = options.labels.get(v);
          return (
            <span
              key={`${v}-${i}`}
              className={`tag-chip on removable${name ? '' : ' unknown'}`}
              title={name ? v : `“${v}” is not in the taxonomy`}
            >
              {name ?? v}
              <button
                type="button"
                aria-label={`Remove ${name ?? v}`}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          );
        })}
        <select
          id={id}
          className="select add-select"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...values, e.target.value]);
          }}
        >
          <option value="">{values.length ? `+ Add ${noun}` : `Any ${noun} · add…`}</option>
          {options.groups.map((g, gi) => {
            const opts = g.options
              .filter((o) => !chosen.has(o.value))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ));
            if (opts.length === 0) return null;
            return g.label ? (
              <optgroup key={g.label} label={g.label}>
                {opts}
              </optgroup>
            ) : (
              <Fragment key={gi}>{opts}</Fragment>
            );
          })}
        </select>
      </div>
    </div>
  );
}

const TRI_LABELS: Record<TriState, string> = { any: 'Any', yes: 'Yes', no: 'No' };

function TriToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="seg" role="group" aria-label={label}>
        {(['any', 'yes', 'no'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={value === v ? 'on' : ''}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {TRI_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="hint">{hint}</div>
    </div>
  );
}

/** Field order of the numeric grid (4 per row). */
const NUMBER_FIELDS: RuleNumberKey[] = [
  'minRuntimeMinutes',
  'maxRuntimeMinutes',
  'releaseYearMin',
  'releaseYearMax',
  'releasedWithinDays',
  'publishedWithinDays',
  'expiringWithinDays',
  'hasEpisodeWithinDays',
  'minPlays1d',
  'minPlays7d',
  'minPlaysAll',
];

const FLAG_HINTS = {
  premiere: 'Titles flagged as a premiere',
  upcoming: 'Yes: only titles not out yet',
  seriesComplete: 'Series with no more episodes planned',
} as const;

/** "rules.anyOf[0].minPlays7d must be…" → "Must be…" (the field already names itself). */
const fieldMessage = (msg: string) => {
  const rest = msg.replace(/^rules\S*\s+/, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

/** Every non-anyOf SectionRules key for one rule object (top level or a branch). */
function RuleFields({
  form,
  path,
  options,
  errors,
  onChange,
}: {
  form: RulesForm;
  /** Rule path of this object, e.g. `rules` or `rules.anyOf[1]` (used to look up errors). */
  path: string;
  options: RuleOptions;
  errors: Record<string, string>;
  onChange: (next: RulesForm) => void;
}) {
  const set = <K extends keyof RulesForm>(key: K, value: RulesForm[K]) =>
    onChange({ ...form, [key]: value });
  const fid = (key: string) => `${path}-${key}`.replace(/[^a-zA-Z0-9]+/g, '-');

  return (
    <div className="rule-fields">
      <div className="field-row">
        <div className="field">
          <label>{RULE_FIELD_LABELS.types}</label>
          <div className="chip-group">
            {TITLE_TYPES.map((t) => (
              <ChipToggle
                key={t}
                label={t === 'movie' ? 'Movies' : 'Series'}
                on={form.types.includes(t)}
                onClick={() => set('types', toggleValue(form.types, t))}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <label>{RULE_FIELD_LABELS.audiencesAny}</label>
          <div className="chip-group">
            {options.audiences.map((a) => (
              <ChipToggle
                key={a.value}
                label={a.label}
                on={form.audiencesAny.includes(a.value)}
                onClick={() => set('audiencesAny', toggleValue(form.audiencesAny, a.value))}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label>{RULE_FIELD_LABELS.accessAny}</label>
        <div className="chip-group">
          {options.accessTypes.map((a) => (
            <ChipToggle
              key={a.value}
              label={a.label}
              on={form.accessAny.includes(a.value)}
              onClick={() => set('accessAny', toggleValue(form.accessAny, a.value))}
            />
          ))}
        </div>
      </div>
      <MultiPick
        id={fid('formats')}
        label={RULE_FIELD_LABELS.formats}
        noun="format"
        values={form.formats}
        options={options.formats}
        onChange={(v) => set('formats', v as RulesForm['formats'])}
      />
      <MultiPick
        id={fid('genres')}
        label={`${RULE_FIELD_LABELS.genresAny} (a parent genre also matches its subgenres)`}
        noun="genre"
        values={form.genresAny}
        options={options.genresAny}
        onChange={(v) => set('genresAny', v)}
      />
      <MultiPick
        id={fid('tags')}
        label={RULE_FIELD_LABELS.tagsAny}
        noun="tag"
        values={form.tagsAny}
        options={options.tagsAny}
        onChange={(v) => set('tagsAny', v)}
      />
      <div className="field-row">
        <MultiPick
          id={fid('collections')}
          label={RULE_FIELD_LABELS.collectionsAny}
          noun="collection"
          values={form.collectionsAny}
          options={options.collectionsAny}
          onChange={(v) => set('collectionsAny', v)}
        />
        <MultiPick
          id={fid('industries')}
          label={RULE_FIELD_LABELS.industriesAny}
          noun="industry"
          values={form.industriesAny}
          options={options.industriesAny}
          onChange={(v) => set('industriesAny', v)}
        />
      </div>
      <div className="rules-grid">
        {NUMBER_FIELDS.map((key) => {
          const error = errors[`${path}.${key}`];
          return (
            <div className="field" key={key}>
              <label htmlFor={fid(key)}>{RULE_FIELD_LABELS[key]}</label>
              <input
                id={fid(key)}
                className={`input${error ? ' invalid' : ''}`}
                inputMode="decimal"
                placeholder="Any"
                value={form[key]}
                aria-invalid={error ? true : undefined}
                onChange={(e) => set(key, e.target.value)}
              />
              {error ? <div className="hint error-text">{fieldMessage(error)}</div> : null}
            </div>
          );
        })}
      </div>
      <div className="field-row-3">
        {(['premiere', 'upcoming', 'seriesComplete'] as const).map((key) => (
          <TriToggle
            key={key}
            label={RULE_FIELD_LABELS[key]}
            hint={FLAG_HINTS[key]}
            value={form[key]}
            onChange={(v) => set(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

type RulesTab = 'form' | 'json';

/** "SectionRules key → expected value" cheat sheet for the JSON tab. */
const KEY_HINTS: Record<string, string> = {
  types: '["movie", "series"]',
  formats: 'ContentFormat[]',
  genresAny: 'genre or subgenre slugs',
  tagsAny: 'tag slugs',
  collectionsAny: 'collection slugs',
  industriesAny: 'industry slugs',
  audiencesAny: 'KIDS · TEENS · FAMILY · ADULTS',
  accessAny: 'FREE · SUBSCRIPTION · PAY_PER_VIEW · RENTAL · PURCHASE · PROMOTIONAL',
  releaseYearMin: 'integer ≥ 0',
  releaseYearMax: 'integer ≥ 0',
  premiere: 'true / false',
  upcoming: 'true / false',
  seriesComplete: 'true / false',
  anyOf: 'array of rule objects',
};

/**
 * Rules + sort for one RULE section: a structured form (one level of anyOf
 * branches) and an Advanced (JSON) tab, kept in sync when switching tabs.
 * Rules the form cannot represent open in the JSON tab only.
 */
function RulesDrawer({
  section,
  taxonomy,
  onClose,
  onSaved,
}: {
  section: HomeSectionDto;
  taxonomy: Taxonomy;
  onClose: () => void;
  onSaved: (saved: HomeSectionDto) => void;
}) {
  const { client } = useStudio();
  const options = useMemo(() => buildRuleOptions(taxonomy), [taxonomy]);
  const [storedReason] = useState(() => formUnsupportedReason(section.rules));
  const [tab, setTab] = useState<RulesTab>(storedReason ? 'json' : 'form');
  const [draft, setDraft] = useState<RulesDraft>(() =>
    storedReason ? emptyRulesDraft() : draftFromRules(section.rules),
  );
  const [openBranches, setOpenBranches] = useState<boolean[]>([]);
  const [jsonText, setJsonText] = useState(() => rulesToJson(section.rules));
  const [sort, setSort] = useState<HomeSort>(section.sort);
  const [notice, setNotice] = useState<{ text: string; info?: boolean } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fromForm = useMemo(() => rulesFromDraft(draft), [draft]);
  const formErrors = Object.values(fromForm.errors);
  const fromJson = useMemo(() => parseRulesJson(jsonText), [jsonText]);
  const jsonFormReason = fromJson.ok ? formUnsupportedReason(fromJson.rules) : null;

  /** The rules Save would send right now (null while the active tab has errors). */
  const current: SectionRules | null =
    tab === 'form'
      ? formErrors.length === 0
        ? fromForm.rules
        : null
      : fromJson.ok
        ? fromJson.rules
        : null;
  const rulesChanged = current !== null && !sameRules(current, section.rules);
  const sortChanged = sort !== section.sort;
  const manual = current ? manualCollection(current) : null;
  const manualName = manual
    ? (taxonomy.collections.find((c) => c.slug === manual)?.name ?? manual)
    : null;

  const showForm = () => {
    if (tab === 'form') return;
    if (!fromJson.ok) {
      setNotice({ text: 'Fix the JSON error before switching to the form.' });
      return;
    }
    if (jsonFormReason) {
      setNotice({
        text: `The form can't show these rules: ${jsonFormReason}. Keep editing them as JSON.`,
        info: true,
      });
      return;
    }
    const next = draftFromRules(fromJson.rules);
    setDraft(next);
    setOpenBranches(next.anyOf.map(() => false));
    setNotice(null);
    setTab('form');
  };

  const showJson = () => {
    if (tab === 'json') return;
    if (formErrors.length) {
      setNotice({ text: 'Fix the highlighted fields before switching to JSON.' });
      return;
    }
    setJsonText(rulesToJson(fromForm.rules));
    setNotice(null);
    setTab('json');
  };

  const setBranch = (i: number, next: RulesForm) =>
    setDraft((d) => ({ ...d, anyOf: d.anyOf.map((b, j) => (j === i ? next : b)) }));
  const addBranch = () => {
    setDraft((d) => ({ ...d, anyOf: [...d.anyOf, emptyRulesForm()] }));
    setOpenBranches((o) => [...o.slice(0, draft.anyOf.length), true]);
  };
  const removeBranch = (i: number) => {
    setDraft((d) => ({ ...d, anyOf: d.anyOf.filter((_, j) => j !== i) }));
    setOpenBranches((o) => o.filter((_, j) => j !== i));
  };
  const toggleBranch = (i: number) =>
    setOpenBranches((o) => {
      const next = draft.anyOf.map((_, j) => o[j] ?? false);
      next[i] = !next[i];
      return next;
    });

  const save = async () => {
    if (current === null) {
      setSaveError(
        tab === 'form'
          ? 'Fix the highlighted fields first.'
          : fromJson.ok
            ? 'Fix the JSON first.'
            : fromJson.error,
      );
      return;
    }
    const body: HomeSectionPatch = { rules: current };
    if (sortChanged) body.sort = sort;
    setBusy(true);
    setSaveError(null);
    try {
      onSaved(await client.updateHomeSection(section.id, body));
    } catch (e) {
      // The server's 400 detail, e.g. `Invalid rules: Unknown rule key "x" at rules`.
      setSaveError(errText(e, 'Save failed'));
      setBusy(false);
    }
  };

  const status =
    current === null
      ? tab === 'form'
        ? `${formErrors.length} field${formErrors.length === 1 ? '' : 's'} to fix`
        : 'Invalid JSON rules'
      : rulesChanged || sortChanged
        ? [rulesChanged ? 'Rules changed' : null, sortChanged ? 'Sort changed' : null]
            .filter(Boolean)
            .join(' · ')
        : 'No unsaved changes';

  return (
    <Drawer
      wide
      title={`Rules · ${section.title}`}
      onClose={onClose}
      footer={
        <>
          <span className={`hint rules-status${current === null ? ' error-text' : ''}`}>{status}</span>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || current === null || !(rulesChanged || sortChanged)}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save rules'}
          </button>
        </>
      }
    >
      <div className="home-section-meta" style={{ marginTop: 0, marginBottom: 14 }}>
        <span className="mono faint">{section.slug}</span>
        <span className="muted">{section.eligibleCount ?? 0} eligible now</span>
        {section.live ? (
          <span className="pill published">Live</span>
        ) : (
          <span className="pill draft">Hidden</span>
        )}
      </div>

      <div className="field-row rules-top">
        <div className="field">
          <label htmlFor="rules-sort">Sort</label>
          <SortSelect id="rules-sort" value={sort} onChange={setSort} />
          {sort === 'MANUAL' ? (
            <div className={`hint${manual ? '' : ' error-text'}`}>
              {manual
                ? `Follows the manual order of “${manualName}”.`
                : 'Manual order needs a collection in the rules (it uses the first one).'}
            </div>
          ) : null}
        </div>
        <div className="field">
          <label>Summary</label>
          <div className="rules-summary-box" title={current ? summarizeRules(current) : undefined}>
            {current === null
              ? '—'
              : summarizeRules(current) || 'Every published, playable title'}
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'form'}
          className={`tab${tab === 'form' ? ' on' : ''}`}
          onClick={showForm}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'json'}
          className={`tab${tab === 'json' ? ' on' : ''}`}
          onClick={showJson}
        >
          Advanced (JSON)
        </button>
      </div>

      {notice ? (
        <div role={notice.info ? 'status' : 'alert'} className={notice.info ? 'rules-notice' : 'producer-error'}>
          {notice.text}
        </div>
      ) : null}

      {tab === 'form' ? (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            Every condition you set must match; inside one list any value matches. Leave a field
            empty (or “Any”) to ignore it. Every row also needs published, playable titles inside
            their availability window.
          </p>
          <RuleFields
            form={draft}
            path="rules"
            options={options}
            errors={fromForm.errors}
            onChange={(next) => setDraft((d) => ({ ...next, anyOf: d.anyOf }))}
          />

          <div className="section-title">Any of — at least one branch must also match</div>
          {draft.anyOf.length === 0 ? (
            <p className="hint" style={{ marginTop: 0 }}>
              No branches: the conditions above decide on their own. Add branches to accept titles
              that fit any one of several alternatives (e.g. a collection or a plays threshold).
            </p>
          ) : null}
          {draft.anyOf.map((branch, i) => {
            const path = `rules.anyOf[${i}]`;
            const open = openBranches[i] ?? false;
            const hasErrors = Object.keys(fromForm.errors).some((k) => k.startsWith(`${path}.`));
            return (
              <div className="rule-branch" key={i}>
                <div className="rule-branch-head">
                  <strong>Branch {i + 1}</strong>
                  <span className="faint branch-summary">
                    {summarizeRules(rulesFromForm(branch).rules) || 'Any title'}
                  </span>
                  {hasErrors ? <span className="pill danger">Fix fields</span> : null}
                  <button type="button" className="link-btn" onClick={() => toggleBranch(i)}>
                    {open ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => removeBranch(i)}
                  >
                    Remove
                  </button>
                </div>
                {open ? (
                  <div className="rule-branch-body">
                    <RuleFields
                      form={branch}
                      path={path}
                      options={options}
                      errors={fromForm.errors}
                      onChange={(next) => setBranch(i, next)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addBranch}>
            + Add branch
          </button>
        </>
      ) : (
        <div className="field">
          <div className="row-flex spread" style={{ marginBottom: 5 }}>
            <label htmlFor="rules-json" style={{ margin: 0 }}>
              Rules JSON (SectionRules)
            </label>
            <button
              type="button"
              className="link-btn"
              disabled={!fromJson.ok}
              onClick={() => fromJson.ok && setJsonText(rulesToJson(fromJson.rules))}
            >
              Format
            </button>
          </div>
          <textarea
            id="rules-json"
            className={`textarea mono rules-json${fromJson.ok ? '' : ' invalid'}`}
            spellCheck={false}
            value={jsonText}
            aria-invalid={fromJson.ok ? undefined : true}
            onChange={(e) => {
              setJsonText(e.target.value);
              setNotice(null);
            }}
          />
          {fromJson.ok ? (
            <div className="hint">
              Valid rules.
              {jsonFormReason ? ` The form can't show them (${jsonFormReason}).` : ''}
            </div>
          ) : (
            <div role="alert" className="hint error-text json-error">
              {fromJson.error}
            </div>
          )}
          <details className="rules-keys">
            <summary className="hint">Accepted keys</summary>
            <div className="rules-keys-list">
              {SECTION_RULE_KEYS.map((k) => (
                <div key={k}>
                  <span className="mono">{k}</span>
                  <span className="faint">{KEY_HINTS[k] ?? 'number ≥ 0'}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {saveError ? (
        <div role="alert" className="producer-error">
          {saveError}
        </div>
      ) : null}
    </Drawer>
  );
}

// ── Pins / excludes ─────────────────────────────────────────────────────────

function PinEditor({
  section: s,
  titles,
  busy,
  onPatch,
}: {
  section: HomeSectionDto;
  titles: PickableTitle[];
  busy: boolean;
  onPatch: (body: HomeSectionPatch) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(titles.map((t) => [t.id, t])), [titles]);
  const used = [...s.pinnedTitleIds, ...s.excludedTitleIds];
  const results = searchTitles(titles, query, used);
  const name = (id: string) => {
    const t = byId.get(id);
    return t ? `${t.title} (${t.year})` : id;
  };

  return (
    <div className="pin-editor">
      <div className="field-row">
        <div>
          <div className="field">
            <label>Pinned (lead the row, in this order, if eligible)</label>
            <div className="chip-group">
              {s.pinnedTitleIds.length === 0 ? <span className="hint">None</span> : null}
              {s.pinnedTitleIds.map((id) => (
                <span key={id} className="tag-chip on removable">
                  📌 {name(id)}
                  <button
                    type="button"
                    aria-label="Unpin"
                    disabled={busy}
                    onClick={() =>
                      void onPatch({ pinnedTitleIds: s.pinnedTitleIds.filter((x) => x !== id) })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Excluded (never shown in this row)</label>
            <div className="chip-group">
              {s.excludedTitleIds.length === 0 ? <span className="hint">None</span> : null}
              {s.excludedTitleIds.map((id) => (
                <span key={id} className="tag-chip removable excluded">
                  ⦸ {name(id)}
                  <button
                    type="button"
                    aria-label="Remove exclusion"
                    disabled={busy}
                    onClick={() =>
                      void onPatch({ excludedTitleIds: s.excludedTitleIds.filter((x) => x !== id) })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <label>Find a title</label>
          <input
            className="input"
            placeholder="Search movies and series…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="pin-results">
            {query.trim() && results.length === 0 ? <div className="hint">No matching titles.</div> : null}
            {results.map((t) => (
              <div key={t.id} className="pin-result">
                <PosterThumb url={t.posterUrl} title={t.title} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{t.title}</div>
                  <div className="faint">
                    {t.type === 'series' ? 'Series' : 'Movie'} · {t.year}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void onPatch({ pinnedTitleIds: [...s.pinnedTitleIds, t.id] })}
                >
                  Pin
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void onPatch({ excludedTitleIds: [...s.excludedTitleIds, t.id] })}
                >
                  Exclude
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Editorial collections ───────────────────────────────────────────────────

function CollectionsCard({
  collections,
  onChanged,
}: {
  collections: TaxonomyCollection[];
  onChanged: (next: TaxonomyCollection[]) => void;
}) {
  const { client, toast } = useStudio();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [renaming, setRenaming] = useState<{ slug: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const editorial = collections.filter((c) => c.kind === 'EDITORIAL');
  const system = collections.filter((c) => c.kind === 'SYSTEM');
  const effectiveSlug = slugTouched ? slug : slugify(name);

  const create = async () => {
    if (!name.trim()) return setFormError('Enter a name');
    if (!SLUG_RE.test(effectiveSlug))
      return setFormError('Slug must be lower-case words joined by hyphens');
    setBusy(true);
    setFormError(null);
    try {
      const created = await client.createCollection({ slug: effectiveSlug, name: name.trim() });
      onChanged([...collections, created]);
      setName('');
      setSlug('');
      setSlugTouched(false);
      toast(`Collection “${created.name}” created`);
    } catch (e) {
      setFormError(errText(e, 'Create failed'));
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    setBusy(true);
    try {
      const saved = await client.updateCollection(renaming.slug, { name: renaming.name.trim() });
      onChanged(collections.map((c) => (c.slug === saved.slug ? { ...c, ...saved } : c)));
      setRenaming(null);
      toast('Collection renamed');
    } catch (e) {
      toast(errText(e, 'Rename failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Editorial collections
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Add titles to a collection from the Classification panel in the movie or series editor.
        Sections whose rules name a collection pick those titles up automatically.
      </p>
      <div className="collection-list">
        {editorial.map((c) => (
          <div key={c.slug} className="collection-row">
            {renaming?.slug === c.slug ? (
              <>
                <input
                  className="input"
                  value={renaming.name}
                  autoFocus
                  onChange={(e) => setRenaming({ slug: c.slug, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void rename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void rename()}>
                  Save
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <strong style={{ flex: 1 }}>{c.name}</strong>
                <span className="mono faint">{c.slug}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRenaming({ slug: c.slug, name: c.name })}
                >
                  Rename
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {system.length ? (
        <p className="hint">
          System (legacy browse rows, written by the mobile admin editors):{' '}
          {system.map((c) => c.slug).join(', ')}
        </p>
      ) : null}

      <div className="section-title">New collection</div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="collection-name">Name</label>
          <input
            id="collection-name"
            className="input"
            placeholder="e.g. Valentine's Picks"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="collection-slug">Slug</label>
          <input
            id="collection-slug"
            className="input mono"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </div>
      </div>
      {formError ? (
        <div role="alert" className="producer-error">
          {formError}
        </div>
      ) : null}
      <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => void create()}>
        Create collection
      </button>
    </div>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────

function PreviewDrawer({ onClose }: { onClose: () => void }) {
  const { client } = useStudio();
  const [preview, setPreview] = useState<HomePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setPreview(null);
    client
      .getHomePreview()
      .then(setPreview)
      .catch((e: unknown) => setError(errText(e, 'Failed to load preview')));
  }, [client]);
  useEffect(load, [load]);

  return (
    <Drawer wide title="Homepage preview" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        Exactly the rows the apps' browse endpoint returns right now (personal rails such as
        Continue Watching are drawn by the apps themselves).
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !preview ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <>
          <div className="section-title">Live rows ({preview.rows.length})</div>
          {preview.rows.length === 0 ? (
            <EmptyState icon="🏠" title="No rows would show" body="Every section is disabled or below its minimum." />
          ) : (
            preview.rows.map((row) => (
              <div key={row.slug} className="preview-row">
                <div className="row-flex spread">
                  <strong>{row.title}</strong>
                  <span className="faint">
                    {row.items.length} shown · {row.count} eligible
                  </span>
                </div>
                <div className="poster-strip">
                  {row.items.map((t) => (
                    <div key={t.id} className="poster-card" title={`${t.title} (${t.year})`}>
                      {t.posterUrl ? (
                        <img src={t.posterUrl} alt={t.title} />
                      ) : (
                        <div className="poster-empty">{t.title}</div>
                      )}
                      <span>{t.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="section-title">Hidden ({preview.hidden.length})</div>
          <div className="placement-list">
            {preview.hidden.map((h) => (
              <div key={h.slug} className="placement-row">
                <span>{h.title}</span>
                <span className="pill neutral">{h.reason}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
