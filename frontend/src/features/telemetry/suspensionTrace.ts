export const SUSPENSION_TRACE_WINDOW_MS = 2500;
const SAMPLE_INTERVAL_MS = 1000 / 60;
const CAPACITY = 180;

export interface SuspensionTraceHistory {
  samples: { travel: number; time: number }[];
  size: number;
  offset: number;
  lastSampleTime: number;
}

export function createSuspensionTraceHistory(): SuspensionTraceHistory {
  return {
    samples: Array.from({ length: CAPACITY }, () => ({ travel: 0, time: 0 })),
    size: 0,
    offset: 0,
    lastSampleTime: -Infinity,
  };
}

export function clearSuspensionTraceHistory(history: SuspensionTraceHistory): void {
  history.size = 0;
  history.offset = 0;
  history.lastSampleTime = -Infinity;
}

export function updateSuspensionTraceHistory(
  history: SuspensionTraceHistory, travel: number, now: number,
): void {
  // Render frames can exceed 60Hz. Coalesce their latest endpoint instead of
  // overwriting the entire 2.5-second history at the display's refresh rate.
  let index: number;
  if (history.size > 0 && now - history.lastSampleTime < SAMPLE_INTERVAL_MS) {
    index = (history.offset + history.size - 1) % history.size;
  } else {
    history.lastSampleTime = now;
    if (history.size < CAPACITY) {
      index = history.size++;
    } else {
      index = history.offset;
      history.offset = (history.offset + 1) % CAPACITY;
    }
  }
  const sample = history.samples[index];
  sample.travel = travel;
  sample.time = now;
}
