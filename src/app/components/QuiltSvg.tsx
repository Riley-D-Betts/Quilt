/**
 * Renders a quilt as SVG. Used at full size in the editor (interactive)
 * and small in list thumbnails (static). Fabric patterns are SVG <pattern>
 * defs parameterized by each fabric's base color.
 */
import { memo, useMemo } from 'react';
import { gridDims, type Fabric, type QuiltData } from '../../shared/quilt';

/** Logical pixels per inch inside the SVG viewBox. */
export const PX_PER_IN = 10;

interface QuiltSvgProps {
  data: QuiltData;
  /** Unique prefix so multiple quilts on one page don't collide on def ids. */
  idPrefix: string;
  className?: string;
  showGridLines?: boolean;
  onCellPointerDown?: (index: number, e: React.PointerEvent) => void;
  onCellPointerMove?: (index: number, e: React.PointerEvent) => void;
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
  const dims = gridDims(data);
  const cellW = data.cellWidthIn * PX_PER_IN;
  const cellH = data.cellHeightIn * PX_PER_IN;
  const width = dims.cols * cellW;
  const height = dims.rows * cellH;

  const fabricById = useMemo(() => {
    const m = new Map<string, Fabric>();
    for (const f of data.fabrics) m.set(f.id, f);
    return m;
  }, [data.fabrics]);

  const interactive = Boolean(onCellPointerDown);

  function cellIndexFromEvent(e: React.PointerEvent<SVGSVGElement>): number | null {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (col < 0 || col >= dims.cols || row < 0 || row >= dims.rows) return null;
    return row * dims.cols + col;
  }

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
              const i = cellIndexFromEvent(e);
              if (i !== null) onCellPointerDown!(i, e);
            }
          : undefined
      }
      onPointerMove={
        interactive && onCellPointerMove
          ? (e) => {
              const i = cellIndexFromEvent(e);
              if (i !== null) onCellPointerMove(i, e);
            }
          : undefined
      }
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        {data.fabrics
          .filter((f) => f.pattern !== 'solid')
          .map((f) => (
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

      {data.cells.map((fabricId, i) => {
        const row = Math.floor(i / dims.cols);
        const col = i % dims.cols;
        const fabric = fabricId ? fabricById.get(fabricId) : undefined;
        const fill = fabric
          ? fabric.pattern === 'solid'
            ? fabric.color
            : `url(#${idPrefix}-f-${fabric.id})`
          : `url(#${idPrefix}-unassigned)`;
        return (
          <rect
            key={i}
            x={col * cellW}
            y={row * cellH}
            width={cellW}
            height={cellH}
            fill={fill}
            stroke={showGridLines ? 'rgba(60, 42, 33, 0.25)' : 'none'}
            strokeWidth={showGridLines ? 0.6 : 0}
          />
        );
      })}
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

/**
 * One tile-able motif per pattern id, drawn in a contrast color derived
 * from the fabric's base color so light and dark fabrics both read well.
 */
function PatternDef({ fabric, idPrefix }: { fabric: Fabric; idPrefix: string }) {
  const id = `${idPrefix}-f-${fabric.id}`;
  const accent = contrastOverlay(fabric.color);
  const t = 14; // tile size in viewBox units

  let motif: React.ReactNode = null;
  switch (fabric.pattern) {
    case 'dots':
      motif = (
        <>
          <circle cx={t * 0.25} cy={t * 0.25} r={t * 0.13} fill={accent} />
          <circle cx={t * 0.75} cy={t * 0.75} r={t * 0.13} fill={accent} />
        </>
      );
      break;
    case 'stripes':
      motif = (
        <path
          d={`M ${-t / 4} ${t / 4} l ${t / 2} ${-t / 2} M 0 ${t} L ${t} 0 M ${t * 0.75} ${t * 1.25} l ${t / 2} ${-t / 2}`}
          stroke={accent}
          strokeWidth={t * 0.18}
        />
      );
      break;
    case 'checks':
      motif = (
        <>
          <rect x={0} y={0} width={t / 2} height={t / 2} fill={accent} />
          <rect x={t / 2} y={t / 2} width={t / 2} height={t / 2} fill={accent} />
        </>
      );
      break;
    case 'crosshatch':
      motif = (
        <path
          d={`M 0 0 L ${t} ${t} M ${t} 0 L 0 ${t}`}
          stroke={accent}
          strokeWidth={t * 0.09}
        />
      );
      break;
    case 'flowers':
      motif = (
        <g fill={accent}>
          <circle cx={t / 2} cy={t * 0.28} r={t * 0.12} />
          <circle cx={t * 0.72} cy={t / 2} r={t * 0.12} />
          <circle cx={t / 2} cy={t * 0.72} r={t * 0.12} />
          <circle cx={t * 0.28} cy={t / 2} r={t * 0.12} />
          <circle cx={t / 2} cy={t / 2} r={t * 0.09} fill={fabric.color} stroke={accent} strokeWidth={t * 0.03} />
        </g>
      );
      break;
    case 'zigzag':
      motif = (
        <path
          d={`M 0 ${t * 0.65} L ${t * 0.25} ${t * 0.35} L ${t * 0.5} ${t * 0.65} L ${t * 0.75} ${t * 0.35} L ${t} ${t * 0.65}`}
          stroke={accent}
          strokeWidth={t * 0.1}
          fill="none"
        />
      );
      break;
    case 'solid':
      break;
  }

  return (
    <pattern id={id} width={t} height={t} patternUnits="userSpaceOnUse">
      <rect width={t} height={t} fill={fabric.color} />
      {motif}
    </pattern>
  );
}

/**
 * A small square swatch showing a fabric's color + pattern, for palettes
 * and totals tables.
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
      {fabric.pattern !== 'solid' && <defs>{<PatternDef fabric={fabric} idPrefix={idPrefix} />}</defs>}
      <rect
        width={28}
        height={28}
        rx={5}
        fill={fabric.pattern === 'solid' ? fabric.color : `url(#${patternId})`}
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

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
