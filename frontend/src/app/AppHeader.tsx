import { useSettings } from '../context/SettingsContext';
import { AppStatus } from './AppStatus';
import { AppBuildInfo } from './AppBuildInfo';
import { AppMenu } from './AppMenu';
import { AppCompanionIndicator } from './AppCompanionIndicator';
import { getWorkspaces, type AppSurface, type AppVariant, type WorkspaceId } from './workspaceManifest';

export function AppHeader({ variant, activeWorkspace, onSelect, onOpenSurface }: {
  variant: AppVariant; activeWorkspace: WorkspaceId; onSelect: (workspace: WorkspaceId) => void;
  onOpenSurface: (surface: AppSurface) => void;
}) {
  const { t } = useSettings();
  return <header className="navbar border-bottom sticky-top px-3 py-2 gap-2 flex-wrap"
    style={{ zIndex: 1050, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))' }}>
    <div className="d-flex align-items-center flex-wrap gap-2">
      <span className="navbar-brand text-primary fw-bold m-0">{t(variant === 'lite' ? 'FH6 HorizonTuner Lite' : 'FH6-Horizon Tuner')}</span>
      <AppBuildInfo />
      <nav className="nav nav-pills flex-row flex-wrap gap-1" aria-label={t('Workspaces')}>
        {getWorkspaces(variant).map(workspace => <button key={workspace.id} type="button"
          className={`nav-link ${workspace.id === activeWorkspace ? 'active' : ''}`}
          aria-current={workspace.id === activeWorkspace ? 'page' : undefined} onClick={() => onSelect(workspace.id)}>{t(workspace.label)}</button>)}
      </nav>
    </div>
    <div className="d-flex align-items-center gap-2"><AppCompanionIndicator onOpen={() => onOpenSurface('companion')} /><AppStatus onOpenSettings={() => onOpenSurface('settings')} /><AppMenu onOpen={onOpenSurface} /></div>
  </header>;
}
