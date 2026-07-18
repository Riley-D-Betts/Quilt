/**
 * "My Colors" — the personal color palette saved on the account. Shown in
 * the fabric dialog next to the color picker: tap a swatch to use it,
 * "♡ Save" keeps the current color, and Edit reveals remove buttons.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SavedColor } from '../../shared/quilt';

export function MyColors({
  color,
  onPick,
}: {
  color: string;
  onPick: (color: string) => void;
}) {
  const [colors, setColors] = useState<SavedColor[] | null>(null);
  const [managing, setManaging] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listColors()
      .then((r) => setColors(r.colors))
      .catch(() => setColors([])); // silent: the palette is a nicety
  }, []);

  const alreadySaved = colors?.some((c) => c.color === color.toLowerCase()) ?? false;

  async function saveCurrent() {
    if (state === 'saving' || alreadySaved) return;
    setState('saving');
    setError(null);
    try {
      const { color: saved } = await api.saveColor(color);
      setColors((list) => {
        if (!list) return [saved];
        return list.some((c) => c.id === saved.id) ? list : [saved, ...list];
      });
      setState('idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Could not save that color.');
    }
  }

  async function remove(entry: SavedColor) {
    try {
      await api.deleteColor(entry.id);
      setColors((list) => (list ? list.filter((c) => c.id !== entry.id) : list));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that color.');
    }
  }

  return (
    <div className="my-colors">
      <div className="my-colors-header">
        <span className="photo-label">My colors</span>
        <button
          type="button"
          className="btn btn-small"
          onClick={saveCurrent}
          disabled={state === 'saving' || alreadySaved}
          title="Save the current color to your palette"
        >
          {alreadySaved ? '✓ Saved' : state === 'saving' ? 'Saving…' : '♡ Save this color'}
        </button>
        {colors !== null && colors.length > 0 && (
          <button
            type="button"
            className="btn-link my-colors-edit"
            onClick={() => setManaging(!managing)}
          >
            {managing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {colors === null ? (
        <p className="hint">Loading your colors…</p>
      ) : colors.length === 0 ? (
        <p className="hint">Save colors you love and they'll be here in every quilt.</p>
      ) : (
        <div className="my-colors-swatches">
          {colors.map((entry) => (
            <span key={entry.id} className="my-color-wrap">
              <button
                type="button"
                className={`my-color-swatch ${entry.color === color.toLowerCase() ? 'selected' : ''}`}
                style={{ background: entry.color }}
                title={entry.name || entry.color}
                aria-label={`Use color ${entry.name || entry.color}`}
                onClick={() => onPick(entry.color)}
              />
              {managing && (
                <button
                  type="button"
                  className="my-color-remove"
                  aria-label={`Remove ${entry.name || entry.color} from My Colors`}
                  onClick={() => remove(entry)}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
