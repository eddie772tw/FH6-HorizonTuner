import { useId, type ReactNode } from 'react';
import { useDialogTransition } from '../hooks/useDialogTransition';
import { ModalPortal } from '../components/common/ModalPortal';
import { useSettings } from '../context/SettingsContext';
import '../features/settings/SettingsLayout.css';

export function AppDialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useSettings();
  const titleId = useId();
  const { shown, close, panelRef, onTransitionEnd } = useDialogTransition(true, onClose);
  return <ModalPortal>
    <div className={`offcanvas-backdrop fade${shown ? ' show' : ''}`} style={{ display: 'block', zIndex: 1040 }} onClick={close} />
    <div className={`offcanvas offcanvas-end app-menu-drawer app-dialog settings-drawer glass-panel shadow-lg ${className}${shown ? ' show' : ''}`}
      role="dialog" aria-modal="true" aria-hidden={false} aria-labelledby={titleId}
      tabIndex={-1} ref={panelRef} onTransitionEnd={onTransitionEnd}>
      <header className="offcanvas-header border-bottom px-4 py-3">
        <h2 className="offcanvas-title text-primary fw-bold fs-6 m-0" id={titleId}>{t(title)}</h2>
        <button type="button" className="btn-close" aria-label={t('Close')} onClick={close} />
      </header>
      <div className="offcanvas-body px-4 py-3"><div className="settings-surface">{children}</div></div>
    </div>
  </ModalPortal>;
}
