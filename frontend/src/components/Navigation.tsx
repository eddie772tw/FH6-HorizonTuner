import React, { useState, useEffect } from 'react';
import '../App.css';
import { useSettings } from '../context/SettingsContext';

interface NavigationProps {
  activeTab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings';
  setActiveTab: (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings') => void;
  onSubTabJump: (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings', subTarget?: any) => void;
  isConnected: boolean;
  onShowLogs: () => void;
  onShowTheme: () => void;
}

const GitInfoBadge: React.FC = () => {
  const [gitText, setGitText] = useState<string>(() => {
    if (typeof __GIT_BRANCH__ !== 'undefined' && typeof __GIT_COMMIT__ !== 'undefined') {
      return `${__GIT_BRANCH__} (${__GIT_COMMIT__})`;
    }
    return '';
  });

  useEffect(() => {
    if (typeof __GIT_BRANCH__ === 'undefined' || typeof __GIT_COMMIT__ === 'undefined') return;
    if (__GIT_BRANCH__ !== 'main') return;

    const checkReleaseStatus = async () => {
      try {
        const repo = "eddie772tw/FH6-HorizonTuner";
        const releasesRes = await fetch(`https://api.github.com/repos/${repo}/releases`);
        if (!releasesRes.ok) return;
        const releases = await releasesRes.json();
        if (releases.length === 0) return;

        const latestTag = releases[0].tag_name;
        const pureCommit = __GIT_COMMIT__.replace(/^post-/, '');

        const compareRes = await fetch(`https://api.github.com/repos/${repo}/compare/${latestTag}...${pureCommit}`);
        if (!compareRes.ok) return;

        const compareData = await compareRes.json();
        let statusStr = "";
        if (compareData.status === "ahead") {
          statusStr = ` (ahead of ${latestTag} by ${compareData.ahead_by} commits)`;
        } else if (compareData.status === "behind") {
          statusStr = ` (behind ${latestTag})`;
        } else if (compareData.status === "identical") {
          if (!__GIT_COMMIT__.startsWith('post-')) {
            setGitText(`${__GIT_BRANCH__} (${latestTag})`);
            return;
          }
        }

        setGitText(`${__GIT_BRANCH__} (${__GIT_COMMIT__})${statusStr}`);
      } catch (e) {
        console.warn("Failed to check release status", e);
      }
    };

    checkReleaseStatus();
  }, []);

  if (typeof __GIT_BRANCH__ === 'undefined' || typeof __GIT_COMMIT__ === 'undefined') {
    return null;
  }

  return (
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
  );
};

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab: _, onSubTabJump, isConnected, onShowLogs, onShowTheme }) => {
  const { t } = useSettings();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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
            <li className="nav-item">
              <button 
                onClick={() => handleDropdownItemClick('settings')}
                className={`nav-link px-3 py-2 ${activeTab === 'settings' ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`}
                aria-current={activeTab === 'settings' ? 'page' : undefined}
                style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
              >
                {t("Settings")}
              </button>
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
          <span className={`badge ${isConnected ? 'text-bg-success' : 'text-bg-danger'} px-2 py-1 fs-7`}>
            {isConnected ? t("UDP SIGNAL ACTIVE") : t("UDP DISCONNECTED")}
          </span>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
