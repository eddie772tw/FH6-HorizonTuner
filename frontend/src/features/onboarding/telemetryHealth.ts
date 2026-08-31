export interface TelemetryPipelineSnapshot {
  input: {
    datagramsReceived: number;
    packetsParsed: number;
    packetsRejected: Record<string, number>;
    lastDatagramAt: number | null;
  };
}

export type TelemetryHealthState = 'active' | 'stale' | 'waiting' | 'invalid' | 'unavailable';

// The diagnostics hook refreshes every 10 seconds; leave a small tolerance so
// a current stream does not briefly appear stale between polls.
export const DATA_OUT_FRESHNESS_WINDOW_SECONDS = 15;

export interface TelemetryHealth {
  state: TelemetryHealthState;
  label: string;
  detail: string;
  datagramsReceived: number;
  validFrames: number;
  hasObservedPacket: boolean;
  lastPacketAt: number | null;
  errors: string[];
}

export function deriveTelemetryHealth(
  snapshot: TelemetryPipelineSnapshot | null,
  requestError?: string | null,
  nowSeconds = Date.now() / 1000,
): TelemetryHealth {
  if (!snapshot) {
    return {
      state: 'unavailable',
      label: 'Health unavailable',
      detail: requestError || 'The local diagnostics endpoint did not return a response.',
      datagramsReceived: 0,
      validFrames: 0,
      hasObservedPacket: false,
      lastPacketAt: null,
      errors: requestError ? [requestError] : [],
    };
  }

  const { datagramsReceived, packetsParsed, packetsRejected, lastDatagramAt } = snapshot.input;
  const errors = Object.entries(packetsRejected)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason} (${count})`);
  const hasObservedPacket = datagramsReceived > 0 || packetsParsed > 0 || lastDatagramAt !== null;
  const isCurrent = lastDatagramAt !== null
    && nowSeconds - lastDatagramAt <= DATA_OUT_FRESHNESS_WINDOW_SECONDS;

  if (packetsParsed > 0 && isCurrent) {
    return {
      state: 'active', label: 'Data Out receiving',
      detail: `${packetsParsed} valid frame${packetsParsed === 1 ? '' : 's'} received.`,
      datagramsReceived, validFrames: packetsParsed, hasObservedPacket, lastPacketAt: lastDatagramAt, errors,
    };
  }
  if (hasObservedPacket && !isCurrent) {
    return {
      state: 'stale', label: 'Data Out not currently receiving',
      detail: 'Packets were observed previously, but no packet has arrived recently.',
      datagramsReceived, validFrames: packetsParsed, hasObservedPacket, lastPacketAt: lastDatagramAt, errors,
    };
  }
  if (hasObservedPacket) {
    return {
      state: 'invalid', label: 'Data received, but not usable',
      detail: errors.length ? 'Check the reported packet format issue.' : 'No valid telemetry frame has been parsed yet.',
      datagramsReceived, validFrames: 0, hasObservedPacket, lastPacketAt: lastDatagramAt, errors,
    };
  }
  return {
    state: 'waiting', label: 'Waiting for Data Out',
    detail: 'No Data Out packet has reached this app yet.',
    datagramsReceived: 0, validFrames: 0, hasObservedPacket: false, lastPacketAt: null, errors: [],
  };
}

export const DATA_OUT_GUIDE_STORAGE_KEY = 'fh6-data-out-guide/v1';

export function hasCompletedDataOutGuide(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(DATA_OUT_GUIDE_STORAGE_KEY) === 'completed';
}

export function hasDismissedDataOutGuide(storage: Pick<Storage, 'getItem'>): boolean {
  const choice = storage.getItem(DATA_OUT_GUIDE_STORAGE_KEY);
  return choice === 'completed' || choice === 'skipped';
}

export function saveDataOutGuideChoice(
  storage: Pick<Storage, 'setItem'>,
  choice: 'completed' | 'skipped',
): void {
  storage.setItem(DATA_OUT_GUIDE_STORAGE_KEY, choice);
}
