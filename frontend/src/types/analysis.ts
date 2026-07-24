export interface AnalysisSessionSummary {
  session_id: string;
  car_name: string;
  car_class?: number;
  car_pi?: number;
  start_time: number;
  total_laps: number;
  best_lap_time: number;
  total_distance: number;
}

export interface CustomChannel {
  id: string;
  name: string;
  formula: string;
  unit: string;
  color: string;
}

export interface ChartSlotConfig {
  id: string;
  title: string;
  chartType: 'line' | 'bar' | 'histogram' | 'radar' | 'pie';
  primaryChannel: string;
  compareChannel?: string;
  alignBy: 'time' | 'distance' | 'lap';
}
