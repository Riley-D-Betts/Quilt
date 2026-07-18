import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import {
  fabricTotals,
  gridDims,
  isSplitCell,
  isStampShape,
  quiltGrid,
  resizeCells,
  round2,
  LIMITS,
  type Cell,
  type CellShape,
  type Fabric,
  type PatternId,
  type QuiltData,
  type QuiltSummary,
  type SplitKind,
} from '../../shared/quilt';
import { gridCount, splitPartCount } from '../../shared/geometry';
import { FabricSwatch, QuiltSvg } from './QuiltSvg';
import { TotalsPanel } from './TotalsPanel';
import { DrawDialog } from './DrawDialog';
import { LibraryDialog } from './LibraryDialog';
import { PatternPicker } from './PatternPicker';
import { MyColors } from './MyColors';
import { processFabricPhoto } from '../photo';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Tool = 'paint' | 'erase' | 'cut';
type CutKind = SplitKind | 'whole';

const UNDO_LIMIT = 100;
const AUTOSAVE_DELAY_MS = 1200;

const SHAPE_OPTIONS: { value: CellShape; label: string }[] = [
  { value: 'square', label: 'Squares (classic)' },
  { value: 'triangle', label: 'Triangles' },
  { value: 'hexagon', label: 'Hexagons (hexies)' },
  { value: 'octagon', label: 'Octagons + corner squares' },
  { value: 'circle', label: 'Circles on a background' },
  { value: 'pentagon', label: 'Pentagons on a background' },
  { value: 'heptagon', label: 'Heptagons on a background' },
];

const SHAPE_HINTS: Partial<Record<CellShape, string>> = {
  triangle: 'Cell width sets the triangle side; height follows automatically.',
  hexagon: 'Cell width sets the hexagon width; height follows automatically.',
  octagon: 'Cell width sets the octagon size. The little corner squares are paintable too.',
  circle: 'Circles sit on a background fabric — pick it below.',
  pentagon: 'Pentagons sit on a background fabric — pick it below.',
  heptagon: 'Heptagons sit on a background fabric — pick it below.',
};

const CUT_OPTIONS: { kind: CutKind; glyph: string; label: string }[] = [
  { kind: 'whole', glyph: '■', label: 'Whole cell (merge cuts back)' },
  { kind: 'h2', glyph: '⬓', label: 'Cut in half across' },
  { kind: 'v2', glyph: '◨', label: 'Cut in half down' },
  { kind: 'd2', glyph: '◩', label: 'Cut diagonally (\\)' },
  { kind: 'x2', glyph: '◪', label: 'Cut diagonally (/)' },
  { kind: 'q4', glyph: '田', label: 'Cut into quarters' },
  { kind: 'x4', glyph: '✕', label: 'Cut into four triangles' },
];

interface EditorProps {
  initialQuilt: QuiltSummary;
  onBack: () => void;
}

/**
 * Quilt data plus its undo/redo stacks, updated atomically so a single
 * state transition can never observe half-applied history.
 */
interface History {
  data: QuiltData;
  undo: QuiltData[];
  redo: QuiltData[];
}

function pushCapped(stack: QuiltData[], snapshot: QuiltData): QuiltData[] {
  return [...stack.slice(-(UNDO_LIMIT - 1)), snapshot];
}

export function Editor({ initialQuilt, onBack }: EditorProps) {
  const [name, setName] = useState(initialQuilt.name);
  const [history, setHistory] = useState<History>({
    data: initialQuilt.data,
    undo: [],
    redo: [],
  });
  const data = history.data;
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('paint');
  const [cutKind, setCutKind] = useState<CutKind>('h2');
  const [activeFabricId, setActiveFabricId] = useState<string | null>(
    initialQuilt.data.fabrics[0]?.id ?? null,
  );
  const [editingFabric, setEditingFabric] = useState<Fabric | 'new' | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const dims = useMemo(() => gridDims(data), [data]);
  const totals = useMemo(() => fabricTotals(data), [data]);
  const stamp = isStampShape(data.cellShape);

  // ---------------------------------------------------------------------
  // Saving (debounced autosave + manual save)
  // ---------------------------------------------------------------------
  const latestRef = useRef({ name, data });
  latestRef.current = { name, data };
  const changeSeq = useRef(0);
  const firstRender = useRef(true);

  // Saves are serialized into one chain: overlapping PUTs could otherwise
  // land out of order server-side (last-writer-wins) and resurrect stale
  // data. The chain also re-saves immediately when edits arrived while a
  // request was in flight, instead of leaving the state wedged at dirty.
  const saveChain = useRef<Promise<boolean> | null>(null);

  const performSave = useCallback(async (): Promise<boolean> => {
    const { name, data } = latestRef.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      await api.updateQuilt(initialQuilt.id, { name: name.trim() || 'Untitled Quilt', data });
      return true;
    } catch (err) {
      setSaveState('error');
      if (err instanceof ApiError && err.status === 401) {
        setSaveError(
          'You are signed out, so changes are not saving. Sign in from another tab, then press Save.',
        );
      } else {
        setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      }
      return false;
    }
  }, [initialQuilt.id]);

  const doSave = useCallback((): Promise<boolean> => {
    if (saveChain.current) return saveChain.current;
    const chain = (async () => {
      try {
        for (;;) {
          const seqAtStart = changeSeq.current;
          const ok = await performSave();
          if (!ok) return false;
          if (changeSeq.current === seqAtStart) {
            setSaveState('saved');
            return true;
          }
          // More edits arrived while saving — go around again.
        }
      } finally {
        saveChain.current = null;
      }
    })();
    saveChain.current = chain;
    return chain;
  }, [performSave]);

  // Flush any pending changes before leaving so the debounce window can't
  // swallow the user's last edits.
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const handleBack = useCallback(async () => {
    if (saveStateRef.current !== 'saved') {
      const ok = await doSave();
      if (
        !ok &&
        !window.confirm('Your latest changes could not be saved. Leave anyway and lose them?')
      ) {
        return;
      }
    }
    onBack();
  }, [doSave, onBack]);

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
  // Undo / redo — every transition is one pure setHistory call
  // ---------------------------------------------------------------------

  /** Apply a structural change, recording the previous state for undo. */
  const commitChange = useCallback((updater: (prev: QuiltData) => QuiltData) => {
    setHistory((h) => {
      const next = updater(h.data);
      if (next === h.data) return h;
      return { data: next, undo: pushCapped(h.undo, h.data), redo: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.undo.length === 0) return h;
      return {
        data: h.undo[h.undo.length - 1],
        undo: h.undo.slice(0, -1),
        redo: [...h.redo, h.data],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.redo.length === 0) return h;
      return {
        data: h.redo[h.redo.length - 1],
        undo: pushCapped(h.undo, h.data),
        redo: h.redo.slice(0, -1),
      };
    });
  }, []);

  // Quilt undo/redo shortcuts must not fire while a dialog is open — a
  // Ctrl+Z aimed at the draw canvas would silently rewind the quilt behind
  // the modal (and autosave the loss).
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = editingFabric !== null || showLibrary;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpenRef.current) return;
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

  // Undo/redo can restore a non-square grid while the Cut tool is active,
  // which would leave every tap a no-op; fall back to painting.
  useEffect(() => {
    if (tool === 'cut' && data.cellShape !== 'square') setTool('paint');
  }, [tool, data.cellShape]);

  // ---------------------------------------------------------------------
  // Painting and cutting (both stroke-based for drag + one undo per stroke)
  // ---------------------------------------------------------------------
  const strokeActive = useRef(false);
  const strokeSnapshot = useRef<QuiltData | null>(null);

  const paintValue = tool === 'erase' ? null : activeFabricId;

  const applyPaint = useCallback(
    (index: number, part: number | null) => {
      setHistory((h) => {
        const prev = h.data;
        if (paintValue !== null && !prev.fabrics.some((f) => f.id === paintValue)) return h;
        const cell = prev.cells[index] ?? null;
        let nextCell: Cell;
        if (isSplitCell(cell) && part !== null) {
          if (cell.parts[part] === paintValue) return h;
          const parts = cell.parts.slice();
          parts[part] = paintValue;
          nextCell = { ...cell, parts };
        } else if (isSplitCell(cell)) {
          // No part info (shouldn't happen) — leave split cells alone.
          return h;
        } else {
          if (cell === paintValue) return h;
          nextCell = paintValue;
        }
        const cells = prev.cells.slice();
        cells[index] = nextCell;
        return { ...h, data: { ...prev, cells } };
      });
    },
    [paintValue],
  );

  const applyCut = useCallback(
    (index: number) => {
      setHistory((h) => {
        const prev = h.data;
        if (prev.cellShape !== 'square') return h;
        const cell = prev.cells[index] ?? null;
        let nextCell: Cell;
        if (cutKind === 'whole') {
          if (!isSplitCell(cell)) return h;
          nextCell = majorityFabric(cell.parts);
        } else {
          if (isSplitCell(cell) && cell.split === cutKind) return h;
          const fill = isSplitCell(cell) ? majorityFabric(cell.parts) : cell;
          nextCell = { split: cutKind, parts: new Array(splitPartCount(cutKind)).fill(fill) };
        }
        const cells = prev.cells.slice();
        cells[index] = nextCell;
        return { ...h, data: { ...prev, cells } };
      });
    },
    [cutKind],
  );

  const handleCellDown = useCallback(
    (index: number, part: number | null) => {
      if (tool === 'paint' && !activeFabricId) return;
      strokeActive.current = true;
      strokeSnapshot.current = latestRef.current.data;
      if (tool === 'cut') applyCut(index);
      else applyPaint(index, part);
    },
    [applyCut, applyPaint, tool, activeFabricId],
  );

  const handleCellMove = useCallback(
    (index: number, part: number | null) => {
      if (!strokeActive.current) return;
      if (tool === 'cut') applyCut(index);
      else applyPaint(index, part);
    },
    [applyCut, applyPaint, tool],
  );

  const handleStrokeEnd = useCallback(() => {
    if (!strokeActive.current) return;
    strokeActive.current = false;
    const snapshot = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (!snapshot) return;
    setHistory((h) =>
      // Painting replaced `data` with a new object iff anything changed.
      h.data === snapshot ? h : { ...h, undo: pushCapped(h.undo, snapshot), redo: [] },
    );
  }, []);

  // ---------------------------------------------------------------------
  // Fabric management
  // ---------------------------------------------------------------------
  const saveFabric = useCallback(
    (fabric: Fabric): boolean => {
      // Enforce the whole-quilt budget on the client too: if this fabric's
      // image would push the quilt over the server cap, every future
      // autosave would 400 — refuse now, while the user can still react.
      const prev = latestRef.current.data;
      const existing = prev.fabrics.findIndex((f) => f.id === fabric.id);
      const fabrics =
        existing >= 0
          ? prev.fabrics.map((f) => (f.id === fabric.id ? fabric : f))
          : [...prev.fabrics, fabric];
      if (JSON.stringify({ ...prev, fabrics }).length > LIMITS.maxDataBytes) {
        window.alert(
          'This quilt has too many photo fabrics to save. Remove a photo from another fabric first.',
        );
        return false;
      }
      commitChange((p) => {
        const i = p.fabrics.findIndex((f) => f.id === fabric.id);
        return {
          ...p,
          fabrics: i >= 0 ? p.fabrics.map((f) => (f.id === fabric.id ? fabric : f)) : [...p.fabrics, fabric],
        };
      });
      setActiveFabricId(fabric.id);
      setTool('paint');
      setEditingFabric(null);
      return true;
    },
    [commitChange],
  );

  const deleteFabric = useCallback(
    (fabricId: string) => {
      const current = latestRef.current.data;
      const count =
        totalUsesOfFabric(current.cells, fabricId) +
        (current.backgroundFabricId === fabricId ? 1 : 0);
      const fabric = current.fabrics.find((f) => f.id === fabricId);
      const label = fabric ? `"${fabric.name}"` : 'this fabric';
      if (
        !window.confirm(
          count > 0
            ? `Remove ${label}? Everything painted with it will become blank.`
            : `Remove ${label}?`,
        )
      ) {
        return;
      }
      commitChange((prev) => ({
        ...prev,
        fabrics: prev.fabrics.filter((f) => f.id !== fabricId),
        backgroundFabricId: prev.backgroundFabricId === fabricId ? null : prev.backgroundFabricId,
        cells: prev.cells.map((c) => {
          if (c === fabricId) return null;
          if (isSplitCell(c) && c.parts.includes(fabricId)) {
            return { ...c, parts: c.parts.map((p) => (p === fabricId ? null : p)) };
          }
          return c;
        }),
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
      const hasBlank = prev.cells.some(
        (c) => c === null || (isSplitCell(c) && c.parts.some((p) => p === null)),
      );
      if (!hasBlank) return prev;
      return {
        ...prev,
        cells: prev.cells.map((c) => {
          if (c === null) return activeFabricId;
          if (isSplitCell(c) && c.parts.some((p) => p === null)) {
            return { ...c, parts: c.parts.map((p) => p ?? activeFabricId) };
          }
          return c;
        }),
      };
    });
  }, [activeFabricId, commitChange]);

  const clearGrid = useCallback(() => {
    if (!window.confirm('Clear the whole grid, including cuts? (You can undo this.)')) return;
    commitChange((prev) => {
      if (!prev.cells.some((c) => c !== null)) return prev;
      return { ...prev, cells: prev.cells.map(() => null) };
    });
  }, [commitChange]);

  const applyDimensions = useCallback(
    (
      patch: Partial<
        Pick<QuiltData, 'widthIn' | 'heightIn' | 'cellWidthIn' | 'cellHeightIn' | 'seamAllowanceIn'>
      >,
    ): boolean => {
      // Validate against the latest data BEFORE committing, so the guard
      // (and its alert) stays out of the pure state updater. gridCount is a
      // closed-form check — never materializes a huge rejected grid.
      const current = latestRef.current.data;
      const proposedCount = gridCount({ ...current, ...patch });
      if (proposedCount > LIMITS.maxCells) {
        window.alert(
          `That would make ${proposedCount} cells — too many. Try larger cells or a smaller quilt.`,
        );
        return false;
      }
      commitChange((prev) => {
        const next = { ...prev, ...patch };
        const oldGrid = quiltGrid(prev);
        const newGrid = quiltGrid(next);
        if (oldGrid.count !== newGrid.count || oldGrid.rows !== newGrid.rows || oldGrid.cols !== newGrid.cols) {
          next.cells = resizeCells(prev.cells, oldGrid, newGrid);
        }
        return next;
      });
      return true;
    },
    [commitChange],
  );

  const applyShape = useCallback(
    (shape: CellShape) => {
      const current = latestRef.current.data;
      if (shape === current.cellShape) return;
      const candidate = { ...current, cellShape: shape };
      const count = gridCount(candidate);
      if (count > LIMITS.maxCells) {
        window.alert(
          `That shape would make ${count} cells at this size — too many. Enlarge the cells first.`,
        );
        return;
      }
      const painted = current.cells.some((c) => c !== null);
      if (
        painted &&
        !window.confirm('Switching the shape clears the painting. (You can undo this.) Continue?')
      ) {
        return;
      }
      commitChange((prev) => ({
        ...prev,
        cellShape: shape,
        cells: new Array(count).fill(null),
      }));
    },
    [commitChange],
  );

  const applyBackground = useCallback(
    (fabricId: string | null) => {
      commitChange((prev) =>
        prev.backgroundFabricId === fabricId ? prev : { ...prev, backgroundFabricId: fabricId },
      );
    },
    [commitChange],
  );

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="editor-page">
      <header className="app-header editor-header no-print">
        <button type="button" className="btn" onClick={handleBack}>
          ← My Quilts
        </button>
        <input
          className="quilt-name-input"
          value={name}
          maxLength={LIMITS.maxNameLen}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
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
              <span className="panel-title-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setShowLibrary(true)}
                  disabled={data.fabrics.length >= LIMITS.maxFabrics}
                  title="Add a fabric from My Fabrics"
                >
                  📚 My fabrics
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setEditingFabric('new')}
                  disabled={data.fabrics.length >= LIMITS.maxFabrics}
                >
                  + Add
                </button>
              </span>
            </div>
            <ul className="fabric-list">
              {data.fabrics.map((fabric) => {
                const count = totals.totals.find((t) => t.fabric.id === fabric.id)?.pieceCount ?? 0;
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
              <button
                type="button"
                className="btn"
                onClick={undo}
                disabled={history.undo.length === 0}
              >
                ↶ Undo
              </button>
              <button
                type="button"
                className="btn"
                onClick={redo}
                disabled={history.redo.length === 0}
              >
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
            {data.cellShape === 'square' && (
              <div className="cut-tools">
                <span className="cut-tools-label">Cut cells</span>
                <div className="cut-buttons" role="group" aria-label="Cut cells">
                  {CUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      className={`btn cut-btn ${tool === 'cut' && cutKind === opt.kind ? 'btn-primary' : ''}`}
                      title={opt.label}
                      aria-label={opt.label}
                      onClick={() => {
                        if (tool === 'cut' && cutKind === opt.kind) {
                          setTool('paint');
                        } else {
                          setTool('cut');
                          setCutKind(opt.kind);
                        }
                      }}
                    >
                      {opt.glyph}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <button
              type="button"
              className="panel-title-row panel-toggle"
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
            >
              <h2>Quilt size &amp; shape</h2>
              <span aria-hidden="true">{showSettings ? '▾' : '▸'}</span>
            </button>
            <p className="muted small">
              {dims.finishedWidthIn}&Prime; × {dims.finishedHeightIn}&Prime; ·{' '}
              {data.cellShape === 'square'
                ? `${dims.cols} × ${dims.rows} cells`
                : `${dims.count} pieces`}
            </p>
            {showSettings && (
              <div className="settings-grid">
                <label className="dim-field dim-field-wide">
                  Cell shape
                  <select
                    value={data.cellShape}
                    onChange={(e) => applyShape(e.target.value as CellShape)}
                  >
                    {SHAPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {SHAPE_HINTS[data.cellShape] && (
                  <p className="hint">{SHAPE_HINTS[data.cellShape]}</p>
                )}
                {stamp && (
                  <label className="dim-field dim-field-wide">
                    Background fabric
                    <select
                      value={data.backgroundFabricId ?? ''}
                      onChange={(e) => applyBackground(e.target.value || null)}
                    >
                      <option value="">— none yet —</option>
                      {data.fabrics.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                {(data.cellShape === 'square' || stamp) && (
                  <DimField
                    label="Cell height (in)"
                    value={data.cellHeightIn}
                    min={LIMITS.minCellIn}
                    max={LIMITS.maxCellIn}
                    onCommit={(v) => applyDimensions({ cellHeightIn: v })}
                  />
                )}
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
            {tool === 'cut'
              ? cutKind === 'whole'
                ? 'Tap cells to merge their cuts back into a whole cell.'
                : 'Tap or drag over cells to cut them. Then pick a fabric and paint each piece.'
              : tool === 'erase'
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
          {data.cellShape === 'square'
            ? `${dims.cols} × ${dims.rows} cells of ${data.cellWidthIn}″ × ${data.cellHeightIn}″`
            : `${dims.count} ${data.cellShape} pieces`}
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
      {showLibrary && (
        <LibraryDialog
          onPick={(fields) => {
            const added = saveFabric({ id: `f-${crypto.randomUUID().slice(0, 8)}`, ...fields });
            if (added) setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

function majorityFabric(parts: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const p of parts) {
    if (p !== null) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

function totalUsesOfFabric(cells: Cell[], fabricId: string): number {
  let n = 0;
  for (const c of cells) {
    if (c === fabricId) n++;
    else if (isSplitCell(c)) n += c.parts.filter((p) => p === fabricId).length;
  }
  return n;
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
  /** Returns false when the new value was rejected (e.g. too many cells). */
  onCommit: (v: number) => boolean;
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
    if (rounded !== value && !onCommit(rounded)) {
      setText(String(value)); // rejected — show the real value again
      return;
    }
    setText(String(rounded));
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
  /** Returns false when the fabric was refused (quilt would get too large). */
  onSave: (fabric: Fabric) => boolean;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(fabric?.name ?? '');
  const [color, setColor] = useState(
    fabric?.color ?? NEW_FABRIC_COLORS[Math.floor(Math.random() * NEW_FABRIC_COLORS.length)],
  );
  const [pattern, setPattern] = useState<PatternId>(fabric?.pattern ?? 'solid');
  const [image, setImage] = useState<string | null>(fabric?.image ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [libState, setLibState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [libError, setLibError] = useState<string | null>(null);
  /** Opens the camera directly (capture="environment"). */
  const cameraInput = useRef<HTMLInputElement>(null);
  /** Opens the photo library / camera roll (no capture attribute). */
  const libraryInput = useRef<HTMLInputElement>(null);

  // A fabric edited after saving to the library can be saved again.
  useEffect(() => {
    setLibState((s) => (s === 'saved' ? 'idle' : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, color, pattern, image]);

  async function saveToLibrary() {
    if (photoBusy || libState === 'saving') return;
    setLibState('saving');
    setLibError(null);
    try {
      await api.saveLibraryFabric({
        name: name.trim() || 'Unnamed fabric',
        color,
        pattern,
        ...(image ? { image } : {}),
      });
      setLibState('saved');
    } catch (err) {
      setLibState('error');
      setLibError(err instanceof Error ? err.message : 'Could not save to My Fabrics.');
    }
  }
  // Only dismiss when the press STARTED on the backdrop, so a drag that
  // begins inside the dialog (e.g. selecting text) can't close it.
  const pressStartedOnBackdrop = useRef(false);

  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setImage(await processFabricPhoto(file));
    } catch {
      setPhotoError("That photo couldn't be used — try taking it again.");
    } finally {
      setPhotoBusy(false);
      // Allow re-selecting the same file
      if (cameraInput.current) cameraInput.current.value = '';
      if (libraryInput.current) libraryInput.current.value = '';
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (photoBusy) return; // don't save while a photo is still processing
    onSave({
      id: fabric?.id ?? `f-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim() || 'Unnamed fabric',
      color,
      pattern,
      ...(image ? { image } : {}),
    });
  }

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose();
      }}
    >
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
          <div className="photo-section">
            <span className="photo-label">Photo or drawing of your fabric</span>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden-input"
              aria-label="Take a photo with the camera"
              onChange={(e) => handlePhotoFile(e.target.files?.[0])}
            />
            <input
              ref={libraryInput}
              type="file"
              accept="image/*"
              className="visually-hidden-input"
              aria-label="Choose a photo from your library"
              onChange={(e) => handlePhotoFile(e.target.files?.[0])}
            />
            {image ? (
              <div className="photo-preview-row">
                <img src={image} alt="Your fabric" className="photo-preview" />
                <div className="photo-preview-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => cameraInput.current?.click()}
                    disabled={photoBusy}
                  >
                    📷 Retake
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => libraryInput.current?.click()}
                    disabled={photoBusy}
                  >
                    🖼 Choose photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setDrawing(true)}
                    disabled={photoBusy}
                  >
                    🎨 Draw on it
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setImage(null)}
                    disabled={photoBusy}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="photo-buttons">
                <button
                  type="button"
                  className="btn"
                  onClick={() => cameraInput.current?.click()}
                  disabled={photoBusy}
                >
                  {photoBusy ? 'Preparing photo…' : '📷 Take a photo'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => libraryInput.current?.click()}
                  disabled={photoBusy}
                >
                  🖼 From camera roll
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDrawing(true)}
                  disabled={photoBusy}
                >
                  🎨 Draw your own
                </button>
              </div>
            )}
            {photoError && (
              <p className="form-error" role="alert">
                {photoError}
              </p>
            )}
            <p className="hint">
              {image
                ? 'Cells painted with this fabric show this image.'
                : 'Or pick a color and pattern below.'}
            </p>
          </div>
          {!image && (
            <>
              <label>
                Color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <MyColors color={color} onPick={setColor} />
              <PatternPicker color={color} value={pattern} onChange={setPattern} />
            </>
          )}
          <div className="library-save-row">
            <button
              type="button"
              className="btn btn-small"
              onClick={saveToLibrary}
              disabled={photoBusy || libState === 'saving' || libState === 'saved'}
              title="Keep this fabric on your account to reuse in other quilts"
            >
              {libState === 'saving'
                ? 'Saving…'
                : libState === 'saved'
                  ? '✓ In My Fabrics'
                  : '♡ Save to My Fabrics'}
            </button>
            {libState === 'error' && (
              <span className="form-error" role="alert">
                {libError}
              </span>
            )}
          </div>
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
            <button type="submit" className="btn btn-primary" disabled={photoBusy}>
              {photoBusy ? 'Preparing…' : fabric ? 'Save' : 'Add fabric'}
            </button>
          </div>
        </form>
      </div>
      {drawing && (
        <DrawDialog
          initialImage={image}
          onSave={(dataUrl) => {
            setImage(dataUrl);
            setDrawing(false);
          }}
          onClose={() => setDrawing(false)}
        />
      )}
    </div>
  );
}
