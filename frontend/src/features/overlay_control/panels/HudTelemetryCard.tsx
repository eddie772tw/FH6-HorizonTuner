import type { ReactNode } from 'react';
import { HudSettingsSection } from './HudSettingsControls';

export function HudTelemetryCard({ title, switches, children, settingsLabel }: {
  title: string; switches: ReactNode; children: ReactNode; settingsLabel: string;
}) {
  return <HudSettingsSection title={title}>
    <div className="d-flex flex-column gap-2">{switches}</div>
    <details className="hud-element-settings border-top pt-2">
      <summary className="fs-7 fw-semibold">{settingsLabel}</summary>
      <div className="d-flex flex-column gap-3 pt-3">{children}</div>
    </details>
  </HudSettingsSection>;
}
