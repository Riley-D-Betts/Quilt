/**
 * "My Fabrics" — the personal fabric library saved on the account.
 * Pick a fabric to add it to the current quilt's palette, or prune the
 * library. Fabrics are saved from the fabric dialog's "Save to My Fabrics".
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Fabric, FabricFields } from '../../shared/quilt';
import { FabricSwatch } from './QuiltSvg';

interface LibraryDialogProps {
  onPick: (fields: FabricFields) => void;
  onClose: () => void;
}

export function LibraryDialog({ onPick, onClose }: LibraryDialogProps) {
  const [fabrics, setFabrics] = useState<Fabric[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLibraryFabrics()
      .then((r) => setFabrics(r.fabrics))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load your fabrics.'),
      );
  }, []);

  async function remove(fabric: Fabric) {
    if (!window.confirm(`Remove "${fabric.name}" from My Fabrics? (Quilts already using it keep it.)`)) {
      return;
    }
    setBusyId(fabric.id);
    try {
      await api.deleteLibraryFabric(fabric.id);
      setFabrics((list) => (list ? list.filter((f) => f.id !== fabric.id) : list));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that fabric.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog library-dialog" role="dialog" aria-modal="true" aria-label="My Fabrics">
        <h2>My Fabrics</h2>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {fabrics === null ? (
          <p className="muted">Loading your fabrics…</p>
        ) : fabrics.length === 0 ? (
          <p className="muted">
            Nothing saved yet. When you add or edit a fabric, press “Save to My Fabrics” to keep it
            here for other quilts.
          </p>
        ) : (
          <ul className="library-list">
            {fabrics.map((fabric) => (
              <li key={fabric.id}>
                <button
                  type="button"
                  className="fabric-row"
                  onClick={() =>
                    onPick({
                      name: fabric.name,
                      color: fabric.color,
                      ...(fabric.color2 ? { color2: fabric.color2 } : {}),
                      pattern: fabric.pattern,
                      ...(fabric.image ? { image: fabric.image } : {}),
                    })
                  }
                  disabled={busyId !== null}
                >
                  <FabricSwatch fabric={fabric} idPrefix={`lib-${fabric.id}`} size={36} />
                  <span className="fabric-name">{fabric.name}</span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => remove(fabric)}
                  disabled={busyId !== null}
                  aria-label={`Remove ${fabric.name} from My Fabrics`}
                  title="Remove from My Fabrics"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
