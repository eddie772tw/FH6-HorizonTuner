import { useId, type ReactNode } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import { ModalPortal } from '../components/common/ModalPortal';
import { useSettings } from '../context/SettingsContext';

export function AppDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useSettings();
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose);
  return <ModalPortal>
    <div className="modal-backdrop show" onClick={onClose} />
    <div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby={titleId}
      tabIndex={-1} ref={dialogRef} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
        <div className="modal-content glass-panel">
          <header className="modal-header"><h2 className="modal-title h5" id={titleId}>{t(title)}</h2>
            <button type="button" className="btn-close" aria-label={t('Close')} onClick={onClose} /></header>
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  </ModalPortal>;
}
