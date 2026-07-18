/**
 * The fabric shopping list: per-fabric piece counts, cut sizes, square
 * footage (including seam allowance) and a practical yardage estimate.
 */
import { BOLT_WIDTH_IN, type TotalsReport } from '../../shared/quilt';
import { FabricSwatch } from './QuiltSvg';

export function TotalsPanel({
  report,
  seamAllowanceIn,
  printable = false,
}: {
  report: TotalsReport;
  seamAllowanceIn: number;
  printable?: boolean;
}) {
  const used = report.totals.filter((t) => t.pieceCount > 0);
  const totalCutSqFt = round2sum(used.map((t) => t.cutSqFt));

  return (
    <section className={printable ? 'panel totals-print' : 'panel'}>
      {!printable && (
        <div className="panel-title-row">
          <h2>Fabric needed</h2>
        </div>
      )}
      {used.length === 0 ? (
        <p className="muted small">Paint some cells and the fabric totals will appear here.</p>
      ) : (
        <table className="totals-table">
          <thead>
            <tr>
              <th className="col-swatch" aria-label="Swatch"></th>
              <th>Fabric</th>
              <th className="num">Pieces</th>
              <th className="num">Sq&nbsp;ft</th>
              <th className="num">Yards*</th>
            </tr>
          </thead>
          <tbody>
            {used.map((t) => (
              <tr key={t.fabric.id}>
                <td className="col-swatch">
                  <FabricSwatch
                    fabric={t.fabric}
                    idPrefix={`${printable ? 'pr' : 'tot'}-${t.fabric.id}`}
                    size={22}
                  />
                </td>
                <td>
                  {t.fabric.name}
                  {t.groups.map((g, i) => (
                    <span key={i} className="muted small cut-size">
                      {g.count} × {formatInches(g.cutWIn)} × {formatInches(g.cutHIn)}
                    </span>
                  ))}
                </td>
                <td className="num">{t.pieceCount}</td>
                <td className="num">{t.cutSqFt.toFixed(2)}</td>
                <td className="num">{t.yards === null ? '—' : formatYards(t.yards)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td>Total</td>
              <td className="num">{used.reduce((n, t) => n + t.pieceCount, 0)}</td>
              <td className="num">{totalCutSqFt.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
      {report.backgroundSqFt !== null && !report.backgroundAssigned && report.backgroundSqFt > 0 && (
        <p className="hint warn">
          The space between the shapes needs about {report.backgroundSqFt.toFixed(1)} sq ft of
          background fabric — pick one under “Quilt size &amp; shape”.
        </p>
      )}
      {report.unassignedCells > 0 && (
        <p className="hint warn">
          {report.unassignedCells} piece{report.unassignedCells === 1 ? '' : 's'} still blank.
        </p>
      )}
      <p className="hint">
        Sq ft includes {seamAllowanceIn > 0 ? `the ${formatInches(seamAllowanceIn)} seam allowance` : 'no seam allowance'} on
        every side, with shaped pieces counted by their cut rectangles. *Yards assume {BOLT_WIDTH_IN}
        &Prime;-wide fabric, cut in strips, rounded up to the next ⅛ yard — a comfortable shopping
        estimate.
      </p>
    </section>
  );
}

/** 2.75 → 2¾″ using unicode fractions when they're exact. */
export function formatInches(inches: number): string {
  const whole = Math.floor(inches);
  const frac = inches - whole;
  const FRACTIONS: [number, string][] = [
    [0.125, '⅛'],
    [0.25, '¼'],
    [0.375, '⅜'],
    [0.5, '½'],
    [0.625, '⅝'],
    [0.75, '¾'],
    [0.875, '⅞'],
  ];
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.001) {
      return `${whole > 0 ? whole : ''}${glyph}″`;
    }
  }
  if (Math.abs(frac) < 0.001) return `${whole}″`;
  return `${round2disp(inches)}″`;
}

/** Yardage is always in eighths (estimateYards rounds up to ⅛). */
export function formatYards(yards: number): string {
  const eighths = Math.round(yards * 8);
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  const glyphs: Record<number, string> = {
    1: '⅛',
    2: '¼',
    3: '⅜',
    4: '½',
    5: '⅝',
    6: '¾',
    7: '⅞',
  };
  if (rem === 0) return `${whole} yd`;
  return `${whole > 0 ? whole + ' ' : ''}${glyphs[rem]} yd`;
}

function round2sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

function round2disp(n: number): number {
  return Math.round(n * 100) / 100;
}
