import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import { ModalPortal } from '../components/common/ModalPortal';
import { useSettings } from '../context/SettingsContext';
import '../features/settings/SettingsLayout.css';

export function AppDialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useSettings();
  const titleId = useId();
  const [shown, setShown] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const close = () => {
    if (closing.current) return;
    if (!shown) { onClose(); return; }
    const hasTransition = dialogRef.current && getComputedStyle(dialogRef.current).transitionDuration
      .split(',').some(duration => parseFloat(duration) > 0);
    if (!hasTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    closing.current = true;
    setShown(false);
  };
  const dialogRef = useModalFocus<HTMLDivElement>(shown || closing.current, close);
  return <ModalPortal>
    <div className={`offcanvas-backdrop fade${shown ? ' show' : ''}`} style={{ display: 'block', zIndex: 1040 }} onClick={close} />
    <div className={`offcanvas offcanvas-end app-menu-drawer app-dialog settings-drawer glass-panel shadow-lg ${className}${shown ? ' show' : ''}`}
      role="dialog" aria-modal="true" aria-hidden={!shown && !closing.current} aria-labelledby={titleId}
      tabIndex={-1} ref={dialogRef} onTransitionEnd={event => {
        if (closing.current && event.target === event.currentTarget && event.propertyName === 'transform') onClose();
      }}>
      <header className="offcanvas-header border-bottom px-4 py-3">
        <h2 className="offcanvas-title text-primary fw-bold fs-6 m-0" id={titleId}>{t(title)}</h2>
        <button type="button" className="btn-close" aria-label={t('Close')} onClick={close} />
      </header>
      <div className="offcanvas-body px-4 py-3"><div className="settings-surface">{children}</div></div>
    </div>
  </ModalPortal>;
}
