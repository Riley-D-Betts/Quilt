/**
 * Shared quilt model and fabric math.
 *
 * Used by both the Worker (to validate incoming data) and the client
 * (to drive the editor and the fabric totals panel). Keep this file free
 * of DOM and Workers-specific APIs.
 *
 * Data model v2: a quilt has a cell shape (squares, triangles, hexagons,
 * octagons-with-corner-squares, or "stamp" shapes on a background fabric),
 * and square cells can be split into halves or quarters. v1 data (plain
 * square grids) upgrades transparently via normalizeQuiltData.
 */
import {
  buildGrid,
  gridCount,
  isStampShape,
  offsetPolygonBBox,
  splitPartCount,
  splitPartFraction,
  splitPartPolygons,
  CELL_SHAPES,
  SPLIT_KINDS,
  type CellGeom,
  type CellShape,
  type GridGeom,
  type SplitKind,
} from './geometry';

export type { CellShape, SplitKind };
export { CELL_SHAPES, SPLIT_KINDS, isStampShape };

import { PATTERN_IDS } from './patternCatalog';

/** Every valid pattern id (the searchable catalog, ~250 entries). */
export const PATTERNS: readonly string[] = PATTERN_IDS;
const PATTERN_ID_SET = new Set(PATTERN_IDS);

export type PatternId = string;

export interface Fabric {
  id: string;
  name: string;
  /** Base (background) color as #rrggbb */
  color: string;
  /**
   * Optional secondary color for the pattern motif, as #rrggbb. When absent
   * the motif uses an automatic contrast tone derived from the base color.
   */
  color2?: string;
  pattern: PatternId;
  /**
   * Optional image of the real fabric as a small data URL (JPEG/PNG/WebP) —
   * a photo or a drawing made in the app. When set, cells render the image
   * instead of color+pattern.
   */
  image?: string;
}

/** A split square cell: independent fabric per part. */
export interface SplitCell {
  split: SplitKind;
  parts: (string | null)[];
}

/** One paintable cell: a fabric id, empty, or a split square. */
export type Cell = string | null | SplitCell;

export function isSplitCell(cell: Cell): cell is SplitCell {
  return typeof cell === 'object' && cell !== null;
}

export interface QuiltData {
  version: 2;
  /** Target quilt width in inches (the grid is derived from this). */
  widthIn: number;
  heightIn: number;
  /**
   * Cell size in inches. For triangles this is the triangle side; for
   * hexagons the flat-to-flat width; for octagons the grid spacing —
   * those shapes derive their height from the width.
   */
  cellWidthIn: number;
  cellHeightIn: number;
  /** Seam allowance per side in inches; 0.25 is the quilting standard. */
  seamAllowanceIn: number;
  cellShape: CellShape;
  /** For stamp shapes (circle/pentagon/heptagon): the fabric behind them. */
  backgroundFabricId: string | null;
  fabrics: Fabric[];
  /** Cells in the geometry module's index order (see buildGrid). */
  cells: Cell[];
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
  maxCells: 10_000,
  maxFabrics: 60,
  maxNameLen: 80,
  maxFabricNameLen: 40,
  maxSeamIn: 2,
  /** Per-fabric image budget (data-URL characters; ~110KB of JPEG). */
  maxImageChars: 150_000,
  /** Whole-quilt JSON budget, kept well under D1's per-value limits. */
  maxDataBytes: 900_000,
  /** Saved fabrics per account in the personal library. */
  maxLibraryFabrics: 300,
  /** Saved colors per account in the personal palette. */
  maxLibraryColors: 200,
} as const;

// ---------------------------------------------------------------------------
// Grid geometry (thin wrappers over the geometry module)
// ---------------------------------------------------------------------------

export interface GridDims {
  rows: number;
  cols: number;
  /** Total paintable cells (differs from rows*cols for some shapes). */
  count: number;
  finishedWidthIn: number;
  finishedHeightIn: number;
}

export function quiltGrid(d: QuiltData): GridGeom {
  return buildGrid({
    widthIn: d.widthIn,
    heightIn: d.heightIn,
    cellWidthIn: d.cellWidthIn,
    cellHeightIn: d.cellHeightIn,
    cellShape: d.cellShape,
  });
}

export function gridDims(d: QuiltData): GridDims {
  const g = quiltGrid(d);
  return {
    rows: g.rows,
    cols: g.cols,
    count: g.count,
    finishedWidthIn: round2(g.widthIn),
    finishedHeightIn: round2(g.heightIn),
  };
}

/**
 * Rebuild the cells array after a geometry change, preserving the painting
 * row by row where the old and new grids overlap. Octagon grids copy their
 * octagon and corner-square sections independently.
 */
export function resizeCells(oldCells: Cell[], oldGrid: GridGeom, newGrid: GridGeom): Cell[] {
  if (oldGrid.shape !== newGrid.shape) {
    return new Array(newGrid.count).fill(null);
  }
  const next: Cell[] = new Array(newGrid.count).fill(null);
  const copySection = (
    oldLens: number[],
    newLens: number[],
    oldBase: number,
    newBase: number,
  ) => {
    let oldOffset = oldBase;
    let newOffset = newBase;
    const rows = Math.min(oldLens.length, newLens.length);
    for (let r = 0; r < rows; r++) {
      const copy = Math.min(oldLens[r], newLens[r]);
      for (let k = 0; k < copy; k++) {
        next[newOffset + k] = oldCells[oldOffset + k] ?? null;
      }
      oldOffset += oldLens[r];
      newOffset += newLens[r];
    }
  };
  if (oldGrid.shape === 'octagon') {
    // rowLengths = [octagon rows..., filler rows...]
    copySection(
      oldGrid.rowLengths.slice(0, oldGrid.rows),
      newGrid.rowLengths.slice(0, newGrid.rows),
      0,
      0,
    );
    copySection(
      oldGrid.rowLengths.slice(oldGrid.rows),
      newGrid.rowLengths.slice(newGrid.rows),
      oldGrid.rows * oldGrid.cols,
      newGrid.rows * newGrid.cols,
    );
  } else {
    copySection(oldGrid.rowLengths, newGrid.rowLengths, 0, 0);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Fabric requirement math
// ---------------------------------------------------------------------------

/** Usable width of a standard quilting-cotton bolt, in inches. */
export const BOLT_WIDTH_IN = 42;

/** Pieces of one cut size (seam allowance already included). */
export interface PieceGroup {
  cutWIn: number;
  cutHIn: number;
  count: number;
}

export interface FabricTotal {
  fabric: Fabric;
  pieceCount: number;
  /** Distinct cut sizes for this fabric, largest first. */
  groups: PieceGroup[];
  /** Finished area actually visible in the quilt. */
  finishedSqFt: number;
  /** Total fabric consumed by the cut pieces (what she must buy at minimum). */
  cutSqFt: number;
  /** Practical yardage estimate; null when a piece can't fit on the bolt. */
  yards: number | null;
}

export interface TotalsReport {
  totals: FabricTotal[];
  unassignedCells: number;
  totalCells: number;
  finishedQuiltSqFt: number;
  /** Stamp shapes only: the background area between the shapes, in sq ft. */
  backgroundSqFt: number | null;
  /** Stamp shapes only: false when no background fabric has been chosen. */
  backgroundAssigned: boolean;
}

export function fabricTotals(d: QuiltData): TotalsReport {
  const grid = quiltGrid(d);
  const seam = d.seamAllowanceIn;

  interface Acc {
    areaSqIn: number;
    finishedSqIn: number;
    groups: Map<string, PieceGroup>;
    pieceCount: number;
  }
  const acc = new Map<string, Acc>();
  /** cutW/cutH are FINAL cut sizes — seam allowance already included. */
  const bump = (fabricId: string, areaSqIn: number, cutW: number, cutH: number, pieces = 1) => {
    let a = acc.get(fabricId);
    if (!a) {
      a = { areaSqIn: 0, finishedSqIn: 0, groups: new Map(), pieceCount: 0 };
      acc.set(fabricId, a);
    }
    const w = round2(cutW);
    const h = round2(cutH);
    a.finishedSqIn += areaSqIn;
    a.areaSqIn += pieces * w * h;
    a.pieceCount += pieces;
    const key = `${w}x${h}`;
    const g = a.groups.get(key);
    if (g) g.count += pieces;
    else a.groups.set(key, { cutWIn: w, cutHIn: h, count: pieces });
  };

  /**
   * The true cut rectangle: the piece's cutting-orientation polygon offset
   * outward by the seam allowance on EVERY side. For diagonal edges this is
   * bigger than bbox+2*seam — e.g. a 6" half-square triangle needs a ~6.85"
   * square, matching the quilter's "add 7/8" rule.
   */
  const cutBoxFor = (geom: CellGeom): { w: number; h: number } => {
    if (geom.r !== undefined) {
      return { w: 2 * geom.r + 2 * seam, h: 2 * geom.r + 2 * seam };
    }
    return offsetPolygonBBox(geom.cutPoints ?? geom.points!, seam);
  };

  let unassigned = 0;
  let stampAreaSqIn = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    const geom = grid.cells[i];
    const cell = d.cells[i] ?? null;
    stampAreaSqIn += geom.areaSqIn;
    if (cell === null) {
      unassigned++;
    } else if (typeof cell === 'string') {
      const box = cutBoxFor(geom);
      bump(cell, geom.areaSqIn, box.w, box.h);
    } else {
      const polys = splitPartPolygons(cell.split, 0, 0, geom.cutWIn, geom.cutHIn);
      const fraction = splitPartFraction(cell.split);
      for (let p = 0; p < cell.parts.length; p++) {
        const part = cell.parts[p];
        if (part === null) {
          unassigned++;
          continue;
        }
        const box = offsetPolygonBBox(polys[p], seam);
        bump(part, geom.areaSqIn * fraction, box.w, box.h);
      }
    }
  }

  const finishedSqIn = grid.widthIn * grid.heightIn;
  const stamp = isStampShape(d.cellShape);
  let backgroundSqFt: number | null = null;
  let backgroundAssigned = true;
  if (stamp) {
    const bgSqIn = Math.max(0, finishedSqIn - stampAreaSqIn);
    backgroundSqFt = round2(bgSqIn / 144);
    const bg = d.backgroundFabricId
      ? d.fabrics.find((f) => f.id === d.backgroundFabricId)
      : undefined;
    if (bg) {
      // The background panel: quilts wider than the bolt are pieced from
      // bolt-width lengths, which is also how the yardage is estimated
      // (one full-width panel per strip — a dash here would leave the
      // biggest purchase of a stamp quilt without a number).
      const panelW = grid.widthIn + 2 * seam;
      const panelH = grid.heightIn + 2 * seam;
      const panels = Math.max(1, Math.ceil(panelW / BOLT_WIDTH_IN));
      // finished area is the true between-shapes area, not the purchase area
      bump(bg.id, bgSqIn, Math.min(panelW, BOLT_WIDTH_IN), panelH, panels);
    } else {
      backgroundAssigned = false;
    }
  }

  const totals: FabricTotal[] = d.fabrics.map((fabric) => {
    const a = acc.get(fabric.id);
    const groups = a
      ? [...a.groups.values()].sort((g1, g2) => g2.cutWIn * g2.cutHIn - g1.cutWIn * g1.cutHIn)
      : [];
    return {
      fabric,
      pieceCount: a?.pieceCount ?? 0,
      groups,
      finishedSqFt: round2((a?.finishedSqIn ?? 0) / 144),
      cutSqFt: round2((a?.areaSqIn ?? 0) / 144),
      yards: estimateYardsForGroups(groups),
    };
  });

  return {
    totals,
    unassignedCells: unassigned,
    totalCells: countPieces(d, grid),
    finishedQuiltSqFt: round2(finishedSqIn / 144),
    backgroundSqFt,
    backgroundAssigned,
  };
}

function countPieces(d: QuiltData, grid: GridGeom): number {
  let n = 0;
  for (let i = 0; i < grid.count; i++) {
    const cell = d.cells[i] ?? null;
    n += isSplitCell(cell) ? cell.parts.length : 1;
  }
  return n;
}

/**
 * Estimate yards for a mixed set of cut sizes off a BOLT_WIDTH_IN-wide bolt:
 * each size is cut in its own strips across the width of fabric; lengths
 * add up and round up to the nearest 1/8 yard at the end.
 */
export function estimateYardsForGroups(
  groups: PieceGroup[],
  boltWidthIn: number = BOLT_WIDTH_IN,
): number | null {
  let totalInches = 0;
  for (const g of groups) {
    if (g.count === 0) continue;
    const fitA = piecesPerStrip(g.cutWIn, g.cutHIn, boltWidthIn);
    const fitB = piecesPerStrip(g.cutHIn, g.cutWIn, boltWidthIn);
    const best = [fitA, fitB]
      .filter((f) => f.perStrip > 0)
      .sort((a, b) => a.lengthNeeded(g.count) - b.lengthNeeded(g.count))[0];
    if (!best) return null; // piece larger than the bolt either way
    totalInches += best.lengthNeeded(g.count);
  }
  if (totalInches === 0) return 0;
  return Math.ceil((totalInches / 36) * 8) / 8;
}

/** Single-size convenience wrapper (also used by tests). */
export function estimateYards(
  pieceCount: number,
  cutWidthIn: number,
  cutHeightIn: number,
  boltWidthIn: number = BOLT_WIDTH_IN,
): number | null {
  if (pieceCount === 0) return 0;
  return estimateYardsForGroups(
    [{ cutWIn: cutWidthIn, cutHIn: cutHeightIn, count: pieceCount }],
    boltWidthIn,
  );
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
// Construction, upgrade, and validation
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
    version: 2,
    widthIn: 60,
    heightIn: 72,
    cellWidthIn: 6,
    cellHeightIn: 6,
    seamAllowanceIn: 0.25,
    cellShape: 'square',
    backgroundFabricId: null,
    fabrics: DEFAULT_PALETTE.map((f, i) => ({ ...f, id: `f${i + 1}` })),
  };
  const dims = gridDims({ ...base, cells: [] });
  return { ...base, cells: new Array(dims.count).fill(null) };
}

/**
 * Upgrade stored data of any version to the current shape without
 * validating it (validation is the server's job on write). Client code
 * should run every fetched quilt through this.
 */
export function normalizeQuiltData(raw: any): QuiltData {
  if (raw && typeof raw === 'object' && raw.version === 2) return raw as QuiltData;
  return {
    version: 2,
    widthIn: raw?.widthIn ?? 60,
    heightIn: raw?.heightIn ?? 72,
    cellWidthIn: raw?.cellWidthIn ?? 6,
    cellHeightIn: raw?.cellHeightIn ?? 6,
    seamAllowanceIn: raw?.seamAllowanceIn ?? 0.25,
    cellShape: 'square',
    backgroundFabricId: null,
    fabrics: Array.isArray(raw?.fabrics) ? raw.fabrics : [],
    cells: Array.isArray(raw?.cells) ? raw.cells : [],
  };
}

/**
 * Validate untrusted quilt data (from the network). Accepts v1 or v2 input
 * and returns a normalized v2 copy on success, or throws a ValidationError
 * with a human-readable message.
 */
export function validateQuiltData(raw: unknown): QuiltData {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('Quilt data must be an object.');
  }
  const o = normalizeQuiltData(raw) as Record<string, any>;

  const widthIn = num(o.widthIn, 'widthIn', LIMITS.minQuiltIn, LIMITS.maxQuiltIn);
  const heightIn = num(o.heightIn, 'heightIn', LIMITS.minQuiltIn, LIMITS.maxQuiltIn);
  const cellWidthIn = num(o.cellWidthIn, 'cellWidthIn', LIMITS.minCellIn, LIMITS.maxCellIn);
  const cellHeightIn = num(o.cellHeightIn, 'cellHeightIn', LIMITS.minCellIn, LIMITS.maxCellIn);
  const seamAllowanceIn = num(o.seamAllowanceIn, 'seamAllowanceIn', 0, LIMITS.maxSeamIn);

  const cellShape = o.cellShape;
  if (typeof cellShape !== 'string' || !(CELL_SHAPES as readonly string[]).includes(cellShape)) {
    throw new ValidationError('Unknown cell shape.');
  }

  const gridInput = {
    widthIn,
    heightIn,
    cellWidthIn,
    cellHeightIn,
    cellShape: cellShape as CellShape,
  };
  // Check the count BEFORE building the grid: buildGrid materializes every
  // polygon, and a crafted 500k-cell request must 400, not exhaust memory.
  const approxCount = gridCount(gridInput);
  if (approxCount > LIMITS.maxCells) {
    throw new ValidationError(
      `That combination makes ${approxCount} cells; the limit is ${LIMITS.maxCells}. Use larger cells or a smaller quilt.`,
    );
  }
  const grid = buildGrid(gridInput);

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
    const fields = validateFabricFields(fo, `fabrics[${i}]`);
    return { id, ...fields };
  });

  let backgroundFabricId: string | null = null;
  if (o.backgroundFabricId !== null && o.backgroundFabricId !== undefined) {
    if (typeof o.backgroundFabricId !== 'string' || !seenIds.has(o.backgroundFabricId)) {
      throw new ValidationError('backgroundFabricId refers to an unknown fabric.');
    }
    backgroundFabricId = o.backgroundFabricId;
  }

  if (!Array.isArray(o.cells)) throw new ValidationError('cells must be an array.');
  if (o.cells.length !== grid.count) {
    throw new ValidationError(
      `cells has ${o.cells.length} entries but the grid needs ${grid.count}.`,
    );
  }
  const cells: Cell[] = o.cells.map((c: unknown, i: number) => {
    if (c === null) return null;
    if (typeof c === 'string') {
      if (!seenIds.has(c)) throw new ValidationError(`Cell ${i} refers to an unknown fabric.`);
      return c;
    }
    if (typeof c === 'object') {
      if (cellShape !== 'square') {
        throw new ValidationError('Split cells are only supported on square grids.');
      }
      const co = c as Record<string, unknown>;
      const split = co.split;
      if (typeof split !== 'string' || !(SPLIT_KINDS as readonly string[]).includes(split)) {
        throw new ValidationError(`Cell ${i} has an unknown split.`);
      }
      const expected = splitPartCount(split as SplitKind);
      if (!Array.isArray(co.parts) || co.parts.length !== expected) {
        throw new ValidationError(`Cell ${i}'s split needs exactly ${expected} parts.`);
      }
      const parts = co.parts.map((p: unknown) => {
        if (p === null) return null;
        if (typeof p !== 'string' || !seenIds.has(p)) {
          throw new ValidationError(`Cell ${i} refers to an unknown fabric.`);
        }
        return p;
      });
      return { split: split as SplitKind, parts };
    }
    throw new ValidationError(`Cell ${i} is invalid.`);
  });

  return {
    version: 2,
    widthIn,
    heightIn,
    cellWidthIn,
    cellHeightIn,
    seamAllowanceIn,
    cellShape: cellShape as CellShape,
    backgroundFabricId,
    fabrics,
    cells,
  };
}

export class ValidationError extends Error {}

/** The id-less fields of a fabric: name, color, pattern, optional image. */
export type FabricFields = Omit<Fabric, 'id'>;

/**
 * Validate the id-less fields of a fabric (used both inside quilt data and
 * for the personal fabric library, where the server assigns the id).
 */
export function validateFabricFields(raw: unknown, label = 'fabric'): FabricFields {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError(`${label} is invalid.`);
  }
  const fo = raw as Record<string, unknown>;
  const name = str(fo.name, `${label}.name`, 1, LIMITS.maxFabricNameLen);
  const color = str(fo.color, `${label}.color`, 4, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new ValidationError(`Fabric "${name}" has an invalid color.`);
  }
  const pattern = fo.pattern;
  if (typeof pattern !== 'string' || !PATTERN_ID_SET.has(pattern)) {
    throw new ValidationError(`Fabric "${name}" has an unknown pattern.`);
  }
  const fields: FabricFields = { name, color: color.toLowerCase(), pattern };
  if (fo.color2 !== undefined && fo.color2 !== null) {
    if (typeof fo.color2 !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(fo.color2)) {
      throw new ValidationError(`Fabric "${name}" has an invalid pattern color.`);
    }
    fields.color2 = fo.color2.toLowerCase();
  }
  if (fo.image !== undefined && fo.image !== null) {
    if (typeof fo.image !== 'string' || !isFabricImage(fo.image)) {
      throw new ValidationError(`Fabric "${name}" has an invalid photo.`);
    }
    if (fo.image.length > LIMITS.maxImageChars) {
      throw new ValidationError(`Fabric "${name}"'s photo is too large.`);
    }
    fields.image = fo.image;
  }
  return fields;
}

/** A saved color in the personal palette. */
export interface SavedColor {
  id: string;
  color: string;
  name: string;
}

/** Validate the fields of a saved color (My Colors library). */
export function validateColorFields(raw: unknown): { color: string; name: string } {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('Color is invalid.');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(o.color)) {
    throw new ValidationError('Color must look like #rrggbb.');
  }
  let name = '';
  if (o.name !== undefined && o.name !== null) {
    if (typeof o.name !== 'string') throw new ValidationError('Color name must be text.');
    name = o.name.trim().slice(0, LIMITS.maxFabricNameLen);
  }
  return { color: o.color.toLowerCase(), name };
}

/** A base64 data URL in one of the formats the image pipeline can emit. */
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
