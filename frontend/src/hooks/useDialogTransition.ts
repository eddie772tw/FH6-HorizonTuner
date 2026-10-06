import { useEffect, useRef, useState, type TransitionEvent } from 'react';
import { useModalFocus } from './useModalFocus';

/** Shared by mounted drawers and dialogs: release focus/background only after exit. */
export function useDialogTransition(open: boolean, onClose: () => void) {
  const [shown, setShown] = useState(false);
  const [exiting, setExiting] = useState(false);
  const closing = useRef(false);
  const closed = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finish = () => {
    if (closed.current) return;
    closed.current = true;
    onCloseRef.current();
  };
  useEffect(() => {
    setShown(false);
    setExiting(false);
    closing.current = false;
    closed.current = false;
    if (!open) return;
    // Native inert blurs the trigger; capture it before isolating the background.
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.getElementById('root');
    const wasInert = background?.inert ?? false;
    if (background) background.inert = true;
    const frame = requestAnimationFrame(() => {
      if (!closing.current && !closed.current) setShown(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Restore before useModalFocus returns focus to the trigger.
      if (background) background.inert = wasInert;
    };
  }, [open]);
  const close = () => {
    if (!open || closing.current || closed.current) return;
    closing.current = true;
    setExiting(true);
    setShown(false);
  };
  const panelRef = useModalFocus<HTMLDivElement>(open && (shown || exiting), close, trigger.current);
  useEffect(() => {
    if (!open || !exiting) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const style = getComputedStyle(panelRef.current!);
    const milliseconds = (value: string) => (parseFloat(value) || 0) * (value.trim().endsWith('ms') ? 1 : 1000);
    const durations = style.transitionDuration.split(',').map(milliseconds);
    const delays = style.transitionDelay.split(',').map(milliseconds);
    const properties = style.transitionProperty.split(',');
    const duration = Math.max(0, ...properties.map((property, i) => property.trim() === 'none' ? 0
      : durations[i % durations.length] + delays[i % delays.length]));
    // Custom CSS/theme changes can cancel transitionend, including during exit.
    if (motion.matches || duration === 0) { finish(); return; }
    const timer = window.setTimeout(finish, duration + 34);
    const reduce = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', reduce);
    return () => { clearTimeout(timer); motion.removeEventListener('change', reduce); };
  }, [open, exiting]);
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'transform' && closing.current) finish();
  };
  return { shown, close, panelRef, onTransitionEnd };
}
