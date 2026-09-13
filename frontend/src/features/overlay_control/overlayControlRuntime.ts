import { DEFAULT_HUD_CONFIG, type HudConfig, type HudElements } from './hudConfig';
import { normalizeS650HmiConfig } from './s650/config';
import type { HudDisplayUnits } from './HudUnitSettingsSidebar';

export type HudConfigRecord = HudConfig & Record<string, unknown>;

export type HudConfigPatch = Omit<Partial<HudConfigRecord>, 'elements' | 'units'> & {
  elements?: Partial<HudElements>;
  units?: Partial<HudDisplayUnits>;
};

export type OverlayControlStatus = 'loading' | 'ready' | 'saving' | 'error';

export interface OverlayControlSnapshot {
  config: HudConfigRecord;
  status: OverlayControlStatus;
  error: string | null;
  pendingWrites: number;
}

export interface ResponseLike {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

export interface OverlayControlTransport {
  readConfig(signal: AbortSignal): Promise<ResponseLike>;
  saveConfig(config: HudConfigRecord): Promise<ResponseLike>;
}

export interface OverlayControlChannel {
  postMessage(message: unknown): void;
}

export interface OverlayControlRuntime {
  getSnapshot(): OverlayControlSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<boolean>;
  retry(): Promise<boolean>;
  updateConfig(patch: HudConfigPatch): Promise<boolean>;
  replaceConfig(config: HudConfig | HudConfigRecord): Promise<boolean>;
  acceptBroadcast(config: unknown): void;
  setEffectiveUnits(units: HudDisplayUnits): void;
  publishConfig(): void;
  sendHudCommand(message: unknown): void;
}

type FailedOperation = 'read' | 'write' | null;

const DERIVED_CHANNEL_FIELDS = new Set(['effectiveUnit', 'effectiveUnits']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutDerivedChannelFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !DERIVED_CHANNEL_FIELDS.has(key)));
}

function errorForResponse(action: string, response: ResponseLike): Error {
  const suffix = response.status ? ` (HTTP ${response.status})` : '';
  return new Error(`${action} failed${suffix}.`);
}

async function responseIsSuccessful(response: ResponseLike, action: string): Promise<void> {
  if (!response.ok) throw errorForResponse(action, response);
  const body = await response.json();
  if (isRecord(body) && body.success === false) {
    throw new Error(typeof body.error === 'string' ? body.error : `${action} was rejected.`);
  }
}

export function normalizeHudRuntimeConfig(input: unknown): HudConfigRecord {
  const raw = isRecord(input) ? withoutDerivedChannelFields(input) : {};
  const normalized = normalizeS650HmiConfig(raw);
  return {
    ...DEFAULT_HUD_CONFIG,
    ...normalized,
    units: { ...DEFAULT_HUD_CONFIG.units, ...(isRecord(normalized.units) ? normalized.units : {}) },
    elements: { ...DEFAULT_HUD_CONFIG.elements, ...(isRecord(normalized.elements) ? normalized.elements : {}) },
  } as HudConfigRecord;
}

export function applyHudConfigPatch(config: HudConfigRecord, patch: HudConfigPatch): HudConfigRecord {
  const persistedPatch = withoutDerivedChannelFields(patch);
  const units = isRecord(persistedPatch.units) ? persistedPatch.units : undefined;
  const elements = isRecord(persistedPatch.elements) ? persistedPatch.elements : undefined;
  const merged = {
    ...config,
    ...persistedPatch,
    units: units ? { ...config.units, ...units } : config.units,
    elements: elements ? { ...config.elements, ...elements } : config.elements,
  } as HudConfigRecord;
  return normalizeHudRuntimeConfig(merged);
}

/**
 * App-session HUD config owner. It deliberately has no React dependency so
 * queued writes can finish while a workspace page is unmounted.
 */
export function createOverlayControlRuntime(
  transport: OverlayControlTransport,
  channel?: OverlayControlChannel,
): OverlayControlRuntime {
  let snapshot: OverlayControlSnapshot = {
    config: normalizeHudRuntimeConfig(DEFAULT_HUD_CONFIG),
    status: 'loading',
    error: null,
    pendingWrites: 0,
  };
  let hasAuthoritativeConfig = false;
  let localRevision = 0;
  let refreshGeneration = 0;
  let writeEpoch = 0;
  let initialLoad: Promise<boolean> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let reconciliationQueued = false;
  let lastFailedOperation: FailedOperation = null;
  let effectiveUnits: HudDisplayUnits = {
    speed: 'kmh',
    boostPressure: 'bar',
    torque: 'nm',
    power: 'hp',
  };
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach(listener => listener());
  const setSnapshot = (next: OverlayControlSnapshot) => {
    snapshot = next;
    notify();
  };
  const publish = (config = snapshot.config) => {
    // Unit projection is a renderer-only concern. Never broadcast defaults
    // before the API has supplied the authoritative persisted config.
    if (!hasAuthoritativeConfig) return;
    const configuredUnits = config.units ?? DEFAULT_HUD_CONFIG.units!;
    const units = config.followAppUnits !== false ? effectiveUnits : configuredUnits;
    try {
      channel?.postMessage({
        type: 'config',
        data: { ...config, effectiveUnit: units.speed, effectiveUnits: units },
      });
    } catch {
      // A workspace can unmount after durable writes have started. A closed
      // renderer channel must not turn that persisted write into a failure.
    }
  };

  const readAuthoritative = async (showLoading: boolean): Promise<boolean> => {
    const generation = ++refreshGeneration;
    const revisionAtStart = localRevision;
    const writeEpochAtStart = writeEpoch;
    const startedWithPendingWrites = snapshot.pendingWrites > 0;
    if (showLoading && !startedWithPendingWrites) {
      setSnapshot({ ...snapshot, status: 'loading', error: null });
    }

    try {
      const controller = new AbortController();
      const response = await transport.readConfig(controller.signal);
      if (!response.ok) throw errorForResponse('Loading HUD settings', response);
      const data = await response.json();
      if (
        generation !== refreshGeneration ||
        revisionAtStart !== localRevision ||
        writeEpochAtStart !== writeEpoch ||
        startedWithPendingWrites ||
        snapshot.pendingWrites > 0
      ) {
        return false;
      }

      const config = normalizeHudRuntimeConfig(data);
      hasAuthoritativeConfig = true;
      lastFailedOperation = null;
      setSnapshot({ config, status: 'ready', error: null, pendingWrites: 0 });
      publish(config);
      return true;
    } catch (error) {
      if (
        generation !== refreshGeneration ||
        revisionAtStart !== localRevision ||
        writeEpochAtStart !== writeEpoch ||
        startedWithPendingWrites ||
        snapshot.pendingWrites > 0
      ) {
        return false;
      }
      const message = error instanceof Error ? error.message : 'Loading HUD settings failed.';
      lastFailedOperation = 'read';
      setSnapshot({ ...snapshot, status: 'error', error: message, pendingWrites: 0 });
      return false;
    }
  };

  const refreshInitial = (): Promise<boolean> => {
    if (hasAuthoritativeConfig) return Promise.resolve(true);
    if (!initialLoad) {
      initialLoad = readAuthoritative(true).finally(() => {
        initialLoad = null;
      });
    }
    return initialLoad;
  };

  const queueReconciliation = () => {
    if (reconciliationQueued) return;
    reconciliationQueued = true;
    queueMicrotask(() => {
      reconciliationQueued = false;
      if (hasAuthoritativeConfig && snapshot.pendingWrites === 0 && lastFailedOperation !== 'write') {
        void readAuthoritative(false);
      }
    });
  };

  const save = (nextConfig: HudConfigRecord): Promise<boolean> => {
    const revision = ++localRevision;
    writeEpoch += 1;
    setSnapshot({
      config: nextConfig,
      status: 'saving',
      error: null,
      pendingWrites: snapshot.pendingWrites + 1,
    });
    publish(nextConfig);

    const completion = writeChain.then(async () => {
      try {
        const response = await transport.saveConfig(nextConfig);
        await responseIsSuccessful(response, 'Saving HUD settings');
        writeEpoch += 1;
        const pendingWrites = snapshot.pendingWrites - 1;
        lastFailedOperation = null;
        if (revision === localRevision) {
          setSnapshot({ ...snapshot, status: pendingWrites > 0 ? 'saving' : 'ready', error: null, pendingWrites });
        } else {
          setSnapshot({ ...snapshot, pendingWrites });
        }
        if (pendingWrites === 0) queueReconciliation();
        return true;
      } catch (error) {
        writeEpoch += 1;
        const pendingWrites = snapshot.pendingWrites - 1;
        const message = error instanceof Error ? error.message : 'Saving HUD settings failed.';
        if (revision === localRevision) {
          lastFailedOperation = 'write';
          setSnapshot({ ...snapshot, status: 'error', error: message, pendingWrites });
        } else {
          setSnapshot({ ...snapshot, pendingWrites });
        }
        return false;
      }
    });
    writeChain = completion.then(() => undefined, () => undefined);
    return completion;
  };

  const savePatch = async (patch: HudConfigPatch): Promise<boolean> => {
    // The defaults are a display placeholder only. No operation may POST them
    // until a GET has established the persisted base (and its unknown fields).
    if (!hasAuthoritativeConfig && !await refreshInitial()) return false;
    return save(applyHudConfigPatch(snapshot.config, patch));
  };

  const saveReplacement = async (config: HudConfig | HudConfigRecord): Promise<boolean> => {
    if (!hasAuthoritativeConfig && !await refreshInitial()) return false;
    return save(normalizeHudRuntimeConfig(config));
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      return hasAuthoritativeConfig ? readAuthoritative(true) : refreshInitial();
    },
    retry() {
      if (!hasAuthoritativeConfig || lastFailedOperation === 'read') return hasAuthoritativeConfig
        ? readAuthoritative(true)
        : refreshInitial();
      return save(snapshot.config);
    },
    updateConfig: savePatch,
    replaceConfig: saveReplacement,
    acceptBroadcast(data) {
      if (!hasAuthoritativeConfig || snapshot.pendingWrites > 0) return;
      // BroadcastChannel has no authority revision. Once local persistence has
      // occurred, a delayed renderer payload cannot be proven newer, so use a
      // fresh GET reconciliation instead of trusting it indefinitely.
      if (localRevision > 0) {
        queueReconciliation();
        return;
      }
      const config = normalizeHudRuntimeConfig(data);
      // The accepted external config is newer authority than any in-flight
      // GET that started before this BroadcastChannel event. Advancing the
      // read generation prevents that delayed response from restoring it.
      refreshGeneration += 1;
      setSnapshot({ config, status: 'ready', error: null, pendingWrites: 0 });
    },
    setEffectiveUnits(units) {
      effectiveUnits = units;
      publish();
    },
    publishConfig() {
      publish();
    },
    sendHudCommand(message) {
      try {
        channel?.postMessage(message);
      } catch {
        // Lifecycle teardown must not abort or reject a durable config write.
      }
    },
  };
}
