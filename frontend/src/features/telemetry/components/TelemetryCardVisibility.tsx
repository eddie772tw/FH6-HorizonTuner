import { createContext, useContext, useEffect, useState, type RefObject } from 'react';

/** A card-local paint switch. Telemetry subscriptions and history never depend on it. */
export interface TelemetryCardPaint {
  canPaint: () => boolean;
  subscribe: (repaint: () => void) => () => void;
}

const alwaysPaint: TelemetryCardPaint = {
  canPaint: () => true,
  subscribe: () => () => undefined,
};

export const TelemetryCardPaintContext = createContext<TelemetryCardPaint>(alwaysPaint);
export const useTelemetryCardPaint = () => useContext(TelemetryCardPaintContext);

function createPaintGate() {
  let visible = true;
  const listeners = new Set<() => void>();
  const gate: TelemetryCardPaint = {
    canPaint: () => visible,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const repaint = () => {
    if (visible) for (const listener of listeners) listener();
  };
  return {
    gate,
    repaint,
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      repaint();
    },
  };
}

/** Observe the actual card, including clipping by its scrolling ancestors. */
export function useViewportPaintGate<T extends Element>(ref: RefObject<T | null>, targetKey?: unknown): TelemetryCardPaint {
  const [controller] = useState(createPaintGate);
  useEffect(() => {
    const target = ref.current;
    let active = true;
    controller.setVisible(true); // Missing/unsupported observers keep rendering conservatively.
    const observer = target && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(entries => {
        if (!active) return;
        for (const entry of entries) {
          if (entry.target === target) controller.setVisible(entry.isIntersecting);
        }
      }, { threshold: 0 })
      : null;
    if (target) observer?.observe(target);

    // DPR changes need a repaint even when no new telemetry packet arrives.
    let resolution: MediaQueryList | null = null;
    const onResolutionChange = () => {
      if (!active) return;
      controller.repaint();
      watchResolution();
    };
    const watchResolution = () => {
      resolution?.removeEventListener?.('change', onResolutionChange);
      resolution = typeof window.matchMedia === 'function'
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;
      resolution?.addEventListener?.('change', onResolutionChange);
    };
    watchResolution();
    window.addEventListener('resize', controller.repaint);
    return () => {
      active = false;
      observer?.disconnect();
      resolution?.removeEventListener?.('change', onResolutionChange);
      window.removeEventListener('resize', controller.repaint);
    };
  }, [controller, ref, targetKey]);
  return controller.gate;
}

/** Cache CSS dimensions in ResizeObserver, then update backing pixels only when painting. */
export function createTelemetryCanvasSurface(canvas: HTMLCanvasElement) {
  let width = 0;
  let height = 0;
  return {
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
    },
    sync() {
      if (width <= 0 || height <= 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.floor(width * dpr);
      const pixelHeight = Math.floor(height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      return pixelWidth > 0 && pixelHeight > 0;
    },
  };
}
