import { test, expect } from '@playwright/test';
for (const width of [320, 360, 800]) {
  test(`el aviso de límite cabe y se lee en ancho ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const { toast } = await import('/modules/ui-utils.js');
      toast('Demasiadas solicitudes. Por favor, esperá unos minutos antes de intentar nuevamente.', 'warning');
    });
    const el = page.locator('#toast');
    await expect(el).toBeVisible();
    await page.waitForTimeout(350);
    const info = await el.evaluate(e => {
      const r = e.getBoundingClientRect();
      return { left:r.left, right:r.right, scrollWidth:e.scrollWidth, clientWidth:e.clientWidth, whitespace:getComputedStyle(e).whiteSpace };
    });
    expect(info.left).toBeGreaterThanOrEqual(-1);
    expect(info.right).toBeLessThanOrEqual(width + 1);
    expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth + 1);
    expect(info.whitespace).toBe('normal');
  });
}
