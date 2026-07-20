import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { finishedQuiltSize, gridDims, type QuiltSummary } from '../../shared/quilt';
import { QuiltSvg } from './QuiltSvg';

interface QuiltListProps {
  email: string;
  onOpen: (quilt: QuiltSummary) => void;
  onSignOut: () => void;
  onError: (err: unknown) => void;
}

export function QuiltList({ email, onOpen, onSignOut, onError }: QuiltListProps) {
  const [quilts, setQuilts] = useState<QuiltSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { quilts } = await api.listQuilts();
      setQuilts(quilts);
    } catch (err) {
      setMessage('Could not load your quilts. Please refresh the page.');
      onError(err);
    }
  }, [onError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createQuilt() {
    setBusyId('new');
    setMessage(null);
    try {
      const { quilt } = await api.createQuilt('My New Quilt');
      onOpen(quilt);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create a quilt.');
      onError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function copyQuilt(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      await api.copyQuilt(id);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not copy that quilt.');
      onError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuilt(quilt: QuiltSummary) {
    if (!window.confirm(`Delete "${quilt.name}"? This cannot be undone.`)) return;
    setBusyId(quilt.id);
    setMessage(null);
    try {
      await api.deleteQuilt(quilt.id);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete that quilt.');
      onError(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>My Quilts</h1>
        <div className="header-actions">
          <span className="muted user-email">{email}</span>
          <button type="button" className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}

      {quilts === null ? (
        <p className="muted">Loading your quilts…</p>
      ) : (
        <div className="quilt-grid">
          <button
            type="button"
            className="quilt-card quilt-card-new"
            onClick={createQuilt}
            disabled={busyId !== null}
          >
            <span className="new-plus" aria-hidden="true">
              +
            </span>
            <span>Start a new quilt</span>
          </button>

          {quilts.map((quilt) => {
            const dims = gridDims(quilt.data);
            const finished = finishedQuiltSize(quilt.data);
            return (
              <div key={quilt.id} className="quilt-card">
                <button
                  type="button"
                  className="quilt-thumb-button"
                  onClick={() => onOpen(quilt)}
                  aria-label={`Open ${quilt.name}`}
                >
                  <QuiltSvg
                    data={quilt.data}
                    idPrefix={`thumb-${quilt.id}`}
                    className="quilt-thumb"
                    showGridLines={false}
                  />
                </button>
                <div className="quilt-card-body">
                  <h2>{quilt.name}</h2>
                  <p className="muted">
                    {finished.widthIn}&Prime; × {finished.heightIn}&Prime; ·{' '}
                    {quilt.data.cellShape === 'square'
                      ? `${dims.cols} × ${dims.rows} cells`
                      : `${dims.count} pieces`}
                  </p>
                  <p className="muted small">Updated {formatDate(quilt.updatedAt)}</p>
                  <div className="quilt-card-actions">
                    <button type="button" className="btn btn-primary" onClick={() => onOpen(quilt)}>
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => copyQuilt(quilt.id)}
                      disabled={busyId === quilt.id}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => deleteQuilt(quilt)}
                      disabled={busyId === quilt.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {quilts.length === 0 && (
            <p className="muted empty-hint">
              No quilts yet — click “Start a new quilt” and begin painting!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  // D1's datetime('now') is UTC without a timezone marker.
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
