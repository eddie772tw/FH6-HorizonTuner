import React, { useState, useEffect } from 'react';
import '../App.css';
import { useSettings } from '../context/SettingsContext';
import { PREFERRED_BACKEND_PORT } from '../services/backend';
import { checkForAppUpdates, UpdateInfo, isTauriEnvironment } from '../services/updaterService';
import { 
  getAppBuildInfo, 
  formatBuildInfoText, 
  getRemoteReleaseComparison 
} from '../services/buildInfoService';
import { UpdateModal } from './common/UpdateModal';

interface NavigationProps {
  activeTab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings';
  setActiveTab: (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings') => void;
  onSubTabJump: (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings', subTarget?: any) => void;
  isConnected: boolean;
  onShowLogs: () => void;
  onShowTheme: () => void;
  backendPort: number;
}

const GitInfoBadge: React.FC = () => {
  const { settings, t } = useSettings();
  const buildInfo = getAppBuildInfo();
  const [gitText, setGitText] = useState<string>(() => formatBuildInfoText(buildInfo));
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. Silent OTA Check in Tauri Desktop environment if auto_check_updates is enabled
    if (isTauriEnvironment() && settings.auto_check_updates !== false) {
      checkForAppUpdates()
        .then((update) => {
          if (isMounted && update) {
            setAvailableUpdate(update);
          }
        })
        .catch((err) => {
          console.warn('[Navigation] Silent OTA check failed:', err);
        });
    }

    // 2. Dev mode / Browser fallback Git release comparison (Protected with SessionStorage Cache)
    if (!isTauriEnvironment() && buildInfo.gitBranch === 'main') {
      getRemoteReleaseComparison('eddie772tw/FH6-HorizonTuner', buildInfo)
        .then((compareResult) => {
          if (isMounted && compareResult) {
            setGitText(formatBuildInfoText(buildInfo, compareResult));
          }
        })
        .catch((err) => {
          console.warn('[Navigation] Release comparison failed:', err);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [settings.auto_check_updates, buildInfo]);

  return (
    <>
      {availableUpdate ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn btn-sm btn-outline-warning d-inline-flex align-items-center gap-1 py-0 px-2 ms-2 fw-bold"
          style={{
            fontSize: '0.7rem',
            borderRadius: '4px',
            boxShadow: '0 0 8px rgba(255, 193, 7, 0.4)',
            letterSpacing: '0.5px'
          }}
          title={t('Click to review and apply software update')}
        >
          <span className="badge bg-warning text-dark py-0 px-1 me-1 fs-8">{t("OTA")}</span>
          <span>{t('Update Available')}: {availableUpdate.version}</span>
        </button>
      ) : gitText ? (
        <span 
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            background: 'var(--surface-2)',
            padding: '2px 8px',
            borderRadius: '4px',
            marginLeft: '10px',
            fontWeight: 'normal',
            border: '1px solid var(--divider)',
            display: 'inline-block',
            verticalAlign: 'middle',
            textShadow: 'none',
            letterSpacing: '0.5px'
          }}
        >
          {gitText}
        </span>
      ) : null}

      <UpdateModal
        updateInfo={availableUpdate}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
};

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab: _, onSubTabJump, isConnected, onShowLogs, onShowTheme, backendPort }) => {
  const { t } = useSettings();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showUdpPopover, setShowUdpPopover] = useState<boolean>(!isConnected);
  const [showMcpPortPopover, setShowMcpPortPopover] = useState<boolean>(backendPort !== PREFERRED_BACKEND_PORT);
  const hasDynamicMcpPort = backendPort !== PREFERRED_BACKEND_PORT;

  React.useEffect(() => {
    if (!isConnected) {
      setShowUdpPopover(true);
    }
  }, [isConnected]);

  React.useEffect(() => {
    if (hasDynamicMcpPort) {
      setShowMcpPortPopover(true);
    }
  }, [hasDynamicMcpPort]);

  const handleDropdownItemClick = (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings', subTarget?: any) => {
    onSubTabJump(tab, subTarget);
    setActiveDropdown(null);
  };

  return (
    <nav className="navbar navbar-expand-lg border-bottom sticky-top px-4 py-2" style={{ zIndex: 1050, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', overflow: 'visible' }}>
      <div className="container-fluid p-0 d-flex justify-content-between align-items-center" style={{ overflow: 'visible' }}>
        <div className="d-flex align-items-center gap-4">
          <span className="navbar-brand text-primary fw-bold fs-5 d-flex align-items-center m-0">
            FH6-Horizon Tuner
            <GitInfoBadge />
          </span>

          <ul className="navbar-nav flex-row gap-1">
            
            {/* Telemetry Dropdown */}
            <li 
              className="nav-item dropdown position-relative"
              onMouseEnter={() => setActiveDropdown('telemetry')}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button 
                onClick={() => handleDropdownItemClick('telemetry', 'live')}
                className={`nav-link px-3 py-2 d-flex align-items-center gap-1 ${activeTab === 'telemetry' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'telemetry' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("Telemetry")}
                <span className="fs-8 opacity-50 ms-1">▾</span>
              </button>
              {activeDropdown === 'telemetry' && (
                <ul className="dropdown-menu show shadow-lg border rounded position-absolute start-0 top-100 m-0 py-1" style={{ minWidth: '210px', zIndex: 1000, background: 'var(--surface-1)' }}>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('telemetry', 'live')}>
                      {t("Dashboard")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('telemetry', 'analysis')}>
                      {t("Post-Race Analysis")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('telemetry', 'drag')}>
                      {t("Drag Test")}
                    </button>
                  </li>
                </ul>
              )}
            </li>

            {/* Tuning Setup Dropdown */}
            <li 
              className="nav-item dropdown position-relative"
              onMouseEnter={() => setActiveDropdown('tuning')}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button 
                onClick={() => handleDropdownItemClick('tuning', 1)}
                className={`nav-link px-3 py-2 d-flex align-items-center gap-1 ${activeTab === 'tuning' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'tuning' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("Tuning Setup")}
                <span className="fs-8 opacity-50 ms-1">▾</span>
              </button>
              {activeDropdown === 'tuning' && (
                <ul className="dropdown-menu show shadow-lg border rounded position-absolute start-0 top-100 m-0 py-1" style={{ minWidth: '220px', zIndex: 1000, background: 'var(--surface-1)' }}>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-7" onClick={() => handleDropdownItemClick('tuning', 1)}>
                      <span className="badge bg-primary-subtle text-primary">1</span> {t("Goal & Setup")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-7" onClick={() => handleDropdownItemClick('tuning', 2)}>
                      <span className="badge bg-primary-subtle text-primary">2</span> {t("Gearbox")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-7" onClick={() => handleDropdownItemClick('tuning', 3)}>
                      <span className="badge bg-primary-subtle text-primary">3</span> {t("Chassis")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-7" onClick={() => handleDropdownItemClick('tuning', 4)}>
                      <span className="badge bg-primary-subtle text-primary">4</span> {t("Tire & Alignment")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-7" onClick={() => handleDropdownItemClick('tuning', 5)}>
                      <span className="badge bg-primary-subtle text-primary">5</span> {t("Telemetry Calibration")}
                    </button>
                  </li>
                </ul>
              )}
            </li>

            {/* Car Parameters Dropdown */}
            <li 
              className="nav-item dropdown position-relative"
              onMouseEnter={() => setActiveDropdown('car_params')}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button 
                onClick={() => handleDropdownItemClick('car_params', 'config')}
                className={`nav-link px-3 py-2 d-flex align-items-center gap-1 ${activeTab === 'car_params' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'car_params' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("Car Parameters")}
                <span className="fs-8 opacity-50 ms-1">▾</span>
              </button>
              {activeDropdown === 'car_params' && (
                <ul className="dropdown-menu show shadow-lg border rounded position-absolute start-0 top-100 m-0 py-1" style={{ minWidth: '210px', zIndex: 1000, background: 'var(--surface-1)' }}>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('car_params', 'config')}>
                      {t("Profile Configuration")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('car_params', 'dyno')}>
                      {t("Live Dyno Curve")}
                    </button>
                  </li>
                </ul>
              )}
            </li>

            {/* HUD Overlay Dropdown */}
            <li 
              className="nav-item dropdown position-relative"
              onMouseEnter={() => setActiveDropdown('overlay')}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button 
                onClick={() => handleDropdownItemClick('overlay', 'general')}
                className={`nav-link px-3 py-2 d-flex align-items-center gap-1 ${activeTab === 'overlay' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'overlay' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("HUD Overlay")}
                <span className="fs-8 opacity-50 ms-1">▾</span>
              </button>
              {activeDropdown === 'overlay' && (
                <ul className="dropdown-menu show shadow-lg border rounded position-absolute start-0 top-100 m-0 py-1" style={{ minWidth: '200px', zIndex: 1000, background: 'var(--surface-1)' }}>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('overlay', 'general')}>
                      {t("General Settings")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('overlay', 'displays')}>
                      {t("Displays & Layout")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('overlay', 'gauges')}>
                      {t("Gauges & Scales")}
                    </button>
                  </li>
                  <li>
                    <button className="dropdown-item py-2 fs-7" onClick={() => handleDropdownItemClick('overlay', 'performance')}>
                      {t("Performance & System")}
                    </button>
                  </li>
                </ul>
              )}
            </li>

            {/* Settings Link */}
            <li className="nav-item position-relative">
              <button 
                onClick={() => handleDropdownItemClick('settings')}
                className={`nav-link px-3 py-2 ${activeTab === 'settings' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'settings' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("Settings")}
                {hasDynamicMcpPort && (
                  <span className="badge text-bg-warning ms-1 fs-8">{t("MCP")}</span>
                )}
              </button>

              {hasDynamicMcpPort && showMcpPortPopover && (
                <div
                  className="popover bs-popover-bottom show glass-panel shadow-lg border"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    zIndex: 1055,
                    minWidth: '360px',
                    backdropFilter: 'blur(16px)',
                    background: 'var(--glass-bg)',
                    borderColor: 'var(--bs-warning)',
                    cursor: 'default'
                  }}
                  role="status"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      left: '24px',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid var(--bs-warning)'
                    }}
                  />
                  <div className="popover-header bg-transparent border-bottom border-secondary border-opacity-25 px-3 py-2 text-warning fw-bold fs-7 d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                      <span>{t("MCP Endpoint Notice")}</span>
                      <span className="badge text-bg-warning">{t("DYNAMIC PORT")}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-close btn-sm"
                      aria-label={t("Close")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMcpPortPopover(false);
                      }}
                    ></button>
                  </div>
                  <div className="popover-body px-3 py-2 text-start">
                    <div className="fs-7 text-body fw-medium">
                      {t("Release Build could not use backend port 8001 and selected a dynamic port.")}
                    </div>
                    <div className="fs-8 text-secondary mt-1 mb-2">
                      {t("Current backend port")}: <code>{backendPort}</code>. {t("Open Settings > MCP Server to confirm the current endpoint before connecting an Agent.")}
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-warning btn-sm fw-bold w-100"
                      onClick={() => {
                        setShowMcpPortPopover(false);
                        handleDropdownItemClick('settings');
                      }}
                    >
                      {t("Open MCP Settings")} &gt;
                    </button>
                  </div>
                </div>
              )}
            </li>

          </ul>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            onClick={onShowTheme}
            className="btn btn-outline-secondary btn-sm fw-bold"
          >
            {t("Theme")}
          </button>
          <button
            onClick={onShowLogs}
            className="btn btn-outline-primary btn-sm fw-bold"
          >
            {t("Show Logs")}
          </button>
          <div 
            className="position-relative d-inline-block"
            onClick={() => { if (!isConnected) setShowUdpPopover(prev => !prev); }}
            onMouseEnter={() => { if (!isConnected) setShowUdpPopover(true); }}
            onMouseLeave={() => { if (!isConnected) setShowUdpPopover(false); }}
            style={{ cursor: !isConnected ? 'pointer' : 'default' }}
          >
            <span className={`badge ${isConnected ? 'text-bg-success' : 'text-bg-danger'} px-2 py-1 fs-7`}>
              {isConnected ? t("UDP SIGNAL ACTIVE") : t("UDP DISCONNECTED")}
            </span>

            {!isConnected && showUdpPopover && (
              <div 
                className="popover bs-popover-bottom show glass-panel shadow-lg border"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 1055,
                  minWidth: '320px',
                  backdropFilter: 'blur(16px)',
                  background: 'var(--glass-bg)',
                  borderColor: 'var(--bs-danger)',
                  cursor: 'default'
                }}
                role="tooltip"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '20px',
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid var(--bs-danger)'
                  }} 
                />
                <div className="popover-header bg-transparent border-bottom border-secondary border-opacity-25 px-3 py-2 text-danger fw-bold fs-7 d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <span>{t("UDP Connection Alert")}</span>
                    <span className="badge text-bg-danger">{t("OFFLINE")}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-sm"
                    aria-label={t("Close")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUdpPopover(false);
                    }}
                  ></button>
                </div>
                <div className="popover-body px-3 py-2 text-start">
                  <div className="fs-7 text-body fw-medium">
                    {t("Forza Horizon UDP telemetry stream is disconnected.")}
                  </div>
                  <div className="fs-8 text-secondary mt-1">
                    {t("Ensure Data Out is turned ON in game HUD settings (Port 8000).")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
