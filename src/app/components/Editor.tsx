import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import {
  fabricTotals,
  gridDims,
  resizeCells,
  round2,
  LIMITS,
  PATTERNS,
  type Fabric,
  type PatternId,
  type QuiltData,
  type QuiltSummary,
} from '../../shared/quilt';
import { FabricSwatch, QuiltSvg } from './QuiltSvg';
import { TotalsPanel } from './TotalsPanel';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Tool = 'paint' | 'erase';

const UNDO_LIMIT = 100;
const AUTOSAVE_DELAY_MS = 1200;

interface EditorProps {
  initialQuilt: QuiltSummary;
  onBack: () => void;
}

export function Editor({ initialQuilt, onBack }: EditorProps) {
  const [name, setName] = useState(initialQuilt.name);
  const [data, setData] = useState<QuiltData>(initialQuilt.data);
  const [undoStack, setUndoStack] = useState<QuiltData[]>([]);
  const [redoStack, setRedoStack] = useState<QuiltData[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('paint');
  const [activeFabricId, setActiveFabricId] = useState<string | null>(
    initialQuilt.data.fabrics[0]?.id ?? null,
  );
  const [editingFabric, setEditingFabric] = useState<Fabric | 'new' | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const dims = useMemo(() => gridDims(data), [data]);
  const totals = useMemo(() => fabricTotals(data), [data]);

  // ---------------------------------------------------------------------
  // Saving (debounced autosave + manual save)
  // ---------------------------------------------------------------------
  const latestRef = useRef({ name, data });
  latestRef.current = { name, data };
  const changeSeq = useRef(0);
  const firstRender = useRef(true);

  const doSave = useCallback(async () => {
    const seqAtStart = changeSeq.current;
    const { name, data } = latestRef.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      await api.updateQuilt(initialQuilt.id, { name: name.trim() || 'Untitled Quilt', data });
      // Only report "saved" if nothing changed while the request was in flight.
      setSaveState(changeSeq.current === seqAtStart ? 'saved' : 'dirty');
    } catch (err) {
      setSaveState('error');
      if (err instanceof ApiError && err.status === 401) {
        setSaveError(
          'You are signed out, so changes are not saving. Sign in from another tab, then press Save.',
        );
      } else {
        setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      }
    }
  }, [initialQuilt.id]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    changeSeq.current++;
    setSaveState((s) => (s === 'saving' ? s : 'dirty'));
    const timer = setTimeout(doSave, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [name, data, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'error') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---------------------------------------------------------------------
  // Undo / redo
  // ---------------------------------------------------------------------
  const pushUndo = useCallback((snapshot: QuiltData) => {
    setUndoStack((stack) => [...stack.slice(-(UNDO_LIMIT - 1)), snapshot]);
    setRedoStack([]);
  }, []);

  /** Apply a structural change, recording the previous state for undo. */
  const commitChange = useCallback(
    (updater: (prev: QuiltData) => QuiltData) => {
      setData((prev) => {
        const next = updater(prev);
        if (next !== prev) pushUndo(prev);
        return next;
      });
    },
    [pushUndo],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setData((current) => {
        setRedoStack((redo) => [...redo, current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setData((current) => {
        setUndoStack((undoS) => [...undoS.slice(-(UNDO_LIMIT - 1)), current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------
  const strokeActive = useRef(false);
  const strokeSnapshot = useRef<QuiltData | null>(null);
  const strokeChanged = useRef(false);

  const paintValue = tool === 'erase' ? null : activeFabricId;

  const applyPaint = useCallback(
    (index: number) => {
      setData((prev) => {
        if (prev.cells[index] === paintValue) return prev;
        if (paintValue !== null && !prev.fabrics.some((f) => f.id === paintValue)) return prev;
        strokeChanged.current = true;
        const cells = prev.cells.slice();
        cells[index] = paintValue;
        return { ...prev, cells };
      });
    },
    [paintValue],
  );

  const handleCellDown = useCallback(
    (index: number) => {
      if (tool === 'paint' && !activeFabricId) return;
      strokeActive.current = true;
      strokeChanged.current = false;
      strokeSnapshot.current = latestRef.current.data;
      applyPaint(index);
    },
    [applyPaint, tool, activeFabricId],
  );

  const handleCellMove = useCallback(
    (index: number) => {
      if (strokeActive.current) applyPaint(index);
    },
    [applyPaint],
  );

  const handleStrokeEnd = useCallback(() => {
    if (!strokeActive.current) return;
    strokeActive.current = false;
    if (strokeChanged.current && strokeSnapshot.current) {
      pushUndo(strokeSnapshot.current);
    }
    strokeSnapshot.current = null;
  }, [pushUndo]);

  // ---------------------------------------------------------------------
  // Fabric management
  // ---------------------------------------------------------------------
  const saveFabric = useCallback(
    (fabric: Fabric) => {
      commitChange((prev) => {
        const existing = prev.fabrics.findIndex((f) => f.id === fabric.id);
        const fabrics =
          existing >= 0
            ? prev.fabrics.map((f) => (f.id === fabric.id ? fabric : f))
            : [...prev.fabrics, fabric];
        return { ...prev, fabrics };
      });
      setActiveFabricId(fabric.id);
      setTool('paint');
      setEditingFabric(null);
    },
    [commitChange],
  );

  const deleteFabric = useCallback(
    (fabricId: string) => {
      const count = latestRef.current.data.cells.filter((c) => c === fabricId).length;
      const fabric = latestRef.current.data.fabrics.find((f) => f.id === fabricId);
      const label = fabric ? `"${fabric.name}"` : 'this fabric';
      if (
        !window.confirm(
          count > 0
            ? `Remove ${label}? The ${count} cell${count === 1 ? '' : 's'} using it will become blank.`
            : `Remove ${label}?`,
        )
      ) {
        return;
      }
      commitChange((prev) => ({
        ...prev,
        fabrics: prev.fabrics.filter((f) => f.id !== fabricId),
        cells: prev.cells.map((c) => (c === fabricId ? null : c)),
      }));
      setActiveFabricId((current) => (current === fabricId ? null : current));
      setEditingFabric(null);
    },
    [commitChange],
  );

  // ---------------------------------------------------------------------
  // Grid-level actions
  // ---------------------------------------------------------------------
  const fillBlanks = useCallback(() => {
    if (!activeFabricId) return;
    commitChange((prev) => {
      if (!prev.cells.some((c) => c === null)) return prev;
      return { ...prev, cells: prev.cells.map((c) => (c === null ? activeFabricId : c)) };
    });
  }, [activeFabricId, commitChange]);

  const clearGrid = useCallback(() => {
    if (!window.confirm('Clear the whole grid? (You can undo this.)')) return;
    commitChange((prev) => {
      if (!prev.cells.some((c) => c !== null)) return prev;
      return { ...prev, cells: prev.cells.map(() => null) };
    });
  }, [commitChange]);

  const applyDimensions = useCallback(
    (patch: Partial<Pick<QuiltData, 'widthIn' | 'heightIn' | 'cellWidthIn' | 'cellHeightIn' | 'seamAllowanceIn'>>) => {
      commitChange((prev) => {
        const next = { ...prev, ...patch };
        const oldDims = gridDims(prev);
        const newDims = gridDims(next);
        if (newDims.rows * newDims.cols > LIMITS.maxCells) {
          window.alert(
            `That would make a ${newDims.cols} × ${newDims.rows} grid — too many cells. Try larger cells or a smaller quilt.`,
          );
          return prev;
        }
        if (oldDims.rows !== newDims.rows || oldDims.cols !== newDims.cols) {
          next.cells = resizeCells(prev.cells, oldDims, newDims);
        }
        return next;
      });
    },
    [commitChange],
  );

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="editor-page">
      <header className="app-header editor-header no-print">
        <button type="button" className="btn" onClick={onBack}>
          ← My Quilts
        </button>
        <input
          className="quilt-name-input"
          value={name}
          maxLength={LIMITS.maxNameLen}
          onChange={(e) => setName(e.target.value)}
          aria-label="Quilt name"
        />
        <div className="header-actions">
          <SaveStatus state={saveState} error={saveError} onRetry={doSave} />
          <button
            type="button"
            className="btn"
            onClick={() => window.print()}
            title="Print the pattern and fabric list"
          >
            Print
          </button>
        </div>
      </header>

      <div className="editor-layout">
        <aside className="editor-sidebar no-print">
          <section className="panel">
            <div className="panel-title-row">
              <h2>Fabrics</h2>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setEditingFabric('new')}
                disabled={data.fabrics.length >= LIMITS.maxFabrics}
              >
                + Add
              </button>
            </div>
            <ul className="fabric-list">
              {data.fabrics.map((fabric) => {
                const count = totals.totals.find((t) => t.fabric.id === fabric.id)?.cellCount ?? 0;
                const selected = tool === 'paint' && activeFabricId === fabric.id;
                return (
                  <li key={fabric.id}>
                    <button
                      type="button"
                      className={`fabric-row ${selected ? 'selected' : ''}`}
                      onClick={() => {
                        setActiveFabricId(fabric.id);
                        setTool('paint');
                      }}
                      aria-pressed={selected}
                    >
                      <FabricSwatch fabric={fabric} idPrefix={`pal-${fabric.id}`} />
                      <span className="fabric-name">{fabric.name}</span>
                      <span className="fabric-count">{count}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setEditingFabric(fabric)}
                      aria-label={`Edit ${fabric.name}`}
                      title={`Edit ${fabric.name}`}
                    >
                      ✎
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className={`fabric-row eraser-row ${tool === 'erase' ? 'selected' : ''}`}
              onClick={() => setTool(tool === 'erase' ? 'paint' : 'erase')}
              aria-pressed={tool === 'erase'}
            >
              <span className="eraser-swatch" aria-hidden="true" />
              <span className="fabric-name">Eraser (blank cell)</span>
            </button>
          </section>

          <section className="panel">
            <div className="panel-title-row">
              <h2>Tools</h2>
            </div>
            <div className="tool-buttons">
              <button type="button" className="btn" onClick={undo} disabled={undoStack.length === 0}>
                ↶ Undo
              </button>
              <button type="button" className="btn" onClick={redo} disabled={redoStack.length === 0}>
                ↷ Redo
              </button>
              <button
                type="button"
                className="btn"
                onClick={fillBlanks}
                disabled={!activeFabricId || totals.unassignedCells === 0}
                title="Fill every blank cell with the selected fabric"
              >
                Fill blanks
              </button>
              <button type="button" className="btn" onClick={clearGrid}>
                Clear grid
              </button>
            </div>
          </section>

          <section className="panel">
            <button
              type="button"
              className="panel-title-row panel-toggle"
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
            >
              <h2>Quilt size</h2>
              <span aria-hidden="true">{showSettings ? '▾' : '▸'}</span>
            </button>
            <p className="muted small">
              {dims.finishedWidthIn}&Prime; × {dims.finishedHeightIn}&Prime; · {dims.cols} ×{' '}
              {dims.rows} cells
            </p>
            {showSettings && (
              <div className="settings-grid">
                <DimField
                  label="Quilt width (in)"
                  value={data.widthIn}
                  min={LIMITS.minQuiltIn}
                  max={LIMITS.maxQuiltIn}
                  onCommit={(v) => applyDimensions({ widthIn: v })}
                />
                <DimField
                  label="Quilt height (in)"
                  value={data.heightIn}
                  min={LIMITS.minQuiltIn}
                  max={LIMITS.maxQuiltIn}
                  onCommit={(v) => applyDimensions({ heightIn: v })}
                />
                <DimField
                  label="Cell width (in)"
                  value={data.cellWidthIn}
                  min={LIMITS.minCellIn}
                  max={LIMITS.maxCellIn}
                  onCommit={(v) => applyDimensions({ cellWidthIn: v })}
                />
                <DimField
                  label="Cell height (in)"
                  value={data.cellHeightIn}
                  min={LIMITS.minCellIn}
                  max={LIMITS.maxCellIn}
                  onCommit={(v) => applyDimensions({ cellHeightIn: v })}
                />
                <label className="dim-field">
                  Seam allowance
                  <select
                    value={String(data.seamAllowanceIn)}
                    onChange={(e) => applyDimensions({ seamAllowanceIn: Number(e.target.value) })}
                  >
                    <option value="0">None</option>
                    <option value="0.25">¼&Prime; (standard)</option>
                    <option value="0.375">⅜&Prime;</option>
                    <option value="0.5">½&Prime;</option>
                  </select>
                </label>
                <p className="hint">
                  Changing sizes keeps your painting where the grids overlap.
                </p>
              </div>
            )}
          </section>

          <TotalsPanel report={totals} seamAllowanceIn={data.seamAllowanceIn} />
        </aside>

        <main className="grid-area">
          <div className="grid-scroll">
            <QuiltSvg
              data={data}
              idPrefix="edit"
              className="quilt-editor-svg"
              onCellPointerDown={handleCellDown}
              onCellPointerMove={handleCellMove}
              onPointerUp={handleStrokeEnd}
            />
          </div>
          <p className="muted small no-print grid-hint">
            {tool === 'erase'
              ? 'Eraser on — click or drag to blank out cells.'
              : activeFabricId
                ? 'Click or drag on the quilt to paint with the selected fabric.'
                : 'Pick a fabric on the left to start painting.'}
          </p>
        </main>
      </div>

      {/* Print-only view: pattern plus fabric requirements */}
      <div className="print-only print-report">
        <h1>{name}</h1>
        <p>
          Finished size {dims.finishedWidthIn}&Prime; × {dims.finishedHeightIn}&Prime; ·{' '}
          {dims.cols} × {dims.rows} cells of {data.cellWidthIn}&Prime; × {data.cellHeightIn}
          &Prime;
        </p>
        <TotalsPanel report={totals} seamAllowanceIn={data.seamAllowanceIn} printable />
      </div>

      {editingFabric !== null && (
        <FabricDialog
          fabric={editingFabric === 'new' ? null : editingFabric}
          onSave={saveFabric}
          onDelete={editingFabric !== 'new' ? () => deleteFabric(editingFabric.id) : undefined}
          onClose={() => setEditingFabric(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save status chip
// ---------------------------------------------------------------------------

function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'error') {
    return (
      <span className="save-status save-error" role="alert">
        {error ?? 'Not saved.'}{' '}
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Save
        </button>
      </span>
    );
  }
  const label = state === 'saved' ? 'All changes saved' : state === 'saving' ? 'Saving…' : 'Saving soon…';
  return <span className={`save-status save-${state}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Dimension field: free typing, committed on blur/Enter
// ---------------------------------------------------------------------------

function DimField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit() {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setText(String(value)); // revert invalid input
      return;
    }
    const rounded = round2(parsed);
    setText(String(rounded));
    if (rounded !== value) onCommit(rounded);
  }

  return (
    <label className="dim-field">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step="0.5"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Fabric add/edit dialog
// ---------------------------------------------------------------------------

const NEW_FABRIC_COLORS = ['#b5533c', '#3d6b52', '#4a5a8a', '#c99a3f', '#7b5d7e', '#96593f'];

function FabricDialog({
  fabric,
  onSave,
  onDelete,
  onClose,
}: {
  fabric: Fabric | null;
  onSave: (fabric: Fabric) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(fabric?.name ?? '');
  const [color, setColor] = useState(
    fabric?.color ?? NEW_FABRIC_COLORS[Math.floor(Math.random() * NEW_FABRIC_COLORS.length)],
  );
  const [pattern, setPattern] = useState<PatternId>(fabric?.pattern ?? 'solid');

  const preview: Fabric = {
    id: fabric?.id ?? 'preview',
    name: name || 'New fabric',
    color,
    pattern,
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      id: fabric?.id ?? `f-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim() || 'Unnamed fabric',
      color,
      pattern,
    });
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={fabric ? 'Edit fabric' : 'Add fabric'}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{fabric ? 'Edit fabric' : 'Add a fabric'}</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.maxFabricNameLen}
              placeholder="e.g. Cherry Red Floral"
              autoFocus
            />
          </label>
          <label>
            Color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <fieldset className="pattern-picker">
            <legend>Pattern</legend>
            {PATTERNS.map((p) => (
              <label key={p} className={`pattern-option ${pattern === p ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="pattern"
                  value={p}
                  checked={pattern === p}
                  onChange={() => setPattern(p)}
                />
                <FabricSwatch fabric={{ ...preview, id: `pv-${p}`, pattern: p }} idPrefix="dlg" size={34} />
                <span>{p}</span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-actions">
            {onDelete && (
              <button type="button" className="btn btn-danger" onClick={onDelete}>
                Remove
              </button>
            )}
            <span className="dialog-actions-spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {fabric ? 'Save' : 'Add fabric'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
