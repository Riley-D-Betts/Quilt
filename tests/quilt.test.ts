import { describe, expect, it } from 'vitest';
import {
  estimateYards,
  fabricTotals,
  gridDims,
  newQuiltData,
  resizeCells,
  validateQuiltData,
  ValidationError,
  type QuiltData,
} from '../src/shared/quilt';

function makeQuilt(overrides: Partial<QuiltData> = {}): QuiltData {
  const base: QuiltData = {
    widthIn: 12,
    heightIn: 12,
    cellWidthIn: 6,
    cellHeightIn: 6,
    seamAllowanceIn: 0.25,
    fabrics: [
      { id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid' },
      { id: 'blue', name: 'Blue', color: '#0000aa', pattern: 'dots' },
    ],
    cells: ['red', 'red', 'blue', null],
  };
  return { ...base, ...overrides };
}

describe('gridDims', () => {
  it('derives grid from quilt and cell size', () => {
    expect(gridDims({ widthIn: 60, heightIn: 72, cellWidthIn: 6, cellHeightIn: 6 })).toEqual({
      rows: 12,
      cols: 10,
      finishedWidthIn: 60,
      finishedHeightIn: 72,
    });
  });

  it('rounds to the nearest whole cell and reports the honest finished size', () => {
    const d = gridDims({ widthIn: 61, heightIn: 70, cellWidthIn: 6, cellHeightIn: 6 });
    expect(d.cols).toBe(10);
    expect(d.rows).toBe(12);
    expect(d.finishedWidthIn).toBe(60);
    expect(d.finishedHeightIn).toBe(72);
  });

  it('never returns fewer than one cell', () => {
    const d = gridDims({ widthIn: 4, heightIn: 4, cellWidthIn: 60, cellHeightIn: 60 });
    expect(d.rows).toBe(1);
    expect(d.cols).toBe(1);
  });
});

describe('fabricTotals', () => {
  it('counts cells and computes finished and cut square footage', () => {
    const report = fabricTotals(makeQuilt());
    const red = report.totals.find((t) => t.fabric.id === 'red')!;
    // Two 6x6 finished cells = 72 sq in = 0.5 sq ft
    expect(red.cellCount).toBe(2);
    expect(red.finishedSqFt).toBe(0.5);
    // Cut size 6.5 x 6.5 => 2 * 42.25 / 144
    expect(red.cutWidthIn).toBe(6.5);
    expect(red.cutSqFt).toBeCloseTo((2 * 6.5 * 6.5) / 144, 2);
    expect(report.unassignedCells).toBe(1);
    expect(report.totalCells).toBe(4);
    expect(report.finishedQuiltSqFt).toBe(1);
  });

  it('handles zero seam allowance', () => {
    const report = fabricTotals(makeQuilt({ seamAllowanceIn: 0 }));
    const red = report.totals.find((t) => t.fabric.id === 'red')!;
    expect(red.cutSqFt).toBe(red.finishedSqFt);
  });
});

describe('estimateYards', () => {
  it('returns 0 for zero pieces', () => {
    expect(estimateYards(0, 6.5, 6.5)).toBe(0);
  });

  it('computes strips across a 42-inch bolt, rounded up to eighth yards', () => {
    // 6.5" pieces: 6 per strip. 12 pieces -> 2 strips -> 13" -> 0.361 yd -> 3/8 yd.
    expect(estimateYards(12, 6.5, 6.5)).toBe(0.375);
  });

  it('rotates pieces when that saves fabric', () => {
    // 21x3 pieces: 2 fit across as-is (3" per strip of length), rotated 14 fit across (21" strips).
    // 14 pieces: as-is 7 strips x 3" = 21"; rotated 1 strip x 21" = 21". Same.
    // 4 pieces: as-is 2 strips x 3" = 6"; rotated 1 strip x 21" = 21". Prefers 6".
    expect(estimateYards(4, 21, 3)).toBe(0.25); // 6" -> 0.1667yd -> 0.25
  });

  it('returns null when a piece cannot fit on the bolt either way', () => {
    expect(estimateYards(1, 50, 50)).toBeNull();
  });
});

describe('resizeCells', () => {
  it('preserves the overlapping top-left region', () => {
    // 2x3 grid -> 3x2 grid
    const oldCells = ['a', 'b', 'c', 'd', 'e', 'f'];
    const next = resizeCells(oldCells, { rows: 2, cols: 3 }, { rows: 3, cols: 2 });
    expect(next).toEqual(['a', 'b', 'd', 'e', null, null]);
  });
});

describe('validateQuiltData', () => {
  it('accepts a valid quilt and normalizes colors', () => {
    const raw = makeQuilt({
      fabrics: [{ id: 'red', name: ' Red ', color: '#AA0000', pattern: 'solid' }],
      cells: ['red', null, null, null],
    });
    const result = validateQuiltData(raw);
    expect(result.fabrics[0].color).toBe('#aa0000');
    expect(result.fabrics[0].name).toBe('Red');
  });

  it('rejects a cells array that does not match the grid', () => {
    expect(() => validateQuiltData(makeQuilt({ cells: ['red'] }))).toThrow(ValidationError);
  });

  it('rejects cells that reference unknown fabrics', () => {
    expect(() =>
      validateQuiltData(makeQuilt({ cells: ['nope', null, null, null] })),
    ).toThrow(/unknown fabric/);
  });

  it('rejects out-of-range dimensions', () => {
    expect(() => validateQuiltData(makeQuilt({ widthIn: 9999 }))).toThrow(ValidationError);
    expect(() => validateQuiltData(makeQuilt({ cellWidthIn: 0 }))).toThrow(ValidationError);
    expect(() => validateQuiltData(makeQuilt({ seamAllowanceIn: -1 }))).toThrow(ValidationError);
  });

  it('rejects grids over the cell limit', () => {
    expect(() =>
      validateQuiltData(makeQuilt({ widthIn: 240, heightIn: 240, cellWidthIn: 0.5, cellHeightIn: 0.5 })),
    ).toThrow(/limit/);
  });

  it('rejects bad colors and unknown patterns', () => {
    expect(() =>
      validateQuiltData(
        makeQuilt({ fabrics: [{ id: 'red', name: 'Red', color: 'red', pattern: 'solid' }], cells: [null, null, null, null] }),
      ),
    ).toThrow(/color/);
    expect(() =>
      validateQuiltData(
        makeQuilt({
          fabrics: [{ id: 'red', name: 'Red', color: '#aa0000', pattern: 'paisley' as never }],
          cells: [null, null, null, null],
        }),
      ),
    ).toThrow(/pattern/);
  });

  it('rejects duplicate fabric ids', () => {
    expect(() =>
      validateQuiltData(
        makeQuilt({
          fabrics: [
            { id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid' },
            { id: 'red', name: 'Red 2', color: '#bb0000', pattern: 'solid' },
          ],
        }),
      ),
    ).toThrow(/Duplicate/);
  });
});

describe('newQuiltData', () => {
  it('creates a consistent default quilt', () => {
    const q = newQuiltData();
    const dims = gridDims(q);
    expect(q.cells.length).toBe(dims.rows * dims.cols);
    expect(() => validateQuiltData(q)).not.toThrow();
  });
});
