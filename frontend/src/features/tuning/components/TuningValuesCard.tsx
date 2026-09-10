import { Fragment } from 'react';
import { useSettings } from '../../../context/SettingsContext';

/** Static recommendations: rendering and unit formatting do not feed solver state. */
export function TuningValuesCard({ title, rows }: { title: string; rows: [string, string | number][] }) {
  const { t } = useSettings();
  return <section className="border rounded p-3 bg-body-tertiary h-100">
    <h4 className="h6 text-primary border-bottom pb-2">{t(title)}</h4>
    <dl className="row mb-0">
      {rows.map(([label, value]) => <Fragment key={label}>
        <dt className="col-8 fw-normal">{t(label)}</dt><dd className="col-4 text-end">{value}</dd>
      </Fragment>)}
    </dl>
  </section>;
}
