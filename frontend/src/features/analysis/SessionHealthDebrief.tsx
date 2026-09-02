import React from "react";
import { SessionDebriefData } from "./sessionDebriefMath";
import { useSettings } from "../../context/SettingsContext";

interface SessionHealthDebriefProps {
  debrief: SessionDebriefData;
  isLoading?: boolean;
}

const SessionHealthDebrief: React.FC<SessionHealthDebriefProps> = ({ debrief, isLoading = false }) => {
  const { t } = useSettings();

  if (isLoading) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: "1.5rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "var(--text-secondary)",
          minHeight: "220px",
        }}
      >
        {t("Analyzing Session Dynamics...")}
      </div>
    );
  }

  const { tire_thermals, suspension, handling_balance, total_samples, valid_laps } = debrief;

  // Thermal Badge Color
  const thermalBadgeColor =
    tire_thermals.status === "Optimal"
      ? "#00ffaa"
      : tire_thermals.status === "Overheating"
      ? "#ff003c"
      : "#00f0ff";

  // Suspension Badge Color
  const suspBadgeColor =
    suspension.status === "Optimal"
      ? "#00ffaa"
      : suspension.status === "Severe Bottoming"
      ? "#ff003c"
      : "#ffaa00";

  // Handling Badge Color
  const handlingBadgeColor =
    handling_balance.tendency === "Neutral / Balanced"
      ? "#00ffaa"
      : handling_balance.tendency === "Understeer Biased"
      ? "#00f0ff"
      : "#ffaa00";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
      {/* Cards 2x2 Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        
        {/* Card 1: Tire Thermal Balance */}
        <div className="glass-panel" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
              🌡️ {t("Tire Thermal Balance")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "12px",
                background: `${thermalBadgeColor}22`,
                color: thermalBadgeColor,
                border: `1px solid ${thermalBadgeColor}66`,
                fontWeight: "bold",
              }}
            >
              {t(tire_thermals.status)}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", background: "rgba(0,0,0,0.25)", padding: "0.75rem", borderRadius: "6px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>FL</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                {tire_thermals.fl_avg.toFixed(1)}°C
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>FR</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                {tire_thermals.fr_avg.toFixed(1)}°C
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>RL</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                {tire_thermals.rl_avg.toFixed(1)}°C
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>RR</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                {tire_thermals.rr_avg.toFixed(1)}°C
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Suspension & Bottom-out */}
        <div className="glass-panel" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
              🛞 {t("Suspension Utilization")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "12px",
                background: `${suspBadgeColor}22`,
                color: suspBadgeColor,
                border: `1px solid ${suspBadgeColor}66`,
                fontWeight: "bold",
              }}
            >
              {t(suspension.status)}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", background: "rgba(0,0,0,0.25)", padding: "0.75rem", borderRadius: "6px", flex: 1 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Peak Travel")}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--primary)" }}>
                {suspension.peak_travel_pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ width: "1px", height: "30px", background: "rgba(255,255,255,0.1)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Bottom-out Count")}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: suspension.bottom_out_count > 0 ? "#ff003c" : "#00ffaa" }}>
                {suspension.bottom_out_count}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Handling Dynamics & Tendency */}
        <div className="glass-panel" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
              ⚖️ {t("Cornering Balance")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "12px",
                background: `${handlingBadgeColor}22`,
                color: handlingBadgeColor,
                border: `1px solid ${handlingBadgeColor}66`,
                fontWeight: "bold",
              }}
            >
              {t(handling_balance.tendency)}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", background: "rgba(0,0,0,0.25)", padding: "0.75rem", borderRadius: "6px", flex: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              <span>{t("Understeer")}: {handling_balance.understeer_pct.toFixed(1)}%</span>
              <span>{t("Oversteer")}: {handling_balance.oversteer_pct.toFixed(1)}%</span>
            </div>
            {/* Dual Color Progress Bar */}
            <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${handling_balance.understeer_pct}%`, background: "#00f0ff", transition: "width 0.3s" }} />
              <div style={{ width: `${handling_balance.oversteer_pct}%`, background: "#ffaa00", transition: "width 0.3s" }} />
            </div>
          </div>
        </div>

        {/* Card 4: Telemetry Sample Health */}
        <div className="glass-panel" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
              📡 {t("Signal Integrity")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "12px",
                background: "#00ffaa22",
                color: "#00ffaa",
                border: "1px solid #00ffaa66",
                fontWeight: "bold",
              }}
            >
              60 Hz {t("Active")}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", background: "rgba(0,0,0,0.25)", padding: "0.75rem", borderRadius: "6px", flex: 1 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Valid Laps")}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--primary)" }}>
                {valid_laps}
              </div>
            </div>
            <div style={{ width: "1px", height: "30px", background: "rgba(255,255,255,0.1)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Total Samples")}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                {total_samples.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SessionHealthDebrief;