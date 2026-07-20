/**
 * Renders a quilt as SVG. Used at full size in the editor (interactive)
 * and small in list thumbnails (static). All cell geometry comes from the
 * shared geometry module, so squares, triangles, hexagons, octagons and
 * stamp shapes all render — and hit-test — through the same code path.
 * Fabric patterns are SVG <pattern> defs parameterized by each fabric.
 */
import { memo, useMemo } from 'react';
import {
  isSplitCell,
  isStampShape,
  quiltGrid,
  type Fabric,
  type QuiltData,
} from '../../shared/quilt';
import { hitTest, splitPartHit, splitPartPolygons, type CellGeom } from '../../shared/geometry';
import { renderPatternTile } from './patternRender';

/** Logical pixels per inch inside the SVG viewBox. */
export const PX_PER_IN = 10;

interface QuiltSvgProps {
  data: QuiltData;
  /** Unique prefix so multiple quilts on one page don't collide on def ids. */
  idPrefix: string;
  className?: string;
  showGridLines?: boolean;
  onCellPointerDown?: (index: number, part: number | null, e: React.PointerEvent) => void;
  onCellPointerMove?: (index: number, part: number | null, e: React.PointerEvent) => void;
  onPointerUp?: () => void;
}

export const QuiltSvg = memo(function QuiltSvg({
  data,
  idPrefix,
  className,
  showGridLines = true,
  onCellPointerDown,
  onCellPointerMove,
  onPointerUp,
}: QuiltSvgProps) {
  const grid = useMemo(() => quiltGrid(data), [data]);
  // Border ring around the quilt center (0 when no border fabric chosen).
  const borderIn = data.borderFabricId ? data.borderWidthIn : 0;
  const bPx = borderIn * PX_PER_IN;
  const gridW = grid.widthIn * PX_PER_IN;
  const gridH = grid.heightIn * PX_PER_IN;
  const width = gridW + 2 * bPx;
  const height = gridH + 2 * bPx;
  // The quilt's own setting AND the caller's prop both have to allow lines.
  const gridLines = showGridLines && data.showGridLines !== false;

  const fabricById = useMemo(() => {
    const m = new Map<string, Fabric>();
    for (const f of data.fabrics) m.set(f.id, f);
    return m;
  }, [data.fabrics]);

  const interactive = Boolean(onCellPointerDown);

  const fillFor = (fabricId: string | null): string => {
    const fabric = fabricId ? fabricById.get(fabricId) : undefined;
    if (!fabric) return `url(#${idPrefix}-unassigned)`;
    if (!fabric.image && fabric.pattern === 'solid') return fabric.color;
    return `url(#${idPrefix}-f-${fabric.id})`;
  };

  function locate(e: React.PointerEvent<SVGSVGElement>): { index: number; part: number | null } | null {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const xIn = pt.x / PX_PER_IN - borderIn; // border offsets the grid
    const yIn = pt.y / PX_PER_IN - borderIn;
    const index = hitTest(grid, xIn, yIn, {
      widthIn: data.widthIn,
      heightIn: data.heightIn,
      cellWidthIn: data.cellWidthIn,
      cellHeightIn: data.cellHeightIn,
      cellShape: data.cellShape,
    });
    if (index === null) return null;
    const cell = data.cells[index] ?? null;
    if (isSplitCell(cell)) {
      const geom = grid.cells[index];
      const u = clamp01((xIn - (geom.cx - geom.cutWIn / 2)) / geom.cutWIn);
      const v = clamp01((yIn - (geom.cy - geom.cutHIn / 2)) / geom.cutHIn);
      return { index, part: splitPartHit(cell.split, u, v) };
    }
    return { index, part: null };
  }

  const stamp = isStampShape(data.cellShape);
  const usedFabricDefs = data.fabrics.filter((f) => f.image || f.pattern !== 'solid');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={interactive ? 'application' : 'img'}
      aria-label={interactive ? 'Quilt grid — click or drag to paint cells' : 'Quilt preview'}
      style={interactive ? { touchAction: 'none' } : undefined}
      onPointerDown={
        interactive
          ? (e) => {
              const hit = locate(e);
              if (hit) onCellPointerDown!(hit.index, hit.part, e);
            }
          : undefined
      }
      onPointerMove={
        interactive && onCellPointerMove
          ? (e) => {
              const hit = locate(e);
              if (hit) onCellPointerMove(hit.index, hit.part, e);
            }
          : undefined
      }
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        {usedFabricDefs.map((f) => (
          <PatternDef key={f.id} fabric={f} idPrefix={idPrefix} />
        ))}
        <pattern
          id={`${idPrefix}-unassigned`}
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={8} height={8} fill="#faf7f0" />
          <line x1={0} y1={0} x2={0} y2={8} stroke="#ddd5c4" strokeWidth={2} />
        </pattern>
      </defs>

      {borderIn > 0 && (
        <path
          d={`M 0 0 H ${width} V ${height} H 0 Z M ${bPx} ${bPx} H ${width - bPx} V ${height - bPx} H ${bPx} Z`}
          fillRule="evenodd"
          fill={fillFor(data.borderFabricId)}
          stroke={gridLines ? CELL_STROKE : 'none'}
          strokeWidth={gridLines ? 0.6 : 0}
        />
      )}

      <g transform={bPx ? `translate(${bPx} ${bPx})` : undefined}>
        {stamp && (
          <rect
            x={0}
            y={0}
            width={gridW}
            height={gridH}
            fill={fillFor(data.backgroundFabricId)}
          />
        )}

        {grid.cells.map((geom) => (
          <CellShapeView
            key={geom.index}
            geom={geom}
            cell={data.cells[geom.index] ?? null}
            fillFor={fillFor}
            showGridLines={gridLines}
          />
        ))}

        {borderIn === 0 || gridLines ? (
          <rect
            x={0}
            y={0}
            width={gridW}
            height={gridH}
            fill="none"
            stroke="#3c2a21"
            strokeWidth={borderIn > 0 ? 0.8 : 1.5}
          />
        ) : null}
      </g>

      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="none"
        stroke="#3c2a21"
        strokeWidth={1.5}
      />
    </svg>
  );
});

const CELL_STROKE = 'rgba(60, 42, 33, 0.25)';

function CellShapeView({
  geom,
  cell,
  fillFor,
  showGridLines,
}: {
  geom: CellGeom;
  cell: QuiltData['cells'][number];
  fillFor: (fabricId: string | null) => string;
  showGridLines: boolean;
}) {
  const stroke = showGridLines ? CELL_STROKE : 'none';
  const strokeWidth = showGridLines ? 0.6 : 0;

  if (isSplitCell(cell)) {
    // Splits exist only on square cells; reconstruct the cell box.
    const x0 = (geom.cx - geom.cutWIn / 2) * PX_PER_IN;
    const y0 = (geom.cy - geom.cutHIn / 2) * PX_PER_IN;
    const x1 = (geom.cx + geom.cutWIn / 2) * PX_PER_IN;
    const y1 = (geom.cy + geom.cutHIn / 2) * PX_PER_IN;
    const polys = splitPartPolygons(cell.split, x0, y0, x1, y1);
    return (
      <g>
        {polys.map((poly, p) => (
          <path
            key={p}
            d={polyPath(poly, 1)}
            fill={fillFor(cell.parts[p] ?? null)}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ))}
      </g>
    );
  }

  const fill = fillFor(cell);
  if (geom.r !== undefined) {
    return (
      <circle
        cx={geom.cx * PX_PER_IN}
        cy={geom.cy * PX_PER_IN}
        r={geom.r * PX_PER_IN}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  return (
    <path
      d={polyPath(geom.points!, PX_PER_IN)}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function polyPath(points: [number, number][], scale: number): string {
  return (
    points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${r2(x * scale)} ${r2(y * scale)}`).join(' ') +
    ' Z'
  );
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * One tile-able motif per pattern id, drawn in a contrast color derived
 * from the fabric's base color so light and dark fabrics both read well.
 * Fabrics with an image instead cover each shape with the image.
 */
function PatternDef({ fabric, idPrefix }: { fabric: Fabric; idPrefix: string }) {
  const id = `${idPrefix}-f-${fabric.id}`;
  if (fabric.image) {
    // The pattern's own viewBox + slice cover-crops the (square) swatch
    // against each shape's real bounding box. A bare objectBoundingBox
    // image would stretch instead: preserveAspectRatio resolves before the
    // anisotropic bounding-box transform, so it must live on the pattern.
    return (
      <pattern
        id={id}
        width={1}
        height={1}
        viewBox="0 0 256 256"
        preserveAspectRatio="xMidYMid slice"
      >
        <image
          href={fabric.image}
          width={256}
          height={256}
          preserveAspectRatio="xMidYMid slice"
        />
      </pattern>
    );
  }
  const tile = renderPatternTile(
    fabric.pattern,
    fabric.color,
    fabric.color2 ?? contrastOverlay(fabric.color),
  );
  if (!tile) {
    // Unknown or solid pattern id: a plain color tile keeps url(#...) fills valid.
    return (
      <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse">
        <rect width={4} height={4} fill={fabric.color} />
      </pattern>
    );
  }
  return (
    <pattern
      id={id}
      width={tile.size}
      height={tile.size}
      patternUnits="userSpaceOnUse"
      patternTransform={tile.patternTransform}
    >
      <rect width={tile.size} height={tile.size} fill={fabric.color} />
      {tile.node}
    </pattern>
  );
}

/**
 * A small square swatch showing a fabric's look, for palettes and totals
 * tables.
 */
export function FabricSwatch({
  fabric,
  idPrefix,
  size = 28,
}: {
  fabric: Fabric;
  idPrefix: string;
  size?: number;
}) {
  const patternId = `${idPrefix}-f-${fabric.id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className="fabric-swatch"
      aria-hidden="true"
    >
      {(fabric.image || fabric.pattern !== 'solid') && (
        <defs>
          <PatternDef fabric={fabric} idPrefix={idPrefix} />
        </defs>
      )}
      <rect
        width={28}
        height={28}
        rx={5}
        fill={!fabric.image && fabric.pattern === 'solid' ? fabric.color : `url(#${patternId})`}
        stroke="rgba(60, 42, 33, 0.35)"
      />
    </svg>
  );
}

/** Semi-transparent white on dark fabrics, semi-transparent black on light. */
export function contrastOverlay(hexColor: string): string {
  const luminance = relativeLuminance(hexColor);
  return luminance > 0.45 ? 'rgba(50, 35, 25, 0.35)' : 'rgba(255, 252, 245, 0.6)';
}

/** A sensible starting point when the user switches Pattern color off Auto. */
export function defaultColor2(hexColor: string): string {
  return relativeLuminance(hexColor) > 0.45 ? '#3c2a21' : '#fffcf5';
}

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
