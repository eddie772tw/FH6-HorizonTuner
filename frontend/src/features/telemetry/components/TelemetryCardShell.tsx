import React, { type ReactNode, useEffect, useRef } from 'react';

export type TelemetryCardId = 'driver' | 'traces' | 'dynamics' | 'tires' | 'suspension';

interface TelemetryCardShellProps {
  id: TelemetryCardId;
  title: string;
  expanded: boolean;
  gridColumn: string;
  renderSwitch?: ReactNode;
  children: ReactNode;
  detail: ReactNode;
  onExpand: () => void;
  onClose: () => void;
  expandLabel: string;
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
  onExpand,
  onClose,
  expandLabel,
  closeLabel,
}) => {
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);

  useEffect(() => {
    if (wasExpandedRef.current && !expanded) expandButtonRef.current?.focus();
    wasExpandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, onClose]);

  return (
    <section
      className={`telemetry-card-shell d-flex flex-column ${expanded ? 'telemetry-card-shell--expanded' : 'h-100 p-2 overflow-hidden'}`}
      style={expanded ? undefined : { gridColumn }}
      aria-labelledby={`${id}-card-title`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
    >
      <div className="telemetry-card-shell__header d-flex justify-content-between align-items-center gap-2 border-bottom pb-1 mb-2 flex-shrink-0">
        <h3 id={`${id}-card-title`} className="fs-6 text-primary fw-bold m-0 text-truncate">{title}</h3>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {renderSwitch}
          {expanded ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} aria-label={closeLabel}>
              {closeLabel}
            </button>
          ) : (
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
          )}
        </div>
      </div>
      <div id={`${id}-card-detail`} className="telemetry-card-shell__body flex-grow-1 min-height-0">
        {expanded ? detail : children}
      </div>
    </section>
  );
};

export default React.memo(TelemetryCardShell);
