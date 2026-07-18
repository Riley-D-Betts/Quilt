/**
 * Shared quilt model and fabric math.
 *
 * Used by both the Worker (to validate incoming data) and the client
 * (to drive the editor and the fabric totals panel). Keep this file free
 * of DOM and Workers-specific APIs.
 */

export const PATTERNS = [
  'solid',
  'dots',
  'stripes',
  'checks',
  'crosshatch',
  'flowers',
  'zigzag',
] as const;

export type PatternId = (typeof PATTERNS)[number];

export interface Fabric {
  id: string;
  name: string;
  /** Base color as #rrggbb */
  color: string;
  pattern: PatternId;
  /**
   * Optional photo of the real fabric as a small data URL (JPEG/PNG/WebP),
   * produced client-side by processFabricPhoto. When set, cells render the
   * photo instead of color+pattern.
   */
  image?: string;
}

export interface QuiltData {
  /** Target quilt width in inches (the grid is derived from this). */
  widthIn: number;
  /** Target quilt height in inches. */
  heightIn: number;
  /** Finished (sewn) size of one cell, in inches. */
  cellWidthIn: number;
  cellHeightIn: number;
  /** Seam allowance per side in inches; 0.25 is the quilting standard. */
  seamAllowanceIn: number;
  fabrics: Fabric[];
  /**
   * Row-major grid of fabric ids (or null for unassigned).
   * Length must equal rows * cols from gridDims().
   */
  cells: (string | null)[];
}

export interface QuiltSummary {
  id: string;
  name: string;
  data: QuiltData;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Limits (enforced on the server, respected in the UI)
// ---------------------------------------------------------------------------

export const LIMITS = {
  minQuiltIn: 4,
  maxQuiltIn: 240, // 20 feet is plenty even for a king with drop
  minCellIn: 0.5,
  maxCellIn: 60,
  maxCells: 10_000, // 100x100 grid
  maxFabrics: 60,
  maxNameLen: 80,
  maxFabricNameLen: 40,
  maxSeamIn: 2,
  /** Per-fabric photo budget (data-URL characters; ~110KB of JPEG). */
  maxImageChars: 150_000,
  /** Whole-quilt JSON budget, kept well under D1's per-value limits. */
  maxDataBytes: 900_000,
} as const;

// ---------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------

export interface GridDims {
  rows: number;
  cols: number;
  /** Actual finished size implied by rows/cols x cell size. */
  finishedWidthIn: number;
  finishedHeightIn: number;
}

/**
 * The grid is derived by fitting whole cells to the requested quilt size,
 * rounding to the nearest whole cell (minimum 1). The finished size is the
 * honest size the sewn quilt will end up: cells x cell size.
 */
export function gridDims(d: {
  widthIn: number;
  heightIn: number;
  cellWidthIn: number;
  cellHeightIn: number;
}): GridDims {
  const cols = Math.max(1, Math.round(d.widthIn / d.cellWidthIn));
  const rows = Math.max(1, Math.round(d.heightIn / d.cellHeightIn));
  return {
    rows,
    cols,
    finishedWidthIn: round2(cols * d.cellWidthIn),
    finishedHeightIn: round2(rows * d.cellHeightIn),
  };
}

/**
 * Rebuild the cells array after a geometry change, preserving the existing
 * painting where the old and new grids overlap (anchored at the top-left).
 */
export function resizeCells(
  oldCells: (string | null)[],
  oldDims: { rows: number; cols: number },
  newDims: { rows: number; cols: number },
): (string | null)[] {
  const next: (string | null)[] = new Array(newDims.rows * newDims.cols).fill(null);
  const copyRows = Math.min(oldDims.rows, newDims.rows);
  const copyCols = Math.min(oldDims.cols, newDims.cols);
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      next[r * newDims.cols + c] = oldCells[r * oldDims.cols + c] ?? null;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Fabric requirement math
// ---------------------------------------------------------------------------

/** Usable width of a standard quilting-cotton bolt, in inches. */
export const BOLT_WIDTH_IN = 42;

export interface FabricTotal {
  fabric: Fabric;
  cellCount: number;
  /** Cut piece size including seam allowance on every side. */
  cutWidthIn: number;
  cutHeightIn: number;
  /** Finished area actually visible in the quilt. */
  finishedSqFt: number;
  /** Total fabric consumed by the cut pieces (what she must buy at minimum). */
  cutSqFt: number;
  /**
   * Practical yardage estimate off a standard bolt: pieces are cut in strips
   * across the fabric width, so partial strips still consume a full strip's
   * length. Rounded up to the nearest 1/8 yard. Null when a single piece is
   * wider than the bolt.
   */
  yards: number | null;
}

export interface TotalsReport {
  totals: FabricTotal[];
  unassignedCells: number;
  totalCells: number;
  finishedQuiltSqFt: number;
}

export function fabricTotals(d: QuiltData): TotalsReport {
  const dims = gridDims(d);
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const cell of d.cells) {
    if (cell === null) {
      unassigned++;
    } else {
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }

  const cutW = d.cellWidthIn + 2 * d.seamAllowanceIn;
  const cutH = d.cellHeightIn + 2 * d.seamAllowanceIn;

  const totals: FabricTotal[] = d.fabrics.map((fabric) => {
    const count = counts.get(fabric.id) ?? 0;
    const finishedSqFt = (count * d.cellWidthIn * d.cellHeightIn) / 144;
    const cutSqFt = (count * cutW * cutH) / 144;
    return {
      fabric,
      cellCount: count,
      cutWidthIn: round2(cutW),
      cutHeightIn: round2(cutH),
      finishedSqFt: round2(finishedSqFt),
      cutSqFt: round2(cutSqFt),
      yards: estimateYards(count, cutW, cutH),
    };
  });

  return {
    totals,
    unassignedCells: unassigned,
    totalCells: dims.rows * dims.cols,
    finishedQuiltSqFt: round2((dims.finishedWidthIn * dims.finishedHeightIn) / 144),
  };
}

/**
 * Estimate yards needed off a BOLT_WIDTH_IN-wide bolt, cutting pieces in
 * strips across the width of fabric. Rounds up to the nearest 1/8 yard.
 */
export function estimateYards(
  pieceCount: number,
  cutWidthIn: number,
  cutHeightIn: number,
  boltWidthIn: number = BOLT_WIDTH_IN,
): number | null {
  if (pieceCount === 0) return 0;
  // Orient each piece so more fit per strip (rotating a square/rect is fine
  // for solids and most quilting prints).
  const fitA = piecesPerStrip(cutWidthIn, cutHeightIn, boltWidthIn);
  const fitB = piecesPerStrip(cutHeightIn, cutWidthIn, boltWidthIn);
  const best = [fitA, fitB]
    .filter((f) => f.perStrip > 0)
    .sort((a, b) => a.lengthNeeded(pieceCount) - b.lengthNeeded(pieceCount))[0];
  if (!best) return null; // piece larger than the bolt either way
  const inches = best.lengthNeeded(pieceCount);
  const yards = inches / 36;
  return Math.ceil(yards * 8) / 8;
}

function piecesPerStrip(acrossIn: number, alongIn: number, boltWidthIn: number) {
  const perStrip = Math.floor(boltWidthIn / acrossIn);
  return {
    perStrip,
    lengthNeeded(count: number) {
      if (perStrip <= 0) return Infinity;
      return Math.ceil(count / perStrip) * alongIn;
    },
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Construction and validation
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTE: Omit<Fabric, 'id'>[] = [
  { name: 'Cream', color: '#f5efdd', pattern: 'solid' },
  { name: 'Rose', color: '#c96a7b', pattern: 'solid' },
  { name: 'Dusty Blue', color: '#7d9bb8', pattern: 'solid' },
  { name: 'Sage', color: '#94ab8d', pattern: 'solid' },
  { name: 'Plum Dot', color: '#7b5d7e', pattern: 'dots' },
  { name: 'Goldenrod', color: '#d9a441', pattern: 'solid' },
];

export function newQuiltData(): QuiltData {
  const base: Omit<QuiltData, 'cells'> = {
    widthIn: 60,
    heightIn: 72,
    cellWidthIn: 6,
    cellHeightIn: 6,
    seamAllowanceIn: 0.25,
    fabrics: DEFAULT_PALETTE.map((f, i) => ({ ...f, id: `f${i + 1}` })),
  };
  const dims = gridDims(base);
  return { ...base, cells: new Array(dims.rows * dims.cols).fill(null) };
}

/**
 * Validate untrusted quilt data (from the network). Returns a normalized
 * copy on success, or throws a ValidationError with a human-readable message.
 */
export function validateQuiltData(raw: unknown): QuiltData {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('Quilt data must be an object.');
  }
  const o = raw as Record<string, unknown>;

  const widthIn = num(o.widthIn, 'widthIn', LIMITS.minQuiltIn, LIMITS.maxQuiltIn);
  const heightIn = num(o.heightIn, 'heightIn', LIMITS.minQuiltIn, LIMITS.maxQuiltIn);
  const cellWidthIn = num(o.cellWidthIn, 'cellWidthIn', LIMITS.minCellIn, LIMITS.maxCellIn);
  const cellHeightIn = num(o.cellHeightIn, 'cellHeightIn', LIMITS.minCellIn, LIMITS.maxCellIn);
  const seamAllowanceIn = num(o.seamAllowanceIn, 'seamAllowanceIn', 0, LIMITS.maxSeamIn);

  const dims = gridDims({ widthIn, heightIn, cellWidthIn, cellHeightIn });
  const cellCount = dims.rows * dims.cols;
  if (cellCount > LIMITS.maxCells) {
    throw new ValidationError(
      `That combination makes a ${dims.cols}x${dims.rows} grid (${cellCount} cells); the limit is ${LIMITS.maxCells}. Use larger cells or a smaller quilt.`,
    );
  }

  if (!Array.isArray(o.fabrics)) throw new ValidationError('fabrics must be an array.');
  if (o.fabrics.length > LIMITS.maxFabrics) {
    throw new ValidationError(`At most ${LIMITS.maxFabrics} fabrics per quilt.`);
  }
  const seenIds = new Set<string>();
  const fabrics: Fabric[] = o.fabrics.map((f: unknown, i: number) => {
    if (typeof f !== 'object' || f === null) throw new ValidationError(`Fabric ${i} is invalid.`);
    const fo = f as Record<string, unknown>;
    const id = str(fo.id, `fabrics[${i}].id`, 1, 40);
    if (seenIds.has(id)) throw new ValidationError(`Duplicate fabric id "${id}".`);
    seenIds.add(id);
    const name = str(fo.name, `fabrics[${i}].name`, 1, LIMITS.maxFabricNameLen);
    const color = str(fo.color, `fabrics[${i}].color`, 4, 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new ValidationError(`Fabric "${name}" has an invalid color.`);
    }
    const pattern = fo.pattern;
    if (typeof pattern !== 'string' || !(PATTERNS as readonly string[]).includes(pattern)) {
      throw new ValidationError(`Fabric "${name}" has an unknown pattern.`);
    }
    const fabric: Fabric = { id, name, color: color.toLowerCase(), pattern: pattern as PatternId };
    if (fo.image !== undefined && fo.image !== null) {
      if (typeof fo.image !== 'string' || !isFabricImage(fo.image)) {
        throw new ValidationError(`Fabric "${name}" has an invalid photo.`);
      }
      if (fo.image.length > LIMITS.maxImageChars) {
        throw new ValidationError(`Fabric "${name}"'s photo is too large.`);
      }
      fabric.image = fo.image;
    }
    return fabric;
  });

  if (!Array.isArray(o.cells)) throw new ValidationError('cells must be an array.');
  if (o.cells.length !== cellCount) {
    throw new ValidationError(
      `cells has ${o.cells.length} entries but the grid needs ${cellCount}.`,
    );
  }
  const cells: (string | null)[] = o.cells.map((c: unknown, i: number) => {
    if (c === null) return null;
    if (typeof c !== 'string' || !seenIds.has(c)) {
      throw new ValidationError(`Cell ${i} refers to an unknown fabric.`);
    }
    return c;
  });

  return { widthIn, heightIn, cellWidthIn, cellHeightIn, seamAllowanceIn, fabrics, cells };
}

export class ValidationError extends Error {}

/** A base64 data URL in one of the formats processFabricPhoto can emit. */
export function isFabricImage(s: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(s);
}

function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  if (v < min || v > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}.`);
  }
  return v;
}

function str(v: unknown, field: string, minLen: number, maxLen: number): string {
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string.`);
  const t = v.trim();
  if (t.length < minLen || t.length > maxLen) {
    throw new ValidationError(`${field} must be ${minLen}-${maxLen} characters.`);
  }
  return t;
}
