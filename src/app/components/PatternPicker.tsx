/**
 * Searchable pattern picker: a search box + category chips over the
 * ~250-entry pattern catalog, rendered as tappable swatches in the
 * fabric's current color.
 */
import { useMemo, useState } from 'react';
import {
  getPattern,
  searchPatterns,
  PATTERN_CATALOG,
  PATTERN_CATEGORIES,
  type PatternDefn,
} from '../../shared/patternCatalog';
import { FabricSwatch } from './QuiltSvg';

const SHOW_LIMIT = 60;

export function PatternPicker({
  color,
  value,
  onChange,
}: {
  color: string;
  value: string;
  onChange: (patternId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const results = useMemo(() => searchPatterns(query, category ?? undefined), [query, category]);
  const shown = results.slice(0, SHOW_LIMIT);
  const selected = getPattern(value);
  const selectedVisible = shown.some((d) => d.id === value);

  return (
    <fieldset className="pattern-picker">
      <legend>Pattern — {PATTERN_CATALOG.length} to explore</legend>
      <input
        type="search"
        className="pattern-search"
        placeholder="Search: dots, floral, gingham, stars…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // The picker lives inside the fabric dialog's <form>; Enter here
          // must filter, never submit the whole dialog.
          if (e.key === 'Enter') e.preventDefault();
        }}
        aria-label="Search patterns"
      />
      <div className="pattern-chips" role="group" aria-label="Pattern categories">
        <button
          type="button"
          className={`btn btn-small ${category === null ? 'btn-primary' : ''}`}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {PATTERN_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`btn btn-small ${category === cat ? 'btn-primary' : ''}`}
            onClick={() => setCategory(category === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="pattern-grid">
        {selected && !selectedVisible && (
          <PatternOption defn={selected} color={color} selected onPick={onChange} />
        )}
        {shown.map((defn) => (
          <PatternOption
            key={defn.id}
            defn={defn}
            color={color}
            selected={defn.id === value}
            onPick={onChange}
          />
        ))}
      </div>
      {results.length > SHOW_LIMIT && (
        <p className="hint">
          Showing {SHOW_LIMIT} of {results.length} — keep typing to narrow it down.
        </p>
      )}
      {results.length === 0 && <p className="hint">No patterns match “{query}”.</p>}
    </fieldset>
  );
}

function PatternOption({
  defn,
  color,
  selected,
  onPick,
}: {
  defn: PatternDefn;
  color: string;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <label className={`pattern-option ${selected ? 'selected' : ''}`} title={defn.label}>
      <input
        type="radio"
        name="pattern"
        value={defn.id}
        checked={selected}
        onChange={() => onPick(defn.id)}
      />
      <FabricSwatch
        fabric={{ id: `pk-${defn.id}`, name: defn.label, color, pattern: defn.id }}
        idPrefix="pk"
        size={34}
      />
      <span>{defn.label}</span>
    </label>
  );
}
