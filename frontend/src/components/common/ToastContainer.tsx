import React from 'react';
import { useToast, ToastType } from '../../context/ToastContext';

const getTypeBadge = (type: ToastType = 'info') => {
  switch (type) {
    case 'warning':
      return <span className="badge text-bg-warning fw-bold me-2">WARNING</span>;
    case 'danger':
      return <span className="badge text-bg-danger fw-bold me-2">ALERT</span>;
    case 'success':
      return <span className="badge text-bg-success fw-bold me-2">SUCCESS</span>;
    case 'info':
    default:
      return <span className="badge text-bg-info fw-bold me-2">INFO</span>;
  }
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div 
      className="toast-container position-fixed top-0 end-0 p-3" 
      style={{ zIndex: 1060, maxWidth: '420px', width: '100%', pointerEvents: 'none' }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="toast show glass-panel mb-2 shadow-lg border"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{ 
            pointerEvents: 'auto',
            backdropFilter: 'blur(16px)',
            background: 'var(--glass-bg)',
            borderColor: toast.type === 'warning' 
              ? 'var(--bs-warning)' 
              : toast.type === 'danger' 
              ? 'var(--bs-danger)' 
              : 'var(--glass-border)',
            transition: 'all 0.25s ease-in-out'
          }}
        >
          <div className="toast-header bg-transparent border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between py-2 px-3">
            <div className="d-flex align-items-center">
              {getTypeBadge(toast.type)}
              <strong className="me-auto text-primary fs-7 fw-bold m-0">
                {toast.title || (toast.type ? toast.type.toUpperCase() : 'NOTIFICATION')}
              </strong>
            </div>
            <button
              type="button"
              className="btn-close ms-2"
              aria-label="Close"
              onClick={() => removeToast(toast.id)}
            ></button>
          </div>
          <div className="toast-body py-2 px-3 text-start">
            <div className="fs-7 fw-medium text-body">{toast.message}</div>
            {toast.detail && (
              <div className="fs-8 text-secondary mt-1">{toast.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
