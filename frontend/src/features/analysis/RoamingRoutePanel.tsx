import React, { useState, useEffect } from "react";
import type { CustomRoute } from "./routeTriggerMath";
import { validateRoute } from "./routeTriggerMath";
import type { TelemetryData } from "../../hooks/useTelemetry";

export interface RoamingRoutePanelProps {
  readonly routes: CustomRoute[];
  readonly selectedRouteId: string | null;
  readonly isArmed: boolean;
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

export const RoamingRoutePanel: React.FC<RoamingRoutePanelProps> = ({
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startX, setStartX] = useState<number>(0);
  const [startY, setStartY] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(0);
  const [startRadius, setStartRadius] = useState<number>(15);
  const [endX, setEndX] = useState<number>(0);
  const [endY, setEndY] = useState<number>(0);
  const [endZ, setEndZ] = useState<number>(0);
  const [endRadius, setEndRadius] = useState<number>(15);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  const activeRoute = routes.find((r) => r.route_id === selectedRouteId) ?? null;
  const isCurrentArmed = isArmed && armedRouteId === selectedRouteId;

  useEffect(() => {
    if (activeRoute) {
      setName(activeRoute.name);
      setDescription((activeRoute.metadata?.description as string) || "");
      setStartX(activeRoute.start_x);
      setStartY(activeRoute.start_y);
      setStartZ(activeRoute.start_z);
      setStartRadius(activeRoute.start_radius ?? 15);
      setEndX(activeRoute.end_x ?? 0);
      setEndY(activeRoute.end_y ?? 0);
      setEndZ(activeRoute.end_z ?? 0);
      setEndRadius(activeRoute.end_radius ?? 15);
      setErrorMsg(null);
    } else {
      setName("");
      setDescription("");
      setStartX(0);
      setStartY(0);
      setStartZ(0);
      setStartRadius(15);
      setEndX(0);
      setEndY(0);
      setEndZ(0);
      setEndRadius(15);
    }
  }, [activeRoute]);

  const capturePos = (target: "start" | "end") => {
    if (!liveTelemetry || liveTelemetry.PositionX === undefined) {
      setErrorMsg(t("No live telemetry position available"));
      return;
    }
    const x = Math.round(liveTelemetry.PositionX * 100) / 100;
    const y = Math.round((liveTelemetry.PositionY ?? 0) * 100) / 100;
    const z = Math.round((liveTelemetry.PositionZ ?? 0) * 100) / 100;
    if (target === "start") {
      setStartX(x);
      setStartY(y);
      setStartZ(z);
    } else {
      setEndX(x);
      setEndY(y);
      setEndZ(z);
    }
    setErrorMsg(null);
  };

  const handleSave = async () => {
    const candidate: Partial<CustomRoute> = {
      route_id: selectedRouteId || undefined,
      name: name.trim() || t("Untitled Free Roam Route"),
      mode: "roaming",
      start_x: startX,
      start_y: startY,
      start_z: startZ,
      start_radius: startRadius,
      end_x: endX,
      end_y: endY,
      end_z: endZ,
      end_radius: endRadius,
      metadata: { description: description.trim() },
    };
    const check = validateRoute(candidate);
    if (!check.valid) {
      setErrorMsg(check.error || t("Invalid route configuration"));
      return;
    }
    const success = await onSaveRoute(candidate);
    if (success) setErrorMsg(null);
  };

  return (
    <div className="card mb-3 p-3 border">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="m-0 fw-bold">{t("Free Roam Point-to-Point Route Configuration")}</h6>
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

      {errorMsg && <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: "0.8rem" }}>{errorMsg}</div>}

      <div className="row g-2 mb-2">
        <div className="col-md-6">
          <label className="form-label" style={{ fontSize: "0.75rem" }}>{t("Select Route")}</label>
          <select className="form-select form-select-sm" value={selectedRouteId ?? ""} onChange={(e) => onSelectRoute(e.target.value || null)}>
            <option value="">{t("+ Create New Route")}</option>
            {routes.map((r) => (
              <option key={r.route_id} value={r.route_id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label" style={{ fontSize: "0.75rem" }}>{t("Route Name")}</label>
          <input type="text" className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Mountain Pass Run")} />
        </div>
      </div>

      <div className="row g-2 mb-2">
        <div className="col-md-6">
          <div className="card p-2 bg-dark-subtle border h-100" style={{ fontSize: "0.8rem" }}>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="fw-semibold">{t("Start Gate (Departure)")}</span>
              <button type="button" className="btn btn-sm btn-outline-info py-0 px-2" onClick={() => capturePos("start")}>{t("Capture Live")}</button>
            </div>
            <div className="row g-1 mb-1">
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>X</label><input type="number" step="0.1" className="form-control form-control-sm" value={startX} onChange={(e) => setStartX(parseFloat(e.target.value) || 0)} /></div>
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>Y</label><input type="number" step="0.1" className="form-control form-control-sm" value={startY} onChange={(e) => setStartY(parseFloat(e.target.value) || 0)} /></div>
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>Z</label><input type="number" step="0.1" className="form-control form-control-sm" value={startZ} onChange={(e) => setStartZ(parseFloat(e.target.value) || 0)} /></div>
            </div>
            <div className="d-flex justify-content-between mt-1"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>{t("Radius")}</label><span>{startRadius.toFixed(1)}m</span></div>
            <input type="range" min="5" max="50" step="0.5" className="form-range" value={startRadius} onChange={(e) => setStartRadius(parseFloat(e.target.value))} />
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-2 bg-dark-subtle border h-100" style={{ fontSize: "0.8rem" }}>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="fw-semibold">{t("Finish Gate (Arrival)")}</span>
              <button type="button" className="btn btn-sm btn-outline-info py-0 px-2" onClick={() => capturePos("end")}>{t("Capture Live")}</button>
            </div>
            <div className="row g-1 mb-1">
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>X</label><input type="number" step="0.1" className="form-control form-control-sm" value={endX} onChange={(e) => setEndX(parseFloat(e.target.value) || 0)} /></div>
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>Y</label><input type="number" step="0.1" className="form-control form-control-sm" value={endY} onChange={(e) => setEndY(parseFloat(e.target.value) || 0)} /></div>
              <div className="col-4"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>Z</label><input type="number" step="0.1" className="form-control form-control-sm" value={endZ} onChange={(e) => setEndZ(parseFloat(e.target.value) || 0)} /></div>
            </div>
            <div className="d-flex justify-content-between mt-1"><label className="form-label mb-0" style={{ fontSize: "0.65rem" }}>{t("Radius")}</label><span>{endRadius.toFixed(1)}m</span></div>
            <input type="range" min="5" max="50" step="0.5" className="form-range" value={endRadius} onChange={(e) => setEndRadius(parseFloat(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mt-1">
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={handleSave}>{t("Save Route")}</button>
          {selectedRouteId && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={async () => {
                if (confirm(t("Are you sure you want to delete this route?"))) await onDeleteRoute(selectedRouteId);
              }}
            >
              {t("Delete")}
            </button>
          )}
        </div>

        {selectedRouteId && (
          <div>
            {isCurrentArmed ? (
              <button type="button" className="btn btn-sm btn-warning text-dark" onClick={onDisarmRoute}>{t("Disarm Route")}</button>
            ) : (
              <button type="button" className="btn btn-sm btn-success" onClick={() => onArmRoute(selectedRouteId)}>{t("Arm Route for Timing")}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoamingRoutePanel;
