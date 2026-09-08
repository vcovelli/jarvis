export type GuideRect = { left: number; top: number; width: number; height: number };
export type GuidePlacement = "top" | "bottom" | "left" | "right";
export type GuidePosition = {
  highlight: GuideRect;
  tooltip: (GuideRect & { placement: GuidePlacement; arrow: number }) | null;
};

export function intersectGuideRects(a: GuideRect, b: GuideRect): GuideRect | null {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
  const width = Math.min(a.left + a.width, b.left + b.width) - left;
  const height = Math.min(a.top + a.height, b.top + b.height) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

/** Keep pointers in the visible workspace, clear of the control and coach dock. */
export function positionGuide(
  target: GuideRect, bounds: GuideRect, size: { width: number; height: number },
  preferred: "top" | "bottom" = "bottom",
): GuidePosition | null {
  const highlight = intersectGuideRects(target, bounds);
  if (!highlight || highlight.width < 8 || highlight.height < 8) return null;
  const gap = 12, margin = 8;
  const width = Math.min(size.width, bounds.width - margin * 2), height = size.height;
  if (width <= 0 || height > bounds.height - margin * 2) return { highlight, tooltip: null };
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
  const centerX = highlight.left + highlight.width / 2, centerY = highlight.top + highlight.height / 2;
  const horizontal = clamp(centerX - width / 2, bounds.left + margin, bounds.left + bounds.width - width - margin);
  const vertical = clamp(centerY - height / 2, bounds.top + margin, bounds.top + bounds.height - height - margin);
  const candidates: Record<GuidePlacement, GuideRect> = {
    top: { left: horizontal, top: highlight.top - gap - height, width, height },
    bottom: { left: horizontal, top: highlight.top + highlight.height + gap, width, height },
    left: { left: highlight.left - gap - width, top: vertical, width, height },
    right: { left: highlight.left + highlight.width + gap, top: vertical, width, height },
  };
  const order: GuidePlacement[] = [preferred, preferred === "top" ? "bottom" : "top", "right", "left"];
  for (const placement of order) {
    const rect = candidates[placement];
    if (rect.left < bounds.left + margin || rect.top < bounds.top + margin ||
      rect.left + width > bounds.left + bounds.width - margin || rect.top + height > bounds.top + bounds.height - margin) continue;
    const side = placement === "left" || placement === "right";
    const arrow = clamp(side ? centerY - rect.top : centerX - rect.left, 12, (side ? height : width) - 12);
    return { highlight, tooltip: { ...rect, placement, arrow } };
  }
  // Short landscape screens / open keyboards can leave room only for the ring.
  // The same instruction remains available in the bottom panel.
  return { highlight, tooltip: null };
}
