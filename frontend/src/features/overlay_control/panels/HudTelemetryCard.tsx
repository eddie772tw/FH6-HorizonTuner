import { useId, type ReactNode } from 'react';

export function HudTelemetryCard({ title, switches, children, settingsLabel }: {
  title: string; switches: ReactNode; children: ReactNode; settingsLabel: string;
}) {
  const id = useId();
  return <section className="card hud-settings-section" aria-labelledby={id}>
    <div className="card-header workspace-panel-header"><h3 id={id} className="fs-6 fw-bold m-0">{title}</h3></div>
    <div className="card-body d-flex flex-column gap-3">
      <div className="d-flex flex-column gap-2">{switches}</div>
      <details className="hud-element-settings border-top pt-2">
        <summary className="fs-7 fw-semibold">{settingsLabel}</summary>
        <div className="d-flex flex-column gap-3 pt-3">{children}</div>
      </details>
    </div>
  </section>;
}
