/**
 * The searchable pattern catalog: ~200 generated patterns plus the 15
 * original ("legacy") ones, described as renderer family + parameters.
 * This module is data-only (no JSX) so the Worker can validate pattern ids
 * without pulling in any rendering code. The client-side renderer lives in
 * src/app/components/patternRender.tsx.
 */

export interface PatternDefn {
  id: string;
  label: string;
  /** Search words; the first tag is the category chip. */
  tags: string[];
  family: string;
  p: Record<string, string | number | boolean>;
}

const defs: PatternDefn[] = [];
const seen = new Set<string>();

function add(
  id: string,
  label: string,
  tags: string[],
  family: string,
  p: Record<string, string | number | boolean> = {},
): void {
  if (seen.has(id)) throw new Error(`duplicate pattern id ${id}`);
  seen.add(id);
  defs.push({ id, label, tags, family, p });
}

// ---------------------------------------------------------------------------
// The original fifteen keep their exact ids (and exact rendering, via the
// legacy family) so existing quilts look identical.
// ---------------------------------------------------------------------------

const LEGACY: [string, string, string[]][] = [
  ['solid', 'Solid', ['classic', 'plain']],
  ['dots', 'Classic Dots', ['dots', 'classic', 'polka']],
  ['stripes', 'Classic Stripes', ['stripes', 'classic', 'diagonal']],
  ['checks', 'Classic Checks', ['checks', 'classic']],
  ['crosshatch', 'Crosshatch', ['geometric', 'classic', 'lines']],
  ['flowers', 'Classic Flowers', ['floral', 'classic', 'flower']],
  ['zigzag', 'Classic Zigzag', ['geometric', 'classic', 'chevron']],
  ['gingham', 'Classic Gingham', ['checks', 'classic', 'picnic']],
  ['plaid', 'Classic Plaid', ['checks', 'classic', 'tartan']],
  ['diamonds', 'Classic Diamonds', ['geometric', 'classic', 'diamond']],
  ['stars', 'Classic Stars', ['fancy', 'classic', 'star']],
  ['hearts', 'Classic Hearts', ['fancy', 'classic', 'heart', 'love']],
  ['leaves', 'Classic Leaves', ['nature', 'classic', 'leaf']],
  ['waves', 'Classic Waves', ['geometric', 'classic', 'water']],
  ['pinstripe', 'Classic Pinstripe', ['stripes', 'classic', 'thin']],
];
for (const [id, label, tags] of LEGACY) add(id, label, tags, 'legacy', { legacyId: id });

// ---------------------------------------------------------------------------
// Dots & rings
// ---------------------------------------------------------------------------

const DOT_SIZES: [string, number][] = [
  ['Micro', 0.05],
  ['Tiny', 0.08],
  ['Small', 0.11],
  ['Medium', 0.15],
  ['Large', 0.2],
  ['Jumbo', 0.28],
];
const DOT_ARRANGEMENTS: [string, string][] = [
  ['', 'grid'],
  [' Offset', 'offset'],
  [' Scattered', 'scatter'],
];
for (const [sizeName, size] of DOT_SIZES) {
  for (const [suffix, arrangement] of DOT_ARRANGEMENTS) {
    add(
      `dots-${sizeName.toLowerCase()}${arrangement === 'grid' ? '' : '-' + arrangement}`,
      `${sizeName} Dots${suffix}`,
      ['dots', 'polka', sizeName.toLowerCase(), arrangement],
      'dots2',
      { size, arrangement },
    );
  }
}
for (const [sizeName, size] of [
  ['Tiny', 0.1],
  ['Small', 0.16],
  ['Large', 0.24],
] as [string, number][]) {
  for (const [styleName, thick] of [
    ['Rings', false],
    ['Bold Rings', true],
  ] as [string, boolean][]) {
    add(
      `rings-${sizeName.toLowerCase()}${thick ? '-bold' : ''}`,
      `${sizeName} ${styleName}`,
      ['dots', 'rings', 'circle', sizeName.toLowerCase()],
      'rings',
      { size, thick },
    );
  }
}

// ---------------------------------------------------------------------------
// Stripes: 4 directions x 5 weights x 3 styles = 60
// ---------------------------------------------------------------------------

// SVG y points DOWN, so rotate(135) leans a horizontal bar up-right (↗)
// and rotate(45) leans it down-right (↘).
const STRIPE_ANGLES: [string, number][] = [
  ['Horizontal', 0],
  ['Vertical', 90],
  ['Diagonal ↗', 135],
  ['Diagonal ↘', 45],
];
const STRIPE_WEIGHTS: [string, number][] = [
  ['Pin', 0.04],
  ['Thin', 0.08],
  ['Medium', 0.14],
  ['Wide', 0.24],
  ['Bold', 0.34],
];
const STRIPE_STYLES: [string, string][] = [
  ['', 'solid'],
  [' Double', 'double'],
  [' Dashed', 'dashed'],
];
for (const [angleName, angle] of STRIPE_ANGLES) {
  for (const [weightName, weight] of STRIPE_WEIGHTS) {
    for (const [styleSuffix, style] of STRIPE_STYLES) {
      const slugAngle = angleName.toLowerCase().replace(/[^a-z]/g, '') + (angle === 135 ? '-up' : angle === 45 ? '-down' : '');
      add(
        `stripes-${slugAngle}-${weightName.toLowerCase()}${style === 'solid' ? '' : '-' + style}`,
        `${weightName} ${angleName} Stripes${styleSuffix}`,
        ['stripes', angleName.toLowerCase().split(' ')[0], weightName.toLowerCase(), style],
        'stripes2',
        { angle, weight, style },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Checks, gingham, plaid & woven looks
// ---------------------------------------------------------------------------

const CHECK_SIZES: [string, number][] = [
  ['Mini', 0.6],
  ['Small', 0.9],
  ['Medium', 1.3],
  ['Large', 1.9],
];
for (const [sizeName, scale] of CHECK_SIZES) {
  add(`checks-${sizeName.toLowerCase()}`, `${sizeName} Checks`, ['checks', 'checkerboard', sizeName.toLowerCase()], 'checks2', { scale });
  add(`gingham-${sizeName.toLowerCase()}`, `${sizeName} Gingham`, ['checks', 'gingham', 'picnic', sizeName.toLowerCase()], 'gingham2', { scale });
}
for (const [name, variant] of [
  ['Windowpane Plaid', 'window'],
  ['Tartan Plaid', 'tartan'],
  ['Double Plaid', 'double'],
  ['Madras Plaid', 'madras'],
] as [string, string][]) {
  add(`plaid-${variant}`, name, ['checks', 'plaid', 'tartan', variant], 'plaid2', { variant });
}
add('houndstooth-small', 'Small Houndstooth', ['checks', 'houndstooth', 'woven'], 'houndstooth', { scale: 0.8 });
add('houndstooth-large', 'Large Houndstooth', ['checks', 'houndstooth', 'woven'], 'houndstooth', { scale: 1.4 });
add('argyle', 'Argyle', ['checks', 'argyle', 'diamond', 'sweater'], 'argyle', { scale: 1 });
add('argyle-large', 'Large Argyle', ['checks', 'argyle', 'diamond', 'sweater'], 'argyle', { scale: 1.6 });
add('basketweave', 'Basketweave', ['checks', 'woven', 'basket'], 'basketweave', { scale: 1 });
add('basketweave-wide', 'Wide Basketweave', ['checks', 'woven', 'basket'], 'basketweave', { scale: 1.6 });
add('bricks', 'Bricks', ['checks', 'brick', 'wall'], 'bricks', { scale: 1 });
add('bricks-large', 'Large Bricks', ['checks', 'brick', 'wall'], 'bricks', { scale: 1.6 });
add('ticking-narrow', 'Narrow Ticking', ['stripes', 'ticking', 'farmhouse'], 'ticking', { gap: 0.5 });
add('ticking-wide', 'Wide Ticking', ['stripes', 'ticking', 'farmhouse'], 'ticking', { gap: 0.9 });
add('ticking-dashed', 'Dashed Ticking', ['stripes', 'ticking', 'farmhouse'], 'ticking', { gap: 0.7, dashed: true });
add('ticking-double', 'Double Ticking', ['stripes', 'ticking', 'farmhouse'], 'ticking', { gap: 0.7, double: true });

// ---------------------------------------------------------------------------
// Geometric
// ---------------------------------------------------------------------------

for (const [sizeName, scale] of [
  ['Small', 0.7],
  ['Medium', 1],
  ['Large', 1.5],
] as [string, number][]) {
  add(`chevron-${sizeName.toLowerCase()}`, `${sizeName} Chevron`, ['geometric', 'chevron', 'zigzag', sizeName.toLowerCase()], 'chevron', { scale, vertical: false });
  add(`chevron-${sizeName.toLowerCase()}-vertical`, `${sizeName} Vertical Chevron`, ['geometric', 'chevron', 'zigzag', 'vertical'], 'chevron', { scale, vertical: true });
}
add('herringbone-fine', 'Fine Herringbone', ['geometric', 'herringbone', 'woven'], 'herringbone', { scale: 0.7 });
add('herringbone', 'Herringbone', ['geometric', 'herringbone', 'woven'], 'herringbone', { scale: 1 });
add('herringbone-bold', 'Bold Herringbone', ['geometric', 'herringbone', 'woven'], 'herringbone', { scale: 1.5 });
for (const [name, solid, scale] of [
  ['Small Triangles', true, 0.8],
  ['Large Triangles', true, 1.4],
  ['Hollow Triangles', false, 1],
  ['Tiny Triangles', true, 0.55],
] as [string, boolean, number][]) {
  add(`triangles-${name.split(' ')[0].toLowerCase()}`, name, ['geometric', 'triangle'], 'triangles', { solid, scale });
}
for (const [name, solid, scale] of [
  ['Harlequin', true, 1],
  ['Large Harlequin', true, 1.6],
  ['Hollow Diamonds', false, 1],
  ['Tiny Diamonds', true, 0.6],
] as [string, boolean, number][]) {
  add(`harlequin-${name.split(' ')[0].toLowerCase()}`, name, ['geometric', 'diamond', 'harlequin'], 'harlequin', { solid, scale });
}
for (const [name, diagonal, scale] of [
  ['Square Lattice', false, 1],
  ['Fine Square Lattice', false, 0.6],
  ['Diagonal Lattice', true, 1],
  ['Fine Diagonal Lattice', true, 0.6],
] as [string, boolean, number][]) {
  add(`lattice-${diagonal ? 'diag' : 'sq'}-${scale}`, name, ['geometric', 'lattice', 'trellis', 'grid'], 'lattice', { diagonal, scale });
}
add('quatrefoil', 'Quatrefoil', ['geometric', 'quatrefoil', 'moroccan'], 'quatrefoil', { scale: 1 });
add('quatrefoil-large', 'Large Quatrefoil', ['geometric', 'quatrefoil', 'moroccan'], 'quatrefoil', { scale: 1.6 });
for (const [name, scale, hollow] of [
  ['Fish Scales', 1, false],
  ['Large Fish Scales', 1.6, false],
  ['Scallop Lines', 1, true],
  ['Large Scallop Lines', 1.6, true],
] as [string, number, boolean][]) {
  add(`scales-${scale}${hollow ? '-line' : ''}`, name, ['geometric', 'scallop', 'scale', 'clamshell'], 'scales', { scale, hollow });
}
add('honeycomb', 'Honeycomb', ['geometric', 'hexagon', 'honeycomb'], 'honeycombPat', { scale: 1 });
add('honeycomb-large', 'Large Honeycomb', ['geometric', 'hexagon', 'honeycomb'], 'honeycombPat', { scale: 1.6 });
add('ogee', 'Ogee', ['geometric', 'ogee', 'moroccan'], 'ogee', { scale: 1 });
add('ogee-large', 'Large Ogee', ['geometric', 'ogee', 'moroccan'], 'ogee', { scale: 1.6 });
add('medallion', 'Medallion', ['geometric', 'medallion', 'tile'], 'medallion', { scale: 1 });
add('medallion-large', 'Large Medallion', ['geometric', 'medallion', 'tile'], 'medallion', { scale: 1.6 });
add('fans', 'Fans', ['geometric', 'fan', 'deco'], 'fans', { scale: 1 });
add('fans-large', 'Large Fans', ['geometric', 'fan', 'deco'], 'fans', { scale: 1.6 });
for (const [name, style, scale] of [
  ['Plus Signs', 'plus', 1],
  ['Tiny Plus Signs', 'plus', 0.6],
  ['Swiss Crosses', 'cross', 1],
  ['Tiny Crosses', 'cross', 0.6],
] as [string, string, number][]) {
  add(`crosses-${style}-${scale}`, name, ['geometric', 'cross', 'plus'], 'crosses', { style, scale });
}
for (const [name, scale, spin] of [
  ['Waves Small', 0.8, false],
  ['Waves Rolling', 1.4, false],
  ['Ripples', 1, true],
  ['Big Ripples', 1.6, true],
] as [string, number, boolean][]) {
  add(`waves2-${scale}${spin ? '-r' : ''}`, name, ['geometric', 'wave', 'water'], 'waves2', { scale, ripple: spin });
}
add('pinwheels', 'Pinwheels', ['geometric', 'pinwheel', 'spin'], 'pinwheel', { scale: 1 });
add('pinwheels-large', 'Large Pinwheels', ['geometric', 'pinwheel', 'spin'], 'pinwheel', { scale: 1.6 });
add('chains', 'Chain Links', ['fancy', 'chain', 'link'], 'chains', { scale: 1 });
add('chains-large', 'Large Chain Links', ['fancy', 'chain', 'link'], 'chains', { scale: 1.6 });
add('dot-dash', 'Dot Dash', ['dots', 'dash', 'morse'], 'dotdash', { scale: 1 });
add('dot-dash-large', 'Large Dot Dash', ['dots', 'dash', 'morse'], 'dotdash', { scale: 1.6 });

// ---------------------------------------------------------------------------
// Stamped motifs (florals, nature, fancy) — one renderer, many motifs
// ---------------------------------------------------------------------------

const STAMPS: [string, string, string[], string, number[]][] = [
  // [idBase, label, tags, motif, scales]
  ['daisy', 'Daisies', ['floral', 'daisy', 'flower'], 'daisy', [0.7, 1, 1.5]],
  ['tulip', 'Tulips', ['floral', 'tulip', 'flower'], 'tulip', [1, 1.5]],
  ['blossom', 'Blossoms', ['floral', 'blossom', 'flower', 'cherry'], 'blossom', [1, 1.5]],
  ['rosebud', 'Rosebuds', ['floral', 'rose', 'flower'], 'rosebud', [1, 1.5]],
  ['sprig', 'Sprigs', ['floral', 'sprig', 'stem'], 'sprig', [1, 1.5]],
  ['posy', 'Posies', ['floral', 'posy', 'bouquet', 'flower'], 'posy', [1]],
  ['bloom', 'Bold Blooms', ['floral', 'bloom', 'flower'], 'bloom', [1, 1.5]],
  ['leaf2', 'Scattered Leaves', ['nature', 'leaf'], 'leaf', [0.8, 1.2]],
  ['fern', 'Ferns', ['nature', 'fern', 'leaf'], 'fern', [1]],
  ['clover', 'Clovers', ['nature', 'clover', 'shamrock', 'luck'], 'clover', [0.8, 1.2]],
  ['acorn', 'Acorns', ['nature', 'acorn', 'autumn'], 'acorn', [1]],
  ['pinetree', 'Pine Trees', ['nature', 'tree', 'pine', 'forest'], 'pine', [1]],
  ['snowflake', 'Snowflakes', ['nature', 'snow', 'winter', 'holiday'], 'snowflake', [0.9, 1.4]],
  ['raindrop', 'Raindrops', ['nature', 'rain', 'water', 'drop'], 'raindrop', [0.8, 1.2]],
  ['moon', 'Moons', ['fancy', 'moon', 'night', 'celestial'], 'moon', [0.9, 1.3]],
  ['sun', 'Suns', ['fancy', 'sun', 'celestial'], 'sun', [1, 1.4]],
  ['star2', 'Scattered Stars', ['fancy', 'star', 'night'], 'star', [0.6, 1, 1.4]],
  ['heart2', 'Scattered Hearts', ['fancy', 'heart', 'love'], 'heart', [0.6, 1, 1.4]],
  ['teardrop', 'Teardrops', ['fancy', 'teardrop', 'paisley'], 'teardrop', [0.9, 1.3]],
  ['paisley2', 'Paisley', ['fancy', 'paisley', 'classic'], 'paisley', [1, 1.5]],
  ['confetti', 'Confetti', ['fancy', 'confetti', 'party'], 'confetti', [0.8, 1.2]],
  ['button', 'Buttons', ['fancy', 'button', 'sewing'], 'button', [1, 1.4]],
  ['spool', 'Thread Spools', ['fancy', 'spool', 'sewing', 'thread'], 'spool', [1]],
  ['scissors', 'Scissors', ['fancy', 'scissors', 'sewing'], 'scissorsM', [1]],
  ['bow', 'Bows', ['fancy', 'bow', 'ribbon'], 'bow', [1, 1.4]],
  ['crown', 'Crowns', ['fancy', 'crown', 'royal'], 'crown', [1]],
  ['anchor', 'Anchors', ['fancy', 'anchor', 'nautical'], 'anchor', [1]],
  ['sailboat', 'Sailboats', ['fancy', 'boat', 'nautical'], 'sailboat', [1]],
  ['strawberry', 'Strawberries', ['nature', 'strawberry', 'fruit'], 'strawberry', [1, 1.4]],
  ['cherry', 'Cherries', ['nature', 'cherry', 'fruit'], 'cherry', [1]],
  ['lemon', 'Lemons', ['nature', 'lemon', 'fruit'], 'lemon', [1]],
  ['apple', 'Apples', ['nature', 'apple', 'fruit'], 'apple', [1]],
  ['mushroom', 'Mushrooms', ['nature', 'mushroom', 'cottage'], 'mushroom', [1]],
  ['bee', 'Bees', ['nature', 'bee', 'insect', 'honey'], 'bee', [1]],
  ['butterfly2', 'Butterflies', ['nature', 'butterfly', 'insect'], 'butterfly', [1, 1.4]],
  ['ladybug', 'Ladybugs', ['nature', 'ladybug', 'insect'], 'ladybug', [1]],
  ['bird', 'Little Birds', ['nature', 'bird'], 'bird', [1]],
  ['cat', 'Cats', ['fancy', 'cat', 'pet'], 'cat', [1]],
  ['dog-bone', 'Dog Bones', ['fancy', 'dog', 'bone', 'pet'], 'bone', [1]],
  ['paw', 'Paw Prints', ['fancy', 'paw', 'pet'], 'paw', [1, 1.4]],
  ['music', 'Music Notes', ['fancy', 'music', 'note'], 'music', [1]],
  ['teacup', 'Teacups', ['fancy', 'tea', 'cup', 'kitchen'], 'teacup', [1]],
  ['cupcake', 'Cupcakes', ['fancy', 'cupcake', 'baking'], 'cupcake', [1]],
  ['candy-cane', 'Candy Canes', ['fancy', 'candy', 'holiday', 'christmas'], 'candycane', [1]],
  ['holly', 'Holly', ['nature', 'holly', 'holiday', 'christmas'], 'holly', [1]],
  ['pumpkin', 'Pumpkins', ['nature', 'pumpkin', 'autumn', 'halloween'], 'pumpkin', [1]],
  ['tulip-row', 'Tulip Rows', ['floral', 'tulip', 'row', 'border'], 'tuliprow', [1]],
  ['vine2', 'Trailing Vines', ['nature', 'vine', 'leaf'], 'vine', [1, 1.5]],
];
const SCALE_NAMES: Record<string, string> = { };
for (const [idBase, label, tags, motif, scales] of STAMPS) {
  for (const scale of scales) {
    const sizePrefix = scales.length === 1 || scale === 1 ? '' : scale < 1 ? 'Small ' : 'Large ';
    const idSuffix = scales.length === 1 || scale === 1 ? '' : scale < 1 ? '-small' : '-large';
    add(`${idBase}${idSuffix}`, `${sizePrefix}${label}`, tags, 'stamp', { motif, scale });
  }
}
void SCALE_NAMES;

// ---------------------------------------------------------------------------

export const PATTERN_CATALOG: readonly PatternDefn[] = defs;

export const PATTERN_IDS: readonly string[] = defs.map((d) => d.id);

const byId = new Map(defs.map((d) => [d.id, d]));

export function getPattern(id: string): PatternDefn | undefined {
  return byId.get(id);
}

/** Category chips shown in the picker, in display order. */
export const PATTERN_CATEGORIES = [
  'dots',
  'stripes',
  'checks',
  'geometric',
  'floral',
  'nature',
  'fancy',
  'classic',
] as const;

/**
 * Filter the catalog: every whitespace-separated token must match the label
 * or a tag (case-insensitive substring). An empty query matches everything.
 */
export function searchPatterns(query: string, category?: string): PatternDefn[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return defs.filter((d) => {
    if (category && !d.tags.includes(category)) return false;
    if (tokens.length === 0) return true;
    const haystack = (d.label + ' ' + d.tags.join(' ')).toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}
