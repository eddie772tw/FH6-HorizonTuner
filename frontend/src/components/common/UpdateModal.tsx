import React, { useState } from 'react';
import { UpdateInfo, downloadAndApplyUpdate, restartApplication } from '../../services/updaterService';
import { useSettings } from '../../context/SettingsContext';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, isOpen, onClose }) => {
  const { t } = useSettings();
  const [status, setStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [downloadStats, setDownloadStats] = useState<{ downloaded: number; total: number }>({ downloaded: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !updateInfo) return null;

  const handleStartUpdate = async () => {
    if (!updateInfo.rawUpdate) {
      setErrorMessage(t('Update payload is missing or invalid.'));
      setStatus('error');
      return;
    }

    try {
      setStatus('downloading');
      setProgress(0);
      setErrorMessage(null);

      await downloadAndApplyUpdate(updateInfo.rawUpdate, (downloaded, total, percentage) => {
        setProgress(percentage);
        setDownloadStats({ downloaded, total });
      });

      setStatus('downloaded');
      // Briefly show completed state before relaunching
      setTimeout(async () => {
        try {
          await restartApplication();
        } catch (err: any) {
          setErrorMessage(err?.message || t('Failed to restart application automatically. Please restart manually.'));
          setStatus('error');
        }
      }, 1000);
    } catch (err: any) {
      console.error('[UpdateModal] Download failed:', err);
      setErrorMessage(err?.message || t('Download or installation failed. Please check network connection.'));
      setStatus('error');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div 
      className="modal show d-block" 
      tabIndex={-1} 
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)', zIndex: 1060 }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '520px' }}>
        <div className="modal-content glass-panel border border-primary border-opacity-25 shadow-lg">
          
          {/* Header */}
          <div className="modal-header border-bottom border-secondary border-opacity-25 pb-3">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary text-white px-2 py-1 fs-7 fw-bold">OTA</span>
              <h5 className="modal-title fw-bold text-primary mb-0 fs-5">
                {t('Software Update Available')}
              </h5>
            </div>
            {status !== 'downloading' && status !== 'downloaded' && (
              <button 
                type="button" 
                className="btn-close" 
                aria-label="Close" 
                onClick={onClose}
              />
            )}
          </div>

          {/* Body */}
          <div className="modal-body py-3 d-flex flex-column gap-3">
            
            {/* Version Transition Box */}
            <div className="d-flex justify-content-between align-items-center bg-dark bg-opacity-50 p-3 rounded border border-secondary border-opacity-25">
              <div>
                <div className="text-body-secondary fs-7">{t('Current Version')}</div>
                <div className="fw-bold fs-6 text-light">{updateInfo.currentVersion || 'v1.4.x'}</div>
              </div>
              <div className="text-primary fw-bold fs-4">→</div>
              <div className="text-end">
                <div className="text-body-secondary fs-7">{t('New Version')}</div>
                <div className="fw-bold fs-6 text-success">{updateInfo.version}</div>
              </div>
            </div>

            {/* Release Date */}
            {updateInfo.date && (
              <div className="fs-7 text-body-secondary">
                {t('Release Date')}: <span className="text-light">{updateInfo.date}</span>
              </div>
            )}

            {/* Release Notes */}
            {updateInfo.body && (
              <div>
                <label className="form-label fs-7 fw-bold text-primary mb-1">{t('Release Notes')}</label>
                <div 
                  className="bg-dark bg-opacity-75 p-3 rounded border border-secondary border-opacity-25 fs-7 text-light overflow-y-auto"
                  style={{ maxHeight: '140px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                >
                  {updateInfo.body}
                </div>
              </div>
            )}

            {/* Progress Bar (Visible during downloading / downloaded) */}
            {(status === 'downloading' || status === 'downloaded') && (
              <div className="d-flex flex-column gap-1 pt-2">
                <div className="d-flex justify-content-between fs-7 text-body-secondary">
                  <span>
                    {status === 'downloading' ? t('Downloading update payload...') : t('Installing and preparing relaunch...')}
                  </span>
                  <span>{progress}% ({formatBytes(downloadStats.downloaded)} / {formatBytes(downloadStats.total)})</span>
                </div>
                <div className="progress" style={{ height: '8px' }}>
                  <div 
                    className={`progress-bar progress-bar-striped ${status === 'downloading' ? 'progress-bar-animated bg-primary' : 'bg-success'}`}
                    role="progressbar" 
                    style={{ width: `${progress}%` }} 
                    aria-valuenow={progress} 
                    aria-valuemin={0} 
                    aria-valuemax={100}
                  />
                </div>
              </div>
            )}

            {/* Error Display */}
            {status === 'error' && errorMessage && (
              <div className="alert alert-danger mb-0 py-2 px-3 fs-7" role="alert">
                {errorMessage}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="modal-footer border-top border-secondary border-opacity-25 pt-3">
            {status === 'idle' && (
              <>
                <button 
                  type="button" 
                  className="btn btn-secondary px-3" 
                  onClick={onClose}
                >
                  {t('Remind Me Later')}
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary px-4 fw-bold" 
                  onClick={handleStartUpdate}
                >
                  {t('Update & Restart')}
                </button>
              </>
            )}

            {status === 'downloading' && (
              <button type="button" className="btn btn-primary px-4 fw-bold" disabled>
                {t('Downloading...')}
              </button>
            )}

            {status === 'downloaded' && (
              <button type="button" className="btn btn-success px-4 fw-bold" disabled>
                {t('Relaunching...')}
              </button>
            )}

            {status === 'error' && (
              <>
                <button 
                  type="button" 
                  className="btn btn-secondary px-3" 
                  onClick={onClose}
                >
                  {t('Close')}
                </button>
                <button 
                  type="button" 
                  className="btn btn-outline-danger px-4 fw-bold" 
                  onClick={handleStartUpdate}
                >
                  {t('Retry Update')}
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
