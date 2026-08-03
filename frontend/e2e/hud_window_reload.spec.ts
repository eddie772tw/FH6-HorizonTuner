import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('HUD Window Reload feature', () => {
  test('should verify handleReloadHud logic works when clicking reload', async ({ page }) => {

    await page.addInitScript(() => {
        (window as any).__TAURI__ = {
            core: {
                invoke: async (cmd: string, args: any) => {
                    if (cmd === 'reload_hud_window') {
                        (window as any).__TAURI_RELOAD_CALLED__ = true;
                    }
                    if (cmd === 'get_available_monitors') return [];
                    return null;
                }
            }
        };
    });

    await page.goto('http://localhost:1420/');

    // Click the Overlay Tab/Menu
    await page.click('button:has-text("HUD Overlay")', { timeout: 10000 }).catch(() => {});

    // Evaluate click natively on the button
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const reloadBtn = buttons.find(b => b.textContent && b.textContent.includes('Reload HTML'));
        if (reloadBtn) reloadBtn.click();
    });

    // Wait for mock
    await page.waitForTimeout(500);

    const reloadCalled = await page.evaluate(() => {
        return (window as any).__TAURI_RELOAD_CALLED__;
    });

    // Check if it got called
    expect(reloadCalled).toBe(true);
  });
});
