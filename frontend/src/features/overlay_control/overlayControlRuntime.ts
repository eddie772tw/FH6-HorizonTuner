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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const raw = isRecord(input) ? input : {};
  const normalized = normalizeS650HmiConfig(raw);
  return {
    ...DEFAULT_HUD_CONFIG,
    ...normalized,
    units: { ...DEFAULT_HUD_CONFIG.units, ...(isRecord(normalized.units) ? normalized.units : {}) },
    elements: { ...DEFAULT_HUD_CONFIG.elements, ...(isRecord(normalized.elements) ? normalized.elements : {}) },
  } as HudConfigRecord;
}

export function applyHudConfigPatch(config: HudConfigRecord, patch: HudConfigPatch): HudConfigRecord {
  const merged = {
    ...config,
    ...patch,
    units: patch.units ? { ...config.units, ...patch.units } : config.units,
    elements: patch.elements ? { ...config.elements, ...patch.elements } : config.elements,
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
  let localRevision = 0;
  let refreshGeneration = 0;
  let writeChain: Promise<void> = Promise.resolve();
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
    const configuredUnits = config.units ?? DEFAULT_HUD_CONFIG.units!;
    const units = config.followAppUnits !== false ? effectiveUnits : configuredUnits;
    channel?.postMessage({
      type: 'config',
      data: { ...config, effectiveUnit: units.speed, effectiveUnits: units },
    });
  };
  const save = (nextConfig: HudConfigRecord): Promise<boolean> => {
    const revision = ++localRevision;
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
        const pendingWrites = snapshot.pendingWrites - 1;
        if (revision === localRevision) {
          setSnapshot({ ...snapshot, status: pendingWrites > 0 ? 'saving' : 'ready', error: null, pendingWrites });
        } else {
          setSnapshot({ ...snapshot, pendingWrites });
        }
        return true;
      } catch (error) {
        const pendingWrites = snapshot.pendingWrites - 1;
        const message = error instanceof Error ? error.message : 'Saving HUD settings failed.';
        if (revision === localRevision) {
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

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
      const generation = ++refreshGeneration;
      const revisionAtStart = localRevision;
      const controller = new AbortController();
      if (snapshot.pendingWrites === 0) setSnapshot({ ...snapshot, status: 'loading', error: null });
      try {
        const response = await transport.readConfig(controller.signal);
        if (!response.ok) throw errorForResponse('Loading HUD settings', response);
        const data = await response.json();
        if (generation !== refreshGeneration || revisionAtStart !== localRevision || snapshot.pendingWrites > 0) return false;
        const config = normalizeHudRuntimeConfig(data);
        setSnapshot({ config, status: snapshot.pendingWrites > 0 ? 'saving' : 'ready', error: null, pendingWrites: snapshot.pendingWrites });
        publish(config);
        return true;
      } catch (error) {
        if (generation !== refreshGeneration || revisionAtStart !== localRevision || snapshot.pendingWrites > 0) return false;
        const message = error instanceof Error ? error.message : 'Loading HUD settings failed.';
        setSnapshot({ ...snapshot, status: snapshot.pendingWrites > 0 ? 'saving' : 'error', error: message, pendingWrites: snapshot.pendingWrites });
        return false;
      }
    },
    retry() {
      return save(snapshot.config);
    },
    updateConfig(patch) {
      return save(applyHudConfigPatch(snapshot.config, patch));
    },
    replaceConfig(config) {
      return save(normalizeHudRuntimeConfig(config));
    },
    acceptBroadcast(data) {
      // BroadcastChannel carries no revision. A local intent or a confirmed
      // local save therefore wins; a later stale relay cannot roll it back.
      if (snapshot.pendingWrites > 0 || localRevision !== 0) return;
      const config = normalizeHudRuntimeConfig(data);
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
      channel?.postMessage(message);
    },
  };
}
