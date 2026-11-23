import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';

interface RenderSwitchProps {
  checked: boolean;
  onChange: () => void;
  tooltipText?: string;
  sectionLabel?: string;
}

const tooltipStyle: React.CSSProperties = {
  width: 'max-content', maxWidth: 'min(14rem, calc(100vw - 5rem))', whiteSpace: 'normal', overflowWrap: 'anywhere',
  background: 'var(--bs-body-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--input-radius)',
};

const RenderSwitch: React.FC<RenderSwitchProps> = ({ checked, onChange, tooltipText, sectionLabel }) => {
  const { t } = useSettings();
  const [showTooltip, setShowTooltip] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseLabel = tooltipText || t("Toggle chart rendering for this section");
  const labelText = sectionLabel ? `${baseLabel}: ${sectionLabel}` : baseLabel;
  const openTooltip = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const cardRect = wrapRef.current?.closest('.telemetry-card-shell')?.getBoundingClientRect();
    if (rect) {
      const leftSpace = rect.right - (cardRect?.left ?? 0);
      setAlignLeft(leftSpace < 232 && (cardRect?.right ?? window.innerWidth) - rect.left > leftSpace);
    }
    setShowTooltip(true);
  };

  useEffect(() => {
    if (!showTooltip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const modals = document.querySelectorAll('[aria-modal="true"]:not([aria-hidden="true"])');
      const activeModal = modals[modals.length - 1];
      if (activeModal && !activeModal.contains(wrapRef.current)) return;
      event.preventDefault(); event.stopPropagation(); setShowTooltip(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showTooltip]);

  return (
    <div ref={wrapRef} className="position-relative d-inline-flex align-items-center"
      onMouseEnter={openTooltip} onMouseLeave={() => setShowTooltip(false)} onFocus={openTooltip}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShowTooltip(false); }}>
      <div className="form-check form-switch m-0 d-flex align-items-center">
        <input className="form-check-input mt-0" type="checkbox" role="switch" aria-checked={checked}
          checked={checked} onChange={onChange} aria-label={labelText} style={{ cursor: 'pointer' }} />
      </div>
      {showTooltip && (
        <div className="position-absolute" style={{ top: '100%', ...(alignLeft ? { left: 0 } : { right: 0 }), paddingTop: '6px', zIndex: 1050 }}>
          <div role="tooltip" className="px-2 py-1 fs-8 shadow-sm text-start" style={tooltipStyle}>{labelText}</div>
        </div>
      )}
    </div>
  );
};

export default RenderSwitch;
