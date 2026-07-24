import { hudPluginRegistry } from './HudPluginRegistry';
import TempGaugePlugin from './plugins/gauges/temp';
import SimpleGaugePlugin from './plugins/gauges/simple';
import AdvancedGaugePlugin from './plugins/gauges/advanced';
import GForceRadarPlugin from './plugins/telemetry/gforce-radar';
import PedalTracePlugin from './plugins/telemetry/pedal-trace';
import TireSuspensionPlugin from './plugins/telemetry/tire-suspension';

// 自動註冊所有內建的 HUD 外掛與遙測外掛
hudPluginRegistry.register(TempGaugePlugin);
hudPluginRegistry.register(SimpleGaugePlugin);
hudPluginRegistry.register(AdvancedGaugePlugin);
hudPluginRegistry.register(GForceRadarPlugin);
hudPluginRegistry.register(PedalTracePlugin);
hudPluginRegistry.register(TireSuspensionPlugin);

export { hudPluginRegistry };
export * from './types';
