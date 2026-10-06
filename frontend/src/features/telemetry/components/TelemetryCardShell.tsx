import React, { type ReactNode, useEffect, useRef, useCallback } from 'react';
import { TelemetryCardPaintContext, useViewportPaintGate } from './TelemetryCardVisibility';
import { ModalPortal } from '../../../components/common/ModalPortal';
import { useModalFocus } from '../../../hooks/useModalFocus';

export type TelemetryCardId = 'driver' | 'traces' | 'dynamics' | 'tires' | 'suspension';

interface TelemetryCardShellProps {
  id: TelemetryCardId;
  title: string;
  expanded: boolean;
  gridColumn: string;
  renderSwitch?: ReactNode;
  children: ReactNode;
  detail?: ReactNode;
  expandable?: boolean;
  onExpand?: () => void;
  onClose: () => void;
  expandLabel?: string;
  closeLabel: string;
}

const TelemetryCardShell: React.FC<TelemetryCardShellProps> = ({
  id,
  title,
  expanded,
  gridColumn,
  renderSwitch,
  children,
  detail,
  expandable = true,
  onExpand,
  onClose,
  expandLabel,
  closeLabel,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const paint = useViewportPaintGate(sectionRef, expanded);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);
  const dialogRef = useModalFocus<HTMLElement>(expanded, onClose);

  const setSectionRef = useCallback((element: HTMLElement | null) => {
    sectionRef.current = element;
    dialogRef.current = expanded ? element : null;
  }, [dialogRef, expanded]);

  useEffect(() => {
    if (expandable && wasExpandedRef.current && !expanded) expandButtonRef.current?.focus();
    wasExpandedRef.current = expanded;
  }, [expandable, expanded]);

  const content = (
    <section
      ref={setSectionRef}
      tabIndex={expanded ? -1 : undefined}
      className={`telemetry-card-shell d-flex flex-column ${expanded ? 'telemetry-card-shell--expanded' : 'h-100 p-2 overflow-hidden'}`}
      style={expanded ? undefined : { gridColumn }}
      aria-labelledby={`${id}-card-title`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
    >
      <div className="telemetry-card-shell__header workspace-panel-header d-flex justify-content-between align-items-center gap-2 border-bottom pb-1 mb-2 flex-shrink-0">
        <h3 id={`${id}-card-title`} className="fs-6 text-primary fw-bold m-0 text-truncate">{title}</h3>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {renderSwitch}
          {expanded ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} aria-label={closeLabel}>
              {closeLabel}
            </button>
          ) : expandable && onExpand ? (
            <button
              ref={expandButtonRef}
              type="button"
              className="btn btn-outline-primary btn-sm telemetry-card-shell__expand"
              onClick={onExpand}
              aria-expanded={false}
              aria-controls={`${id}-card-detail`}
              aria-label={expandLabel}
              title={expandLabel}
            >
              <span aria-hidden="true">↗</span>
              <span className="visually-hidden">{expandLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
      <div id={`${id}-card-detail`} className="telemetry-card-shell__body">
        <TelemetryCardPaintContext.Provider value={paint}>
          {expanded ? detail : children}
        </TelemetryCardPaintContext.Provider>
      </div>
    </section>
  );
  return expanded ? <>
    <div style={{ gridColumn }} aria-hidden="true" />
    <ModalPortal>
      <div className="telemetry-detail-backdrop" onClick={onClose} aria-hidden="true" />
      {content}
    </ModalPortal>
  </> : content;
};

export default React.memo(TelemetryCardShell);
