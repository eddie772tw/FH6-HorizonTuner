/** Moving between settings tabs preserves drafts instead of committing on blur. */
export function isHudSettingsTab(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches('.hud-workspace [role="tab"]');
}
