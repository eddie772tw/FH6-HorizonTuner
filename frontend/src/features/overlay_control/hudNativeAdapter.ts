export interface HudMonitorOption {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  is_primary: boolean;
}

export type HudNativeResultStatus = 'success' | 'unsupported' | 'degraded' | 'error';

export interface HudNativeResult<T> {
  status: HudNativeResultStatus;
  value?: T;
  error?: string;
}

export type HudNativeInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export interface HudNativeAdapter {
  readonly available: boolean;
  getAvailableMonitors(): Promise<HudNativeResult<HudMonitorOption[]>>;
  moveHudToMonitor(monitor: HudMonitorOption): Promise<HudNativeResult<void>>;
  toggleHudWindow(visible: boolean): Promise<HudNativeResult<void>>;
  setHudClickThrough(ignore: boolean): Promise<HudNativeResult<void>>;
  reloadHudWindow(): Promise<HudNativeResult<void>>;
}

export const HUD_COMMAND_TIMEOUT_MS = 4_000;

export async function withHudCommandTimeout<T>(
  operation: Promise<T>,
  timeoutMs = HUD_COMMAND_TIMEOUT_MS,
  label = 'HUD native command',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unavailable<T>(): HudNativeResult<T> {
  return {
    status: 'unsupported',
    error: 'Native HUD commands are unavailable in this web session.',
  };
}

function failed<T>(error: unknown): HudNativeResult<T> {
  return {
    status: 'error',
    error: error instanceof Error ? error.message : 'Native HUD command failed.',
  };
}

function isMonitorList(value: unknown): value is HudMonitorOption[] {
  return Array.isArray(value) && value.every(item => {
    if (typeof item !== 'object' || item === null) return false;
    const monitor = item as Record<string, unknown>;
    return (
      typeof monitor.x === 'number' &&
      typeof monitor.y === 'number' &&
      typeof monitor.width === 'number' &&
      typeof monitor.height === 'number' &&
      typeof monitor.name === 'string' &&
      typeof monitor.is_primary === 'boolean'
    );
  });
}

export function createHudNativeAdapter(invoke?: HudNativeInvoke): HudNativeAdapter {
  const available = typeof invoke === 'function';

  const run = async <T>(
    command: string,
    args: Record<string, unknown> | undefined,
    label: string,
  ): Promise<HudNativeResult<T>> => {
    if (!invoke) return unavailable<T>();
    try {
      const value = await withHudCommandTimeout(invoke<T>(command, args), HUD_COMMAND_TIMEOUT_MS, label);
      return { status: 'success', value };
    } catch (error) {
      return failed<T>(error);
    }
  };

  return {
    available,
    async getAvailableMonitors() {
      const result = await run<unknown>('get_available_monitors', undefined, 'Reading available monitors');
      if (result.status !== 'success') return result as HudNativeResult<HudMonitorOption[]>;
      if (!isMonitorList(result.value)) {
        return {
          status: 'degraded',
          error: 'Native monitor data was not in the expected shape.',
        };
      }
      return { status: 'success', value: result.value };
    },
    moveHudToMonitor(monitor) {
      return run<void>(
        'move_hud_to_monitor',
        {
          monitorX: monitor.x,
          monitorY: monitor.y,
          width: monitor.width,
          height: monitor.height,
        },
        'Moving HUD to the selected monitor',
      );
    },
    toggleHudWindow(visible) {
      return run<void>(
        'toggle_hud_window',
        { visible, destroy: !visible },
        visible ? 'Launching HUD overlay' : 'Closing HUD overlay',
      );
    },
    setHudClickThrough(ignore) {
      return run<void>('set_hud_click_through', { ignore }, 'Configuring HUD click-through');
    },
    reloadHudWindow() {
      return run<void>('reload_hud_window', undefined, 'Reloading HUD overlay');
    },
  };
}
