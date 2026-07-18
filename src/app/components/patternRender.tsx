/**
 * Client-side renderers for the pattern catalog. Given a catalog entry and
 * the fabric's colors, produce the tile size and SVG content of the repeat.
 * Coordinates inside a motif use a 10x10 design box centered on (0,0).
 */
import type { ReactNode } from 'react';
import { getPattern } from '../../shared/patternCatalog';

export interface PatternTile {
  size: number;
  node: ReactNode;
  /** Applied to the <pattern> element (e.g. rotate for diagonal stripes). */
  patternTransform?: string;
}

export function renderPatternTile(
  patternId: string,
  color: string,
  accent: string,
): PatternTile | null {
  const defn = getPattern(patternId);
  if (!defn || defn.id === 'solid') return null;
  const p = defn.p;
  switch (defn.family) {
    case 'legacy':
      return legacyTile(String(p.legacyId), color, accent);
    case 'dots2': {
      const t = 14 * (Number(p.size) > 0.18 ? 1.6 : 1);
      const r = t * Number(p.size);
      const arrangement = String(p.arrangement);
      if (arrangement === 'grid') {
        return { size: t, node: <circle cx={t / 2} cy={t / 2} r={r} fill={accent} /> };
      }
      if (arrangement === 'offset') {
        return {
          size: t,
          node: (
            <>
              <circle cx={t / 4} cy={t / 4} r={r} fill={accent} />
              <circle cx={(3 * t) / 4} cy={(3 * t) / 4} r={r} fill={accent} />
            </>
          ),
        };
      }
      // scatter
      return {
        size: t * 1.6,
        node: (
          <>
            <circle cx={t * 0.3} cy={t * 0.35} r={r} fill={accent} />
            <circle cx={t * 1.15} cy={t * 0.2} r={r * 0.8} fill={accent} />
            <circle cx={t * 0.75} cy={t * 0.95} r={r * 0.9} fill={accent} />
            <circle cx={t * 1.35} cy={t * 1.25} r={r} fill={accent} />
            <circle cx={t * 0.2} cy={t * 1.35} r={r * 0.7} fill={accent} />
          </>
        ),
      };
    }
    case 'rings': {
      const t = 16;
      const r = t * Number(p.size);
      return {
        size: t,
        node: (
          <>
            <circle cx={t / 4} cy={t / 4} r={r} fill="none" stroke={accent} strokeWidth={p.thick ? r * 0.6 : r * 0.3} />
            <circle cx={(3 * t) / 4} cy={(3 * t) / 4} r={r} fill="none" stroke={accent} strokeWidth={p.thick ? r * 0.6 : r * 0.3} />
          </>
        ),
      };
    }
    case 'stripes2': {
      const t = 14;
      const w = t * Number(p.weight);
      const style = String(p.style);
      const angle = Number(p.angle);
      const y = (t - w) / 2;
      const bars =
        style === 'double' ? (
          <>
            <rect x={0} y={y} width={t} height={w * 0.45} fill={accent} />
            <rect x={0} y={y + w * 0.55} width={t} height={w * 0.45} fill={accent} />
          </>
        ) : style === 'dashed' ? (
          <>
            <rect x={0} y={y} width={t * 0.55} height={w} fill={accent} />
            <rect x={t * 0.7} y={y} width={t * 0.3} height={w} fill={accent} />
          </>
        ) : (
          <rect x={0} y={y} width={t} height={w} fill={accent} />
        );
      // The tile stays horizontal; rotating the whole pattern plane keeps
      // diagonal repeats seamless.
      return {
        size: t,
        node: bars,
        patternTransform: angle !== 0 ? `rotate(${angle})` : undefined,
      };
    }
    case 'checks2': {
      const t = 12 * Number(p.scale);
      return {
        size: t,
        node: (
          <>
            <rect x={0} y={0} width={t / 2} height={t / 2} fill={accent} />
            <rect x={t / 2} y={t / 2} width={t / 2} height={t / 2} fill={accent} />
          </>
        ),
      };
    }
    case 'gingham2': {
      const t = 12 * Number(p.scale);
      return {
        size: t,
        node: (
          <g fill={accent}>
            <rect x={0} y={0} width={t / 2} height={t} opacity={0.45} />
            <rect x={0} y={0} width={t} height={t / 2} opacity={0.45} />
          </g>
        ),
      };
    }
    case 'plaid2': {
      const t = 18;
      const v = String(p.variant);
      return {
        size: t,
        node: (
          <g stroke={accent}>
            {v === 'window' && (
              <>
                <line x1={t * 0.5} y1={0} x2={t * 0.5} y2={t} strokeWidth={t * 0.05} />
                <line x1={0} y1={t * 0.5} x2={t} y2={t * 0.5} strokeWidth={t * 0.05} />
              </>
            )}
            {v === 'tartan' && (
              <>
                <rect x={t * 0.1} y={0} width={t * 0.22} height={t} fill={accent} opacity={0.4} stroke="none" />
                <rect x={0} y={t * 0.1} width={t} height={t * 0.22} fill={accent} opacity={0.4} stroke="none" />
                <line x1={t * 0.7} y1={0} x2={t * 0.7} y2={t} strokeWidth={t * 0.04} />
                <line x1={0} y1={t * 0.7} x2={t} y2={t * 0.7} strokeWidth={t * 0.04} />
              </>
            )}
            {v === 'double' && (
              <>
                <line x1={t * 0.3} y1={0} x2={t * 0.3} y2={t} strokeWidth={t * 0.08} />
                <line x1={t * 0.45} y1={0} x2={t * 0.45} y2={t} strokeWidth={t * 0.08} />
                <line x1={0} y1={t * 0.3} x2={t} y2={t * 0.3} strokeWidth={t * 0.08} />
                <line x1={0} y1={t * 0.45} x2={t} y2={t * 0.45} strokeWidth={t * 0.08} />
              </>
            )}
            {v === 'madras' && (
              <>
                <rect x={t * 0.05} y={0} width={t * 0.3} height={t} fill={accent} opacity={0.3} stroke="none" />
                <rect x={0} y={t * 0.4} width={t} height={t * 0.18} fill={accent} opacity={0.5} stroke="none" />
                <line x1={t * 0.75} y1={0} x2={t * 0.75} y2={t} strokeWidth={t * 0.06} />
                <line x1={0} y1={t * 0.85} x2={t} y2={t * 0.85} strokeWidth={t * 0.06} />
              </>
            )}
          </g>
        ),
      };
    }
    case 'houndstooth': {
      const t = 10 * Number(p.scale);
      const u = t / 4;
      return {
        size: t,
        node: (
          <path
            d={`M 0 0 H ${2 * u} L ${u} ${u} H ${2 * u} V ${2 * u} L ${3 * u} ${u} V ${2 * u} H ${4 * u} V ${3 * u} H ${2 * u} L ${3 * u} ${2 * u} H ${2 * u} V 0 Z`}
            fill={accent}
          />
        ),
      };
    }
    case 'argyle': {
      const t = 16 * Number(p.scale);
      return {
        size: t,
        node: (
          <>
            <path d={`M ${t / 2} 0 L ${t} ${t / 2} L ${t / 2} ${t} L 0 ${t / 2} Z`} fill={accent} opacity={0.55} />
            <path d={`M 0 0 L ${t} ${t} M ${t} 0 L 0 ${t}`} stroke={accent} strokeWidth={t * 0.035} strokeDasharray={`${t * 0.08} ${t * 0.06}`} />
          </>
        ),
      };
    }
    case 'basketweave': {
      const t = 12 * Number(p.scale);
      const bar = t / 2;
      return {
        size: t,
        node: (
          <g fill={accent}>
            <rect x={0} y={bar * 0.15} width={bar * 0.9} height={bar * 0.3} />
            <rect x={0} y={bar * 0.6} width={bar * 0.9} height={bar * 0.3} />
            <rect x={bar + bar * 0.15} y={0} width={bar * 0.3} height={bar * 0.9} />
            <rect x={bar + bar * 0.6} y={0} width={bar * 0.3} height={bar * 0.9} />
            <rect x={bar + bar * 0.15} y={bar} width={bar * 0.3} height={bar * 0.9} transform={`translate(${-t / 2} 0)`} />
            <rect x={bar + bar * 0.6} y={bar} width={bar * 0.3} height={bar * 0.9} transform={`translate(${-t / 2} 0)`} />
            <rect x={bar} y={bar + bar * 0.15} width={bar * 0.9} height={bar * 0.3} />
            <rect x={bar} y={bar + bar * 0.6} width={bar * 0.9} height={bar * 0.3} />
          </g>
        ),
      };
    }
    case 'bricks': {
      const t = 12 * Number(p.scale);
      const bh = t / 2;
      return {
        size: t,
        node: (
          <g stroke={accent} strokeWidth={t * 0.05} fill="none">
            <rect x={0} y={0} width={t} height={bh} />
            <rect x={-t / 2} y={bh} width={t} height={bh} />
            <rect x={t / 2} y={bh} width={t} height={bh} />
          </g>
        ),
      };
    }
    case 'ticking': {
      const t = 14 * Number(p.gap);
      return {
        size: t,
        node: (
          <g stroke={accent}>
            <line x1={t * 0.3} y1={0} x2={t * 0.3} y2={t} strokeWidth={t * 0.1} strokeDasharray={p.dashed ? `${t * 0.3} ${t * 0.15}` : undefined} />
            {p.double ? (
              <line x1={t * 0.45} y1={0} x2={t * 0.45} y2={t} strokeWidth={t * 0.05} />
            ) : (
              <line x1={t * 0.4} y1={0} x2={t * 0.4} y2={t} strokeWidth={t * 0.03} />
            )}
          </g>
        ),
      };
    }
    case 'chevron': {
      const t = 12 * Number(p.scale);
      const path = `M 0 ${t * 0.6} L ${t * 0.25} ${t * 0.3} L ${t * 0.5} ${t * 0.6} L ${t * 0.75} ${t * 0.3} L ${t} ${t * 0.6}`;
      return {
        size: t,
        node: (
          <g transform={p.vertical ? `rotate(90 ${t / 2} ${t / 2})` : undefined}>
            <path d={path} stroke={accent} strokeWidth={t * 0.14} fill="none" />
          </g>
        ),
      };
    }
    case 'herringbone': {
      const t = 10 * Number(p.scale);
      return {
        size: t,
        node: (
          <g stroke={accent} strokeWidth={t * 0.1}>
            <path d={`M 0 ${t} L ${t / 2} ${t / 2} L ${t / 2} 0`} fill="none" />
            <path d={`M ${t / 2} ${t} L ${t} ${t / 2} L ${t} 0`} fill="none" transform={`translate(0 0) scale(1 1)`} />
          </g>
        ),
      };
    }
    case 'triangles': {
      const t = 12 * Number(p.scale);
      const tri = `M ${t * 0.1} ${t * 0.45} L ${t * 0.4} ${t * 0.05} L ${t * 0.7} ${t * 0.45} Z`;
      const tri2 = `M ${t * 0.4} ${t * 0.95} L ${t * 0.7} ${t * 0.55} L ${t} ${t * 0.95} Z`;
      return {
        size: t,
        node: p.solid ? (
          <g fill={accent}>
            <path d={tri} />
            <path d={tri2} />
          </g>
        ) : (
          <g fill="none" stroke={accent} strokeWidth={t * 0.06}>
            <path d={tri} />
            <path d={tri2} />
          </g>
        ),
      };
    }
    case 'harlequin': {
      const t = 12 * Number(p.scale);
      const d = `M ${t / 2} ${t * 0.05} L ${t * 0.95} ${t / 2} L ${t / 2} ${t * 0.95} L ${t * 0.05} ${t / 2} Z`;
      return {
        size: t,
        node: p.solid ? <path d={d} fill={accent} /> : <path d={d} fill="none" stroke={accent} strokeWidth={t * 0.07} />,
      };
    }
    case 'lattice': {
      const t = 12 * Number(p.scale);
      return {
        size: t,
        node: p.diagonal ? (
          <path d={`M 0 0 L ${t} ${t} M ${t} 0 L 0 ${t}`} stroke={accent} strokeWidth={t * 0.08} />
        ) : (
          <path d={`M ${t / 2} 0 V ${t} M 0 ${t / 2} H ${t}`} stroke={accent} strokeWidth={t * 0.08} />
        ),
      };
    }
    case 'quatrefoil': {
      const t = 14 * Number(p.scale);
      const r = t * 0.18;
      const c = t / 2;
      return {
        size: t,
        node: (
          <g fill="none" stroke={accent} strokeWidth={t * 0.06}>
            <circle cx={c} cy={c - r} r={r} />
            <circle cx={c} cy={c + r} r={r} />
            <circle cx={c - r} cy={c} r={r} />
            <circle cx={c + r} cy={c} r={r} />
          </g>
        ),
      };
    }
    case 'scales': {
      const t = 12 * Number(p.scale);
      const r = t / 2;
      const row = (y: number, offset: number) => (
        <g key={y} fill={p.hollow ? 'none' : accent} stroke={accent} strokeWidth={t * 0.05} opacity={p.hollow ? 1 : 0.85}>
          <path d={`M ${offset - r} ${y} A ${r} ${r} 0 0 1 ${offset + r} ${y}`} />
          <path d={`M ${offset + r} ${y} A ${r} ${r} 0 0 1 ${offset + 3 * r} ${y}`} />
        </g>
      );
      return {
        size: t,
        node: (
          <>
            {row(t / 2, 0)}
            {row(t, r)}
          </>
        ),
      };
    }
    case 'honeycombPat': {
      const t = 14 * Number(p.scale);
      const w = t / 2;
      const h = (w * 2) / Math.sqrt(3);
      const hex = (cx: number, cy: number) =>
        `M ${cx} ${cy - h / 2} L ${cx + w / 2} ${cy - h / 4} L ${cx + w / 2} ${cy + h / 4} L ${cx} ${cy + h / 2} L ${cx - w / 2} ${cy + h / 4} L ${cx - w / 2} ${cy - h / 4} Z`;
      return {
        size: t,
        node: (
          <g fill="none" stroke={accent} strokeWidth={t * 0.05}>
            <path d={hex(t * 0.25, t * 0.25)} />
            <path d={hex(t * 0.75, t * 0.62)} />
          </g>
        ),
      };
    }
    case 'ogee': {
      const t = 14 * Number(p.scale);
      return {
        size: t,
        node: (
          <path
            d={`M ${t / 2} 0 C ${t * 0.85} ${t * 0.2}, ${t * 0.85} ${t * 0.35}, ${t / 2} ${t / 2} C ${t * 0.15} ${t * 0.65}, ${t * 0.15} ${t * 0.8}, ${t / 2} ${t}`}
            fill="none"
            stroke={accent}
            strokeWidth={t * 0.06}
          />
        ),
      };
    }
    case 'medallion': {
      const t = 16 * Number(p.scale);
      const c = t / 2;
      return {
        size: t,
        node: (
          <g fill="none" stroke={accent} strokeWidth={t * 0.045}>
            <circle cx={c} cy={c} r={t * 0.3} />
            <circle cx={c} cy={c} r={t * 0.18} />
            <circle cx={c} cy={c} r={t * 0.06} fill={accent} stroke="none" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line
                key={a}
                x1={c + t * 0.3 * Math.cos((a * Math.PI) / 180)}
                y1={c + t * 0.3 * Math.sin((a * Math.PI) / 180)}
                x2={c + t * 0.4 * Math.cos((a * Math.PI) / 180)}
                y2={c + t * 0.4 * Math.sin((a * Math.PI) / 180)}
              />
            ))}
          </g>
        ),
      };
    }
    case 'fans': {
      const t = 14 * Number(p.scale);
      return {
        size: t,
        node: (
          <g fill="none" stroke={accent} strokeWidth={t * 0.05}>
            <path d={`M 0 ${t} A ${t * 0.9} ${t * 0.9} 0 0 0 ${t * 0.9} ${t * 0.1}`} />
            <path d={`M 0 ${t} A ${t * 0.6} ${t * 0.6} 0 0 0 ${t * 0.6} ${t * 0.4}`} />
            <path d={`M 0 ${t} A ${t * 0.3} ${t * 0.3} 0 0 0 ${t * 0.3} ${t * 0.7}`} />
          </g>
        ),
      };
    }
    case 'crosses': {
      const t = 12 * Number(p.scale);
      const u = t * 0.11;
      const c = t / 4;
      const plus = (cx: number, cy: number) => (
        <path
          d={`M ${cx - u / 2} ${cy - 1.5 * u} h ${u} v ${u} h ${u} v ${u} h ${-u} v ${u} h ${-u} v ${-u} h ${-u} v ${-u} h ${u} Z`}
          fill={accent}
          transform={p.style === 'cross' ? `rotate(45 ${cx} ${cy})` : undefined}
        />
      );
      return {
        size: t,
        node: (
          <>
            {plus(c, c)}
            {plus(3 * c, 3 * c)}
          </>
        ),
      };
    }
    case 'waves2': {
      const t = 14 * Number(p.scale);
      const amp = p.ripple ? t * 0.12 : t * 0.2;
      return {
        size: t,
        node: (
          <g stroke={accent} strokeWidth={t * 0.07} fill="none">
            <path d={`M 0 ${t * 0.3} Q ${t * 0.25} ${t * 0.3 - amp} ${t * 0.5} ${t * 0.3} T ${t} ${t * 0.3}`} />
            <path d={`M 0 ${t * 0.8} Q ${t * 0.25} ${t * 0.8 - amp} ${t * 0.5} ${t * 0.8} T ${t} ${t * 0.8}`} />
          </g>
        ),
      };
    }
    case 'pinwheel': {
      const t = 14 * Number(p.scale);
      const c = t / 2;
      const blade = (a: number) => (
        <path key={a} d={`M ${c} ${c} L ${c + t * 0.32} ${c - t * 0.1} A ${t * 0.34} ${t * 0.34} 0 0 0 ${c + t * 0.1} ${c - t * 0.32} Z`} fill={accent} transform={`rotate(${a} ${c} ${c})`} />
      );
      return { size: t, node: <>{[0, 90, 180, 270].map(blade)}</> };
    }
    case 'chains': {
      const t = 12 * Number(p.scale);
      return {
        size: t,
        node: (
          <g fill="none" stroke={accent} strokeWidth={t * 0.07}>
            <ellipse cx={t * 0.3} cy={t / 2} rx={t * 0.22} ry={t * 0.13} />
            <ellipse cx={t * 0.75} cy={t / 2} rx={t * 0.13} ry={t * 0.22} />
          </g>
        ),
      };
    }
    case 'dotdash': {
      const t = 12 * Number(p.scale);
      return {
        size: t,
        node: (
          <g fill={accent}>
            <circle cx={t * 0.2} cy={t * 0.3} r={t * 0.08} />
            <rect x={t * 0.4} y={t * 0.25} width={t * 0.4} height={t * 0.1} rx={t * 0.05} />
            <rect x={t * 0.05} y={t * 0.72} width={t * 0.4} height={t * 0.1} rx={t * 0.05} />
            <circle cx={t * 0.7} cy={t * 0.77} r={t * 0.08} />
          </g>
        ),
      };
    }
    case 'stamp': {
      const t = 22 * Number(p.scale);
      const m = motif(String(p.motif), color, accent);
      if (!m) return { size: 14, node: null };
      const place = (x: number, y: number) => (
        <g transform={`translate(${x} ${y}) scale(${t / 28})`}>{m}</g>
      );
      return {
        size: t,
        node: (
          <>
            {place(t / 4, t / 4)}
            {place((3 * t) / 4, (3 * t) / 4)}
          </>
        ),
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stamped motifs, drawn in a 10x10 box centered on (0,0)
// ---------------------------------------------------------------------------

function motif(name: string, color: string, accent: string): ReactNode {
  switch (name) {
    case 'daisy':
      return (
        <g fill={accent}>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx={0} cy={-2.6} rx={1.1} ry={2.2} transform={`rotate(${a})`} />
          ))}
          <circle r={1.3} fill={color} stroke={accent} strokeWidth={0.3} />
        </g>
      );
    case 'tulip':
      return (
        <g>
          <path d="M -2.5 -1 Q -2.5 -4 0 -4.5 Q 2.5 -4 2.5 -1 Q 1.2 0.5 0 0 Q -1.2 0.5 -2.5 -1 Z" fill={accent} />
          <path d="M 0 0 V 4" stroke={accent} strokeWidth={0.6} />
          <path d="M 0 2.5 Q -2 2 -2.5 0.8" stroke={accent} strokeWidth={0.5} fill="none" />
        </g>
      );
    case 'blossom':
      return (
        <g fill={accent}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={0} cy={-2.1} r={1.5} transform={`rotate(${a})`} />
          ))}
          <circle r={1} fill={color} />
        </g>
      );
    case 'rosebud':
      return (
        <g fill="none" stroke={accent} strokeWidth={0.6}>
          <circle r={0.8} />
          <path d="M 0.8 0 A 1.7 1.7 0 1 1 0 -1.7" />
          <path d="M 0 -2.8 A 2.8 2.8 0 1 0 2.8 0" />
        </g>
      );
    case 'sprig':
      return (
        <g stroke={accent} strokeWidth={0.5} fill={accent}>
          <path d="M 0 4 Q 0 0 0 -4" fill="none" />
          <ellipse cx={-1.6} cy={-1.5} rx={1.5} ry={0.7} transform="rotate(-40 -1.6 -1.5)" />
          <ellipse cx={1.6} cy={0.5} rx={1.5} ry={0.7} transform="rotate(40 1.6 0.5)" />
          <ellipse cx={-1.6} cy={2.5} rx={1.5} ry={0.7} transform="rotate(-40 -1.6 2.5)" />
        </g>
      );
    case 'posy':
      return (
        <g fill={accent}>
          <circle cx={-1.5} cy={-1.5} r={1.4} />
          <circle cx={1.6} cy={-1.2} r={1.1} />
          <circle cx={0.2} cy={1.6} r={1.2} />
          <circle cx={-1.5} cy={-1.5} r={0.5} fill={color} />
          <circle cx={1.6} cy={-1.2} r={0.4} fill={color} />
          <circle cx={0.2} cy={1.6} r={0.45} fill={color} />
        </g>
      );
    case 'bloom':
      return (
        <g fill={accent}>
          {[45, 135, 225, 315].map((a) => (
            <path key={a} d="M 0 0 C -2.5 -2 -2.5 -4 0 -4.6 C 2.5 -4 2.5 -2 0 0" transform={`rotate(${a})`} />
          ))}
          <circle r={1} fill={color} />
        </g>
      );
    case 'leaf':
      return (
        <g fill={accent}>
          <path d="M 0 4 C -3.4 1 -2.6 -2.8 0 -4.4 C 2.6 -2.8 3.4 1 0 4 Z" />
          <path d="M 0 3 V -3.4" stroke={color} strokeWidth={0.4} />
        </g>
      );
    case 'fern':
      return (
        <g stroke={accent} strokeWidth={0.45} fill="none">
          <path d="M 0 4.5 Q -0.5 0 0.5 -4.5" />
          {[-3, -1.5, 0, 1.5, 3].map((y, i) => (
            <g key={y}>
              <path d={`M ${0.15 * (3 - i) - 0.3} ${y} q -2 -0.4 -2.6 -1.6`} />
              <path d={`M ${0.15 * (3 - i) - 0.1} ${y} q 2 -0.4 2.6 -1.6`} />
            </g>
          ))}
        </g>
      );
    case 'clover':
      return (
        <g fill={accent}>
          <circle cx={0} cy={-1.6} r={1.4} />
          <circle cx={-1.5} cy={0.8} r={1.4} />
          <circle cx={1.5} cy={0.8} r={1.4} />
          <path d="M 0 0.5 Q 0.6 2.6 1.4 3.6" stroke={accent} strokeWidth={0.5} fill="none" />
        </g>
      );
    case 'acorn':
      return (
        <g>
          <path d="M -1.8 -0.5 Q 0 -2.4 1.8 -0.5 L 1.4 -0.2 Q 0 1.2 -1.4 -0.2 Z" fill={accent} />
          <path d="M -1.4 -0.3 Q 0 3.4 0 3.4 Q 1 1.6 1.4 -0.3" fill={accent} opacity={0.7} />
          <path d="M 0 -1.9 V -3" stroke={accent} strokeWidth={0.5} />
        </g>
      );
    case 'pine':
      return (
        <g fill={accent}>
          <path d="M 0 -4.5 L 2.2 -1.5 H -2.2 Z" />
          <path d="M 0 -2.5 L 2.8 1 H -2.8 Z" />
          <path d="M 0 -0.5 L 3.4 3.2 H -3.4 Z" />
          <rect x={-0.5} y={3.2} width={1} height={1.4} />
        </g>
      );
    case 'snowflake':
      return (
        <g stroke={accent} strokeWidth={0.5} fill="none">
          {[0, 60, 120].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M 0 -4.4 V 4.4" />
              <path d="M -1.2 -3 L 0 -2 L 1.2 -3" />
              <path d="M -1.2 3 L 0 2 L 1.2 3" />
            </g>
          ))}
        </g>
      );
    case 'raindrop':
      return <path d="M 0 -4 C 2.6 -0.6 2.6 1.4 0 3.6 C -2.6 1.4 -2.6 -0.6 0 -4 Z" fill={accent} transform="rotate(180)" />;
    case 'moon':
      return <path d="M 1.5 -4 A 4.2 4.2 0 1 0 1.5 4 A 3.3 3.3 0 1 1 1.5 -4 Z" fill={accent} />;
    case 'sun':
      return (
        <g stroke={accent} fill={accent}>
          <circle r={2} stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1={0} y1={-2.9} x2={0} y2={-4.3} strokeWidth={0.6} transform={`rotate(${a})`} />
          ))}
        </g>
      );
    case 'star':
      return <path d={star5(0, 0, 4.4, 1.8)} fill={accent} />;
    case 'heart':
      return (
        <path d="M 0 3.6 C -4.8 0.2 -3 -3.8 0 -1.6 C 3 -3.8 4.8 0.2 0 3.6 Z" fill={accent} />
      );
    case 'teardrop':
      return <path d="M 0 -4.2 C 3 -0.4 2.6 2 0 3.8 C -2.6 2 -3 -0.4 0 -4.2 Z" fill="none" stroke={accent} strokeWidth={0.6} />;
    case 'paisley':
      return (
        <g fill="none" stroke={accent} strokeWidth={0.55}>
          <path d="M 1.8 2.8 C 4.4 0.6 3.6 -3.4 0.6 -4 C -2.4 -4.4 -4.2 -1.6 -3 0.6 C -2 2.4 0 3.8 1.8 2.8 Z" />
          <circle cx={-0.6} cy={-1} r={1.1} />
        </g>
      );
    case 'confetti':
      return (
        <g fill={accent}>
          <rect x={-3.5} y={-3} width={1.6} height={0.7} rx={0.3} transform="rotate(25 -3.5 -3)" />
          <rect x={1.8} y={-3.6} width={1.6} height={0.7} rx={0.3} transform="rotate(-40 1.8 -3.6)" />
          <rect x={-1} y={1.8} width={1.6} height={0.7} rx={0.3} transform="rotate(65 -1 1.8)" />
          <circle cx={3} cy={2.4} r={0.7} />
          <circle cx={-3} cy={2} r={0.55} />
        </g>
      );
    case 'button':
      return (
        <g>
          <circle r={3.4} fill="none" stroke={accent} strokeWidth={0.6} />
          <circle r={2.4} fill="none" stroke={accent} strokeWidth={0.3} />
          <circle cx={-0.9} cy={-0.9} r={0.45} fill={accent} />
          <circle cx={0.9} cy={-0.9} r={0.45} fill={accent} />
          <circle cx={-0.9} cy={0.9} r={0.45} fill={accent} />
          <circle cx={0.9} cy={0.9} r={0.45} fill={accent} />
        </g>
      );
    case 'spool':
      return (
        <g fill={accent}>
          <rect x={-2.6} y={-4} width={5.2} height={1.2} rx={0.4} />
          <rect x={-2.6} y={2.8} width={5.2} height={1.2} rx={0.4} />
          <rect x={-1.9} y={-2.8} width={3.8} height={5.6} opacity={0.75} />
          <path d="M -1.9 -1.6 H 1.9 M -1.9 0 H 1.9 M -1.9 1.6 H 1.9" stroke={color} strokeWidth={0.35} />
        </g>
      );
    case 'scissorsM':
      return (
        <g stroke={accent} strokeWidth={0.6} fill="none">
          <circle cx={-2.6} cy={2.6} r={1.1} />
          <circle cx={2.6} cy={2.6} r={1.1} />
          <path d="M -1.9 1.8 L 2.6 -3.8 M 1.9 1.8 L -2.6 -3.8" />
        </g>
      );
    case 'bow':
      return (
        <g fill={accent}>
          <path d="M -0.4 0 C -4 -2.6 -4.6 1.8 -0.4 0.6 Z" />
          <path d="M 0.4 0 C 4 -2.6 4.6 1.8 0.4 0.6 Z" />
          <circle cx={0} cy={0.2} r={0.8} />
          <path d="M -0.4 0.8 L -1.4 3.4 M 0.4 0.8 L 1.4 3.4" stroke={accent} strokeWidth={0.6} />
        </g>
      );
    case 'crown':
      return (
        <g fill={accent}>
          <path d="M -3.4 2.4 L -3.9 -2.2 L -1.6 -0.4 L 0 -3.2 L 1.6 -0.4 L 3.9 -2.2 L 3.4 2.4 Z" />
          <rect x={-3.4} y={2.8} width={6.8} height={0.9} rx={0.3} />
        </g>
      );
    case 'anchor':
      return (
        <g stroke={accent} strokeWidth={0.6} fill="none">
          <circle cx={0} cy={-3.2} r={1} />
          <path d="M 0 -2.2 V 3.4 M -2.4 0 H 2.4 M -3.4 1.4 A 3.6 3.6 0 0 0 3.4 1.4" />
        </g>
      );
    case 'sailboat':
      return (
        <g fill={accent}>
          <path d="M 0.2 -4 V 0.8 L 3 0.8 Z" opacity={0.8} />
          <path d="M -0.4 -3 V 0.8 L -2.8 0.8 Z" />
          <path d="M -3.4 1.6 H 3.4 L 2.2 3.4 H -2.2 Z" />
        </g>
      );
    case 'strawberry':
      return (
        <g>
          <path d="M -2.8 -1 C -2.8 2 -1 3.8 0 4 C 1 3.8 2.8 2 2.8 -1 Q 0 -2.4 -2.8 -1 Z" fill={accent} />
          <path d="M -1.5 -1.6 L 0 -1 L 1.5 -1.6 L 0.6 -2.6 L 0 -3.6 L -0.6 -2.6 Z" fill={accent} opacity={0.6} />
          <circle cx={-1} cy={0.4} r={0.25} fill={color} />
          <circle cx={1} cy={0.4} r={0.25} fill={color} />
          <circle cx={0} cy={2} r={0.25} fill={color} />
        </g>
      );
    case 'cherry':
      return (
        <g>
          <circle cx={-1.8} cy={1.8} r={1.5} fill={accent} />
          <circle cx={1.8} cy={2.2} r={1.5} fill={accent} />
          <path d="M -1.8 0.4 Q 0 -3.6 1 -4 M 1.8 0.8 Q 1.2 -2.6 1 -4" stroke={accent} strokeWidth={0.5} fill="none" />
        </g>
      );
    case 'lemon':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={3.4} ry={2.3} fill={accent} transform="rotate(-20)" />
          <circle cx={3.3} cy={-1.3} r={0.5} fill={accent} />
          <ellipse cx={-2} cy={-2.6} rx={1.2} ry={0.5} fill={accent} opacity={0.6} transform="rotate(-30 -2 -2.6)" />
        </g>
      );
    case 'apple':
      return (
        <g>
          <path d="M 0 -1.6 C 3.6 -3.4 4.4 2 0.6 3.6 Q 0 3.9 -0.6 3.6 C -4.4 2 -3.6 -3.4 0 -1.6 Z" fill={accent} />
          <path d="M 0 -1.8 Q 0.2 -3.2 1 -3.9" stroke={accent} strokeWidth={0.5} fill="none" />
          <ellipse cx={1.7} cy={-3.2} rx={1} ry={0.5} fill={accent} opacity={0.7} transform="rotate(-30 1.7 -3.2)" />
        </g>
      );
    case 'mushroom':
      return (
        <g>
          <path d="M -3.6 0 C -3.6 -3.4 3.6 -3.4 3.6 0 Q 0 1 -3.6 0 Z" fill={accent} />
          <path d="M -1.2 0.6 Q 0 0.9 1.2 0.6 L 1 3.4 Q 0 3.8 -1 3.4 Z" fill={accent} opacity={0.7} />
          <circle cx={-1.6} cy={-1.4} r={0.5} fill={color} />
          <circle cx={0.8} cy={-2} r={0.4} fill={color} />
        </g>
      );
    case 'bee':
      return (
        <g>
          <ellipse cx={0} cy={0.4} rx={2.2} ry={1.6} fill={accent} />
          <path d="M -0.9 -0.9 V 1.9 M 0.2 -1 V 2 M 1.2 -0.6 V 1.5" stroke={color} strokeWidth={0.4} />
          <ellipse cx={-1.7} cy={-1.7} rx={1.5} ry={0.8} fill={accent} opacity={0.55} transform="rotate(-30 -1.7 -1.7)" />
          <ellipse cx={1.7} cy={-1.7} rx={1.5} ry={0.8} fill={accent} opacity={0.55} transform="rotate(30 1.7 -1.7)" />
        </g>
      );
    case 'butterfly':
      return (
        <g fill={accent}>
          <ellipse cx={-1.7} cy={-1.4} rx={1.7} ry={1.3} transform="rotate(-25 -1.7 -1.4)" />
          <ellipse cx={1.7} cy={-1.4} rx={1.7} ry={1.3} transform="rotate(25 1.7 -1.4)" />
          <ellipse cx={-1.4} cy={1.2} rx={1.3} ry={1} transform="rotate(20 -1.4 1.2)" />
          <ellipse cx={1.4} cy={1.2} rx={1.3} ry={1} transform="rotate(-20 1.4 1.2)" />
          <rect x={-0.3} y={-1.8} width={0.6} height={3.8} rx={0.3} fill={color} stroke={accent} strokeWidth={0.2} />
        </g>
      );
    case 'ladybug':
      return (
        <g>
          <circle r={3} fill={accent} />
          <path d="M 0 -3 V 3" stroke={color} strokeWidth={0.4} />
          <circle cx={0} cy={-2.9} r={1} fill={accent} opacity={0.7} />
          <circle cx={-1.4} cy={-0.6} r={0.5} fill={color} />
          <circle cx={1.4} cy={-0.6} r={0.5} fill={color} />
          <circle cx={-1} cy={1.6} r={0.5} fill={color} />
          <circle cx={1} cy={1.6} r={0.5} fill={color} />
        </g>
      );
    case 'bird':
      return (
        <g fill={accent}>
          <path d="M -3.4 0.6 C -3 -2.4 1 -3.2 2.2 -1 L 4.2 -1.6 L 3 0.4 C 2.4 2.6 -1.6 3.2 -3.4 0.6 Z" />
          <path d="M -1 -0.4 C -0.2 -1.8 1.4 -1.4 1.6 -0.2" fill={color} opacity={0.5} />
          <circle cx={2.5} cy={-1.1} r={0.3} fill={color} />
        </g>
      );
    case 'cat':
      return (
        <g fill={accent}>
          <circle cx={0} cy={0.6} r={2.9} />
          <path d="M -2.6 -1 L -2.9 -3.8 L -0.8 -2.4 Z" />
          <path d="M 2.6 -1 L 2.9 -3.8 L 0.8 -2.4 Z" />
          <circle cx={-1.1} cy={0} r={0.4} fill={color} />
          <circle cx={1.1} cy={0} r={0.4} fill={color} />
          <path d="M 0 1 L -0.5 1.7 H 0.5 Z" fill={color} />
        </g>
      );
    case 'bone':
      return (
        <g fill={accent}>
          <rect x={-2.4} y={-0.7} width={4.8} height={1.4} rx={0.7} />
          <circle cx={-2.6} cy={-0.9} r={1} />
          <circle cx={-2.6} cy={0.9} r={1} />
          <circle cx={2.6} cy={-0.9} r={1} />
          <circle cx={2.6} cy={0.9} r={1} />
        </g>
      );
    case 'paw':
      return (
        <g fill={accent}>
          <ellipse cx={0} cy={1.4} rx={2.2} ry={1.8} />
          <circle cx={-2.4} cy={-0.6} r={0.9} />
          <circle cx={-0.8} cy={-1.6} r={0.9} />
          <circle cx={0.8} cy={-1.6} r={0.9} />
          <circle cx={2.4} cy={-0.6} r={0.9} />
        </g>
      );
    case 'music':
      return (
        <g fill={accent}>
          <ellipse cx={-1.8} cy={2.8} rx={1.2} ry={0.9} />
          <ellipse cx={2} cy={2.2} rx={1.2} ry={0.9} />
          <path d="M -0.7 2.8 V -2.6 L 3.1 -3.4 V 2.2" stroke={accent} strokeWidth={0.6} fill="none" />
          <path d="M -0.7 -2.6 L 3.1 -3.4 V -2 L -0.7 -1.2 Z" />
        </g>
      );
    case 'teacup':
      return (
        <g fill={accent}>
          <path d="M -3 -1 H 3 L 2.4 2.4 Q 0 3.4 -2.4 2.4 Z" />
          <path d="M 3 -0.4 Q 4.8 -0.2 4.4 1 Q 4 2 2.6 1.8" fill="none" stroke={accent} strokeWidth={0.5} />
          <path d="M -2 -2 Q -1.6 -2.8 -2 -3.6 M 0 -2 Q 0.4 -2.8 0 -3.6 M 2 -2 Q 2.4 -2.8 2 -3.6" stroke={accent} strokeWidth={0.4} fill="none" />
        </g>
      );
    case 'cupcake':
      return (
        <g fill={accent}>
          <path d="M -2.8 0.4 H 2.8 L 2 3.6 H -2 Z" />
          <path d="M -3 0 C -3.4 -2 -1.6 -2.4 -1.2 -1.6 C -1.2 -3.2 1.2 -3.2 1.2 -1.6 C 1.6 -2.4 3.4 -2 3 0 Z" opacity={0.75} />
          <circle cx={0} cy={-2.9} r={0.55} />
        </g>
      );
    case 'candycane':
      return (
        <g stroke={accent} strokeWidth={1.1} fill="none">
          <path d="M -1.2 3.8 V -2 A 2 2 0 0 1 2.8 -2" />
          <path d="M -1.2 2.6 l 1 -0.6 M -1.2 0.6 l 1 -0.6 M -1.2 -1.4 l 1 -0.6" stroke={color} strokeWidth={0.5} />
        </g>
      );
    case 'holly':
      return (
        <g fill={accent}>
          <path d="M -0.6 -0.4 C -4.4 -2.6 -3 -4.6 -0.9 -3.4 C -1 -4.8 1 -4.8 0.9 -3.4 C 3 -4.6 4.4 -2.6 0.6 -0.4 Z" />
          <circle cx={-1} cy={0.9} r={0.8} />
          <circle cx={0.5} cy={1.5} r={0.8} />
          <circle cx={1.6} cy={0.5} r={0.8} />
        </g>
      );
    case 'pumpkin':
      return (
        <g fill={accent}>
          <ellipse cx={0} cy={0.6} rx={3.4} ry={2.8} />
          <ellipse cx={0} cy={0.6} rx={1.4} ry={2.8} fill={color} opacity={0.25} />
          <rect x={-0.4} y={-3.4} width={0.8} height={1.4} rx={0.3} />
        </g>
      );
    case 'tuliprow':
      return (
        <g fill={accent}>
          {[-3, 0, 3].map((x) => (
            <g key={x} transform={`translate(${x} 0) scale(0.55)`}>
              <path d="M -2.5 -1 Q -2.5 -4 0 -4.5 Q 2.5 -4 2.5 -1 Q 1.2 0.5 0 0 Q -1.2 0.5 -2.5 -1 Z" />
              <path d="M 0 0 V 4" stroke={accent} strokeWidth={0.8} />
            </g>
          ))}
        </g>
      );
    case 'vine':
      return (
        <g stroke={accent} strokeWidth={0.5} fill={accent}>
          <path d="M -4.5 3 C -1 2 1 -2 4.5 -3" fill="none" />
          <ellipse cx={-2} cy={1.7} rx={1.2} ry={0.55} transform="rotate(-30 -2 1.7)" />
          <ellipse cx={0.4} cy={-0.4} rx={1.2} ry={0.55} transform="rotate(-45 0.4 -0.4)" />
          <ellipse cx={2.7} cy={-2.2} rx={1.2} ry={0.55} transform="rotate(-30 2.7 -2.2)" />
        </g>
      );
    default:
      return null;
  }
}

function star5(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

// ---------------------------------------------------------------------------
// Legacy motifs — byte-for-byte the original fifteen looks
// ---------------------------------------------------------------------------

function legacyTile(id: string, color: string, accent: string): PatternTile | null {
  const t = 14;
  switch (id) {
    case 'dots':
      return {
        size: t,
        node: (
          <>
            <circle cx={t * 0.25} cy={t * 0.25} r={t * 0.13} fill={accent} />
            <circle cx={t * 0.75} cy={t * 0.75} r={t * 0.13} fill={accent} />
          </>
        ),
      };
    case 'stripes':
      return {
        size: t,
        node: (
          <path
            d={`M ${-t / 4} ${t / 4} l ${t / 2} ${-t / 2} M 0 ${t} L ${t} 0 M ${t * 0.75} ${t * 1.25} l ${t / 2} ${-t / 2}`}
            stroke={accent}
            strokeWidth={t * 0.18}
          />
        ),
      };
    case 'checks':
      return {
        size: t,
        node: (
          <>
            <rect x={0} y={0} width={t / 2} height={t / 2} fill={accent} />
            <rect x={t / 2} y={t / 2} width={t / 2} height={t / 2} fill={accent} />
          </>
        ),
      };
    case 'crosshatch':
      return {
        size: t,
        node: (
          <path d={`M 0 0 L ${t} ${t} M ${t} 0 L 0 ${t}`} stroke={accent} strokeWidth={t * 0.09} />
        ),
      };
    case 'flowers':
      return {
        size: t,
        node: (
          <g fill={accent}>
            <circle cx={t / 2} cy={t * 0.28} r={t * 0.12} />
            <circle cx={t * 0.72} cy={t / 2} r={t * 0.12} />
            <circle cx={t / 2} cy={t * 0.72} r={t * 0.12} />
            <circle cx={t * 0.28} cy={t / 2} r={t * 0.12} />
            <circle cx={t / 2} cy={t / 2} r={t * 0.09} fill={color} stroke={accent} strokeWidth={t * 0.03} />
          </g>
        ),
      };
    case 'zigzag':
      return {
        size: t,
        node: (
          <path
            d={`M 0 ${t * 0.65} L ${t * 0.25} ${t * 0.35} L ${t * 0.5} ${t * 0.65} L ${t * 0.75} ${t * 0.35} L ${t} ${t * 0.65}`}
            stroke={accent}
            strokeWidth={t * 0.1}
            fill="none"
          />
        ),
      };
    case 'gingham':
      return {
        size: t,
        node: (
          <g fill={accent} opacity={0.85}>
            <rect x={0} y={0} width={t / 2} height={t} opacity={0.45} />
            <rect x={0} y={0} width={t} height={t / 2} opacity={0.45} />
          </g>
        ),
      };
    case 'plaid':
      return {
        size: t,
        node: (
          <g stroke={accent}>
            <line x1={t * 0.2} y1={0} x2={t * 0.2} y2={t} strokeWidth={t * 0.1} />
            <line x1={t * 0.42} y1={0} x2={t * 0.42} y2={t} strokeWidth={t * 0.04} />
            <line x1={0} y1={t * 0.2} x2={t} y2={t * 0.2} strokeWidth={t * 0.1} />
            <line x1={0} y1={t * 0.42} x2={t} y2={t * 0.42} strokeWidth={t * 0.04} />
          </g>
        ),
      };
    case 'diamonds':
      return {
        size: t,
        node: (
          <path
            d={`M ${t / 2} ${t * 0.08} L ${t * 0.92} ${t / 2} L ${t / 2} ${t * 0.92} L ${t * 0.08} ${t / 2} Z`}
            stroke={accent}
            strokeWidth={t * 0.07}
            fill="none"
          />
        ),
      };
    case 'stars':
      return { size: t, node: <path d={star5(t / 2, t / 2, t * 0.3, t * 0.12)} fill={accent} /> };
    case 'hearts':
      return {
        size: t,
        node: (
          <path
            d={`M ${t / 2} ${t * 0.72}
                C ${t * 0.15} ${t * 0.45}, ${t * 0.28} ${t * 0.2}, ${t / 2} ${t * 0.38}
                C ${t * 0.72} ${t * 0.2}, ${t * 0.85} ${t * 0.45}, ${t / 2} ${t * 0.72} Z`}
            fill={accent}
          />
        ),
      };
    case 'leaves':
      return {
        size: t,
        node: (
          <g fill={accent}>
            <ellipse cx={t * 0.32} cy={t * 0.32} rx={t * 0.22} ry={t * 0.1} transform={`rotate(45 ${t * 0.32} ${t * 0.32})`} />
            <ellipse cx={t * 0.72} cy={t * 0.72} rx={t * 0.22} ry={t * 0.1} transform={`rotate(-45 ${t * 0.72} ${t * 0.72})`} />
          </g>
        ),
      };
    case 'waves':
      return {
        size: t,
        node: (
          <g stroke={accent} strokeWidth={t * 0.08} fill="none">
            <path d={`M 0 ${t * 0.28} Q ${t * 0.25} ${t * 0.08} ${t * 0.5} ${t * 0.28} T ${t} ${t * 0.28}`} />
            <path d={`M 0 ${t * 0.78} Q ${t * 0.25} ${t * 0.58} ${t * 0.5} ${t * 0.78} T ${t} ${t * 0.78}`} />
          </g>
        ),
      };
    case 'pinstripe':
      return {
        size: t,
        node: (
          <g stroke={accent} strokeWidth={t * 0.05}>
            <line x1={t * 0.25} y1={0} x2={t * 0.25} y2={t} />
            <line x1={t * 0.75} y1={0} x2={t * 0.75} y2={t} />
          </g>
        ),
      };
    default:
      return null;
  }
}
