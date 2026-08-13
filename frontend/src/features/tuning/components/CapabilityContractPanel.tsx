import React from 'react';
import { TuningCapabilityContract } from '../../../domain/tuning/contracts';

interface CapabilityContractPanelProps {
  contract: TuningCapabilityContract;
  t: (text: string) => string;
}

const displayBoundary = (value: number | 'unknown'): string => typeof value === 'number' ? String(value) : value;
const displayStep = (value: number | 'snap' | 'unknown'): string => typeof value === 'number' ? String(value) : value;

const CapabilityContractPanel: React.FC<CapabilityContractPanelProps> = ({ contract, t }) => (
  <section className="card">
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2 flex-wrap gap-2">
        <div>
          <h5 className="text-primary fs-6 fw-bold mb-1">{t('FH6 Capability Contract')}</h5>
          <div className="text-body-secondary fs-7">{contract.schemaVersion} · build: {contract.gameBuild}</div>
        </div>
        <span className="badge bg-secondary-subtle text-secondary-emphasis">{t('Source')}: {contract.source}</span>
      </div>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>{t('Control')}</th>
              <th>{t('Status')}</th>
              <th>{t('Min / Max')}</th>
              <th>{t('Step')}</th>
              <th>{t('Source')}</th>
            </tr>
          </thead>
          <tbody>
            {contract.controls.map((control) => (
              <tr key={`${control.section}.${control.field}`}>
                <td>{control.section}.{control.field}</td>
                <td>
                  <span className={control.unlocked ? 'badge bg-success-subtle text-success-emphasis' : 'badge bg-secondary-subtle text-secondary-emphasis'}>
                    {control.unlocked ? t('Unlocked') : t('Locked')}
                  </span>
                </td>
                <td>{displayBoundary(control.min)} / {displayBoundary(control.max)} {control.unit}</td>
                <td>{displayStep(control.step)}</td>
                <td>{control.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-text fs-7 mt-2">
        {t('Unknown ranges and steps require an in-game capture or reviewed community fixture before they can constrain a solver.')}
      </div>
    </div>
  </section>
);

export default CapabilityContractPanel;
