// DUSTLINE look plan, in one place. A dusk desert freight yard: sand, rust and amber
// against a teal defender accent. The same names are the CSS custom properties in
// index.html, so the page and the scene never drift apart.
export const PALETTE = {
  canvas: '#241a10',
  surface: '#2e2416',
  hairline: '#4a3823',
  ink: '#f2e8d2',
  muted: '#a58c66',
  accent: '#e8a33d',
  sand: '#c8a06a',
  rust: '#9a5a34',
  teal: '#57b08a',
  danger: '#d4543c',
  sky: '#2b1d12',
};

export function shade(name) {
  return PALETTE[name];
}
