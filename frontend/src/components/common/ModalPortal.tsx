import React from 'react';
import { createPortal } from 'react-dom';

export interface ModalPortalProps {
  children: React.ReactNode;
  /** Optional custom container to mount into. Defaults to document.body */
  container?: Element | DocumentFragment | null;
}

/**
 * ModalPortal mounts its children directly into document.body (or a custom container)
 * using React Portals.
 *
 * This completely isolates floating overlays (Modals, Offcanvas, Fullscreen Backdrops)
 * from parent CSS containing blocks created by `backdrop-filter`, `transform`,
 * `filter`, or `overflow: hidden`.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children, container }) => {
  if (typeof document === 'undefined') {
    return null;
  }

  const target = container ?? document.body;
  if (!target) {
    return null;
  }

  return createPortal(children, target);
};

export default ModalPortal;
