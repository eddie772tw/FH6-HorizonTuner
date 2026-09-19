import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { AppSurface } from './workspaceManifest';

const surfaces: readonly { id: AppSurface; label: string }[] = [
  { id: 'settings', label: 'Settings' }, { id: 'appearance', label: 'Appearance' },
  { id: 'diagnostics', label: 'Diagnostics' }, { id: 'updates', label: 'Updates' },
  { id: 'about', label: 'About' },
];

export function AppMenu({ onOpen }: { onOpen: (surface: AppSurface) => void }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  return <div className="position-relative" ref={menuRef} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
  }}>
    <button ref={triggerRef} type="button" className="btn btn-outline-secondary btn-sm" aria-expanded={open}
      aria-controls="app-menu-items" onClick={() => setOpen(value => !value)}>{t('App Menu')}</button>
    {open && <div id="app-menu-items" className="dropdown-menu show end-0 shadow glass-panel" aria-label={t('App Menu')}>
      {surfaces.map(surface => <button key={surface.id} type="button" className="dropdown-item"
        onClick={() => { setOpen(false); triggerRef.current?.focus(); onOpen(surface.id); }}>{t(surface.label)}</button>)}
    </div>}
  </div>;
}
