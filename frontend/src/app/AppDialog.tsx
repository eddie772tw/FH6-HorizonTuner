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
  const [exiting, setExiting] = useState(false);
  const closed = useRef(false);
  // Native inert blurs the trigger before the opening animation/focus effect.
  const trigger = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finish = () => {
    if (closed.current) return;
    closed.current = true;
    onCloseRef.current();
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const background = document.getElementById('root');
    if (!background) return;
    const wasInert = background.inert;
    background.inert = true;
    // Restore before useModalFocus returns focus to the trigger on unmount.
    return () => { background.inert = wasInert; };
  }, []);
  const close = () => {
    if (closing.current || closed.current) return;
    if (!shown) { finish(); return; }
    closing.current = true;
    setExiting(true);
    setShown(false);
  };
  const dialogRef = useModalFocus<HTMLDivElement>(shown || closing.current, close, trigger.current);
  useEffect(() => {
    if (!exiting) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const style = getComputedStyle(dialogRef.current!);
    const milliseconds = (value: string) => (parseFloat(value) || 0) * (value.trim().endsWith('ms') ? 1 : 1000);
    const durations = style.transitionDuration.split(',').map(milliseconds);
    const delays = style.transitionDelay.split(',').map(milliseconds);
    const properties = style.transitionProperty.split(',');
    const duration = Math.max(0, ...properties.map((property, i) => property.trim() === 'none' ? 0
      : durations[i % durations.length] + delays[i % delays.length]));
    // Closing must also complete when custom CSS/theme changes cancel transitionend.
    if (motion.matches || duration === 0) { finish(); return; }
    const timer = window.setTimeout(finish, duration + 34);
    const reduce = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', reduce);
    return () => { clearTimeout(timer); motion.removeEventListener('change', reduce); };
  }, [exiting]);
  return <ModalPortal>
    <div className={`offcanvas-backdrop fade${shown ? ' show' : ''}`} style={{ display: 'block', zIndex: 1040 }} onClick={close} />
    <div className={`offcanvas offcanvas-end app-menu-drawer app-dialog settings-drawer glass-panel shadow-lg ${className}${shown ? ' show' : ''}`}
      role="dialog" aria-modal="true" aria-hidden={!shown && !closing.current} aria-labelledby={titleId}
      tabIndex={-1} ref={dialogRef} onTransitionEnd={event => {
        if (event.target === event.currentTarget && event.propertyName === 'transform' && closing.current) finish();
      }}>
      <header className="offcanvas-header border-bottom px-4 py-3">
        <h2 className="offcanvas-title text-primary fw-bold fs-6 m-0" id={titleId}>{t(title)}</h2>
        <button type="button" className="btn-close" aria-label={t('Close')} onClick={close} />
      </header>
      <div className="offcanvas-body px-4 py-3"><div className="settings-surface">{children}</div></div>
    </div>
  </ModalPortal>;
}
