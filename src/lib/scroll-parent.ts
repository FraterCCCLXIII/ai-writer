/**
 * Nearest ancestor whose overflow-y creates a scroll container (excluding body).
 */
export function getScrollableAncestor(start: Element | null): HTMLElement | null {
  let node: Element | null = start;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") {
      return node as HTMLElement;
    }
    node = node.parentElement;
  }
  return null;
}
