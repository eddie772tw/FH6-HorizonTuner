import React, { useEffect, useMemo, useRef, useState } from 'react';
import { telemetryEmitter, TelemetryData } from '../../../hooks/useTelemetry';
import {
  captureToCsv,
  summarizeCapture,
  telemetryToCaptureSample,
  TuningCaptureFile,
  TuningCaptureMetadata,
  TuningCaptureSample
} from '../../../domain/tuning/telemetryCapture';

interface TuningTelemetryCaptureViewProps {
  carId: string;
  t: (text: string) => string;
  onBack: () => void;
}

const MAX_SAMPLES = 30000;

const defaultMetadata = (carId: string): TuningCaptureMetadata => ({
  label: `tuning-capture-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  purpose: 'tire-and-chassis-validation',
  carId,
  gameBuild: 'unknown',
  installedParts: '',
  tireType: 'unknown',
  surface: 'tarmac',
  weather: 'dry',
  eventType: 'free-roam',
  track: 'unknown',
  shareCode: 'unknown',
  driverAssists: 'unknown',
  notes: ''
});

const download = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const updateMetadata = (metadata: TuningCaptureMetadata, key: keyof TuningCaptureMetadata, value: string): TuningCaptureMetadata => ({ ...metadata, [key]: value });

const SummaryRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="d-flex justify-content-between border-bottom py-1 gap-2"><span className="text-body-secondary fs-7">{label}</span><span className="fw-bold text-end fs-7">{value}</span></div>
);

const TuningTelemetryCaptureView: React.FC<TuningTelemetryCaptureViewProps> = ({ carId, t, onBack }) => {
  const [metadata, setMetadata] = useState<TuningCaptureMetadata>(() => defaultMetadata(carId));
  const [isCapturing, setIsCapturing] = useState(false);
  const [capture, setCapture] = useState<TuningCaptureFile | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const samplesRef = useRef<TuningCaptureSample[]>([]);
  const lastUiUpdateRef = useRef(0);

  useEffect(() => {
    const handleTelemetry = (event: Event) => {
      if (!isCapturing) return;
      const data = (event as CustomEvent<TelemetryData>).detail;
      if (!data || samplesRef.current.length >= MAX_SAMPLES) return;
      samplesRef.current.push(telemetryToCaptureSample(data));
      const now = performance.now();
      if (now - lastUiUpdateRef.current > 250) {
        lastUiUpdateRef.current = now;
        setLiveCount(samplesRef.current.length);
      }
    };
    telemetryEmitter.addEventListener('update', handleTelemetry);
    return () => telemetryEmitter.removeEventListener('update', handleTelemetry);
  }, [isCapturing]);

  const summary = useMemo(() => summarizeCapture(capture?.samples ?? samplesRef.current), [capture, liveCount]);

  const startCapture = () => {
    samplesRef.current = [];
    setCapture(null);
    setLiveCount(0);
    setIsCapturing(true);
  };

  const stopCapture = () => {
    setIsCapturing(false);
    const nextCapture: TuningCaptureFile = {
      schemaVersion: 'tuning-capture/v1',
      capturedAt: new Date().toISOString(),
      metadata,
      samples: [...samplesRef.current]
    };
    setCapture(nextCapture);
    setLiveCount(nextCapture.samples.length);
  };

  const clearCapture = () => {
    setIsCapturing(false);
    samplesRef.current = [];
    setCapture(null);
    setLiveCount(0);
  };

  const filenameBase = metadata.label.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'tuning-capture';
  const activeCapture = capture ?? (samplesRef.current.length > 0 ? { schemaVersion: 'tuning-capture/v1' as const, capturedAt: new Date().toISOString(), metadata, samples: samplesRef.current } : null);

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
              <input id="capture-label" className="form-control form-control-sm" value={metadata.label} onChange={(event) => setMetadata(updateMetadata(metadata, 'label', event.target.value))} />
              <div className="row g-2">
                {(['purpose', 'gameBuild', 'installedParts', 'tireType', 'surface', 'weather', 'eventType', 'track', 'shareCode', 'driverAssists'] as const).map((key) => (
                  <div className="col-12 col-md-6" key={key}>
                    <label className="form-label fs-7" htmlFor={`capture-${key}`}>{t(key)}</label>
                    <input id={`capture-${key}`} className="form-control form-control-sm" value={metadata[key]} onChange={(event) => setMetadata(updateMetadata(metadata, key, event.target.value))} />
                  </div>
                ))}
              </div>
              <label className="form-label fs-7" htmlFor="capture-notes">{t('Notes')}</label>
              <textarea id="capture-notes" className="form-control form-control-sm" rows={3} value={metadata.notes} onChange={(event) => setMetadata(updateMetadata(metadata, 'notes', event.target.value))} />
              <div className="d-flex gap-2 flex-wrap mt-2">
                {!isCapturing ? <button className="btn btn-primary btn-sm" onClick={startCapture}>{t('Start Capture')}</button> : <button className="btn btn-danger btn-sm" onClick={stopCapture}>{t('Stop Capture')}</button>}
                <span title={isCapturing ? t("Cannot clear while capturing") : undefined} style={isCapturing ? { cursor: 'not-allowed', display: 'inline-block' } : {}}>
                  <button className="btn btn-outline-secondary btn-sm" onClick={clearCapture} disabled={isCapturing} style={{ pointerEvents: isCapturing ? 'none' : 'auto' }}>{t('Clear')}</button>
                </span>
                <span className="badge bg-secondary-subtle text-secondary-emphasis align-self-center">{isCapturing ? t('Capturing') : t('Idle')} · {liveCount} {t('samples')}</span>
              </div>
              <div className="form-text fs-7">{t('Maximum capture size is 30,000 frames. Telemetry is collected only while this page is capturing.')}</div>
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
              <SummaryRow label={t('Peak Slip Angle FL/FR/RL/RR')} value={summary.peakSlipAngleDeg.join(' / ')} />
              <SummaryRow label={t('Maximum Tire Temp FL/FR/RL/RR')} value={summary.maxTireTemp.join(' / ')} />
              <SummaryRow label={t('Maximum Combined Slip FL/FR/RL/RR')} value={summary.maxCombinedSlip.join(' / ')} />
              <SummaryRow label={t('Non-monotonic timestamps')} value={summary.droppedTimestampCount} />
              <div className="d-flex gap-2 flex-wrap mt-3">
                <span title={(!activeCapture || activeCapture.samples.length === 0) ? t("No capture data available to download") : undefined} style={(!activeCapture || activeCapture.samples.length === 0) ? { cursor: 'not-allowed', display: 'inline-block' } : {}}>
                  <button className="btn btn-outline-primary btn-sm" disabled={!activeCapture || activeCapture.samples.length === 0} style={{ pointerEvents: (!activeCapture || activeCapture.samples.length === 0) ? 'none' : 'auto' }} onClick={() => activeCapture && download(JSON.stringify({ ...activeCapture, summary: summarizeCapture(activeCapture.samples) }, null, 2), `${filenameBase}.json`, 'application/json')}>{t('Download JSON')}</button>
                </span>
                <span title={(!activeCapture || activeCapture.samples.length === 0) ? t("No capture data available to download") : undefined} style={(!activeCapture || activeCapture.samples.length === 0) ? { cursor: 'not-allowed', display: 'inline-block' } : {}}>
                  <button className="btn btn-outline-primary btn-sm" disabled={!activeCapture || activeCapture.samples.length === 0} style={{ pointerEvents: (!activeCapture || activeCapture.samples.length === 0) ? 'none' : 'auto' }} onClick={() => activeCapture && download(captureToCsv(activeCapture), `${filenameBase}.csv`, 'text/csv')}>{t('Download CSV')}</button>
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
