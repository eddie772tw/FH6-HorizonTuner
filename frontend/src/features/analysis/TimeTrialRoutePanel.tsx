import React, { useState, useEffect } from "react";
import type { CustomRoute } from "./routeTriggerMath";
import { validateRoute } from "./routeTriggerMath";
import type { TelemetryData } from "../../hooks/useTelemetry";
import { useToast } from "../../context/ToastContext";

export interface TimeTrialRoutePanelProps {
  readonly routes: CustomRoute[];
  readonly selectedRouteId: string | null;
  readonly isArmed: boolean;
  readonly isRecording: boolean;
  readonly armedRouteId: string | null;
  readonly liveTelemetry: TelemetryData | null;
  readonly onSelectRoute: (routeId: string | null) => void;
  readonly onSaveRoute: (route: Partial<CustomRoute>) => Promise<boolean>;
  readonly onDeleteRoute: (routeId: string) => Promise<boolean>;
  readonly onArmRoute: (routeId: string) => Promise<boolean>;
  readonly onDisarmRoute: () => Promise<boolean>;
  readonly onImportRoutes: (file: File) => Promise<void>;
  readonly onExportRoute: (routeId: string) => void;
  readonly t: (text: string) => string;
}

export const TimeTrialRoutePanel: React.FC<TimeTrialRoutePanelProps> = ({
  routes,
  selectedRouteId,
  isArmed,
  isRecording,
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
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [trackName, setTrackName] = useState("");
  const [description, setDescription] = useState("");
  const [startX, setStartX] = useState<number>(0);
  const [startY, setStartY] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(0);
  const [radius, setRadius] = useState<number>(15);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  const activeRoute = routes.find((r) => r.route_id === selectedRouteId) ?? null;
  const isCurrentArmed = isArmed && armedRouteId === selectedRouteId;

  useEffect(() => {
    if (activeRoute) {
      setName(activeRoute.name);
      setTrackName((activeRoute.metadata?.track_name as string) || "");
      setDescription((activeRoute.metadata?.description as string) || "");
      setStartX(activeRoute.start_x);
      setStartY(activeRoute.start_y);
      setStartZ(activeRoute.start_z);
      setRadius(activeRoute.start_radius ?? 15);
    } else {
      setName("");
      setTrackName("");
      setDescription("");
      setStartX(0);
      setStartY(0);
      setStartZ(0);
      setRadius(15);
    }
  }, [activeRoute]);

  const handleCapturePosition = () => {
    if (!liveTelemetry || liveTelemetry.PositionX === undefined) {
      addToast({ message: t("No live telemetry position available"), type: "warning" });
      return;
    }
    setStartX(Math.round(liveTelemetry.PositionX * 100) / 100);
    setStartY(Math.round((liveTelemetry.PositionY ?? 0) * 100) / 100);
    setStartZ(Math.round((liveTelemetry.PositionZ ?? 0) * 100) / 100);
  };

  const handleSave = async () => {
    const candidate: Partial<CustomRoute> = {
      route_id: selectedRouteId || undefined,
      name: name.trim() || t("Untitled Time Trial"),
      mode: "time_trial",
      start_x: startX,
      start_y: startY,
      start_z: startZ,
      start_radius: radius,
      metadata: { track_name: trackName.trim(), description: description.trim() },
    };
    const check = validateRoute(candidate);
    if (!check.valid) {
      addToast({ message: check.error || t("Invalid route configuration"), type: "danger" });
      return;
    }
    await onSaveRoute(candidate);
  };

  return (
    <div className="card mb-3 p-3 border">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="m-0 fw-bold">{t("Time Trial Closed Circuit Gate Configuration")}</h6>
        <div className="d-flex gap-2">
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportRoutes(f);
              if (importFileRef.current) importFileRef.current.value = "";
            }}
          />
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => importFileRef.current?.click()}>
            {t("Import Route")}
          </button>
          {selectedRouteId && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onExportRoute(selectedRouteId)}>
              {t("Export Route")}
            </button>
          )}
        </div>
      </div>

      <div className="row g-2 mb-2">
        <div className="col-md-6">
          <label className="form-label" style={{ fontSize: "0.75rem" }}>{t("Select Route")}</label>
          <select
            className="form-select form-select-sm"
            value={selectedRouteId ?? ""}
            onChange={(e) => onSelectRoute(e.target.value || null)}
          >
            <option value="">{t("+ Create New Route")}</option>
            {routes.map((r) => (
              <option key={r.route_id} value={r.route_id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label" style={{ fontSize: "0.75rem" }}>{t("Route Name")}</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Goliath Sprint Lap")}
          />
        </div>
      </div>

      <div className="card p-2 bg-dark-subtle border mb-2" style={{ fontSize: "0.8rem" }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold">{t("Timing Gate (Start / Finish Sphere)")}</span>
          <button type="button" className="btn btn-sm btn-outline-info" onClick={handleCapturePosition}>
            {t("Capture Current Car Position")}
          </button>
        </div>
        <div className="row g-2 mb-2">
          <div className="col-4">
            <label className="form-label mb-0" style={{ fontSize: "0.7rem" }}>X (m)</label>
            <input type="number" step="0.1" className="form-control form-control-sm" value={startX} onChange={(e) => setStartX(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="col-4">
            <label className="form-label mb-0" style={{ fontSize: "0.7rem" }}>Y (m)</label>
            <input type="number" step="0.1" className="form-control form-control-sm" value={startY} onChange={(e) => setStartY(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="col-4">
            <label className="form-label mb-0" style={{ fontSize: "0.7rem" }}>Z (m)</label>
            <input type="number" step="0.1" className="form-control form-control-sm" value={startZ} onChange={(e) => setStartZ(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div>
          <div className="d-flex justify-content-between">
            <label className="form-label mb-0" style={{ fontSize: "0.7rem" }}>{t("Trigger Radius")}</label>
            <span className="fw-bold">{radius.toFixed(1)} m</span>
          </div>
          <input type="range" min="5" max="50" step="0.5" className="form-range" value={radius} onChange={(e) => setRadius(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mt-1">
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={handleSave}>
            {t("Save Route")}
          </button>
          {selectedRouteId && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={async () => {
                if (confirm(t("Are you sure you want to delete this route?"))) {
                  await onDeleteRoute(selectedRouteId);
                }
              }}
            >
              {t("Delete")}
            </button>
          )}
        </div>

        {selectedRouteId && (
          <div>
            {isCurrentArmed ? (
              <button type="button" className="btn btn-sm btn-warning text-dark" onClick={onDisarmRoute} disabled={isRecording}>
                {t("Disarm Route")}
              </button>
            ) : (
              <button type="button" className="btn btn-sm btn-success" disabled={isRecording} onClick={() => onArmRoute(selectedRouteId)}>
                {t("Arm Route for Timing")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeTrialRoutePanel;
