export function positionOverlay(anchor, edge, offset, centerOffset) {
    const style = anchor.style;
    style.left = style.right = style.top = style.bottom = 'auto';
    style[edge] = offset + 'px';
    if (edge === 'left' || edge === 'right') {
        style.top = `calc(50% + ${centerOffset}px)`;
        style.transform = 'translateY(-50%)';
    } else {
        style.left = `calc(50% + ${centerOffset}px)`;
        style.transform = 'translateX(-50%)';
    }
}

// Rows grow upward from the bottom. Vertical ordering fills each column upward.
// Called only when item selection or layout changes, never on a telemetry tick.
export function layoutOverlayItems(items, maxPerRow, orientation, cellWidth, cellHeight) {
    const columns = Math.min(Math.max(1, Math.trunc(maxPerRow)), items.length || 1);
    const rows = Math.ceil(items.length / columns);
    return {
        width: columns * cellWidth,
        height: rows * cellHeight,
        items: items.map((id, index) => ({
            id,
            x: (orientation === 'vertical' ? Math.floor(index / rows) : index % columns) * cellWidth,
            y: (rows - 1 - (orientation === 'vertical' ? index % rows : Math.floor(index / columns))) * cellHeight,
        })),
    };
}
