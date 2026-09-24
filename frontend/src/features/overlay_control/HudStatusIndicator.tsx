import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ModalPortal } from '../../components/common/ModalPortal';
import { HUD_STATUS_LABELS, type HudDisplayState } from './hudStatus';

export interface HudStatusIssue {
  source: string;
  message: string | null;
  retry?: () => void;
}

export function HudStatusIndicator({ state, issues, t }: {
  state: HudDisplayState;
  issues: readonly HudStatusIssue[];
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = t(HUD_STATUS_LABELS[state]);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.min(rect.bottom + 8, window.innerHeight - 96);
      setPosition({ top, left: Math.max(16, Math.min(rect.right - 384, window.innerWidth - 400)), maxHeight: window.innerHeight - top - 16 });
    };
    place();
    closeButton.current?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !details.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !details.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return <>
    <div className="hud-status" data-state={state}>
      <span className="visually-hidden" role="status" aria-atomic="true">{label}</span>
      <button ref={trigger} type="button" className="hud-status-trigger btn btn-sm btn-outline-secondary"
        aria-label={`${t('HUD status')}: ${label}`} aria-expanded={open} aria-controls={open ? id : undefined}
        aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
        <span className={`hud-status-icon${['loading', 'saving', 'applying'].includes(state) ? ' hud-status-working' : ''}`} aria-hidden="true">
          {state === 'attention' ? '!' : state === 'synced' ? '✓' : '•'}
        </span>
        <span className="hud-status-labels" aria-hidden="true">
          {Object.entries(HUD_STATUS_LABELS).map(([key, text]) => <span key={key} className={key === state ? '' : 'hud-status-reserved'}>{t(text)}</span>)}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
    </div>
    {open && <ModalPortal>
      <div ref={details} id={id} role="dialog" aria-label={t('HUD status')}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        className="hud-status-details popover bs-popover-bottom show glass-panel" style={position}>
        <div className="d-flex align-items-center justify-content-between gap-3 border-bottom pb-2 mb-2">
          <h2 className="fs-6 fw-bold m-0">{t('HUD status')}</h2>
          <button ref={closeButton} type="button" className="btn-close" aria-label={t('Close')} onClick={close} />
        </div>
        <p className="small mb-2">{label}</p>
        {issues.filter(issue => issue.message).map(issue => <section key={issue.source} className="hud-status-issue">
          <h3 className="fs-7 fw-bold mb-1">{t(issue.source)}</h3>
          <p className="small text-danger mb-2">{issue.message}</p>
          {issue.retry && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => {
            // The issue (and its button) may disappear synchronously when retry starts.
            closeButton.current?.focus();
            issue.retry?.();
          }}>{t('Retry')}</button>}
        </section>)}
      </div>
    </ModalPortal>}
  </>;
}
