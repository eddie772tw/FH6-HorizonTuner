import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";

export interface RouteActionBarProps {
  readonly id: string; readonly selectedRouteId: string | null; readonly routeName?: string;
  readonly isCurrentArmed: boolean; readonly isRecording: boolean;
  readonly selectRef: React.RefObject<HTMLSelectElement | null>;
  readonly onSave: () => void | Promise<void>; readonly onDeleteRoute: (routeId: string) => Promise<boolean>;
  readonly onArmRoute: (routeId: string) => Promise<boolean>; readonly onDisarmRoute: () => Promise<boolean>;
  readonly t: (text: string, params?: Record<string, string | number>) => string;
}

export const RouteActionBar: React.FC<RouteActionBarProps> = ({
  id, selectedRouteId, routeName, isCurrentArmed, isRecording, selectRef,
  onSave, onDeleteRoute, onArmRoute, onDisarmRoute, t,
}) => {
  const { addToast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRouteId = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const hadConfirmation = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (deletingRouteId.current && selectedRouteId && selectedRouteId !== deletingRouteId.current) hadConfirmation.current = false;
    setConfirmDelete(false);
  }, [selectedRouteId]);
  useEffect(() => {
    if (isDeleting) return;
    const active = document.activeElement;
    if (active === document.body || Boolean(barRef.current?.contains(active))) {
      if (confirmDelete) cancelBtnRef.current?.focus();
      else if (hadConfirmation.current && active !== selectRef.current) (deleteBtnRef.current ?? selectRef.current)?.focus();
    }
    hadConfirmation.current = confirmDelete;
  }, [confirmDelete, isDeleting, selectedRouteId, selectRef]);

  const handleConfirmDelete = async () => {
    const routeId = selectedRouteId;
    if (!routeId || deletingRouteId.current) return;
    deletingRouteId.current = routeId; setIsDeleting(true);
    try {
      const ok = await Promise.resolve().then(() => onDeleteRoute(routeId)).catch(() => false);
      if (!mountedRef.current) return;
      setConfirmDelete(false);
      addToast({ message: t(ok ? "Route deleted." : "Failed to delete route."), type: ok ? "success" : "danger" });
    } finally { deletingRouteId.current = null; if (mountedRef.current) setIsDeleting(false); }
  };

  const confirmId = `${id}-delete-confirm`, confirmLabelId = `${confirmId}-label`, trimmedName = routeName?.trim();
  const prompt = trimmedName ? t('Are you sure you want to delete route "{name}"?', { name: trimmedName }) : t("Are you sure you want to delete this route?");
  return <div ref={barRef}>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-1">
      <div className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={onSave}>{t("Save Route")}</button>
        {selectedRouteId && <button ref={deleteBtnRef} type="button" className="btn btn-sm btn-outline-danger" disabled={confirmDelete || isDeleting} aria-expanded={confirmDelete} aria-controls={confirmDelete ? confirmId : undefined} aria-label={trimmedName ? t("Delete {name}", { name: trimmedName }) : t("Delete")} onClick={() => setConfirmDelete(true)}>{t("Delete")}</button>}
      </div>
      {selectedRouteId && (isCurrentArmed
        ? <button type="button" className="btn btn-sm btn-warning text-dark" disabled={isRecording || isDeleting} onClick={onDisarmRoute}>{t("Disarm Route")}</button>
        : <button type="button" className="btn btn-sm btn-success" disabled={isRecording || isDeleting} onClick={() => onArmRoute(selectedRouteId)}>{t("Arm Route for Timing")}</button>)}
    </div>
    {selectedRouteId && confirmDelete && <div id={confirmId} className="border-top mt-2 pt-2 d-flex flex-wrap align-items-center justify-content-between gap-2" role="group" aria-labelledby={confirmLabelId} onKeyDownCapture={(event) => { if (event.key !== "Escape") return; event.preventDefault(); event.stopPropagation(); if (!deletingRouteId.current) setConfirmDelete(false); }}>
      <p id={confirmLabelId} className="fs-7 fw-semibold mb-0" style={{ color: "var(--bs-danger-text-emphasis)", overflowWrap: "anywhere" }}>{prompt}</p>
      <div className="d-flex flex-wrap gap-2">
        <button ref={cancelBtnRef} type="button" className="btn btn-outline-secondary btn-sm" disabled={isDeleting} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>
        <button type="button" className="btn btn-danger btn-sm fw-bold" disabled={isDeleting} aria-busy={isDeleting} onClick={() => void handleConfirmDelete()}>{isDeleting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}{t("Delete")}</button>
      </div>
    </div>}
  </div>;
};
