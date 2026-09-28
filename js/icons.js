// Inline SVG icons on a 24x24 grid, stroke based. Always decorative: hidden from assistive technology.

const PATHS = {
  plane: 'M12 2.5c.8 0 1.5 1 1.5 2.2V9l7 4v2l-7-2v4.5l2.5 2V21L12 20l-4 1v-1.5l2.5-2V13l-7 2v-2l7-4V4.7c0-1.2.7-2.2 1.5-2.2z',
  signpost: 'M12 3v18M9 21h6M12 5h6l2 2-2 2h-6M12 11H6l-2 2 2 2h6',
  beer: 'M5 9h10v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM15 11h1.5a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5H15M5 9a2 2 0 0 1 1.5-3.4A3 3 0 0 1 11.5 5a2.5 2.5 0 0 1 3.5 2v2M8.5 12.5v5M11.5 12.5v5',
  dice: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8 8h.01M12 12h.01M16 16h.01',
  plus: 'M12 5v14M5 12h14',
  cards: 'M4 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 3h11a2 2 0 0 1 2 2v11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  archive: 'M3 4h18v5H3zM5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4',
  back: 'M15 5l-7 7 7 7',
  bag: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2',
  alert: 'M12 3.5l9.5 16.5h-19zM12 10v4M12 17h.01',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v5M12 8h.01',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name) {
  const d = PATHS[name];
  if (!d) throw new Error(`Unknown icon "${name}"`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: `icon icon-${name}`,
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
