// The Layout rule (CONTEXT.md): the shape of the screen picks the layout,
// never the device type. The CSS reads the result from <html data-layout>;
// the renderer follows the canvas box, so it needs no part of this rule.

export type Layout = 'stacked' | 'side-by-side';

/** A tall screen stacks the arena above the pad; a square or wide one does not. */
export function layoutFor(width: number, height: number): Layout {
  return height > width ? 'stacked' : 'side-by-side';
}

/** Keep <html data-layout> in step with the viewport, from boot onward. */
export function watchLayout(root: HTMLElement = document.documentElement): void {
  const apply = () => {
    root.dataset.layout = layoutFor(window.innerWidth, window.innerHeight);
  };
  apply();
  window.addEventListener('resize', apply);
}

/**
 * Stop the page zoom that iOS still allows under user-scalable=no: a pinch
 * (Safari's gesture events) and a fast double-tap. The pad needs fast
 * double-taps on one key ("44"), so a double-tap must stay two clicks.
 */
export function blockPageZoom(): void {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
