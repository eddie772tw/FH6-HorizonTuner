export function positionOverlay(anchor: HTMLElement, edge: 'left' | 'right' | 'top' | 'bottom', offset: number, centerOffset: number): void;
export function layoutOverlayItems<T>(items: T[], maxPerRow: number, orientation: 'horizontal' | 'vertical', cellWidth: number, cellHeight: number): { width: number; height: number; items: { id: T; x: number; y: number }[] };
