/**
 * Cell geometry for every quilt shape mode.
 *
 * All coordinates are in inches, origin at the quilt's top-left. This module
 * is the single source of truth for how many cells a quilt has, where they
 * sit, their areas, and their cut-piece bounding boxes — used by rendering,
 * hit-testing, and the fabric totals alike. Keep it dependency-free.
 */

export const CELL_SHAPES = [
  'square',
  'triangle',
  'hexagon',
  'octagon',
  'circle',
  'pentagon',
  'heptagon',
] as const;

export type CellShape = (typeof CELL_SHAPES)[number];

/**
 * Shapes that cannot tile the plane: they sit on a background fabric, and
 * the space between them counts toward that background's yardage.
 */
export const STAMP_SHAPES: readonly CellShape[] = ['circle', 'pentagon', 'heptagon'];

export function isStampShape(shape: CellShape): boolean {
  return STAMP_SHAPES.includes(shape);
}

export interface CellGeom {
  index: number;
  cx: number;
  cy: number;
  /** Polygon vertices in inches; undefined for circles. */
  points?: [number, number][];
  /** Circle radius; only for the circle shape. */
  r?: number;
  areaSqIn: number;
  /** Cut-piece bounding box (before seam allowance). */
  cutWIn: number;
  cutHIn: number;
}

export interface GridGeom {
  shape: CellShape;
  rows: number;
  cols: number;
  count: number;
  /** Finished quilt size implied by the layout. */
  widthIn: number;
  heightIn: number;
  cells: CellGeom[];
  /**
   * Cells per row, top to bottom. Octagon grids append one extra "row" per
   * gap row for the corner filler squares (see buildGrid).
   */
  rowLengths: number[];
}

export interface GridInput {
  widthIn: number;
  heightIn: number;
  cellWidthIn: number;
  cellHeightIn: number;
  cellShape: CellShape;
}

const SQRT3 = Math.sqrt(3);

export function buildGrid(d: GridInput): GridGeom {
  switch (d.cellShape) {
    case 'square':
      return buildSquare(d);
    case 'triangle':
      return buildTriangle(d);
    case 'hexagon':
      return buildHexagon(d);
    case 'octagon':
      return buildOctagon(d);
    case 'circle':
    case 'pentagon':
    case 'heptagon':
      return buildStamp(d);
  }
}

// ---------------------------------------------------------------------------
// Squares (the classic grid) and stamp shapes share the same row/col layout
// ---------------------------------------------------------------------------

function baseRowsCols(d: GridInput) {
  const cols = Math.max(1, Math.round(d.widthIn / d.cellWidthIn));
  const rows = Math.max(1, Math.round(d.heightIn / d.cellHeightIn));
  return { rows, cols };
}

function buildSquare(d: GridInput): GridGeom {
  const { rows, cols } = baseRowsCols(d);
  const w = d.cellWidthIn;
  const h = d.cellHeightIn;
  const cells: CellGeom[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * w;
      const y = r * h;
      cells.push({
        index: cells.length,
        cx: x + w / 2,
        cy: y + h / 2,
        points: [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
        areaSqIn: w * h,
        cutWIn: w,
        cutHIn: h,
      });
    }
  }
  return {
    shape: 'square',
    rows,
    cols,
    count: cells.length,
    widthIn: cols * w,
    heightIn: rows * h,
    cells,
    rowLengths: Array(rows).fill(cols),
  };
}

function buildStamp(d: GridInput): GridGeom {
  const { rows, cols } = baseRowsCols(d);
  const w = d.cellWidthIn;
  const h = d.cellHeightIn;
  const radius = Math.min(w, h) / 2;
  const cells: CellGeom[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * w + w / 2;
      const cy = r * h + h / 2;
      if (d.cellShape === 'circle') {
        cells.push({
          index: cells.length,
          cx,
          cy,
          r: radius,
          areaSqIn: Math.PI * radius * radius,
          cutWIn: radius * 2,
          cutHIn: radius * 2,
        });
      } else {
        const n = d.cellShape === 'pentagon' ? 5 : 7;
        const points = regularPolygon(cx, cy, radius, n);
        cells.push({
          index: cells.length,
          cx,
          cy,
          points,
          areaSqIn: (n / 2) * radius * radius * Math.sin((2 * Math.PI) / n),
          ...polygonBox(points),
        });
      }
    }
  }
  return {
    shape: d.cellShape,
    rows,
    cols,
    count: cells.length,
    widthIn: cols * w,
    heightIn: rows * h,
    cells,
    rowLengths: Array(rows).fill(cols),
  };
}

/** Regular n-gon, first vertex pointing up. */
function regularPolygon(cx: number, cy: number, r: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function polygonBox(points: [number, number][]): { cutWIn: number; cutHIn: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { cutWIn: maxX - minX, cutHIn: maxY - minY };
}

// ---------------------------------------------------------------------------
// Equilateral triangles: rows of alternating up/down triangles
// ---------------------------------------------------------------------------

function buildTriangle(d: GridInput): GridGeom {
  const s = d.cellWidthIn; // triangle side; cell height is ignored
  const h = (s * SQRT3) / 2;
  const cols = Math.max(1, Math.round(d.widthIn / s));
  const rows = Math.max(1, Math.round(d.heightIn / h));
  const perRow = 2 * cols - 1;
  const cells: CellGeom[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      const x0 = (k * s) / 2;
      const y0 = r * h;
      const y1 = y0 + h;
      const up = (k + r) % 2 === 0;
      const points: [number, number][] = up
        ? [
            [x0 + s / 2, y0],
            [x0 + s, y1],
            [x0, y1],
          ]
        : [
            [x0, y0],
            [x0 + s, y0],
            [x0 + s / 2, y1],
          ];
      cells.push({
        index: cells.length,
        cx: x0 + s / 2,
        cy: up ? y0 + (2 * h) / 3 : y0 + h / 3,
        points,
        areaSqIn: (s * h) / 2,
        cutWIn: s,
        cutHIn: h,
      });
    }
  }
  return {
    shape: 'triangle',
    rows,
    cols,
    count: cells.length,
    widthIn: cols * s,
    heightIn: rows * h,
    cells,
    rowLengths: Array(rows).fill(perRow),
  };
}

// ---------------------------------------------------------------------------
// Hexagons: pointy-top, odd rows offset by half a hex and one shorter
// ---------------------------------------------------------------------------

function buildHexagon(d: GridInput): GridGeom {
  const w = d.cellWidthIn; // flat-to-flat width; cell height is ignored
  const hexH = (2 * w) / SQRT3; // point-to-point height
  const pitch = (3 * hexH) / 4;
  const cols = Math.max(1, Math.round(d.widthIn / w));
  const rows = Math.max(1, Math.round((d.heightIn - hexH / 4) / pitch));
  const cells: CellGeom[] = [];
  const rowLengths: number[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 1;
    const inRow = offset ? Math.max(1, cols - 1) : cols;
    rowLengths.push(inRow);
    for (let c = 0; c < inRow; c++) {
      const cx = c * w + w / 2 + (offset ? w / 2 : 0);
      const cy = r * pitch + hexH / 2;
      cells.push({
        index: cells.length,
        cx,
        cy,
        points: [
          [cx, cy - hexH / 2],
          [cx + w / 2, cy - hexH / 4],
          [cx + w / 2, cy + hexH / 4],
          [cx, cy + hexH / 2],
          [cx - w / 2, cy + hexH / 4],
          [cx - w / 2, cy - hexH / 4],
        ],
        areaSqIn: (SQRT3 / 2) * w * w,
        cutWIn: w,
        cutHIn: hexH,
      });
    }
  }
  return {
    shape: 'hexagon',
    rows,
    cols,
    count: cells.length,
    widthIn: cols * w,
    heightIn: hexH + (rows - 1) * pitch,
    cells,
    rowLengths,
  };
}

// ---------------------------------------------------------------------------
// Octagons with corner squares (the "snowball" tiling)
// ---------------------------------------------------------------------------

function buildOctagon(d: GridInput): GridGeom {
  const w = d.cellWidthIn; // octagon flat-to-flat = grid spacing; height ignored
  const a = w / (1 + Math.SQRT2); // octagon side = filler square side
  const cols = Math.max(1, Math.round(d.widthIn / w));
  const rows = Math.max(1, Math.round(d.heightIn / w));
  const cells: CellGeom[] = [];
  const rowLengths: number[] = [];
  for (let r = 0; r < rows; r++) {
    rowLengths.push(cols);
    for (let c = 0; c < cols; c++) {
      const cx = c * w + w / 2;
      const cy = r * w + w / 2;
      const half = w / 2;
      const hs = a / 2;
      cells.push({
        index: cells.length,
        cx,
        cy,
        points: [
          [cx - hs, cy - half],
          [cx + hs, cy - half],
          [cx + half, cy - hs],
          [cx + half, cy + hs],
          [cx + hs, cy + half],
          [cx - hs, cy + half],
          [cx - half, cy + hs],
          [cx - half, cy - hs],
        ],
        areaSqIn: 2 * (1 + Math.SQRT2) * a * a, // regular octagon with side a
        cutWIn: w,
        cutHIn: w,
      });
    }
  }
  // Corner filler squares (rotated 45°) between each 2x2 group of octagons.
  const half = a / Math.SQRT2;
  for (let r = 1; r < rows; r++) {
    rowLengths.push(Math.max(0, cols - 1));
    for (let c = 1; c < cols; c++) {
      const cx = c * w;
      const cy = r * w;
      cells.push({
        index: cells.length,
        cx,
        cy,
        points: [
          [cx, cy - half],
          [cx + half, cy],
          [cx, cy + half],
          [cx - half, cy],
        ],
        areaSqIn: a * a,
        cutWIn: a * Math.SQRT2,
        cutHIn: a * Math.SQRT2,
      });
    }
  }
  return {
    shape: 'octagon',
    rows,
    cols,
    count: cells.length,
    widthIn: cols * w,
    heightIn: rows * w,
    cells,
    rowLengths,
  };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/**
 * Which cell contains the point (inches)? Forgiving for stamp shapes: any
 * point inside a stamp's grid slot selects that stamp, since tapping "just
 * off" a circle should still paint it.
 */
export function hitTest(g: GridGeom, x: number, y: number, d: GridInput): number | null {
  if (x < 0 || y < 0 || x > g.widthIn || y > g.heightIn) return null;
  switch (g.shape) {
    case 'square':
    case 'circle':
    case 'pentagon':
    case 'heptagon': {
      const c = Math.min(g.cols - 1, Math.floor(x / d.cellWidthIn));
      const r = Math.min(g.rows - 1, Math.floor(y / d.cellHeightIn));
      return r * g.cols + c;
    }
    case 'triangle': {
      const s = d.cellWidthIn;
      const h = (s * SQRT3) / 2;
      const r = Math.min(g.rows - 1, Math.floor(y / h));
      const perRow = 2 * g.cols - 1;
      const kGuess = Math.floor((x / s) * 2);
      for (const k of [kGuess, kGuess - 1, kGuess + 1]) {
        if (k < 0 || k >= perRow) continue;
        const idx = r * perRow + k;
        const cell = g.cells[idx];
        if (cell?.points && pointInPolygon(x, y, cell.points)) return idx;
      }
      return null;
    }
    case 'hexagon': {
      const hexH = (2 * d.cellWidthIn) / SQRT3;
      const pitch = (3 * hexH) / 4;
      const rGuess = Math.round((y - hexH / 2) / pitch);
      for (const r of [rGuess, rGuess - 1, rGuess + 1]) {
        if (r < 0 || r >= g.rows) continue;
        const before = sum(g.rowLengths.slice(0, r));
        const offset = r % 2 === 1 ? d.cellWidthIn / 2 : 0;
        const cGuess = Math.floor((x - offset) / d.cellWidthIn);
        for (const c of [cGuess, cGuess - 1, cGuess + 1]) {
          if (c < 0 || c >= g.rowLengths[r]) continue;
          const idx = before + c;
          const cell = g.cells[idx];
          if (cell?.points && pointInPolygon(x, y, cell.points)) return idx;
        }
      }
      return null;
    }
    case 'octagon': {
      // Try the octagon of the containing grid square, then nearby fillers,
      // then fall back to the octagon (forgiving).
      const w = d.cellWidthIn;
      const c = Math.min(g.cols - 1, Math.floor(x / w));
      const r = Math.min(g.rows - 1, Math.floor(y / w));
      const octIdx = r * g.cols + c;
      const oct = g.cells[octIdx];
      if (oct?.points && pointInPolygon(x, y, oct.points)) return octIdx;
      const fillerBase = g.rows * g.cols;
      const fCols = g.cols - 1;
      for (const [fr, fc] of [
        [Math.round(y / w), Math.round(x / w)],
      ] as [number, number][]) {
        if (fr >= 1 && fr < g.rows && fc >= 1 && fc < g.cols) {
          const idx = fillerBase + (fr - 1) * fCols + (fc - 1);
          const cell = g.cells[idx];
          if (cell?.points && pointInPolygon(x, y, cell.points)) return idx;
        }
      }
      return octIdx;
    }
  }
}

export function pointInPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Cell splits (square mode only): halves and quarters
// ---------------------------------------------------------------------------

export const SPLIT_KINDS = ['h2', 'v2', 'd2', 'x2', 'q4', 'x4'] as const;
export type SplitKind = (typeof SPLIT_KINDS)[number];

export function splitPartCount(kind: SplitKind): 2 | 4 {
  return kind === 'q4' || kind === 'x4' ? 4 : 2;
}

/**
 * Part polygons for a split square cell whose bounding box is
 * (x0,y0)-(x1,y1). Part order is stable and matches splitPartHit.
 */
export function splitPartPolygons(
  kind: SplitKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][][] {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  switch (kind) {
    case 'h2': // top, bottom
      return [
        [
          [x0, y0],
          [x1, y0],
          [x1, cy],
          [x0, cy],
        ],
        [
          [x0, cy],
          [x1, cy],
          [x1, y1],
          [x0, y1],
        ],
      ];
    case 'v2': // left, right
      return [
        [
          [x0, y0],
          [cx, y0],
          [cx, y1],
          [x0, y1],
        ],
        [
          [cx, y0],
          [x1, y0],
          [x1, y1],
          [cx, y1],
        ],
      ];
    case 'd2': // "\" cut: upper-right, lower-left
      return [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
        ],
        [
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ],
      ];
    case 'x2': // "/" cut: upper-left, lower-right
      return [
        [
          [x0, y0],
          [x1, y0],
          [x0, y1],
        ],
        [
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
      ];
    case 'q4': // TL, TR, BL, BR
      return [
        [
          [x0, y0],
          [cx, y0],
          [cx, cy],
          [x0, cy],
        ],
        [
          [cx, y0],
          [x1, y0],
          [x1, cy],
          [cx, cy],
        ],
        [
          [x0, cy],
          [cx, cy],
          [cx, y1],
          [x0, y1],
        ],
        [
          [cx, cy],
          [x1, cy],
          [x1, y1],
          [cx, y1],
        ],
      ];
    case 'x4': // N, E, S, W triangles meeting in the middle
      return [
        [
          [x0, y0],
          [x1, y0],
          [cx, cy],
        ],
        [
          [x1, y0],
          [x1, y1],
          [cx, cy],
        ],
        [
          [x1, y1],
          [x0, y1],
          [cx, cy],
        ],
        [
          [x0, y1],
          [x0, y0],
          [cx, cy],
        ],
      ];
  }
}

/** Which part of a split cell does a point in the unit square (0..1) hit? */
export function splitPartHit(kind: SplitKind, u: number, v: number): number {
  switch (kind) {
    case 'h2':
      return v < 0.5 ? 0 : 1;
    case 'v2':
      return u < 0.5 ? 0 : 1;
    case 'd2':
      return v < u ? 0 : 1;
    case 'x2':
      return v < 1 - u ? 0 : 1;
    case 'q4':
      return (v < 0.5 ? 0 : 2) + (u < 0.5 ? 0 : 1);
    case 'x4': {
      const north = v <= u && v <= 1 - u;
      const south = v >= u && v >= 1 - u;
      if (north) return 0;
      if (south) return 2;
      return u > 0.5 ? 1 : 3;
    }
  }
}

/** Area fraction of one part of a split. */
export function splitPartFraction(kind: SplitKind): number {
  return splitPartCount(kind) === 2 ? 0.5 : 0.25;
}
