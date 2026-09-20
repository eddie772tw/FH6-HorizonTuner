import React, { useMemo } from 'react';
import { captureToCsv, summarizeCapture, type TuningCaptureMetadata } from '../../../domain/tuning/telemetryCapture';
import { useFileSave } from '../../../hooks/useFileSave';
import { useTuneSession } from '../TuneSessionProvider';

interface TuningTelemetryCaptureViewProps {
  t: (text: string) => string;
  onBack: () => void;
}

const updateMetadata = (metadata: TuningCaptureMetadata, key: keyof TuningCaptureMetadata, value: string): TuningCaptureMetadata => ({ ...metadata, [key]: value });

const SummaryRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="d-flex justify-content-between border-bottom py-1 gap-2"><span className="text-body-secondary fs-7">{label}</span><span className="fw-bold text-end fs-7">{value}</span></div>
);

const TuningTelemetryCaptureView: React.FC<TuningTelemetryCaptureViewProps> = ({ t, onBack }) => {
  const { capture } = useTuneSession();
  const { save, isSaving } = useFileSave();
  const metadata = capture.metadata;
  const isCapturing = capture.status === 'capturing';
  const activeCapture = capture.activeCapture;
  const summary = useMemo(() => summarizeCapture(activeCapture?.samples ?? []), [activeCapture, capture.revision]);
  const filenameBase = metadata.label.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'tuning-capture';

  const handleDownloadJson = () => {
    if (!activeCapture || activeCapture.samples.length === 0) return;
    void save({
      filename: `${filenameBase}.json`,
      mimeType: 'application/json',
      load: () => new Blob([JSON.stringify({ ...activeCapture, summary: summarizeCapture(activeCapture.samples) }, null, 2)], { type: 'application/json' }),
    });
  };

  const handleDownloadCsv = () => {
    if (!activeCapture || activeCapture.samples.length === 0) return;
    void save({
      filename: `${filenameBase}.csv`,
      mimeType: 'text/csv',
      load: () => new Blob([captureToCsv(activeCapture)], { type: 'text/csv' }),
    });
  };

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      <div className="d-flex justify-content-between align-items-center border-bottom pb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-primary fs-4 fw-bold mb-1">{t('Tuning Telemetry Capture')}</h2>
          <p className="text-body-secondary fs-7 mb-0">{t('Collect raw 60 Hz telemetry with test conditions for human review and solver calibration.')}</p>
        </div>
        <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>{t('Back to Developer Tuning')}</button>
      </div>

      <div className="alert alert-warning py-2 mb-0" role="alert">
        {t('This capture does not prove a game parameter. Record one controlled variable at a time, repeat each run, and keep the original file with its metadata.')}
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-5">
          <section className="card h-100">
            <div className="card-body d-flex flex-column gap-2">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2">{t('Capture Metadata')}</h5>
              <label className="form-label fs-7" htmlFor="capture-label">{t('File Label')}</label>
              <input id="capture-label" className="form-control form-control-sm" value={metadata.label} onChange={(event) => capture.setMetadata(updateMetadata(metadata, 'label', event.target.value))} />
              <div className="row g-2">
                {(['purpose', 'gameBuild', 'installedParts', 'tireType', 'surface', 'weather', 'eventType', 'track', 'shareCode', 'driverAssists'] as const).map((key) => (
                  <div className="col-12 col-md-6" key={key}>
                    <label className="form-label fs-7" htmlFor={`capture-${key}`}>{t(key)}</label>
                    <input id={`capture-${key}`} className="form-control form-control-sm" value={metadata[key]} onChange={(event) => capture.setMetadata(updateMetadata(metadata, key, event.target.value))} />
                  </div>
                ))}
              </div>
              <label className="form-label fs-7" htmlFor="capture-notes">{t('Notes')}</label>
              <textarea id="capture-notes" className="form-control form-control-sm" rows={3} value={metadata.notes} onChange={(event) => capture.setMetadata(updateMetadata(metadata, 'notes', event.target.value))} />
              <div className="d-flex gap-2 flex-wrap mt-2">
                {!isCapturing ? <button className="btn btn-primary btn-sm" onClick={capture.start}>{t('Start Capture')}</button> : <button className="btn btn-danger btn-sm" onClick={() => capture.stop()}>{t('Stop Capture')}</button>}
                <span
                  title={isCapturing ? t('Cannot clear while capturing') : undefined}
                  tabIndex={isCapturing ? 0 : undefined}
                  role={isCapturing ? 'group' : undefined}
                  aria-label={isCapturing ? t('Cannot clear while capturing') : undefined}
                  style={isCapturing ? { cursor: 'not-allowed', display: 'inline-block' } : {}}
                >
                  <button className="btn btn-outline-secondary btn-sm" onClick={capture.clear} disabled={isCapturing} style={{ pointerEvents: isCapturing ? 'none' : 'auto' }}>{t('Clear')}</button>
                </span>
                <span className="badge bg-secondary-subtle text-secondary-emphasis align-self-center">{isCapturing ? t('Capturing') : capture.status === 'invalidated' ? t('Invalidated') : t('Idle')} · {capture.sampleCount} {t('samples')}</span>
              </div>
              {capture.status === 'invalidated' && <div className="form-text fs-7" role="status">{t('Capture was invalidated because the vehicle identity changed. Start a new capture before using it.')}</div>}
              <div className="form-text fs-7">{t('Maximum capture size is 30,000 frames. Collection continues while this workspace is closed and stops only when you stop it or identity changes.')}</div>
            </div>
          </section>
        </div>
        <div className="col-12 col-xl-7">
          <section className="card h-100">
            <div className="card-body">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2">{t('Capture Analysis')}</h5>
              <SummaryRow label={t('Samples')} value={summary.sampleCount} />
              <SummaryRow label={t('Duration')} value={`${summary.durationSeconds} s`} />
              <SummaryRow label={t('Median Cadence')} value={`${summary.cadenceHz} Hz (${summary.medianDeltaMs} ms)`} />
              <SummaryRow label={t('Maximum Speed')} value={`${summary.maxSpeedKmh} km/h`} />
              <SummaryRow label={t('Maximum Longitudinal G')} value={summary.maxLongitudinalG} />
              <SummaryRow label={t('Maximum Lateral G')} value={summary.maxLateralG} />
              <SummaryRow label={t('Peak Slip Ratio FL/FR/RL/RR')} value={summary.peakSlipRatio.join(' / ')} />
              <SummaryRow label={t('Peak normalized lateral slip FL/FR/RL/RR')} value={summary.peakNormalizedSlipAngle.join(' / ')} />
              <SummaryRow label={t('Maximum Tire Temp FL/FR/RL/RR')} value={summary.maxTireTemp.join(' / ')} />
              <SummaryRow label={t('Maximum Combined Slip FL/FR/RL/RR')} value={summary.maxCombinedSlip.join(' / ')} />
              <SummaryRow label={t('Non-monotonic timestamps')} value={summary.droppedTimestampCount} />
              <div className="d-flex gap-2 flex-wrap mt-3">
                <span
                  title={(!activeCapture || activeCapture.samples.length === 0) ? t('No capture data available to download') : undefined}
                  tabIndex={(!activeCapture || activeCapture.samples.length === 0) ? 0 : undefined}
                  role={(!activeCapture || activeCapture.samples.length === 0) ? 'group' : undefined}
                  aria-label={(!activeCapture || activeCapture.samples.length === 0) ? t('No capture data available to download') : undefined}
                  style={(!activeCapture || activeCapture.samples.length === 0) ? { cursor: 'not-allowed', display: 'inline-block' } : {}}
                >
                  <button className="btn btn-outline-primary btn-sm" disabled={!activeCapture || activeCapture.samples.length === 0 || isSaving} style={{ pointerEvents: (!activeCapture || activeCapture.samples.length === 0) ? 'none' : 'auto' }} onClick={handleDownloadJson}>{t('Download JSON')}</button>
                </span>
                <span
                  title={(!activeCapture || activeCapture.samples.length === 0) ? t('No capture data available to download') : undefined}
                  tabIndex={(!activeCapture || activeCapture.samples.length === 0) ? 0 : undefined}
                  role={(!activeCapture || activeCapture.samples.length === 0) ? 'group' : undefined}
                  aria-label={(!activeCapture || activeCapture.samples.length === 0) ? t('No capture data available to download') : undefined}
                  style={(!activeCapture || activeCapture.samples.length === 0) ? { cursor: 'not-allowed', display: 'inline-block' } : {}}
                >
                  <button className="btn btn-outline-primary btn-sm" disabled={!activeCapture || activeCapture.samples.length === 0 || isSaving} style={{ pointerEvents: (!activeCapture || activeCapture.samples.length === 0) ? 'none' : 'auto' }} onClick={handleDownloadCsv}>{t('Download CSV')}</button>
                </span>
              </div>
              <div className="form-text fs-7 mt-2">{t('Use JSON as the canonical evidence file; CSV is for spreadsheet or MoTeC-style inspection.')}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TuningTelemetryCaptureView;
