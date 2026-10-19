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

// Grow inward from the selected screen edge; incomplete rows hug that edge.
// Called only when item selection or layout changes, never on a telemetry tick.
export function layoutOverlayItems(items, maxPerRow, orientation, cellWidth, cellHeight, edge = 'right') {
    const capacity = Math.min(Math.max(1, Math.trunc(maxPerRow)), items.length || 1);
    const rows = Math.ceil(items.length / capacity);
    const vertical = orientation === 'vertical';
    const columns = vertical && rows ? Math.ceil(items.length / rows) : capacity;
    return {
        width: columns * cellWidth,
        height: rows * cellHeight,
        items: items.map((id, index) => {
            const row = vertical ? index % rows : Math.floor(index / columns);
            let column = vertical ? Math.floor(index / rows) : index % columns;
            if (vertical && edge === 'right') {
                column = columns - 1 - column;
            } else if (!vertical) {
                const count = Math.min(columns, items.length - row * columns);
                column += edge === 'right' ? columns - count : edge === 'left' ? 0 : (columns - count) / 2;
            }
            return { id, x: column * cellWidth, y: (edge === 'top' ? row : rows - 1 - row) * cellHeight };
        }),
    };
}
