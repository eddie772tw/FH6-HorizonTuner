import React, { type ReactNode } from 'react';

export type TelemetryCardLayoutVariant = 'stack' | 'split' | 'grid';

interface TelemetryCardLayoutProps {
  variant: TelemetryCardLayoutVariant;
  children: ReactNode;
  className?: string;
}

const TelemetryCardLayout: React.FC<TelemetryCardLayoutProps> = ({ variant, children, className = '' }) => (
  <div className={`telemetry-card-layout telemetry-card-layout--${variant} ${className}`.trim()}>
    {children}
  </div>
);

export default React.memo(TelemetryCardLayout);
