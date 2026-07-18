import { describe, expect, it } from 'vitest';
import {
  estimateYards,
  fabricTotals,
  gridDims,
  newQuiltData,
  normalizeQuiltData,
  quiltGrid,
  resizeCells,
  validateFabricFields,
  validateQuiltData,
  ValidationError,
  PATTERNS,
  type QuiltData,
} from '../src/shared/quilt';
import { buildGrid, hitTest, splitPartHit } from '../src/shared/geometry';

function makeQuilt(overrides: Partial<QuiltData> = {}): QuiltData {
  const base: QuiltData = {
    version: 2,
    widthIn: 12,
    heightIn: 12,
    cellWidthIn: 6,
    cellHeightIn: 6,
    seamAllowanceIn: 0.25,
    cellShape: 'square',
    backgroundFabricId: null,
    fabrics: [
      { id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid' },
      { id: 'blue', name: 'Blue', color: '#0000aa', pattern: 'dots' },
    ],
    cells: ['red', 'red', 'blue', null],
  };
  return { ...base, ...overrides };
}

describe('gridDims (squares)', () => {
  it('derives grid from quilt and cell size', () => {
    const d = gridDims(makeQuilt({ widthIn: 60, heightIn: 72, cells: [] }));
    expect(d).toMatchObject({ rows: 12, cols: 10, count: 120 });
    expect(d.finishedWidthIn).toBe(60);
    expect(d.finishedHeightIn).toBe(72);
  });

  it('rounds to the nearest whole cell and reports the honest finished size', () => {
    const d = gridDims(makeQuilt({ widthIn: 61, heightIn: 70, cells: [] }));
    expect(d.cols).toBe(10);
    expect(d.rows).toBe(12);
    expect(d.finishedWidthIn).toBe(60);
    expect(d.finishedHeightIn).toBe(72);
  });

  it('never returns fewer than one cell', () => {
    const d = gridDims(makeQuilt({ widthIn: 4, heightIn: 4, cellWidthIn: 60, cellHeightIn: 60, cells: [] }));
    expect(d.rows).toBe(1);
    expect(d.cols).toBe(1);
  });
});

describe('shape grids', () => {
  const base = { widthIn: 60, heightIn: 72, cellWidthIn: 6, cellHeightIn: 6 } as const;

  it('triangles: 2*cols-1 per row, area = side*height/2', () => {
    const g = buildGrid({ ...base, cellShape: 'triangle' });
    const h = (6 * Math.sqrt(3)) / 2;
    expect(g.cols).toBe(10);
    expect(g.rows).toBe(Math.round(72 / h));
    expect(g.count).toBe(g.rows * (2 * g.cols - 1));
    expect(g.cells[0].areaSqIn).toBeCloseTo((6 * h) / 2, 6);
    // A row of 2*cols-1 whole triangles covers the row rectangle minus the
    // two corner notches (real quilts fill those with half-triangles).
    const rowArea = g.cells.slice(0, 2 * g.cols - 1).reduce((a, c) => a + c.areaSqIn, 0);
    expect(rowArea).toBeCloseTo((2 * g.cols - 1) * ((6 * h) / 2), 6);
    expect(rowArea).toBeCloseTo(g.widthIn * h - (6 * h) / 2, 6);
  });

  it('hexagons: offset rows are one shorter and area is (sqrt3/2)w^2', () => {
    const g = buildGrid({ ...base, cellShape: 'hexagon' });
    expect(g.rowLengths[0]).toBe(g.cols);
    expect(g.rowLengths[1]).toBe(g.cols - 1);
    expect(g.count).toBe(g.rowLengths.reduce((a, b) => a + b, 0));
    expect(g.cells[0].areaSqIn).toBeCloseTo((Math.sqrt(3) / 2) * 36, 6);
  });

  it('octagons: fillers between each 2x2 group, and areas tile the plane', () => {
    const g = buildGrid({ ...base, cellShape: 'octagon' });
    const octs = g.rows * g.cols;
    const fillers = (g.rows - 1) * (g.cols - 1);
    expect(g.count).toBe(octs + fillers);
    // One octagon + one filler = one full grid square (interior tiling)
    const a = 6 / (1 + Math.SQRT2);
    expect(g.cells[0].areaSqIn + a * a).toBeCloseTo(36, 6);
  });

  it('circles: area pi*r^2 within each grid slot', () => {
    const g = buildGrid({ ...base, cellShape: 'circle' });
    expect(g.count).toBe(g.rows * g.cols);
    expect(g.cells[0].areaSqIn).toBeCloseTo(Math.PI * 9, 6);
  });

  it('hit-testing finds the cell whose centroid you click, for every shape', () => {
    for (const cellShape of ['square', 'triangle', 'hexagon', 'octagon', 'circle', 'pentagon', 'heptagon'] as const) {
      const input = { ...base, cellShape };
      const g = buildGrid(input);
      for (const idx of [0, Math.floor(g.count / 2), g.count - 1]) {
        const cell = g.cells[idx];
        expect(hitTest(g, cell.cx, cell.cy, input), `${cellShape} cell ${idx}`).toBe(idx);
      }
    }
  });
});

describe('split cells', () => {
  it('splitPartHit maps unit-square points to the right parts', () => {
    expect(splitPartHit('h2', 0.5, 0.2)).toBe(0);
    expect(splitPartHit('h2', 0.5, 0.8)).toBe(1);
    expect(splitPartHit('v2', 0.2, 0.5)).toBe(0);
    expect(splitPartHit('d2', 0.9, 0.1)).toBe(0); // above the "\" diagonal
    expect(splitPartHit('d2', 0.1, 0.9)).toBe(1);
    expect(splitPartHit('x2', 0.1, 0.1)).toBe(0); // above the "/" diagonal
    expect(splitPartHit('x2', 0.9, 0.9)).toBe(1);
    expect(splitPartHit('q4', 0.8, 0.8)).toBe(3);
    expect(splitPartHit('x4', 0.5, 0.1)).toBe(0); // north triangle
    expect(splitPartHit('x4', 0.5, 0.9)).toBe(2); // south
  });

  it('totals count split parts as half/quarter areas with sensible cut boxes', () => {
    const q = makeQuilt({
      seamAllowanceIn: 0,
      cells: [
        { split: 'd2', parts: ['red', 'blue'] },
        { split: 'q4', parts: ['red', 'red', null, null] },
        null,
        null,
      ],
    });
    const report = fabricTotals(q);
    const red = report.totals.find((t) => t.fabric.id === 'red')!;
    const blue = report.totals.find((t) => t.fabric.id === 'blue')!;
    // red: one half (18 sq in) + two quarters (9 each) = 36 sq in finished
    expect(red.finishedSqFt).toBeCloseTo(36 / 144, 2);
    expect(red.pieceCount).toBe(3);
    // diagonal half's cut box is the full cell; quarters are 3x3
    expect(red.groups.map((g) => `${g.cutWIn}x${g.cutHIn}x${g.count}`).sort()).toEqual(
      ['3x3x2', '6x6x1'].sort(),
    );
    expect(blue.pieceCount).toBe(1);
    expect(report.unassignedCells).toBe(4); // 2 empty cells + 2 empty quarters
    expect(report.totalCells).toBe(8); // 2 + 4 + 1 + 1 pieces
  });

  it('validation rejects splits off square grids and wrong part counts', () => {
    expect(() =>
      validateQuiltData(
        makeQuilt({
          cellShape: 'hexagon',
          cells: [], // wrong length too, but the split check happens per-cell
        }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateQuiltData(
        makeQuilt({ cells: [{ split: 'h2', parts: ['red', 'red', 'red'] } as never, null, null, null] }),
      ),
    ).toThrow(/parts/);
    expect(() =>
      validateQuiltData(
        makeQuilt({ cells: [{ split: 'diag' as never, parts: ['red', 'red'] }, null, null, null] }),
      ),
    ).toThrow(/split/);
  });

  it('round-trips a valid split cell', () => {
    const q = makeQuilt({
      cells: [{ split: 'x4', parts: ['red', null, 'blue', null] }, null, null, null],
    });
    const validated = validateQuiltData(q);
    expect(validated.cells[0]).toEqual({ split: 'x4', parts: ['red', null, 'blue', null] });
  });
});

describe('stamp shapes and background fabric', () => {
  it('attributes the between-shapes area to the background fabric', () => {
    const q = makeQuilt({
      cellShape: 'circle',
      backgroundFabricId: 'blue',
      seamAllowanceIn: 0,
      cells: ['red', 'red', 'red', 'red'],
    });
    const report = fabricTotals(q);
    const red = report.totals.find((t) => t.fabric.id === 'red')!;
    const blue = report.totals.find((t) => t.fabric.id === 'blue')!;
    // 4 circles of area pi*9 in a 12x12 quilt
    expect(red.finishedSqFt).toBeCloseTo((4 * Math.PI * 9) / 144, 2);
    expect(blue.pieceCount).toBe(1); // one background panel
    expect(report.backgroundSqFt).toBeCloseTo((144 - 4 * Math.PI * 9) / 144, 2);
    expect(report.backgroundAssigned).toBe(true);
  });

  it('warns when no background fabric is chosen', () => {
    const report = fabricTotals(makeQuilt({ cellShape: 'circle', cells: ['red', null, null, null] }));
    expect(report.backgroundAssigned).toBe(false);
    expect(report.backgroundSqFt).toBeGreaterThan(0);
  });

  it('validates backgroundFabricId against the fabric list', () => {
    expect(() =>
      validateQuiltData(makeQuilt({ backgroundFabricId: 'ghost' })),
    ).toThrow(/background/);
  });
});

describe('fabricTotals (squares)', () => {
  it('counts cells and computes finished and cut square footage', () => {
    const report = fabricTotals(makeQuilt());
    const red = report.totals.find((t) => t.fabric.id === 'red')!;
    expect(red.pieceCount).toBe(2);
    expect(red.finishedSqFt).toBe(0.5); // two 6x6 cells = 72 sq in
    expect(red.groups).toEqual([{ cutWIn: 6.5, cutHIn: 6.5, count: 2 }]);
    expect(red.cutSqFt).toBeCloseTo((2 * 6.5 * 6.5) / 144, 2);
    expect(report.unassignedCells).toBe(1);
    expect(report.totalCells).toBe(4);
    expect(report.finishedQuiltSqFt).toBe(1);
    expect(report.backgroundSqFt).toBeNull();
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
    expect(estimateYards(4, 21, 3)).toBe(0.25); // 2 strips x 3" = 6" beats 21"
  });

  it('returns null when a piece cannot fit on the bolt either way', () => {
    expect(estimateYards(1, 50, 50)).toBeNull();
  });
});

describe('resizeCells', () => {
  it('preserves the overlapping region on square grids', () => {
    const q = makeQuilt({ widthIn: 18, heightIn: 12, cells: ['a', 'b', 'c', 'd', 'e', 'f'] as never });
    const oldGrid = quiltGrid(q);
    const newGrid = quiltGrid({ ...q, widthIn: 12, heightIn: 18 });
    const next = resizeCells(q.cells, oldGrid, newGrid);
    // 2x3 -> 3x2: keep the left 2 columns of the first 2 rows
    expect(next).toEqual(['a', 'b', 'd', 'e', null, null]);
  });

  it('resets when the shape changes', () => {
    const q = makeQuilt();
    const oldGrid = quiltGrid(q);
    const newGrid = quiltGrid({ ...q, cellShape: 'hexagon' });
    const next = resizeCells(q.cells, oldGrid, newGrid);
    expect(next.every((c) => c === null)).toBe(true);
    expect(next.length).toBe(newGrid.count);
  });
});

describe('v1 upgrade', () => {
  const v1 = {
    widthIn: 12,
    heightIn: 12,
    cellWidthIn: 6,
    cellHeightIn: 6,
    seamAllowanceIn: 0.25,
    fabrics: [{ id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid' }],
    cells: ['red', null, null, null],
  };

  it('normalizes v1 data to v2 squares', () => {
    const up = normalizeQuiltData(v1);
    expect(up.version).toBe(2);
    expect(up.cellShape).toBe('square');
    expect(up.backgroundFabricId).toBeNull();
    expect(up.cells).toEqual(['red', null, null, null]);
  });

  it('validateQuiltData accepts raw v1 data', () => {
    const validated = validateQuiltData(v1);
    expect(validated.version).toBe(2);
    expect(validated.cellShape).toBe('square');
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
      validateQuiltData(
        makeQuilt({ widthIn: 240, heightIn: 240, cellWidthIn: 0.5, cellHeightIn: 0.5 }),
      ),
    ).toThrow(/limit/);
  });

  it('rejects bad colors, unknown patterns, and unknown shapes', () => {
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
    expect(() => validateQuiltData(makeQuilt({ cellShape: 'star' as never }))).toThrow(/shape/);
  });

  it('accepts a fabric image as a small data URL and rejects junk', () => {
    const image = 'data:image/jpeg;base64,' + 'A'.repeat(400);
    const good = validateQuiltData(
      makeQuilt({
        fabrics: [{ id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid', image }],
        cells: ['red', null, null, null],
      }),
    );
    expect(good.fabrics[0].image).toBe(image);

    for (const bad of [
      'https://example.com/fabric.jpg',
      'data:text/html;base64,QUFB',
      'data:image/jpeg;base64,not*base64!',
    ]) {
      expect(() =>
        validateQuiltData(
          makeQuilt({
            fabrics: [{ id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid', image: bad }],
            cells: [null, null, null, null],
          }),
        ),
      ).toThrow(/photo/);
    }
  });

  it('rejects an oversized fabric image', () => {
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);
    expect(() =>
      validateQuiltData(
        makeQuilt({
          fabrics: [{ id: 'red', name: 'Red', color: '#aa0000', pattern: 'solid', image: huge }],
          cells: [null, null, null, null],
        }),
      ),
    ).toThrow(/too large/);
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

describe('validateFabricFields (library fabrics)', () => {
  it('accepts every built-in pattern', () => {
    for (const pattern of PATTERNS) {
      const f = validateFabricFields({ name: 'Test', color: '#aabbcc', pattern });
      expect(f.pattern).toBe(pattern);
    }
  });

  it('accepts an image and normalizes the color', () => {
    const image = 'data:image/png;base64,' + 'B'.repeat(200);
    const f = validateFabricFields({ name: ' Stash ', color: '#AABBCC', pattern: 'solid', image });
    expect(f).toEqual({ name: 'Stash', color: '#aabbcc', pattern: 'solid', image });
  });

  it('rejects bad fields', () => {
    expect(() => validateFabricFields(null)).toThrow(ValidationError);
    expect(() => validateFabricFields({ name: '', color: '#aabbcc', pattern: 'solid' })).toThrow();
    expect(() =>
      validateFabricFields({ name: 'X', color: 'blue', pattern: 'solid' }),
    ).toThrow(/color/);
    expect(() =>
      validateFabricFields({ name: 'X', color: '#aabbcc', pattern: 'toile' }),
    ).toThrow(/pattern/);
    expect(() =>
      validateFabricFields({ name: 'X', color: '#aabbcc', pattern: 'solid', image: 'nope' }),
    ).toThrow(/photo/);
  });
});

describe('newQuiltData', () => {
  it('creates a consistent default quilt', () => {
    const q = newQuiltData();
    const dims = gridDims(q);
    expect(q.cells.length).toBe(dims.count);
    expect(() => validateQuiltData(q)).not.toThrow();
  });
});
