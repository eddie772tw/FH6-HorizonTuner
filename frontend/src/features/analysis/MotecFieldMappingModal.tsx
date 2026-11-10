import React from "react";
import { ModalPortal } from "../../components/common/ModalPortal";
import { useModalFocus } from "../../hooks/useModalFocus";

export interface MotecFieldMappingModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onDownloadTemplate: () => void;
  readonly t: (text: string) => string;
}

interface ChannelMapping {
  motecChannel: string;
  unit: string;
  fhSource: string;
  notes: string;
}

const CHANNELS: ChannelMapping[] = [
  { motecChannel: "Time", unit: "s", fhSource: "time / TimestampMS", notes: "Recording timestamp" },
  { motecChannel: "Distance", unit: "m", fhSource: "lap_distance / DistanceTraveled", notes: "Accumulated lap distance" },
  { motecChannel: "Lap Number", unit: "", fhSource: "LapNumber", notes: "1-indexed lap index" },
  { motecChannel: "Ground Speed", unit: "km/h", fhSource: "SpeedMetersPerSecond", notes: "Value × 3.6" },
  { motecChannel: "Engine RPM", unit: "rpm", fhSource: "CurrentEngineRpm", notes: "Engine speed" },
  { motecChannel: "Gear", unit: "", fhSource: "Gear", notes: "0 = Reverse, 1+ = Forward" },
  { motecChannel: "Throttle Pos", unit: "%", fhSource: "AccelInput", notes: "0-255 normalized to 0-100%" },
  { motecChannel: "Brake Pos", unit: "%", fhSource: "BrakeInput", notes: "0-255 normalized to 0-100%" },
  { motecChannel: "Clutch Pos", unit: "%", fhSource: "ClutchInput", notes: "0-255 normalized to 0-100%" },
  { motecChannel: "Handbrake Pos", unit: "%", fhSource: "HandBrakeInput", notes: "0-255 normalized to 0-100%" },
  { motecChannel: "Steered Angle", unit: "%", fhSource: "SteerInput / steer_pct", notes: "-127~127 normalized to %" },
  { motecChannel: "G Force Lat / Long / Vert", unit: "G", fhSource: "AccelerationX / Z / Y", notes: "Value / 9.80665" },
  { motecChannel: "Boost Pressure", unit: "psi", fhSource: "Boost", notes: "Pa / 6894.75729" },
  { motecChannel: "Fuel Level", unit: "%", fhSource: "Fuel", notes: "Ratio × 100" },
  { motecChannel: "Engine Power", unit: "hp", fhSource: "PowerWatts / Power", notes: "Watts / 745.7" },
  { motecChannel: "Engine Torque", unit: "Nm", fhSource: "TorqueNewtons / Torque", notes: "Engine torque output" },
  { motecChannel: "Susp Pos FL/FR/RL/RR", unit: "%", fhSource: "SuspTravel[0..3]", notes: "Normalized travel (0-100%)" },
  { motecChannel: "Susp Travel FL/FR/RL/RR", unit: "m", fhSource: "SuspensionTravelMeters[0..3]", notes: "Physical travel in meters" },
  { motecChannel: "Normalized Slip Angle FL..RR", unit: "", fhSource: "TireSlipAngle[0..3]", notes: "Unitless normalized slip angle" },
  { motecChannel: "Slip Ratio FL..RR", unit: "", fhSource: "TireSlipRatio[0..3]", notes: "Longitudinal tire slip ratio" },
  { motecChannel: "Tire Temp FL..RR", unit: "°C", fhSource: "TireTemp[0..3]", notes: "(°F - 32) × 5/9" },
  { motecChannel: "GPS Latitude / Longitude / Alt", unit: "deg / m", fhSource: "PositionZ / PositionX / PositionY", notes: "Scaled to Mexico GPS datum" },
];

export const MotecFieldMappingModal: React.FC<MotecFieldMappingModalProps> = ({
  isOpen,
  onClose,
  onDownloadTemplate,
  t,
}) => {
  const panelRef = useModalFocus<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="modal-backdrop fade show"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "var(--surface-filter)",
          WebkitBackdropFilter: "var(--surface-filter)",
          zIndex: 1050,
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="modal show d-block"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="motec-mapping-title"
        aria-describedby="motec-mapping-desc"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1055,
          overflowX: "hidden",
          overflowY: "auto",
          pointerEvents: "none",
        }}
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document">
          <div className="modal-content glass-panel border border-primary border-opacity-25 shadow-lg">
            <div className="modal-header border-bottom border-secondary border-opacity-25 pb-3">
              <h5 id="motec-mapping-title" className="modal-title fw-bold text-primary mb-0 fs-5">
                {t("MoTeC i2 CSV Channel Mapping (41 Channels)")}
              </h5>
              <button type="button" className="btn-close" aria-label={t("Close")} onClick={onClose} />
            </div>
            <div className="modal-body py-3">
              <p id="motec-mapping-desc" className="text-secondary small mb-3">
                {t("HorizonTuner exports 41 telemetry channels with documented unit mappings. Native .ld export is experimental until verified in MoTeC i2.")}
              </p>
              <div
                className="table-responsive"
                tabIndex={0}
                role="region"
                aria-labelledby="motec-mapping-title"
                style={{ maxHeight: "55vh" }}
              >
                <table className="table table-sm table-striped table-hover mb-0" style={{ fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th scope="col">{t("MoTeC Channel")}</th>
                      <th scope="col">{t("Unit")}</th>
                      <th scope="col">{t("Horizon UDP Source")}</th>
                      <th scope="col">{t("Transformation / Notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHANNELS.map((ch) => (
                      <tr key={ch.motecChannel}>
                        <td className="fw-semibold">{ch.motecChannel}</td>
                        <td><code>{ch.unit || "-"}</code></td>
                        <td><code>{ch.fhSource}</code></td>
                        <td>{ch.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer border-top border-secondary border-opacity-25 pt-3">
              <button type="button" className="btn btn-outline-primary" onClick={onDownloadTemplate}>
                {t("Download MoTeC Workspace Template")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t("Close")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default MotecFieldMappingModal;
