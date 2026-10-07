import React from "react";
import type { CustomRoute } from "./routeTriggerMath";
import type { TelemetryData } from "../../hooks/useTelemetry";
import TimeTrialRoutePanel from "./TimeTrialRoutePanel";
import RoamingRoutePanel from "./RoamingRoutePanel";

export interface AnalysisRouteSectionProps {
  readonly activeMode: "circuit" | "time_trial" | "roaming";
  readonly routes: CustomRoute[];
  readonly selectedRouteId: string | null;
  readonly isArmed: boolean;
  readonly armedRouteId: string | null;
  readonly liveTelemetry: TelemetryData | null;
  readonly onSelectRoute: (routeId: string | null) => void;
  readonly onSaveRoute: (route: Partial<CustomRoute>) => Promise<boolean>;
  readonly onDeleteRoute: (routeId: string) => Promise<boolean>;
  readonly onArmRoute: (routeId: string, mode: "time_trial" | "roaming") => Promise<boolean>;
  readonly onDisarmRoute: () => Promise<boolean>;
  readonly onImportRoutes: (file: File) => Promise<void>;
  readonly onExportRoute: (routeId: string) => void;
  readonly t: (text: string) => string;
}

export const AnalysisRouteSection: React.FC<AnalysisRouteSectionProps> = ({
  activeMode,
  routes,
  selectedRouteId,
  isArmed,
  armedRouteId,
  liveTelemetry,
  onSelectRoute,
  onSaveRoute,
  onDeleteRoute,
  onArmRoute,
  onDisarmRoute,
  onImportRoutes,
  onExportRoute,
  t,
}) => {
  if (activeMode === "time_trial") {
    return (
      <TimeTrialRoutePanel
        routes={routes.filter((r) => r.mode === "time_trial")}
        selectedRouteId={selectedRouteId}
        isArmed={isArmed}
        armedRouteId={armedRouteId}
        liveTelemetry={liveTelemetry}
        onSelectRoute={onSelectRoute}
        onSaveRoute={onSaveRoute}
        onDeleteRoute={onDeleteRoute}
        onArmRoute={(id) => onArmRoute(id, "time_trial")}
        onDisarmRoute={onDisarmRoute}
        onImportRoutes={onImportRoutes}
        onExportRoute={onExportRoute}
        t={t}
      />
    );
  }

  if (activeMode === "roaming") {
    return (
      <RoamingRoutePanel
        routes={routes.filter((r) => r.mode === "roaming")}
        selectedRouteId={selectedRouteId}
        isArmed={isArmed}
        armedRouteId={armedRouteId}
        liveTelemetry={liveTelemetry}
        onSelectRoute={onSelectRoute}
        onSaveRoute={onSaveRoute}
        onDeleteRoute={onDeleteRoute}
        onArmRoute={(id) => onArmRoute(id, "roaming")}
        onDisarmRoute={onDisarmRoute}
        onImportRoutes={onImportRoutes}
        onExportRoute={onExportRoute}
        t={t}
      />
    );
  }

  return null;
};

export default AnalysisRouteSection;
