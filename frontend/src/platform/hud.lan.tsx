import type { ReactNode } from 'react';

// This entry deliberately has no import path into HUD assets or services.
export const hudWorkspaces = {};
export function HudProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export function HudRuntime() { return null; }
