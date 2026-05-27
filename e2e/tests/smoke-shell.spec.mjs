/**
 * Smoke E2E: shell del panel carga sin errores críticos de red en assets core.
 * No requiere login (sin Neon/API en CI).
 * made by leavera77
 */
import { test, expect } from '@playwright/test';

test.describe('GestorNova shell (assets estáticos)', () => {
    test('pantalla de login y estructura de detalle presentes', async ({ page }) => {
        const critical404 = [];
        page.on('response', (res) => {
            const u = res.url();
            if (res.status() === 404 && /\.(js|css|html)(\?|$)/i.test(u)) {
                critical404.push(u);
            }
        });

        await page.goto('/index.html');
        await expect(page.locator('.screen.active').first()).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('#lf')).toBeAttached();
        await expect(page.locator('#em')).toBeAttached();
        await expect(page.locator('#pw')).toBeAttached();
        await expect(page.locator('#dm')).toBeAttached();
        await expect(page.locator('#ms')).toBeAttached();

        await expect(page).toHaveTitle(/GestorNova/i);
        expect(critical404, `404 en assets: ${critical404.join(', ')}`).toEqual([]);
    });

    test('status.html responde', async ({ page }) => {
        const res = await page.goto('/status.html');
        expect(res?.ok()).toBeTruthy();
        await expect(page.getByRole('heading', { name: /Estado del servicio/i })).toBeVisible();
    });

    test('seguridad.html responde', async ({ page }) => {
        const res = await page.goto('/seguridad.html');
        expect(res?.ok()).toBeTruthy();
        await expect(page.getByRole('heading', { name: /Seguridad y datos/i })).toBeVisible();
    });
});
