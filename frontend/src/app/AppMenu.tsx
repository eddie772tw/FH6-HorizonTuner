import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { AppSurface } from './workspaceManifest';
import { AppCompanionIndicator } from './AppCompanionIndicator';

const surfaces: readonly { id: AppSurface; label: string }[] = [
  { id: 'settings', label: 'Settings' }, { id: 'appearance', label: 'Appearance' },
];

export function AppMenu({ onOpen }: { onOpen: (surface: AppSurface) => void }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openSurface = (surface: AppSurface) => {
    setOpen(false);
    triggerRef.current?.focus();
    onOpen(surface);
  };
  const getItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
  useEffect(() => {
    if (!open) return;
    const items = getItems();
    if (items.length > 0 && !menuRef.current?.contains(document.activeElement)) items[0].focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const items = getItems();
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setTimeout(() => { const l = getItems(); l[l.length - 1]?.focus(); }, 0); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(currentIndex + 1) % items.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(currentIndex - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus(); }
  };
  return <div className="position-relative d-flex align-items-center" ref={menuRef} onKeyDown={handleKeyDown}>
    <button ref={triggerRef} type="button" className="btn btn-outline-secondary btn-sm" aria-haspopup="menu"
      aria-expanded={open} aria-controls="app-menu-items" onClick={() => setOpen(value => !value)}>{t('App Menu')}</button>
    {open && <div id="app-menu-items" role="menu" className="dropdown-menu show top-100 end-0 mt-2 shadow glass-panel" aria-label={t('App Menu')}>
      {surfaces.map(surface => <button key={surface.id} type="button" role="menuitem" className="dropdown-item"
        onClick={() => openSurface(surface.id)}>{t(surface.label)}</button>)}
      <hr className="dropdown-divider" role="separator" />
      <AppCompanionIndicator onOpen={() => openSurface('companion')} />
      <button type="button" role="menuitem" className="dropdown-item" onClick={() => openSurface('mcp')}>{t('MCP')}</button>
      <hr className="dropdown-divider" role="separator" />
      <button type="button" role="menuitem" className="dropdown-item" onClick={() => openSurface('diagnostics')}>{t('Diagnostics')}</button>
      <button type="button" role="menuitem" className="dropdown-item" onClick={() => openSurface('about')}>{t('About')}</button>
    </div>}
  </div>;
}
