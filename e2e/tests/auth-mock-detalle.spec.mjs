/**
 * E2E: sesión mock + módulos de búsqueda/detalle sin API real.
 * made by leavera77
 */
import { test, expect } from '@playwright/test';

test.describe('Sesión mock y UI de búsqueda', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'pmg',
                JSON.stringify({
                    id: 1,
                    nombre: 'Admin E2E',
                    rol: 'admin',
                    email: 'e2e@test.local',
                })
            );
            window.getApiToken = () => 'e2e-mock-token';
            window.apiUrl = (p) => p;
            window.app = { p: [{ id: 42, np: 'PM-2026-0042', es: 'Pendiente', cl: 'Cliente E2E' }] };
            window.detalle = async () => {};
            window.toast = () => {};
        });
    });

    test('modal buscar pedido se abre con Ctrl+K', async ({ page }) => {
        await page.goto('/index.html');
        await page.evaluate(() => {
            document.getElementById('ls')?.classList.remove('active');
            document.getElementById('ms')?.classList.add('active');
        });
        await page.keyboard.press('Control+k');
        await expect(page.locator('#gn-global-search-modal.active')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('#gn-global-search-input')).toBeFocused();
    });

    test('estructura admin estadísticas presente', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('#admin-estadisticas, #admin-estadisticas')).toBeAttached();
        await expect(page.locator('#chart-tipos')).toBeAttached();
    });
});
